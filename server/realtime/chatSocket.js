const jwt = require('jsonwebtoken');
const pool = require('../config/db');

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

async function resolvePair(currentUser, counterpartId) {
    const counterpartRows = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1',
        [counterpartId]
    );
    const counterpart = counterpartRows[0][0];
    if (!counterpart) return null;

    if (currentUser.role === 'client') {
        const freelancerId = counterpart.id;
        const clientId = currentUser.id;
        const matched = counterpart.role === 'freelancer' && await isMatchedPair(freelancerId, currentUser.email);
        if (!matched) return null;
        return { freelancerId, clientId, counterpart };
    }

    if (currentUser.role === 'freelancer') {
        const freelancerId = currentUser.id;
        const clientId = counterpart.id;
        const matched = counterpart.role === 'client' && await isMatchedPair(freelancerId, counterpart.email);
        if (!matched) return null;
        return { freelancerId, clientId, counterpart };
    }

    return null;
}

function roomKey(freelancerId, clientId) {
    return `thread:${freelancerId}:${clientId}`;
}

function registerChatSocket(io) {
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake?.auth?.token;
            if (!token) return next(new Error('Unauthorized'));
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await getUserById(decoded.id);
            if (!user) return next(new Error('Unauthorized'));
            socket.user = user;
            return next();
        } catch (err) {
            return next(new Error('Unauthorized'));
        }
    });

    io.on('connection', (socket) => {
        socket.on('join_thread', async (payload = {}) => {
            try {
                await ensureChatTables();
                const counterpartId = Number(payload.counterpartId);
                if (!Number.isInteger(counterpartId) || counterpartId <= 0) {
                    return socket.emit('chat_error', { message: 'Invalid counterpart id.' });
                }
                const pair = await resolvePair(socket.user, counterpartId);
                if (!pair) {
                    return socket.emit('chat_error', { message: 'Unauthorized thread access.' });
                }
                socket.join(roomKey(pair.freelancerId, pair.clientId));
                socket.emit('joined_thread', { counterpartId });
            } catch (err) {
                socket.emit('chat_error', { message: 'Failed to join thread.' });
            }
        });

        socket.on('send_message', async (payload = {}) => {
            try {
                await ensureChatTables();
                const counterpartId = Number(payload.counterpartId);
                const text = String(payload.message_text || '').trim();
                if (!Number.isInteger(counterpartId) || counterpartId <= 0) {
                    return socket.emit('chat_error', { message: 'Invalid counterpart id.' });
                }
                if (!text) return socket.emit('chat_error', { message: 'Message cannot be empty.' });
                if (text.length > 2000) return socket.emit('chat_error', { message: 'Message too long.' });

                const pair = await resolvePair(socket.user, counterpartId);
                if (!pair) {
                    return socket.emit('chat_error', { message: 'Unauthorized thread access.' });
                }

                const [inserted] = await pool.query(
                    `INSERT INTO chat_messages (freelancer_id, client_id, sender_id, message_text)
                     VALUES (?, ?, ?, ?)`,
                    [pair.freelancerId, pair.clientId, socket.user.id, text]
                );
                const [savedRows] = await pool.query(
                    `SELECT id, sender_id, message_text, created_at
                     FROM chat_messages
                     WHERE id = ?`,
                    [inserted.insertId]
                );
                const saved = savedRows[0];
                io.to(roomKey(pair.freelancerId, pair.clientId)).emit('new_message', {
                    counterpartId,
                    message: saved
                });
            } catch (err) {
                socket.emit('chat_error', { message: 'Failed to send message.' });
            }
        });
    });
}

module.exports = { registerChatSocket };
