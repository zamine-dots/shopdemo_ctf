const jwt = require('jsonwebtoken');

// NOTE: This secret is intentionally static and simple -- it is NOT one of
// the intended vulnerabilities (the JWT signature itself is not meant to be
// forgeable), it's just a fixed dev secret typical of a small demo app.
const JWT_SECRET = 'shopdemo-dev-secret-do-not-reuse-in-prod-4f8a2c';

function signSession(user, environmentId, environmentInstanceId) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      environmentId,
      environmentInstanceId,
    },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (
      payload.environmentId !== req.environmentId ||
      payload.environmentInstanceId !== req.environmentInstanceId
    ) {
      return res.status(401).json({ error: 'Session belongs to a different challenge environment' });
    }
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  next();
}

module.exports = { signSession, requireAuth, requireAdmin, JWT_SECRET };
