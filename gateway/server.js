const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const httpProxy = require('http-proxy');

const LISTEN_PORT = Number(process.env.PORT || 3000);
const TARGET_IMAGE = process.env.TARGET_IMAGE || 'shopdemo-ctf:latest';
const NETWORK = process.env.DOCKER_NETWORK || 'shopdemo-ctf-network';
const MAX_ENVIRONMENTS = Number(process.env.MAX_ENVIRONMENTS || 50);
const IDLE_TTL_MS = Number(process.env.IDLE_TTL_HOURS || 12) * 60 * 60 * 1000;
const STATE_FILE = process.env.STATE_FILE || '/var/lib/shopdemo-gateway/environments.json';
const COOKIE_NAME = 'shopdemo_env';
const COOKIE_RE = /^[a-f0-9]{32}$/;
const proxy = httpProxy.createProxyServer({ xfwd: true });
const environments = new Map();
let lastStateSave = 0;

proxy.on('proxyRes', (proxyResponse, request) => {
  if (!request.shopdemoSetCookie) return;
  const upstreamCookies = proxyResponse.headers['set-cookie'] || [];
  proxyResponse.headers['set-cookie'] = [...upstreamCookies, request.shopdemoSetCookie];
});

function docker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim())));
  });
}

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    for (const environment of saved) environments.set(environment.id, environment);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not load gateway state:', error.message);
  }
}

function saveState() {
  fs.mkdirSync(require('path').dirname(STATE_FILE), { recursive: true });
  const state = [...environments.values()].map(({ id, container, lastSeen }) => ({ id, container, lastSeen }));
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  lastStateSave = Date.now();
}

function cookieValue(request) {
  const header = request.headers.cookie || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match && COOKIE_RE.test(match[1]) ? match[1] : null;
}

function waitForEnvironment(container) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts += 1;
      const request = http.get(`http://${container}:3000/healthcheck`, response => {
        response.resume();
        resolve();
      });
      request.on('error', () => {
        if (attempts >= 30) return reject(new Error('Participant environment did not become ready'));
        setTimeout(check, 200);
      });
      request.setTimeout(1000, () => request.destroy());
    };
    check();
  });
}

async function ensureEnvironment(id) {
  let environment = environments.get(id);
  if (environment) {
    environment.lastSeen = Date.now();
    return environment;
  }
  if (environments.size >= MAX_ENVIRONMENTS) throw new Error('Participant capacity reached');

  const container = `shopdemo-player-${id}`;
  try {
    await docker([
      'run', '-d', '--name', container,
      '--network', NETWORK,
      '--label', 'shopdemo.role=player',
      '--label', `shopdemo.environment=${id}`,
      '--restart', 'unless-stopped',
      '--cpus', process.env.PLAYER_CPUS || '0.50',
      '--memory', process.env.PLAYER_MEMORY || '256m',
      '-e', 'PORT=3000',
      TARGET_IMAGE,
    ]);
    await waitForEnvironment(container);
  } catch (error) {
    try { await docker(['rm', '-f', container]); } catch (cleanupError) {}
    throw error;
  }
  environment = { id, container, lastSeen: Date.now() };
  environments.set(id, environment);
  saveState();
  return environment;
}

function proxyRequest(request, response, environment) {
  proxy.web(request, response, {
    target: `http://${environment.container}:3000`,
    changeOrigin: true,
  }, error => {
    console.error(`Proxy failed for ${environment.container}:`, error.message);
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain' });
    response.end('Participant environment is unavailable. Please retry.');
  });
}

async function handle(request, response) {
  let id = cookieValue(request);
  if (!id) {
    id = crypto.randomBytes(16).toString('hex');
  }
  try {
    const environment = await ensureEnvironment(id);
    request.shopdemoSetCookie = `${COOKIE_NAME}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(IDLE_TTL_MS / 1000)}`;
    if (Date.now() - lastStateSave > 60 * 1000) saveState();
    proxyRequest(request, response, environment);
  } catch (error) {
    response.writeHead(error.message === 'Participant capacity reached' ? 503 : 502, { 'Content-Type': 'text/plain' });
    response.end(error.message);
  }
}

async function cleanup() {
  const cutoff = Date.now() - IDLE_TTL_MS;
  for (const [id, environment] of environments) {
    if (environment.lastSeen < cutoff) {
      try { await docker(['rm', '-f', environment.container]); } catch (error) { console.error(error.message); }
      environments.delete(id);
    }
  }
  saveState();
}

async function reconcile() {
  for (const [id, environment] of environments) {
    try { await docker(['inspect', environment.container]); } catch (error) {
      environments.delete(id);
    }
  }
  saveState();
}

loadState();
reconcile().catch(error => console.error('Gateway reconciliation failed:', error.message));
setInterval(() => cleanup().catch(error => console.error('Gateway cleanup failed:', error.message)), 10 * 60 * 1000).unref();

http.createServer(handle).listen(LISTEN_PORT, () => {
  console.log(`ShopDemo gateway listening on port ${LISTEN_PORT}`);
});

process.on('SIGTERM', () => process.exit(0));
