/* ============================================================
   DANUMES · emailService.js
   Отправка email через Yandex SMTP
   ============================================================ */

const nodemailer = require('nodemailer');

let transporter = null;
let FROM_EMAIL = null;

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
function initEmail() {
  const host = process.env.SMTP_HOST || 'smtp.yandex.ru';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.log('⚠️  Email не настроен: нет SMTP_USER или SMTP_PASS в .env');
    return { ok: false, error: 'no-credentials' };
  }

  FROM_EMAIL = user;

  try {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,     // true для 465, false для 587
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });

    // Проверяем соединение
    transporter.verify((err, success) => {
      if (err) {
        console.error('❌ SMTP ошибка:', err.message);
      } else {
        console.log('✅ Email настроен:', user);
      }
    });

    return { ok: true, email: user };
  } catch (e) {
    console.error('❌ Email init error:', e.message);
    return { ok: false, error: e.message };
  }
}

/* ============================================================
   ОТПРАВКА ПИСЬМА С КОДОМ
   ============================================================ */
async function sendLoginCode(email, code) {
  if (!transporter) {
    console.error('Email transporter не инициализирован');
    return { ok: false, error: 'no-transporter' };
  }

  const html = buildCodeEmail(code, 'Вход в Danumes');

  try {
    const info = await transporter.sendMail({
      from: `"Danumes" <${FROM_EMAIL}>`,
      to: email,
      subject: '🔐 Код для входа в Danumes: ' + code,
      text: 'Ваш код для входа в Danumes: ' + code + '\n\nКод действует 10 минут.\nЕсли вы не запрашивали вход — проигнорируйте письмо.',
      html
    });
    console.log('📧 Email отправлен:', email, '/ id:', info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.error('❌ Email send error:', e.message);
    return { ok: false, error: e.message };
  }
}

/* ============================================================
   ОТПРАВКА ПРИГЛАШЕНИЯ В ГРУППУ
   ============================================================ */
async function sendGroupInvite(email, inviterName, groupName, inviteUrl) {
  if (!transporter) return { ok: false, error: 'no-transporter' };

  const html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f6f4fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(120,90,220,0.12);">
<tr><td style="background:linear-gradient(135deg,#8b5cf6 0%,#ec4899 100%);padding:32px;text-align:center;">
<div style="font-size:32px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Danumes</div>
</td></tr>
<tr><td style="padding:32px 28px;">
<h1 style="margin:0 0 16px;font-size:22px;color:#1a1828;">Приглашение в группу</h1>
<p style="margin:0 0 24px;font-size:15px;color:#6b6888;line-height:1.5;">
<b style="color:#1a1828;">${escapeHtml(inviterName)}</b> приглашает тебя в группу
<b style="color:#a855f7;">«${escapeHtml(groupName)}»</b>.
</p>
<a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#8b5cf6 0%,#ec4899 100%);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">
Открыть в Danumes →
</a>
<p style="margin:24px 0 0;font-size:13px;color:#a8a4be;line-height:1.5;">
Ссылка действует 7 дней. Если у тебя нет аккаунта — он создастся автоматически при переходе.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  try {
    const info = await transporter.sendMail({
      from: `"Danumes" <${FROM_EMAIL}>`,
      to: email,
      subject: '👥 ' + inviterName + ' приглашает в «' + groupName + '»',
      html
    });
    console.log('📧 Invite отправлен:', email);
    return { ok: true };
  } catch (e) {
    console.error('Email invite error:', e.message);
    return { ok: false, error: e.message };
  }
}

/* ============================================================
   HTML ШАБЛОН ПИСЬМА С КОДОМ
   ============================================================ */
function buildCodeEmail(code, title) {
  // Разбиваем код по 1 символу для красоты
  const codeDigits = code.split('').map(d =>
    `<td style="padding:0 4px;"><div style="width:38px;height:48px;line-height:48px;text-align:center;background:#f6f4fb;border-radius:10px;font-size:24px;font-weight:800;color:#8b5cf6;font-family:'SF Mono',Consolas,monospace;">${d}</div></td>`
  ).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f6f4fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(120,90,220,0.12);">
<tr><td style="background:linear-gradient(135deg,#8b5cf6 0%,#ec4899 100%);padding:32px;text-align:center;">
<div style="font-size:32px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Danumes</div>
</td></tr>
<tr><td style="padding:32px 28px;text-align:center;">
<h1 style="margin:0 0 12px;font-size:20px;color:#1a1828;font-weight:700;">${escapeHtml(title)}</h1>
<p style="margin:0 0 28px;font-size:15px;color:#6b6888;line-height:1.5;">
Введи этот код в приложении:
</p>
<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>${codeDigits}</tr></table>
<p style="margin:28px 0 0;font-size:14px;color:#6b6888;line-height:1.5;">
Код действует <b style="color:#1a1828;">10 минут</b>.
</p>
<p style="margin:12px 0 0;font-size:12.5px;color:#a8a4be;line-height:1.5;">
Если ты не запрашивал вход — просто проигнорируй это письмо.
</p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e9e2f3;text-align:center;">
<p style="margin:0;font-size:12px;color:#a8a4be;">
Это письмо отправлено автоматически. Не отвечай на него.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/* ============================================================
   ГЕНЕРАЦИЯ 6-ЗНАЧНОГО КОДА
   ============================================================ */
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/* ============================================================
   ЭКРАНИРОВАНИЕ HTML
   ============================================================ */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

/* ============================================================
   ЭКСПОРТ
   ============================================================ */
module.exports = {
  initEmail,
  sendLoginCode,
  sendGroupInvite,
  generateCode
};