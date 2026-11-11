const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { google } = require('googleapis');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Configure the Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// 1. Redirect to Google Login
router.get('/google', (req, res) => {
    // 🛠️ Grab the role from the URL (defaults to client if missing)
    const requestedRole = req.query.role === 'freelancer' ? 'freelancer' : 'client';

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', 
        prompt: 'consent select_account',
        include_granted_scopes: false,
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/gmail.send',
            // Required for Gmail SMTP OAuth2 (used by nodemailer service:gmail)
            'https://mail.google.com/'
        ],
        state: requestedRole // 🌟 Google will hold this and pass it back to us
    });
    res.redirect(url);
});

// 2. Google Callback (Handles the response from Google)
router.get('/google/callback', async (req, res) => {
    // 🛠️ Extract both the code AND the state Google sent back
    const { code, state } = req.query;

    try {
        // Exchange the code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2('v2'); 
        const userInfo = await oauth2.userinfo.get({ auth: oauth2Client });

        const { id: google_id, email, name } = userInfo.data;

        // Check if user exists in DB
        const [users] = await pool.query('SELECT * FROM users WHERE google_id = ? OR email = ?', [google_id, email]);
        
        let user;
        if (users.length > 0) {
            user = users[0];
            // Update the refresh token if we got a new one
            if (tokens.refresh_token) {
                await pool.query('UPDATE users SET google_refresh_token = ? WHERE id = ?', [tokens.refresh_token, user.id]);
            }
            // Also update google_id if it was missing
            if (!user.google_id) {
                await pool.query('UPDATE users SET google_id = ? WHERE id = ?', [google_id, user.id]);
            }
        } else {
            // 🌟 Assign role based on the state parameter instead of hardcoding 'freelancer'
            const assignedRole = state === 'freelancer' ? 'freelancer' : 'client';

            // Create new user
            const [result] = await pool.query(
                'INSERT INTO users (name, email, google_id, google_refresh_token, role) VALUES (?, ?, ?, ?, ?)',
                [name, email, google_id, tokens.refresh_token, assignedRole]
            );
            user = { id: result.insertId, name, email, role: assignedRole };
        }

        // Generate our app's JWT
        const appToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

        // Redirect back to frontend with URL-safe query params
        const authParams = new URLSearchParams({
            token: appToken,
            user: JSON.stringify({ id: user.id, name: user.name, role: user.role })
        });
        res.redirect(`${FRONTEND_URL}/auth?${authParams.toString()}`);
        
    } catch (error) {
        console.error("Detailed Google Auth Error:", error);
        const rawReason =
            error?.response?.data?.error_description ||
            error?.response?.data?.error ||
            error?.message ||
            'auth_failed';
        const reason = String(rawReason).slice(0, 220);
        const errorParams = new URLSearchParams({
            error: 'auth_failed',
            reason
        });
        res.redirect(`${FRONTEND_URL}/auth?${errorParams.toString()}`);
    }
});
// 1. REGISTER a new user
router.post('/register', async (req, res) => {
    const { name, email, password, role } = req.body;

    // Input validation
    if (!name || String(name).trim().length < 2 || String(name).trim().length > 80) {
        return res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
        return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || String(password).length < 6 || String(password).length > 128) {
        return res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
    }
    if (!['client', 'freelancer'].includes(role)) {
        return res.status(400).json({ error: 'Role must be client or freelancer.' });
    }

    const sanitisedName = String(name).trim();
    const sanitisedEmail = String(email).trim().toLowerCase();

    try {
        // Check if user already exists
        const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [sanitisedEmail]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: "Email already in use" });
        }

        // Hash the password for security
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert the new user into the database
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [sanitisedName, sanitisedEmail, hashedPassword, role]
        );

        res.status(201).json({ message: "User registered successfully!", userId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. LOGIN an existing user
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find the user by their email
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const user = users[0];

        // Compare the submitted password with the hashed one in the DB
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // Generate a JWT token containing the user's ID and role
        const token = jwt.sign(
            { id: user.id, role: user.role }, 
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ 
            message: "Logged in successfully", 
            token, 
            user: { id: user.id, name: user.name, role: user.role } 
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;