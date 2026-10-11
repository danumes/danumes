/* ============================================================
   DANUMES · pg-storage.js v2
   Хранит файлы в PostgreSQL через Large Objects.
   Исправлены баги: fd вместо 0, bytea → Buffer, чанки.
   ============================================================ */

const { Client } = require('pg');

const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let connected = false;
let connecting = null;

async function ensureConnect() {
  if (connected) return;
  if (connecting) return connecting;
  connecting = db.connect()
    .then(() => {
      connected = true;
      console.log('✅ pg-storage подключён к PostgreSQL');
    })
    .catch(e => {
      console.error('❌ pg-storage connect:', e.message);
      connecting = null;
      throw e;
    });
  return connecting;
}

/* ---------- Сохранить файл в БД ---------- */
async function uploadToPostgres(buffer, fileName, mimeType) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    await client.query('BEGIN');

    const oidRes = await client.query('SELECT lo_create(0) AS oid');
    const oid = oidRes.rows[0].oid;

    // INV_WRITE = 0x00020000
    const fdRes = await client.query('SELECT lo_open($1, $2) AS fd', [oid, 131072]);
    const fd = fdRes.rows[0].fd;

    const CHUNK = 2 * 1024 * 1024;
    for (let i = 0; i < buffer.length; i += CHUNK) {
      const chunk = buffer.slice(i, i + CHUNK);
      await client.query('SELECT lowrite($1, $2)', [fd, chunk]);
    }

    await client.query('SELECT lo_close($1)', [fd]);
    await client.query('COMMIT');

    console.log('✅ Файл сохранён в PostgreSQL, oid:', oid, 'размер:', buffer.length);

    return {
      ok: true,
      oid: oid,
      fileId: String(oid),
      name: fileName,
      size: buffer.length,
      mime: mimeType
    };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('❌ uploadToPostgres:', e.message);
    return { ok: false, error: e.message };
  } finally {
    await client.end().catch(() => {});
  }
}

/* ---------- Прочитать файл из БД ---------- */
async function readFromPostgres(oid) {
  console.log('📖 readFromPostgres START, oid =', oid);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('📖 connected');

    const fdRes = await client.query('SELECT lo_open($1, $2) AS fd', [oid, 262144]);
    console.log('📖 lo_open result:', JSON.stringify(fdRes.rows[0]));
    const fd = fdRes.rows[0].fd;

    const chunks = [];
    const CHUNK = 2 * 1024 * 1024;
    let iteration = 0;

    while (true) {
      iteration++;
      console.log('📖 iteration', iteration, 'calling loread(fd=' + fd + ')');
      const r = await client.query('SELECT loread($1, $2) AS data', [fd, CHUNK]);
      const raw = r.rows[0].data;

      console.log('📖 loread raw type:', typeof raw, 'isBuffer:', Buffer.isBuffer(raw), 'len:', raw ? raw.length : 0);

      let buf;
      if (Buffer.isBuffer(raw)) buf = raw;
      else if (typeof raw === 'string') buf = Buffer.from(raw.replace(/^\\x/, ''), 'hex');
      else if (raw === null) break;
      else buf = Buffer.from(raw);

      if (!buf || buf.length === 0) break;
      chunks.push(buf);
      if (buf.length < CHUNK) break;
    }

    console.log('📖 lo_close');
    await client.query('SELECT lo_close($1)', [fd]);

    const total = chunks.reduce((s, c) => s + c.length, 0);
    console.log('📖 readFromPostgres DONE, total size =', total);

    return Buffer.concat(chunks);
  } catch (e) {
    console.error('❌ readFromPostgres ERROR:', e.message);
    console.error('❌ STACK:', e.stack);
    throw e;
  } finally {
    await client.end().catch(() => {});
  }
}

function makeFileIdUrl(oid) {
  return '/pg-file/' + oid;
}

module.exports = { uploadToPostgres, readFromPostgres, makeFileIdUrl };
