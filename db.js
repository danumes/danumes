/* ============================================================
   DANUMES · db.js — обёртка над PostgreSQL
   Автоматически конвертирует ? → $1, $2, $3...
   ============================================================ */

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL не задан');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('❌ pg pool error:', err.message);
});

// ? → $1, $2, $3...
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
}

// SQLite → PostgreSQL замены
function convertSql(sql) {
  let s = sql;
  // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  s = s.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'INSERT INTO');
  // AUTOINCREMENT → SERIAL (на всякий случай, если где-то в схеме)
  s = s.replace(/AUTOINCREMENT/gi, '');
  return s;
}

async function dbGet(sql, params = []) {
  try {
    const finalSql = convertPlaceholders(convertSql(sql));
    const r = await pool.query(finalSql, params);
    return r.rows[0] || null;
  } catch (e) {
    console.error('dbGet:', e.message);
    console.error('  SQL:', sql.slice(0, 200));
    return null;
  }
}

async function dbAll(sql, params = []) {
  try {
    const finalSql = convertPlaceholders(convertSql(sql));
    const r = await pool.query(finalSql, params);
    return r.rows || [];
  } catch (e) {
    console.error('dbAll:', e.message);
    console.error('  SQL:', sql.slice(0, 200));
    return [];
  }
}

async function dbRun(sql, params = []) {
  try {
    const finalSql = convertPlaceholders(convertSql(sql));
    return await pool.query(finalSql, params);
  } catch (e) {
    console.error('dbRun FAIL:', e.message);
    console.error('  SQL:', sql.slice(0, 200));
    console.error('  ARGS:', JSON.stringify(params).slice(0, 300));
    return null;
  }
}

async function dbExec(sql) {
  try {
    await pool.query(sql);
    return true;
  } catch (e) {
    console.error('dbExec:', e.message);
    return false;
  }
}

async function testConnection() {
  try {
    const r = await pool.query('SELECT NOW() as now');
    console.log('✅ PostgreSQL подключена. Время сервера:', r.rows[0].now);
    return true;
  } catch (e) {
    console.error('❌ PostgreSQL НЕ подключилась:', e.message);
    return false;
  }
}

module.exports = { dbGet, dbAll, dbRun, dbExec, testConnection, pool };
