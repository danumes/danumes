const { Client } = require('pg');

const db = new Client({
  connectionString: 'postgresql://kaiki_c_920b42ecd1249545f47ccd48:Kk1!lHENZow3PO6HUc4DAhEhjjTXLnWF@ep-4561abc0dc2d.kaiki.ru:5432/app_database?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await db.connect();
    console.log('✅ Подключение к PostgreSQL работает');
    const r = await db.query('SELECT NOW() as now, version() as v');
    console.log('Время сервера:', r.rows[0].now);
    console.log('Версия:', r.rows[0].v.slice(0, 60));
    await db.end();
  } catch (e) {
    console.error('❌ Ошибка:', e.message);
  }
})();
