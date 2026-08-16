const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { signSession, requireAuth } = require('../middleware/auth');
const flags = require('../utils/flags');

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' };

// --- Login ---------------------------------------------------------------
router.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = req.db.users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  if (!bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signSession(user, req.environmentId, req.environmentInstanceId);
  res.cookie('session', token, COOKIE_OPTS);
  res.json({ ok: true, username: user.username, role: user.role });
});

router.post('/api/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

// --- Password reset (Flag 4: predictable token) --------------------------
// Request a reset: token = base64(username:epochMinute). No randomness.
router.post('/api/password-reset/request', (req, res) => {
  const { username } = req.body || {};
  const user = req.db.users.find(u => u.username === username);
  // Deliberately vague response to avoid *obvious* enumeration here --
  // the real weakness is the token predictability, not enumeration.
  if (!user) {
    return res.json({ ok: true, message: 'If that account exists, a reset link was generated.' });
  }
  req.db.issueResetToken(username);
  // In a real app this would be emailed. Do not expose it in the API response.
  return res.json({
    ok: true,
    message: 'If that account exists, a reset link was generated.',
  });
});

router.post('/api/password-reset/confirm', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'token and newPassword required' });
  }
  const username = req.db.consumeResetToken(token);
  if (!username) return res.status(400).json({ error: 'Invalid or expired token' });

  const user = req.db.users.find(u => u.username === username);
  user.passwordHash = bcrypt.hashSync(newPassword, 8);
  const response = { ok: true, message: `Password updated for ${username}` };
  if (username === 'bob') response.flag = flags.FLAG4_AUTH_WEAKNESS;
  res.json(response);
});

// --- Profile: GET is safe, PATCH is vulnerable to mass assignment (Flag 5)
router.get('/api/me', requireAuth, (req, res) => {
  const user = req.db.users.find(u => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { passwordHash, ...safe } = user;
  res.json(safe);
});

// VULNERABLE: accepts and applies arbitrary fields from the client,
// including `role`, without an allow-list.
router.patch('/api/me', requireAuth, (req, res) => {
  const user = req.db.users.find(u => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: 'Not found' });

  const before = user.role;
  Object.assign(user, req.body); // <-- mass assignment vulnerability
  // id must not change no matter what the client sends
  user.id = req.user.sub;

  const { passwordHash, ...safe } = user;
  const response = { ok: true, profile: safe };

  if (before !== 'admin' && user.role === 'admin') {
    response.flag = flags.FLAG5_PRIV_ESC;
    // Refresh their session token so the new role is reflected immediately.
    const token = signSession(user, req.environmentId, req.environmentInstanceId);
    res.cookie('session', token, COOKIE_OPTS);
  }

  res.json(response);
});

module.exports = router;
