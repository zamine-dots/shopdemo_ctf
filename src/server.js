const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const notesRoutes = require('./routes/notes');
const adminRoutes = require('./routes/admin');
const miscRoutes = require('./routes/misc');
const { environmentIsolation } = require('./middleware/environment');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(environmentIsolation);

// Realistic-looking headers / minor info leaks (harmless flavor, not a flag)
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'ShopDemo');
  res.setHeader('X-Build-Id', 'shopdemo-2026.06.03-rc2');
  next();
});

// robots.txt deliberately does NOT reference /healthcheck or /.git
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    ['User-agent: *', 'Disallow: /admin', 'Disallow: /internal', 'Disallow: /api/'].join('\n')
  );
});

// --- Exposed .git directory (Flag 2) -------------------------------
// A real (small, un-packed) git repository lives on disk and is served
// as plain static files, exactly like a misconfigured web server that
// accidentally ships its .git folder to production.
app.use(
  '/.git',
  express.static(path.join(__dirname, '..', 'git-source', '.git'), {
    dotfiles: 'allow',
    index: false,
  })
);

app.use(miscRoutes);
app.use(authRoutes);
app.use(notesRoutes);
app.use(adminRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`ShopDemo CTF running on port ${PORT}`);
});
