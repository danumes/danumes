/* ============================================================
   DANUMES · server.js v24 (Turso)
   ============================================================ */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { createClient } = require('@libsql/client');
const botService = require('./botService');
const emailService = require('./emailService');
const googleOAuthService = require('./googleOAuthService');

/* ---------- .ENV ---------- */
if (fs.existsSync('.env')) {
  fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

/* ---------- TURSO ---------- */
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('❌ TURSO_DATABASE_URL или TURSO_AUTH_TOKEN не заданы');
  process.exit(1);
}

const db = createClient({
  url: TURSO_URL,
  authToken: TURSO_TOKEN
});

console.log('✅ Turso подключена:', TURSO_URL);

/* ---------- SQL HELPERS (ASYNC) ---------- */
async function dbGet(sql, params = []) {
  try {
    const result = await db.execute({ sql, args: params });
    return result.rows[0] || null;
  } catch (e) { console.error('dbGet:', e.message); return null; }
}

async function dbAll(sql, params = []) {
  try {
    const result = await db.execute({ sql, args: params });
    return result.rows || [];
  } catch (e) { console.error('dbAll:', e.message); return []; }
}

async function dbRun(sql, params = []) {
  try {
    const result = await db.execute({ sql, args: params });
    return result;
  } catch (e) {
    console.error('dbRun FAIL:', e.message);
    console.error('  SQL:', sql);
    console.error('  ARGS:', JSON.stringify(params).slice(0, 300));
    return null;
  }
}

async function dbExec(sql) {
  try {
    await db.executeMultiple(sql);
    return true;
  } catch (e) { console.error('dbExec:', e.message); return false; }
}

/* ---------- СОЗДАНИЕ ТАБЛИЦ ---------- */
async function initTables() {
  const schema = `
    CREATE TABLE IF NOT EXISTS accounts (
      username TEXT PRIMARY KEY,
      username_display TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      bio TEXT DEFAULT '',
      birthday TEXT DEFAULT '',
      email TEXT DEFAULT '',
      email_verified INTEGER DEFAULT 0,
      phone TEXT DEFAULT '',
      phone_verified INTEGER DEFAULT 0,
      color TEXT NOT NULL,
      avatar TEXT,
      avatar_url TEXT,
      created_at INTEGER NOT NULL,
      is_admin INTEGER DEFAULT 0,
      is_verified INTEGER DEFAULT 0,
      is_banned INTEGER DEFAULT 0,
      ban_reason TEXT DEFAULT '',
      banned_at INTEGER,
      vk_linked INTEGER DEFAULT 0,
      google_id TEXT,
      google_email TEXT,
      email_login_created INTEGER DEFAULT 0,
      vk_oauth_created INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      type TEXT DEFAULT 'user',
      user_id TEXT,
      username TEXT,
      color TEXT,
      avatar TEXT,
      avatar_url TEXT,
      text TEXT DEFAULT '',
      time INTEGER NOT NULL,
      reactions TEXT DEFAULT '{}',
      reply_to TEXT,
      edited INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0,
      deleted_for TEXT DEFAULT '[]',
      attachments TEXT,
      sticker TEXT,
      sticker_url TEXT,
      sticker_id TEXT,
      mentions TEXT,
      poll TEXT,
      censored INTEGER DEFAULT 0,
      call_type TEXT,
      call_status TEXT,
      duration INTEGER,
      forwarded_from TEXT,
      scheduled_for INTEGER,
      pending_delete INTEGER DEFAULT 0,
      pending_delete_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, time);

    CREATE TABLE IF NOT EXISTS groups_t (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      rules TEXT DEFAULT '',
      avatar_url TEXT,
      type TEXT DEFAULT 'group',
      owner TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      username TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      PRIMARY KEY (group_id, username)
    );

    CREATE TABLE IF NOT EXISTS settings (
      username TEXT PRIMARY KEY,
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      joined_at INTEGER,
      last_active INTEGER,
      ua TEXT,
      token TEXT UNIQUE,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS pinned_chats (
      username TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      PRIMARY KEY (username, chat_id)
    );

    CREATE TABLE IF NOT EXISTS muted_chats (
      username TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      PRIMARY KEY (username, chat_id)
    );

    CREATE TABLE IF NOT EXISTS pinned_msgs (
      username TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      message_id TEXT,
      PRIMARY KEY (username, chat_id)
    );

    CREATE TABLE IF NOT EXISTS contacts (
      owner TEXT NOT NULL,
      contact TEXT NOT NULL,
      PRIMARY KEY (owner, contact)
    );

    CREATE TABLE IF NOT EXISTS privacy (
      username TEXT PRIMARY KEY,
      last_seen TEXT DEFAULT 'all',
      online TEXT DEFAULT 'all',
      read_receipts TEXT DEFAULT 'all'
    );

    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS join_requests (
      group_id TEXT NOT NULL,
      username TEXT NOT NULL,
      requested_by TEXT,
      requested_at INTEGER,
      PRIMARY KEY (group_id, username)
    );

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      url TEXT NOT NULL,
      mime TEXT DEFAULT 'image/jpeg',
      time INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stories_time ON stories(time);

    CREATE TABLE IF NOT EXISTS story_views (
      story_id TEXT NOT NULL,
      username TEXT NOT NULL,
      viewed_at INTEGER,
      PRIMARY KEY (story_id, username)
    );

    CREATE TABLE IF NOT EXISTS last_seen (
      username TEXT PRIMARY KEY,
      time INTEGER
    );

    CREATE TABLE IF NOT EXISTS vk_links (
      vk_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      vk_username TEXT,
      vk_first_name TEXT,
      vk_last_name TEXT,
      linked_at INTEGER,
      notify_enabled INTEGER DEFAULT 1,
      phone TEXT,
      phone_verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS vk_link_codes (
      code TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at INTEGER,
      expires_at INTEGER,
      used INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS vk_login_codes (
      code TEXT PRIMARY KEY,
      status TEXT DEFAULT 'pending',
      created_at INTEGER,
      expires_at INTEGER,
      vk_id TEXT,
      username TEXT,
      used_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS email_login_codes (
      email TEXT,
      code TEXT,
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      created_at INTEGER,
      expires_at INTEGER,
      used_at INTEGER,
      PRIMARY KEY (email, code)
    );

    CREATE TABLE IF NOT EXISTS sticker_packs (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      cover_url TEXT,
      created_at INTEGER NOT NULL,
      is_public INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS stickers (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      url TEXT NOT NULL,
      emoji TEXT DEFAULT '🎨',
      position INTEGER DEFAULT 0,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      text TEXT,
      from_username TEXT,
      time INTEGER,
      sent_to INTEGER
    );
  `;

  try {
    const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      try {
        await db.execute(stmt);
      } catch (e) {
        if (!e.message.includes('already exists')) {
          console.error('SQL init error:', e.message);
        }
      }
    }
    console.log('✅ Таблицы инициализированы в Turso');
  } catch (e) {
    console.error('❌ Ошибка инициализации таблиц:', e.message);
  }
}

/* ---------- EXPRESS ---------- */
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 25e6 });

app.use(express.static(path.join(__dirname, 'public')));

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 8);
    cb(null, 'f_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

app.post('/upload', (req, res) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    if (!req.file) return res.status(400).json({ ok: false, error: 'no-file' });
    res.json({
      ok: true,
      url: '/uploads/' + req.file.filename,
      name: req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype
    });
  });
});

/* ---------- ПРЕВЬЮ ССЫЛОК ---------- */
const previewCache = new Map();

app.get('/preview', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return res.json({ ok: false, error: 'bad-url' });
  const cached = previewCache.get(url);
  if (cached && Date.now() - cached.time < 3600 * 1000) return res.json(cached.data);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DanumesBot/1.0)', 'Accept': 'text/html,application/xhtml+xml' }
    });
    clearTimeout(timeout);
    if (!resp.ok) return res.json({ ok: false, error: 'http-' + resp.status });
    const ctype = resp.headers.get('content-type') || '';
    if (!ctype.includes('text/html')) return res.json({ ok: false, error: 'not-html' });

    const reader = resp.body.getReader();
    let html = '';
    let received = 0;
    const decoder = new TextDecoder('utf-8');
    while (received < 80000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      received += value.length;
    }
    try { reader.cancel(); } catch (e) {}

    const getMeta = prop => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
      const m = html.match(re);
      if (m) return m[1].trim();
      const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
      const m2 = html.match(re2);
      return m2 ? m2[1].trim() : '';
    };
    const getTitle = () => {
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      return m ? m[1].trim() : '';
    };

    let title = (getMeta('og:title') || getTitle() || '').slice(0, 200);
    let description = (getMeta('og:description') || getMeta('description') || '').slice(0, 300);
    let image = getMeta('og:image') || getMeta('twitter:image') || '';
    const siteName = getMeta('og:site_name') || new URL(url).hostname;

    if (image && !/^https?:\/\//i.test(image)) {
      if (image.startsWith('//')) image = 'https:' + image;
      else {
        const u = new URL(url);
        image = image.startsWith('/') ? (u.origin + image) : (u.origin + '/' + image);
      }
    }

    const result = { ok: true, url, title, description, image, siteName };
    previewCache.set(url, { data: result, time: Date.now() });
    if (previewCache.size > 200) previewCache.delete(previewCache.keys().next().value);
    res.json(result);
  } catch (e) {
    res.json({ ok: false, error: e.message || 'fetch-error' });
  }
});

/* ---------- GOOGLE OAUTH ---------- */
const googleStates = new Map();
const pendingOAuthLogins = new Map();

setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  googleStates.forEach((data, state) => { if (data.created < cutoff) googleStates.delete(state); });
}, 5 * 60 * 1000);
setInterval(() => {
  const now = Date.now();
  pendingOAuthLogins.forEach((data, token) => { if (data.expiresAt < now) pendingOAuthLogins.delete(token); });
}, 2 * 60 * 1000);

app.get('/auth/google', (req, res) => {
  if (!googleOAuthService.isConfigured()) return res.status(500).send('Google OAuth не настроен');
  const state = crypto.randomBytes(16).toString('hex');
  googleStates.set(state, { created: Date.now() });
  const url = googleOAuthService.generateAuthUrl(state);
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const error = req.query.error;
  if (error) return res.redirect('/?google_error=' + encodeURIComponent(error));
  if (!code || !state) return res.redirect('/?google_error=missing_code');
  if (!googleStates.has(state)) return res.redirect('/?google_error=invalid_state');
  googleStates.delete(state);

  const result = await googleOAuthService.handleCallback(code);
  if (!result.ok) return res.redirect('/?google_error=' + encodeURIComponent(result.error));
  const gUser = result.user;
  if (!gUser.email) return res.redirect('/?google_error=no_email');

  let acc = await dbGet('SELECT * FROM accounts WHERE google_id = ?', [String(gUser.id)]);
  if (!acc) {
    acc = await dbGet('SELECT * FROM accounts WHERE email = ?', [gUser.email]);
    if (acc) {
      await dbRun('UPDATE accounts SET google_id=?, google_email=? WHERE username=?',
        [String(gUser.id), gUser.email, acc.username]);
    }
  }

  let username;
  let isNew = false;
  if (acc) {
    username = acc.username;
    if (acc.is_banned) return res.redirect('/?google_error=banned');
  } else {
    username = await createAccountFromGoogle(gUser);
    if (!username) return res.redirect('/?google_error=create_failed');
    isNew = true;
  }

  const loginToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000;
  pendingOAuthLogins.set(loginToken, { username, isNew, created: Date.now(), expiresAt });
  res.redirect('/?google_login=' + loginToken);
});

app.get('*', (req, res, next) => {
  if (
    req.path.startsWith('/socket.io') ||
    req.path.startsWith('/upload') ||
    req.path.startsWith('/uploads') ||
    req.path.startsWith('/preview') ||
    req.path.startsWith('/auth') ||
    req.path.startsWith('/api')
  ) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ---------- УТИЛИТЫ ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return check === hash;
  } catch { return false; }
}

const COLORS = ['#a855f7','#ec4899','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#d946ef','#14b8a6','#f97316','#3b82f6','#84cc16'];
const randColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
const chatKey = (a, b) => [a, b].sort().join('::');
const uid = prefix => (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

/* ---------- БАНВОРД ---------- */
const BAD_WORDS = [
  'бля','бляд','блят','блять','блядь','сука','сучк','хуй','хуя','хую','хуе','хуё','хер',
  'пизд','пизда','пиздец','пиздёж','еба','ёба','ебал','ебан','ебуч','ебат','ебёт','ебет',
  'мудак','мудил','мраз','мразь','гандон','гондон','долбоеб','долбоёб','пидор','пидар','пидр',
  'шлюх','шлюшк','шалав','проститут','говн','говно','говнюк','дерьм','срать','срак','срака',
  'жоп','жопа','уебан','уёбан','уебищ','уёбищ','залуп','манда','мандав','педик',
  'педофил','насильник','насилу','изнасил','трах','трахн','отсос','нахуй','нахуя',
  'похуй','похую','охуе','охуи','ахуе','ахуи','нихуя','нехуй','нехуя','дохуя','дохуй'
];
const BAD_PATTERNS = BAD_WORDS.map(w => new RegExp(w, 'gi'));
function hasBadWords(text) {
  const t = String(text || '').toLowerCase();
  return BAD_PATTERNS.some(re => { re.lastIndex = 0; return re.test(t); });
}
function filterBadWords(text) {
  let t = String(text || '');
  BAD_PATTERNS.forEach(re => { re.lastIndex = 0; t = t.replace(re, m => '•'.repeat(m.length)); });
  return t;
}

/* ---------- JSON PARSE SAFE ---------- */
function parseJSON(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch (e) { return fallback; }
}

/* ---------- IN-MEMORY ---------- */
const users = new Map();
const onlineByUsername = new Map();
const activeCalls = new Map();
const socketToCall = new Map();

/* ---------- МАППИНГИ ---------- */
function accFromDb(row, online) {
  if (!row) return null;
  return {
    username: row.username_display || row.username,
    usernameLower: row.username,
    bio: row.bio || '',
    birthday: row.birthday || '',
    email: row.email || '',
    emailVerified: !!row.email_verified,
    phone: row.phone || '',
    phoneVerified: !!row.phone_verified,
    color: row.color,
    avatar: row.avatar || null,
    avatarUrl: row.avatar_url || null,
    createdAt: row.created_at,
    online: !!online,
    isAdmin: !!row.is_admin,
    isVerified: !!row.is_verified,
    isBanned: !!row.is_banned,
    banReason: row.ban_reason || '',
    vkLinked: !!row.vk_linked
  };
}

function publicUser(acc, viewerIsAdmin) {
  if (!acc) return null;
  const u = {
    username: acc.username,
    usernameLower: acc.usernameLower,
    bio: acc.bio,
    birthday: acc.birthday,
    color: acc.color,
    avatar: acc.avatar,
    avatarUrl: acc.avatarUrl,
    createdAt: acc.createdAt,
    online: !!acc.online,
    isAdmin: !!acc.isAdmin,
    isVerified: !!acc.isVerified,
    vkLinked: !!acc.vkLinked
  };
  if (viewerIsAdmin) {
    u.isBanned = !!acc.isBanned;
    u.banReason = acc.banReason || '';
  }
  return u;
}

async function getAllUsers(meKey) {
  const rows = await dbAll('SELECT * FROM accounts');
  const meAcc = meKey ? rows.find(r => r.username === meKey) : null;
  const meIsAdmin = meAcc && meAcc.is_admin;
  return rows.map(row => {
    const online = isOnline(row.username);
    const full = accFromDb(row, online);
    const pub = publicUser(full, meIsAdmin);
    if (row.username === meKey) {
      pub.isBanned = !!row.is_banned;
      pub.banReason = row.ban_reason || '';
      pub.email = row.email || '';
      pub.phone = row.phone || '';
      pub.emailVerified = !!row.email_verified;
      pub.phoneVerified = !!row.phone_verified;
    }
    return pub;
  });
}

function isOnline(usernameLower) {
  const set = onlineByUsername.get(usernameLower);
  return !!(set && set.size > 0);
}

/* ---------- EMIT ---------- */
function emitToUser(username, event, payload) {
  const key = String(username).toLowerCase();
  const set = onlineByUsername.get(key);
  if (!set) return;
  set.forEach(sid => {
    const s = io.sockets.sockets.get(sid);
    if (s) s.emit(event, payload);
  });
}

async function emitToChat(chatId, event, payload) {
  if (chatId.startsWith('g_')) {
    const members = await dbAll('SELECT username FROM group_members WHERE group_id=?', [chatId]);
    members.forEach(m => emitToUser(m.username, event, payload));
  } else {
    const [a, b] = chatId.split('::');
    emitToUser(a, event, payload);
    emitToUser(b, event, payload);
  }
}

async function broadcastUsersUpdate() {
  const all = await getAllUsers(null);
  for (const [, sid] of users) {
    const s = io.sockets.sockets.get(sid.id);
    if (s) s.emit('users:update', all);
  }
}

/* ============================================================
   ВСПОМОГАТЕЛЬНАЯ: авторизация сокета по токену из handshake
   ============================================================ */
async function tryAuthByToken(socket, token) {
  const sess = await dbGet('SELECT * FROM sessions WHERE token=?', [token]);
  if (!sess) return null;
  if (sess.expires_at && sess.expires_at < Date.now()) return null;
  const row = await dbGet('SELECT * FROM accounts WHERE username=?', [sess.username]);
  if (!row || row.is_banned) return null;
  registerSocket(socket, row, token, sess.expires_at);
  await dbRun('UPDATE sessions SET last_active=? WHERE token=?', [Date.now(), token]);
  return row;
}

io.on('connection', socket => {
  console.log('🟢 connect', socket.id);

  /* ---------- АВТОМАТИЧЕСКАЯ АВТОРИЗАЦИЯ ЧЕРЕЗ handshake.auth ---------- */
  const authToken = socket.handshake?.auth?.token;
  if (authToken) {
    (async () => {
      try {
        const row = await tryAuthByToken(socket, authToken);
        if (!row) {
          console.log('⚠️  socket auth: не удалось авторизоваться по токену');
          return;
        }
        const payload = await buildRegisteredPayload(row.username);
        socket.emit('registered', {
          me: { ...accFromDb(row, true), id: socket.id },
          users: await getAllUsers(row.username),
          ...payload
        });
        await broadcastUsersUpdate();
        console.log('🔑 socket auth: вошёл', row.username);
      } catch (e) {
        console.error('socket auth:', e.message);
      }
    })();
  }

  /* ============================================================
     РЕГИСТРАЦИЯ
     ============================================================ */
  socket.on('auth:register', async ({ username, password, email, phone }, cb) => {
    try {
      const uname = String(username || '').trim();
      const pass = String(password || '');
      const em = String(email || '').trim().toLowerCase();
      const ph = String(phone || '').trim().replace(/[^\d+]/g, '');

      if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) return cb({ ok: false, error: '3–20 символов, латиница/цифры/_' });
      if (pass.length < 4) return cb({ ok: false, error: 'Пароль минимум 4 символа' });
      const key = uname.toLowerCase();
      if (await dbGet('SELECT 1 FROM accounts WHERE username=?', [key])) return cb({ ok: false, error: 'Юзернейм занят' });

      if (em) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return cb({ ok: false, error: 'Некорректный email' });
        if (await dbGet('SELECT 1 FROM accounts WHERE email=?', [em])) return cb({ ok: false, error: 'Email уже используется' });
      }
      if (ph) {
        if (await dbGet('SELECT 1 FROM accounts WHERE phone=?', [ph])) return cb({ ok: false, error: 'Телефон уже используется' });
      }

      await dbRun(`INSERT INTO accounts (username, username_display, password_hash, bio, birthday, email, email_verified,
        phone, phone_verified, color, avatar, avatar_url, created_at, is_admin, is_verified, is_banned, vk_linked)
        VALUES (?, ?, ?, '', '', ?, 0, ?, 0, ?, NULL, NULL, ?, 0, 0, 0, 0)`,
        [key, uname, hashPassword(pass), em, ph, randColor(), Date.now()]);

      await dbRun('INSERT OR IGNORE INTO privacy (username) VALUES (?)', [key]);
      await dbRun('INSERT OR IGNORE INTO settings (username, data) VALUES (?, ?)', [key, JSON.stringify({
        theme: 'dark', accent: 'violet', sound: true, notifications: true,
        density: 'normal', fontSize: 14, wallpaper: null, quietHours: false, themeMode: 'manual',
        soundType: 'soft', vibration: true
      })]);

      console.log('✅ Зарегистрирован:', uname);
      cb({ ok: true });
    } catch (e) {
      console.error('register', e);
      cb({ ok: false, error: 'Ошибка сервера' });
    }
  });

  /* ============================================================
     ВХОД
     ============================================================ */
  socket.on('auth:login', async ({ login, password }, cb) => {
    try {
      const raw = String(login || '').trim();
      const pass = String(password || '');
      if (!raw || !pass) return cb({ ok: false, error: 'Заполни поля' });

      const lower = raw.toLowerCase();
      let row = await dbGet('SELECT * FROM accounts WHERE username=?', [lower]);
      if (!row && raw.includes('@')) row = await dbGet('SELECT * FROM accounts WHERE email=?', [lower]);
      if (!row && /^[\d+\s\-()]+$/.test(raw)) {
        const digits = raw.replace(/[^\d+]/g, '');
        row = await dbGet('SELECT * FROM accounts WHERE phone=?', [digits]);
      }

      if (!row) return cb({ ok: false, error: 'Пользователь не найден' });
      if (!verifyPassword(pass, row.password_hash)) return cb({ ok: false, error: 'Неверный пароль' });
      if (row.is_banned) return cb({ ok: false, error: 'Заблокирован' + (row.ban_reason ? ': ' + row.ban_reason : '') });

      const key = row.username;
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;

      registerSocket(socket, row, sessionToken, expiresAt);

      await dbRun('INSERT OR REPLACE INTO sessions (sid, username, joined_at, last_active, ua, token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['ws_' + crypto.randomBytes(6).toString('hex'), key, Date.now(), Date.now(), socket.handshake.headers['user-agent'] || 'unknown', sessionToken, expiresAt]);

      const payload = await buildRegisteredPayload(key);
      socket.emit('registered', {
        me: { ...accFromDb(row, true), id: socket.id },
        users: await getAllUsers(key),
        ...payload
      });

      await broadcastUsersUpdate();
      cb({ ok: true, user: { ...accFromDb(row, true), id: socket.id }, sessionToken, expiresAt });
      console.log('🔑 Вошёл:', key);
    } catch (e) {
      console.error('login', e);
      cb({ ok: false, error: 'Ошибка сервера' });
    }
  });

  /* ============================================================
     RESUME
     ============================================================ */
  socket.on('auth:resume', async ({ token }, cb) => {
    try {
      if (!token) return cb && cb({ ok: false });
      const sess = await dbGet('SELECT * FROM sessions WHERE token=?', [token]);
      if (!sess) return cb && cb({ ok: false, error: 'Сессия не найдена' });
      if (sess.expires_at && sess.expires_at < Date.now()) {
        await dbRun('DELETE FROM sessions WHERE token=?', [token]);
        return cb && cb({ ok: false, error: 'Сессия истекла' });
      }
      const key = sess.username;
      const row = await dbGet('SELECT * FROM accounts WHERE username=?', [key]);
      if (!row) return cb && cb({ ok: false, error: 'Аккаунт не найден' });
      if (row.is_banned) return cb && cb({ ok: false, error: 'Заблокирован' });

      registerSocket(socket, row, token, sess.expires_at);
      await dbRun('UPDATE sessions SET last_active=? WHERE token=?', [Date.now(), token]);

      const payload = await buildRegisteredPayload(key);
      socket.emit('registered', {
        me: { ...accFromDb(row, true), id: socket.id },
        users: await getAllUsers(key),
        ...payload
      });

      await broadcastUsersUpdate();
      if (cb) cb({ ok: true, user: { ...accFromDb(row, true), id: socket.id }, sessionToken: token });
      console.log('♻️  Возобновил:', key);
    } catch (e) {
      console.error('auth:resume', e);
      if (cb) cb({ ok: false });
    }
  });

  socket.on('auth:logout', async ({ token }, cb) => {
    try {
      if (token) await dbRun('DELETE FROM sessions WHERE token=?', [token]);
      if (cb) cb({ ok: true });
    } catch (e) { if (cb) cb({ ok: false }); }
  });

  /* ============================================================
     GOOGLE EXCHANGE
     ============================================================ */
  socket.on('auth:google-exchange', async ({ loginToken }, cb) => {
    try {
      if (!loginToken) return cb && cb({ ok: false });
      const data = pendingOAuthLogins.get(loginToken);
      if (!data) return cb && cb({ ok: false, error: 'invalid-token' });
      if (data.expiresAt < Date.now()) { pendingOAuthLogins.delete(loginToken); return cb && cb({ ok: false, error: 'expired' }); }
      pendingOAuthLogins.delete(loginToken);

      const username = data.username;
      const row = await dbGet('SELECT * FROM accounts WHERE username=?', [username]);
      if (!row) return cb && cb({ ok: false });

      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;
      registerSocket(socket, row, sessionToken, expiresAt);
      await dbRun('INSERT OR REPLACE INTO sessions (sid, username, joined_at, last_active, ua, token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['ws_' + crypto.randomBytes(6).toString('hex'), username, Date.now(), Date.now(), socket.handshake.headers['user-agent'] || 'unknown', sessionToken, expiresAt]);

      const payload = await buildRegisteredPayload(username);
      socket.emit('registered', {
        me: { ...accFromDb(row, true), id: socket.id },
        users: await getAllUsers(username),
        ...payload
      });
      await broadcastUsersUpdate();
      cb && cb({ ok: true, user: { ...accFromDb(row, true), id: socket.id }, sessionToken, expiresAt, isNew: data.isNew });
    } catch (e) {
      console.error('google-exchange:', e);
      cb && cb({ ok: false });
    }
  });

  /* ============================================================
     EMAIL КОДЫ
     ============================================================ */
  socket.on('auth:email-send-code', async ({ email }, cb) => {
    try {
      const em = String(email || '').trim().toLowerCase();
      if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return cb && cb({ ok: false, error: 'Некорректный email' });

      const recent = await dbGet('SELECT * FROM email_login_codes WHERE email=? ORDER BY created_at DESC LIMIT 1', [em]);
      if (recent && Date.now() - recent.created_at < 60 * 1000) {
        const wait = Math.ceil((60 * 1000 - (Date.now() - recent.created_at)) / 1000);
        return cb && cb({ ok: false, error: 'Подожди ' + wait + ' сек.' });
      }
      await dbRun('DELETE FROM email_login_codes WHERE email=?', [em]);

      const code = emailService.generateCode();
      const expiresAt = Date.now() + 10 * 60 * 1000;
      await dbRun('INSERT INTO email_login_codes (email, code, status, attempts, created_at, expires_at) VALUES (?, ?, "pending", 0, ?, ?)',
        [em, code, Date.now(), expiresAt]);

      const sent = await emailService.sendLoginCode(em, code);
      if (!sent.ok) return cb && cb({ ok: false, error: 'Не отправилось: ' + sent.error });
      console.log('📧 Email код →', em);
      cb && cb({ ok: true });
    } catch (e) {
      console.error('email-send-code:', e);
      cb && cb({ ok: false });
    }
  });

  socket.on('auth:email-verify', async ({ email, code }, cb) => {
    try {
      const em = String(email || '').trim().toLowerCase();
      const c = String(code || '').trim();
      if (!em || !c) return cb && cb({ ok: false, error: 'Заполни' });
      if (!/^\d{6}$/.test(c)) return cb && cb({ ok: false, error: '6 цифр' });

      const row = await dbGet('SELECT * FROM email_login_codes WHERE email=? AND code=?', [em, c]);
      if (!row) return cb && cb({ ok: false, error: 'Неверный код' });
      if (row.status === 'used') return cb && cb({ ok: false, error: 'Код использован' });
      if (row.status === 'expired' || row.expires_at < Date.now()) {
        await dbRun('UPDATE email_login_codes SET status="expired" WHERE email=? AND code=?', [em, c]);
        return cb && cb({ ok: false, error: 'Код истёк' });
      }
      await dbRun('UPDATE email_login_codes SET status="used", used_at=? WHERE email=? AND code=?', [Date.now(), em, c]);

      let acc = await dbGet('SELECT * FROM accounts WHERE email=?', [em]);
      let isNew = false;
      if (!acc) {
        const username = await createAccountFromEmail(em);
        if (!username) return cb && cb({ ok: false, error: 'Не удалось создать' });
        acc = await dbGet('SELECT * FROM accounts WHERE username=?', [username]);
        isNew = true;
      }
      if (!acc) return cb && cb({ ok: false });
      if (acc.is_banned) return cb && cb({ ok: false, error: 'Заблокирован' });

      const key = acc.username;
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;

      registerSocket(socket, acc, sessionToken, expiresAt);
      await dbRun('INSERT OR REPLACE INTO sessions (sid, username, joined_at, last_active, ua, token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['ws_' + crypto.randomBytes(6).toString('hex'), key, Date.now(), Date.now(), socket.handshake.headers['user-agent'] || 'unknown', sessionToken, expiresAt]);

      const payload = await buildRegisteredPayload(key);
      socket.emit('registered', {
        me: { ...accFromDb(acc, true), id: socket.id },
        users: await getAllUsers(key),
        ...payload
      });
      await broadcastUsersUpdate();
      cb && cb({ ok: true, user: { ...accFromDb(acc, true), id: socket.id }, sessionToken, expiresAt, isNew });
    } catch (e) {
      console.error('email-verify:', e);
      cb && cb({ ok: false });
    }
  });

  /* ============================================================
     VK ВХОД
     ============================================================ */
  socket.on('vk:login-start', async (cb) => {
    const code = botService.generateLinkCode();
    await dbRun('INSERT INTO vk_login_codes (code, status, created_at, expires_at) VALUES (?, "pending", ?, ?)',
      [code, Date.now(), Date.now() + 10 * 60 * 1000]);
    if (cb) cb({ ok: true, code, expiresIn: 600 });
  });

  socket.on('vk:login-check', async ({ code }, cb) => {
    if (!code) return cb && cb({ ok: false });
    const row = await dbGet('SELECT * FROM vk_login_codes WHERE code=?', [String(code).toUpperCase()]);
    if (!row) return cb && cb({ ok: false, error: 'not-found' });
    if (row.status === 'expired') return cb && cb({ ok: false, error: 'expired' });
    if (row.status === 'used' && row.username) {
      const acc = await dbGet('SELECT * FROM accounts WHERE username=?', [row.username]);
      if (!acc) return cb && cb({ ok: false });
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;
      registerSocket(socket, acc, sessionToken, expiresAt);
      await dbRun('INSERT OR REPLACE INTO sessions (sid, username, joined_at, last_active, ua, token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['ws_' + crypto.randomBytes(6).toString('hex'), row.username, Date.now(), Date.now(), socket.handshake.headers['user-agent'] || 'unknown', sessionToken, expiresAt]);
      const payload = await buildRegisteredPayload(row.username);
      socket.emit('registered', {
        me: { ...accFromDb(acc, true), id: socket.id },
        users: await getAllUsers(row.username),
        ...payload
      });
      await broadcastUsersUpdate();
      return cb && cb({ ok: true, done: true, user: { ...accFromDb(acc, true), id: socket.id }, sessionToken, expiresAt });
    }
    return cb && cb({ ok: true, done: false, status: row.status });
  });

  /* ============================================================
     VK ПРИВЯЗКА
     ============================================================ */
  socket.on('vk:get-link-code', async (cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    await dbRun('DELETE FROM vk_link_codes WHERE username=?', [me.usernameLower]);
    const code = botService.generateLinkCode();
    await dbRun('INSERT INTO vk_link_codes (code, username, created_at, expires_at, used) VALUES (?, ?, ?, ?, 0)',
      [code, me.usernameLower, Date.now(), Date.now() + 10 * 60 * 1000]);
    if (cb) cb({ ok: true, code, expiresIn: 600 });
  });

  socket.on('vk:check-link', async (cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const link = await dbGet('SELECT * FROM vk_links WHERE username=?', [me.usernameLower]);
    if (link) {
      await dbRun('UPDATE accounts SET vk_linked=1 WHERE username=?', [me.usernameLower]);
      me.vkLinked = true;
      if (cb) cb({ ok: true, linked: true, vkId: link.vk_id, vkUsername: link.vk_username });
    } else {
      if (cb) cb({ ok: true, linked: false });
    }
  });

  socket.on('vk:unlink', async (cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const link = await dbGet('SELECT * FROM vk_links WHERE username=?', [me.usernameLower]);
    if (link) await dbRun('DELETE FROM vk_links WHERE vk_id=?', [link.vk_id]);
    await dbRun('UPDATE accounts SET vk_linked=0 WHERE username=?', [me.usernameLower]);
    me.vkLinked = false;
    if (cb) cb({ ok: true });
  });

  /* ============================================================
     НАСТРОЙКИ
     ============================================================ */
  socket.on('settings:update', async (patch, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const row = await dbGet('SELECT * FROM settings WHERE username=?', [me.usernameLower]);
    const current = row ? parseJSON(row.data, {}) : {};
    const merged = Object.assign({}, current, patch || {});
    await dbRun('INSERT OR REPLACE INTO settings (username, data) VALUES (?, ?)', [me.usernameLower, JSON.stringify(merged)]);
    if (cb) cb({ ok: true });
  });

  /* ============================================================
     ПОИСК ЛЮДЕЙ
     ============================================================ */
  socket.on('users:search', async ({ query }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb([]);
    const q = String(query || '').trim().toLowerCase();
    if (!q) return cb && cb([]);
    const rows = await dbAll('SELECT * FROM accounts WHERE LOWER(username) LIKE ? AND username != ? LIMIT 30',
      ['%' + q + '%', me.usernameLower]);
    cb(rows.map(r => publicUser(accFromDb(r, isOnline(r.username)), me.isAdmin)));
  });

  /* ============================================================
     ЧАТЫ
     ============================================================ */
  socket.on('chat:open', async ({ withUsername }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const otherKey = String(withUsername || '').toLowerCase();
    const otherRow = await dbGet('SELECT * FROM accounts WHERE username=?', [otherKey]);
    if (!otherRow || otherKey === me.usernameLower) return cb && cb({ ok: false, error: 'Нельзя' });

    const chatId = chatKey(me.usernameLower, otherKey);
    const messages = await getChatMessages(chatId);
    const result = {
      ok: true, chatId, messages,
      otherUser: publicUser(accFromDb(otherRow, isOnline(otherKey)), me.isAdmin),
      chatType: 'private'
    };
    if (cb) cb(result);
    socket.emit('chat:opened', result);
  });

  socket.on('chat:openGroup', async ({ groupId }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const g = await getGroup(groupId);
    if (!g || !g.members.includes(me.usernameLower)) return cb && cb({ ok: false });
    const messages = await getChatMessages(groupId);
    const result = { ok: true, chatId: groupId, messages, group: g, chatType: 'group' };
    if (cb) cb(result);
    socket.emit('chat:opened', result);
  });

  /* ============================================================
     ОТПРАВКА СООБЩЕНИЯ
     ============================================================ */
  socket.on('message:send', async ({ chatId, text, replyTo, attachments, sticker, stickerUrl, stickerId, poll, mentions, scheduledFor }, cb) => {
    let me = users.get(socket.id);
    if (!me) {
      // Фолбэк: пробуем найти по токену из handshake
      const tok = socket.handshake?.auth?.token;
      if (tok) {
        const row = await tryAuthByToken(socket, tok);
        if (row) me = users.get(socket.id);
      }
    }
    if (!me) return cb && cb({ ok: false, error: 'not-auth' });
    if (!(await canAccessChat(chatId, me.usernameLower))) return cb && cb({ ok: false });
    if (!(await canWriteToChat(chatId, me.usernameLower))) return cb && cb({ ok: false, error: 'Только админы' });

    let clean = String(text || '').trim().slice(0, 4000);
    if (!clean && !attachments?.length && !sticker && !stickerUrl && !poll) return cb && cb({ ok: false, error: 'empty' });

    const hadBad = hasBadWords(clean);
    if (hadBad) clean = filterBadWords(clean);

    const id = uid('m');
    const time = Date.now();
    const row = {
      id, chat_id: chatId, type: 'user',
      user_id: me.usernameLower, username: me.username,
      color: me.color, avatar: me.avatar, avatar_url: me.avatarUrl,
      text: clean, time,
      reactions: '{}', reply_to: replyTo ? JSON.stringify(replyTo) : null,
      edited: 0, deleted: 0, deleted_for: '[]',
      attachments: attachments ? JSON.stringify(attachments) : null,
      sticker: sticker || null,
      sticker_url: stickerUrl || null,
      sticker_id: stickerId || null,
      mentions: mentions ? JSON.stringify(mentions) : null,
      poll: poll ? JSON.stringify(poll) : null,
      censored: hadBad ? 1 : 0,
      scheduled_for: scheduledFor || null
    };

    if (scheduledFor && scheduledFor > Date.now()) {
      setTimeout(async () => {
        await dbRun(`INSERT INTO messages (id, chat_id, type, user_id, username, color, avatar, avatar_url, text, time,
          reactions, reply_to, edited, deleted, deleted_for, attachments, sticker, sticker_url, sticker_id, mentions, poll, censored, scheduled_for)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.id, row.chat_id, row.type, row.user_id, row.username, row.color, row.avatar, row.avatar_url, row.text, row.time,
           row.reactions, row.reply_to, row.edited, row.deleted, row.deleted_for, row.attachments, row.sticker, row.sticker_url,
           row.sticker_id, row.mentions, row.poll, row.censored, row.scheduled_for]);
        await emitToChat(chatId, 'message', msgFromDb(row));
      }, scheduledFor - Date.now());
      if (cb) cb({ ok: true, msg: msgFromDb(row), scheduled: true });
      return;
    }

    await dbRun(`INSERT INTO messages (id, chat_id, type, user_id, username, color, avatar, avatar_url, text, time,
      reactions, reply_to, edited, deleted, deleted_for, attachments, sticker, sticker_url, sticker_id, mentions, poll, censored)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.chat_id, row.type, row.user_id, row.username, row.color, row.avatar, row.avatar_url, row.text, row.time,
       row.reactions, row.reply_to, row.edited, row.deleted, row.deleted_for, row.attachments, row.sticker, row.sticker_url,
       row.sticker_id, row.mentions, row.poll, row.censored]);

    await emitToChat(chatId, 'message', msgFromDb(row));
    if (cb) cb({ ok: true, msg: msgFromDb(row) });

    // VK-уведомление
    try {
      if (chatId.startsWith('g_')) {
        const members = await getGroupMembers(chatId);
        const g = await getGroup(chatId);
        for (const m of members) {
          if (m === me.usernameLower) continue;
          if (isOnline(m)) continue;
          sendVkNotification(m, '💬 ' + (g?.name || 'Группа'),
            me.username + ': ' + (clean.slice(0, 100) || 'вложение'), chatId).catch(() => {});
        }
      } else {
        const [a, b] = chatId.split('::');
        const peer = a === me.usernameLower ? b : a;
        if (!isOnline(peer)) {
          sendVkNotification(peer, '💬 Новое сообщение',
            me.username + ': ' + (clean.slice(0, 100) || 'вложение'), chatId).catch(() => {});
        }
      }
    } catch (e) {}
  });

  /* ============================================================
     РЕДАКТИРОВАНИЕ
     ============================================================ */
  socket.on('message:edit', async ({ chatId, messageId, newText }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const row = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    if (!row || row.user_id !== me.usernameLower || row.deleted) return;
    let t = String(newText).slice(0, 4000).trim();
    const hadBad = hasBadWords(t);
    if (hadBad) t = filterBadWords(t);
    await dbRun('UPDATE messages SET text=?, edited=1, censored=? WHERE id=?', [t, hadBad ? 1 : 0, messageId]);
    const updated = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    await emitToChat(chatId, 'message:updated', msgFromDb(updated));
  });

  /* ============================================================
     УДАЛЕНИЕ
     ============================================================ */
  socket.on('message:delete', async ({ chatId, messageId, delay }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const row = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    if (!row) return;
    let canDelete = row.user_id === me.usernameLower;
    if (!canDelete && chatId.startsWith('g_')) {
      if (await isGroupAdmin(chatId, me.usernameLower)) canDelete = true;
    }
    if (!canDelete) return;

    if (delay && delay > 0) {
      const deleteAt = Date.now() + delay;
      await dbRun('UPDATE messages SET pending_delete=1, pending_delete_at=? WHERE id=?', [deleteAt, messageId]);
      await emitToChat(chatId, 'message:pending-delete', {
        chatId, messageId, by: me.usernameLower, deletedAt: deleteAt
      });

      setTimeout(async () => {
        const check = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
        if (!check || !check.pending_delete) return;
        await dbRun('UPDATE messages SET deleted=1, text="", attachments=NULL, sticker=NULL, sticker_url=NULL, sticker_id=NULL, pending_delete=0, pending_delete_at=NULL WHERE id=?',
          [messageId]);
        const final = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
        await emitToChat(chatId, 'message:updated', msgFromDb(final));
      }, delay);
      return;
    }

    await dbRun('UPDATE messages SET deleted=1, text="", attachments=NULL, sticker=NULL, sticker_url=NULL, sticker_id=NULL, pending_delete=0, pending_delete_at=NULL WHERE id=?',
      [messageId]);
    const updated = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    await emitToChat(chatId, 'message:updated', msgFromDb(updated));
  });

  socket.on('message:undo-delete', async ({ chatId, messageId }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const row = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    if (!row || !row.pending_delete) return;
    if (row.user_id !== me.usernameLower && !(chatId.startsWith('g_') && await isGroupAdmin(chatId, me.usernameLower))) return;
    await dbRun('UPDATE messages SET pending_delete=0, pending_delete_at=NULL WHERE id=?', [messageId]);
    const updated = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    await emitToChat(chatId, 'message:undo-delete', { chatId, messageId, by: me.usernameLower });
    await emitToChat(chatId, 'message:updated', msgFromDb(updated));
  });

  socket.on('message:delete-for-me', async ({ chatId, messageId }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const row = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    if (!row) return;
    const arr = parseJSON(row.deleted_for, []);
    if (!arr.includes(me.usernameLower)) arr.push(me.usernameLower);
    await dbRun('UPDATE messages SET deleted_for=? WHERE id=?', [JSON.stringify(arr), messageId]);
    const updated = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    socket.emit('message:updated', msgFromDb(updated));
  });

  /* ============================================================
     РЕАКЦИИ
     ============================================================ */
  socket.on('message:react', async ({ chatId, messageId, emoji }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const row = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    if (!row) return;
    const reactions = parseJSON(row.reactions, {});
    if (!reactions[emoji]) reactions[emoji] = [];
    const arr = reactions[emoji];
    const i = arr.findIndex(u => String(u).toLowerCase() === me.usernameLower);
    if (i === -1) arr.push(me.usernameLower);
    else { arr.splice(i, 1); if (!arr.length) delete reactions[emoji]; }
    await dbRun('UPDATE messages SET reactions=? WHERE id=?', [JSON.stringify(reactions), messageId]);
    const updated = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    await emitToChat(chatId, 'message:updated', msgFromDb(updated));
  });

  /* ============================================================
     ОПРОСЫ
     ============================================================ */
  socket.on('poll:vote', async ({ chatId, messageId, optionIndex }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const row = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    if (!row || !row.poll) return;
    const poll = parseJSON(row.poll, { votes: {} });
    if (!poll.votes) poll.votes = {};
    Object.keys(poll.votes).forEach(k => {
      poll.votes[k] = poll.votes[k].filter(u => u !== me.usernameLower);
    });
    if (!poll.votes[optionIndex]) poll.votes[optionIndex] = [];
    if (!poll.votes[optionIndex].includes(me.usernameLower)) poll.votes[optionIndex].push(me.usernameLower);
    await dbRun('UPDATE messages SET poll=? WHERE id=?', [JSON.stringify(poll), messageId]);
    const updated = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    await emitToChat(chatId, 'message:updated', msgFromDb(updated));
  });

  /* ============================================================
     ЗАКРЕПЛЕНИЕ
     ============================================================ */
  socket.on('message:pin', async ({ chatId, messageId }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const row = await dbGet('SELECT * FROM pinned_msgs WHERE username=? AND chat_id=?', [me.usernameLower, chatId]);
    if (row && row.message_id === messageId) {
      await dbRun('DELETE FROM pinned_msgs WHERE username=? AND chat_id=?', [me.usernameLower, chatId]);
      socket.emit('message:pin-updated', { chatId, messageId: null });
    } else {
      await dbRun('INSERT OR REPLACE INTO pinned_msgs (username, chat_id, message_id) VALUES (?, ?, ?)',
        [me.usernameLower, chatId, messageId]);
      socket.emit('message:pin-updated', { chatId, messageId });
    }
  });

  socket.on('chat:pin', async ({ chatId }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const row = await dbGet('SELECT 1 FROM pinned_chats WHERE username=? AND chat_id=?', [me.usernameLower, chatId]);
    if (row) await dbRun('DELETE FROM pinned_chats WHERE username=? AND chat_id=?', [me.usernameLower, chatId]);
    else await dbRun('INSERT INTO pinned_chats (username, chat_id) VALUES (?, ?)', [me.usernameLower, chatId]);
    const list = (await dbAll('SELECT chat_id FROM pinned_chats WHERE username=?', [me.usernameLower])).map(r => r.chat_id);
    socket.emit('chat:pinned', { list });
  });

  socket.on('chat:mute', async ({ chatId }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const row = await dbGet('SELECT 1 FROM muted_chats WHERE username=? AND chat_id=?', [me.usernameLower, chatId]);
    if (row) await dbRun('DELETE FROM muted_chats WHERE username=? AND chat_id=?', [me.usernameLower, chatId]);
    else await dbRun('INSERT INTO muted_chats (username, chat_id) VALUES (?, ?)', [me.usernameLower, chatId]);
    const list = (await dbAll('SELECT chat_id FROM muted_chats WHERE username=?', [me.usernameLower])).map(r => r.chat_id);
    socket.emit('chat:muted', { list });
  });

  /* ============================================================
     ОЧИСТКА
     ============================================================ */
  socket.on('chat:clear', async ({ chatId }) => {
    const me = users.get(socket.id);
    if (!me || !(await canAccessChat(chatId, me.usernameLower))) return;
    await dbRun('DELETE FROM messages WHERE chat_id=?', [chatId]);
    await emitToChat(chatId, 'chat:cleared', { chatId });
  });

  socket.on('chat:read', async ({ chatId }) => {
    const me = users.get(socket.id);
    if (!me) return;
    if (chatId.startsWith('g_')) {
      const members = await getGroupMembers(chatId);
      members.forEach(m => {
        if (m !== me.usernameLower) emitToUser(m, 'chat:read', { chatId, by: me.usernameLower, time: Date.now() });
      });
    } else {
      const [a, b] = chatId.split('::');
      const peer = a === me.usernameLower ? b : a;
      emitToUser(peer, 'chat:read', { chatId, by: me.usernameLower, time: Date.now() });
    }
  });

  /* ============================================================
     ПЕРЕСЫЛКА
     ============================================================ */
  socket.on('messages:forward', async ({ messageIds, fromChatId, toChatIds }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const srcMsgs = await getChatMessages(fromChatId);
    const toForward = srcMsgs.filter(m => messageIds.includes(m.id));
    let sent = 0;
    for (const toChatId of toChatIds) {
      if (!(await canAccessChat(toChatId, me.usernameLower))) continue;
      if (!(await canWriteToChat(toChatId, me.usernameLower))) continue;
      for (const orig of toForward) {
        const copyId = uid('m');
        const time = Date.now();
        await dbRun(`INSERT INTO messages (id, chat_id, type, user_id, username, color, avatar, avatar_url, text, time,
          reactions, reply_to, edited, deleted, deleted_for, attachments, sticker, sticker_url, sticker_id, forwarded_from)
          VALUES (?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, '{}', NULL, 0, 0, '[]', ?, ?, ?, ?, ?)`,
          [copyId, toChatId, me.usernameLower, me.username, me.color, me.avatar, me.avatarUrl,
           orig.text, time,
           orig.attachments ? JSON.stringify(orig.attachments) : null,
           orig.sticker, orig.stickerUrl, orig.stickerId, orig.username]);
        const copy = await dbGet('SELECT * FROM messages WHERE id=?', [copyId]);
        await emitToChat(toChatId, 'message', msgFromDb(copy));
        sent++;
      }
    }
    if (cb) cb({ ok: true, sent });
  });

  /* ============================================================
     ПРОФИЛЬ
     ============================================================ */
  socket.on('profile:update', async (patch) => {
    const me = users.get(socket.id);
    if (!me) return;
    const upd = {};
    if (typeof patch.bio === 'string') upd.bio = patch.bio.slice(0, 200);
    if (typeof patch.birthday === 'string') upd.birthday = patch.birthday.slice(0, 20);
    if (typeof patch.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.color)) upd.color = patch.color;
    if (patch.avatar === null || (typeof patch.avatar === 'string' && patch.avatar.length <= 4)) upd.avatar = patch.avatar;
    if (patch.avatarUrl === null || typeof patch.avatarUrl === 'string') upd.avatar_url = patch.avatarUrl;

    const keys = Object.keys(upd);
    if (keys.length) {
      const sql = 'UPDATE accounts SET ' + keys.map(k => k + '=?').join(', ') + ' WHERE username=?';
      await dbRun(sql, [...keys.map(k => upd[k]), me.usernameLower]);
    }

    const row = await dbGet('SELECT * FROM accounts WHERE username=?', [me.usernameLower]);
    const updated = accFromDb(row, true);
    me.bio = updated.bio; me.birthday = updated.birthday;
    me.color = updated.color; me.avatar = updated.avatar; me.avatarUrl = updated.avatarUrl;
    users.set(socket.id, me);
    socket.emit('profile:updated', me);
    await broadcastUsersUpdate();
  });

  socket.on('profile:password', async ({ current, next }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb({ ok: false });
    const row = await dbGet('SELECT * FROM accounts WHERE username=?', [me.usernameLower]);
    if (!row) return cb({ ok: false });
    if (!verifyPassword(current, row.password_hash)) return cb({ ok: false, error: 'Неверный текущий пароль' });
    if (String(next).length < 4) return cb({ ok: false, error: 'Минимум 4 символа' });
    await dbRun('UPDATE accounts SET password_hash=? WHERE username=?', [hashPassword(next), me.usernameLower]);
    cb({ ok: true });
  });

  socket.on('profile:delete', async ({ password }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb({ ok: false });
    const row = await dbGet('SELECT * FROM accounts WHERE username=?', [me.usernameLower]);
    if (!row) return cb({ ok: false });
    if (!verifyPassword(password, row.password_hash)) return cb({ ok: false, error: 'Неверный пароль' });
    await dbRun('DELETE FROM accounts WHERE username=?', [me.usernameLower]);
    cb({ ok: true });
    socket.disconnect(true);
  });

  socket.on('profile:privacy', async ({ key, value }, cb) => {
    const me = users.get(socket.id);
    if (!me) return;
    const col = key === 'lastSeen' ? 'last_seen' : (key === 'readReceipts' ? 'read_receipts' : key);
    await dbRun('INSERT OR IGNORE INTO privacy (username) VALUES (?)', [me.usernameLower]);
    await dbRun('UPDATE privacy SET ' + col + '=? WHERE username=?', [value, me.usernameLower]);
    if (cb) cb({ ok: true });
  });

  socket.on('profile:bind-email', async ({ email }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const em = String(email || '').trim().toLowerCase();
    if (em) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return cb && cb({ ok: false, error: 'Некорректный email' });
      const taken = await dbGet('SELECT 1 FROM accounts WHERE email=?', [em]);
      if (taken && taken.username !== me.usernameLower) return cb && cb({ ok: false, error: 'Занят' });
    }
    await dbRun('UPDATE accounts SET email=?, email_verified=0 WHERE username=?', [em, me.usernameLower]);
    me.email = em; me.emailVerified = false;
    socket.emit('profile:updated', me);
    if (cb) cb({ ok: true });
  });

  socket.on('profile:bind-phone', async ({ phone }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const ph = String(phone || '').trim().replace(/[^\d+]/g, '');
    if (ph) {
      const taken = await dbGet('SELECT 1 FROM accounts WHERE phone=?', [ph]);
      if (taken && taken.username !== me.usernameLower) return cb && cb({ ok: false, error: 'Занят' });
    }
    await dbRun('UPDATE accounts SET phone=?, phone_verified=0 WHERE username=?', [ph, me.usernameLower]);
    me.phone = ph; me.phoneVerified = false;
    socket.emit('profile:updated', me);
    if (cb) cb({ ok: true });
  });

  /* ============================================================
     СЕССИИ
     ============================================================ */
  socket.on('sessions:list', async (cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb([]);
    const rows = await dbAll('SELECT * FROM sessions WHERE username=?', [me.usernameLower]);
    cb(rows.map(r => ({ sid: r.sid, joinedAt: r.joined_at, lastActive: r.last_active, ua: r.ua, current: r.sid === socket.id })));
  });

  socket.on('sessions:kill', async ({ sid }) => {
    const me = users.get(socket.id);
    if (!me) return;
    await dbRun('DELETE FROM sessions WHERE sid=?', [sid]);
    if (sid !== socket.id) {
      const s = io.sockets.sockets.get(sid);
      if (s) s.disconnect(true);
    }
  });

  /* ============================================================
     КОНТАКТЫ
     ============================================================ */
  socket.on('contacts:add', async ({ username }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const k = String(username).toLowerCase();
    if (!(await dbGet('SELECT 1 FROM accounts WHERE username=?', [k]))) return cb && cb({ ok: false, error: 'Не найден' });
    await dbRun('INSERT OR IGNORE INTO contacts (owner, contact) VALUES (?, ?)', [me.usernameLower, k]);
    if (cb) cb({ ok: true });
  });

  socket.on('contacts:remove', async ({ username }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    await dbRun('DELETE FROM contacts WHERE owner=? AND contact=?', [me.usernameLower, String(username).toLowerCase()]);
    if (cb) cb({ ok: true });
  });

  socket.on('contacts:list', async (cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb([]);
    const rows = await dbAll('SELECT contact FROM contacts WHERE owner=?', [me.usernameLower]);
    cb(rows.map(r => r.contact));
  });

  /* ============================================================
     TYPING
     ============================================================ */
  socket.on('typing', async ({ chatId, isTyping }) => {
    const me = users.get(socket.id);
    if (!me) return;
    if (chatId.startsWith('g_')) {
      const members = await getGroupMembers(chatId);
      members.forEach(m => {
        if (m !== me.usernameLower) emitToUser(m, 'user:typing', { chatId, username: me.username, isTyping: !!isTyping });
      });
    } else {
      const [a, b] = chatId.split('::');
      const peer = a === me.usernameLower ? b : a;
      emitToUser(peer, 'user:typing', { chatId, username: me.username, isTyping: !!isTyping });
    }
  });

  /* ============================================================
     ГРУППЫ
     ============================================================ */
  socket.on('group:create', async ({ name, description, type, members, rules }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const gname = String(name || '').trim().slice(0, 60) || 'Группа';
    const gid = uid('g');
    const gtype = type === 'channel' ? 'channel' : 'group';

    await dbRun(`INSERT INTO groups_t (id, name, description, rules, avatar_url, type, owner, color, created_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      [gid, gname, String(description || '').slice(0, 200), String(rules || '').slice(0, 2000), gtype, me.usernameLower, randColor(), Date.now()]);
    await dbRun('INSERT OR REPLACE INTO group_members (group_id, username, is_admin) VALUES (?, ?, 1)', [gid, me.usernameLower]);

    const sysId = uid('m');
    await dbRun(`INSERT INTO messages (id, chat_id, type, text, time) VALUES (?, ?, 'system', ?, ?)`,
      [sysId, gid, me.username + ' создал' + (gtype === 'channel' ? ' канал' : ' группу'), Date.now()]);

    const g = await getGroup(gid);
    emitToUser(me.usernameLower, 'group:created', g);

    for (const m of (members || [])) {
      const k = String(m).toLowerCase();
      if (k === me.usernameLower) continue;
      if (!(await dbGet('SELECT 1 FROM accounts WHERE username=?', [k]))) continue;
      await dbRun('INSERT OR REPLACE INTO join_requests (group_id, username, requested_by, requested_at) VALUES (?, ?, ?, ?)',
        [gid, k, me.usernameLower, Date.now()]);
      emitToUser(k, 'group:invite-received', {
        groupId: gid, groupName: gname, type: gtype,
        from: me.username, fromColor: me.color,
        fromAvatar: me.avatar, fromAvatarUrl: me.avatarUrl
      });
    }
    if (cb) cb({ ok: true, group: g });
  });

  socket.on('group:update', async ({ groupId, patch }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    if (!(await isGroupAdmin(groupId, me.usernameLower))) return cb && cb({ ok: false });
    const upd = {};
    if (typeof patch.name === 'string') upd.name = patch.name.slice(0, 60);
    if (typeof patch.description === 'string') upd.description = patch.description.slice(0, 200);
    if (typeof patch.rules === 'string') upd.rules = patch.rules.slice(0, 2000);
    if (typeof patch.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.color)) upd.color = patch.color;
    const keys = Object.keys(upd);
    if (keys.length) {
      const sql = 'UPDATE groups_t SET ' + keys.map(k => k + '=?').join(', ') + ' WHERE id=?';
      await dbRun(sql, [...keys.map(k => upd[k]), groupId]);
    }
    const g = await getGroup(groupId);
    for (const m of g.members) emitToUser(m, 'group:updated', g);
    if (cb) cb({ ok: true, group: g });
  });

  socket.on('group:acceptInvite', async ({ groupId }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const g = await getGroup(groupId);
    if (!g) return cb && cb({ ok: false });
    if (g.members.includes(me.usernameLower)) return cb && cb({ ok: true, already: true, group: g });
    await dbRun('INSERT OR REPLACE INTO group_members (group_id, username, is_admin) VALUES (?, ?, 0)', [groupId, me.usernameLower]);
    await dbRun('DELETE FROM join_requests WHERE group_id=? AND username=?', [groupId, me.usernameLower]);
    const sysId = uid('m');
    await dbRun(`INSERT INTO messages (id, chat_id, type, text, time) VALUES (?, ?, 'system', ?, ?)`,
      [sysId, groupId, me.username + ' присоединился', Date.now()]);
    const updated = await getGroup(groupId);
    for (const m of updated.members) emitToUser(m, 'group:updated', updated);
    const sysMsg = await dbGet('SELECT * FROM messages WHERE id=?', [sysId]);
    await emitToChat(groupId, 'message', msgFromDb(sysMsg));
    if (cb) cb({ ok: true, group: updated });
  });

  socket.on('group:declineInvite', async ({ groupId }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    await dbRun('DELETE FROM join_requests WHERE group_id=? AND username=?', [groupId, me.usernameLower]);
    if (cb) cb({ ok: true });
  });

  socket.on('group:leave', async ({ groupId }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const g = await getGroup(groupId);
    if (!g) return;
    await dbRun('DELETE FROM group_members WHERE group_id=? AND username=?', [groupId, me.usernameLower]);
    const updated = await getGroup(groupId);
    if (updated && updated.members.length === 0) {
      await dbRun('DELETE FROM groups_t WHERE id=?', [groupId]);
      await dbRun('DELETE FROM messages WHERE chat_id=?', [groupId]);
    } else if (updated && updated.owner === me.usernameLower) {
      const newOwner = updated.members[0];
      await dbRun('UPDATE groups_t SET owner=? WHERE id=?', [newOwner, groupId]);
      await dbRun('UPDATE group_members SET is_admin=1 WHERE group_id=? AND username=?', [groupId, newOwner]);
    }
    socket.emit('group:left', { groupId });
    const fin = await getGroup(groupId);
    if (fin) for (const m of fin.members) emitToUser(m, 'group:updated', fin);
  });

  socket.on('group:delete', async ({ groupId }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const g = await getGroup(groupId);
    if (!g || g.owner !== me.usernameLower) return;
    for (const m of g.members) emitToUser(m, 'group:removed', { groupId });
    await dbRun('DELETE FROM messages WHERE chat_id=?', [groupId]);
    await dbRun('DELETE FROM group_members WHERE group_id=?', [groupId]);
    await dbRun('DELETE FROM groups_t WHERE id=?', [groupId]);
  });

  socket.on('group:removeMember', async ({ groupId, username }) => {
    const me = users.get(socket.id);
    if (!me) return;
    if (!(await isGroupAdmin(groupId, me.usernameLower))) return;
    const k = String(username).toLowerCase();
    const g = await getGroup(groupId);
    if (!g || k === g.owner) return;
    await dbRun('DELETE FROM group_members WHERE group_id=? AND username=?', [groupId, k]);
    emitToUser(k, 'group:removed', { groupId });
    const updated = await getGroup(groupId);
    for (const m of updated.members) emitToUser(m, 'group:updated', updated);
  });

  socket.on('group:makeAdmin', async ({ groupId, username, isAdmin }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const g = await getGroup(groupId);
    if (!g || g.owner !== me.usernameLower) return;
    await dbRun('UPDATE group_members SET is_admin=? WHERE group_id=? AND username=?',
      [isAdmin ? 1 : 0, groupId, String(username).toLowerCase()]);
    const updated = await getGroup(groupId);
    for (const m of updated.members) emitToUser(m, 'group:updated', updated);
  });

  /* ============================================================
     ПРИГЛАШЕНИЯ
     ============================================================ */
  socket.on('invite:create', async ({ groupId }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    if (!(await isGroupAdmin(groupId, me.usernameLower))) return cb && cb({ ok: false });
    const code = crypto.randomBytes(6).toString('hex');
    await dbRun('INSERT INTO invites (code, group_id, expires_at, created_by) VALUES (?, ?, ?, ?)',
      [code, groupId, Date.now() + 7 * 24 * 3600 * 1000, me.usernameLower]);
    if (cb) cb({ ok: true, code, url: '/join/' + code });
  });

  socket.on('invite:join', async ({ code }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const inv = await dbGet('SELECT * FROM invites WHERE code=?', [code]);
    if (!inv) return cb && cb({ ok: false, error: 'Не найдено' });
    if (inv.expires_at < Date.now()) { await dbRun('DELETE FROM invites WHERE code=?', [code]); return cb && cb({ ok: false, error: 'Истекло' }); }
    const g = await getGroup(inv.group_id);
    if (!g) return cb && cb({ ok: false });
    if (g.members.includes(me.usernameLower)) return cb && cb({ ok: true, groupId: g.id, already: true });
    await dbRun('INSERT OR REPLACE INTO group_members (group_id, username, is_admin) VALUES (?, ?, 0)', [g.id, me.usernameLower]);
    const sysId = uid('m');
    await dbRun(`INSERT INTO messages (id, chat_id, type, text, time) VALUES (?, ?, 'system', ?, ?)`,
      [sysId, g.id, me.username + ' присоединился', Date.now()]);
    const updated = await getGroup(g.id);
    for (const m of updated.members) emitToUser(m, 'group:updated', updated);
    const sysMsg = await dbGet('SELECT * FROM messages WHERE id=?', [sysId]);
    await emitToChat(g.id, 'message', msgFromDb(sysMsg));
    if (cb) cb({ ok: true, groupId: g.id });
  });

  /* ============================================================
     ЗВОНКИ
     ============================================================ */
  socket.on('call:invite', async ({ chatId, callType, withUser, groupId }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const callId = uid('call');

    if (groupId) {
      const g = await getGroup(groupId);
      if (!g || !g.members.includes(me.usernameLower)) return cb && cb({ ok: false });
      activeCalls.set(callId, {
        id: callId, type: 'group', groupId, chatId: groupId,
        callType: callType || 'audio', initiator: me.usernameLower,
        participants: [me.usernameLower],
        pending: g.members.filter(m => m !== me.usernameLower),
        startedAt: Date.now()
      });
      socketToCall.set(socket.id, callId);
      g.members.forEach(m => {
        if (m === me.usernameLower) return;
        emitToUser(m, 'call:incoming', {
          callId,
          from: { username: me.username, avatar: me.avatar, avatarUrl: me.avatarUrl, color: me.color },
          callType: callType || 'audio',
          groupName: g.name, groupId
        });
      });
      socket.emit('call:created', { callId, isInitiator: true });
    } else {
      const otherKey = String(withUser || '').toLowerCase();
      const otherAcc = await dbGet('SELECT * FROM accounts WHERE username=?', [otherKey]);
      if (!otherAcc) return cb && cb({ ok: false });
      activeCalls.set(callId, {
        id: callId, type: 'private',
        chatId: chatKey(me.usernameLower, otherKey),
        callType: callType || 'audio', initiator: me.usernameLower,
        participants: [me.usernameLower],
        pending: [otherKey],
        startedAt: Date.now()
      });
      socketToCall.set(socket.id, callId);
      emitToUser(otherKey, 'call:incoming', {
        callId,
        from: { username: me.username, avatar: me.avatar, avatarUrl: me.avatarUrl, color: me.color },
        callType: callType || 'audio'
      });
      socket.emit('call:created', { callId, isInitiator: true });
    }
    if (cb) cb({ ok: true, callId });
  });

  socket.on('call:accept', async ({ callId }, cb) => {
    const me = users.get(socket.id);
    const call = activeCalls.get(callId);
    if (!me || !call) return cb && cb({ ok: false, error: 'call-not-found' });
    if (!call.participants.includes(me.usernameLower)) call.participants.push(me.usernameLower);
    call.pending = call.pending.filter(p => p !== me.usernameLower);
    socketToCall.set(socket.id, callId);

    const existing = call.participants.filter(p => p !== me.usernameLower);

    const participantData = [];
    for (const p of call.participants) {
      const a = await dbGet('SELECT * FROM accounts WHERE username=?', [p]);
      if (a) participantData.push({
        username: a.username_display || a.username,
        usernameLower: p,
        avatar: a.avatar, avatarUrl: a.avatar_url, color: a.color
      });
    }

    existing.forEach(p => emitToUser(p, 'call:participant-joined', {
      callId,
      participant: {
        username: me.username, usernameLower: me.usernameLower,
        avatar: me.avatar, avatarUrl: me.avatarUrl, color: me.color
      },
      allParticipants: participantData
    }));

    const peers = [];
    for (const p of existing) {
      const a = await dbGet('SELECT * FROM accounts WHERE username=?', [p]);
      if (a) peers.push({
        username: a.username_display || a.username,
        usernameLower: p,
        avatar: a.avatar, avatarUrl: a.avatar_url, color: a.color
      });
    }
    socket.emit('call:peers', { callId, peers });
    if (cb) cb({ ok: true, participants: participantData, call });
  });

  socket.on('call:reject', ({ callId }) => {
    const me = users.get(socket.id);
    const call = activeCalls.get(callId);
    if (!me || !call) return;
    call.pending = call.pending.filter(p => p !== me.usernameLower);
    emitToUser(call.initiator, 'call:rejected', { callId, by: me.username });
  });

  socket.on('call:end', ({ callId }) => {
    const me = users.get(socket.id);
    const call = activeCalls.get(callId);
    if (!me || !call) return;
    call.participants.forEach(p => emitToUser(p, 'call:ended', { callId, by: me.username }));
    if (call.pending) call.pending.forEach(p => emitToUser(p, 'call:cancelled', { callId }));
    activeCalls.delete(callId);
  });

  socket.on('call:leave', ({ callId }) => {
    const me = users.get(socket.id);
    const call = activeCalls.get(callId);
    if (!me || !call) return;
    call.participants = call.participants.filter(p => p !== me.usernameLower);
    socketToCall.delete(socket.id);
    call.participants.forEach(p => emitToUser(p, 'call:participant-left', { callId, username: me.usernameLower }));
    if (call.participants.length === 0) activeCalls.delete(callId);
  });

  socket.on('call:media', ({ callId, micOn, camOn, screenOn }) => {
    const me = users.get(socket.id);
    const call = activeCalls.get(callId);
    if (!me || !call) return;
    call.participants.forEach(p => {
      if (p === me.usernameLower) return;
      emitToUser(p, 'call:media', { callId, username: me.usernameLower, micOn, camOn, screenOn });
    });
  });

  socket.on('call:save-history', async ({ withUser, type, duration, status }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const otherKey = String(withUser || '').toLowerCase();
    const other = await dbGet('SELECT * FROM accounts WHERE username=?', [otherKey]);
    if (!other) return cb && cb({ ok: false });
    const chatId = chatKey(me.usernameLower, otherKey);
    const msgId = uid('m');
    await dbRun(`INSERT INTO messages (id, chat_id, type, user_id, username, color, call_type, call_status, duration, time, text)
      VALUES (?, ?, 'call', ?, ?, ?, ?, ?, ?, ?, '')`,
      [msgId, chatId, me.usernameLower, me.username, me.color, type, status, duration || 0, Date.now()]);
    const msg = await dbGet('SELECT * FROM messages WHERE id=?', [msgId]);
    await emitToChat(chatId, 'message', msgFromDb(msg));
    if (cb) cb({ ok: true });
  });

  /* ---------- WebRTC ---------- */
  socket.on('webrtc:offer', ({ callId, toUsername, offer }) => {
    const me = users.get(socket.id);
    if (!me) return;
    emitToUser(toUsername, 'webrtc:offer', { callId, from: me.usernameLower, fromUsername: me.username, offer });
  });

  socket.on('webrtc:answer', ({ callId, toUsername, answer }) => {
    const me = users.get(socket.id);
    if (!me) return;
    emitToUser(toUsername, 'webrtc:answer', { callId, from: me.usernameLower, answer });
  });

  socket.on('webrtc:ice', ({ callId, toUsername, candidate }) => {
    const me = users.get(socket.id);
    if (!me) return;
    emitToUser(toUsername, 'webrtc:ice', { callId, from: me.usernameLower, candidate });
  });

  /* ============================================================
     СТИКЕР-ПАКИ
     ============================================================ */
  socket.on('stickers:list-my', async (cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb([]);
    cb(await getMyStickerPacks(me.usernameLower));
  });

  socket.on('stickers:list-public', async ({ limit }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb([]);
    cb(await getPublicStickerPacks(limit || 50));
  });

  socket.on('stickers:get-pack', async ({ packId }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const pack = await getStickerPack(packId);
    if (!pack) return cb && cb({ ok: false, error: 'Пак не найден' });
    if (!pack.isPublic && pack.owner !== me.usernameLower) return cb && cb({ ok: false });
    cb({ ok: true, pack });
  });

  socket.on('stickers:create-pack', async ({ name, description, coverUrl, isPublic }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const pname = String(name || '').trim().slice(0, 40);
    if (!pname) return cb && cb({ ok: false, error: 'Введи название' });
    const count = (await dbAll('SELECT id FROM sticker_packs WHERE owner=?', [me.usernameLower])).length;
    if (count >= 20) return cb && cb({ ok: false, error: 'Максимум 20 паков' });
    const packId = uid('pack');
    await dbRun('INSERT INTO sticker_packs (id, owner, name, description, cover_url, created_at, is_public) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [packId, me.usernameLower, pname, String(description || '').slice(0, 200), coverUrl || null, Date.now(), isPublic !== false ? 1 : 0]);
    const full = await getStickerPack(packId);
    cb({ ok: true, pack: full });
  });

  socket.on('stickers:delete-pack', async ({ packId }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const pack = await dbGet('SELECT * FROM sticker_packs WHERE id=?', [packId]);
    if (!pack || pack.owner !== me.usernameLower) return cb && cb({ ok: false });
    await dbRun('DELETE FROM stickers WHERE pack_id=?', [packId]);
    await dbRun('DELETE FROM sticker_packs WHERE id=?', [packId]);
    cb({ ok: true });
  });

  socket.on('stickers:add', async ({ packId, url, emoji }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const pack = await dbGet('SELECT * FROM sticker_packs WHERE id=?', [packId]);
    if (!pack || pack.owner !== me.usernameLower) return cb && cb({ ok: false });
    const existing = await dbAll('SELECT id FROM stickers WHERE pack_id=?', [packId]);
    if (existing.length >= 60) return cb && cb({ ok: false, error: 'Максимум 60 стикеров' });
    if (!url) return cb && cb({ ok: false });
    const stickerId = uid('st');
    await dbRun('INSERT INTO stickers (id, pack_id, url, emoji, position, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [stickerId, packId, String(url).slice(0, 500), String(emoji || '🎨').slice(0, 8), existing.length, Date.now()]);
    cb({ ok: true, sticker: { id: stickerId, packId, url, emoji: emoji || '🎨', position: existing.length } });
  });

  socket.on('stickers:delete', async ({ stickerId }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const st = await dbGet('SELECT * FROM stickers WHERE id=?', [stickerId]);
    if (!st) return cb && cb({ ok: false });
    const pack = await dbGet('SELECT * FROM sticker_packs WHERE id=?', [st.pack_id]);
    if (!pack || pack.owner !== me.usernameLower) return cb && cb({ ok: false });
    await dbRun('DELETE FROM stickers WHERE id=?', [stickerId]);
    cb({ ok: true });
  });

  /* ============================================================
     ИСТОРИИ
     ============================================================ */
  socket.on('story:create', async ({ url, mime }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    if (!url) return cb && cb({ ok: false });
    const count = (await dbAll('SELECT id FROM stories WHERE owner=?', [me.usernameLower])).length;
    if (count >= 20) return cb && cb({ ok: false, error: 'Максимум 20 историй' });
    const id = uid('s');
    await dbRun('INSERT INTO stories (id, owner, url, mime, time) VALUES (?, ?, ?, ?, ?)',
      [id, me.usernameLower, String(url).slice(0, 500), String(mime || 'image/jpeg').slice(0, 100), Date.now()]);

    for (const [, sid] of users) {
      const s = io.sockets.sockets.get(sid.id);
      if (s) s.emit('stories:update', await getStoriesFor(me.usernameLower));
    }
    if (cb) cb({ ok: true, story: { id, url, mime, time: Date.now() } });
  });

  socket.on('story:list', async (cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb([]);
    cb(await getStoriesFor(me.usernameLower));
  });

  socket.on('story:view', async ({ ownerKey, storyId }) => {
    const me = users.get(socket.id);
    if (!me) return;
    const owner = String(ownerKey || '').toLowerCase();
    if (owner === me.usernameLower) return;
    await dbRun('INSERT OR REPLACE INTO story_views (story_id, username, viewed_at) VALUES (?, ?, ?)',
      [storyId, me.usernameLower, Date.now()]);
    emitToUser(owner, 'stories:update', await getStoriesFor(owner));
  });

  socket.on('story:delete', async ({ storyId }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const row = await dbGet('SELECT * FROM stories WHERE id=?', [storyId]);
    if (!row || row.owner !== me.usernameLower) return cb && cb({ ok: false });
    await dbRun('DELETE FROM stories WHERE id=?', [storyId]);
    await dbRun('DELETE FROM story_views WHERE story_id=?', [storyId]);
    for (const [, sid] of users) {
      const s = io.sockets.sockets.get(sid.id);
      if (s) s.emit('stories:update', await getStoriesFor(me.usernameLower));
    }
    if (cb) cb({ ok: true });
  });

  /* ============================================================
     АДМИНКА
     ============================================================ */
  socket.on('admin:list-users', async (cb) => {
    const me = users.get(socket.id);
    if (!me || !me.isAdmin) return cb && cb({ ok: false });
    const rows = await dbAll('SELECT * FROM accounts ORDER BY created_at DESC');
    const list = rows.map(r => ({
      username: r.username,
      usernameDisplay: r.username_display,
      createdAt: r.created_at,
      isAdmin: !!r.is_admin,
      isVerified: !!r.is_verified,
      isBanned: !!r.is_banned,
      banReason: r.ban_reason || '',
      online: isOnline(r.username),
      vkLinked: !!r.vk_linked,
      color: r.color
    }));
    cb({ ok: true, users: list });
  });

  socket.on('admin:stats', async (cb) => {
    const me = users.get(socket.id);
    if (!me || !me.isAdmin) return cb && cb({ ok: false });
    const a = await dbGet('SELECT COUNT(*) as c FROM accounts');
    const m = await dbGet('SELECT COUNT(*) as c FROM messages');
    const g = await dbGet('SELECT COUNT(*) as c FROM groups_t');
    const s = await dbGet('SELECT COUNT(*) as c FROM stories');
    cb({
      ok: true,
      accounts: a ? a.c : 0,
      messages: m ? m.c : 0,
      groups: g ? g.c : 0,
      stories: s ? s.c : 0,
      online: users.size,
      activeCalls: activeCalls.size
    });
  });

  socket.on('admin:set-verified', async ({ username, value }, cb) => {
    const me = users.get(socket.id);
    if (!me || !me.isAdmin) return cb && cb({ ok: false });
    await dbRun('UPDATE accounts SET is_verified=? WHERE username=?', [value ? 1 : 0, String(username).toLowerCase()]);
    await broadcastUsersUpdate();
    if (cb) cb({ ok: true });
  });

  socket.on('admin:set-banned', async ({ username, value, reason }, cb) => {
    const me = users.get(socket.id);
    if (!me || !me.isAdmin) return cb && cb({ ok: false });
    const k = String(username).toLowerCase();
    if (k === me.usernameLower) return cb && cb({ ok: false, error: 'Нельзя себя' });
    await dbRun('UPDATE accounts SET is_banned=?, ban_reason=?, banned_at=? WHERE username=?',
      [value ? 1 : 0, value ? String(reason || '').slice(0, 200) : '', value ? Date.now() : null, k]);
    if (value) {
      const set = onlineByUsername.get(k);
      if (set) set.forEach(sid => {
        const s = io.sockets.sockets.get(sid);
        if (s) s.disconnect(true);
      });
    }
    await broadcastUsersUpdate();
    if (cb) cb({ ok: true });
  });

  socket.on('admin:set-admin', async ({ username, value }, cb) => {
    const me = users.get(socket.id);
    if (!me || !me.isAdmin) return cb && cb({ ok: false });
    const k = String(username).toLowerCase();
    if (k === me.usernameLower && !value) return cb && cb({ ok: false, error: 'Нельзя с себя' });
    await dbRun('UPDATE accounts SET is_admin=? WHERE username=?', [value ? 1 : 0, k]);
    if (cb) cb({ ok: true });
  });

  socket.on('admin:delete-user', async ({ username }, cb) => {
    const me = users.get(socket.id);
    if (!me || !me.isAdmin) return cb && cb({ ok: false });
    const k = String(username).toLowerCase();
    if (k === me.usernameLower) return cb && cb({ ok: false, error: 'Нельзя себя' });
    await dbRun('DELETE FROM accounts WHERE username=?', [k]);
    const set = onlineByUsername.get(k);
    if (set) set.forEach(sid => {
      const s = io.sockets.sockets.get(sid);
      if (s) s.disconnect(true);
    });
    if (cb) cb({ ok: true });
  });

  socket.on('admin:broadcast', async ({ text }, cb) => {
    const me = users.get(socket.id);
    if (!me || !me.isAdmin) return cb && cb({ ok: false });
    const t = String(text || '').trim().slice(0, 2000);
    if (!t) return cb && cb({ ok: false });
    const accs = await dbAll('SELECT username FROM accounts');
    let sent = 0;
    for (const a of accs) {
      const chatId = chatKey(me.usernameLower, a.username);
      const msgId = uid('m');
      await dbRun(`INSERT INTO messages (id, chat_id, type, text, time) VALUES (?, ?, 'system', ?, ?)`,
        [msgId, chatId, '📢 ' + t, Date.now()]);
      const msg = await dbGet('SELECT * FROM messages WHERE id=?', [msgId]);
      await emitToChat(chatId, 'message', msgFromDb(msg));
      sent++;
    }
    await dbRun('INSERT INTO broadcasts (id, text, from_username, time, sent_to) VALUES (?, ?, ?, ?, ?)',
      [uid('br'), t, me.usernameLower, Date.now(), sent]);
    if (cb) cb({ ok: true, sent });
  });

  /* ============================================================
     DISCONNECT
     ============================================================ */
  socket.on('disconnect', async () => {
    const me = users.get(socket.id);
    if (me) {
      const key = me.usernameLower;
      try {
        await dbRun('INSERT OR REPLACE INTO last_seen (username, time) VALUES (?, ?)', [key, Date.now()]);
      } catch (e) {}
      users.delete(socket.id);
      const set = onlineByUsername.get(key);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) onlineByUsername.delete(key);
      }
      // НЕ удаляем сессию по socket.id — она должна жить до logout или истечения срока.
      // Иначе при переподключении телефона удаляется сессия веба (и наоборот).

      const callId = socketToCall.get(socket.id);
      if (callId) {
        const call = activeCalls.get(callId);
        if (call) {
          call.participants = call.participants.filter(p => p !== key);
          call.pending = call.pending.filter(p => p !== key);
          call.participants.forEach(p => emitToUser(p, 'call:participant-left', { callId, username: key }));
          if (call.participants.length === 0) activeCalls.delete(callId);
        }
        socketToCall.delete(socket.id);
      }
      try { await broadcastUsersUpdate(); } catch (e) {}
      console.log('🔴 disconnect', key);
    }
  });
});

/* ============================================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ============================================================ */

function registerSocket(socket, accRow, sessionToken, expiresAt) {
  const key = accRow.username;
  if (!onlineByUsername.has(key)) onlineByUsername.set(key, new Set());
  onlineByUsername.get(key).add(socket.id);
  users.set(socket.id, { ...accFromDb(accRow, true), id: socket.id });
}

async function buildRegisteredPayload(username) {
  let sRow = await dbGet('SELECT * FROM settings WHERE username=?', [username]);
  if (!sRow) {
    await dbRun('INSERT INTO settings (username, data) VALUES (?, ?)', [username, '{}']);
    sRow = { username, data: '{}' };
  }
  const contacts = (await dbAll('SELECT contact FROM contacts WHERE owner=?', [username])).map(r => r.contact);
  const pinned = (await dbAll('SELECT chat_id FROM pinned_chats WHERE username=?', [username])).map(r => r.chat_id);
  const muted = (await dbAll('SELECT chat_id FROM muted_chats WHERE username=?', [username])).map(r => r.chat_id);
  const pinnedMsgsRows = await dbAll('SELECT chat_id, message_id FROM pinned_msgs WHERE username=?', [username]);
  const pinnedMsgs = {};
  pinnedMsgsRows.forEach(r => { if (r.message_id) pinnedMsgs[r.chat_id] = r.message_id; });

  const gmRows = await dbAll('SELECT group_id FROM group_members WHERE username=?', [username]);
  const groups = [];
  for (const gm of gmRows) {
    const g = await getGroup(gm.group_id);
    if (g) groups.push(g);
  }

  const chats = await getMyChats(username, groups);
  const stories = await getStoriesFor(username);
  const stickerPacks = await getMyStickerPacks(username);

  return {
    chatHistory: chats,
    pinned,
    muted,
    pinnedMsgs,
    groups,
    settings: parseJSON(sRow.data, null),
    contacts,
    stories,
    stickerPacks
  };
}

async function getMyChats(username, groups) {
  const chats = {};
  const all = await dbAll('SELECT DISTINCT chat_id FROM messages');
  const chatIds = new Set();
  all.forEach(r => {
    const cid = r.chat_id;
    if (!cid) return;
    if (cid.startsWith('g_')) return;
    const parts = cid.split('::');
    if (parts.length !== 2) return;
    if (parts[0] === username || parts[1] === username) chatIds.add(cid);
  });
  (groups || []).forEach(g => chatIds.add(g.id));
  for (const cid of chatIds) {
    chats[cid] = await getChatMessages(cid);
  }
  return chats;
}

async function getChatMessages(chatId, limit = 2000) {
  const rows = await dbAll('SELECT * FROM messages WHERE chat_id=? ORDER BY time ASC LIMIT ?', [chatId, limit]);
  return rows.map(msgFromDb);
}

function msgFromDb(row) {
  if (!row) return null;
  return {
    id: row.id, type: row.type, chatId: row.chat_id,
    userId: row.user_id, username: row.username,
    color: row.color, avatar: row.avatar, avatarUrl: row.avatar_url,
    text: row.text || '', time: row.time,
    reactions: parseJSON(row.reactions, {}),
    replyTo: parseJSON(row.reply_to, null),
    edited: !!row.edited, deleted: !!row.deleted,
    deletedFor: parseJSON(row.deleted_for, []),
    attachments: parseJSON(row.attachments, null),
    sticker: row.sticker || null,
    stickerUrl: row.sticker_url || null,
    stickerId: row.sticker_id || null,
    mentions: parseJSON(row.mentions, null),
    poll: parseJSON(row.poll, null),
    censored: !!row.censored,
    callType: row.call_type || null,
    callStatus: row.call_status || null,
    duration: row.duration || null,
    forwardedFrom: row.forwarded_from || null,
    scheduledFor: row.scheduled_for || null,
    pendingDelete: !!row.pending_delete,
    pendingDeleteAt: row.pending_delete_at || null
  };
}

async function canAccessChat(chatId, usernameLower) {
  if (chatId.startsWith('g_')) {
    const row = await dbGet('SELECT 1 FROM group_members WHERE group_id=? AND username=?', [chatId, usernameLower]);
    return !!row;
  }
  const [a, b] = chatId.split('::');
  return a === usernameLower || b === usernameLower;
}

async function canWriteToChat(chatId, usernameLower) {
  if (!chatId.startsWith('g_')) return true;
  const g = await dbGet('SELECT * FROM groups_t WHERE id=?', [chatId]);
  if (!g) return false;
  if (g.type !== 'channel') return true;
  return await isGroupAdmin(chatId, usernameLower);
}

async function getGroupMembers(groupId) {
  const rows = await dbAll('SELECT username FROM group_members WHERE group_id=?', [groupId]);
  return rows.map(r => r.username);
}

async function getGroupAdmins(groupId) {
  const rows = await dbAll('SELECT username FROM group_members WHERE group_id=? AND is_admin=1', [groupId]);
  return rows.map(r => r.username);
}

async function isGroupAdmin(groupId, username) {
  const row = await dbGet('SELECT * FROM group_members WHERE group_id=? AND username=?', [groupId, username]);
  if (!row) return false;
  const g = await dbGet('SELECT * FROM groups_t WHERE id=?', [groupId]);
  if (g && g.owner === username) return true;
  return !!row.is_admin;
}

async function getGroup(groupId) {
  const g = await dbGet('SELECT * FROM groups_t WHERE id=?', [groupId]);
  if (!g) return null;
  const members = await getGroupMembers(groupId);
  const admins = await getGroupAdmins(groupId);
  return {
    id: g.id, name: g.name,
    description: g.description || '',
    rules: g.rules || '',
    avatarUrl: g.avatar_url || null,
    type: g.type || 'group',
    owner: g.owner, color: g.color,
    createdAt: g.created_at,
    members, admins
  };
}

/* ============================================================
   STICKER PACKS
   ============================================================ */
async function getStickerPack(packId) {
  const pack = await dbGet('SELECT * FROM sticker_packs WHERE id=?', [packId]);
  if (!pack) return null;
  const stickers = await dbAll('SELECT * FROM stickers WHERE pack_id=? ORDER BY position ASC', [packId]);
  return {
    id: pack.id, owner: pack.owner, name: pack.name,
    description: pack.description || '',
    coverUrl: pack.cover_url || null,
    createdAt: pack.created_at,
    isPublic: !!pack.is_public,
    stickers: stickers.map(s => ({
      id: s.id, packId: s.pack_id, url: s.url,
      emoji: s.emoji || '🎨', position: s.position || 0
    }))
  };
}

async function getMyStickerPacks(ownerKey) {
  const packs = await dbAll('SELECT * FROM sticker_packs WHERE owner=? ORDER BY created_at DESC', [ownerKey]);
  const result = [];
  for (const p of packs) {
    const stickers = await dbAll('SELECT * FROM stickers WHERE pack_id=? ORDER BY position ASC', [p.id]);
    result.push({
      id: p.id, owner: p.owner, name: p.name,
      description: p.description || '',
      coverUrl: p.cover_url || null,
      createdAt: p.created_at,
      isPublic: !!p.is_public,
      stickers: stickers.map(s => ({
        id: s.id, packId: s.pack_id, url: s.url,
        emoji: s.emoji || '🎨', position: s.position || 0
      }))
    });
  }
  return result;
}

async function getPublicStickerPacks(limit = 50) {
  const packs = await dbAll('SELECT * FROM sticker_packs WHERE is_public=1 ORDER BY created_at DESC LIMIT ?', [limit]);
  return packs.map(p => ({
    id: p.id, owner: p.owner, name: p.name,
    description: p.description || '',
    coverUrl: p.cover_url || null,
    createdAt: p.created_at,
    isPublic: true
  }));
}

/* ============================================================
   STORIES
   ============================================================ */
async function getStoriesFor(meKey) {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const rows = await dbAll('SELECT * FROM stories WHERE time > ? ORDER BY time ASC', [cutoff]);
  const views = await dbAll('SELECT * FROM story_views');
  const viewsMap = new Map();
  views.forEach(v => {
    if (!viewsMap.has(v.story_id)) viewsMap.set(v.story_id, []);
    viewsMap.get(v.story_id).push(v.username);
  });
  const accs = await dbAll('SELECT * FROM accounts');
  const accMap = new Map();
  accs.forEach(a => accMap.set(a.username, a));

  const byOwner = new Map();
  rows.forEach(s => {
    if (!byOwner.has(s.owner)) byOwner.set(s.owner, []);
    byOwner.get(s.owner).push(s);
  });

  const result = [];
  byOwner.forEach((items, owner) => {
    const acc = accMap.get(owner);
    if (!acc) return;
    const sorted = items.slice().sort((a, b) => a.time - b.time);
    const viewersByStory = {};
    const hasUnviewed = sorted.some(s => {
      const v = viewsMap.get(s.id) || [];
      viewersByStory[s.id] = v;
      return !v.includes(meKey);
    });
    result.push({
      username: acc.username_display || acc.username,
      usernameLower: owner,
      color: acc.color,
      avatar: acc.avatar,
      avatarUrl: acc.avatar_url,
      isMe: owner === meKey,
      hasUnviewed,
      stories: sorted.map(s => {
        const v = viewersByStory[s.id] || [];
        return {
          id: s.id, url: s.url, mime: s.mime, time: s.time,
          viewed: v.includes(meKey),
          viewersCount: v.length
        };
      })
    });
  });
  result.sort((a, b) => {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
    return (b.stories[b.stories.length - 1]?.time || 0) - (a.stories[a.stories.length - 1]?.time || 0);
  });
  return result;
}

/* ============================================================
   VK
   ============================================================ */
async function vkOnLink(code, vkUser, mode) {
  if (!code && vkUser && vkUser.vkId) {
    const link = await dbGet('SELECT * FROM vk_links WHERE vk_id=?', [vkUser.vkId]);
    if (!link) return { ok: true, linked: false };
    return { ok: true, linked: true, username: link.username, notifyEnabled: !!link.notify_enabled };
  }
  if (code === '__check_vk__') {
    const link = await dbGet('SELECT * FROM vk_links WHERE vk_id=?', [vkUser.vkId]);
    if (link) return { ok: true, linked: true, username: link.username };
    return { ok: true, linked: false };
  }
  if (code === '__toggle_notify__') {
    await dbRun('UPDATE vk_links SET notify_enabled=? WHERE vk_id=?', [vkUser.enable ? 1 : 0, vkUser.vkId]);
    return { ok: true };
  }
  if (code === '__unlink__') {
    const link = await dbGet('SELECT * FROM vk_links WHERE vk_id=?', [vkUser.vkId]);
    if (link) {
      await dbRun('UPDATE accounts SET vk_linked=0 WHERE username=?', [link.username]);
      await dbRun('DELETE FROM vk_links WHERE vk_id=?', [vkUser.vkId]);
    }
    return { ok: true };
  }

  if (mode === 'login') {
    const codeRow = await dbGet('SELECT * FROM vk_login_codes WHERE code=?', [code]);
    if (!codeRow) return { ok: false, error: 'code-not-found' };
    if (codeRow.status === 'used') return { ok: false, error: 'code-used' };
    if (codeRow.status === 'expired' || codeRow.expires_at < Date.now()) {
      await dbRun('UPDATE vk_login_codes SET status="expired" WHERE code=?', [code]);
      return { ok: false, error: 'code-expired' };
    }
    const existingVk = await dbGet('SELECT * FROM vk_links WHERE vk_id=?', [vkUser.vkId]);
    let username;
    let isNew = false;
    if (existingVk) {
      username = existingVk.username;
      await dbRun('UPDATE vk_links SET vk_username=?, vk_first_name=?, vk_last_name=? WHERE vk_id=?',
        [vkUser.vkUsername || existingVk.vk_username, vkUser.vkFirstName || existingVk.vk_first_name, vkUser.vkLastName || existingVk.vk_last_name, vkUser.vkId]);
    } else {
      username = await createAccountFromVk(vkUser);
      if (!username) return { ok: false, error: 'create-failed' };
      isNew = true;
      await dbRun(`INSERT INTO vk_links (vk_id, username, vk_username, vk_first_name, vk_last_name, linked_at, notify_enabled)
        VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [vkUser.vkId, username, vkUser.vkUsername, vkUser.vkFirstName, vkUser.vkLastName, Date.now()]);
      await dbRun('UPDATE accounts SET vk_linked=1 WHERE username=?', [username]);
    }
    await dbRun('UPDATE vk_login_codes SET status="used", vk_id=?, username=?, used_at=? WHERE code=?',
      [vkUser.vkId, username, Date.now(), code]);
    return { ok: true, username, isNew, vkId: vkUser.vkId };
  }

  const codeRow = await dbGet('SELECT * FROM vk_link_codes WHERE code=?', [code]);
  if (!codeRow) return { ok: false, error: 'code-not-found' };
  if (codeRow.used) return { ok: false, error: 'code-used' };
  if (codeRow.expires_at < Date.now()) return { ok: false, error: 'code-expired' };

  const existing = await dbGet('SELECT * FROM vk_links WHERE vk_id=?', [vkUser.vkId]);
  if (existing) return { ok: false, error: 'already-linked' };

  const existingUser = await dbGet('SELECT * FROM vk_links WHERE username=?', [codeRow.username]);
  if (existingUser) await dbRun('DELETE FROM vk_links WHERE vk_id=?', [existingUser.vk_id]);

  await dbRun(`INSERT INTO vk_links (vk_id, username, vk_username, vk_first_name, vk_last_name, linked_at, notify_enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [vkUser.vkId, codeRow.username, vkUser.vkUsername, vkUser.vkFirstName, vkUser.vkLastName, Date.now()]);
  await dbRun('UPDATE vk_link_codes SET used=1 WHERE code=?', [code]);
  await dbRun('UPDATE accounts SET vk_linked=1 WHERE username=?', [codeRow.username]);
  return { ok: true, username: codeRow.username };
}

async function sendVkNotification(username, title, text, chatId) {
  try {
    const link = await dbGet('SELECT * FROM vk_links WHERE username=?', [username]);
    if (!link || !link.notify_enabled) return false;
    await botService.sendNotification(link.vk_id, title, text, chatId);
    return true;
  } catch (e) { return false; }
}

/* ============================================================
   АВТОСОЗДАНИЕ АККАУНТОВ
   ============================================================ */
async function createAccountFromGoogle(gUser) {
  try {
    let base = gUser.email ? gUser.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_') : 'g_' + gUser.id;
    if (base.length < 3) base = 'user_' + base;
    if (base.length > 20) base = base.slice(0, 20);
    let username = base, attempts = 0;
    while (attempts < 20) {
      if (!(await dbGet('SELECT 1 FROM accounts WHERE username=?', [username]))) break;
      attempts++;
      username = base + '_' + Math.floor(Math.random() * 9999);
    }
    if (attempts >= 20) return null;
    const rnd = crypto.randomBytes(16).toString('hex');
    await dbRun(`INSERT INTO accounts (username, username_display, password_hash, bio, birthday, email, email_verified,
      phone, phone_verified, color, avatar, avatar_url, created_at, is_admin, is_verified, is_banned, vk_linked,
      google_id, google_email)
      VALUES (?, ?, ?, ?, '', ?, 1, '', 0, ?, NULL, NULL, ?, 0, 0, 0, 0, ?, ?)`,
      [username, username, hashPassword(rnd), gUser.name ? gUser.name.slice(0, 200) : '', gUser.email || '', randColor(), Date.now(), String(gUser.id), gUser.email || '']);
    await dbRun('INSERT OR IGNORE INTO privacy (username) VALUES (?)', [username]);
    await dbRun('INSERT OR IGNORE INTO settings (username, data) VALUES (?, ?)', [username, JSON.stringify({
      theme: 'dark', accent: 'violet', sound: true, notifications: true,
      density: 'normal', fontSize: 14, wallpaper: null, quietHours: false, themeMode: 'manual',
      soundType: 'soft', vibration: true
    })]);
    return username;
  } catch (e) { console.error('createAccountFromGoogle', e); return null; }
}

async function createAccountFromEmail(email) {
  try {
    let base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (base.length < 3) base = 'user_' + base;
    if (base.length > 20) base = base.slice(0, 20);
    let username = base, attempts = 0;
    while (attempts < 20) {
      if (!(await dbGet('SELECT 1 FROM accounts WHERE username=?', [username]))) break;
      attempts++;
      username = base + '_' + Math.floor(Math.random() * 9999);
    }
    if (attempts >= 20) return null;
    const rnd = crypto.randomBytes(16).toString('hex');
    await dbRun(`INSERT INTO accounts (username, username_display, password_hash, bio, birthday, email, email_verified,
      phone, phone_verified, color, avatar, avatar_url, created_at, is_admin, is_verified, is_banned, vk_linked,
      email_login_created)
      VALUES (?, ?, ?, '', '', ?, 1, '', 0, ?, NULL, NULL, ?, 0, 0, 0, 0, 1)`,
      [username, username, hashPassword(rnd), email, randColor(), Date.now()]);
    await dbRun('INSERT OR IGNORE INTO privacy (username) VALUES (?)', [username]);
    await dbRun('INSERT OR IGNORE INTO settings (username, data) VALUES (?, ?)', [username, JSON.stringify({
      theme: 'dark', accent: 'violet', sound: true, notifications: true,
      density: 'normal', fontSize: 14, wallpaper: null, quietHours: false, themeMode: 'manual',
      soundType: 'soft', vibration: true
    })]);
    return username;
  } catch (e) { console.error('createAccountFromEmail', e); return null; }
}

async function createAccountFromVk(vkUser) {
  try {
    let base;
    if (vkUser.vkUsername && /^[a-zA-Z0-9_]{3,20}$/.test(vkUser.vkUsername)) base = vkUser.vkUsername.toLowerCase();
    else base = 'vk_' + vkUser.vkId;
    let username = base, attempts = 0;
    while (attempts < 20) {
      if (!(await dbGet('SELECT 1 FROM accounts WHERE username=?', [username]))) break;
      attempts++;
      username = base + '_' + Math.floor(Math.random() * 9999);
    }
    if (attempts >= 20) return null;
    const rnd = crypto.randomBytes(16).toString('hex');
    await dbRun(`INSERT INTO accounts (username, username_display, password_hash, bio, birthday, email, email_verified,
      phone, phone_verified, color, avatar, avatar_url, created_at, is_admin, is_verified, is_banned, vk_linked)
      VALUES (?, ?, ?, ?, '', '', 0, '', 0, ?, NULL, NULL, ?, 0, 0, 0, 1)`,
      [username, username, hashPassword(rnd),
       vkUser.vkFirstName && vkUser.vkLastName ? (vkUser.vkFirstName + ' ' + vkUser.vkLastName).slice(0, 200) : '',
       randColor(), Date.now()]);
    await dbRun('INSERT OR IGNORE INTO privacy (username) VALUES (?)', [username]);
    await dbRun('INSERT OR IGNORE INTO settings (username, data) VALUES (?, ?)', [username, JSON.stringify({
      theme: 'dark', accent: 'violet', sound: true, notifications: true,
      density: 'normal', fontSize: 14, wallpaper: null, quietHours: false, themeMode: 'manual',
      soundType: 'soft', vibration: true
    })]);
    return username;
  } catch (e) { console.error('createAccountFromVk', e); return null; }
}

/* ============================================================
   REST API ДЛЯ ANDROID-ПРИЛОЖЕНИЯ
   ============================================================ */

// Middleware — парсинг JSON-тела
app.use(express.json({ limit: '1mb' }));

// Middleware — проверка токена
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ ok: false, error: 'no-token' });
    const sess = await dbGet('SELECT * FROM sessions WHERE token=?', [token]);
    if (!sess) return res.status(401).json({ ok: false, error: 'invalid-token' });
    if (sess.expires_at && sess.expires_at < Date.now()) {
      await dbRun('DELETE FROM sessions WHERE token=?', [token]);
      return res.status(401).json({ ok: false, error: 'token-expired' });
    }
    const acc = await dbGet('SELECT * FROM accounts WHERE username=?', [sess.username]);
    if (!acc) return res.status(401).json({ ok: false, error: 'no-account' });
    if (acc.is_banned) return res.status(403).json({ ok: false, error: 'banned', reason: acc.ban_reason || '' });
    req.user = acc;
    req.token = token;
    next();
  } catch (e) {
    console.error('requireAuth:', e);
    res.status(500).json({ ok: false, error: 'server-error' });
  }
}

/* ---------- PING (проверка что API живой) ---------- */
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, service: 'danumes-api', version: 1, time: Date.now() });
});

/* ---------- РЕГИСТРАЦИЯ ---------- */
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email, phone } = req.body || {};
    const uname = String(username || '').trim();
    const pass = String(password || '');
    const em = String(email || '').trim().toLowerCase();
    const ph = String(phone || '').trim().replace(/[^\d+]/g, '');

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) {
      return res.status(400).json({ ok: false, error: '3–20 символов, латиница/цифры/_' });
    }
    if (pass.length < 4) {
      return res.status(400).json({ ok: false, error: 'Пароль минимум 4 символа' });
    }

    const key = uname.toLowerCase();
    if (await dbGet('SELECT 1 FROM accounts WHERE username=?', [key])) {
      return res.status(409).json({ ok: false, error: 'Юзернейм занят' });
    }

    if (em) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        return res.status(400).json({ ok: false, error: 'Некорректный email' });
      }
      if (await dbGet('SELECT 1 FROM accounts WHERE email=?', [em])) {
        return res.status(409).json({ ok: false, error: 'Email уже используется' });
      }
    }

    if (ph) {
      if (await dbGet('SELECT 1 FROM accounts WHERE phone=?', [ph])) {
        return res.status(409).json({ ok: false, error: 'Телефон уже используется' });
      }
    }

    await dbRun(`INSERT INTO accounts (username, username_display, password_hash, bio, birthday, email, email_verified,
      phone, phone_verified, color, avatar, avatar_url, created_at, is_admin, is_verified, is_banned, vk_linked)
      VALUES (?, ?, ?, '', '', ?, 0, ?, 0, ?, NULL, NULL, ?, 0, 0, 0, 0)`,
      [key, uname, hashPassword(pass), em, ph, randColor(), Date.now()]);

    await dbRun('INSERT OR IGNORE INTO privacy (username) VALUES (?)', [key]);
    await dbRun('INSERT OR IGNORE INTO settings (username, data) VALUES (?, ?)', [key, JSON.stringify({
      theme: 'dark', accent: 'violet', sound: true, notifications: true,
      density: 'normal', fontSize: 14, wallpaper: null, quietHours: false, themeMode: 'manual',
      soundType: 'soft', vibration: true
    })]);

    console.log('✅ REST-регистрация:', uname);
    res.json({ ok: true });
  } catch (e) {
    console.error('api/register:', e);
    res.status(500).json({ ok: false, error: 'Ошибка сервера' });
  }
});

/* ---------- ВХОД ---------- */
app.post('/api/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    const raw = String(login || '').trim();
    const pass = String(password || '');
    if (!raw || !pass) return res.status(400).json({ ok: false, error: 'Заполни поля' });

    const lower = raw.toLowerCase();
    let row = await dbGet('SELECT * FROM accounts WHERE username=?', [lower]);
    if (!row && raw.includes('@')) row = await dbGet('SELECT * FROM accounts WHERE email=?', [lower]);
    if (!row && /^[\d+\s\-()]+$/.test(raw)) {
      const digits = raw.replace(/[^\d+]/g, '');
      row = await dbGet('SELECT * FROM accounts WHERE phone=?', [digits]);
    }

    if (!row) return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    if (!verifyPassword(pass, row.password_hash)) return res.status(401).json({ ok: false, error: 'Неверный пароль' });
    if (row.is_banned) return res.status(403).json({ ok: false, error: 'Заблокирован', reason: row.ban_reason || '' });

    const key = row.username;
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;

    await dbRun('INSERT OR REPLACE INTO sessions (sid, username, joined_at, last_active, ua, token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['rest_' + crypto.randomBytes(6).toString('hex'), key, Date.now(), Date.now(), req.headers['user-agent'] || 'android', sessionToken, expiresAt]);

    const user = accFromDb(row, false);
    console.log('🔑 REST-вход:', key);
    res.json({ ok: true, user, sessionToken, expiresAt });
  } catch (e) {
    console.error('api/login:', e);
    res.status(500).json({ ok: false, error: 'Ошибка сервера' });
  }
});

/* ---------- ВЫХОД ---------- */
app.post('/api/logout', requireAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM sessions WHERE token=?', [req.token]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server-error' });
  }
});

/* ---------- СВОЙ ПРОФИЛЬ ---------- */
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = accFromDb(req.user, false);
    user.email = req.user.email || '';
    user.phone = req.user.phone || '';
    user.emailVerified = !!req.user.email_verified;
    user.phoneVerified = !!req.user.phone_verified;
    user.isBanned = !!req.user.is_banned;
    user.banReason = req.user.ban_reason || '';
    res.json({ ok: true, user });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server-error' });
  }
});

/* ---------- СПИСОК ЧАТОВ ---------- */
app.get('/api/chats', requireAuth, async (req, res) => {
  try {
    const username = req.user.username;

    // Личные чаты
    const myMessages = await dbAll(`SELECT DISTINCT chat_id FROM messages WHERE chat_id NOT LIKE 'g_%'`);
    const chatIds = [];
    for (const r of myMessages) {
      const cid = r.chat_id;
      if (!cid || !cid.includes('::')) continue;
      const [a, b] = cid.split('::');
      if (a === username || b === username) chatIds.push(cid);
    }

    // Группы пользователя
    const myGroups = await dbAll('SELECT group_id FROM group_members WHERE username=?', [username]);

    const chats = [];

    // Обрабатываем личные чаты
    for (const cid of chatIds) {
      const [a, b] = cid.split('::');
      const otherKey = a === username ? b : a;
      const otherAcc = await dbGet('SELECT * FROM accounts WHERE username=?', [otherKey]);
      if (!otherAcc) continue;

      const lastMsg = await dbGet('SELECT * FROM messages WHERE chat_id=? ORDER BY time DESC LIMIT 1', [cid]);
      const unreadRow = await dbGet('SELECT COUNT(*) as c FROM messages WHERE chat_id=? AND user_id != ? AND time > ?',
        [cid, username, 0]);

      chats.push({
        id: cid,
        type: 'private',
        name: otherAcc.username_display || otherAcc.username,
        usernameLower: otherKey,
        color: otherAcc.color,
        avatar: otherAcc.avatar,
        avatarUrl: otherAcc.avatar_url,
        online: isOnline(otherKey),
        lastMessage: lastMsg ? (lastMsg.deleted ? 'Сообщение удалено' : (lastMsg.text || '📎 Вложение')) : '',
        lastTime: lastMsg ? lastMsg.time : 0,
        lastIsOwn: lastMsg ? (lastMsg.user_id === username) : false,
        unreadCount: 0
      });
    }

    // Обрабатываем группы
    for (const gm of myGroups) {
      const g = await getGroup(gm.group_id);
      if (!g) continue;
      const lastMsg = await dbGet('SELECT * FROM messages WHERE chat_id=? ORDER BY time DESC LIMIT 1', [g.id]);
      chats.push({
        id: g.id,
        type: g.type || 'group',
        name: g.name,
        usernameLower: g.id,
        color: g.color,
        avatar: null,
        avatarUrl: g.avatarUrl,
        online: false,
        lastMessage: lastMsg ? (lastMsg.deleted ? 'Сообщение удалено' : (lastMsg.text || '📎 Вложение')) : '',
        lastTime: lastMsg ? lastMsg.time : g.createdAt,
        lastIsOwn: lastMsg ? (lastMsg.user_id === username) : false,
        unreadCount: 0
      });
    }

    // Сортируем по времени
    chats.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));

    res.json({ ok: true, chats });
  } catch (e) {
    console.error('api/chats:', e);
    res.status(500).json({ ok: false, error: 'server-error' });
  }
});

/* ---------- СООБЩЕНИЯ ЧАТА ---------- */
app.get('/api/chats/:chatId/messages', requireAuth, async (req, res) => {
  try {
    const chatId = decodeURIComponent(req.params.chatId);
    const username = req.user.username;

    if (!(await canAccessChat(chatId, username))) {
      return res.status(403).json({ ok: false, error: 'no-access' });
    }

    const messages = await getChatMessages(chatId);
    res.json({ ok: true, chatId, messages });
  } catch (e) {
    console.error('api/messages:', e);
    res.status(500).json({ ok: false, error: 'server-error' });
  }
});

/* ---------- ОТПРАВИТЬ СООБЩЕНИЕ ---------- */
app.post('/api/chats/:chatId/messages', requireAuth, async (req, res) => {
  try {
    const chatId = decodeURIComponent(req.params.chatId);
    const username = req.user.username;
    const acc = req.user;
    const { text } = req.body || {};

    if (!(await canAccessChat(chatId, username))) {
      return res.status(403).json({ ok: false, error: 'no-access' });
    }
    if (!(await canWriteToChat(chatId, username))) {
      return res.status(403).json({ ok: false, error: 'Только админы' });
    }

    let clean = String(text || '').trim().slice(0, 4000);
    if (!clean) return res.status(400).json({ ok: false, error: 'empty' });

    const hadBad = hasBadWords(clean);
    if (hadBad) clean = filterBadWords(clean);

    const id = uid('m');
    const time = Date.now();

    await dbRun(`INSERT INTO messages (id, chat_id, type, user_id, username, color, avatar, avatar_url, text, time,
      reactions, reply_to, edited, deleted, deleted_for, censored)
      VALUES (?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, '{}', NULL, 0, 0, '[]', ?)`,
      [id, chatId, username, acc.username_display || acc.username, acc.color, acc.avatar, acc.avatar_url, clean, time, hadBad ? 1 : 0]);

    const saved = await dbGet('SELECT * FROM messages WHERE id=?', [id]);
    const msg = msgFromDb(saved);

    // Отправляем всем подключённым через Socket.IO
    await emitToChat(chatId, 'message', msg);

    res.json({ ok: true, msg });
  } catch (e) {
    console.error('api/send:', e);
    res.status(500).json({ ok: false, error: 'server-error' });
  }
});

/* ---------- ПОИСК ЛЮДЕЙ ---------- */
app.get('/api/users/search', requireAuth, async (req, res) => {
  try {
    const me = req.user;
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json({ ok: true, users: [] });

    const rows = await dbAll('SELECT * FROM accounts WHERE LOWER(username) LIKE ? AND username != ? LIMIT 30',
      ['%' + q + '%', me.username]);
    const users = rows.map(r => publicUser(accFromDb(r, isOnline(r.username)), !!me.is_admin));
    res.json({ ok: true, users });
  } catch (e) {
    console.error('api/users/search:', e);
    res.status(500).json({ ok: false, error: 'server-error' });
  }
});

/* ---------- ОТКРЫТИЕ ЧАТА ПО ЮЗЕРНЕЙМУ (создаёт при необходимости) ---------- */
app.post('/api/chats/open', requireAuth, async (req, res) => {
  try {
    const me = req.user;
    const { withUsername } = req.body || {};
    const otherKey = String(withUsername || '').toLowerCase();
    if (!otherKey || otherKey === me.username) {
      return res.status(400).json({ ok: false, error: 'invalid-user' });
    }
    const other = await dbGet('SELECT * FROM accounts WHERE username=?', [otherKey]);
    if (!other) return res.status(404).json({ ok: false, error: 'user-not-found' });

    const chatId = chatKey(me.username, otherKey);
    const messages = await getChatMessages(chatId);

    res.json({
      ok: true,
      chatId,
      messages,
      otherUser: publicUser(accFromDb(other, isOnline(otherKey)), !!me.is_admin),
      chatType: 'private'
    });
  } catch (e) {
    console.error('api/chats/open:', e);
    res.status(500).json({ ok: false, error: 'server-error' });
  }
});

/* ---------- СОЗДАНИЕ ГРУППЫ / КАНАЛА ---------- */
app.post('/api/groups/create', requireAuth, async (req, res) => {
  try {
    const me = req.user;
    const { name, description, type, members, avatarUrl, color } = req.body || {};

    const gname = String(name || '').trim().slice(0, 60);
    if (gname.length < 3) {
      return res.status(400).json({ ok: false, error: 'Название минимум 3 символа' });
    }
    const gtype = type === 'channel' ? 'channel' : 'group';
    const desc = String(description || '').slice(0, 200);
    const gcolor = (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
      ? color : randColor();

    const gid = uid('g');

    // Вставляем группу
    await dbRun(
      `INSERT INTO groups_t (id, name, description, rules, avatar_url, type, owner, color, created_at)
       VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)`,
      [gid, gname, desc, avatarUrl || null, gtype, me.username, gcolor, Date.now()]
    );

    // Владелец — админ
    await dbRun(
      'INSERT OR REPLACE INTO group_members (group_id, username, is_admin) VALUES (?, ?, 1)',
      [gid, me.username]
    );

    // Системное сообщение о создании
    const sysId = uid('m');
    await dbRun(
      `INSERT INTO messages (id, chat_id, type, text, time) VALUES (?, ?, 'system', ?, ?)`,
      [sysId, gid, (me.username_display || me.username) + ' создал' +
        (gtype === 'channel' ? ' канал' : ' группу'), Date.now()]
    );

    // Добавляем участников (если переданы)
    let addedMembers = 0;
    if (Array.isArray(members) && members.length) {
      for (const m of members) {
        const k = String(m).toLowerCase().trim();
        if (!k || k === me.username) continue;
        const exists = await dbGet('SELECT 1 FROM accounts WHERE username=?', [k]);
        if (!exists) continue;
        await dbRun(
          'INSERT OR REPLACE INTO group_members (group_id, username, is_admin) VALUES (?, ?, 0)',
          [gid, k]
        );
        const joinId = uid('m');
        await dbRun(
          `INSERT INTO messages (id, chat_id, type, text, time) VALUES (?, ?, 'system', ?, ?)`,
          [joinId, gid, (exists.username_display || k) + ' присоединился', Date.now()]
        );
        addedMembers++;
      }
    }

    // Оповещаем тех, кто онлайн (через Socket.IO)
    try {
      const g = await getGroup(gid);
      if (g) {
        for (const member of g.members) {
          emitToUser(member, 'group:updated', g);
        }
        await emitToChat(gid, 'group:created', g);
      }
    } catch (e) {
      console.error('group-create emit:', e.message);
    }

    console.log(`✅ Создана ${gtype}: ${gname} (${gid}) — участников: ${addedMembers + 1}`);

    res.json({
      ok: true,
      groupId: gid,
      chatId: gid,
      name: gname,
      type: gtype,
      membersCount: addedMembers + 1
    });
  } catch (e) {
    console.error('api/groups/create:', e);
    res.status(500).json({ ok: false, error: 'server-error' });
  }
});
/* ============================================================
   КОНЕЦ REST API
   ============================================================ */

/* ============================================================
   ЗАПУСК
   ============================================================ */
const PORT = process.env.PORT || 3000;

async function startServer() {
  await initTables();

  server.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n✦ Danumes v24 (Turso) → порт ${PORT}\n`);

    try {
      const botResult = await botService.initBot(null, {
        onLink: vkOnLink,
        onMessage: null
      });
      if (botResult.ok) console.log(`✅ VK-бот: ${botResult.groupName}`);
      else console.log(`⚠️  VK-бот: ${botResult.error || 'ошибка'}`);
    } catch (e) { console.log('⚠️  VK-бот не запущен:', e.message); }

    try {
      const emailResult = emailService.initEmail();
      if (emailResult.ok) console.log(`✅ Email: ${emailResult.email}`);
      else console.log(`⚠️  Email: ${emailResult.error || 'ошибка'}`);
    } catch (e) { console.log('⚠️  Email не запущен:', e.message); }

    try {
      const googleResult = googleOAuthService.initGoogle();
      if (googleResult.ok) console.log('✅ Google OAuth готов');
      else console.log(`⚠️  Google: ${googleResult.error || 'ошибка'}`);
    } catch (e) { console.log('⚠️  Google OAuth не запущен:', e.message); }

    console.log('\n🚀 Сервер готов\n');
  });
}

startServer().catch(err => {
  console.error('❌ Ошибка запуска:', err);
  process.exit(1);
});

/* ============================================================
   КОНЕЦ ФАЙЛА server.js
   ============================================================ */