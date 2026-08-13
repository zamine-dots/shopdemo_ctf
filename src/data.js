const bcrypt = require('bcryptjs');
const flags = require('./utils/flags');

// --- XOR "encryption" helper used for the final flag artifact -------------
function xorEncode(text, key) {
  const out = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
  }
  return out.toString('base64');
}

const FINAL_KEY = 'northwind-7'; // the "cipher key" hidden in Charlie's private note
const finalCipherText = xorEncode(
  `Congratulations, you chained every weakness together.\n${flags.FINAL_FLAG}\n`,
  FINAL_KEY
);

// --- Users ------------------------------------------------------------
// Passwords are bcrypt-hashed at startup (see hashSync calls below).
const users = [
  {
    id: 1,
    username: 'alice',
    passwordHash: bcrypt.hashSync('alice123', 8),
    role: 'user',
    email: 'alice@shopdemo.local',
    displayName: 'Alice',
  },
  {
    id: 2,
    username: 'bob',
    // Bob's real password is unknown to players -- they must reach it via
    // the predictable password-reset token (Flag 4).
    passwordHash: bcrypt.hashSync('b0b_super_secret_' + Math.random().toString(36), 8),
    role: 'user',
    email: 'bob@shopdemo.local',
    displayName: 'Bob',
  },
  {
    id: 3,
    username: 'charlie',
    passwordHash: bcrypt.hashSync('charlie_pw_' + Math.random().toString(36), 8),
    role: 'user',
    email: 'charlie@shopdemo.local',
    displayName: 'Charlie',
  },
  {
    id: 4,
    username: 'admin',
    passwordHash: bcrypt.hashSync('admin_pw_' + Math.random().toString(36), 8),
    role: 'admin',
    email: 'admin@shopdemo.local',
    displayName: 'Site Admin',
  },
];

// --- Notes (private "sticky notes" resource, vulnerable to IDOR) ------
const notes = [
  {
    id: 1,
    ownerId: 1,
    title: 'Grocery list',
    body: 'Milk, eggs, bread. Nothing exciting here.',
  },
  {
    id: 2,
    ownerId: 2,
    title: "Bob's reminder",
    body:
      `Reset my password again and I swear I'm filing a ticket with IT.\n` +
      `Also: ${flags.FLAG4_AUTH_WEAKNESS}\n` +
      `(Side note to self -- the /api/me endpoint accepts way more fields than it should. Told the admin, they said they'd fix it "next sprint".)`,
  },
  {
    id: 3,
    ownerId: 3,
    title: "Charlie's private vault notes",
    body:
      `${flags.FLAG3_IDOR}\n\n` +
      `Reminder to self: the quarterly export cipher key is "${FINAL_KEY}". ` +
      `Don't lose it again like last time.`,
  },
  {
    id: 4,
    ownerId: 4,
    title: 'Admin scratchpad',
    body: 'Rotate the backup encryption key before the board meeting. -admin',
  },
];

// --- Password reset tokens (Flag 4: predictable/weak token generation) --
// Token = base64("username:epochMinute"). There is no server-side secret
// and no per-request randomness: the token is entirely *derived*, not
// *issued*. This means a player who requests a reset for their OWN
// account and notices the pattern can compute a valid token for ANY
// other username, for the current minute, without that user ever
// receiving anything. The server validates by RE-DERIVING the expected
// token rather than looking up something it stored -- which is exactly
// why this is exploitable.
const RESET_WINDOW_MINUTES = 2; // small tolerance for clock/round-trip drift

function issueResetToken(username) {
  const epochMinute = Math.floor(Date.now() / 60000);
  const raw = `${username}:${epochMinute}`;
  return Buffer.from(raw).toString('base64');
}

function consumeResetToken(token) {
  let decoded;
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8');
  } catch (e) {
    return null;
  }
  const idx = decoded.lastIndexOf(':');
  if (idx === -1) return null;
  const username = decoded.slice(0, idx);
  const epochMinute = parseInt(decoded.slice(idx + 1), 10);
  if (!username || Number.isNaN(epochMinute)) return null;

  const nowMinute = Math.floor(Date.now() / 60000);
  if (Math.abs(nowMinute - epochMinute) > RESET_WINDOW_MINUTES) return null;

  const user = users.find(u => u.username === username);
  if (!user) return null;

  return username;
}

// --- Admin audit log (Flag 6) ------------------------------------------
const auditLog = [
  { ts: '2026-06-01T09:12:03Z', actor: 'admin', action: 'LOGIN_SUCCESS' },
  { ts: '2026-06-01T09:14:47Z', actor: 'admin', action: 'USER_ROLE_UPDATE', detail: 'set bob role=user (reverted accidental promotion)' },
  { ts: '2026-06-02T11:02:19Z', actor: 'admin', action: 'CONFIG_CHANGE', detail: 'disabled legacy /api/dev/* routes' },
  { ts: '2026-06-03T08:47:00Z', actor: 'system', action: 'BACKUP_EXPORT', detail: 'generated encrypted quarterly export -> /app/data/internal/q3-report-DRAFT.enc (cipher: XOR stream, key held by finance team)' },
  { ts: '2026-06-03T08:47:05Z', actor: 'system', action: 'NOTE', detail: `Internal audit reference: ${flags.FLAG6_ADMIN_PANEL}` },
  { ts: '2026-06-05T16:00:00Z', actor: 'admin', action: 'LOGIN_FAILED', detail: 'source IP flagged by WAF (false positive, dev testing)' },
];

// --- Sandboxed virtual filesystem for admin file-preview (Flag 7) ------
// This is NEVER resolved against the real host filesystem -- it is a
// pure in-memory map keyed by virtual path.
const virtualFiles = {
  '/app/data/reports/monthly-summary.txt':
    'Monthly summary: sales up 4%, support tickets down 12%. Nothing sensitive here.',
  '/app/data/reports/README.txt':
    'Reports are auto-generated every Monday. See /app/data/internal/ for restricted material.',
  '/app/data/internal/README.txt':
    `Internal directory -- admin eyes only.\n${flags.FLAG7_ADMIN_VULN}\n` +
    `See also q3-report-DRAFT.enc in this directory (encrypted, ask finance for the key).`,
  '/app/data/internal/q3-report-DRAFT.enc': finalCipherText,
  '/app/data/internal/old-notes.txt.bak':
    'TODO: remember to actually delete this backup file someday.',
};

module.exports = {
  users,
  notes,
  auditLog,
  virtualFiles,
  issueResetToken,
  consumeResetToken,
  xorEncode,
};
