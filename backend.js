// backend.js
// Minimal secure backend for Pizza project
const express = require('express');
const session = require('express-session');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const fs = require('fs');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
const https = require('https');
const http = require('http');
const path = require('path');

// --- CONFIGURATION ---
const PORT = 7000;
const USE_HTTPS = false; // Set to true and provide certs for HTTPS
const SESSION_SECRET = 'pizza-very-secret'; // Change in production
const PASSWORD_BLACKLIST_PATH = './10k-most-common.txt'; // Update as needed
const RECAPTCHA_SECRET = 'YOUR_RECAPTCHA_SECRET'; // Set this
const BREVO_API_KEY = 'YOUR_BREVO_API_KEY'; // Set this

// --- USER STORE (in-memory for demo, replace with DB in prod) ---
const users = {};
// Example user: users['user@example.com'] = { password: 'hashed', two_factor_enabled: false, two_factor_secret: '', two_factor_temp_secret: '' }

// --- PASSWORD BLACKLIST ---
let passwordBlacklist = [];
if (fs.existsSync(PASSWORD_BLACKLIST_PATH)) {
  passwordBlacklist = fs.readFileSync(PASSWORD_BLACKLIST_PATH, 'utf-8').split('\n');
}

// --- EXPRESS APP SETUP ---
const app = express();
app.use(cors({ origin: 'http://localhost:5500', credentials: true })); // Adjust as needed
app.use(express.json());
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false }));

// --- AUTH MIDDLEWARE ---
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// --- 2FA ENDPOINTS ---
app.post('/api/2fa/setup', isAuthenticated, async (req, res) => {
  const email = req.session.user;
  const secret = speakeasy.generateSecret({ name: `PizzaTokenApp (${email})` });
  users[email].two_factor_temp_secret = secret.base32;
  qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
    if (err) return res.status(500).json({ error: 'QR code generation failed' });
    res.json({ qrCodeDataUrl: data_url });
  });
});

app.post('/api/2fa/verify', isAuthenticated, (req, res) => {
  const email = req.session.user;
  const { token } = req.body;
  const base32secret = users[email].two_factor_temp_secret;
  if (!base32secret) return res.status(400).json({ success: false, error: 'No 2FA setup in progress' });
  const verified = speakeasy.totp.verify({ secret: base32secret, encoding: 'base32', token, window: 1 });
  if (verified) {
    users[email].two_factor_secret = base32secret;
    users[email].two_factor_enabled = true;
    users[email].two_factor_temp_secret = undefined;
    return res.json({ success: true });
  } else {
    return res.json({ success: false });
  }
});

// --- EMAIL (BREVO) EXAMPLE ---
app.post('/api/send-email', isAuthenticated, async (req, res) => {
  const { to, subject, text } = req.body;
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    auth: { user: 'YOUR_BREVO_SMTP_USER', pass: 'YOUR_BREVO_SMTP_PASS' },
  });
  try {
    await transporter.sendMail({ from: 'no-reply@yourdomain.com', to, subject, text });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- RECAPTCHA VERIFICATION ---
app.post('/api/verify-recaptcha', async (req, res) => {
  const { token } = req.body;
  const response = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${RECAPTCHA_SECRET}&response=${token}`
  });
  const data = await response.json();
  res.json(data);
});

// --- PASSWORD CHECK EXAMPLE ---
app.post('/api/check-password', (req, res) => {
  const { password } = req.body;
  if (passwordBlacklist.includes(password)) {
    return res.json({ valid: false, reason: 'Password is too common.' });
  }
  // Add more checks as needed
  res.json({ valid: true });
});

// --- USER LOGIN/REGISTER (DEMO ONLY) ---
app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (users[email]) return res.status(400).json({ error: 'User exists' });
  if (passwordBlacklist.includes(password)) return res.status(400).json({ error: 'Password is too common' });
  users[email] = { password, two_factor_enabled: false };
  req.session.user = email;
  res.json({ success: true });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!users[email] || users[email].password !== password) return res.status(400).json({ error: 'Invalid credentials' });
  req.session.user = email;
  res.json({ success: true, two_factor_enabled: users[email].two_factor_enabled });
});

// --- HTTPS SUPPORT (for production) ---
if (USE_HTTPS) {
  const options = {
    key: fs.readFileSync('/path/to/privkey.pem'),
    cert: fs.readFileSync('/path/to/fullchain.pem')
  };
  https.createServer(options, app).listen(PORT, () => {
    console.log(`HTTPS server running on port ${PORT}`);
  });
} else {
  http.createServer(app).listen(PORT, () => {
    console.log(`HTTP server running on port ${PORT}`);
  });
} 