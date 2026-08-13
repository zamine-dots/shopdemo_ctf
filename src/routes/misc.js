const express = require('express');
const router = express.Router();
const flags = require('../utils/flags');

// --- Flag 1: hidden route discoverable via directory brute-forcing ------
// "/healthcheck" is common enough to appear in most wordlists
// (dirsearch's default list, SecLists common.txt, etc.) but is not linked
// from anywhere in the UI or robots.txt.
router.get('/healthcheck', (req, res) => {
  res.type('text/plain').send(
    [
      'ShopDemo internal health probe',
      'status: ok',
      'build: shopdemo-2026.06.03-rc2',
      '',
      flags.FLAG1_DIR_DISCOVERY,
      '',
      '# engineering note (leave for now, remove before real launch):',
      '# CI still has the repo checked out under webroot at /.git -- someone',
      '# please fix the deploy script so that stops happening.',
    ].join('\n')
  );
});

// --- Decoys: paths that exist but are forbidden (realistic noise) -------
const forbiddenPaths = [
  '/admin', '/internal', '/debug', '/backup', '/dev', '/test', '/staging',
  '/api/admin', '/console', '/management', '/private', '/old',
  '/phpmyadmin', '/wp-admin', '/.env', '/server-status', '/actuator',
];
forbiddenPaths.forEach(p => {
  router.all(p, (req, res) => res.status(403).send('Forbidden'));
});

// --- Decoys: routes that exist, return 200, but lead nowhere -------------
router.get('/api/version', (req, res) => res.json({ version: '2.3.1', codename: 'northwind' }));

router.get('/api/legacy/v1/status', (req, res) =>
  res.json({ deprecated: true, message: 'Use /api/version instead.' })
);

router.get('/api/ping', (req, res) => res.json({ pong: true }));

// A harmless debug endpoint -- looks interesting, does nothing dangerous.
router.get('/api/debug/echo', (req, res) => {
  res.json({ echoed: req.query, note: 'debug echo endpoint, no auth required, read-only' });
});

// Decoy backup file references (won't actually exist as static files).
router.get('/backup.zip', (req, res) => res.status(404).send('Not found'));
router.get('/db_backup_2025.sql', (req, res) => res.status(404).send('Not found'));

module.exports = router;
