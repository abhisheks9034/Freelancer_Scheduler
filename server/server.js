const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const pool = require('./config/db');
const authRoutes = require('./routes/auth');
const http = require('http');
const { Server } = require('socket.io');
const { registerChatSocket } = require('./realtime/chatSocket');

const app = express();

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// Rate limiters
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again after 15 minutes.' }
});
const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many AI requests, please slow down.' }
});
const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredOrigins]));
const corsOptions = {
    origin: (origin, callback) => {
        // Allow non-browser requests and same-origin calls
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
};
app.use(cors(corsOptions)); 
app.use(express.json()); 
app.use('/api/auth', authLimiter, authRoutes);
const server = http.createServer(app);
const io = new Server(server, {
    cors: corsOptions
});
registerChatSocket(io);

const availabilityRoutes = require('./routes/availability');
const bookingRoutes = require('./routes/bookings');
const userRoutes = require('./routes/users');
const aiRoutes = require('./routes/ai');
const chatRoutes = require('./routes/chat');
const servicesRoutes = require('./routes/services');

app.use('/api/availability', availabilityRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/services', servicesRoutes);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});