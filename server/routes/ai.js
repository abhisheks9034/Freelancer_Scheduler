const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const pool = require('../config/db');
const { sendRequestNotification } = require('../utils/emailService');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const pendingCancellationByUser = new Map();

const toDbTime = (time) => {
    if (!time) return null;
    const trimmed = String(time).trim();
    return trimmed.split(':').length === 2 ? `${trimmed}:00` : trimmed;
};

const toHHMM = (time) => (time || '').substring(0, 5);

const dayNameFromDate = (bookingDate) => {
    const dateObj = new Date(bookingDate);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dateObj.getDay()];
};

const scheduleMeetingTool = {
    type: 'function',
    function: {
        name: 'schedule_meeting',
        description: 'Requests a new meeting slot with a specific professional freelancer. IMPORTANT: Only call this function when the user has EXPLICITLY confirmed they want to book AND has provided ALL details: freelancer name, date (YYYY-MM-DD), start time, and end time.',
        parameters: {
            type: 'object',
            properties: {
                freelancer_name: { type: 'string' },
                booking_date: { type: 'string' },
                start_time: { type: 'string' },
                end_time: { type: 'string' },
                service_name: { type: 'string' },
                force: { type: 'boolean', description: 'Set to true if user wants to replace a clashing booking.' }
            },
            required: ['freelancer_name', 'booking_date', 'start_time', 'end_time']
        }
    }
};

const cancelBookingTool = {
    type: 'function',
    function: {
        name: 'cancel_booking',
        description: 'Cancels an existing booking for the client.',
        parameters: {
            type: 'object',
            properties: {
                booking_id: { type: 'integer' },
                freelancer_name: { type: 'string' }
            }
        }
    }
};

const createAvailabilityBatchTool = {
    type: 'function',
    function: {
        name: 'create_availability_batch',
        description: 'Create multiple slots (Freelancer only).',
        parameters: {
            type: 'object',
            properties: {
                booking_date: { type: 'string' },
                start_time: { type: 'string' },
                end_time: { type: 'string' },
                session_duration: { type: 'integer' }
            },
            required: ['booking_date', 'start_time', 'end_time', 'session_duration']
        }
    }
};

const cancelAvailabilityBatchTool = {
    type: 'function',
    function: {
        name: 'cancel_availability_batch',
        description: 'Cancel multiple slots (Freelancer only).',
        parameters: {
            type: 'object',
            properties: {
                booking_date: { type: 'string' },
                start_time: { type: 'string' },
                end_time: { type: 'string' },
                confirm: { type: 'boolean' }
            },
            required: ['booking_date']
        }
    }
};

async function getNextAvailableSlots(freelancerId, bookingDate, requestedEndTime, limit = 5) {
    const [rows] = await pool.query(
        `SELECT booking_date, start_time, end_time FROM availability WHERE freelancer_id = ? AND is_booked = FALSE AND (status = 'available' OR status IS NULL) AND booking_date >= CURDATE() ORDER BY CASE WHEN booking_date = ? AND start_time >= ? THEN 0 WHEN booking_date = ? THEN 1 ELSE 2 END, booking_date, start_time`,
        [freelancerId, bookingDate, requestedEndTime, bookingDate]
    );
    const now = new Date();
    return rows.filter(r => {
        const d = new Date(r.booking_date);
        const slotStart = new Date(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${r.start_time}`);
        return slotStart > now;
    }).slice(0, limit);
}

router.post('/chat', auth, async (req, res) => {
    try {
        const { message, history } = req.body;
        const [userData] = await pool.query('SELECT name, email FROM users WHERE id = ?', [req.user.id]);
        if (userData.length === 0) return res.status(404).json({ error: "User not found" });
        const userName = userData[0].name || 'User';
        const userEmail = userData[0].email;
        if (!process.env.GROQ_API_KEY) return res.status(400).json({ reply: "Missing GROQ_API_KEY" });

        const isClient = req.user.role === 'client';
        const isFreelancer = req.user.role === 'freelancer';

        const [bookings] = isClient
            ? await pool.query('SELECT * FROM availability WHERE client_email = ?', [userEmail])
            : await pool.query('SELECT * FROM availability WHERE freelancer_id = ?', [req.user.id]);
        const [professionals] = await pool.query('SELECT name, title, hourly_rate FROM users WHERE role = "freelancer"');
        const [services] = await pool.query('SELECT s.*, u.name as freelancer_name FROM services s JOIN users u ON s.freelancer_id = u.id');

        const systemInstruction = isClient ? `
You are the "FreelanceOS Assistant".
User: ${userName} (${userEmail}).
Today: ${new Date().toLocaleDateString('en-CA')}
Recent Bookings: ${bookings.map(b => `[ID: ${b.id}] ${b.booking_date} ${b.start_time}-${b.end_time}`).join(', ')}.
Available Professionals: ${professionals.map(p => `${p.name} (${p.title})`).join(', ')}.
Services: ${services.map(s => `"${s.title}" by ${s.freelancer_name}`).join(', ')}.

RULES:
1. Confirm all details (pro name, date, start, end) before booking.
2. If a clash is detected (check Recent Bookings), ask: "Wait, you have a clash with [Pro] at that time. Replace it or keep it?"
3. If user says Replace: Call schedule_meeting with force: true.
4. Keep responses brief and friendly.
` : `Freelancer assistant. Help manage slots.`;

        const messages = [{ role: 'system', content: systemInstruction }, ...(history || []).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })), { role: 'user', content: message }];
        const tools = isClient ? [scheduleMeetingTool, cancelBookingTool] : [createAvailabilityBatchTool, cancelAvailabilityBatchTool];
        const completion = await groq.chat.completions.create({ messages, model: 'llama-3.3-70b-versatile', temperature: 0.1, tools });
        const aiResponse = completion.choices[0].message;
        
        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            const toolCall = aiResponse.tool_calls[0];
            const args = JSON.parse(toolCall.function.arguments);
            console.log("DEBUG - AI Tool Call:", toolCall.function.name, args);

            if (toolCall.function.name === 'cancel_booking') {
                let targetId = args.booking_id;
                if (!targetId && args.freelancer_name) {
                    const [found] = await pool.query('SELECT a.id FROM availability a JOIN users u ON a.freelancer_id = u.id WHERE a.client_email = ? AND u.name LIKE ? ORDER BY a.booking_date DESC LIMIT 1', [userEmail, `%${args.freelancer_name}%`]);
                    if (found.length > 0) targetId = found[0].id;
                }
                if (!targetId) return res.json({ reply: "Couldn't find that booking." });
                await pool.query("UPDATE availability SET status = 'available', is_booked = FALSE, client_name = NULL, client_email = NULL, service_id = NULL, agreed_price = NULL WHERE id = ? AND client_email = ?", [targetId, userEmail]);
                return res.json({ reply: "✅ Booking cancelled." });
            }

            if (toolCall.function.name === 'schedule_meeting') {
                const { freelancer_name, booking_date, start_time, end_time, service_name, force } = args;
                const dbStart = toDbTime(start_time);
                const dbEnd = toDbTime(end_time);
                const [targetUsers] = await pool.query('SELECT id, name, email FROM users WHERE role = "freelancer" AND name LIKE ? LIMIT 1', [`%${freelancer_name}%`]);
                if (targetUsers.length === 0) return res.json({ reply: `Couldn't find ${freelancer_name}.` });
                const targetFreelancer = targetUsers[0];
                
                let serviceId = null, agreedPrice = null;
                if (service_name) {
                    const [srvs] = await pool.query('SELECT id, price FROM services WHERE freelancer_id = ? AND (title LIKE ? OR ? LIKE CONCAT("%", title, "%")) LIMIT 1', [targetFreelancer.id, `%${service_name.trim()}%`, service_name.trim()]);
                    if (srvs.length > 0) { serviceId = srvs[0].id; agreedPrice = srvs[0].price; }
                }

                const [clientConflicts] = await pool.query(`SELECT a.id, u.name as freelancer_name FROM availability a JOIN users u ON a.freelancer_id = u.id WHERE a.client_email = ? AND a.booking_date = ? AND a.status IN ('confirmed', 'pending') AND ( (a.start_time <= ? AND a.end_time > ?) OR (a.start_time < ? AND a.end_time >= ?) OR (? <= a.start_time AND ? > a.start_time) )`, [userEmail, booking_date, dbStart, dbStart, dbEnd, dbEnd, dbStart, dbEnd]);
                if (clientConflicts.length > 0) {
                    if (force) {
                        const ids = clientConflicts.map(c => c.id);
                        await pool.query("UPDATE availability SET status = 'available', is_booked = FALSE, client_name = NULL, client_email = NULL, service_id = NULL, agreed_price = NULL WHERE id IN (?)", [ids]);
                    } else {
                        const c = clientConflicts[0];
                        return res.json({ reply: `Wait, you already have a **session with ${c.freelancer_name}** then. Would you like to **replace** it or **keep** it?` });
                    }
                }

                const [freelancerConflicts] = await pool.query(`SELECT id FROM availability WHERE freelancer_id = ? AND booking_date = ? AND status IN ('confirmed', 'pending') AND ( (start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?) OR (? <= start_time AND ? > start_time) )`, [targetFreelancer.id, booking_date, dbStart, dbStart, dbEnd, dbEnd, dbStart, dbEnd]);
                if (freelancerConflicts.length > 0) {
                    const [rawSameDay] = await pool.query(`SELECT start_time, end_time FROM availability WHERE freelancer_id = ? AND booking_date = ? AND is_booked = FALSE AND (status = 'available' OR status IS NULL) ORDER BY start_time`, [targetFreelancer.id, booking_date]);
                    const sameDay = rawSameDay.filter(r => {
                        const sStart = new Date(`${booking_date}T${r.start_time}`);
                        return sStart > new Date();
                    });

                    if (sameDay.length > 0) {
                        return res.json({
                            reply: `**${targetFreelancer.name}** is already booked then. However, they have these slots on ${booking_date}:\n${sameDay.map(s => `- ${toHHMM(s.start_time)}-${toHHMM(s.end_time)}`).join('\n')}\n\nShall I book one of these instead?`,
                            suggestions: sameDay.map(s => ({ freelancer_id: targetFreelancer.id, freelancer_name: targetFreelancer.name, booking_date, start_time: toHHMM(s.start_time), end_time: toHHMM(s.end_time) }))
                        });
                    } else {
                        const next = await getNextAvailableSlots(targetFreelancer.id, booking_date, dbEnd, 5);
                        if (next.length > 0) {
                            return res.json({
                                reply: `**${targetFreelancer.name}** is fully booked on ${booking_date}. Next available options:\n${next.map(s => `- ${s.booking_date.toISOString().split('T')[0]} ${toHHMM(s.start_time)}-${toHHMM(s.end_time)}`).join('\n')}\n\nWant to book one of these?`,
                                suggestions: next.map(s => ({ freelancer_id: targetFreelancer.id, freelancer_name: targetFreelancer.name, booking_date: s.booking_date.toISOString().split('T')[0], start_time: toHHMM(s.start_time), end_time: toHHMM(s.end_time) }))
                            });
                        }
                    }
                    return res.json({ reply: `Sorry, **${targetFreelancer.name}** is fully booked and has no other available slots.` });
                }


                await pool.query(`INSERT INTO availability (freelancer_id, booking_date, day_of_week, start_time, end_time, is_booked, client_name, client_email, status, service_id, agreed_price) VALUES (?, ?, ?, ?, ?, TRUE, ?, ?, 'pending', ?, ?)`, [targetFreelancer.id, booking_date, dayNameFromDate(booking_date), dbStart, dbEnd, userName, userEmail, serviceId, agreedPrice]);
                try { await sendRequestNotification({ freelancerEmail: targetFreelancer.email, freelancerName: targetFreelancer.name, clientName: userName, clientEmail: userEmail, bookingDate: booking_date, startTime: start_time, endTime: end_time, serviceName: service_name }); } catch(e) {}
                return res.json({ reply: `✅ Successfully booked with **${targetFreelancer.name}** on ${booking_date} at ${start_time}!` });
            }

            if (toolCall.function.name === 'create_availability_batch') {
                const { booking_date, start_time, end_time, session_duration } = args;
                const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                const fromMins = (m) => { const h = Math.floor(m / 60); const mins = m % 60; return `${String(h).padStart(2,'0')}:${String(mins).padStart(2,'0')}:00`; };
                const slots = [];
                for (let c = toMins(start_time); c + session_duration <= toMins(end_time); c += session_duration) {
                    slots.push([req.user.id, booking_date, dayNameFromDate(booking_date), fromMins(c), fromMins(c + session_duration), 'available', false]);
                }
                if (slots.length > 0) { await pool.query("INSERT INTO availability (freelancer_id, booking_date, day_of_week, start_time, end_time, status, is_booked) VALUES ?", [slots]); return res.json({ reply: `Created ${slots.length} slots.` }); }
                return res.json({ reply: "Window too short." });
            }

            if (toolCall.function.name === 'cancel_availability_batch') {
                const { booking_date, start_time, end_time, confirm } = args;
                const s = toDbTime(start_time || '00:00'), e = toDbTime(end_time || '23:59');
                const [rows] = await pool.query("SELECT id, is_booked FROM availability WHERE freelancer_id = ? AND booking_date = ? AND start_time >= ? AND end_time <= ?", [req.user.id, booking_date, s, e]);
                const removable = rows.filter(r => !r.is_booked);
                if (rows.length > removable.length && !confirm) return res.json({ reply: "Some slots are booked. Confirm delete?" });
                if (removable.length > 0) await pool.query(`DELETE FROM availability WHERE id IN (${removable.map(() => '?').join(',')})`, removable.map(r => r.id));
                return res.json({ reply: `Removed ${removable.length} slots.` });
            }
        }

        return res.json({ reply: aiResponse.content || "Done." });

    } catch (error) {
        console.error('AI Chat Error:', error);
        res.json({ reply: "I'm having trouble connecting right now." });
    }
});

module.exports = router;
