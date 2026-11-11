const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/authMiddleware');

// PATCH: Toggle freelancer availability (is_taking_bookings)
router.patch('/availability-toggle', auth, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer') {
            return res.status(403).json({ error: 'Only freelancers can toggle availability.' });
        }
        const [result] = await pool.query(
            'UPDATE users SET is_taking_bookings = NOT is_taking_bookings WHERE id = ?',
            [req.user.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found.' });

        const [rows] = await pool.query('SELECT is_taking_bookings FROM users WHERE id = ?', [req.user.id]);
        res.json({ is_taking_bookings: rows[0].is_taking_bookings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET: Get public profile (freelancer directory or booking page)
router.get('/:id/profile', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT name, title, bio, is_taking_bookings, avatar_url, company_name, skills, hourly_rate FROM users WHERE id = ?', 
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET: Fetch current user profile details
router.get('/me', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name, email, role, title, bio, avatar_url, company_name, skills, theme_preference, hourly_rate, is_taking_bookings,
                    CASE WHEN google_refresh_token IS NOT NULL AND google_refresh_token <> '' THEN TRUE ELSE FALSE END AS google_connected
             FROM users
             WHERE id = ?`,
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PATCH: Update user profile (freelancer & client fields)
router.patch('/profile', auth, async (req, res) => {
    try {
        const fields = [];
        const values = [];
        const allowedFields = ['title', 'bio', 'avatar_url', 'company_name', 'theme_preference'];
        
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                if (field === 'theme_preference') {
                    const normalized = req.body[field] === 'light' ? 'light' : 'dark';
                    fields.push(`${field} = ?`);
                    values.push(normalized);
                    return;
                }
                fields.push(`${field} = ?`);
                values.push(req.body[field]);
            }
        });

        if (req.body.skills !== undefined) {
            fields.push(`skills = ?`);
            values.push(JSON.stringify(req.body.skills));
        }

        if (req.body.hourly_rate !== undefined && req.user.role === 'freelancer') {
            fields.push(`hourly_rate = ?`);
            values.push(req.body.hourly_rate);
        }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(req.user.id);
        
        await pool.query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET: Fetch freelancers the client has booked with (Isolated Directory)
router.get('/client/my-freelancers', auth, async (req, res) => {
    if (req.user.role !== 'client') return res.status(403).json({ error: 'Only clients can access this.' });
    try {
        const [users] = await pool.query('SELECT email FROM users WHERE id = ?', [req.user.id]);
        const clientEmail = users[0].email;

        const [rows] = await pool.query(`
            SELECT DISTINCT u.id, u.name, u.title, u.bio, u.avatar_url, u.skills, u.hourly_rate
            FROM availability a
            JOIN users u ON a.freelancer_id = u.id
            WHERE a.client_email = ? 
              AND a.is_booked = TRUE
        `, [clientEmail]);

        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET: Fetch all active freelancers (Global Directory)
router.get('/directory', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, name, title, bio, avatar_url, skills, hourly_rate
            FROM users 
            WHERE role = 'freelancer' AND is_taking_bookings = TRUE
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
