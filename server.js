/* ============================================================
   DANUMES · server.js v24 (Turso) — SAFE BOOT
   ============================================================ */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { uploadToSupabase } = require('./supabase-storage');

const { createClient } = require('@libsql/client');

/* ---------- .ENV ---------- */
try {
  if (fs.existsSync('.env')) {
    fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  }
} catch (e) { console.log('⚠️  .env не прочитан:', e.message); }

/* ---------- SAFETY: не падать от uncaught ---------- */
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
});

/* ---------- TURSO ---------- */
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('❌ TURSO_DATABASE_URL или TURSO_AUTH_TOKEN не заданы');
  process.exit(1);
}

let db = null;
try {
  db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  console.log('✅ Turso клиент создан:', TURSO_URL);
} catch (e) {
  console.error('❌ Ошибка создания Turso клиента:', e.message);
  process.exit(1);
}

/* ---------- SQL HELPERS ---------- */
async function dbGet(sql, params = []) {
  try { const r = await db.execute({ sql, args: params }); return r.rows[0] || null; }
  catch (e) { console.error('dbGet:', e.message); return null; }
}
async function dbAll(sql, params = []) {
  try { const r = await db.execute({ sql, args: params }); return r.rows || []; }
  catch (e) { console.error('dbAll:', e.message); return []; }
}
async function dbRun(sql, params = []) {
  try { return await db.execute({ sql, args: params }); }
  catch (e) {
    console.error('dbRun FAIL:', e.message);
    console.error('  SQL:', sql);
    console.error('  ARGS:', JSON.stringify(params).slice(0, 300));
    return null;
  }
}
async function dbExec(sql) {
  try { await db.executeMultiple(sql); return true; }
  catch (e) { console.error('dbExec:', e.message); return false; }
}

/* ---------- СОЗДАНИЕ ТАБЛИЦ ---------- */
async function initTables() {
  const schema = `
    CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, username_display TEXT NOT NULL, password_hash TEXT NOT NULL, bio TEXT DEFAULT '', birthday TEXT DEFAULT '', email TEXT DEFAULT '', email_verified INTEGER DEFAULT 0, phone TEXT DEFAULT '', phone_verified INTEGER DEFAULT 0, color TEXT NOT NULL, avatar TEXT, avatar_url TEXT, created_at INTEGER NOT NULL, is_admin INTEGER DEFAULT 0, is_verified INTEGER DEFAULT 0, is_banned INTEGER DEFAULT 0, ban_reason TEXT DEFAULT '', banned_at INTEGER, vk_linked INTEGER DEFAULT 0, google_id TEXT, google_email TEXT, email_login_created INTEGER DEFAULT 0, vk_oauth_created INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, type TEXT DEFAULT 'user', user_id TEXT, username TEXT, color TEXT, avatar TEXT, avatar_url TEXT, text TEXT DEFAULT '', time INTEGER NOT NULL, reactions TEXT DEFAULT '{}', reply_to TEXT, edited INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0, deleted_for TEXT DEFAULT '[]', attachments TEXT, sticker TEXT, sticker_url TEXT, sticker_id TEXT, mentions TEXT, poll TEXT, censored INTEGER DEFAULT 0, call_type TEXT, call_status TEXT, duration INTEGER, forwarded_from TEXT, scheduled_for INTEGER, pending_delete INTEGER DEFAULT 0, pending_delete_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, time);
    CREATE TABLE IF NOT EXISTS groups_t (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', rules TEXT DEFAULT '', avatar_url TEXT, type TEXT DEFAULT 'group', owner TEXT NOT NULL, color TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL, username TEXT NOT NULL, is_admin INTEGER DEFAULT 0, PRIMARY KEY (group_id, username));
    CREATE TABLE IF NOT EXISTS settings (username TEXT PRIMARY KEY, data TEXT DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, username TEXT NOT NULL, joined_at INTEGER, last_active INTEGER, ua TEXT, token TEXT UNIQUE, expires_at INTEGER);
    CREATE TABLE IF NOT EXISTS pinned_chats (username TEXT NOT NULL, chat_id TEXT NOT NULL, PRIMARY KEY (username, chat_id));
    CREATE TABLE IF NOT EXISTS muted_chats (username TEXT NOT NULL, chat_id TEXT NOT NULL, PRIMARY KEY (username, chat_id));
    CREATE TABLE IF NOT EXISTS pinned_msgs (username TEXT NOT NULL, chat_id TEXT NOT NULL, message_id TEXT, PRIMARY KEY (username, chat_id));
    CREATE TABLE IF NOT EXISTS contacts (owner TEXT NOT NULL, contact TEXT NOT NULL, PRIMARY KEY (owner, contact));
    CREATE TABLE IF NOT EXISTS privacy (username TEXT PRIMARY KEY, last_seen TEXT DEFAULT 'all', online TEXT DEFAULT 'all', read_receipts TEXT DEFAULT 'all');
    CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, group_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_by TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS join_requests (group_id TEXT NOT NULL, username TEXT NOT NULL, requested_by TEXT, requested_at INTEGER, PRIMARY KEY (group_id, username));
    CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, owner TEXT NOT NULL, url TEXT NOT NULL, mime TEXT DEFAULT 'image/jpeg', time INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_stories_time ON stories(time);
    CREATE TABLE IF NOT EXISTS story_views (story_id TEXT NOT NULL, username TEXT NOT NULL, viewed_at INTEGER, PRIMARY KEY (story_id, username));
    CREATE TABLE IF NOT EXISTS last_seen (username TEXT PRIMARY KEY, time INTEGER);
    CREATE TABLE IF NOT EXISTS vk_links (vk_id TEXT PRIMARY KEY, username TEXT NOT NULL, vk_username TEXT, vk_first_name TEXT, vk_last_name TEXT, linked_at INTEGER, notify_enabled INTEGER DEFAULT 1, phone TEXT, phone_verified INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS vk_link_codes (code TEXT PRIMARY KEY, username TEXT NOT NULL, created_at INTEGER, expires_at INTEGER, used INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS vk_login_codes (code TEXT PRIMARY KEY, status TEXT DEFAULT 'pending', created_at INTEGER, expires_at INTEGER, vk_id TEXT, username TEXT, used_at INTEGER);
    CREATE TABLE IF NOT EXISTS email_login_codes (email TEXT, code TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, created_at INTEGER, expires_at INTEGER, used_at INTEGER, PRIMARY KEY (email, code));
    CREATE TABLE IF NOT EXISTS sticker_packs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', cover_url TEXT, created_at INTEGER NOT NULL, is_public INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS stickers (id TEXT PRIMARY KEY, pack_id TEXT NOT NULL, url TEXT NOT NULL, emoji TEXT DEFAULT '🎨', position INTEGER DEFAULT 0, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS broadcasts (id TEXT PRIMARY KEY, text TEXT, from_username TEXT, time INTEGER, sent_to INTEGER);
  `;
  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try { await db.execute(stmt); }
    catch (e) { if (!e.message.includes('already exists')) console.error('SQL init error:', e.message); }
  }
  console.log('✅ Таблицы инициализированы');
}

/* ---------- EXPRESS ---------- */
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 25e6 });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// multer теперь хранит файл в памяти
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Новый /upload — отправляет файл в Telegram
// /upload — сохраняет файл в PostgreSQL
app.post('/upload', (req, res) => {
  upload.single('file')(req, res, async err => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    if (!req.file) return res.status(400).json({ ok: false, error: 'no-file' });

    const result = await uploadToSupabase(
      req.file.buffer,
      req.file.originalname || 'file',
      req.file.mimetype
    );

    if (!result.ok) return res.status(500).json({ ok: false, error: result.error });

    res.json({
      ok: true,
      url: result.url,
      fileId: result.fileId,
      name: req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype
    });
  });
});

// /pg-file/:oid — отдаёт файл из PostgreSQL
// /pg-file/:fileId — отдаёт файл из PostgreSQL

/* ---------- PREVIEW ---------- */
const previewCache = new Map();
app.get('/preview', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return res.json({ ok: false, error: 'bad-url' });
  const cached = previewCache.get(url);
  if (cached && Date.now() - cached.time < 3600 * 1000) return res.json(cached.data);
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DanumesBot/1.0)' } });
    clearTimeout(t);
    if (!resp.ok) return res.json({ ok: false, error: 'http-' + resp.status });
    const ctype = resp.headers.get('content-type') || '';
    if (!ctype.includes('text/html')) return res.json({ ok: false, error: 'not-html' });
    const reader = resp.body.getReader();
    let html = '', received = 0;
    const decoder = new TextDecoder('utf-8');
    while (received < 80000) { const { done, value } = await reader.read(); if (done) break; html += decoder.decode(value, { stream: true }); received += value.length; }
    try { reader.cancel(); } catch (e) {}
    const getMeta = prop => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
      const m = html.match(re); if (m) return m[1].trim();
      const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
      const m2 = html.match(re2); return m2 ? m2[1].trim() : '';
    };
    const getTitle = () => { const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? m[1].trim() : ''; };
    let title = (getMeta('og:title') || getTitle() || '').slice(0, 200);
    let description = (getMeta('og:description') || getMeta('description') || '').slice(0, 300);
    let image = getMeta('og:image') || getMeta('twitter:image') || '';
    const siteName = getMeta('og:site_name') || new URL(url).hostname;
    if (image && !/^https?:\/\//i.test(image)) {
      if (image.startsWith('//')) image = 'https:' + image;
      else { const u = new URL(url); image = image.startsWith('/') ? (u.origin + image) : (u.origin + '/' + image); }
    }
    const result = { ok: true, url, title, description, image, siteName };
    previewCache.set(url, { data: result, time: Date.now() });
    if (previewCache.size > 200) previewCache.delete(previewCache.keys().next().value);
    res.json(result);
  } catch (e) { res.json({ ok: false, error: e.message || 'fetch-error' }); }
});

/* ---------- ЗАГЛУШКИ (бывшие сервисы) ---------- */
const botService = {
  async initBot() { return { ok: false, error: 'disabled' }; },
  generateLinkCode() { return String(Math.random()).slice(2, 8); },
  async sendNotification() { return false; }
};
const emailService = {
  generateCode() { return String(Math.floor(100000 + Math.random() * 900000)); },
  async sendLoginCode() { return { ok: false, error: 'SMTP disabled' }; },
  initEmail() { return { ok: false, error: 'disabled' }; }
};
const googleOAuthService = {
  isConfigured() { return false; },
  generateAuthUrl() { return '/'; },
  async handleCallback() { return { ok: false, error: 'disabled' }; },
  initGoogle() { return { ok: false, error: 'disabled' }; }
};

/* ---------- СТАТИЧЕСКИЙ FALLBACK ---------- */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/socket.io') || req.path.startsWith('/upload') || req.path.startsWith('/uploads') ||
      req.path.startsWith('/preview') || req.path.startsWith('/auth') || req.path.startsWith('/api')) return next();
  try { res.sendFile(path.join(__dirname, 'public', 'index.html')); }
  catch (e) { res.status(500).send('Not found'); }
});

/* ---------- УТИЛИТЫ ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  try { const [salt, hash] = stored.split(':'); const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex'); return check === hash; }
  catch { return false; }
}
const COLORS = ['#a855f7','#ec4899','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#d946ef','#14b8a6','#f97316','#3b82f6','#84cc16'];
const randColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
const chatKey = (a, b) => [a, b].sort().join('::');
const uid = prefix => (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

/* ---------- БАНВОРД ---------- */
const BAD_WORDS = ['бля','бляд','блят','блять','блядь','сука','сучк','хуй','хуя','хую','хуе','хуё','хер','пизд','пизда','пиздец','пиздёж','еба','ёба','ебал','ебан','ебуч','ебат','ебёт','ебет','мудак','мудил','мраз','мразь','гандон','гондон','долбоеб','долбоёб','пидор','пидар','пидр','шлюх','шлюшк','шалав','проститут','говн','говно','говнюк','дерьм','срать','срак','срака','жоп','жопа','уебан','уёбан','уебищ','уёбищ','залуп','манда','мандав','педик','педофил','насильник','насилу','изнасил','трах','трахн','отсос','нахуй','нахуя','похуй','похую','охуе','охуи','ахуе','ахуи','нихуя','нехуй','нехуя','дохуя','дохуй'];
const BAD_PATTERNS = BAD_WORDS.map(w => new RegExp(w, 'gi'));
function hasBadWords(text) { const t = String(text || '').toLowerCase(); return BAD_PATTERNS.some(re => { re.lastIndex = 0; return re.test(t); }); }
function filterBadWords(text) { let t = String(text || ''); BAD_PATTERNS.forEach(re => { re.lastIndex = 0; t = t.replace(re, m => '•'.repeat(m.length)); }); return t; }

function parseJSON(s, fallback) { if (!s) return fallback; try { return JSON.parse(s); } catch (e) { return fallback; } }

/* ---------- IN-MEMORY ---------- */
const users = new Map();
const onlineByUsername = new Map();
const activeCalls = new Map();
const socketToCall = new Map();

/* ---------- МАППИНГИ ---------- */
function accFromDb(row, online) {
  if (!row) return null;
  return {
    username: row.username_display || row.username, usernameLower: row.username,
    bio: row.bio || '', birthday: row.birthday || '', email: row.email || '',
    emailVerified: !!row.email_verified, phone: row.phone || '', phoneVerified: !!row.phone_verified,
    color: row.color, avatar: row.avatar || null, avatarUrl: row.avatar_url || null,
    createdAt: row.created_at, online: !!online, isAdmin: !!row.is_admin,
    isVerified: !!row.is_verified, isBanned: !!row.is_banned, banReason: row.ban_reason || '',
    vkLinked: !!row.vk_linked
  };
}
function publicUser(acc, viewerIsAdmin) {
  if (!acc) return null;
  const u = { username: acc.username, usernameLower: acc.usernameLower, bio: acc.bio, birthday: acc.birthday, color: acc.color, avatar: acc.avatar, avatarUrl: acc.avatarUrl, createdAt: acc.createdAt, online: !!acc.online, isAdmin: !!acc.isAdmin, isVerified: !!acc.isVerified, vkLinked: !!acc.vkLinked };
  if (viewerIsAdmin) { u.isBanned = !!acc.isBanned; u.banReason = acc.banReason || ''; }
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
    if (row.username === meKey) { pub.isBanned = !!row.is_banned; pub.banReason = row.ban_reason || ''; pub.email = row.email || ''; pub.phone = row.phone || ''; pub.emailVerified = !!row.email_verified; pub.phoneVerified = !!row.phone_verified; }
    return pub;
  });
}
function isOnline(usernameLower) { const set = onlineByUsername.get(usernameLower); return !!(set && set.size > 0); }

function emitToUser(username, event, payload) {
  const key = String(username).toLowerCase();
  const set = onlineByUsername.get(key);
  if (!set) return;
  set.forEach(sid => { const s = io.sockets.sockets.get(sid); if (s) s.emit(event, payload); });
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
  for (const [, sid] of users) { const s = io.sockets.sockets.get(sid.id); if (s) s.emit('users:update', all); }
}

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

/* ---------- SOCKET.IO ---------- */
io.on('connection', socket => {
  console.log('🟢 connect', socket.id);

  const authToken = socket.handshake?.auth?.token;
  if (authToken) {
    (async () => {
      try {
        const row = await tryAuthByToken(socket, authToken);
        if (!row) { console.log('⚠️  socket auth: сессия не найдена'); return; }
        const payload = await buildRegisteredPayload(row.username);
        socket.emit('registered', { me: { ...accFromDb(row, true), id: socket.id }, users: await getAllUsers(row.username), ...payload });
        await broadcastUsersUpdate();
        console.log('🔑 socket auth: вошёл', row.username);
      } catch (e) { console.error('socket auth:', e.message); }
    })();
  }

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
      if (em) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return cb({ ok: false, error: 'Некорректный email' }); if (await dbGet('SELECT 1 FROM accounts WHERE email=?', [em])) return cb({ ok: false, error: 'Email уже используется' }); }
      if (ph) { if (await dbGet('SELECT 1 FROM accounts WHERE phone=?', [ph])) return cb({ ok: false, error: 'Телефон уже используется' }); }
      await dbRun(`INSERT INTO accounts (username, username_display, password_hash, bio, birthday, email, email_verified, phone, phone_verified, color, avatar, avatar_url, created_at, is_admin, is_verified, is_banned, vk_linked) VALUES (?, ?, ?, '', '', ?, 0, ?, 0, ?, NULL, NULL, ?, 0, 0, 0, 0)`, [key, uname, hashPassword(pass), em, ph, randColor(), Date.now()]);
      await dbRun('INSERT OR IGNORE INTO privacy (username) VALUES (?)', [key]);
      await dbRun('INSERT OR IGNORE INTO settings (username, data) VALUES (?, ?)', [key, JSON.stringify({ theme: 'dark', accent: 'violet', sound: true, notifications: true, density: 'normal', fontSize: 14, wallpaper: null, quietHours: false, themeMode: 'manual', soundType: 'soft', vibration: true })]);
      cb({ ok: true });
    } catch (e) { console.error('register', e); cb({ ok: false, error: 'Ошибка сервера' }); }
  });

  socket.on('auth:login', async ({ login, password }, cb) => {
    try {
      const raw = String(login || '').trim();
      const pass = String(password || '');
      if (!raw || !pass) return cb({ ok: false, error: 'Заполни поля' });
      const lower = raw.toLowerCase();
      let row = await dbGet('SELECT * FROM accounts WHERE username=?', [lower]);
      if (!row && raw.includes('@')) row = await dbGet('SELECT * FROM accounts WHERE email=?', [lower]);
      if (!row && /^[\d+\s\-()]+$/.test(raw)) { const digits = raw.replace(/[^\d+]/g, ''); row = await dbGet('SELECT * FROM accounts WHERE phone=?', [digits]); }
      if (!row) return cb({ ok: false, error: 'Пользователь не найден' });
      if (!verifyPassword(pass, row.password_hash)) return cb({ ok: false, error: 'Неверный пароль' });
      if (row.is_banned) return cb({ ok: false, error: 'Заблокирован' });
      const key = row.username;
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;
      registerSocket(socket, row, sessionToken, expiresAt);
      await dbRun('INSERT OR REPLACE INTO sessions (sid, username, joined_at, last_active, ua, token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['ws_' + crypto.randomBytes(6).toString('hex'), key, Date.now(), Date.now(), 'unknown', sessionToken, expiresAt]);
      const payload = await buildRegisteredPayload(key);
      socket.emit('registered', { me: { ...accFromDb(row, true), id: socket.id }, users: await getAllUsers(key), ...payload });
      await broadcastUsersUpdate();
      cb({ ok: true, user: { ...accFromDb(row, true), id: socket.id }, sessionToken, expiresAt });
    } catch (e) { console.error('login', e); cb({ ok: false, error: 'Ошибка сервера' }); }
  });

  socket.on('auth:resume', async ({ token }, cb) => {
    try {
      if (!token) return cb && cb({ ok: false });
      const sess = await dbGet('SELECT * FROM sessions WHERE token=?', [token]);
      if (!sess) return cb && cb({ ok: false, error: 'Сессия не найдена' });
      if (sess.expires_at && sess.expires_at < Date.now()) { await dbRun('DELETE FROM sessions WHERE token=?', [token]); return cb && cb({ ok: false, error: 'Сессия истекла' }); }
      const row = await dbGet('SELECT * FROM accounts WHERE username=?', [sess.username]);
      if (!row) return cb && cb({ ok: false });
      if (row.is_banned) return cb && cb({ ok: false });
      registerSocket(socket, row, token, sess.expires_at);
      await dbRun('UPDATE sessions SET last_active=? WHERE token=?', [Date.now(), token]);
      const payload = await buildRegisteredPayload(row.username);
      socket.emit('registered', { me: { ...accFromDb(row, true), id: socket.id }, users: await getAllUsers(row.username), ...payload });
      await broadcastUsersUpdate();
      if (cb) cb({ ok: true, user: { ...accFromDb(row, true), id: socket.id }, sessionToken: token });
    } catch (e) { console.error('auth:resume', e); if (cb) cb({ ok: false }); }
  });

  socket.on('auth:logout', async ({ token }, cb) => {
    try { if (token) await dbRun('DELETE FROM sessions WHERE token=?', [token]); if (cb) cb({ ok: true }); }
    catch (e) { if (cb) cb({ ok: false }); }
  });

  socket.on('auth:google-exchange', async ({ loginToken }, cb) => cb && cb({ ok: false, error: 'disabled' }));
  socket.on('auth:email-send-code', async ({ email }, cb) => cb && cb({ ok: false, error: 'disabled' }));
  socket.on('auth:email-verify', async ({ email, code }, cb) => cb && cb({ ok: false, error: 'disabled' }));
  socket.on('vk:login-start', async (cb) => cb && cb({ ok: false, error: 'disabled' }));
  socket.on('vk:login-check', async ({ code }, cb) => cb && cb({ ok: false, error: 'disabled' }));
  socket.on('vk:get-link-code', async (cb) => cb && cb({ ok: false, error: 'disabled' }));
  socket.on('vk:check-link', async (cb) => cb && cb({ ok: false, error: 'disabled' }));
  socket.on('vk:unlink', async (cb) => cb && cb({ ok: false, error: 'disabled' }));

  socket.on('settings:update', async (patch, cb) => {
    const me = users.get(socket.id); if (!me) return cb && cb({ ok: false });
    const row = await dbGet('SELECT * FROM settings WHERE username=?', [me.usernameLower]);
    const current = row ? parseJSON(row.data, {}) : {};
    const merged = Object.assign({}, current, patch || {});
    await dbRun('INSERT OR REPLACE INTO settings (username, data) VALUES (?, ?)', [me.usernameLower, JSON.stringify(merged)]);
    if (cb) cb({ ok: true });
  });

  socket.on('users:search', async ({ query }, cb) => {
    const me = users.get(socket.id); if (!me) return cb && cb([]);
    const q = String(query || '').trim().toLowerCase();
    if (!q) return cb && cb([]);
    const rows = await dbAll('SELECT * FROM accounts WHERE LOWER(username) LIKE ? AND username != ? LIMIT 30', ['%' + q + '%', me.usernameLower]);
    cb(rows.map(r => publicUser(accFromDb(r, isOnline(r.username)), me.isAdmin)));
  });

  socket.on('chat:open', async ({ withUsername }, cb) => {
    const me = users.get(socket.id); if (!me) return cb && cb({ ok: false });
    const otherKey = String(withUsername || '').toLowerCase();
    const otherRow = await dbGet('SELECT * FROM accounts WHERE username=?', [otherKey]);
    if (!otherRow || otherKey === me.usernameLower) return cb && cb({ ok: false, error: 'Нельзя' });
    const chatId = chatKey(me.usernameLower, otherKey);
    const messages = await getChatMessages(chatId);
    const result = { ok: true, chatId, messages, otherUser: publicUser(accFromDb(otherRow, isOnline(otherKey)), me.isAdmin), chatType: 'private' };
    if (cb) cb(result);
    socket.emit('chat:opened', result);
  });

  socket.on('chat:openGroup', async ({ groupId }, cb) => {
    const me = users.get(socket.id); if (!me) return cb && cb({ ok: false });
    const g = await getGroup(groupId);
    if (!g || !g.members.includes(me.usernameLower)) return cb && cb({ ok: false });
    const messages = await getChatMessages(groupId);
    const result = { ok: true, chatId: groupId, messages, group: g, chatType: 'group' };
    if (cb) cb(result);
    socket.emit('chat:opened', result);
  });

socket.on('message:send', async ({ chatId, text, attachments, sticker, stickerUrl }, cb) => {
    let me = users.get(socket.id);
    if (!me) { const tok = socket.handshake?.auth?.token; if (tok) { const row = await tryAuthByToken(socket, tok); if (row) me = users.get(socket.id); } }
    if (!me) return cb && cb({ ok: false, error: 'not-auth' });
    if (!(await canAccessChat(chatId, me.usernameLower))) return cb && cb({ ok: false, error: 'no-access' });
    let clean = String(text || '').trim().slice(0, 4000);
if (!clean && (!attachments || attachments.length === 0) && !sticker && !stickerUrl) {
  return cb && cb({ ok: false, error: 'empty' });
}
    const hadBad = hasBadWords(clean);
    if (hadBad) clean = filterBadWords(clean);
    const id = uid('m');
    const time = Date.now();
        await dbRun(`INSERT INTO messages (id, chat_id, type, user_id, username, color, avatar, avatar_url, text, time, attachments, sticker, sticker_url, reactions, reply_to, edited, deleted, deleted_for, censored) VALUES (?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', NULL, 0, 0, '[]', ?)`,
  [id, chatId, me.usernameLower, me.username, me.color, me.avatar, me.avatarUrl, clean, time, attachments ? JSON.stringify(attachments) : null, sticker || null, stickerUrl || null, hadBad ? 1 : 0]);
    const saved = await dbGet('SELECT * FROM messages WHERE id=?', [id]);
    await emitToChat(chatId, 'message', msgFromDb(saved));
    if (cb) cb({ ok: true, msg: msgFromDb(saved) });
  });

  socket.on('message:edit', async ({ chatId, messageId, newText }) => {
    const me = users.get(socket.id); if (!me) return;
    const row = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    if (!row || row.user_id !== me.usernameLower || row.deleted) return;
    let t = String(newText).slice(0, 4000).trim();
    const hadBad = hasBadWords(t);
    if (hadBad) t = filterBadWords(t);
    await dbRun('UPDATE messages SET text=?, edited=1, censored=? WHERE id=?', [t, hadBad ? 1 : 0, messageId]);
    const updated = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    await emitToChat(chatId, 'message:updated', msgFromDb(updated));
  });

  socket.on('message:delete', async ({ chatId, messageId, delay }) => {
    const me = users.get(socket.id); if (!me) return;
    const row = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    if (!row) return;
    if (row.user_id !== me.usernameLower) return;
    if (delay && delay > 0) {
      const deleteAt = Date.now() + delay;
      await dbRun('UPDATE messages SET pending_delete=1, pending_delete_at=? WHERE id=?', [deleteAt, messageId]);
      await emitToChat(chatId, 'message:pending-delete', { chatId, messageId, by: me.usernameLower, deletedAt: deleteAt });
      setTimeout(async () => {
        await dbRun('UPDATE messages SET deleted=1, text="", pending_delete=0, pending_delete_at=NULL WHERE id=?', [messageId]);
        const final = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
        await emitToChat(chatId, 'message:updated', msgFromDb(final));
      }, delay);
      return;
    }
    await dbRun('UPDATE messages SET deleted=1, text="", pending_delete=0, pending_delete_at=NULL WHERE id=?', [messageId]);
    const updated = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    await emitToChat(chatId, 'message:updated', msgFromDb(updated));
  });

  socket.on('message:undo-delete', async ({ chatId, messageId }) => {
    const me = users.get(socket.id); if (!me) return;
    const row = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    if (!row || !row.pending_delete) return;
    if (row.user_id !== me.usernameLower) return;
    await dbRun('UPDATE messages SET pending_delete=0, pending_delete_at=NULL WHERE id=?', [messageId]);
    await emitToChat(chatId, 'message:undo-delete', { chatId, messageId, by: me.usernameLower });
  });

  socket.on('message:react', async ({ chatId, messageId, emoji }) => {
    const me = users.get(socket.id); if (!me) return;
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

  /* ---------- СТИКЕР-ПАКИ ---------- */

  socket.on('stickers:list-my', async (cb) => {
    const me = users.get(socket.id); if (!me) return cb && cb([]);
    const packs = await dbAll('SELECT * FROM sticker_packs WHERE owner=? ORDER BY created_at DESC', [me.usernameLower]);
    const result = [];
    for (const p of packs) {
      const stickers = await dbAll('SELECT * FROM stickers WHERE pack_id=? ORDER BY position ASC, created_at ASC', [p.id]);
      result.push({
        id: p.id,
        name: p.name,
        description: p.description || '',
        coverUrl: p.cover_url || null,
        isPublic: !!p.is_public,
        stickers: stickers.map(s => ({ id: s.id, url: s.url, emoji: s.emoji || '🎨' }))
      });
    }
    if (cb) cb(result);
  });

  socket.on('stickers:list-public', async ({ }, cb) => {
    const packs = await dbAll('SELECT * FROM sticker_packs WHERE is_public=1 ORDER BY created_at DESC LIMIT 30');
    const result = [];
    for (const p of packs) {
      const stickers = await dbAll('SELECT * FROM stickers WHERE pack_id=? ORDER BY position ASC, created_at ASC', [p.id]);
      result.push({
        id: p.id,
        name: p.name,
        description: p.description || '',
        coverUrl: p.cover_url || null,
        isPublic: true,
        stickers: stickers.map(s => ({ id: s.id, url: s.url, emoji: s.emoji || '🎨' }))
      });
    }
    if (cb) cb(result);
  });

  socket.on('stickers:create-pack', async ({ name, description, isPublic }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false, error: 'not-auth' });
    const n = String(name || '').trim().slice(0, 40);
    if (!n) return cb && cb({ ok: false, error: 'empty-name' });
    const id = uid('sp');
    await dbRun(
      'INSERT INTO sticker_packs (id, owner, name, description, cover_url, created_at, is_public) VALUES (?, ?, ?, ?, NULL, ?, ?)',
      [id, me.usernameLower, n, String(description || '').slice(0, 200), Date.now(), isPublic ? 1 : 0]
    );
    if (cb) cb({ ok: true, id });
  });

  socket.on('stickers:add', async ({ packId, url, emoji }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false, error: 'not-auth' });
    const pack = await dbGet('SELECT * FROM sticker_packs WHERE id=?', [packId]);
    if (!pack || pack.owner !== me.usernameLower) return cb && cb({ ok: false, error: 'no-access' });
    if (!url && !emoji) return cb && cb({ ok: false, error: 'empty' });
    const id = uid('st');
    const pos = (await dbAll('SELECT COUNT(*) as cnt FROM stickers WHERE pack_id=?', [packId]))[0]?.cnt || 0;
    await dbRun(
      'INSERT INTO stickers (id, pack_id, url, emoji, position, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, packId, String(url || ''), String(emoji || '🎨').slice(0, 8), pos, Date.now()]
    );
    if (!pack.cover_url && url) {
      await dbRun('UPDATE sticker_packs SET cover_url=? WHERE id=?', [url, packId]);
    }
    if (cb) cb({ ok: true, id });
  });

  socket.on('stickers:delete', async ({ stickerId }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const st = await dbGet('SELECT * FROM stickers WHERE id=?', [stickerId]);
    if (!st) return cb && cb({ ok: false });
    const pack = await dbGet('SELECT * FROM sticker_packs WHERE id=?', [st.pack_id]);
    if (!pack || pack.owner !== me.usernameLower) return cb && cb({ ok: false, error: 'no-access' });
    await dbRun('DELETE FROM stickers WHERE id=?', [stickerId]);
    if (cb) cb({ ok: true });
  });

  socket.on('stickers:delete-pack', async ({ packId }, cb) => {
    const me = users.get(socket.id);
    if (!me) return cb && cb({ ok: false });
    const pack = await dbGet('SELECT * FROM sticker_packs WHERE id=?', [packId]);
    if (!pack || pack.owner !== me.usernameLower) return cb && cb({ ok: false, error: 'no-access' });
    await dbRun('DELETE FROM stickers WHERE pack_id=?', [packId]);
    await dbRun('DELETE FROM sticker_packs WHERE id=?', [packId]);
    if (cb) cb({ ok: true });
  });
   
  socket.on('poll:vote', async ({ chatId, messageId, optionIndex }) => {
    const me = users.get(socket.id); if (!me) return;
    const row = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    if (!row || !row.poll) return;
    const poll = parseJSON(row.poll, { votes: {} });
    if (!poll.votes) poll.votes = {};
    Object.keys(poll.votes).forEach(k => { poll.votes[k] = poll.votes[k].filter(u => u !== me.usernameLower); });
    if (!poll.votes[optionIndex]) poll.votes[optionIndex] = [];
    if (!poll.votes[optionIndex].includes(me.usernameLower)) poll.votes[optionIndex].push(me.usernameLower);
    await dbRun('UPDATE messages SET poll=? WHERE id=?', [JSON.stringify(poll), messageId]);
    const updated = await dbGet('SELECT * FROM messages WHERE id=?', [messageId]);
    await emitToChat(chatId, 'message:updated', msgFromDb(updated));
  });

  socket.on('message:pin', async ({ chatId, messageId }) => {
    const me = users.get(socket.id); if (!me) return;
    const row = await dbGet('SELECT * FROM pinned_msgs WHERE username=? AND chat_id=?', [me.usernameLower, chatId]);
    if (row && row.message_id === messageId) { await dbRun('DELETE FROM pinned_msgs WHERE username=? AND chat_id=?', [me.usernameLower, chatId]); socket.emit('message:pin-updated', { chatId, messageId: null }); }
    else { await dbRun('INSERT OR REPLACE INTO pinned_msgs (username, chat_id, message_id) VALUES (?, ?, ?)', [me.usernameLower, chatId, messageId]); socket.emit('message:pin-updated', { chatId, messageId }); }
  });

  socket.on('chat:pin', async ({ chatId }) => {
    const me = users.get(socket.id); if (!me) return;
    const row = await dbGet('SELECT 1 FROM pinned_chats WHERE username=? AND chat_id=?', [me.usernameLower, chatId]);
    if (row) await dbRun('DELETE FROM pinned_chats WHERE username=? AND chat_id=?', [me.usernameLower, chatId]);
    else await dbRun('INSERT INTO pinned_chats (username, chat_id) VALUES (?, ?)', [me.usernameLower, chatId]);
    const list = (await dbAll('SELECT chat_id FROM pinned_chats WHERE username=?', [me.usernameLower])).map(r => r.chat_id);
    socket.emit('chat:pinned', { list });
  });

  socket.on('chat:mute', async ({ chatId }) => {
    const me = users.get(socket.id); if (!me) return;
    const row = await dbGet('SELECT 1 FROM muted_chats WHERE username=? AND chat_id=?', [me.usernameLower, chatId]);
    if (row) await dbRun('DELETE FROM muted_chats WHERE username=? AND chat_id=?', [me.usernameLower, chatId]);
    else await dbRun('INSERT INTO muted_chats (username, chat_id) VALUES (?, ?)', [me.usernameLower, chatId]);
    const list = (await dbAll('SELECT chat_id FROM muted_chats WHERE username=?', [me.usernameLower])).map(r => r.chat_id);
    socket.emit('chat:muted', { list });
  });

  socket.on('chat:clear', async ({ chatId }) => {
    const me = users.get(socket.id); if (!me) return;
    await dbRun('DELETE FROM messages WHERE chat_id=?', [chatId]);
    await emitToChat(chatId, 'chat:cleared', { chatId });
  });

  socket.on('chat:read', async ({ chatId }) => {
    const me = users.get(socket.id); if (!me) return;
    if (chatId.startsWith('g_')) {
      const members = await getGroupMembers(chatId);
      members.forEach(m => { if (m !== me.usernameLower) emitToUser(m, 'chat:read', { chatId, by: me.usernameLower, time: Date.now() }); });
    } else {
      const [a, b] = chatId.split('::');
      const peer = a === me.usernameLower ? b : a;
      emitToUser(peer, 'chat:read', { chatId, by: me.usernameLower, time: Date.now() });
    }
  });

  socket.on('typing', async ({ chatId, isTyping }) => {
    const me = users.get(socket.id); if (!me) return;
    if (chatId.startsWith('g_')) {
      const members = await getGroupMembers(chatId);
      members.forEach(m => { if (m !== me.usernameLower) emitToUser(m, 'user:typing', { chatId, username: me.username, isTyping: !!isTyping }); });
    } else {
      const [a, b] = chatId.split('::');
      const peer = a === me.usernameLower ? b : a;
      emitToUser(peer, 'user:typing', { chatId, username: me.username, isTyping: !!isTyping });
    }
  });

  connect', async () => {
    const me = users.get(socket.id);
    if (me) {
      const key = me.usernameLower;
      try { await dbRun('INSERT OR REPLACE INTO last_seen (username, time) VALUES (?, ?)', [key, Date.now()]); } catch (e) {}
      users.delete(socket.id);
      const set = onlineByUsername.get(key);
      if (set) { set.delete(socket.id); if (set.size === 0) onlineByUsername.delete(key); }
      try { await broadcastUsersUpdate(); } catch (e) {}
      console.log('🔴 disconnect', key);
    }
  });
});

/* ---------- ВСПОМОГАТЕЛЬНЫЕ ---------- */
function registerSocket(socket, accRow, sessionToken, expiresAt) {
  const key = accRow.username;
  if (!onlineByUsername.has(key)) onlineByUsername.set(key, new Set());
  onlineByUsername.get(key).add(socket.id);
  users.set(socket.id, { ...accFromDb(accRow, true), id: socket.id });
}

async function buildRegisteredPayload(username) {
  let sRow = await dbGet('SELECT * FROM settings WHERE username=?', [username]);
  if (!sRow) { await dbRun('INSERT INTO settings (username, data) VALUES (?, ?)', [username, '{}']); sRow = { username, data: '{}' }; }
  const contacts = (await dbAll('SELECT contact FROM contacts WHERE owner=?', [username])).map(r => r.contact);
  const pinned = (await dbAll('SELECT chat_id FROM pinned_chats WHERE username=?', [username])).map(r => r.chat_id);
  const muted = (await dbAll('SELECT chat_id FROM muted_chats WHERE username=?', [username])).map(r => r.chat_id);
  const pinnedMsgsRows = await dbAll('SELECT chat_id, message_id FROM pinned_msgs WHERE username=?', [username]);
  const pinnedMsgs = {};
  pinnedMsgsRows.forEach(r => { if (r.message_id) pinnedMsgs[r.chat_id] = r.message_id; });
  const gmRows = await dbAll('SELECT group_id FROM group_members WHERE username=?', [username]);
  const groups = [];
  for (const gm of gmRows) { const g = await getGroup(gm.group_id); if (g) groups.push(g); }
  return { chatHistory: {}, pinned, muted, pinnedMsgs, groups, settings: parseJSON(sRow.data, null), contacts, stories: [], stickerPacks: [] };
}

async function getChatMessages(chatId, limit = 2000) {
  const rows = await dbAll('SELECT * FROM messages WHERE chat_id=? ORDER BY time ASC LIMIT ?', [chatId, limit]);
  return rows.map(msgFromDb);
}

function msgFromDb(row) {
  if (!row) return null;
  return { id: row.id, type: row.type, chatId: row.chat_id, userId: row.user_id, username: row.username, color: row.color, avatar: row.avatar, avatarUrl: row.avatar_url, text: row.text || '', time: row.time, reactions: parseJSON(row.reactions, {}), replyTo: parseJSON(row.reply_to, null), edited: !!row.edited, deleted: !!row.deleted, deletedFor: parseJSON(row.deleted_for, []), attachments: parseJSON(row.attachments, null), sticker: row.sticker || null, stickerUrl: row.sticker_url || null, stickerId: row.sticker_id || null, censored: !!row.censored, callType: row.call_type || null, callStatus: row.call_status || null, duration: row.duration || null, forwardedFrom: row.forwarded_from || null, scheduledFor: row.scheduled_for || null, pendingDelete: !!row.pending_delete, pendingDeleteAt: row.pending_delete_at || null };
}

async function canAccessChat(chatId, usernameLower) {
  if (chatId.startsWith('g_')) { const row = await dbGet('SELECT 1 FROM group_members WHERE group_id=? AND username=?', [chatId, usernameLower]); return !!row; }
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

async function getGroupMembers(groupId) { const rows = await dbAll('SELECT username FROM group_members WHERE group_id=?', [groupId]); return rows.map(r => r.username); }
async function getGroupAdmins(groupId) { const rows = await dbAll('SELECT username FROM group_members WHERE group_id=? AND is_admin=1', [groupId]); return rows.map(r => r.username); }
async function isGroupAdmin(groupId, username) { const row = await dbGet('SELECT * FROM group_members WHERE group_id=? AND username=?', [groupId, username]); if (!row) return false; const g = await dbGet('SELECT * FROM groups_t WHERE id=?', [groupId]); if (g && g.owner === username) return true; return !!row.is_admin; }
async function getGroup(groupId) {
  const g = await dbGet('SELECT * FROM groups_t WHERE id=?', [groupId]);
  if (!g) return null;
  const members = await getGroupMembers(groupId);
  const admins = await getGroupAdmins(groupId);
  return { id: g.id, name: g.name, description: g.description || '', rules: g.rules || '', avatarUrl: g.avatar_url || null, type: g.type || 'group', owner: g.owner, color: g.color, createdAt: g.created_at, members, admins };
}

/* ---------- REST API ---------- */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ ok: false, error: 'no-token' });
    const sess = await dbGet('SELECT * FROM sessions WHERE token=?', [token]);
    if (!sess) return res.status(401).json({ ok: false, error: 'invalid-token' });
    if (sess.expires_at && sess.expires_at < Date.now()) { await dbRun('DELETE FROM sessions WHERE token=?', [token]); return res.status(401).json({ ok: false, error: 'token-expired' }); }
    const acc = await dbGet('SELECT * FROM accounts WHERE username=?', [sess.username]);
    if (!acc) return res.status(401).json({ ok: false, error: 'no-account' });
    if (acc.is_banned) return res.status(403).json({ ok: false, error: 'banned' });
    req.user = acc; req.token = token; next();
  } catch (e) { console.error('requireAuth:', e); res.status(500).json({ ok: false, error: 'server-error' }); }
}

app.get('/api/ping', (req, res) => res.json({ ok: true, service: 'danumes-api', version: 1, time: Date.now() }));

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email, phone } = req.body || {};
    const uname = String(username || '').trim();
    const pass = String(password || '');
    const em = String(email || '').trim().toLowerCase();
    const ph = String(phone || '').trim().replace(/[^\d+]/g, '');
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) return res.status(400).json({ ok: false, error: '3–20 символов' });
    if (pass.length < 4) return res.status(400).json({ ok: false, error: 'Пароль минимум 4' });
    const key = uname.toLowerCase();
    if (await dbGet('SELECT 1 FROM accounts WHERE username=?', [key])) return res.status(409).json({ ok: false, error: 'Юзернейм занят' });
    if (em && await dbGet('SELECT 1 FROM accounts WHERE email=?', [em])) return res.status(409).json({ ok: false, error: 'Email занят' });
    if (ph && await dbGet('SELECT 1 FROM accounts WHERE phone=?', [ph])) return res.status(409).json({ ok: false, error: 'Телефон занят' });
    await dbRun(`INSERT INTO accounts (username, username_display, password_hash, bio, birthday, email, email_verified, phone, phone_verified, color, avatar, avatar_url, created_at, is_admin, is_verified, is_banned, vk_linked) VALUES (?, ?, ?, '', '', ?, 0, ?, 0, ?, NULL, NULL, ?, 0, 0, 0, 0)`, [key, uname, hashPassword(pass), em, ph, randColor(), Date.now()]);
    await dbRun('INSERT OR IGNORE INTO privacy (username) VALUES (?)', [key]);
    await dbRun('INSERT OR IGNORE INTO settings (username, data) VALUES (?, ?)', [key, '{}']);
    res.json({ ok: true });
  } catch (e) { console.error('api/register:', e); res.status(500).json({ ok: false, error: 'server-error' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    const raw = String(login || '').trim();
    const pass = String(password || '');
    if (!raw || !pass) return res.status(400).json({ ok: false, error: 'Заполни поля' });
    const lower = raw.toLowerCase();
    let row = await dbGet('SELECT * FROM accounts WHERE username=?', [lower]);
    if (!row && raw.includes('@')) row = await dbGet('SELECT * FROM accounts WHERE email=?', [lower]);
    if (!row && /^[\d+\s\-()]+$/.test(raw)) { const digits = raw.replace(/[^\d+]/g, ''); row = await dbGet('SELECT * FROM accounts WHERE phone=?', [digits]); }
    if (!row) return res.status(404).json({ ok: false, error: 'Не найден' });
    if (!verifyPassword(pass, row.password_hash)) return res.status(401).json({ ok: false, error: 'Неверный пароль' });
    if (row.is_banned) return res.status(403).json({ ok: false, error: 'Заблокирован' });
    const key = row.username;
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;
    await dbRun('INSERT OR REPLACE INTO sessions (sid, username, joined_at, last_active, ua, token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['rest_' + crypto.randomBytes(6).toString('hex'), key, Date.now(), Date.now(), req.headers['user-agent'] || 'android', sessionToken, expiresAt]);
    res.json({ ok: true, user: accFromDb(row, false), sessionToken, expiresAt });
  } catch (e) { console.error('api/login:', e); res.status(500).json({ ok: false, error: 'server-error' }); }
});

app.post('/api/logout', requireAuth, async (req, res) => {
  try { await dbRun('DELETE FROM sessions WHERE token=?', [req.token]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: 'server-error' }); }
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = accFromDb(req.user, false);
    user.email = req.user.email || ''; user.phone = req.user.phone || '';
    user.emailVerified = !!req.user.email_verified; user.phoneVerified = !!req.user.phone_verified;
    res.json({ ok: true, user });
  } catch (e) { res.status(500).json({ ok: false, error: 'server-error' }); }
});

app.get('/api/chats', requireAuth, async (req, res) => {
  try {
    const username = req.user.username;
    const myMessages = await dbAll(`SELECT DISTINCT chat_id FROM messages WHERE chat_id NOT LIKE 'g_%'`);
    const chatIds = [];
    for (const r of myMessages) { const cid = r.chat_id; if (!cid || !cid.includes('::')) continue; const [a, b] = cid.split('::'); if (a === username || b === username) chatIds.push(cid); }
    const myGroups = await dbAll('SELECT group_id FROM group_members WHERE username=?', [username]);
    const chats = [];
    for (const cid of chatIds) {
      const [a, b] = cid.split('::');
      const otherKey = a === username ? b : a;
      const otherAcc = await dbGet('SELECT * FROM accounts WHERE username=?', [otherKey]);
      if (!otherAcc) continue;
      const lastMsg = await dbGet('SELECT * FROM messages WHERE chat_id=? ORDER BY time DESC LIMIT 1', [cid]);
      chats.push({ id: cid, type: 'private', name: otherAcc.username_display || otherAcc.username, usernameLower: otherKey, color: otherAcc.color, avatar: otherAcc.avatar, avatarUrl: otherAcc.avatar_url, online: isOnline(otherKey), lastMessage: lastMsg ? (lastMsg.deleted ? 'Сообщение удалено' : (lastMsg.text || '📎 Вложение')) : '', lastTime: lastMsg ? lastMsg.time : 0, lastIsOwn: lastMsg ? (lastMsg.user_id === username) : false, unreadCount: 0 });
    }
    for (const gm of myGroups) {
      const g = await getGroup(gm.group_id);
      if (!g) continue;
      const lastMsg = await dbGet('SELECT * FROM messages WHERE chat_id=? ORDER BY time DESC LIMIT 1', [g.id]);
      chats.push({ id: g.id, type: g.type || 'group', name: g.name, usernameLower: g.id, color: g.color, avatar: null, avatarUrl: g.avatarUrl, online: false, lastMessage: lastMsg ? (lastMsg.deleted ? 'Сообщение удалено' : (lastMsg.text || '📎 Вложение')) : '', lastTime: lastMsg ? lastMsg.time : g.createdAt, lastIsOwn: lastMsg ? (lastMsg.user_id === username) : false, unreadCount: 0 });
    }
    chats.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
    res.json({ ok: true, chats });
  } catch (e) { console.error('api/chats:', e); res.status(500).json({ ok: false, error: 'server-error' }); }
});

app.get('/api/chats/:chatId/messages', requireAuth, async (req, res) => {
  try {
    const chatId = decodeURIComponent(req.params.chatId);
    if (!(await canAccessChat(chatId, req.user.username))) return res.status(403).json({ ok: false, error: 'no-access' });
    const messages = await getChatMessages(chatId);
    res.json({ ok: true, chatId, messages });
  } catch (e) { console.error('api/messages:', e); res.status(500).json({ ok: false, error: 'server-error' }); }
});

app.post('/api/chats/:chatId/messages', requireAuth, async (req, res) => {
  try {
    const chatId = decodeURIComponent(req.params.chatId);
    const acc = req.user;
    const { text } = req.body || {};
    if (!(await canAccessChat(chatId, acc.username))) return res.status(403).json({ ok: false, error: 'no-access' });
    let clean = String(text || '').trim().slice(0, 4000);
    if (!clean) return res.status(400).json({ ok: false, error: 'empty' });
    const hadBad = hasBadWords(clean);
    if (hadBad) clean = filterBadWords(clean);
    const id = uid('m');
    const time = Date.now();
    await dbRun(`INSERT INTO messages (id, chat_id, type, user_id, username, color, avatar, avatar_url, text, time, reactions, reply_to, edited, deleted, deleted_for, censored) VALUES (?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, '{}', NULL, 0, 0, '[]', ?)`, [id, chatId, acc.username, acc.username_display || acc.username, acc.color, acc.avatar, acc.avatar_url, clean, time, hadBad ? 1 : 0]);
    const saved = await dbGet('SELECT * FROM messages WHERE id=?', [id]);
    const msg = msgFromDb(saved);
    await emitToChat(chatId, 'message', msg);
    res.json({ ok: true, msg });
  } catch (e) { console.error('api/send:', e); res.status(500).json({ ok: false, error: 'server-error' }); }
});

app.get('/api/users/search', requireAuth, async (req, res) => {
  try {
    const me = req.user;
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json({ ok: true, users: [] });
    const rows = await dbAll('SELECT * FROM accounts WHERE LOWER(username) LIKE ? AND username != ? LIMIT 30', ['%' + q + '%', me.username]);
    res.json({ ok: true, users: rows.map(r => publicUser(accFromDb(r, isOnline(r.username)), !!me.is_admin)) });
  } catch (e) { console.error('api/users/search:', e); res.status(500).json({ ok: false, error: 'server-error' }); }
});

app.post('/api/chats/open', requireAuth, async (req, res) => {
  try {
    const me = req.user;
    const { withUsername } = req.body || {};
    const otherKey = String(withUsername || '').toLowerCase();
    if (!otherKey || otherKey === me.username) return res.status(400).json({ ok: false, error: 'invalid-user' });
    const other = await dbGet('SELECT * FROM accounts WHERE username=?', [otherKey]);
    if (!other) return res.status(404).json({ ok: false, error: 'user-not-found' });
    const chatId = chatKey(me.username, otherKey);
    const messages = await getChatMessages(chatId);
    res.json({ ok: true, chatId, messages, otherUser: publicUser(accFromDb(other, isOnline(otherKey)), !!me.is_admin), chatType: 'private' });
  } catch (e) { console.error('api/chats/open:', e); res.status(500).json({ ok: false, error: 'server-error' }); }
});

app.post('/api/groups/create', requireAuth, async (req, res) => {
  try {
    const me = req.user;
    const { name, description, type, members, avatarUrl } = req.body || {};
    const gname = String(name || '').trim().slice(0, 60);
    if (gname.length < 3) return res.status(400).json({ ok: false, error: 'Название минимум 3 символа' });
    const gtype = type === 'channel' ? 'channel' : 'group';
    const gid = uid('g');
    await dbRun(`INSERT INTO groups_t (id, name, description, rules, avatar_url, type, owner, color, created_at) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)`, [gid, gname, String(description || '').slice(0, 200), avatarUrl || null, gtype, me.username, randColor(), Date.now()]);
    await dbRun('INSERT OR REPLACE INTO group_members (group_id, username, is_admin) VALUES (?, ?, 1)', [gid, me.username]);
    const sysId = uid('m');
    await dbRun(`INSERT INTO messages (id, chat_id, type, text, time) VALUES (?, ?, 'system', ?, ?)`, [sysId, gid, (me.username_display || me.username) + ' создал ' + (gtype === 'channel' ? 'канал' : 'группу'), Date.now()]);
    let added = 0;
    if (Array.isArray(members)) {
      for (const m of members) {
        const k = String(m).toLowerCase().trim();
        if (!k || k === me.username) continue;
        const exists = await dbGet('SELECT 1 FROM accounts WHERE username=?', [k]);
        if (!exists) continue;
        await dbRun('INSERT OR REPLACE INTO group_members (group_id, username, is_admin) VALUES (?, ?, 0)', [gid, k]);
        added++;
      }
    }
    res.json({ ok: true, groupId: gid, chatId: gid, name: gname, type: gtype, membersCount: added + 1 });
  } catch (e) { console.error('api/groups/create:', e); res.status(500).json({ ok: false, error: 'server-error' }); }
});

/* ============================================================
   ЗАПУСК — БЕЗ VK/EMAIL/GOOGLE
   ============================================================ */
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('▶️  initTables...');
    await initTables();
    console.log('✅ initTables OK');
  } catch (e) {
    console.error('❌ initTables FAIL:', e.message);
    // НЕ выходим — пробуем поднять сервер
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✦ Danumes v24 (Turso) → порт ${PORT}\n`);
    console.log('⏭️  VK-бот: отключён');
    console.log('⏭️  Email: отключён');
    console.log('⏭️  Google OAuth: отключён');
    console.log('\n🚀 Сервер готов\n');
  });

  server.on('error', (err) => {
    console.error('❌ Server error:', err.message);
  });
}

startServer().catch(err => {
  console.error('❌ Ошибка запуска:', err);
  // НЕ process.exit(1) — пусть ONREZA не убивает процесс
});

/* ============================================================
   КОНЕЦ ФАЙЛА server.js
   ============================================================ */
