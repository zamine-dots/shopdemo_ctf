const crypto = require('crypto');
const { createEnvironment } = require('../data');

const COOKIE_NAME = 'challenge_env';
const ENV_TTL_MS = Number(process.env.ENV_TTL_HOURS || 12) * 60 * 60 * 1000;
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', maxAge: ENV_TTL_MS };
const environments = new Map();
let lastCleanup = 0;

function environmentIsolation(req, res, next) {
  const now = Date.now();
  if (now - lastCleanup > 10 * 60 * 1000) {
    for (const [id, environment] of environments) {
      if (now - environment.lastSeen > ENV_TTL_MS) environments.delete(id);
    }
    lastCleanup = now;
  }

  let id = req.cookies && req.cookies[COOKIE_NAME];
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) id = crypto.randomUUID();

  let environment = environments.get(id);
  if (!environment) {
    environment = {
      instanceId: crypto.randomUUID(),
      data: createEnvironment(),
      lastSeen: now,
    };
    environments.set(id, environment);
  }

  environment.lastSeen = now;
  req.environmentId = id;
  req.environmentInstanceId = environment.instanceId;
  req.db = environment.data;
  res.cookie(COOKIE_NAME, id, COOKIE_OPTS);
  next();
}

module.exports = { environmentIsolation };
