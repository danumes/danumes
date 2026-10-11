/* ============================================================
   DANUMES · pg-storage.js v3
   Хранит файлы в PostgreSQL через bytea-колонку.
   Проще, надёжнее, работает без транзакций и LO.
   ============================================================ */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (e) => console.error('❌ pg pool error:', e.message));

/* ---------- Создать таблицу для файлов ---------- */
async function initFilesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        data BYTEA NOT NULL,
        name TEXT,
        mime TEXT,
        size INTEGER,
        created_at BIGINT
      )
    `);
    console.log('✅ Таблица files готова');
  } catch (e) {
    console.error('❌ initFilesTable:', e.message);
  }
}
initFilesTable();

/* ---------- Сохранить файл ---------- */
async function uploadToPostgres(buffer, fileName, mimeType) {
  try {
    const id = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

    await pool.query(
      `INSERT INTO files (id, data, name, mime, size, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, buffer, fileName, mimeType, buffer.length, Date.now()]
    );

    console.log('✅ Файл сохранён в PostgreSQL, id:', id, 'размер:', buffer.length);

    return {
      ok: true,
      fileId: id,
      name: fileName,
      size: buffer.length,
      mime: mimeType
    };
  } catch (e) {
    console.error('❌ uploadToPostgres:', e.message);
    return { ok: false, error: e.message };
  }
}

/* ---------- Прочитать файл ---------- */
async function readFromPostgres(fileId) {
  try {
    const r = await pool.query(
      `SELECT data, name, mime FROM files WHERE id = $1`,
      [fileId]
    );
    if (!r.rows[0]) return null;

    const row = r.rows[0];
    // pg отдаёт bytea как Buffer, но иногда как hex-строку '\x...'
    let buf = row.data;
    if (!Buffer.isBuffer(buf) && typeof buf === 'string') {
      buf = Buffer.from(buf.replace(/^\\x/, ''), 'hex');
    }
    return { buffer: buf, name: row.name, mime: row.mime };
  } catch (e) {
    console.error('❌ readFromPostgres:', e.message);
    return null;
  }
}

function makeFileIdUrl(fileId) {
  return '/pg-file/' + fileId;
}

module.exports = { uploadToPostgres, readFromPostgres, makeFileIdUrl, pool };
