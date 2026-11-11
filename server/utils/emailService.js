const nodemailer = require('nodemailer');
const ics = require('ics');
const { google } = require('googleapis');
const pool = require('../config/db');

let etherealTransporter = null;
let etherealUser = null;

async function getEtherealTransporter() {
    if (etherealTransporter) return { transporter: etherealTransporter, user: etherealUser };
    console.log('⚠️  No freelancer OAuth token found — using Ethereal test account (emails not delivered to real inboxes).');
    const testAccount = await nodemailer.createTestAccount();
    etherealTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
    });
    etherealUser = testAccount.user;
    console.log(`✉️  Ethereal test account ready: ${testAccount.user}`);
    return { transporter: etherealTransporter, user: etherealUser };
}

/**
 * Create a Gmail OAuth2 transporter using the freelancer's stored refresh token.
 * If the token is missing or invalid, falls back to Ethereal.
 */
async function getFreelancerTransporter(freelancerEmail) {
    if (!freelancerEmail) {
        throw new Error('Missing sender email. Sender must connect Google to send emails.');
    }

    // Query the database for the freelancer's refresh token
    const [users] = await pool.query('SELECT google_refresh_token FROM users WHERE email = ?', [freelancerEmail]);
    const refreshToken = users[0]?.google_refresh_token;

    if (refreshToken && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        try {
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );
            oauth2Client.setCredentials({ refresh_token: refreshToken });
            const accessTokenResponse = await oauth2Client.getAccessToken();
            const accessToken = accessTokenResponse?.token;
            if (!accessToken) {
                throw new Error('Google token exchange failed (no access token returned).');
            }

            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    type: 'OAuth2',
                    user: freelancerEmail,
                    clientId: process.env.GOOGLE_CLIENT_ID,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                    refreshToken,
                    accessToken,
                },
            });

            console.log(`✉️  Sending email directly via freelancer Gmail: ${freelancerEmail}`);
            // Use the freelancer's exact email address as the 'from' field
            return { transporter, fromAddress: `"${freelancerEmail}" <${freelancerEmail}>`, isOAuth: true };
        } catch (err) {
            console.warn(`⚠️  Sender OAuth failed for ${freelancerEmail}:`, err.message);
            const message = String(err?.message || '');
            if (message.includes('invalid_grant') || message.toLowerCase().includes('invalid login') || message.includes('535')) {
                throw new Error(`Google auth rejected for ${freelancerEmail} (token expired/revoked). Reconnect Google in Settings.`);
            }
            throw new Error(`Google auth setup failed for ${freelancerEmail}: ${message || 'unknown error'}`);
        }
    }
    // No central/system fallback sender.
    throw new Error(`Sender email auth unavailable for ${freelancerEmail}. Ask this user to reconnect Google in Settings.`);
}

/**
 * Send a booking confirmation to the client
 * and a notification to the freelancer.
 */
async function sendBookingEmails({ freelancerEmail, freelancerName, clientName, clientEmail, bookingDate, startTime, endTime, serviceName = null }) {
    const { transporter, fromAddress, isOAuth } = await getFreelancerTransporter(freelancerEmail);

    const slotLabel = `${bookingDate} from ${startTime} to ${endTime}`;

    // Generate .ics calendar invite
    const [year, month, day] = bookingDate.split('-').map(Number);
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const event = {
        start: [year, month, day, startHour, startMin],
        end: [year, month, day, endHour, endMin],
        title: `${serviceName ? serviceName + ' — ' : ''}Session with ${freelancerName}`,
        description: `Booking confirmed via FreelanceOS${serviceName ? ' for: ' + serviceName : ''}`,
        status: 'CONFIRMED',
        organizer: { name: freelancerName, email: isOAuth ? freelancerEmail : fromAddress },
        attendees: [
            { name: clientName, email: clientEmail, rsvp: true, partstat: 'ACCEPTED', role: 'REQ-PARTICIPANT' }
        ]
    };

    let icsContent = null;
    ics.createEvent(event, (error, value) => {
        if (!error) {
            icsContent = value;
        } else {
            console.warn('⚠️  Failed to generate ICS file:', error);
        }
    });

    const attachments = icsContent ? [{
        filename: 'invite.ics',
        content: icsContent,
        contentType: 'text/calendar; method=REQUEST'
    }] : [];

    // 1. Confirmation to the client
    const info1 = await transporter.sendMail({
        from: fromAddress,
        replyTo: freelancerEmail || fromAddress,
        to: clientEmail,
        subject: `✅ Booking Confirmed — ${serviceName || 'Session'} with ${freelancerName}`,
        html: `
            <div style="font-family:'Helvetica Neue',sans-serif;background:#0d0e11;color:#e8eaf0;padding:32px;border-radius:12px;max-width:480px;margin:auto">
                <h2 style="color:#6c8fff;margin-bottom:4px">Booking Confirmed!</h2>
                <p style="color:#8b90a0;margin-bottom:24px">Hi <strong style="color:#e8eaf0">${clientName}</strong>,</p>
                <div style="background:#13151a;border:1px solid #2a2e38;border-radius:10px;padding:16px;margin-bottom:20px">
                    ${serviceName ? `<div style="font-size:12px;color:#555b6e;margin-bottom:4px">SERVICE</div><div style="font-size:16px;font-weight:700;color:#6c8fff;margin-bottom:12px">${serviceName}</div>` : ''}
                    <div style="font-size:12px;color:#555b6e;margin-bottom:4px">SLOT</div>
                    <div style="font-size:16px;font-weight:600;color:#e8eaf0">${slotLabel}</div>
                    <div style="font-size:13px;color:#8b90a0;margin-top:4px">with ${freelancerName}</div>
                </div>
                <p style="color:#8b90a0;font-size:13px">You'll receive a reminder before your session. Reply to this email if you need to make changes.</p>
                <hr style="border-color:#2a2e38;margin:24px 0"/>
                <p style="color:#3a3f4d;font-size:11px">FreelanceOS — Scheduling made simple</p>
            </div>
        `,
        attachments
    });
    console.log('📧 Client Email Preview URL:', nodemailer.getTestMessageUrl(info1) || '(real email sent)');

    // 2. Notification to the freelancer (Internal, but sent from their own Gmail to themselves)
    if (freelancerEmail) {
        const info2 = await transporter.sendMail({
            from: fromAddress,
            to: freelancerEmail,
            subject: `📅 New confirmed booking from ${clientName}`,
            html: `
                <div style="font-family:'Helvetica Neue',sans-serif;background:#0d0e11;color:#e8eaf0;padding:32px;border-radius:12px;max-width:480px;margin:auto">
                    <h2 style="color:#3ecf8e;margin-bottom:4px">New Booking!</h2>
                    <p style="color:#8b90a0;margin-bottom:24px">Hi <strong style="color:#e8eaf0">${freelancerName}</strong>,</p>
                    <div style="background:#13151a;border:1px solid #2a2e38;border-radius:10px;padding:16px;margin-bottom:20px">
                        <div style="font-size:12px;color:#555b6e;margin-bottom:4px">CLIENT</div>
                        <div style="font-size:15px;font-weight:600;color:#e8eaf0">${clientName}</div>
                        <div style="font-size:13px;color:#8b90a0">${clientEmail}</div>
                        <div style="font-size:12px;color:#555b6e;margin-top:12px;margin-bottom:4px">SLOT</div>
                        <div style="font-size:15px;font-weight:600;color:#e8eaf0">${slotLabel}</div>
                    </div>
                    <p style="color:#8b90a0;font-size:13px">Head to your FreelanceOS dashboard to manage this booking.</p>
                    <hr style="border-color:#2a2e38;margin:24px 0"/>
                    <p style="color:#3a3f4d;font-size:11px">FreelanceOS — Scheduling made simple</p>
                </div>
            `,
            attachments
        });
        console.log('📧 Freelancer Email Preview URL:', nodemailer.getTestMessageUrl(info2) || '(real email sent)');
    }
}

/**
 * Send an email to the client when the freelancer rejects a booking with a reason.
 */
async function sendRejectionEmail({ clientEmail, clientName, freelancerName, freelancerEmail, bookingDate, startTime, endTime, reason }) {
    const { transporter, fromAddress } = await getFreelancerTransporter(freelancerEmail);

    const slotLabel = `${bookingDate} from ${startTime} to ${endTime}`;

    const info = await transporter.sendMail({
        from: fromAddress,
        replyTo: freelancerEmail || fromAddress,
        to: clientEmail,
        subject: `⚠️ Session Cancelled by ${freelancerName}`,
        html: `
            <div style="font-family:'Helvetica Neue',sans-serif;background:#0d0e11;color:#e8eaf0;padding:32px;border-radius:12px;max-width:480px;margin:auto">
                <h2 style="color:#f06060;margin-bottom:4px">Booking Cancelled</h2>
                <p style="color:#8b90a0;margin-bottom:24px">Hi <strong style="color:#e8eaf0">${clientName}</strong>,</p>
                <div style="background:#13151a;border:1px solid #2a2e38;border-radius:10px;padding:16px;margin-bottom:20px">
                    <p style="font-size:14px;color:#e8eaf0;margin-top:0">Your session with <strong>${freelancerName}</strong> for <br/><span style="color:#f06060;font-family:'DM Mono',monospace">${slotLabel}</span> has been cancelled.</p>
                    <div style="background:#1a1c23;border-left:4px solid #f06060;padding:12px;margin-top:16px;font-size:13px;color:#a0a5b5;font-style:italic;">
                        "${reason}"
                    </div>
                </div>
                <p style="color:#8b90a0;font-size:13px">Please reach out to the freelancer directly if you need to reschedule.</p>
                <hr style="border-color:#2a2e38;margin:24px 0"/>
                <p style="color:#3a3f4d;font-size:11px">FreelanceOS — Scheduling made simple</p>
            </div>
        `,
    });
    console.log('📧 Rejection Email Preview URL:', nodemailer.getTestMessageUrl(info) || '(real email sent)');
}

/**
 * Send an email to the client when the freelancer manually schedules a slot for them.
 */
async function sendManualBookingEmail({ freelancerEmail, freelancerName, clientName, clientEmail, bookingDate, startTime, endTime }) {
    const { transporter, fromAddress, isOAuth } = await getFreelancerTransporter(freelancerEmail);

    const slotLabel = `${bookingDate} from ${startTime} to ${endTime}`;

    // Generate .ics invite
    const [year, month, day] = bookingDate.split('-').map(Number);
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const event = {
        start: [year, month, day, startHour, startMin],
        end: [year, month, day, endHour, endMin],
        title: `Session with ${freelancerName}`,
        description: `Scheduled directly by ${freelancerName}`,
        status: 'CONFIRMED',
        organizer: { name: freelancerName, email: isOAuth ? freelancerEmail : fromAddress },
        attendees: [
            { name: clientName, email: clientEmail, rsvp: true, partstat: 'ACCEPTED', role: 'REQ-PARTICIPANT' }
        ]
    };

    let icsContent = null;
    ics.createEvent(event, (err, val) => { if (!err) icsContent = val; });

    const attachments = icsContent ? [{
        filename: 'invite.ics',
        content: icsContent,
        contentType: 'text/calendar; method=REQUEST'
    }] : [];

    const info = await transporter.sendMail({
        from: fromAddress,
        replyTo: freelancerEmail || fromAddress,
        to: clientEmail,
        subject: `📅 ${freelancerName} scheduled a meeting with you`,
        html: `
            <div style="font-family:'Helvetica Neue',sans-serif;background:#0d0e11;color:#e8eaf0;padding:32px;border-radius:12px;max-width:480px;margin:auto">
                <h2 style="color:#3ecf8e;margin-bottom:4px">Meeting Scheduled!</h2>
                <p style="color:#8b90a0;margin-bottom:24px">Hi <strong style="color:#e8eaf0">${clientName}</strong>,</p>
                <div style="background:#13151a;border:1px solid #2a2e38;border-radius:10px;padding:16px;margin-bottom:20px">
                    <p style="font-size:14px;color:#e8eaf0;margin-top:0"><strong>${freelancerName}</strong> has manually scheduled a session with you on:</p>
                    <div style="font-size:15px;font-weight:600;color:#6c8fff;margin-top:12px;font-family:'DM Mono',monospace">${slotLabel}</div>
                </div>
                <p style="color:#8b90a0;font-size:13px">You can add the attached calendar invite to your schedule. See you then!</p>
                <hr style="border-color:#2a2e38;margin:24px 0"/>
                <p style="color:#3a3f4d;font-size:11px">FreelanceOS — Scheduling made simple</p>
            </div>
        `,
        attachments
    });
    console.log('📧 Manual Booking Preview URL:', nodemailer.getTestMessageUrl(info) || '(real email sent)');
}

/**
 * Notify the freelancer that a client has requested a meeting.
 */
async function sendRequestNotification({ freelancerEmail, freelancerName, clientName, clientEmail, bookingDate, startTime, endTime, serviceName = null }) {
    // Use the FREELANCER's email account to send the notification, with reply-to set to the client
    const { transporter, fromAddress } = await getFreelancerTransporter(freelancerEmail);
    const slotLabel = `${bookingDate} from ${startTime} to ${endTime}`;

    const info = await transporter.sendMail({
        from: fromAddress,
        replyTo: clientEmail || fromAddress,
        to: freelancerEmail,
        subject: `🔔 New Request: ${serviceName || 'Meeting'} from ${clientName}`,
        html: `
            <div style="font-family:'Helvetica Neue',sans-serif;background:#0d0e11;color:#e8eaf0;padding:32px;border-radius:12px;max-width:480px;margin:auto">
                <h2 style="color:#6c8fff;margin-bottom:4px">New Request!</h2>
                <p style="color:#8b90a0;margin-bottom:24px">Hi <strong style="color:#e8eaf0">${freelancerName}</strong>,</p>
                <div style="background:#13151a;border:1px solid #2a2e38;border-radius:10px;padding:16px;margin-bottom:20px">
                    <div style="font-size:12px;color:#555b6e;margin-bottom:4px">CLIENT</div>
                    <div style="font-size:15px;font-weight:600;color:#e8eaf0">${clientName}</div>
                    <div style="font-size:13px;color:#8b90a0">${clientEmail}</div>
                    ${serviceName ? `<div style="font-size:12px;color:#555b6e;margin-top:12px;margin-bottom:4px">SERVICE REQUESTED</div><div style="font-size:14px;font-weight:700;color:#6c8fff">${serviceName}</div>` : ''}
                    <div style="font-size:12px;color:#555b6e;margin-top:12px;margin-bottom:4px">PROPOSED SLOT</div>
                    <div style="font-size:15px;font-weight:600;color:#e8eaf0">${slotLabel}</div>
                </div>
                <p style="color:#8b90a0;font-size:13px">Head to your dashboard to Approve or Decline this request.</p>
                <p style="color:#8b90a0;font-size:13px;margin-top:10px;">Reply to this email to contact the client directly.</p>
                <hr style="border-color:#2a2e38;margin:24px 0"/>
                <p style="color:#3a3f4d;font-size:11px">FreelanceOS — Scheduling made simple</p>
            </div>
        `
    });
    console.log('📧 Request Notification Preview URL:', nodemailer.getTestMessageUrl(info) || '(real email sent)');
}

module.exports = { sendBookingEmails, sendRejectionEmail, sendManualBookingEmail, sendRequestNotification };
