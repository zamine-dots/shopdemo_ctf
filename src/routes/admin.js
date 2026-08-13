const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../data');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use('/api/admin', requireAuth, requireAdmin);

router.get('/api/admin/users', (req, res) => {
  res.json(db.users.map(({ passwordHash, ...safe }) => safe));
});

router.get('/api/admin/orders', (req, res) => {
  // Decoy -- realistic-looking but leads nowhere.
  res.json([
    { id: 9001, user: 'alice', item: 'Wireless Mouse', total: 24.99, status: 'shipped' },
    { id: 9002, user: 'bob', item: 'USB-C Hub', total: 39.5, status: 'processing' },
    { id: 9003, user: 'charlie', item: 'Mechanical Keyboard', total: 89.0, status: 'delivered' },
  ]);
});

router.get('/api/admin/logs', (req, res) => {
  // Flag 6 lives inside a realistic audit trail.
  res.json(db.auditLog);
});

router.get('/api/admin/system-info', (req, res) => {
  // Decoy -- looks juicy, contains nothing exploitable.
  res.json({
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    environment: 'ctf-sandbox',
    buildId: 'shopdemo-2026.06.03-rc2',
  });
});

router.get('/api/admin/config', (req, res) => {
  // Decoy -- mostly boring, one red herring "secret" that does nothing.
  res.json({
    featureFlags: { newCheckout: false, betaSearch: true },
    // Red herring: this looks like a secret but it isn't used anywhere.
    legacyApiKey: 'sk_test_51H0000000000000000000000',
    maintenanceMode: false,
  });
});

// --- Sandboxed file preview (Flag 7) ---------------------------------
// IMPORTANT: this NEVER touches the real filesystem. `db.virtualFiles`
// is a plain in-memory object keyed by fixed virtual paths. There is no
// path resolution against disk, so path traversal cannot escape to the
// host regardless of what a player sends -- the worst case is simply
// "file not found" in this virtual namespace.
router.get('/api/admin/files', (req, res) => {
  res.json({ files: Object.keys(db.virtualFiles) });
});

router.get('/api/admin/files/preview', (req, res) => {
  const requested = (req.query.path || '').toString();
  // Normalize only for comparison purposes -- we look the result up in a
  // fixed map, we never open anything on disk.
  const normalized = path.posix.normalize(requested);
  const content = db.virtualFiles[normalized];
  if (!content) {
    return res.status(404).json({ error: 'File not found in sandbox', requested: normalized });
  }
  res.json({ path: normalized, content });
});

module.exports = router;
