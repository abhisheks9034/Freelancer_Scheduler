const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/authMiddleware');

async function ensureChatTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            freelancer_id INT NOT NULL,
            client_id INT NOT NULL,
            sender_id INT NOT NULL,
            message_text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_pair_time (freelancer_id, client_id, created_at),
            INDEX idx_sender (sender_id)
        )
    `);
}

async function getUserById(userId) {
    const [rows] = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1',
        [userId]
    );
    return rows[0] || null;
}

async function isMatchedPair(freelancerId, clientEmail) {
    const [rows] = await pool.query(
        `SELECT id
         FROM availability
         WHERE freelancer_id = ?
           AND client_email = ?
           AND status IN ('pending', 'confirmed')
         LIMIT 1`,
        [freelancerId, clientEmail]
    );
    return rows.length > 0;
}

router.get('/threads', auth, async (req, res) => {
    try {
        await ensureChatTables();
        const currentUser = await getUserById(req.user.id);
        if (!currentUser) return res.status(404).json({ error: 'User not found.' });

        if (currentUser.role === 'client') {
            const [rows] = await pool.query(
                `SELECT DISTINCT
                    u.id AS counterpart_id,
                    u.name AS counterpart_name,
                    u.avatar_url AS counterpart_avatar
                 FROM availability a
                 JOIN users u ON u.id = a.freelancer_id
                 WHERE a.client_email = ?
                   AND a.status IN ('pending', 'confirmed')
                 ORDER BY counterpart_name`,
                [currentUser.email]
            );

            const enriched = await Promise.all(rows.map(async (r) => {
                const [lastRows] = await pool.query(
                    `SELECT message_text, created_at, sender_id
                     FROM chat_messages
                     WHERE freelancer_id = ? AND client_id = ?
                     ORDER BY created_at DESC
                     LIMIT 1`,
                    [r.counterpart_id, currentUser.id]
                );
                return {
                    ...r,
                    last_message: lastRows[0]?.message_text || '',
                    last_message_at: lastRows[0]?.created_at || null,
                    last_message_sender_id: lastRows[0]?.sender_id || null
                };
            }));

            return res.json(enriched);
        }

        if (currentUser.role === 'freelancer') {
            const [rows] = await pool.query(
                `SELECT DISTINCT
                    u.id AS counterpart_id,
                    u.name AS counterpart_name,
                    u.avatar_url AS counterpart_avatar
                 FROM availability a
                 JOIN users u ON u.email = a.client_email
                 WHERE a.freelancer_id = ?
                   AND a.status IN ('pending', 'confirmed')
                 ORDER BY counterpart_name`,
                [currentUser.id]
            );

            const enriched = await Promise.all(rows.map(async (r) => {
                const [lastRows] = await pool.query(
                    `SELECT message_text, created_at, sender_id
                     FROM chat_messages
                     WHERE freelancer_id = ? AND client_id = ?
                     ORDER BY created_at DESC
                     LIMIT 1`,
                    [currentUser.id, r.counterpart_id]
                );
                return {
                    ...r,
                    last_message: lastRows[0]?.message_text || '',
                    last_message_at: lastRows[0]?.created_at || null,
                    last_message_sender_id: lastRows[0]?.sender_id || null
                };
            }));

            return res.json(enriched);
        }

        return res.status(403).json({ error: 'Unauthorized role for chat.' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.get('/threads/:counterpartId/messages', auth, async (req, res) => {
    try {
        await ensureChatTables();
        const currentUser = await getUserById(req.user.id);
        if (!currentUser) return res.status(404).json({ error: 'User not found.' });

        const counterpartId = Number(req.params.counterpartId);
        if (!Number.isInteger(counterpartId) || counterpartId <= 0) {
            return res.status(400).json({ error: 'Invalid counterpart id.' });
        }

        const counterpart = await getUserById(counterpartId);
        if (!counterpart) return res.status(404).json({ error: 'Counterpart not found.' });

        let freelancerId;
        let clientId;
        let matched = false;

        if (currentUser.role === 'client') {
            freelancerId = counterpartId;
            clientId = currentUser.id;
            matched = counterpart.role === 'freelancer' && await isMatchedPair(freelancerId, currentUser.email);
        } else if (currentUser.role === 'freelancer') {
            freelancerId = currentUser.id;
            clientId = counterpartId;
            matched = counterpart.role === 'client' && await isMatchedPair(freelancerId, counterpart.email);
        } else {
            return res.status(403).json({ error: 'Unauthorized role for chat.' });
        }

        if (!matched) {
            return res.status(403).json({ error: 'Chat is allowed only for matched client-freelancer pairs.' });
        }

        const [rows] = await pool.query(
            `SELECT id, sender_id, message_text, created_at
             FROM chat_messages
             WHERE freelancer_id = ? AND client_id = ?
             ORDER BY created_at ASC
             LIMIT 300`,
            [freelancerId, clientId]
        );
        return res.json(rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.post('/threads/:counterpartId/messages', auth, async (req, res) => {
    try {
        await ensureChatTables();
        const currentUser = await getUserById(req.user.id);
        if (!currentUser) return res.status(404).json({ error: 'User not found.' });

        const counterpartId = Number(req.params.counterpartId);
        if (!Number.isInteger(counterpartId) || counterpartId <= 0) {
            return res.status(400).json({ error: 'Invalid counterpart id.' });
        }
        const messageText = String(req.body?.message_text || '').trim();
        if (!messageText) return res.status(400).json({ error: 'Message cannot be empty.' });
        if (messageText.length > 2000) return res.status(400).json({ error: 'Message too long.' });

        const counterpart = await getUserById(counterpartId);
        if (!counterpart) return res.status(404).json({ error: 'Counterpart not found.' });

        let freelancerId;
        let clientId;
        let matched = false;

        if (currentUser.role === 'client') {
            freelancerId = counterpartId;
            clientId = currentUser.id;
            matched = counterpart.role === 'freelancer' && await isMatchedPair(freelancerId, currentUser.email);
        } else if (currentUser.role === 'freelancer') {
            freelancerId = currentUser.id;
            clientId = counterpartId;
            matched = counterpart.role === 'client' && await isMatchedPair(freelancerId, counterpart.email);
        } else {
            return res.status(403).json({ error: 'Unauthorized role for chat.' });
        }

        if (!matched) {
            return res.status(403).json({ error: 'Chat is allowed only for matched client-freelancer pairs.' });
        }

        const [result] = await pool.query(
            `INSERT INTO chat_messages (freelancer_id, client_id, sender_id, message_text)
             VALUES (?, ?, ?, ?)`,
            [freelancerId, clientId, currentUser.id, messageText]
        );
        const [saved] = await pool.query(
            `SELECT id, sender_id, message_text, created_at
             FROM chat_messages
             WHERE id = ?`,
            [result.insertId]
        );
        return res.status(201).json(saved[0]);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

module.exports = router;
