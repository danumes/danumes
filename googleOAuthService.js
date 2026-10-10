/* ============================================================
   DANUMES · googleOAuthService.js
   Вход через Google (OAuth 2.0)
   ============================================================ */

const crypto = require('crypto');

let CLIENT_ID = null;
let CLIENT_SECRET = null;
let REDIRECT_URI = null;

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
function initGoogle() {
  CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.PUBLIC_URL || 'https://danumes.layero.app';
  REDIRECT_URI = baseUrl.replace(/\/$/, '') + '/auth/google/callback';

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.log('⚠️  Google OAuth не настроен: нет GOOGLE_CLIENT_ID или GOOGLE_CLIENT_SECRET');
    return { ok: false, error: 'no-credentials' };
  }

  console.log('✅ Google OAuth настроен:', CLIENT_ID.slice(0, 20) + '...');
  console.log('   Redirect URI:', REDIRECT_URI);
  return { ok: true, clientId: CLIENT_ID, redirectUri: REDIRECT_URI };
}

/* ============================================================
   ГЕНЕРАЦИЯ URL ДЛЯ ВХОДА
   ============================================================ */
function generateAuthUrl(state) {
  if (!CLIENT_ID) return null;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state: state || crypto.randomBytes(16).toString('hex')
  });

  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  console.log('🔗 Google Auth URL:');
  console.log('   CLIENT_ID length:', CLIENT_ID.length);
  console.log('   CLIENT_ID value:', CLIENT_ID);
  console.log('   REDIRECT_URI:', REDIRECT_URI);
  console.log('   Full URL:', url);
  return url;
}

/* ============================================================
   ОБМЕН КОДА НА ТОКЕН
   ============================================================ */
async function exchangeCodeForTokens(code) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return { ok: false, error: 'no-credentials' };
  }

  try {
    const body = new URLSearchParams({
      code: code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Google token exchange error:', text);
      return { ok: false, error: 'token-exchange-failed', details: text };
    }

    const data = await resp.json();
    return { ok: true, tokens: data };
  } catch (e) {
    console.error('Google token exchange exception:', e.message);
    return { ok: false, error: e.message };
  }
}

/* ============================================================
   ПОЛУЧЕНИЕ ИНФОРМАЦИИ О ЮЗЕРЕ
   ============================================================ */
async function getUserInfo(accessToken) {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Google userinfo error:', text);
      return { ok: false, error: 'userinfo-failed', details: text };
    }

    const data = await resp.json();
    return {
      ok: true,
      user: {
        id: data.id,                         // Google ID
        email: data.email,                   // email
        verified_email: data.verified_email, // подтверждён ли email
        name: data.name || '',               // Имя Фамилия
        given_name: data.given_name || '',   // Имя
        family_name: data.family_name || '', // Фамилия
        picture: data.picture || null,       // URL аватара
        locale: data.locale || 'ru'          // язык
      }
    };
  } catch (e) {
    console.error('Google userinfo exception:', e.message);
    return { ok: false, error: e.message };
  }
}

/* ============================================================
   ПОЛНЫЙ ФЛОУ: КОД → ЮЗЕР
   ============================================================ */
async function handleCallback(code) {
  // 1. Обмен кода на токены
  const tokenResult = await exchangeCodeForTokens(code);
  if (!tokenResult.ok) return tokenResult;

  const accessToken = tokenResult.tokens.access_token;
  if (!accessToken) return { ok: false, error: 'no-access-token' };

  // 2. Получение информации о юзере
  const userResult = await getUserInfo(accessToken);
  if (!userResult.ok) return userResult;

  return { ok: true, user: userResult.user, accessToken };
}

/* ============================================================
   ПРОВЕРКА: НАСТРОЕН ЛИ GOOGLE
   ============================================================ */
function isConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

/* ============================================================
   ЭКСПОРТ
   ============================================================ */
module.exports = {
  initGoogle,
  generateAuthUrl,
  exchangeCodeForTokens,
  getUserInfo,
  handleCallback,
  isConfigured
};