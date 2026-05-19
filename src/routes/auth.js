// routes/auth.js
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const db       = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function signAccess(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

function signRefresh(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── POST /auth/register ─────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, phone, password, delivery_address } = req.body;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ error: 'name, email, phone and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? OR phone = ? LIMIT 1',
      [email, phone]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Email or phone already registered' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (name, email, phone, password_hash, delivery_address) VALUES (?,?,?,?,?)',
      [name, email.toLowerCase(), phone, password_hash, delivery_address || null]
    );

    const user = { id: result.insertId, email: email.toLowerCase(), role: 'customer' };
    const accessToken  = signAccess(user);
    const refreshToken = signRefresh(user);

    // Persist refresh token hash
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?,?)',
      [user.id, hashToken(refreshToken), expiresAt]
    );

    res.status(201).json({
      message: 'Registration successful',
      accessToken,
      refreshToken,
      user: { id: user.id, name, email: user.email, phone }
    });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const [rows] = await db.query(
      'SELECT id, name, email, phone, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase()]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken  = signAccess(user);
    const refreshToken = signRefresh(user);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash), expires_at=VALUES(expires_at)',
      [user.id, hashToken(refreshToken), expiresAt]
    );

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /auth/refresh ──────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const [rows] = await db.query(
      'SELECT id FROM refresh_tokens WHERE user_id = ? AND token_hash = ? AND expires_at > NOW()',
      [payload.id, hashToken(refreshToken)]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    const [userRows] = await db.query(
      'SELECT id, email, role FROM users WHERE id = ? AND is_active = TRUE LIMIT 1',
      [payload.id]
    );
    if (!userRows.length) return res.status(401).json({ error: 'User not found' });

    const user = userRows[0];
    const newAccess  = signAccess(user);
    const newRefresh = signRefresh(user);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      'UPDATE refresh_tokens SET token_hash = ?, expires_at = ? WHERE user_id = ?',
      [hashToken(newRefresh), expiresAt, user.id]
    );

    res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post('/logout', auth, async (req, res) => {
  await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [req.user.id]);
  res.json({ message: 'Logged out successfully' });
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, name, email, phone, delivery_address, role, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json(rows[0]);
});

// ─── PATCH /auth/me ───────────────────────────────────────────────────────────
router.patch('/me', auth, async (req, res) => {
  const { name, phone, delivery_address } = req.body;
  await db.query(
    'UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), delivery_address = COALESCE(?, delivery_address) WHERE id = ?',
    [name || null, phone || null, delivery_address || null, req.user.id]
  );
  res.json({ message: 'Profile updated' });
});

module.exports = router;
