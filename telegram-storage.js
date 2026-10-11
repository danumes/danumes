/* ============================================================
   DANUMES · telegram-storage.js
   Отправляет файлы в Telegram-канал, возвращает прямую ссылку.
   ============================================================ */

const https = require('https');
const fs = require('fs');

const BOT_TOKEN = process.env.TG_BOT_TOKEN || '8961321906:AAGQ7JwmaObHk4cC7tFbnDkzr0ApYMvFhTY';
const CHAT_ID = process.env.TG_CHAT_ID || '-1004416005877';

/* ---------- низкоуровневый запрос к Telegram API ---------- */
function tgRequest(method, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('bad-json: ' + body.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/* ---------- multipart/form-data для отправки файла ---------- */
function buildMultipart(fields, fileField, fileBuffer, fileName, mimeType) {
  const boundary = '----DanumesBoundary' + Date.now().toString(16);
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${value}\r\n`
    ));
  }

  chunks.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  ));
  chunks.push(fileBuffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return { boundary, body: Buffer.concat(chunks) };
}

function tgUploadFile(method, fileBuffer, fileName, mimeType, extraFields = {}) {
  return new Promise((resolve, reject) => {
    const { boundary, body } = buildMultipart(
      { chat_id: CHAT_ID, ...extraFields },
      'document',
      fileBuffer,
      fileName,
      mimeType || 'application/octet-stream'
    );

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, res => {
      let resp = '';
      res.on('data', c => { resp += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(resp)); }
        catch (e) { reject(new Error('bad-json: ' + resp.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ============================================================
   Публичные функции
   ============================================================ */

/**
 * Отправляет файл в Telegram-канал.
 * @param {Buffer} buffer — содержимое файла
 * @param {string} fileName — имя файла
 * @param {string} mimeType — MIME-тип
 * @returns {Promise<{ok:boolean, fileId?:string, error?:string}>}
 */
async function uploadToTelegram(buffer, fileName, mimeType) {
  try {
    const res = await tgUploadFile('sendDocument', buffer, fileName, mimeType);
    if (!res.ok) {
      console.error('❌ Telegram upload:', res.description);
      return { ok: false, error: res.description || 'telegram-error' };
    }
    const doc = res.result.document;
    return { ok: true, fileId: doc.file_id, messageId: res.result.message_id };
  } catch (e) {
    console.error('❌ Telegram upload exception:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Возвращает временный URL для файла по file_id.
 * Ссылка живёт ~1 час.
 */
async function getTelegramFileUrl(fileId) {
  try {
    const res = await tgRequest('getFile', { file_id: fileId });
    if (!res.ok) return null;
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${res.result.file_path}`;
  } catch (e) {
    console.error('❌ getFile:', e.message);
    return null;
  }
}

/**
 * Возвращает путь для прямой отдачи через наш сервер.
 * Клиент будет дёргать /tg-file/:fileId — а мы редиректим на Telegram.
 * fileId безопасно хранить в БД, ссылка генерируется при каждом запросе.
 */
function makeFileIdUrl(fileId) {
  return '/tg-file/' + encodeURIComponent(fileId);
}

module.exports = { uploadToTelegram, getTelegramFileUrl, makeFileIdUrl, tgRequest };
