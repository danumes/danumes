/* ============================================================
   DANUMES · pg-storage.js
   Хранит файлы в PostgreSQL через Large Objects.
   Файлы не пропадают при деплое — они в базе.
   ============================================================ */

const { Client } = require('pg');

const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let connected = false;
async function ensureConnect() {
  if (connected) return;
  await db.connect();
  connected = true;
  console.log('✅ pg-storage подключён к PostgreSQL');
}
ensureConnect().catch(e => console.error('❌ pg-storage connect:', e.message));

/* ---------- Сохранить файл в БД ---------- */
async function uploadToPostgres(buffer, fileName, mimeType) {
  try {
    await ensureConnect();

    // Управление транзакцией: Large Object требует ручного BEGIN/COMMIT
    await db.query('BEGIN');

    // Создаём пустой Large Object, получаем oid
    const oidRes = await db.query('SELECT lo_create(0) AS oid');
    const oid = oidRes.rows[0].oid;

    // Открываем поток для записи (INV_WRITE = 0x00020000)
    await db.query('SELECT lo_open($1, $2)', [oid, 131072]);

    // Разбиваем буфер на чанки по 2 МБ и пишем
    const CHUNK = 2 * 1024 * 1024;
    let offset = 0;
    for (let i = 0; i < buffer.length; i += CHUNK) {
      const chunk = buffer.slice(i, i + CHUNK);
      await db.query('SELECT lowrite(0, $1)', [chunk]);
      offset += chunk.length;
    }

    await db.query('SELECT lo_close(0)');
    await db.query('COMMIT');

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
    try { await db.query('ROLLBACK'); } catch (_) {}
    console.error('❌ uploadToPostgres:', e.message);
    return { ok: false, error: e.message };
  }
}

/* ---------- Прочитать файл из БД ---------- */
async function readFromPostgres(oid) {
  await ensureConnect();

  // Открываем на чтение (INV_READ = 0x00040000)
  const fdRes = await db.query('SELECT lo_open($1, $2) AS fd', [oid, 262144]);
  const fd = fdRes.rows[0].fd;

  const chunks = [];
  const CHUNK = 2 * 1024 * 1024;
  while (true) {
    const r = await db.query('SELECT loread($1, $2) AS data', [fd, CHUNK]);
    const buf = r.rows[0].data;
    if (!buf || buf.length === 0) break;
    chunks.push(buf);
    if (buf.length < CHUNK) break;
  }
  await db.query('SELECT lo_close($1)', [fd]);

  return Buffer.concat(chunks);
}

function makeFileIdUrl(oid) {
  return '/pg-file/' + oid;
}

module.exports = { uploadToPostgres, readFromPostgres, makeFileIdUrl };
