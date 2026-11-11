const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/authMiddleware');

// GET: Fetch all services across all freelancers (Marketplace)
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT s.id, s.title, s.description, s.price, s.duration_minutes, 
                   u.id as freelancer_id, u.name as freelancer_name, u.avatar_url, u.title as freelancer_title
            FROM services s
            JOIN users u ON s.freelancer_id = u.id
            WHERE u.is_taking_bookings = TRUE
            ORDER BY s.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET: Fetch services for a specific freelancer
router.get('/freelancer/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, title, description, price, duration_minutes, created_at
            FROM services
            WHERE freelancer_id = ?
            ORDER BY created_at DESC
        `, [req.params.id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST: Create a new service (Freelancer only)
router.post('/', auth, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer') {
            return res.status(403).json({ error: "Only freelancers can create services." });
        }
        
        const { title, description, price, duration_minutes } = req.body;
        if (!title || price === undefined) {
            return res.status(400).json({ error: "Title and price are required." });
        }

        const [result] = await pool.query(
            'INSERT INTO services (freelancer_id, title, description, price, duration_minutes) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, title, description || null, price, duration_minutes || 60]
        );

        res.status(201).json({ message: "Service created successfully", id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT: Update a service
router.put('/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer') {
            return res.status(403).json({ error: "Only freelancers can update services." });
        }

        const { title, description, price, duration_minutes } = req.body;
        
        const [result] = await pool.query(
            'UPDATE services SET title = ?, description = ?, price = ?, duration_minutes = ? WHERE id = ? AND freelancer_id = ?',
            [title, description || null, price, duration_minutes || 60, req.params.id, req.user.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Service not found or unauthorized." });
        }

        res.json({ message: "Service updated successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Delete a service
router.delete('/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'freelancer') {
            return res.status(403).json({ error: "Only freelancers can delete services." });
        }

        const [result] = await pool.query(
            'DELETE FROM services WHERE id = ? AND freelancer_id = ?',
            [req.params.id, req.user.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Service not found or unauthorized." });
        }

        res.json({ message: "Service deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
