const express = require('express');
const router = express.Router();
const db = require('../data');
const { requireAuth } = require('../middleware/auth');

// List only the caller's own notes (this part is done correctly).
router.get('/api/notes', requireAuth, (req, res) => {
  const mine = db.notes
    .filter(n => n.ownerId === req.user.sub)
    .map(n => ({ id: n.id, title: n.title }));
  res.json(mine);
});

// VULNERABLE: fetching a single note by id never checks ownership.
router.get('/api/notes/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const note = db.notes.find(n => n.id === id);
  if (!note) return res.status(404).json({ error: 'Note not found' });

  // NOTE: no check that note.ownerId === req.user.sub -- this is the bug.
  res.json({ id: note.id, title: note.title, body: note.body });
});

module.exports = router;
