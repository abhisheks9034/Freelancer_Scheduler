const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/authMiddleware');
const { sendBookingEmails, sendRejectionEmail, sendManualBookingEmail, sendRequestNotification } = require('../utils/emailService');

function formatEmailWarning(baseMessage, emailErr) {
    const reason = emailErr?.message ? ` Reason: ${emailErr.message}` : '';
    return `${baseMessage}${reason}`;
}

// 1. GET: Fetch all booked appointments for a freelancer (Secure, no params)
router.get('/', auth, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer') return res.status(403).json({ error: 'Unauthorized.' });
        const freelancerId = req.user.id;
        const [rows] = await pool.query(
            `SELECT a.*, s.title AS service_title
             FROM availability a
             LEFT JOIN services s ON a.service_id = s.id
             WHERE a.freelancer_id = ?
             ORDER BY a.booking_date, a.start_time`,
            [freelancerId]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. GET: All bookings with conflict detection (Secure, no params)
router.get('/all', auth, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer') return res.status(403).json({ error: 'Unauthorized.' });
        const freelancerId = req.user.id;
        const [rows] = await pool.query(
            `SELECT a.*, s.title AS service_title
             FROM availability a
             LEFT JOIN services s ON a.service_id = s.id
             WHERE a.freelancer_id = ?
             ORDER BY a.booking_date, a.start_time`,
            [freelancerId]
        );

        // Detect conflicts: overlapping slots on same date
        const withConflicts = rows.map((slot, i) => {
            const isConflict = rows.some((other, j) => {
                if (i === j) return false;
                if (slot.booking_date?.toString().split('T')[0] !== other.booking_date?.toString().split('T')[0]) return false;
                const sStart = slot.start_time, sEnd = slot.end_time;
                const oStart = other.start_time, oEnd = other.end_time;
                return sStart < oEnd && sEnd > oStart;
            });
            return { ...slot, conflict: isConflict };
        });

        res.json(withConflicts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. POST: Client requests a proposed time (Req 1)
router.post('/request', auth, async (req, res) => {
    try {
        if (req.user.role !== 'client') return res.status(403).json({ error: "Only clients can request meetings." });
        const { freelancer_id, booking_date, start_time, end_time, service_id } = req.body;
        
        if (!freelancer_id || !booking_date || !start_time || !end_time) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        const slotStart = new Date(booking_date);
        const [hours, minutes, seconds] = start_time.split(':');
        slotStart.setHours(parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds || 0, 10), 0);
        if (slotStart < new Date()) {
            return res.status(400).json({ error: "Cannot book a meeting in the past." });
        }

        const [users] = await pool.query('SELECT name, email FROM users WHERE id = ?', [req.user.id]);
        const client_name = users[0].name;
        const client_email = users[0].email;

        // 1. Client Conflict Detection: Ensure client is not already busy
        const [clientConflicts] = await pool.query(
            `SELECT a.id, u.name as freelancer_name FROM availability a
             JOIN users u ON a.freelancer_id = u.id
             WHERE a.client_email = ? 
             AND a.booking_date = ? 
             AND a.status IN ('confirmed', 'pending')
             AND (
                (a.start_time <= ? AND a.end_time > ?) OR
                (a.start_time < ? AND a.end_time >= ?) OR
                (? <= a.start_time AND ? > a.start_time)
             ) LIMIT 1`,
            [client_email, booking_date, start_time, start_time, end_time, end_time, start_time, end_time]
        );

        if (clientConflicts.length > 0) {
            const c = clientConflicts[0];
            return res.status(409).json({ 
                error: `You already have a ${c.freelancer_name ? 'session with ' + c.freelancer_name : 'booking'} on this date that overlaps with this time. Please choose a different slot.` 
            });
        }

        // 2. Freelancer Conflict Detection
        const [freelancerConflicts] = await pool.query(
            `SELECT id FROM availability 
             WHERE freelancer_id = ? 
             AND booking_date = ? 
             AND status IN ('confirmed', 'pending')
             AND (
                (start_time <= ? AND end_time > ?) OR
                (start_time < ? AND end_time >= ?) OR
                (? <= start_time AND ? > start_time)
             )`,
            [freelancer_id, booking_date, start_time, start_time, end_time, end_time, start_time, end_time]
        );

        if (freelancerConflicts.length > 0) {

            // Find available slots for the requested booking_date
            const [rawSlots] = await pool.query(
                `SELECT start_time, end_time FROM availability 
                 WHERE freelancer_id = ? AND booking_date = ? AND is_booked = FALSE AND (status = 'available' OR status IS NULL)
                 ORDER BY start_time`,
                 [freelancer_id, booking_date]
            );
            
            const now = new Date();
            const availableSlots = rawSlots.filter(r => {
                const slotStart = new Date(booking_date);
                const [h, m, s] = r.start_time.split(':');
                slotStart.setHours(parseInt(h, 10), parseInt(m, 10), parseInt(s || 0, 10), 0);
                return slotStart > now;
            });
            
            let errMsg = "This professional is already booked or has a pending request for this time slot.";
            if (availableSlots.length > 0) {
                const slotsStr = availableSlots.map(s => `${s.start_time.substring(0,5)}-${s.end_time.substring(0,5)}`).join(', ');
                errMsg += ` Available slots on this day: ${slotsStr}.`;
            } else {
                errMsg += " There are no other available slots on this day.";
            }

            return res.status(409).json({ error: errMsg });
        }

        let agreed_price = null;

        if (service_id) {
            const [serviceRows] = await pool.query('SELECT price FROM services WHERE id = ?', [service_id]);
            if (serviceRows.length > 0) {
                agreed_price = serviceRows[0].price;
            }
        }

        const dateObj = new Date(booking_date);
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const dayName = days[dateObj.getDay()];

        const [result] = await pool.query(
            `INSERT INTO availability (freelancer_id, booking_date, day_of_week, start_time, end_time, is_booked, client_name, client_email, status, service_id, agreed_price) 
             VALUES (?, ?, ?, ?, ?, TRUE, ?, ?, 'pending', ?, ?)`,
            [freelancer_id, booking_date, dayName, start_time, end_time, client_name, client_email, service_id || null, agreed_price]
        );

        let emailWarning = null;
        // Notify freelancer
        try {
            const [freelancerRows] = await pool.query('SELECT name, email FROM users WHERE id = ?', [freelancer_id]);
            const freelancer = freelancerRows[0];
            let serviceTitle = null;
            if (service_id) {
                const [svcRows] = await pool.query('SELECT title FROM services WHERE id = ?', [service_id]);
                if (svcRows.length > 0) serviceTitle = svcRows[0].title;
            }
            await sendRequestNotification({
                freelancerEmail: freelancer.email,
                freelancerName: freelancer.name,
                clientName: client_name,
                clientEmail: client_email,
                bookingDate: booking_date,
                startTime: start_time,
                endTime: end_time,
                serviceName: serviceTitle,
            });
        } catch (emailErr) {
            console.warn('Request notification failed:', emailErr.message);
            emailWarning = formatEmailWarning(
                'Request saved, but email notification was not sent. Sender Google auth may be expired; reconnect Google in Settings and try again.',
                emailErr
            );
        }

        res.status(201).json({ message: "Meeting requested successfully.", id: result.insertId, warning: emailWarning });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. PATCH: Freelancer approves a proposed time (Req 1)
router.patch('/:id/approve', auth, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer') return res.status(403).json({ error: "Unauthorized." });
        const [result] = await pool.query(
            "UPDATE availability SET status = 'confirmed', is_booked = TRUE WHERE id = ? AND freelancer_id = ?",
            [req.params.id, req.user.id]
        );
        
        if (result.affectedRows === 0) return res.status(404).json({ error: "Booking not found or not yours." });

        // Fetch to send email
        const [slots] = await pool.query('SELECT a.*, s.title as service_title FROM availability a LEFT JOIN services s ON a.service_id = s.id WHERE a.id = ?', [req.params.id]);
        const slot = slots[0];
        
        const [userRows] = await pool.query('SELECT name, email FROM users WHERE id = ?', [req.user.id]);
        
        let emailWarning = null;
        try {
            await sendBookingEmails({
                freelancerEmail: userRows[0].email,
                freelancerName: userRows[0].name,
                clientName: slot.client_name,
                clientEmail: slot.client_email,
                bookingDate: slot.booking_date?.toString().split('T')[0],
                startTime: slot.start_time?.substring(0, 5),
                endTime: slot.end_time?.substring(0, 5),
                serviceName: slot.service_title || null,
            });
        } catch (emailErr) {
            console.warn('Email send failed (booking still confirmed):', emailErr.message);
            emailWarning = formatEmailWarning(
                'Booking confirmed, but email was not sent. Sender Google auth may be expired; reconnect Google in Settings and try again.',
                emailErr
            );
        }

        res.json({ message: "Meeting confirmed!", warning: emailWarning });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. PATCH: Freelancer declines a proposed time (Req 1)
router.patch('/:id/decline', auth, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer') return res.status(403).json({ error: "Unauthorized." });
        const { reason } = req.body;
        
        const [slots] = await pool.query('SELECT * FROM availability WHERE id = ? AND freelancer_id = ?', [req.params.id, req.user.id]);
        if (slots.length === 0) return res.status(404).json({ error: "Booking not found." });

        const slot = slots[0];
        const [userRows] = await pool.query('SELECT name, email FROM users WHERE id = ?', [req.user.id]);

        await pool.query(
            "UPDATE availability SET status = 'rejected', is_booked = FALSE WHERE id = ? AND freelancer_id = ?",
            [req.params.id, req.user.id]
        );

        let emailWarning = null;
        try {
            await sendRejectionEmail({
                clientEmail: slot.client_email,
                clientName: slot.client_name,
                freelancerName: userRows[0].name,
                freelancerEmail: userRows[0].email,
                bookingDate: slot.booking_date?.toString().split('T')[0],
                startTime: slot.start_time?.substring(0, 5),
                endTime: slot.end_time?.substring(0, 5),
                reason: reason || 'Freelancer is unavailable at this time.'
            });
        } catch(err) { 
            console.warn('Rejection email failed', err);
            emailWarning = formatEmailWarning(
                'Meeting declined, but email was not sent. Sender Google auth may be expired; reconnect Google in Settings and try again.',
                err
            );
        }

        res.json({ message: "Meeting declined.", warning: emailWarning });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. DELETE: Cancel a booking (Protected — owning freelancer or the client)
router.delete('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;

        const [users] = await pool.query('SELECT role, email FROM users WHERE id = ?', [req.user.id]);
        const userEmail = users[0].email;
        const userRole = users[0].role;

        const [slots] = await pool.query('SELECT * FROM availability WHERE id = ?', [id]);
        if (slots.length === 0) {
            return res.status(404).json({ error: 'Booking not found.' });
        }
        
        const slot = slots[0];

        if (userRole === 'freelancer' && slot.freelancer_id !== req.user.id) {
            return res.status(403).json({ error: 'Permission denied.' });
        }
        if (userRole === 'client' && slot.client_email !== userEmail) {
            return res.status(403).json({ error: 'Permission denied. Not your booking.' });
        }

        await pool.query(
            "UPDATE availability SET status = 'available', is_booked = FALSE, client_name = NULL, client_email = NULL WHERE id = ?",
            [id]
        );

        res.json({ message: 'Booking cancelled.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. POST: Manually book a slot (Freelancer only)
router.post('/manual', auth, async (req, res) => {
    if (req.user.role !== 'freelancer') return res.status(403).json({ error: 'Only freelancers can manually book slots.' });

    const { booking_date, start_time, end_time, client_name, client_email } = req.body;
    if (!booking_date || !start_time || !end_time || !client_name || !client_email) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        const dateObj = new Date(booking_date);
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const dayName = days[dateObj.getDay()];

        const [result] = await pool.query(
            "INSERT INTO availability (freelancer_id, booking_date, day_of_week, start_time, end_time, is_booked, client_name, client_email, status) VALUES (?, ?, ?, ?, ?, TRUE, ?, ?, 'confirmed')",
            [req.user.id, booking_date, dayName, start_time, end_time, client_name, client_email]
        );

        const [userRows] = await pool.query('SELECT name, email FROM users WHERE id = ?', [req.user.id]);
        
        let emailWarning = null;
        try {
            await sendManualBookingEmail({
                freelancerEmail: userRows[0].email,
                freelancerName: userRows[0].name,
                clientName: client_name,
                clientEmail: client_email,
                bookingDate: booking_date,
                startTime: start_time,
                endTime: end_time
            });
        } catch(err) { 
            console.warn('Manual booking email failed', err);
            emailWarning = formatEmailWarning(
                'Booking saved, but invite email was not sent. Sender Google auth may be expired; reconnect Google in Settings and try again.',
                err
            );
        }

        res.status(201).json({ message: 'Manual booking saved and invite sent.', warning: emailWarning });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 8. GET: Fetch bookings for a specific client
router.get('/client/my-bookings', auth, async (req, res) => {
    try {
        const [users] = await pool.query('SELECT email FROM users WHERE id = ?', [req.user.id]);
        if (users.length === 0) return res.status(404).json({ error: "User not found" });
        const userEmail = users[0].email;

        const [rows] = await pool.query(
            `SELECT a.*, u.name as freelancer_name, s.title as service_title
             FROM availability a
             JOIN users u ON a.freelancer_id = u.id
             LEFT JOIN services s ON a.service_id = s.id
             WHERE a.client_email = ? AND a.is_booked = TRUE
             ORDER BY a.booking_date, a.start_time`,
            [userEmail]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Legacy POST / for existing frontend logic claiming existing slot (Updated status)
router.post('/', auth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    const { slot_id, client_name, client_email, service_id } = req.body;

    if (!slot_id || !client_name?.trim() || !client_email?.trim()) {
        return res.status(400).json({ error: 'slot_id, client_name, and client_email are required.' });
    }

    try {
        const [slots] = await pool.query('SELECT * FROM availability WHERE id = ?', [slot_id]);
        if (slots.length === 0) return res.status(404).json({ error: "Slot not found." });
        const slot = slots[0];

        const slotStart = new Date(slot.booking_date);
        const [hours, minutes, seconds] = slot.start_time.split(':');
        slotStart.setHours(parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds || 0, 10), 0);
        if (slotStart < new Date()) {
            return res.status(400).json({ error: "Cannot book a meeting in the past." });
        }

        let agreed_price = null;
        if (service_id) {
            const [serviceRows] = await pool.query('SELECT price FROM services WHERE id = ?', [service_id]);
            if (serviceRows.length > 0) {
                agreed_price = serviceRows[0].price;
            }
        }

        const [result] = await pool.query(
            "UPDATE availability SET is_booked = TRUE, status = 'pending', client_name = ?, client_email = ?, service_id = ?, agreed_price = ? WHERE id = ? AND (is_booked = FALSE OR status = 'available')",
            [client_name, client_email, service_id || null, agreed_price, slot_id]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: "Sorry, this slot is already taken." });
        }

        let emailWarning = null;
        // Notify freelancer of the request
        try {
            const [freelancerRows] = await pool.query('SELECT name, email FROM users WHERE id = ?', [slot.freelancer_id]);
            const freelancer = freelancerRows[0];
            await sendRequestNotification({
                freelancerEmail: freelancer?.email,
                freelancerName: freelancer?.name || 'Freelancer',
                clientName: client_name,
                clientEmail: client_email,
                bookingDate: slot.booking_date?.toString().split('T')[0],
                startTime: slot.start_time?.substring(0, 5),
                endTime: slot.end_time?.substring(0, 5),
            });
        } catch (emailErr) {
            console.warn('Email send failed:', emailErr.message);
            emailWarning = formatEmailWarning(
                'Request saved, but email notification was not sent. Sender Google auth may be expired; reconnect Google in Settings and try again.',
                emailErr
            );
        }

        res.status(201).json({ message: "Request sent to freelancer for approval.", warning: emailWarning });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 9. GET: Financials for freelancer (total confirmed hours * hourly rate or agreed price)
router.get('/financials', auth, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer') {
            return res.status(403).json({ error: "Only freelancers can access financials." });
        }
        
        const [userRow] = await pool.query('SELECT hourly_rate FROM users WHERE id = ?', [req.user.id]);
        const hourlyRate = userRow[0]?.hourly_rate || 0.00;

        const [hoursRow] = await pool.query(`
            SELECT 
                SUM(
                    IF(agreed_price IS NOT NULL, 
                       agreed_price, 
                       (TIMESTAMPDIFF(MINUTE, start_time, end_time) / 60) * ?)
                ) as total_earnings,
                SUM(TIMESTAMPDIFF(MINUTE, start_time, end_time) / 60) as total_hours
            FROM availability
            WHERE freelancer_id = ? AND status = 'confirmed'
        `, [hourlyRate, req.user.id]);

        const totalHours = hoursRow[0]?.total_hours || 0;
        const totalEarnings = hoursRow[0]?.total_earnings || 0;

        res.json({ totalHours, hourlyRate, totalEarnings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 10. GET: Stats for earnings dashboard
router.get('/stats', auth, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer') {
            return res.status(403).json({ error: "Only freelancers can access stats." });
        }
        const freelancerId = req.user.id;

        // Total slots and booked this month
        const [monthStats] = await pool.query(
            `SELECT 
                COUNT(*) as total_slots,
                SUM(is_booked) as booked_slots,
                SUM(CASE WHEN MONTH(booking_date) = MONTH(CURDATE()) AND YEAR(booking_date) = YEAR(CURDATE()) THEN 1 ELSE 0 END) as this_month_slots,
                SUM(CASE WHEN MONTH(booking_date) = MONTH(CURDATE()) AND YEAR(booking_date) = YEAR(CURDATE()) AND is_booked = TRUE THEN 1 ELSE 0 END) as this_month_booked
             FROM availability 
             WHERE freelancer_id = ?`,
            [freelancerId]
        );

        // Bookings grouped by month
        const [monthlyBookings] = await pool.query(
            `SELECT 
                MONTH(booking_date) as month,
                MONTHNAME(booking_date) as month_name,
                COUNT(*) as booking_count,
                SUM(TIMESTAMPDIFF(HOUR, start_time, end_time)) as total_hours
             FROM availability
             WHERE freelancer_id = ? AND is_booked = TRUE AND YEAR(booking_date) = YEAR(CURDATE())
             GROUP BY MONTH(booking_date), MONTHNAME(booking_date)
             ORDER BY month`,
            [freelancerId]
        );

        // Conflict detection (Within the freelancer's scope)
        const [allSlots] = await pool.query(
            `SELECT * FROM availability WHERE freelancer_id = ? ORDER BY booking_date, start_time`,
            [freelancerId]
        );

        const conflicts = [];
        for (let i = 0; i < allSlots.length; i++) {
            for (let j = i + 1; j < allSlots.length; j++) {
                const a = allSlots[i], b = allSlots[j];
                const aDate = a.booking_date?.toString().split('T')[0];
                const bDate = b.booking_date?.toString().split('T')[0];
                if (aDate !== bDate) continue;
                if (a.start_time < b.end_time && a.end_time > b.start_time) {
                    conflicts.push({ slot1: a, slot2: b });
                }
            }
        }

        // This week hours
        const [weekStats] = await pool.query(
            `SELECT SUM(TIMESTAMPDIFF(HOUR, start_time, end_time)) as week_hours
             FROM availability
             WHERE freelancer_id = ?
               AND YEARWEEK(booking_date, 1) = YEARWEEK(CURDATE(), 1)`,
            [freelancerId]
        );

        // Fetch freelancer's taking-bookings status
        const [userRow] = await pool.query('SELECT is_taking_bookings FROM users WHERE id = ?', [freelancerId]);

        res.json({
            monthStats: monthStats[0],
            monthlyBookings,
            conflicts,
            weekHours: weekStats[0]?.week_hours || 0,
            is_taking_bookings: userRow[0]?.is_taking_bookings ?? true
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
