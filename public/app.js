/* ============================================================
   DANUMES · app.js v25 (SlimChat-стиль)
   ============================================================ */

const socket = io({
    auth: { token: localStorage.getItem('danumes.token') || '' }
});

/* ============================================================
   СОСТОЯНИЕ
   ============================================================ */
let me = null;
let currentChatId = null;
let currentChatMeta = null;

const usersMap = new Map();
const chatsMeta = new Map();
const messagesByChat = new Map();
const unread = new Map();
const lastMsg = new Map();
const typingByChat = new Map();
const readBy = new Map();
const pinned = new Set();
const muted = new Set();
const pinnedMsgs = new Map();
const groups = new Map();
const contacts = new Set();

let replyTo = null;
let forwardMode = null;
let searchQuery = '';
let currentTab = 'all';
let ctxMessage = null;
let pendingAttachments = [];
let scheduledFor = null;
let editMode = null;

let ngSelectedType = 'group';
let ngSelectedMembers = new Set();

let epSelectedColor = null;
let epSelectedEmoji = null;
let epAvatarUrl = null;

let vklPollInterval = null;
let vklCurrentCode = null;
let vkPollInterval = null;
let vkCurrentCode = null;

let emlCurrentEmail = null;
let emlResendTimer = null;
let emlResendSeconds = 0;

let myStickerPacks = [];
let publicStickerPacks = [];
let currentStickerTab = 'emoji';
let currentPackEditorId = null;

let storiesList = [];
let currentStoryIndex = -1;
let currentStoryItem = 0;
let storyProgressRAF = null;
let storyStartTime = 0;
let storyDuration = 5000;

let localStream = null;
let screenStream = null;
let currentCall = null;
let callStartTime = null;
let callTimerInterval = null;
let peerConnections = new Map();
let pendingCandidates = new Map();
let remoteStreams = new Map();
let micEnabled = true;
let camEnabled = false;
let screenEnabled = false;
let incomingCallData = null;
let audioCtxRing = null;
let ringtoneInterval = null;

let voiceRecorder = null;
let voiceChunks = [];
let voiceRecording = false;
let voiceTimer = null;
let micLongPressTimer = null;
let micLongPressFired = false;
let circleRecorder = null;
let circleChunks = [];
let circleStream = null;
let circleRecording = false;
let circleTimerInterval = null;
let circlePreviewEl = null;

let undoTimer = null;

/* ============================================================
   КОНСТАНТЫ
   ============================================================ */
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

const DEFAULT_SETTINGS = {
  theme: 'dark', accent: 'violet', sound: true, notifications: true,
  wallpaper: null, minimalMode: false, liveBg: false, vibration: true
};
let settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem('danumes.settings') || '{}'));

const ACCENTS = {
  violet:  { name: 'Фиолетовый', a: '#a78bfa', b: '#7c3aed' },
  indigo:  { name: 'Индиго',     a: '#6366f1', b: '#a855f7' },
  pink:    { name: 'Розовый',    a: '#ec4899', b: '#f472b6' },
  cyan:    { name: 'Циан',       a: '#06b6d4', b: '#a855f7' },
  emerald: { name: 'Изумруд',    a: '#10b981', b: '#06b6d4' },
  orange:  { name: 'Закат',      a: '#f59e0b', b: '#ec4899' },
  red:     { name: 'Алый',       a: '#ef4444', b: '#ec4899' },
  blue:    { name: 'Океан',      a: '#3b82f6', b: '#06b6d4' }
};

const AV_COLORS = ['#a855f7','#ec4899','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#d946ef','#14b8a6','#f97316','#3b82f6','#84cc16'];
const AV_EMOJI = ['😎','🚀','⚡','🔥','🌟','🎨','🎭','🦊','🐼','🦁','🐯','🦄','🐸','🐙','🦉','💎','🌈','🍕','🌙','⭐','🎧','🎮','📷','🏆','💜','🎯','🕶','🐱','🐶','🦅'];
const CTX_EMOJI = ['👍','❤️','🔥','😂','😮','😢','🎉','👏','💯'];
const STICKERS = ['😎','🚀','🔥','😂','😍','🥳','😴','🤯','🤔','😡','👍','🙏','❤️','💔','🎉','✨','⭐','🌈','💯','🍕','🍔','☕','🎮','🎧','🎸','⚽','🏆','🐱','🐶','🦊','🐼','🦁','🌙','☀️','💎','🎁'];
const GIFS = [
  { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif', label: 'wow' },
  { url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif', label: 'clap' }
];

/* ============================================================
   УТИЛИТЫ
   ============================================================ */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keyOf = u => String(u || '').toLowerCase();

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function formatDuration(sec) {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function formatFileSize(b) {
  if (!b) return '0 Б';
  const k = 1024, sizes = ['Б','КБ','МБ','ГБ'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
function formatChatDate(ts) {
  const d = new Date(ts), now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d >= today) return 'Сегодня';
  if (d >= yest) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
function toast(text, dur = 2500) {
  const c = $('toasts'); if (!c) return;
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, dur);
}

const VERIFY_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2l2.4 2.4 3.3-.4.6 3.3L21 9l-1.6 2.9L21 15l-2.7 1.7-.6 3.3-3.3-.4L12 22l-2.4-2.4-3.3.4-.6-3.3L3 15l1.6-2.9L3 9l2.7-1.7.6-3.3 3.3.4L12 2zm-1.2 13.2l5.2-5.2-1.4-1.4-3.8 3.8-1.6-1.6-1.4 1.4 3 3z"/></svg>';
function verifyIconsHtml(user) {
  if (!user) return '';
  if (user.isAdmin) return '<span class="verify-icon admin">' + VERIFY_SVG + '</span>';
  if (user.isVerified) return '<span class="verify-icon verified">' + VERIFY_SVG + '</span>';
  return '';
}

/* ============================================================
   НАСТРОЙКИ
   ============================================================ */
function applySettings() {
  document.documentElement.setAttribute('data-theme', settings.theme);
  const acc = ACCENTS[settings.accent] || ACCENTS.violet;
  document.documentElement.style.setProperty('--grad', `linear-gradient(135deg, ${acc.a} 0%, ${acc.b} 100%)`);
  document.documentElement.style.setProperty('--accent', acc.a);
  document.documentElement.style.setProperty('--accent-2', acc.b);
  if (settings.wallpaper) {
    document.documentElement.style.setProperty('--chat-wallpaper', `url(${settings.wallpaper})`);
  } else {
    document.documentElement.style.setProperty('--chat-wallpaper', 'none');
  }
  document.body.classList.toggle('minimal-mode', !!settings.minimalMode);
  document.body.classList.toggle('live-bg', !!settings.liveBg);

  const setOn = (id, on) => { const e = $(id); if (e) e.classList.toggle('on', on); };
  const setTxt = (id, txt) => { const e = $(id); if (e) e.textContent = txt; };
  setOn('themeSwitch', settings.theme === 'dark');
  setTxt('themeSub', settings.theme === 'dark' ? 'Включена' : 'Выключена');
  setOn('soundSwitch', settings.sound);
  setTxt('soundSub', settings.sound ? 'Вкл' : 'Выкл');
  setOn('notifySwitch', settings.notifications);
  setOn('vibrationSwitch', settings.vibration);
  setTxt('vibrationSub', settings.vibration ? 'Вкл' : 'Выкл');
  setOn('minimalModeSwitch', settings.minimalMode);
  setTxt('minimalModeSub', settings.minimalMode ? 'Вкл' : 'Выкл');
  setOn('liveBgSwitch', settings.liveBg);
  setTxt('liveBgSub', settings.liveBg ? 'Вкл' : 'Выкл');

  localStorage.setItem('danumes.settings', JSON.stringify(settings));
}
applySettings();
function saveSettingsToServer() { socket.emit('settings:update', settings); }

/* ============================================================
   АВТОРИЗАЦИЯ
   ============================================================ */
function initAuth() {
  const savedToken = localStorage.getItem('danumes.token');
  const expiresAt = parseInt(localStorage.getItem('danumes.tokenExpires') || '0', 10);
  if (savedToken && (!expiresAt || expiresAt > Date.now())) {
    socket.emit('auth:resume', { token: savedToken }, res => {
      if (res && res.ok) {
        enterApp(res.user);
      } else {
        localStorage.removeItem('danumes.token');
        localStorage.removeItem('danumes.tokenExpires');
        hideSplash();
      }
    });
  } else if (savedToken) {
    localStorage.removeItem('danumes.token');
    localStorage.removeItem('danumes.tokenExpires');
    hideSplash();
  } else {
    hideSplash();
  }
   
  const urlParams = new URLSearchParams(window.location.search);
  const googleToken = urlParams.get('google_login');
  const googleError = urlParams.get('google_error');
  if (googleError) { setTimeout(() => toast('❌ Google: ' + googleError), 500); window.history.replaceState({}, '', '/'); }
  if (googleToken) {
    window.history.replaceState({}, '', '/');
    socket.emit('auth:google-exchange', { loginToken: googleToken }, res => {
      if (res && res.ok) {
        if (res.sessionToken) {
          localStorage.setItem('danumes.token', res.sessionToken);
          localStorage.setItem('danumes.tokenExpires', String(res.expiresAt || 0));
          socket.auth = { token: res.sessionToken };
          socket.disconnect();
          socket.connect();
        }
        enterApp(res.user);
      } else {
        toast('❌ Google: ' + (res?.error || 'ошибка'));
      }
    });
  }

  // Экраны входа/регистрации
  const screenLogin = $('screenLogin');
  const screenRegister = $('screenRegister');

  function showLoginScreen() {
    if (screenLogin) screenLogin.classList.add('on');
    if (screenRegister) screenRegister.classList.remove('on');
  }
  function showRegisterScreen() {
    if (screenRegister) screenRegister.classList.add('on');
    if (screenLogin) screenLogin.classList.remove('on');
  }

  // Ссылки
  const linkToRegister = $('linkToRegister');
  if (linkToRegister) linkToRegister.onclick = () => showRegisterScreen();

  const linkToLogin = $('linkToLogin');
  if (linkToLogin) linkToLogin.onclick = () => showLoginScreen();

  const linkForgot = $('linkForgot');
  if (linkForgot) linkForgot.onclick = () => {
    toast('Восстановление пароля пока недоступно. Напиши @danumala');
  };

  // Форма входа
  const formLogin = $('formLogin');
  if (formLogin) formLogin.addEventListener('submit', e => {
    e.preventDefault();
    const err = $('loginErr'); if (err) err.classList.remove('on');
    const login = $('loginLogin')?.value.trim();
    const password = $('loginPassword')?.value;
    if (!login || !password) {
      if (err) { err.textContent = 'Заполни поля'; err.classList.add('on'); }
      return;
    }
    const btn = $('loginBtn'); if (btn) btn.disabled = true;
    socket.emit('auth:login', { login, password }, res => {
      if (btn) btn.disabled = false;
      if (!res || !res.ok) {
        if (err) { err.textContent = res?.error || 'Ошибка'; err.classList.add('on'); }
        return;
      }
      if (res.sessionToken) {
        localStorage.setItem('danumes.token', res.sessionToken);
        localStorage.setItem('danumes.tokenExpires', String(res.expiresAt || 0));
      }
      enterApp(res.user);
    });
  });

  // Форма регистрации
  const formRegister = $('formRegister');
  if (formRegister) formRegister.addEventListener('submit', e => {
    e.preventDefault();
    const err = $('regErr'); if (err) err.classList.remove('on');
    const username = $('regUsername')?.value.trim();
    const password = $('regPassword')?.value;
    const email = $('regEmail')?.value.trim();
    const phone = $('regPhone')?.value.trim();

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username || '')) {
      if (err) { err.textContent = '3–20 символов, латиница/цифры/_'; err.classList.add('on'); }
      return;
    }
    if ((password || '').length < 4) {
      if (err) { err.textContent = 'Пароль минимум 4 символа'; err.classList.add('on'); }
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (err) { err.textContent = 'Некорректный email'; err.classList.add('on'); }
      return;
    }
    const btn = $('regBtn'); if (btn) btn.disabled = true;
    socket.emit('auth:register', { username, password, email, phone }, res => {
      if (!res || !res.ok) {
        if (btn) btn.disabled = false;
        if (err) { err.textContent = res?.error || 'Ошибка'; err.classList.add('on'); }
        return;
      }
      socket.emit('auth:login', { login: username, password }, r2 => {
        if (btn) btn.disabled = false;
        if (r2 && r2.ok) {
          if (r2.sessionToken) {
            localStorage.setItem('danumes.token', r2.sessionToken);
            localStorage.setItem('danumes.tokenExpires', String(r2.expiresAt || 0));
            socket.auth = { token: r2.sessionToken };
            socket.disconnect();
            socket.connect();
          }
          toast('✨ Аккаунт создан');
          enterApp(r2.user);
        } else {
          if (err) { err.textContent = 'Аккаунт создан, войди вручную'; err.classList.add('on'); }
          showLoginScreen();
        }
      });
    });
  });

  // VK / Email / Google
  const btnVkLogin = $('btnVkLogin');
  if (btnVkLogin) btnVkLogin.onclick = openVkLoginModal;

  const btnEmailLogin = $('btnEmailLogin');
  if (btnEmailLogin) btnEmailLogin.onclick = openEmailLoginModal;

  const btnGoogleLogin = $('btnGoogleLogin');
  if (btnGoogleLogin) btnGoogleLogin.onclick = () => {
    const w = 500, h = 650;
    const left = (window.screen.width - w) / 2;
    const top = (window.screen.height - h) / 2;
    const popup = window.open('/auth/google', 'google-oauth', `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) toast('❌ Разреши всплывающие окна');
  };
}

/* ============ VK ВХОД ============ */
function openVkLoginModal() {
  $('vklStep1').style.display = 'block';
  $('vklStep2').style.display = 'none';
  openModal('vkLoginModal');
  socket.emit('vk:login-start', res => {
    if (res && res.ok) {
      vklCurrentCode = res.code;
      if ($('vklCodeBox')) $('vklCodeBox').textContent = res.code;
      if ($('vklCommandText')) $('vklCommandText').textContent = '/login ' + res.code;
      startVklPolling(res.code);
    }
  });
}
function startVklPolling(code) {
  stopVklPolling();
  vklPollInterval = setInterval(() => {
    socket.emit('vk:login-check', { code }, res => {
      if (res && res.ok && res.done && res.user) {
        stopVklPolling();
        $('vklStep1').style.display = 'none';
        $('vklStep2').style.display = 'block';
        if (res.sessionToken) {
          localStorage.setItem('danumes.token', res.sessionToken);
          localStorage.setItem('danumes.tokenExpires', String(res.expiresAt || 0));
          socket.auth = { token: res.sessionToken };
          socket.disconnect();
          socket.connect();
        }
        setTimeout(() => { closeModal('vkLoginModal'); enterApp(res.user); }, 1200);
      }
    });
  }, 2000);
}
function stopVklPolling() { if (vklPollInterval) { clearInterval(vklPollInterval); vklPollInterval = null; } }
function initVkLoginModal() {
  $('vklClose') && ($('vklClose').onclick = () => { stopVklPolling(); closeModal('vkLoginModal'); });
  $('vklOpenBotBtn') && ($('vklOpenBotBtn').onclick = () => window.open('https://vk.com/club242031015', '_blank'));
  $('vklCopyBtn') && ($('vklCopyBtn').onclick = () => { if (vklCurrentCode) navigator.clipboard.writeText('/login ' + vklCurrentCode).then(() => toast('📋')); });
  $('vklRegenBtn') && ($('vklRegenBtn').onclick = () => {
    socket.emit('vk:login-start', res => {
      if (res && res.ok) {
        vklCurrentCode = res.code;
        if ($('vklCodeBox')) $('vklCodeBox').textContent = res.code;
        if ($('vklCommandText')) $('vklCommandText').textContent = '/login ' + res.code;
        startVklPolling(res.code);
      }
    });
  });
}

/* ============ EMAIL ВХОД ============ */
function openEmailLoginModal() {
  $('emlStep1').style.display = 'block';
  $('emlStep2').style.display = 'none';
  $('emlStep3').style.display = 'none';
  if ($('emlEmailInput')) $('emlEmailInput').value = '';
  openModal('emailLoginModal');
}
function initEmailLoginModal() {
  $('emlClose') && ($('emlClose').onclick = () => closeModal('emailLoginModal'));

  $('emlSendBtn') && ($('emlSendBtn').onclick = () => {
    const email = $('emlEmailInput')?.value.trim();
    const err = $('emlErr1'); err?.classList.remove('on');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (err) { err.textContent = 'Некорректный email'; err.classList.add('on'); } return; }
    $('emlSendBtn').disabled = true;
    socket.emit('auth:email-send-code', { email }, res => {
      $('emlSendBtn').disabled = false;
      if (!res || !res.ok) { if (err) { err.textContent = res?.error || 'Ошибка'; err.classList.add('on'); } return; }
      emlCurrentEmail = email;
      if ($('emlSentTo')) $('emlSentTo').textContent = email;
      $('emlStep1').style.display = 'none';
      $('emlStep2').style.display = 'block';
      startEmlResendTimer(60);
      if ($('emlCodeInput')) { $('emlCodeInput').value = ''; $('emlCodeInput').focus(); }
    });
  });

  $('emlVerifyBtn') && ($('emlVerifyBtn').onclick = () => {
    const code = $('emlCodeInput')?.value.trim();
    const err = $('emlErr2'); err?.classList.remove('on');
    if (!code || !/^\d{6}$/.test(code)) { if (err) { err.textContent = 'Введи 6-значный код'; err.classList.add('on'); } return; }
    $('emlVerifyBtn').disabled = true;
    socket.emit('auth:email-verify', { email: emlCurrentEmail, code }, res => {
      $('emlVerifyBtn').disabled = false;
      if (!res || !res.ok) { if (err) { err.textContent = res?.error || 'Неверный код'; err.classList.add('on'); } return; }
      $('emlStep2').style.display = 'none';
      $('emlStep3').style.display = 'block';
         if (res.sessionToken) {
        localStorage.setItem('danumes.token', res.sessionToken);
        localStorage.setItem('danumes.tokenExpires', String(res.expiresAt || 0));
        socket.auth = { token: res.sessionToken };
        socket.disconnect();
        socket.connect();
      }
      setTimeout(() => { closeModal('emailLoginModal'); enterApp(res.user); }, 1200);
    });
  });

  $('emlCodeInput') && ($('emlCodeInput').addEventListener('input', () => {
    $('emlCodeInput').value = $('emlCodeInput').value.replace(/\D/g, '').slice(0, 6);
  }));

  $('emlResendBtn') && ($('emlResendBtn').onclick = () => {
    if (emlResendSeconds > 0) return;
    socket.emit('auth:email-send-code', { email: emlCurrentEmail }, res => {
      if (res && res.ok) { toast('📧 Отправлено'); startEmlResendTimer(60); }
    });
  });
  $('emlChangeBtn') && ($('emlChangeBtn').onclick = () => {
    $('emlStep1').style.display = 'block';
    $('emlStep2').style.display = 'none';
  });
}
function startEmlResendTimer(sec) {
  emlResendSeconds = sec;
  if (emlResendTimer) clearInterval(emlResendTimer);
  updateEmlTimerText();
  emlResendTimer = setInterval(() => {
    emlResendSeconds--;
    updateEmlTimerText();
    if (emlResendSeconds <= 0) { clearInterval(emlResendTimer); emlResendTimer = null; }
  }, 1000);
}
function updateEmlTimerText() {
  const el = $('emlResendTimerText');
  const btn = $('emlResendBtn');
  if (emlResendSeconds > 0) {
    if (el) el.textContent = `Можно отправить ещё раз через ${emlResendSeconds} сек.`;
    if (btn) btn.disabled = true;
  } else {
    if (el) el.textContent = 'Можно отправить код повторно';
    if (btn) btn.disabled = false;
  }
}

/* ============ ENTER APP ============ */
function enterApp(user) {
  me = user;
  const auth = $('auth'); if (auth) auth.style.display = 'none';
  const app = $('app'); if (app) app.classList.add('on');
  updateProfileUI();
  updateMyBar();
  renderChatList();
  hideSplash();
}

function hideSplash() {
  const s = document.getElementById('splash');
  if (s) s.classList.add('hide');
}
socket.on('connect', () => {
  const t = localStorage.getItem('danumes.token');
  if (t && socket.auth) {
    socket.auth.token = t;
  }
});
/* ============================================================
   SOCKET EVENTS
   ============================================================ */
socket.on('registered', data => {
  me = data.me;
  rebuildUsers(data.users || []);
  if (data.settings) { settings = Object.assign({}, settings, data.settings); applySettings(); }
  if (data.chatHistory && typeof data.chatHistory === 'object') {
    Object.keys(data.chatHistory).forEach(cid => {
      messagesByChat.set(cid, data.chatHistory[cid].slice());
      const last = data.chatHistory[cid][data.chatHistory[cid].length - 1];
      if (last) lastMsg.set(cid, last);
    });
  }
  if (data.pinned) data.pinned.forEach(c => pinned.add(c));
  if (data.muted) data.muted.forEach(c => muted.add(c));
  if (data.pinnedMsgs && typeof data.pinnedMsgs === 'object') {
    Object.keys(data.pinnedMsgs).forEach(cid => pinnedMsgs.set(cid, data.pinnedMsgs[cid]));
  }
  if (data.groups) data.groups.forEach(g => groups.set(g.id, g));
  if (data.contacts) data.contacts.forEach(c => contacts.add(c));
  if (Array.isArray(data.stories)) storiesList = data.stories;
  if (Array.isArray(data.stickerPacks)) myStickerPacks = data.stickerPacks;

  updateProfileUI();
  updateMyBar();
  renderChatList();
  renderStories();
  if (currentChatId) updateMainHead();

  socket.emit('stickers:list-public', {}, list => {
    if (Array.isArray(list)) publicStickerPacks = list;
  });
});

socket.on('users:update', users => {
  rebuildUsers(users || []);
  renderChatList();
  updateMainHead();
  updateMyBar();
});

socket.on('group:created', g => { groups.set(g.id, g); renderChatList(); toast('👥 ' + (g.type === 'channel' ? 'Канал создан' : 'Группа создана')); });
socket.on('group:updated', g => {
  groups.set(g.id, g);
  renderChatList();
  if (currentChatId === g.id) { updateMainHead(); updateChannelNotice(); }
});
socket.on('group:removed', data => {
  groups.delete(data.groupId);
  messagesByChat.delete(data.groupId);
  if (currentChatId === data.groupId) closeChat();
  renderChatList();
  toast('Вас удалили из группы');
});
socket.on('group:left', data => {
  groups.delete(data.groupId);
  renderChatList();
  if (currentChatId === data.groupId) closeChat();
  toast('Вы вышли');
});
socket.on('group:invite-received', data => showInviteToast(data));

socket.on('chat:opened', data => {
  const chatId = data.chatId, messages = data.messages || [];
  if (data.chatType === 'group' && data.group) {
    groups.set(data.group.id, data.group);
    chatsMeta.set(chatId, { id: chatId, type: 'group', name: data.group.name, groupId: chatId, group: data.group });
  } else if (data.otherUser) {
    chatsMeta.set(chatId, { id: chatId, type: 'private', name: data.otherUser.username, otherKey: keyOf(data.otherUser.username), user: data.otherUser });
  }
  messagesByChat.set(chatId, messages.slice());
  const last = messages[messages.length - 1];
  if (last) lastMsg.set(chatId, last);
  renderChatList();
  openChat(chatId);
});

socket.on('message', msg => {
  if (!messagesByChat.has(msg.chatId)) messagesByChat.set(msg.chatId, []);
  messagesByChat.get(msg.chatId).push(msg);
  lastMsg.set(msg.chatId, msg);
  if (currentChatId === msg.chatId) {
    appendMessage(msg);
    scrollBottom();
    if (me && keyOf(msg.userId) !== keyOf(me.username)) socket.emit('chat:read', { chatId: msg.chatId });
  } else if (me && keyOf(msg.userId) !== keyOf(me.username)) {
    unread.set(msg.chatId, (unread.get(msg.chatId) || 0) + 1);
    if (!muted.has(msg.chatId)) {
      if (settings.sound) playSound();
      if (settings.vibration && navigator.vibrate) navigator.vibrate(30);
    }
  }
  renderChatList();
});

socket.on('message:updated', msg => {
  const arr = messagesByChat.get(msg.chatId) || [];
  const i = arr.findIndex(m => m.id === msg.id);
  if (me && msg.deletedFor && msg.deletedFor.indexOf(me.usernameLower) !== -1) {
    if (i >= 0) arr.splice(i, 1);
    const el = $('msgs')?.querySelector(`[data-id="${msg.id}"]`);
    if (el) el.remove();
    renderChatList();
    return;
  }
  if (i >= 0) arr[i] = msg;
  else arr.push(msg);
  if (currentChatId === msg.chatId) updateMessageInDOM(msg);
  renderChatList();
});

socket.on('chat:cleared', data => {
  messagesByChat.set(data.chatId, []);
  lastMsg.delete(data.chatId);
  pinnedMsgs.delete(data.chatId);
  if (currentChatId === data.chatId) { renderAllMessages(); updatePinnedBar(); }
  renderChatList();
  toast('🧹 Очищено');
});

socket.on('chat:read', data => {
  readBy.set(data.chatId, data.time);
  if (currentChatId === data.chatId) renderAllMessages();
});

socket.on('chat:pinned', data => { pinned.clear(); (data.list || []).forEach(c => pinned.add(c)); renderChatList(); });
socket.on('chat:muted', data => { muted.clear(); (data.list || []).forEach(c => muted.add(c)); renderChatList(); });

socket.on('message:pin-updated', data => {
  if (data.messageId) pinnedMsgs.set(data.chatId, data.messageId);
  else pinnedMsgs.delete(data.chatId);
  if (currentChatId === data.chatId) updatePinnedBar();
});

socket.on('user:typing', data => {
  if (!typingByChat.has(data.chatId)) typingByChat.set(data.chatId, new Map());
  const m = typingByChat.get(data.chatId);
  if (data.isTyping) m.set(keyOf(data.username), data.username);
  else m.delete(keyOf(data.username));
  if (currentChatId === data.chatId) { renderTyping(); updateMainHead(); }
  renderChatList();
});

socket.on('profile:updated', user => {
  me = user;
  updateProfileUI();
  updateMyBar();
  toast('✓ Сохранено');
});

socket.on('stories:update', list => {
  if (Array.isArray(list)) { storiesList = list; renderStories(); }
});

socket.on('message:pending-delete', data => {
  if (me && keyOf(data.by) === keyOf(me.username)) {
    const sec = Math.max(1, Math.round((data.deletedAt - Date.now()) / 1000));
    showUndoDeleteToast(data.messageId, data.chatId, sec);
    const el = $('msgs')?.querySelector(`[data-id="${data.messageId}"]`);
    if (el) { el.style.opacity = '0.4'; }
  }
});
socket.on('message:undo-delete', data => {
  const el = $('msgs')?.querySelector(`[data-id="${data.messageId}"]`);
  if (el) { el.style.opacity = ''; }
  hideUndoDeleteToast();
});

/* ============================================================
   ПРОФИЛЬ UI
   ============================================================ */
function rebuildUsers(users) { usersMap.clear(); users.forEach(u => usersMap.set(keyOf(u.username), u)); }

function updateProfileUI() {
  if (!me) return;
  const a = $('profAva');
  if (a) {
    if (me.avatarUrl) { a.style.backgroundImage = `url(${me.avatarUrl})`; a.textContent = ''; }
    else {
      a.style.backgroundImage = '';
      a.textContent = (me.avatar && /\p{Emoji}/u.test(me.avatar)) ? me.avatar : (me.username[0] || '?').toUpperCase();
      a.style.background = me.color || 'var(--grad)';
    }
  }
  const pn = $('profName');
  if (pn) pn.innerHTML = esc(me.username) + verifyIconsHtml(me);
  const ph = $('profHandle');
  if (ph) ph.textContent = '@' + me.username.toLowerCase();

  const setVal = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  setVal('setBioVal', me.bio || 'Не указано');
  setVal('setEmailVal', me.email || 'Не привязан');
  setVal('setPhoneVal', me.phone || 'Не привязан');
  setVal('setVkVal', me.vkLinked ? 'Привязан ✓' : 'Не привязан');
  setVal('setContactsVal', contacts.size + ' контакт' + plural(contacts.size, '', 'а', 'ов'));

  const eb = $('setEmailBadge');
  if (eb) { eb.textContent = me.emailVerified ? '✓' : (me.email ? 'Не подтв.' : 'Привязать'); eb.className = 'set-badge' + (me.emailVerified ? ' ok' : (me.email ? ' no' : '')); }
  const pb = $('setPhoneBadge');
  if (pb) { pb.textContent = me.phoneVerified ? '✓' : (me.phone ? 'Не подтв.' : 'Привязать'); pb.className = 'set-badge' + (me.phoneVerified ? ' ok' : (me.phone ? ' no' : '')); }
  const vb = $('setVkBadge');
  if (vb) { vb.textContent = me.vkLinked ? '✓' : 'Привязать'; vb.className = 'set-badge' + (me.vkLinked ? ' ok' : ''); }

  const row = $('adminOpenRow');
  if (row) row.style.display = me.isAdmin ? 'flex' : 'none';
}

function updateMyBar() {
  if (!me) return;
  const a = $('myBarAva');
  if (a) {
    if (me.avatarUrl) { a.style.backgroundImage = `url(${me.avatarUrl})`; a.textContent = ''; }
    else {
      a.style.backgroundImage = '';
      a.textContent = (me.avatar && /\p{Emoji}/u.test(me.avatar)) ? me.avatar : (me.username[0] || '?').toUpperCase();
      a.style.background = me.color || 'var(--grad)';
    }
  }
  const n = $('myBarName');
  if (n) n.innerHTML = esc(me.username) + verifyIconsHtml(me);
}

/* ============================================================
   ЗВУК / MARKDOWN / ССЫЛКИ
   ============================================================ */
function playSound() {
  if (!settings.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.start(); osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

function formatText(rawText) {
  let t = esc(rawText);
  t = t.replace(/```([\s\S]+?)```/g, '<pre>$1</pre>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>');
  t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  t = t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/@([a-zA-Z0-9_]{3,20})/g, '<span class="mention" data-username="$1">@$1</span>');
  t = t.replace(/(^|\s)#([a-zA-Z0-9_\u0400-\u04FF]{2,40})/g, '$1<span class="hashtag" data-tag="$2">#$2</span>');
  return t;
}

function extractFirstUrl(text) { if (!text) return null; const m = text.match(/(https?:\/\/[^\s<]+)/); return m ? m[1] : null; }

const linkPreviewCache = new Map();
function renderLinkPreview(container, url) {
  if (!container || !url) return;
  if (linkPreviewCache.has(url)) {
    const data = linkPreviewCache.get(url);
    if (data) renderLinkPreviewData(container, data);
    return;
  }
  fetch('/preview?url=' + encodeURIComponent(url))
    .then(r => r.json())
    .then(data => {
      if (!data || !data.ok) { container.innerHTML = ''; container.style.display = 'none'; return; }
      linkPreviewCache.set(url, data);
      renderLinkPreviewData(container, data);
    })
    .catch(() => { container.style.display = 'none'; });
}
function renderLinkPreviewData(container, data) {
  const imgHtml = data.image ? `<div class="lp-img" style="background-image:url(${esc(data.image)})"></div>` : '';
  container.style.display = 'block';
  container.innerHTML = `<a class="link-preview" href="${esc(data.url)}" target="_blank" rel="noopener">
    ${imgHtml}
    <div class="lp-body">
      <div class="lp-site">${esc(data.siteName || '')}</div>
      <div class="lp-title">${esc(data.title || data.url)}</div>
      ${data.description ? `<div class="lp-desc">${esc(data.description)}</div>` : ''}
    </div>
  </a>`;
}

/* ============================================================
   ПЛЕЕР ГОЛОСОВЫХ
   ============================================================ */
function initVoicePlayer(el) {
  if (el.dataset.init === '1') return;
  el.dataset.init = '1';
  const audio = el.querySelector('audio');
  if (!audio) return;
  const playBtn = el.querySelector('.vp-play');
  const wave = el.querySelector('.vp-wave');
  const timeEl = el.querySelector('.vp-time');
  const speedBtn = el.querySelector('.vp-speed');

  if (wave && !wave.querySelector('.vp-bar')) {
    let h = '';
    for (let i = 0; i < 28; i++) h += `<div class="vp-bar" style="height:${20 + Math.random() * 80}%"></div>`;
    wave.innerHTML = h;
  }
  const bars = wave ? wave.querySelectorAll('.vp-bar') : [];

  if (playBtn) {
    playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="8 5 19 12 8 19" fill="currentColor"/></svg>';
    playBtn.onclick = () => {
      if (audio.paused) {
        document.querySelectorAll('audio').forEach(a => { if (a !== audio) a.pause(); });
        audio.play().catch(() => {});
      } else audio.pause();
    };
  }
  audio.onplay = () => { if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>'; };
  audio.onpause = () => { if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="8 5 19 12 8 19" fill="currentColor"/></svg>'; };
  audio.ontimeupdate = () => {
    if (timeEl) timeEl.textContent = (audio.duration && !isNaN(audio.duration)) ? formatDuration(audio.currentTime) : '0:00';
    if (!audio.duration) return;
    const prog = audio.currentTime / audio.duration;
    const activeBars = Math.floor(prog * bars.length);
    bars.forEach((b, i) => b.classList.toggle('on', i < activeBars));
  };
  if (wave) wave.onclick = e => {
    if (!audio.duration) return;
    const rect = wave.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  };
  const speeds = [0.5, 1, 1.25, 1.5, 2];
  let si = 1;
  if (speedBtn) speedBtn.onclick = () => {
    si = (si + 1) % speeds.length;
    audio.playbackRate = speeds[si];
    speedBtn.textContent = speeds[si] + 'x';
  };
}

/* ============================================================
   BUILD MESSAGE
   ============================================================ */
function buildMsg(msg, prevMsg) {
  const isOwn = me && keyOf(msg.userId) === keyOf(me.username);
  const isFirst = !prevMsg || keyOf(prevMsg.userId) !== keyOf(msg.userId);
  const user = usersMap.get(keyOf(msg.userId));
  const username = user ? user.username : (msg.username || 'Unknown');
  const color = user ? (user.color || msg.color || '#a78bfa') : (msg.color || '#a78bfa');
  const avaUrl = user ? user.avatarUrl : msg.avatarUrl;
  const avaEmoji = user ? user.avatar : msg.avatar;

  let avaHtml = '';
  if (avaUrl) avaHtml = `<div class="ava sm" style="background-image:url(${esc(avaUrl)})"></div>`;
  else if (avaEmoji && /\p{Emoji}/u.test(avaEmoji)) avaHtml = `<div class="ava sm" style="background:${color}">${avaEmoji}</div>`;
  else avaHtml = `<div class="ava sm" style="background:${color}">${(username[0] || '?').toUpperCase()}</div>`;

  let reactionsHtml = '';
  if (msg.reactions && Object.keys(msg.reactions).length > 0) {
    reactionsHtml = '<div class="reactions">';
    for (const [emoji, users] of Object.entries(msg.reactions)) {
      if (!users || users.length === 0) continue;
      const isMine = me && users.some(u => keyOf(u) === keyOf(me.username));
      reactionsHtml += `<button class="reaction ${isMine ? 'mine' : ''}" data-emoji="${esc(emoji)}" data-msg-id="${msg.id}"><span>${esc(emoji)}</span><span class="reaction-count">${users.length}</span></button>`;
    }
    reactionsHtml += '</div>';
  }

  let attachmentsHtml = '';
  if (msg.attachments && msg.attachments.length > 0) {
    attachmentsHtml = '<div class="attachments">';
    msg.attachments.forEach(att => {
      const isImage = att.type && att.type.startsWith('image/');
      const isVideo = att.type && att.type.startsWith('video/');
      const isAudio = att.type && att.type.startsWith('audio/');
      if (isImage) attachmentsHtml += `<img class="att-image" src="${esc(att.url)}" />`;
      else if (isVideo) attachmentsHtml += `<video class="${att.name?.includes('circle') ? 'video-circle' : 'att-image'}" src="${esc(att.url)}" controls playsinline></video>`;
      else if (isAudio) attachmentsHtml += `<div class="voice-player"><button class="vp-play"></button><div class="vp-wave"></div><span class="vp-time">0:00</span><button class="vp-speed">1x</button><audio src="${esc(att.url)}" preload="metadata"></audio></div>`;
      else attachmentsHtml += `<a class="att-file" href="${esc(att.url)}" download="${esc(att.name)}" target="_blank"><span class="att-file-icon">📄</span><div class="att-file-info"><div class="att-file-name">${esc(att.name)}</div><div class="att-file-size">${formatFileSize(att.size)}</div></div></a>`;
    });
    attachmentsHtml += '</div>';
  }

  let stickerHtml = '';
  if (msg.stickerUrl) stickerHtml = `<img class="sticker-img" src="${esc(msg.stickerUrl)}" />`;
  else if (msg.sticker) stickerHtml = `<div class="sticker">${esc(msg.sticker)}</div>`;

  let pollHtml = '';
  if (msg.poll) {
    const total = msg.poll.votes ? Object.values(msg.poll.votes).reduce((s, a) => s + a.length, 0) : 0;
    pollHtml = `<div class="poll" style="padding:8px 4px;min-width:240px;"><div style="font-weight:700;margin-bottom:8px;">${esc(msg.poll.question)}</div>`;
    msg.poll.options.forEach((opt, i) => {
      const votes = msg.poll.votes ? (msg.poll.votes[i] || []) : [];
      const pct = total > 0 ? (votes.length / total) * 100 : 0;
      const voted = me && votes.some(u => keyOf(u) === keyOf(me.username));
      pollHtml += `<div class="poll-opt" data-poll-opt="${i}" data-poll-msg="${msg.id}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;margin-bottom:4px;position:relative;overflow:hidden;cursor:pointer;background:${voted ? 'rgba(167,139,250,0.2)' : 'rgba(0,0,0,0.1)'};"><div style="position:absolute;left:0;top:0;bottom:0;background:rgba(167,139,250,0.25);width:${pct}%;"></div><span style="flex:1;position:relative;">${esc(opt)}</span><span style="position:relative;font-size:12px;opacity:0.75;">${votes.length}</span></div>`;
    });
    pollHtml += '</div>';
  }

  let callHtml = '';
  if (msg.callType) {
    const icon = msg.callType === 'video' ? '📹' : '📞';
    const status = msg.callStatus === 'missed' ? 'Пропущенный' : (msg.callStatus === 'ended' ? 'Завершён' : '');
    const dur = msg.duration ? ` (${formatDuration(msg.duration)})` : '';
    callHtml = `<div style="display:flex;align-items:center;gap:10px;"><div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;">${icon}</div><div><div style="font-weight:700;">${msg.callType === 'video' ? 'Видеозвонок' : 'Аудиозвонок'}</div><div style="font-size:12px;opacity:0.75;">${status}${dur}</div></div></div>`;
  }

  let replyHtml = '';
  if (msg.replyTo) replyHtml = `<div class="reply-q"><b>${esc(msg.replyTo.username)}</b><span>${esc((msg.replyTo.text || 'Вложение').slice(0, 60))}</span></div>`;

  let textHtml = '';
  if (msg.text) {
    textHtml = `<div class="bubble-text">${formatText(msg.text)}</div>`;
    const firstUrl = extractFirstUrl(msg.text);
    if (firstUrl) textHtml += `<div class="link-preview-wrap" data-preview-url="${esc(firstUrl)}"></div>`;
  }

  const time = formatTime(msg.time);
  let readStatus = '';
  if (isOwn && readBy.has(msg.chatId) && readBy.get(msg.chatId) >= msg.time) {
    readStatus = '<span class="read-status read">✓✓</span>';
  } else if (isOwn) {
    readStatus = '<span class="read-status">✓</span>';
  }

  const displayText = msg.deleted ? '<i>Сообщение удалено</i>' : textHtml;
  const cls = [msg.edited ? 'edited' : '', msg.deleted ? 'deleted' : ''].join(' ');

  return `<div class="msg ${isOwn ? 'own' : ''} ${isFirst ? 'first' : ''}" data-id="${msg.id}" data-user="${esc(keyOf(msg.userId))}">
    <div class="msg-av">${isFirst ? avaHtml : ''}</div>
    <div class="msg-body">
      ${isFirst && !isOwn ? `<div class="msg-author" style="color:${color}">${esc(username)}${verifyIconsHtml(user)}</div>` : ''}
      <div class="bubble ${cls}">
        ${replyHtml}${stickerHtml}${pollHtml}${callHtml}${attachmentsHtml}${displayText}
        ${!msg.deleted ? `<span class="bubble-time">${time} ${readStatus}</span>` : ''}
      </div>
      ${reactionsHtml}
    </div>
  </div>`;
}

function appendMessage(msg) {
  const c = $('msgs'); if (!c) return;
  const arr = messagesByChat.get(msg.chatId) || [];
  const prev = arr.length > 1 ? arr[arr.length - 2] : null;
  c.insertAdjacentHTML('beforeend', buildMsg(msg, prev));
  const el = c.querySelector(`[data-id="${msg.id}"]`);
  if (el) {
    el.querySelectorAll('.voice-player').forEach(initVoicePlayer);
    const pw = el.querySelector('.link-preview-wrap');
    if (pw && pw.dataset.previewUrl) renderLinkPreview(pw, pw.dataset.previewUrl);
  }
}

function renderAllMessages() {
  const c = $('msgs'); if (!c || !currentChatId) return;
  const messages = messagesByChat.get(currentChatId) || [];
  let html = '', lastDate = '', prev = null;
  messages.forEach(msg => {
    const d = formatChatDate(msg.time);
    if (d !== lastDate) { html += `<div class="sys-msg">${d}</div>`; lastDate = d; prev = null; }
    html += buildMsg(msg, prev);
    prev = msg;
  });
  c.innerHTML = html;
  c.querySelectorAll('.voice-player').forEach(initVoicePlayer);
  c.querySelectorAll('.link-preview-wrap').forEach(pw => {
    if (pw.dataset.previewUrl) renderLinkPreview(pw, pw.dataset.previewUrl);
  });
}

function updateMessageInDOM(msg) {
  if (currentChatId !== msg.chatId) return;
  const el = $('msgs')?.querySelector(`[data-id="${msg.id}"]`);
  if (!el) return;
  const arr = messagesByChat.get(msg.chatId) || [];
  const i = arr.findIndex(m => m.id === msg.id);
  const prev = i > 0 ? arr[i - 1] : null;
  const temp = document.createElement('div');
  temp.innerHTML = buildMsg(msg, prev);
  el.replaceWith(temp.firstElementChild);
  temp.firstElementChild.querySelectorAll('.voice-player').forEach(initVoicePlayer);
}

function scrollBottom(smooth = true) {
  const c = $('msgs'); if (!c) return;
  c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

/* ============================================================
   CHAT LIST
   ============================================================ */
function renderChatList() {
  const c = $('chatList'); if (!c) return;
  let items = [];
  const seen = new Set();
  messagesByChat.forEach((msgs, chatId) => {
    if (chatId.startsWith('g_')) return;
    const parts = chatId.split('::');
    if (parts.length !== 2) return;
    const otherKey = parts[0] === keyOf(me.username) ? parts[1] : parts[0];
    if (seen.has(otherKey)) return;
    seen.add(otherKey);
    const user = usersMap.get(otherKey);
    if (!user) return;
    const last = msgs[msgs.length - 1] || null;
    items.push({ id: chatId, type: 'private', name: user.username, user, last, unread: unread.get(chatId) || 0, pinned: pinned.has(chatId), muted: muted.has(chatId), time: last ? last.time : 0 });
  });
  groups.forEach((g, id) => {
    const msgs = messagesByChat.get(id) || [];
    const last = msgs[msgs.length - 1] || null;
    items.push({ id, type: g.type || 'group', name: g.name, group: g, last, unread: unread.get(id) || 0, pinned: pinned.has(id), muted: muted.has(id), time: last ? last.time : (g.createdAt || 0) });
  });
  items.sort((a, b) => (a.pinned && !b.pinned) ? -1 : (!a.pinned && b.pinned) ? 1 : b.time - a.time);

  if (currentTab === 'unread') items = items.filter(i => i.unread > 0);
  else if (currentTab === 'groups') items = items.filter(i => i.type === 'group');
  else if (currentTab === 'channels') items = items.filter(i => i.type === 'channel');

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i => i.name.toLowerCase().includes(q) || (i.last?.text && i.last.text.toLowerCase().includes(q)));
  }

  if (items.length === 0) {
    c.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-3);font-size:13px;">Нет чатов</div>';
    return;
  }

  let html = '';
  items.forEach(item => {
    const isActive = item.id === currentChatId;
    const last = item.last;
    const typing = typingByChat.get(item.id);
    const isTyping = typing && typing.size > 0;
    let timeStr = '';
    if (last && last.time) {
      const d = new Date(last.time);
      timeStr = d.toDateString() === new Date().toDateString() ? formatTime(last.time) : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    }
    let prev = '';
    if (isTyping) { const t = Array.from(typing.values()); prev = t.length === 1 ? `${esc(t[0])} печатает...` : `${t.length} печатают...`; }
    else if (last) {
      if (last.deleted) prev = 'Сообщение удалено';
      else if (last.callType) prev = last.callType === 'video' ? '📹 Видеозвонок' : '📞 Звонок';
      else if (last.sticker || last.stickerUrl) prev = '🐱 Стикер';
      else if (last.attachments?.length) prev = '📎 Вложение';
      else if (last.text) prev = esc(last.text.slice(0, 50));
    }
    let avaHtml = '';
    if (item.type === 'private' && item.user) {
      const u = item.user;
      if (u.avatarUrl) avaHtml = `<div class="ava" style="background-image:url(${esc(u.avatarUrl)})"></div>`;
      else if (u.avatar && /\p{Emoji}/u.test(u.avatar)) avaHtml = `<div class="ava" style="background:${u.color || '#a78bfa'}">${u.avatar}</div>`;
      else avaHtml = `<div class="ava" style="background:${u.color || '#a78bfa'}">${(u.username[0] || '?').toUpperCase()}</div>`;
    } else if (item.group) {
      const g = item.group;
      if (g.avatarUrl) avaHtml = `<div class="ava" style="background-image:url(${esc(g.avatarUrl)})"></div>`;
      else avaHtml = `<div class="ava" style="background:${g.color || '#a78bfa'}">${item.type === 'channel' ? '📢' : '👥'}</div>`;
    }
    const badge = item.unread > 0 ? `<div class="ci-badge ${item.muted ? 'muted' : ''}">${item.unread > 99 ? '99+' : item.unread}</div>` : '';
    html += `<div class="chat-item ${isActive ? 'on' : ''}" data-chat-id="${item.id}" data-chat-type="${item.type}">
      ${avaHtml}
      <div class="ci-body">
        <div class="ci-row1"><div class="ci-name">${esc(item.name)}</div><div class="ci-time">${timeStr}</div></div>
        <div class="ci-row2"><div class="ci-prev ${isTyping ? 'typing' : ''}">${prev || 'Нет сообщений'}</div>${badge}</div>
      </div>
    </div>`;
  });
  c.innerHTML = html;
  c.querySelectorAll('.chat-item').forEach(el => {
    el.onclick = () => {
      const chatId = el.dataset.chatId, chatType = el.dataset.chatType;
      if (forwardMode) {
        socket.emit('messages:forward', { messageIds: [forwardMode.msg.id], fromChatId: forwardMode.msg.chatId, toChatIds: [chatId] }, res => { if (res && res.ok) toast('↪ Переслано'); });
        forwardMode = null;
        return;
      }
      if (chatType === 'private') {
        const parts = chatId.split('::');
        const otherKey = parts[0] === keyOf(me.username) ? parts[1] : parts[0];
        const u = usersMap.get(otherKey);
        if (u) socket.emit('chat:open', { withUsername: u.username });
      } else {
        socket.emit('chat:openGroup', { groupId: chatId });
      }
    };
    el.oncontextmenu = e => { e.preventDefault(); showCtxChat(e.clientX, e.clientY, el.dataset.chatId); };
  });
}

function openChat(chatId) {
  currentChatId = chatId;
  let meta = chatsMeta.get(chatId);
  if (!meta && chatId.startsWith('g_')) {
    const g = groups.get(chatId);
    if (g) meta = { id: chatId, type: g.type || 'group', name: g.name, groupId: chatId, group: g };
  }
  if (!meta) {
    const parts = chatId.split('::');
    const otherKey = parts[0] === keyOf(me.username) ? parts[1] : parts[0];
    const u = usersMap.get(otherKey);
    if (u) meta = { id: chatId, type: 'private', name: u.username, otherKey, user: u };
  }
  currentChatMeta = meta;
  if (unread.has(chatId)) { unread.delete(chatId); socket.emit('chat:read', { chatId }); }
  const es = $('emptyState'); if (es) es.style.display = 'none';
  const cv = $('chatView'); if (cv) cv.style.display = 'flex';
  document.body.classList.add('in-chat');
  updateMainHead();
  renderAllMessages();
  updatePinnedBar();
  renderChatList();
  updateChannelNotice();
  setTimeout(() => scrollBottom(false), 60);
  if (window.innerWidth <= 800) {
    $('side')?.classList.add('hidden');
    $('main')?.classList.add('on-mobile');
  }
  setTimeout(() => $('input')?.focus(), 250);
}

function closeChat() {
  currentChatId = null;
  currentChatMeta = null;
  const cv = $('chatView'); if (cv) cv.style.display = 'none';
  const es = $('emptyState'); if (es) es.style.display = 'flex';
  document.body.classList.remove('in-chat');
  $('side')?.classList.remove('hidden');
  $('main')?.classList.remove('on-mobile');
}

function updateMainHead() {
  if (!currentChatMeta) return;
  const meta = currentChatMeta;
  const avaEl = $('mhAva'), nameEl = $('mhName'), statusEl = $('mhStatus');
  if (meta.type === 'private' && meta.user) {
    if (avaEl) {
      if (meta.user.avatarUrl) { avaEl.style.backgroundImage = `url(${meta.user.avatarUrl})`; avaEl.textContent = ''; }
      else { avaEl.style.backgroundImage = ''; avaEl.textContent = (meta.user.avatar && /\p{Emoji}/u.test(meta.user.avatar)) ? meta.user.avatar : (meta.user.username[0] || '?').toUpperCase(); avaEl.style.background = meta.user.color || '#a78bfa'; }
    }
    if (nameEl) nameEl.innerHTML = esc(meta.user.username) + verifyIconsHtml(meta.user);
    if (statusEl) {
      const t = typingByChat.get(meta.id);
      if (t && t.size > 0) { statusEl.textContent = 'печатает...'; statusEl.className = 'mh-status typing'; }
      else { statusEl.textContent = 'в сети'; statusEl.className = 'mh-status on'; }
    }
  } else if (meta.group) {
    if (avaEl) {
      if (meta.group.avatarUrl) { avaEl.style.backgroundImage = `url(${meta.group.avatarUrl})`; avaEl.textContent = ''; }
      else { avaEl.style.backgroundImage = ''; avaEl.textContent = meta.type === 'channel' ? '📢' : '👥'; avaEl.style.background = meta.group.color || '#a78bfa'; }
    }
    if (nameEl) nameEl.textContent = meta.group.name;
    if (statusEl) { const n = (meta.group.members || []).length; statusEl.textContent = `${n} ${plural(n, 'участник', 'участника', 'участников')}`; statusEl.className = 'mh-status'; }
  }
  const ca = document.querySelector('.call-actions');
  if (ca) ca.style.display = (meta.type === 'private') ? 'flex' : 'none';

  // Клик по шапке (имя или аватар) → профиль (только для личных чатов)
  if (meta.type === 'private' && meta.user) {
    const targetKey = keyOf(meta.user.username);

    const infoEl = document.getElementById('mhInfo');
    const nameEl2 = document.getElementById('mhName');
    const avaEl2 = document.getElementById('mhAva');

    // Вешаем на само mh-info и на аватар — если оба есть
    const openHandler = (e) => {
      e.stopPropagation();
      openUserProfile(targetKey);
    };

    // Ищем контейнер mh-info (если у тебя его нет — берём nameEl)
    const clickTargets = [];
    if (nameEl2) clickTargets.push(nameEl2);
    if (avaEl2) clickTargets.push(avaEl2);

    clickTargets.forEach(el => {
      el.style.cursor = 'pointer';
      el.onclick = openHandler;
    });
  }
}

function updatePinnedBar() {
  const bar = $('pinnedBar'); if (!bar || !currentChatId) return;
  const mid = pinnedMsgs.get(currentChatId);
  if (!mid) { bar.style.display = 'none'; return; }
  const msgs = messagesByChat.get(currentChatId) || [];
  const msg = msgs.find(m => m.id === mid);
  if (!msg) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const t = $('pinnedBarText'); if (t) t.textContent = msg.text || 'Вложение';
}

function updateChannelNotice() {
  const n = $('channelNotice'); if (!n || !currentChatMeta) return;
  if (currentChatMeta.type === 'channel') {
    const g = groups.get(currentChatMeta.groupId);
    const isAdmin = g && me && (g.owner === keyOf(me.username) || (g.admins || []).includes(keyOf(me.username)));
    n.classList.toggle('on', !isAdmin);
  } else n.classList.remove('on');
}

function renderTyping() {
  const bar = $('typingBar'); if (!bar || !currentChatId) return;
  const t = typingByChat.get(currentChatId);
  if (!t || t.size === 0) { bar.innerHTML = ''; return; }
  const names = Array.from(t.values());
  const text = names.length === 1 ? names[0] + ' печатает' : names.length + ' человека печатают';
  bar.innerHTML = `${esc(text)} <span class="typing-dots"><span></span><span></span><span></span></span>`;
}

function showCtxChat(x, y, chatId) {
  const menu = $('ctxChat'); if (!menu) return;

  // Определяем, личный это чат и кто собеседник
  let peerUsername = null;
  if (!chatId.startsWith('g_') && me) {
    const parts = chatId.split('::');
    if (parts.length === 2) {
      const myKey = keyOf(me.username);
      const peerKey = parts[0] === myKey ? parts[1] : parts[0];
      const u = usersMap.get(peerKey);
      if (u) peerUsername = u.username;
    }
  }

  const profileBtn = peerUsername
    ? `<button class="ctx-item" data-action="profile"><span class="ico">👤</span><span>Профиль</span></button>`
    : '';

  menu.innerHTML = `
    ${profileBtn}
    <button class="ctx-item" data-action="pin"><span class="ico">📌</span><span>${pinned.has(chatId) ? 'Открепить' : 'Закрепить'}</span></button>
    <button class="ctx-item" data-action="mute"><span class="ico">🔇</span><span>${muted.has(chatId) ? 'Включить звук' : 'Без звука'}</span></button>
    <button class="ctx-item danger" data-action="clear"><span class="ico">🗑</span><span>Очистить</span></button>
  `;
  menu.classList.add('on');
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 10) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - r.height - 10) + 'px';
  menu.querySelectorAll('.ctx-item').forEach(item => {
    item.onclick = () => {
      const a = item.dataset.action;
      if (a === 'profile' && peerUsername) openUserProfile(peerUsername);
      else if (a === 'pin') socket.emit('chat:pin', { chatId });
      else if (a === 'mute') socket.emit('chat:mute', { chatId });
      else if (a === 'clear') { if (confirm('Очистить?')) socket.emit('chat:clear', { chatId }); }
      menu.classList.remove('on');
    };
  });
}

/* ============================================================
   COMPOSER
   ============================================================ */
function sendMessage() {
  const input = $('input'); if (!input) return;
  const text = input.value.trim();
  if (editMode) {
    if (!text) return;
    socket.emit('message:edit', { chatId: editMode.chatId, messageId: editMode.id, newText: text });
    input.value = '';
    input.style.height = 'auto';
    editMode = null;
    updateSendBtn();
    return;
  }
  if (!text && pendingAttachments.length === 0) return;
  if (!currentChatId) return;
  socket.emit('message:send', {
    chatId: currentChatId,
    text: text,
    attachments: pendingAttachments.length ? pendingAttachments : null,
    replyTo: replyTo ? { id: replyTo.id, username: replyTo.username, text: replyTo.text } : null,
    scheduledFor: scheduledFor
  }, res => { if (!res || !res.ok) toast('❌ ' + (res?.error || 'Ошибка')); });
  input.value = '';
  input.style.height = 'auto';
  pendingAttachments = [];
  renderAttachPreview();
  closeReply();
  scheduledFor = null;
  updateSendBtn();
  socket.emit('typing', { chatId: currentChatId, isTyping: false });
}

function updateSendBtn() {
  const input = $('input'), btn = $('btnSend');
  if (!input || !btn) return;
  btn.disabled = !input.value.trim() && pendingAttachments.length === 0;
}

async function uploadFiles(files) {
  for (const file of files) {
    if (file.size > 50 * 1024 * 1024) { toast('❌ Больше 50 МБ'); continue; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (d && d.url) {
        pendingAttachments.push({ url: d.url, name: file.name, size: file.size, type: file.type });
        renderAttachPreview();
        updateSendBtn();
      }
    } catch (e) { toast('❌ Ошибка загрузки'); }
  }
}

function renderAttachPreview() {
  const c = $('attachPreview'); if (!c) return;
  if (pendingAttachments.length === 0) { c.style.display = 'none'; c.innerHTML = ''; return; }
  c.style.display = 'flex';
  let html = '';
  pendingAttachments.forEach((att, i) => {
    const isImg = att.type && att.type.startsWith('image/');
    html += `<div class="attach-item">${isImg ? `<img src="${esc(att.url)}" />` : '<span>📄</span>'}<button class="rm" data-index="${i}">✕</button></div>`;
  });
  c.innerHTML = html;
  c.querySelectorAll('.rm').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      pendingAttachments.splice(parseInt(b.dataset.index, 10), 1);
      renderAttachPreview();
      updateSendBtn();
    };
  });
}

function setReply(msg) {
  replyTo = { id: msg.id, username: msg.username || 'Unknown', text: msg.text || 'Вложение' };
  const bar = $('replyBar'), nameEl = $('replyName'), textEl = $('replyText');
  if (bar) bar.classList.add('on');
  if (nameEl) nameEl.textContent = replyTo.username;
  if (textEl) textEl.textContent = replyTo.text.slice(0, 80);
  $('input')?.focus();
}
function closeReply() { replyTo = null; $('replyBar')?.classList.remove('on'); }

function startEditMessage(msg) {
  const input = $('input'); if (!input) return;
  input.value = msg.text || '';
  input.focus();
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  editMode = { id: msg.id, chatId: msg.chatId };
  updateSendBtn();
  toast('✏️ Измени и отправь');
}

function initComposer() {
  const input = $('input'); if (!input) return;
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    updateSendBtn();
    if (currentChatId && input.value.length > 0) {
      socket.emit('typing', { chatId: currentChatId, isTyping: true });
      clearTimeout(input._typingTimer);
      input._typingTimer = setTimeout(() => socket.emit('typing', { chatId: currentChatId, isTyping: false }), 2000);
    }
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim() || pendingAttachments.length) sendMessage();
    }
  });
  $('btnSend') && ($('btnSend').onclick = () => sendMessage());
  const attachBtn = $('btnAttach');
  if (attachBtn) {
    const fi = document.createElement('input');
    fi.type = 'file'; fi.multiple = true; fi.style.display = 'none';
    document.body.appendChild(fi);
    attachBtn.onclick = () => fi.click();
    fi.onchange = () => { if (fi.files.length) uploadFiles(fi.files); fi.value = ''; };
  }
  const voiceBtn = $('btnVoice');
  if (voiceBtn) {
    voiceBtn.addEventListener('mousedown', e => { e.preventDefault(); startVoiceOrCircle(); });
    voiceBtn.addEventListener('mouseup', () => stopVoiceOrCircle());
    voiceBtn.addEventListener('mouseleave', () => stopVoiceOrCircle());
    voiceBtn.addEventListener('touchstart', e => { e.preventDefault(); startVoiceOrCircle(); }, { passive: false });
    voiceBtn.addEventListener('touchend', e => { e.preventDefault(); stopVoiceOrCircle(); });
  }
  const emojiBtn = $('btnEmoji');
  if (emojiBtn) emojiBtn.onclick = e => {
    e.stopPropagation();
    const p = $('emojiPanel');
    p.classList.toggle('on');
    if (p.classList.contains('on')) renderEmojiTab(currentStickerTab);
  };
  document.addEventListener('click', e => {
    const p = $('emojiPanel');
    if (p && p.classList.contains('on') && !p.contains(e.target) && e.target !== emojiBtn) p.classList.remove('on');
  });
  const main = $('main'), drop = $('dropOverlay');
  if (main && drop) {
    main.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('on'); });
    main.addEventListener('dragleave', e => { if (e.target === main) drop.classList.remove('on'); });
    main.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('on'); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); });
  }
  $('replyClose') && ($('replyClose').onclick = closeReply);
  $('pinnedUnpin') && ($('pinnedUnpin').onclick = () => {
    const mid = pinnedMsgs.get(currentChatId);
    if (mid) socket.emit('message:pin', { chatId: currentChatId, messageId: mid });
  });
}

/* ============================================================
   EMOJI PANEL
   ============================================================ */
function renderEmojiTab(tab) {
  currentStickerTab = tab;
  const body = $('emojiBody'); if (!body) return;
  document.querySelectorAll('.emoji-tabs button').forEach(b => b.classList.toggle('on', b.dataset.emojiTab === tab));
  let html = '';
  if (tab === 'emoji') {
    html = '<div class="emoji-grid">';
    const all = [...new Set([...STICKERS, ...AV_EMOJI, '😊','😂','🥰','😍','🤩','😎','🤔','🙄','😴','😭','😡','👍','👎','🙏','👏','🤝','💪','❤️','💔','🔥','⭐','✨','🎉','🎁','🍕','☕','🎮','🎧','⚽','🏆','🌙','☀️','💎','🚀','⚡'])];
    all.forEach(e => html += `<button data-emoji="${e}">${e}</button>`);
    html += '</div>';
  } else if (tab === 'stickers') {
    if (publicStickerPacks.length === 0) html = '<div class="stickers-empty">Публичных паков нет</div>';
    else publicStickerPacks.forEach(p => { html += renderStickerPack(p, false); });
  } else if (tab === 'my-stickers') {
    if (myStickerPacks.length === 0) html = '<div class="stickers-empty">Нет паков<br><button class="btn-ghost" id="emojiCreatePack" style="margin-top:10px;">+ Создать</button></div>';
    else myStickerPacks.forEach(p => { html += renderStickerPack(p, true); });
  } else if (tab === 'gifs') {
    html = '<div class="gif-list">';
    GIFS.forEach(g => html += `<div class="gif-item" data-url="${esc(g.url)}"><img src="${esc(g.url)}" loading="lazy" /></div>`);
    html += '</div>';
  }
  body.innerHTML = html;
  body.querySelectorAll('.emoji-grid button').forEach(b => b.onclick = () => {
    const i = $('input');
    if (i) { i.value += b.dataset.emoji; i.focus(); updateSendBtn(); }
  });
  body.querySelectorAll('.pack-sticker').forEach(b => b.onclick = () => {
    if (b.dataset.url) sendSticker(b.dataset.url);
    else if (b.dataset.emoji) sendSticker(b.dataset.emoji);
  });
  body.querySelectorAll('.gif-item').forEach(el => el.onclick = () => sendGif(el.dataset.url));
  const cb = $('emojiCreatePack');
  if (cb) cb.onclick = () => { $('emojiPanel')?.classList.remove('on'); openCreatePackModal(); };
}

function renderStickerPack(pack, isOwner) {
  const coverHtml = pack.coverUrl
    ? `<div style="width:32px;height:32px;border-radius:8px;background:url(${esc(pack.coverUrl)}) center/cover;flex-shrink:0;"></div>`
    : `<div style="width:32px;height:32px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;">📦</div>`;
  let stickersHtml = '<div class="pack-stickers-grid">';
  if (pack.stickers?.length) {
    pack.stickers.forEach(s => {
      if (s.emoji) stickersHtml += `<button class="pack-sticker" data-emoji="${esc(s.emoji)}">${esc(s.emoji)}</button>`;
      else if (s.url) stickersHtml += `<button class="pack-sticker" data-url="${esc(s.url)}"><img src="${esc(s.url)}" loading="lazy" /></button>`;
    });
  } else stickersHtml += '<div class="stickers-empty" style="grid-column:1/-1;">Пусто</div>';
  stickersHtml += '</div>';
  return `<div style="display:flex;align-items:center;gap:10px;padding:10px 6px 6px;">${coverHtml}<div style="flex:1;font-size:13px;font-weight:700;">${esc(pack.name)}</div><div style="font-size:11px;color:var(--text-3);padding:3px 8px;border-radius:8px;background:var(--bg-3);">${(pack.stickers || []).length}</div></div>${stickersHtml}`;
}

function sendSticker(sticker) {
  if (!currentChatId) return;
  const isUrl = sticker.startsWith('http') || sticker.startsWith('/');
  socket.emit('message:send', { chatId: currentChatId, sticker: isUrl ? null : sticker, stickerUrl: isUrl ? sticker : null });
  $('emojiPanel')?.classList.remove('on');
}
function sendGif(url) {
  if (!currentChatId) return;
  socket.emit('message:send', { chatId: currentChatId, attachments: [{ url, name: 'GIF', size: 0, type: 'image/gif' }] });
  $('emojiPanel')?.classList.remove('on');
}

/* ============================================================
   CONTEXT MENU
   ============================================================ */
function showCtxMsg(x, y, msg) {
  ctxMessage = msg;
  const menu = $('ctxMsg'); if (!menu) return;
  const em = $('ctxEmoji');
  if (em) {
    em.innerHTML = '';
    CTX_EMOJI.forEach(e => {
      const b = document.createElement('button');
      b.textContent = e;
      b.onclick = () => {
        socket.emit('message:react', { chatId: msg.chatId, messageId: msg.id, emoji: e });
        hideCtxMsg();
      };
      em.appendChild(b);
    });
  }
  const isOwn = me && keyOf(msg.userId) === keyOf(me.username);
  menu.querySelectorAll('[data-own-only]').forEach(el => el.style.display = isOwn ? 'flex' : 'none');
  menu.classList.add('on');
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 10) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - r.height - 10) + 'px';
}
function hideCtxMsg() { $('ctxMsg')?.classList.remove('on'); ctxMessage = null; }

function handleCtxAction(action) {
  if (!ctxMessage) return;
  const msg = ctxMessage;
  switch (action) {
    case 'reply': setReply(msg); break;
    case 'forward': forwardMode = { msg }; toast('↪ Выбери чат'); break;
    case 'copy': navigator.clipboard.writeText(msg.text || '').then(() => toast('📋')); break;
    case 'pin': socket.emit('message:pin', { chatId: msg.chatId, messageId: msg.id }); break;
    case 'edit': startEditMessage(msg); break;
    case 'delete': deleteMessageWithUndo(msg.id, msg.chatId); break;
  }
  hideCtxMsg();
}

function deleteMessageWithUndo(id, chatId) {
  socket.emit('message:delete', { chatId, messageId: id, delay: 5000 });
}

function showUndoDeleteToast(id, chatId, sec) {
  hideUndoDeleteToast();
  const el = document.createElement('div');
  el.className = 'undo-delete-toast'; el.id = 'undoDeleteToast';
  el.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--bg-2);border:1px solid var(--border);border-radius:14px;padding:14px 18px;display:flex;align-items:center;gap:14px;box-shadow:var(--shadow-lg);z-index:600;';
  el.innerHTML = `<div style="font-size:13.5px;font-weight:600;">Сообщение удалено</div><button class="udt-btn" style="padding:6px 14px;border-radius:10px;background:var(--bg-3);color:var(--accent);font-size:13px;font-weight:700;cursor:pointer;">Отменить</button>`;
  document.body.appendChild(el);
  el.querySelector('.udt-btn').onclick = () => {
    socket.emit('message:undo-delete', { chatId, messageId: id });
    hideUndoDeleteToast();
  };
  undoTimer = setTimeout(() => hideUndoDeleteToast(), sec * 1000);
}
function hideUndoDeleteToast() { $('undoDeleteToast')?.remove(); if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; } }
/* ============================================================
   ЗВОНКИ
   ============================================================ */
function initCalls() {
  $('btnVoiceCall') && ($('btnVoiceCall').onclick = () => startCall('audio'));
  $('btnVideoCall') && ($('btnVideoCall').onclick = () => startCall('video'));
  $('callEnd') && ($('callEnd').onclick = () => endCall());
  $('callMic') && ($('callMic').onclick = () => toggleMic());
  $('callCam') && ($('callCam').onclick = () => toggleCam());
  $('callScreen') && ($('callScreen').onclick = () => toggleScreenShare());
  $('callMinimize') && ($('callMinimize').onclick = () => minimizeCall());
  $('miniExpand') && ($('miniExpand').onclick = () => restoreCall());
  $('miniEnd') && ($('miniEnd').onclick = e => { e.stopPropagation(); endCall(); });
  $('incAccept') && ($('incAccept').onclick = () => acceptIncomingCall());
  $('incReject') && ($('incReject').onclick = () => rejectIncomingCall());
}

async function startCall(type) {
  if (!currentChatMeta || currentChatMeta.type !== 'private') { toast('❌ Только для личных чатов'); return; }
  const target = currentChatMeta.user;
  if (!target) return;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
    micEnabled = true;
    camEnabled = type === 'video';
    callStartTime = null;
    currentCall = { id: null, peer: keyOf(target.username), type, isCaller: true };
    $('callOverlay')?.classList.add('on');
    if ($('callHeaderName')) $('callHeaderName').textContent = target.username;
    if ($('callHeaderStatus')) $('callHeaderStatus').textContent = 'Вызов...';
    if ($('callHeaderTimer')) $('callHeaderTimer').textContent = '00:00';
    if ($('callHeaderAva')) {
      if (target.avatarUrl) { $('callHeaderAva').style.backgroundImage = `url(${esc(target.avatarUrl)})`; $('callHeaderAva').textContent = ''; }
      else { $('callHeaderAva').style.backgroundImage = ''; $('callHeaderAva').textContent = (target.username[0] || '?').toUpperCase(); $('callHeaderAva').style.background = target.color || '#a78bfa'; }
    }
    renderCallTiles();
    socket.emit('call:invite', { chatId: currentChatId, callType: type, withUser: target.username }, res => {
      if (res && res.ok) currentCall.id = res.callId;
      else { toast('❌ Не удалось'); cleanupCall(); }
    });
  } catch (e) { toast('❌ Нет доступа к ' + (type === 'video' ? 'камере' : 'микрофону')); cleanupCall(); }
}

async function acceptIncomingCall() {
  if (!incomingCallData) return;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: incomingCallData.callType === 'video' });
    micEnabled = true;
    camEnabled = incomingCallData.callType === 'video';
    $('incomingCall')?.classList.remove('on');
    stopRingtone();
    $('callOverlay')?.classList.add('on');
    if ($('callHeaderName')) $('callHeaderName').textContent = incomingCallData.from.username;
    if ($('callHeaderStatus')) $('callHeaderStatus').textContent = 'Соединение...';
    currentCall = { id: incomingCallData.callId, peer: keyOf(incomingCallData.from.username), type: incomingCallData.callType, isCaller: false };
    renderCallTiles();
    socket.emit('call:accept', { callId: incomingCallData.callId }, res => {
      if (!res || !res.ok) { toast('❌ Не удалось'); cleanupCall(); return; }
      (res.peers || []).forEach(peer => createPeerConnection(peer.usernameLower, true));
    });
    incomingCallData = null;
  } catch (e) { toast('❌ Ошибка'); rejectIncomingCall(); }
}

function rejectIncomingCall() {
  if (incomingCallData) socket.emit('call:reject', { callId: incomingCallData.callId });
  $('incomingCall')?.classList.remove('on');
  stopRingtone();
  incomingCallData = null;
}

function endCall() {
  if (currentCall) {
    socket.emit('call:end', { callId: currentCall.id });
    if (callStartTime && currentChatMeta?.type === 'private') {
      socket.emit('call:save-history', { withUser: currentCall.peer, type: currentCall.type, duration: Math.floor((Date.now() - callStartTime) / 1000), status: 'ended' });
    }
  }
  cleanupCall();
}

function cleanupCall() {
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  peerConnections.forEach(pc => { try { pc.close(); } catch (e) {} });
  peerConnections.clear(); pendingCandidates.clear(); remoteStreams.clear();
  currentCall = null; callStartTime = null;
  if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
  micEnabled = true; camEnabled = false; screenEnabled = false;
  $('callOverlay')?.classList.remove('on');
  $('miniCall')?.classList.remove('on');
  stopRingtone();
}

function renderCallTiles() {
  const c = $('callVideos'); if (!c) return;
  const count = 1 + remoteStreams.size;
  c.className = 'call-videos ' + (count === 1 ? 'grid-1' : count === 2 ? 'grid-2' : count <= 4 ? 'grid-4' : 'grid-many');
  let html = `<div class="call-tile" data-peer="local"><video id="localVideo" autoplay playsinline muted></video><div class="call-tile-label">Ты ${!micEnabled ? '🔇' : ''}</div></div>`;
  remoteStreams.forEach((stream, peer) => {
    const u = usersMap.get(keyOf(peer));
    html += `<div class="call-tile" data-peer="${esc(peer)}"><video id="remoteVideo-${esc(peer)}" autoplay playsinline></video><div class="call-tile-label">${esc(u ? u.username : peer)}</div></div>`;
  });
  c.innerHTML = html;
  const lv = $('localVideo');
  if (lv && localStream) { lv.srcObject = localStream; lv.muted = true; lv.play().catch(() => {}); }
  remoteStreams.forEach((stream, peer) => {
    const el = $(`remoteVideo-${peer}`);
    if (el) { el.srcObject = stream; el.play().catch(() => {}); }
  });
}

function toggleMic() {
  if (!localStream) return;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
  $('callMic')?.classList.toggle('off', !micEnabled);
  if (currentCall) socket.emit('call:media', { callId: currentCall.id, micOn: micEnabled, camOn: camEnabled, screenOn: screenEnabled });
}
async function toggleCam() {
  if (!localStream) return;
  camEnabled = !camEnabled;
  const vts = localStream.getVideoTracks();
  if (vts.length === 0 && camEnabled) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = s.getVideoTracks()[0];
      localStream.addTrack(track);
      if ($('localVideo')) { $('localVideo').srcObject = localStream; $('localVideo').play().catch(() => {}); }
      peerConnections.forEach(pc => {
        const snd = pc.getSenders().find(x => x.track && x.track.kind === 'video');
        if (snd) snd.replaceTrack(track);
        else pc.addTrack(track, localStream);
      });
    } catch (e) { camEnabled = false; }
  } else vts.forEach(t => { t.enabled = camEnabled; });
  $('callCam')?.classList.toggle('off', !camEnabled);
}
async function toggleScreenShare() {
  if (screenEnabled) { if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; } screenEnabled = false; return; }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    screenEnabled = true;
    const track = screenStream.getVideoTracks()[0];
    peerConnections.forEach(pc => {
      const snd = pc.getSenders().find(x => x.track && x.track.kind === 'video');
      if (snd) snd.replaceTrack(track);
      else pc.addTrack(track, screenStream);
    });
    if ($('localVideo')) $('localVideo').srcObject = screenStream;
    track.onended = () => toggleScreenShare();
  } catch (e) {}
}
function minimizeCall() {
  $('callOverlay')?.classList.remove('on');
  $('miniCall')?.classList.add('on');
  const mv = $('miniVideo');
  if (mv) { const first = remoteStreams.values().next().value; if (first) mv.srcObject = first; else if (localStream) mv.srcObject = localStream; }
  if ($('miniName')) $('miniName').textContent = currentCall?.peer || 'Звонок';
}
function restoreCall() {
  $('miniCall')?.classList.remove('on');
  $('callOverlay')?.classList.add('on');
  renderCallTiles();
}

socket.on('call:incoming', data => {
  incomingCallData = data;
  if ($('incName')) $('incName').textContent = data.from.username;
  if ($('incType')) $('incType').textContent = (data.callType === 'video' ? 'Видеозвонок' : 'Аудиозвонок');
  if ($('incAva')) {
    if (data.from.avatarUrl) { $('incAva').style.backgroundImage = `url(${esc(data.from.avatarUrl)})`; $('incAva').textContent = ''; }
    else { $('incAva').style.backgroundImage = ''; $('incAva').textContent = (data.from.username[0] || '?').toUpperCase(); $('incAva').style.background = data.from.color || '#a78bfa'; }
  }
  $('incomingCall')?.classList.add('on');
  playRingtone();
});
socket.on('call:peers', data => { (data.peers || []).forEach(peer => createPeerConnection(peer.usernameLower, true)); });
socket.on('call:participant-joined', data => { createPeerConnection(data.participant.usernameLower, false); });
socket.on('call:participant-left', data => { const pc = peerConnections.get(keyOf(data.username)); if (pc) pc.close(); peerConnections.delete(keyOf(data.username)); remoteStreams.delete(keyOf(data.username)); renderCallTiles(); });
socket.on('call:rejected', () => { toast('📞 Отклонено'); cleanupCall(); });
socket.on('call:ended', () => cleanupCall());
socket.on('call:cancelled', () => cleanupCall());
socket.on('webrtc:offer', async data => {
  let pc = peerConnections.get(keyOf(data.from));
  if (!pc) pc = createPeerConnection(data.fromUsername, false, false);
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc:answer', { callId: data.callId, toUsername: data.from, answer });
    flushCandidates(data.from);
  } catch (e) {}
});
socket.on('webrtc:answer', async data => {
  const pc = peerConnections.get(keyOf(data.from));
  if (pc && pc.signalingState === 'have-local-offer') {
    try { await pc.setRemoteDescription(new RTCSessionDescription(data.answer)); flushCandidates(data.from); startCallTimer(); } catch (e) {}
  }
});
socket.on('webrtc:ice', data => {
  const key = keyOf(data.from), pc = peerConnections.get(key);
  if (pc && pc.remoteDescription) pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
  else { if (!pendingCandidates.has(key)) pendingCandidates.set(key, []); pendingCandidates.get(key).push(data.candidate); }
});

function createPeerConnection(peer, isCaller, sendOffer = true) {
  const key = keyOf(peer);
  let pc = peerConnections.get(key);
  if (pc) return pc;
  pc = new RTCPeerConnection(RTC_CONFIG);
  peerConnections.set(key, pc);
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.onicecandidate = e => { if (e.candidate && currentCall) socket.emit('webrtc:ice', { callId: currentCall.id, toUsername: peer, candidate: e.candidate }); };
  pc.ontrack = e => { remoteStreams.set(key, e.streams[0]); renderCallTiles(); startCallTimer(); };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') startCallTimer(); };
  if (isCaller && sendOffer && currentCall && currentCall.id) {
    (async () => {
      try { const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('webrtc:offer', { callId: currentCall.id, toUsername: peer, offer }); } catch (e) {}
    })();
  }
  return pc;
}
function flushCandidates(peer) {
  const key = keyOf(peer), pc = peerConnections.get(key);
  if (!pc) return;
  (pendingCandidates.get(key) || []).forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
  pendingCandidates.delete(key);
}
function startCallTimer() {
  if (callStartTime) return;
  callStartTime = Date.now();
  if ($('callHeaderStatus')) $('callHeaderStatus').textContent = 'Соединено';
  if (callTimerInterval) clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - callStartTime) / 1000);
    const m = Math.floor(s / 60), sec = s % 60;
    const str = `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    if ($('callHeaderTimer')) $('callHeaderTimer').textContent = str;
    if ($('miniTime')) $('miniTime').textContent = str;
  }, 1000);
}
function playRingtone() {
  try {
    if (!audioCtxRing) audioCtxRing = new (window.AudioContext || window.webkitAudioContext)();
    if (ringtoneInterval) clearInterval(ringtoneInterval);
    ringtoneInterval = setInterval(() => {
      const osc = audioCtxRing.createOscillator(), gain = audioCtxRing.createGain();
      osc.connect(gain); gain.connect(audioCtxRing.destination);
      osc.frequency.value = 880; gain.gain.setValueAtTime(0.0001, audioCtxRing.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, audioCtxRing.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtxRing.currentTime + 0.4);
      osc.start(); osc.stop(audioCtxRing.currentTime + 0.4);
    }, 1200);
  } catch (e) {}
}
function stopRingtone() { if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; } }

/* ============================================================
   ГОЛОСОВЫЕ / КРУЖКИ
   ============================================================ */
function startVoiceOrCircle() {
  micLongPressFired = false;
  micLongPressTimer = setTimeout(() => { micLongPressFired = true; startCircleRecording(); }, 500);
}
function stopVoiceOrCircle() {
  if (micLongPressTimer) { clearTimeout(micLongPressTimer); micLongPressTimer = null; }
  if (micLongPressFired) stopCircleRecording();
  else toggleVoiceRecording();
}
async function toggleVoiceRecording() {
  if (voiceRecording) { stopVoiceRecording(); return; }
  if (!currentChatId) return;
  try {
    voiceRecorder = new MediaRecorder(await navigator.mediaDevices.getUserMedia({ audio: true }));
    voiceChunks = [];
    voiceRecorder.ondataavailable = e => { if (e.data.size > 0) voiceChunks.push(e.data); };
    voiceRecorder.onstop = async () => {
      const blob = new Blob(voiceChunks, { type: 'audio/webm' });
      if (blob.size < 500) return;
      const fd = new FormData(); fd.append('file', blob, 'voice.webm');
      try {
        const r = await fetch('/upload', { method: 'POST', body: fd });
        const d = await r.json();
        if (d && d.url) socket.emit('message:send', { chatId: currentChatId, attachments: [{ url: d.url, name: 'voice.webm', size: blob.size, type: 'audio/webm' }] });
      } catch (e) {}
    };
    voiceRecorder.start();
    voiceRecording = true;
    voiceTimer = setTimeout(() => { if (voiceRecording) stopVoiceRecording(); }, 60000);
  } catch (e) { toast('❌ Нет доступа к микрофону'); }
}
function stopVoiceRecording() {
  if (voiceRecorder && voiceRecorder.state !== 'inactive') voiceRecorder.stop();
  voiceRecording = false;
  if (voiceTimer) { clearTimeout(voiceTimer); voiceTimer = null; }
}
async function startCircleRecording() {
  if (circleRecording || !currentChatId) return;
  try {
    circleStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 }, audio: true });
    circleRecorder = new MediaRecorder(circleStream, { mimeType: 'video/webm' });
    circleChunks = [];
    circleRecorder.ondataavailable = e => { if (e.data.size > 0) circleChunks.push(e.data); };
    circleRecorder.onstop = async () => {
      const blob = new Blob(circleChunks, { type: 'video/webm' });
      if (blob.size < 1000) return;
      const fd = new FormData(); fd.append('file', blob, 'circle.webm');
      try {
        const r = await fetch('/upload', { method: 'POST', body: fd });
        const d = await r.json();
        if (d && d.url) socket.emit('message:send', { chatId: currentChatId, attachments: [{ url: d.url, name: 'circle.webm', size: blob.size, type: 'video/webm' }] });
      } catch (e) {}
    };
    circleRecorder.start();
    circleRecording = true;
    const startTime = Date.now();
    circlePreviewEl = document.createElement('div');
    circlePreviewEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;';
    circlePreviewEl.innerHTML = `<video style="width:240px;height:240px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.2);" autoplay playsinline muted></video><div style="font-size:15px;font-weight:700;color:#fff;padding:4px 12px;border-radius:12px;background:rgba(239,68,68,0.3);">0:00</div>`;
    document.body.appendChild(circlePreviewEl);
    const video = circlePreviewEl.querySelector('video');
    if (video) video.srcObject = circleStream;
    circleTimerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      const counter = circlePreviewEl?.querySelector('div:nth-child(2)');
      if (counter) counter.textContent = `0:${s.toString().padStart(2, '0')}`;
      if (s >= 30) stopCircleRecording();
    }, 1000);
  } catch (e) { toast('❌ Нет доступа к камере'); }
}
function stopCircleRecording() {
  if (circleRecorder && circleRecorder.state !== 'inactive') circleRecorder.stop();
  if (circleStream) { circleStream.getTracks().forEach(t => t.stop()); circleStream = null; }
  circleRecording = false;
  if (circleTimerInterval) { clearInterval(circleTimerInterval); circleTimerInterval = null; }
  if (circlePreviewEl) { circlePreviewEl.remove(); circlePreviewEl = null; }
}

/* ============================================================
   ГРУППЫ
   ============================================================ */
let ngAvatarUrl = null;
let ngSearchQuery = '';

function initGroups() {
  $('btnNewGroup') && ($('btnNewGroup').onclick = () => {
    ngSelectedType = 'group';
    ngSelectedMembers.clear();
    ngAvatarUrl = null;
    ngSearchQuery = '';
    if ($('ngName')) $('ngName').value = '';
    if ($('ngDesc')) $('ngDesc').value = '';
    if ($('ngSearchInput')) $('ngSearchInput').value = '';
    const av = $('ngAvatar');
    if (av) { av.style.backgroundImage = ''; }
    const em = $('ngAvatarEmoji');
    if (em) em.textContent = '👥';
    if ($('ngTitle')) $('ngTitle').textContent = 'Новая группа';
    $('ngTypeGroup')?.classList.add('on');
    $('ngTypeChannel')?.classList.remove('on');
    renderNgMembers();
    updateNgCount();
    openModal('newGroupModal');
  });

  $('ngClose') && ($('ngClose').onclick = () => closeModal('newGroupModal'));
  $('ngCancel') && ($('ngCancel').onclick = () => closeModal('newGroupModal'));

  $('ngTypeGroup') && ($('ngTypeGroup').onclick = () => {
    ngSelectedType = 'group';
    $('ngTypeGroup').classList.add('on');
    $('ngTypeChannel')?.classList.remove('on');
    if ($('ngTitle')) $('ngTitle').textContent = 'Новая группа';
    if (!ngAvatarUrl) {
      const em = $('ngAvatarEmoji');
      if (em) em.textContent = '👥';
    }
  });

  $('ngTypeChannel') && ($('ngTypeChannel').onclick = () => {
    ngSelectedType = 'channel';
    $('ngTypeChannel').classList.add('on');
    $('ngTypeGroup')?.classList.remove('on');
    if ($('ngTitle')) $('ngTitle').textContent = 'Новый канал';
    if (!ngAvatarUrl) {
      const em = $('ngAvatarEmoji');
      if (em) em.textContent = '📢';
    }
  });

  // Клик по аватарке — загрузка картинки
  $('ngAvatar') && ($('ngAvatar').onclick = () => {
    const fi = document.createElement('input');
    fi.type = 'file';
    fi.accept = 'image/*';
    fi.onchange = async () => {
      if (!fi.files[0]) return;
      const fd = new FormData();
      fd.append('file', fi.files[0]);
      try {
        const r = await fetch('/upload', { method: 'POST', body: fd });
        const d = await r.json();
        if (d && d.url) {
          ngAvatarUrl = d.url;
          const av = $('ngAvatar');
          if (av) {
            av.style.backgroundImage = `url(${d.url})`;
            av.style.backgroundSize = 'cover';
            av.style.backgroundPosition = 'center';
          }
          const em = $('ngAvatarEmoji');
          if (em) em.textContent = '';
        }
      } catch (e) { toast('❌ Ошибка загрузки'); }
    };
    fi.click();
  });

  // Поиск участников
  $('ngSearchInput') && ($('ngSearchInput').oninput = () => {
    ngSearchQuery = $('ngSearchInput').value.trim().toLowerCase();
    renderNgMembers();
  });

  // Создание
  $('ngCreate') && ($('ngCreate').onclick = () => {
    const name = $('ngName')?.value.trim();
    if (!name || name.length < 2) { toast('❌ Мин 2 символа'); return; }
    $('ngCreate').disabled = true;
    socket.emit('group:create', {
      name,
      description: $('ngDesc')?.value.trim() || '',
      type: ngSelectedType,
      members: Array.from(ngSelectedMembers),
      avatarUrl: ngAvatarUrl
    }, res => {
      $('ngCreate').disabled = false;
      if (res && res.ok) closeModal('newGroupModal');
      else toast('❌ ' + (res?.error || 'Ошибка'));
    });
  });
}
function renderNgMembers() {
  const c = $('ngMembers'); if (!c) return;
  let html = '';
  usersMap.forEach((u, k) => {
    if (me && k === keyOf(me.username)) return;
    let ava = '';
    if (u.avatarUrl) ava = `<div class="ava" style="background-image:url(${esc(u.avatarUrl)})"></div>`;
    else ava = `<div class="ava" style="background:${u.color || '#a78bfa'}">${(u.avatar && /\p{Emoji}/u.test(u.avatar)) ? u.avatar : (u.username[0] || '?').toUpperCase()}</div>`;
    const sel = ngSelectedMembers.has(k);
    html += `<div class="member-chip ${sel ? 'on' : ''}" data-u="${esc(k)}">${ava}<span>${esc(u.username)}</span>${sel ? '<span class="check">✓</span>' : ''}</div>`;
  });
  c.innerHTML = html;
  c.querySelectorAll('.member-chip').forEach(ch => ch.onclick = () => {
    const u = ch.dataset.u;
    if (ngSelectedMembers.has(u)) ngSelectedMembers.delete(u); else ngSelectedMembers.add(u);
    renderNgMembers();
    updateNgCount();
  });
}
function updateNgCount() { if ($('ngCount')) $('ngCount').textContent = ngSelectedMembers.size; }

/* ============================================================
   ПРИГЛАШЕНИЯ (toast)
   ============================================================ */
let pendingInvite = null;
function showInviteToast(data) {
  pendingInvite = data;
  const el = $('inviteToast'); if (!el) return;
  if ($('itAva')) {
    if (data.fromAvatarUrl) { $('itAva').style.backgroundImage = `url(${esc(data.fromAvatarUrl)})`; $('itAva').textContent = ''; }
    else { $('itAva').textContent = (data.from[0] || '?').toUpperCase(); $('itAva').style.background = data.fromColor || 'var(--accent)'; }
  }
  if ($('itTitle')) $('itTitle').textContent = data.from + ' приглашает';
  if ($('itBody')) $('itBody').innerHTML = `в ${data.type === 'channel' ? 'канал' : 'группу'} <b>${esc(data.groupName)}</b>`;
  el.classList.add('on');
}
function initInviteToast() {
  $('itAccept') && ($('itAccept').onclick = () => {
    if (pendingInvite) socket.emit('group:acceptInvite', { groupId: pendingInvite.groupId }, res => { if (res && res.ok) toast('✓ Вступили'); });
    $('inviteToast')?.classList.remove('on');
    pendingInvite = null;
  });
  $('itDecline') && ($('itDecline').onclick = () => {
    if (pendingInvite) socket.emit('group:declineInvite', { groupId: pendingInvite.groupId });
    $('inviteToast')?.classList.remove('on');
    pendingInvite = null;
  });
}

/* ============================================================
   ПОИСК ЛЮДЕЙ
   ============================================================ */
function initNewChat() {
  $('btnNewChat') && ($('btnNewChat').onclick = () => { openModal('newChatModal'); const i = $('ncSearchInput'); if (i) { i.value = ''; i.focus(); } });
  $('ncClose') && ($('ncClose').onclick = () => closeModal('newChatModal'));
  $('ncSearchInput') && ($('ncSearchInput').oninput = () => {
    const q = $('ncSearchInput').value.trim().toLowerCase();
    const c = $('ncResults'); if (!c) return;
    if (!q) { c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px;">Введи имя</div>'; return; }
    const matches = [];
    usersMap.forEach((u, k) => { if (me && k === keyOf(me.username)) return; if (u.username.toLowerCase().includes(q)) matches.push(u); });
    if (matches.length === 0) { c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px;">Никого не найдено</div>'; return; }
    let html = '';
    matches.slice(0, 30).forEach(u => {
      let ava = '';
      if (u.avatarUrl) ava = `<div class="ava sm" style="background-image:url(${esc(u.avatarUrl)})"></div>`;
      else ava = `<div class="ava sm" style="background:${u.color || '#a78bfa'}">${(u.avatar && /\p{Emoji}/u.test(u.avatar)) ? u.avatar : (u.username[0] || '?').toUpperCase()}</div>`;
      html += `<div class="chat-item" data-username="${esc(u.username)}" style="cursor:pointer;">${ava}<div class="ci-body"><div class="ci-name">${esc(u.username)}${verifyIconsHtml(u)}</div><div class="ci-prev">${u.bio ? esc(u.bio.slice(0, 40)) : 'Нажми, чтобы начать'}</div></div></div>`;
    });
    c.innerHTML = html;
    c.querySelectorAll('.chat-item').forEach(el => el.onclick = () => {
      socket.emit('chat:open', { withUsername: el.dataset.username });
      closeModal('newChatModal');
    });
  });
}

/* ============================================================
   СТИКЕР-ПАКИ МОДАЛКИ
   ============================================================ */
function openStickersModal() { openModal('stickersModal'); renderStickersModal(); }
function renderStickersModal() {
  const c = $('smPacksList'); if (!c) return;
  if (myStickerPacks.length === 0) { c.innerHTML = '<div class="stickers-empty">Нет паков</div>'; return; }
  let html = '';
  myStickerPacks.forEach(p => {
    const cover = p.coverUrl ? `<div style="width:32px;height:32px;border-radius:8px;background:url(${esc(p.coverUrl)}) center/cover;"></div>` : `<div style="width:32px;height:32px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center;">📦</div>`;
    html += `<div style="display:flex;align-items:center;gap:10px;padding:10px;cursor:pointer;border-radius:12px;" data-pack-id="${p.id}">${cover}<div style="flex:1;font-size:14px;font-weight:700;">${esc(p.name)}</div><div style="font-size:11px;color:var(--text-3);">${(p.stickers || []).length}</div></div>`;
  });
  c.innerHTML = html;
  c.querySelectorAll('[data-pack-id]').forEach(el => el.onclick = () => { closeModal('stickersModal'); openPackEditor(el.dataset.packId); });
}
function openCreatePackModal() {
  if ($('cpName')) $('cpName').value = '';
  if ($('cpDesc')) $('cpDesc').value = '';
  openModal('createPackModal');
}
function openPackEditor(packId) {
  const p = myStickerPacks.find(x => x.id === packId); if (!p) return;
  currentPackEditorId = packId;
  if ($('pePackTitle')) $('pePackTitle').textContent = p.name;
  const grid = $('peStickersGrid');
  if (grid) {
    if (!p.stickers?.length) grid.innerHTML = '<div class="stickers-empty">Нет стикеров</div>';
    else {
      let html = '';
      p.stickers.forEach(s => {
        const content = s.emoji ? `<span style="font-size:32px;">${esc(s.emoji)}</span>` : `<img src="${esc(s.url)}" loading="lazy" />`;
        html += `<div class="pe-sticker">${content}<button class="pe-sticker-del" data-sticker-id="${s.id}">✕</button></div>`;
      });
      grid.innerHTML = html;
      grid.querySelectorAll('[data-sticker-id]').forEach(b => b.onclick = () => {
        socket.emit('stickers:delete', { stickerId: b.dataset.stickerId }, () => {
          socket.emit('stickers:list-my', packs => { if (Array.isArray(packs)) { myStickerPacks = packs; openPackEditor(packId); } });
        });
      });
    }
  }
  openModal('packEditorModal');
}

/* ============================================================
   НАСТРОЙКИ
   ============================================================ */
function showPicker(title, options, onSelect) {
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--bg-2);border:1px solid var(--border);border-radius:16px;padding:12px;box-shadow:var(--shadow-lg);z-index:1100;min-width:220px;';
  let html = `<div style="font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;padding:6px 10px 8px;">${esc(title)}</div>`;
  options.forEach(o => {
    const style = o.color ? `background:${o.color};width:20px;height:20px;border-radius:6px;display:inline-block;margin-right:8px;vertical-align:middle;` : '';
    html += `<div data-value="${esc(o.value)}" style="padding:10px 12px;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;background:${o.active ? 'rgba(167,139,250,0.15)' : 'transparent'};color:${o.active ? 'var(--accent)' : 'var(--text)'};">${o.color ? `<span style="${style}"></span>` : ''}${esc(o.label)}</div>`;
  });
  p.innerHTML = html;
  document.body.appendChild(p);
  p.querySelectorAll('[data-value]').forEach(i => i.onclick = () => { onSelect(i.dataset.value); p.remove(); });
  setTimeout(() => { document.addEventListener('click', function close(e) { if (!p.contains(e.target)) { p.remove(); document.removeEventListener('click', close); } }); }, 10);
}

function initSettings() {
  $('btnSettings') && ($('btnSettings').onclick = () => $('panel')?.classList.add('on'));
  $('panelClose') && ($('panelClose').onclick = () => $('panel')?.classList.remove('on'));
  $('themeItem') && ($('themeItem').onclick = () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; applySettings(); saveSettingsToServer(); });
  $('accentItem') && ($('accentItem').onclick = () => showPicker('Акцент', Object.entries(ACCENTS).map(([k, v]) => ({ label: v.name, value: k, active: settings.accent === k, color: `linear-gradient(135deg, ${v.a}, ${v.b})` })), v => { settings.accent = v; applySettings(); saveSettingsToServer(); }));
  $('wallpaperItem') && ($('wallpaperItem').onclick = () => {
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*';
    fi.onchange = async () => {
      if (!fi.files[0]) return;
      const fd = new FormData(); fd.append('file', fi.files[0]);
      try { const r = await fetch('/upload', { method: 'POST', body: fd }); const d = await r.json(); if (d && d.url) { settings.wallpaper = d.url; applySettings(); saveSettingsToServer(); } } catch (e) {}
    };
    fi.click();
  });
  $('minimalModeItem') && ($('minimalModeItem').onclick = () => { settings.minimalMode = !settings.minimalMode; applySettings(); saveSettingsToServer(); });
  $('liveBgItem') && ($('liveBgItem').onclick = () => { settings.liveBg = !settings.liveBg; applySettings(); saveSettingsToServer(); });
  $('soundItem') && ($('soundItem').onclick = () => { settings.sound = !settings.sound; applySettings(); saveSettingsToServer(); });
  $('notifyItem') && ($('notifyItem').onclick = () => { settings.notifications = !settings.notifications; if (settings.notifications && Notification.permission === 'default') Notification.requestPermission(); applySettings(); saveSettingsToServer(); });
  $('vibrationItem') && ($('vibrationItem').onclick = () => { settings.vibration = !settings.vibration; applySettings(); saveSettingsToServer(); });
  $('btnLogout') && ($('btnLogout').onclick = () => {
    if (confirm('Выйти?')) {
      const t = localStorage.getItem('danumes.token');
      socket.emit('auth:logout', { token: t });
      localStorage.removeItem('danumes.token');
      localStorage.removeItem('danumes.tokenExpires');
      location.reload();
    }
  });
  $('setPassword') && ($('setPassword').onclick = () => { if ($('pwErr')) $('pwErr').classList.remove('on'); if ($('pwCurrent')) $('pwCurrent').value = ''; if ($('pwNext')) $('pwNext').value = ''; openModal('passwordModal'); });
  $('pwClose') && ($('pwClose').onclick = () => closeModal('passwordModal'));
  $('pwSave') && ($('pwSave').onclick = () => {
    const c = $('pwCurrent')?.value, n = $('pwNext')?.value;
    if (!c || !n || n.length < 4) { if ($('pwErr')) { $('pwErr').textContent = 'Пароль мин 4'; $('pwErr').classList.add('on'); } return; }
    socket.emit('profile:password', { current: c, next: n }, res => {
      if (res && res.ok) { toast('✓ Пароль изменён'); closeModal('passwordModal'); }
      else { if ($('pwErr')) { $('pwErr').textContent = res?.error || 'Ошибка'; $('pwErr').classList.add('on'); } }
    });
  });
  $('setSessions') && ($('setSessions').onclick = () => {
    socket.emit('sessions:list', sessions => {
      const b = $('ssBody'); if (!b) return;
      if (!Array.isArray(sessions) || sessions.length === 0) b.innerHTML = '<div style="text-align:center;color:var(--text-3);padding:20px;">Нет сессий</div>';
      else b.innerHTML = sessions.map(s => `<div class="session-item"><div class="s-icon">🖥</div><div class="s-body"><div class="s-name">${esc((s.ua || 'Устройство').slice(0, 60))}${s.current ? ' <span class="s-badge">Сейчас</span>' : ''}</div><div class="s-info">${new Date(s.lastActive).toLocaleString('ru-RU')}</div></div></div>`).join('');
      openModal('sessionsModal');
    });
  });
  $('ssClose') && ($('ssClose').onclick = () => closeModal('sessionsModal'));
  $('setDelete') && ($('setDelete').onclick = () => { if ($('dlErr')) $('dlErr').classList.remove('on'); if ($('dlPassword')) $('dlPassword').value = ''; openModal('deleteModal'); });
  $('dlClose') && ($('dlClose').onclick = () => closeModal('deleteModal'));
  $('dlConfirm') && ($('dlConfirm').onclick = () => {
    const p = $('dlPassword')?.value; if (!p) return;
    socket.emit('profile:delete', { password: p }, res => {
      if (res && res.ok) { localStorage.removeItem('danumes.token'); localStorage.removeItem('danumes.tokenExpires'); location.reload(); }
      else { if ($('dlErr')) { $('dlErr').textContent = res?.error || 'Ошибка'; $('dlErr').classList.add('on'); } }
    });
  });
  $('setEmail') && ($('setEmail').onclick = () => { if ($('emInput')) $('emInput').value = me?.email || ''; openModal('emailModal'); });
  $('emClose') && ($('emClose').onclick = () => closeModal('emailModal'));
  $('emSave') && ($('emSave').onclick = () => {
    const e = $('emInput')?.value.trim();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast('❌ Email'); return; }
    socket.emit('profile:bind-email', { email: e }, res => { if (res && res.ok) { toast('✓'); closeModal('emailModal'); } });
  });
  $('setPhone') && ($('setPhone').onclick = () => { if ($('phInput')) $('phInput').value = me?.phone || ''; openModal('phoneModal'); });
  $('phClose') && ($('phClose').onclick = () => closeModal('phoneModal'));
  $('phSave') && ($('phSave').onclick = () => {
    const p = $('phInput')?.value.trim();
    socket.emit('profile:bind-phone', { phone: p }, res => { if (res && res.ok) { toast('✓'); closeModal('phoneModal'); } });
  });
  $('setVk') && ($('setVk').onclick = () => { if (me?.vkLinked) { $('vkStep1').style.display = 'none'; $('vkStep2').style.display = 'block'; openModal('vkLinkModal'); } else openVkLinkModal(); });
  $('setMyStickers') && ($('setMyStickers').onclick = () => openStickersModal());
  $('setContacts') && ($('setContacts').onclick = () => { renderContactsList(); openModal('contactsModal'); });
  $('cntClose') && ($('cntClose').onclick = () => closeModal('contactsModal'));
  $('cntAdd') && ($('cntAdd').onclick = () => {
    const u = $('cntUsername')?.value.trim(); if (!u) return;
    socket.emit('contacts:add', { username: u }, res => {
      if (res && res.ok) { toast('✓'); contacts.add(keyOf(u)); if ($('cntUsername')) $('cntUsername').value = ''; renderContactsList(); updateProfileUI(); }
      else toast('❌');
    });
  });
  $('vkClose') && ($('vkClose').onclick = () => { stopVkPolling(); closeModal('vkLinkModal'); });
  $('vkOpenBotBtn') && ($('vkOpenBotBtn').onclick = () => window.open('https://vk.com/club242031015', '_blank'));
  $('vkRegenBtn') && ($('vkRegenBtn').onclick = () => socket.emit('vk:get-link-code', r => {
    if (r && r.ok) { vkCurrentCode = r.code; if ($('vkCodeBox')) $('vkCodeBox').textContent = r.code; if ($('vkCommandText')) $('vkCommandText').textContent = '/link ' + r.code; startVkPolling(r.code); }
  }));
  $('vkUnlinkBtn') && ($('vkUnlinkBtn').onclick = () => { if (!confirm('Отвязать?')) return; socket.emit('vk:unlink', () => { toast('✓'); closeModal('vkLinkModal'); me.vkLinked = false; updateProfileUI(); }); });
  $('vkDoneBtn') && ($('vkDoneBtn').onclick = () => closeModal('vkLinkModal'));
  $('smClose') && ($('smClose').onclick = () => closeModal('stickersModal'));
  $('smCreatePack') && ($('smCreatePack').onclick = () => { closeModal('stickersModal'); openCreatePackModal(); });
  $('cpClose') && ($('cpClose').onclick = () => closeModal('createPackModal'));
  $('cpSave') && ($('cpSave').onclick = () => {
    const n = $('cpName')?.value.trim(); if (!n) { toast('❌ Введи название'); return; }
    socket.emit('stickers:create-pack', { name: n, description: $('cpDesc')?.value.trim() || '', isPublic: $('cpPublic')?.checked }, res => {
      if (res && res.ok) { toast('✓'); closeModal('createPackModal'); socket.emit('stickers:list-my', packs => { if (Array.isArray(packs)) myStickerPacks = packs; }); }
    });
  });
  $('peClose') && ($('peClose').onclick = () => closeModal('packEditorModal'));
  $('peAddSticker') && ($('peAddSticker').onclick = () => {
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true;
    fi.onchange = async () => {
      for (const f of fi.files) {
        const fd = new FormData(); fd.append('file', f);
        try { const r = await fetch('/upload', { method: 'POST', body: fd }); const d = await r.json(); if (d && d.url) socket.emit('stickers:add', { packId: currentPackEditorId, url: d.url }, () => socket.emit('stickers:list-my', packs => { if (Array.isArray(packs)) { myStickerPacks = packs; openPackEditor(currentPackEditorId); } })); } catch (e) {}
      }
    };
    fi.click();
  });
  $('peDeletePack') && ($('peDeletePack').onclick = () => {
    if (confirm('Удалить пак?')) {
      socket.emit('stickers:delete-pack', { packId: currentPackEditorId }, () => {
        toast('🗑 Удалено'); closeModal('packEditorModal');
        socket.emit('stickers:list-my', packs => { if (Array.isArray(packs)) myStickerPacks = packs; });
      });
    }
  });
}
function renderContactsList() {
  const l = $('cntList'); if (!l) return;
  if (contacts.size === 0) { l.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-3);font-size:13px;">Нет контактов</div>'; return; }
  let html = '';
  contacts.forEach(c => { const u = usersMap.get(c); if (u) html += `<div style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:1px solid var(--border);"><span style="flex:1;">${esc(u.username)}</span></div>`; });
  l.innerHTML = html;
}

/* ============================================================
   VK ПРИВЯЗКА
   ============================================================ */
function openVkLinkModal() {
  $('vkStep1').style.display = 'block'; $('vkStep2').style.display = 'none';
  openModal('vkLinkModal');
  socket.emit('vk:get-link-code', r => {
    if (r && r.ok) { vkCurrentCode = r.code; if ($('vkCodeBox')) $('vkCodeBox').textContent = r.code; if ($('vkCommandText')) $('vkCommandText').textContent = '/link ' + r.code; startVkPolling(r.code); }
  });
}
function startVkPolling(code) {
  stopVkPolling();
  vkPollInterval = setInterval(() => {
    socket.emit('vk:check-link', res => {
      if (res && res.linked) {
        stopVkPolling();
        $('vkStep1').style.display = 'none'; $('vkStep2').style.display = 'block';
      }
    });
  }, 2500);
}
function stopVkPolling() { if (vkPollInterval) { clearInterval(vkPollInterval); vkPollInterval = null; } }

/* ============================================================
   ПРОФИЛЬ EDIT
   ============================================================ */
function initProfileEdit() {
  $('editProfileBtn') && ($('editProfileBtn').onclick = () => {
    if (!me) return;
    epSelectedColor = null; epSelectedEmoji = null; epAvatarUrl = null;
    if ($('epAva')) {
      if (me.avatarUrl) { $('epAva').style.backgroundImage = `url(${me.avatarUrl})`; $('epAva').textContent = ''; }
      else { $('epAva').textContent = (me.avatar && /\p{Emoji}/u.test(me.avatar)) ? me.avatar : (me.username[0] || '?').toUpperCase(); }
    }
    if ($('epBio')) $('epBio').value = me.bio || '';
    const cr = $('epColorRow');
    if (cr) {
      cr.innerHTML = '';
      AV_COLORS.forEach(c => {
        const d = document.createElement('div');
        d.className = 'color-dot' + (c === me.color ? ' on' : '');
        d.style.background = c;
        d.onclick = () => {
          epSelectedColor = c; epSelectedEmoji = null; epAvatarUrl = null;
          cr.querySelectorAll('.color-dot').forEach(x => x.classList.remove('on'));
          d.classList.add('on');
          if ($('epAva')) { $('epAva').style.backgroundImage = ''; $('epAva').style.background = c; $('epAva').textContent = (me.username[0] || '?').toUpperCase(); }
        };
        cr.appendChild(d);
      });
    }
    const er = $('epEmojiRow');
    if (er) {
      er.innerHTML = '';
      AV_EMOJI.forEach(e => {
        const b = document.createElement('button');
        b.textContent = e;
        b.onclick = () => {
          epSelectedEmoji = e; epSelectedColor = null; epAvatarUrl = null;
          er.querySelectorAll('button').forEach(x => x.style.background = '');
          b.style.background = 'var(--bg-hover)';
          if ($('epAva')) { $('epAva').style.backgroundImage = ''; $('epAva').textContent = e; }
        };
        er.appendChild(b);
      });
    }
    openModal('editProfileModal');
  });
  $('epClose') && ($('epClose').onclick = () => closeModal('editProfileModal'));
  $('epUploadAvatar') && ($('epUploadAvatar').onclick = () => {
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*';
    fi.onchange = async () => {
      if (!fi.files[0]) return;
      const fd = new FormData(); fd.append('file', fi.files[0]);
      try { const r = await fetch('/upload', { method: 'POST', body: fd }); const d = await r.json(); if (d && d.url) { epAvatarUrl = d.url; if ($('epAva')) { $('epAva').style.backgroundImage = `url(${d.url})`; $('epAva').textContent = ''; } } } catch (e) {}
    };
    fi.click();
  });
  $('epClearAvatar') && ($('epClearAvatar').onclick = () => { epAvatarUrl = null; epSelectedColor = null; epSelectedEmoji = null; if ($('epAva')) { $('epAva').style.backgroundImage = ''; $('epAva').textContent = (me.username[0] || '?').toUpperCase(); } });
  $('epSave') && ($('epSave').onclick = () => {
    const u = { bio: $('epBio')?.value.trim() || '' };
    if (epSelectedEmoji) u.avatar = epSelectedEmoji;
    if (epSelectedColor) u.color = epSelectedColor;
    if (epAvatarUrl !== null) u.avatarUrl = epAvatarUrl;
    socket.emit('profile:update', u);
    closeModal('editProfileModal');
  });
  $('copyUsernameBtn') && ($('copyUsernameBtn').onclick = () => { if (me) navigator.clipboard.writeText('@' + me.username.toLowerCase()).then(() => toast('📋')); });
}

/* ============================================================
   ИСТОРИИ
   ============================================================ */
function initStories() {
  $('storyAdd') && ($('storyAdd').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = () => { if (input.files[0]) uploadStory(input.files[0]); };
    input.click();
  });
}
async function uploadStory(file) {
  if (file.size > 30 * 1024 * 1024) { toast('❌ Больше 30 МБ'); return; }
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await fetch('/upload', { method: 'POST', body: fd });
    const d = await r.json();
    if (d && d.url) socket.emit('story:create', { url: d.url, mime: file.type }, res => { if (res && res.ok) toast('📸 Опубликовано'); });
  } catch (e) {}
}
function renderStories() {
  const list = $('storiesList'); if (!list) return;
  if (!storiesList?.length) { list.innerHTML = ''; return; }
  let html = '';
  storiesList.forEach((item, i) => {
    if (item.isMe) return;
    let avaContent = '';
    if (item.avatarUrl) avaContent = `<div class="story-inner" style="background-image:url(${esc(item.avatarUrl)})"></div>`;
    else if (item.avatar && /\p{Emoji}/u.test(item.avatar)) avaContent = `<div class="story-inner" style="background:${item.color || '#a78bfa'}">${item.avatar}</div>`;
    else avaContent = `<div class="story-inner" style="background:${item.color || '#a78bfa'}">${(item.username[0] || '?').toUpperCase()}</div>`;
    const viewed = !item.hasUnviewed;
    html += `<div class="story-item" data-owner-index="${i}"><div class="story-ring ${viewed ? 'viewed' : ''}">${avaContent}</div><div class="story-name">${esc(item.username)}</div></div>`;
  });
  list.innerHTML = html;
  list.querySelectorAll('.story-item').forEach(el => el.onclick = () => toast('📸 Истории в разработке'));
}

/* ============================================================
   MODALS
   ============================================================ */
function openModal(id) { const m = $(id); if (m) m.classList.add('on'); }
function closeModal(id) { const m = $(id); if (m) m.classList.remove('on'); }
function closeAllModals() { document.querySelectorAll('.modal-bg.on').forEach(m => m.classList.remove('on')); }

/* ============================================================
   MOBILE NAV
   ============================================================ */
function initMobileNav() {
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.onclick = () => {
    const n = btn.dataset.mnav;
    if (n === 'chats' || n === 'search') {
      document.body.classList.remove('in-chat');
      $('side')?.classList.remove('hidden');
      $('main')?.classList.remove('on-mobile');
      if (n === 'search') setTimeout(() => $('searchInput')?.focus(), 100);
    } else if (n === 'create') $('btnNewGroup')?.click();
    else if (n === 'newchat') $('btnNewChat')?.click();
    else if (n === 'settings') $('panel')?.classList.add('on');
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
  });
  $('mobileSearchBtn') && ($('mobileSearchBtn').onclick = () => $('searchInput')?.focus());
  $('btnBack') && ($('btnBack').onclick = () => closeChat());
}

/* ============================================================
   SCROLL BOTTOM BTN
   ============================================================ */
function initScrollBottomBtn() {
  const m = $('msgs'); if (!m) return;
  const btn = document.createElement('button');
  btn.className = 'scroll-bottom-btn';
  btn.style.cssText = 'position:fixed;right:24px;bottom:100px;width:48px;height:48px;border-radius:50%;background:var(--bg-2);border:1px solid var(--border);color:var(--text);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-md);z-index:90;cursor:pointer;opacity:0;pointer-events:none;transition:opacity 0.2s ease;';
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  document.body.appendChild(btn);
  btn.onclick = () => scrollBottom();
  m.addEventListener('scroll', () => {
    const d = m.scrollHeight - m.scrollTop - m.clientHeight;
    btn.style.opacity = d > 300 ? '1' : '0';
    btn.style.pointerEvents = d > 300 ? 'auto' : 'none';
  });
}

/* ============================================================
   IMG VIEWER
   ============================================================ */
function initImageViewer() {
  const v = $('imgViewer'), i = $('imgViewerImg');
  if (v) v.onclick = () => v.classList.remove('on');
  document.addEventListener('click', e => {
    if (e.target.classList.contains('att-image') && e.target.tagName === 'IMG') {
      if (v && i) { i.src = e.target.src; v.classList.add('on'); }
    }
  });
}

/* ============================================================
   MESSAGE INTERACTIONS
   ============================================================ */
function initMessageInteractions() {
  document.addEventListener('click', e => {
    const r = e.target.closest('.reaction');
    if (r) { if (currentChatId) socket.emit('message:react', { chatId: currentChatId, messageId: r.dataset.msgId, emoji: r.dataset.emoji }); return; }
    const po = e.target.closest('[data-poll-opt]');
    if (po) { if (currentChatId) socket.emit('poll:vote', { chatId: currentChatId, messageId: po.dataset.pollMsg, optionIndex: parseInt(po.dataset.pollOpt, 10) }); return; }
    const tag = e.target.closest('.hashtag');
    if (tag) { const s = $('searchInput'); if (s) { s.value = '#' + tag.dataset.tag; s.dispatchEvent(new Event('input')); } }
  });
  document.addEventListener('contextmenu', e => {
    const m = e.target.closest('.msg'); if (!m) return;
    if (e.target.tagName === 'A' || e.target.tagName === 'IMG') return;
    e.preventDefault();
    const msgs = messagesByChat.get(currentChatId) || [];
    const msg = msgs.find(x => String(x.id) === String(m.dataset.id));
    if (msg) showCtxMsg(e.clientX, e.clientY, msg);
  });
  document.addEventListener('click', e => {
    const cm = $('ctxMsg');
    if (cm && cm.classList.contains('on') && !cm.contains(e.target)) hideCtxMsg();
    const cc = $('ctxChat');
    if (cc && cc.classList.contains('on') && !cc.contains(e.target)) cc.classList.remove('on');
  });
  document.querySelectorAll('#ctxMsg .ctx-item').forEach(i => i.onclick = () => handleCtxAction(i.dataset.action));
}

/* ============================================================
   SEARCH
   ============================================================ */
function initSearch() {
  const input = $('searchInput'), clear = $('searchClear');
  if (input) input.addEventListener('input', () => {
    searchQuery = input.value.trim();
    if (clear) clear.classList.toggle('on', searchQuery.length > 0);
    renderChatList();
    renderGlobalSearchResults(searchQuery);
  });
  if (clear) clear.onclick = () => {
    if (input) input.value = '';
    searchQuery = '';
    clear.classList.remove('on');
    renderChatList();
    renderGlobalSearchResults('');
  };
  document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    tab.classList.add('on');
    currentTab = tab.dataset.tab;
    renderChatList();
  });
}

function renderGlobalSearchResults(query) {
  const c = $('chatList');
  if (!c) return;
  if (!query || query.length < 2) return;
  socket.emit('users:search', { query }, list => {
    const users = Array.isArray(list) ? list : [];
    const meKey = me ? keyOf(me.username) : '';
    const found = users.filter(u => u && keyOf(u.username) !== meKey);
    if (found.length === 0) return;
    let html = '<div style="padding:8px 12px 6px;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;">Люди</div>';
    found.slice(0, 10).forEach(u => {
      let ava = '';
      if (u.avatarUrl) ava = `<div class="ava sm" style="background-image:url(${esc(u.avatarUrl)})"></div>`;
      else if (u.avatar && /\p{Emoji}/u.test(u.avatar)) ava = `<div class="ava sm" style="background:${u.color || '#a78bfa'}">${u.avatar}</div>`;
      else ava = `<div class="ava sm" style="background:${u.color || '#a78bfa'}">${(u.username[0] || '?').toUpperCase()}</div>`;
      html += `<div class="chat-item" data-username="${esc(u.username)}" style="cursor:pointer;">${ava}<div class="ci-body"><div class="ci-name">${esc(u.username)}${verifyIconsHtml(u)}</div><div class="ci-prev">${u.bio ? esc(u.bio.slice(0, 40)) : 'Нажми, чтобы начать'}</div></div></div>`;
    });
    c.innerHTML += html;
    c.querySelectorAll('.chat-item[data-username]').forEach(el => {
      el.onclick = () => {
        socket.emit('chat:open', { withUsername: el.dataset.username });
        if (input) input.value = '';
        searchQuery = '';
        if (clear) clear.classList.remove('on');
      };
    });
  });
}

/* ============================================================
   ADMIN
   ============================================================ */
function initAdmin() {
  $('adminOpenRow') && ($('adminOpenRow').onclick = () => {
    $('adminPanel')?.classList.add('on');
    socket.emit('admin:stats', res => {
      if (!res || !res.ok) return;
      const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
      set('stAccounts', res.accounts || 0);
      set('stOnline', res.online || 0);
      set('stMessages', res.messages || 0);
    });
  });
  $('adminClose') && ($('adminClose').onclick = () => $('adminPanel')?.classList.remove('on'));
}

/* ============================================================
   HOTKEYS
   ============================================================ */
function initHotkeys() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); $('searchInput')?.focus(); }
    if (e.key === 'Escape') { closeAllModals(); hideCtxMsg(); $('emojiPanel')?.classList.remove('on'); $('panel')?.classList.remove('on'); }
  });
}

/* ============================================================
   ПОИСК ПО СООБЩЕНИЯМ ВНУТРИ ЧАТА
   ============================================================ */
function initChatSearch() {
  const btn = $('btnSearchInChat');
  const bar = $('chatSearchBar');
  const input = $('chatSearchInput');
  const closeBtn = $('chatSearchClose');
  const countEl = $('chatSearchCount');
  const resultsEl = $('chatSearchResults');
  if (!btn || !bar || !input || !resultsEl) return;

  let searchActive = false;

  function openSearch() {
    searchActive = true;
    bar.style.display = 'block';
    input.value = '';
    countEl.textContent = '0';
    resultsEl.innerHTML = '';
    setTimeout(() => input.focus(), 100);
  }

  function closeSearch() {
    searchActive = false;
    bar.style.display = 'none';
    resultsEl.innerHTML = '';
    countEl.textContent = '0';
  }

  btn.onclick = () => {
    if (searchActive) closeSearch();
    else openSearch();
  };

  closeBtn.onclick = closeSearch;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      resultsEl.innerHTML = '';
      countEl.textContent = '0';
      return;
    }
    const msgs = messagesByChat.get(currentChatId) || [];
    const found = [];
    msgs.forEach((m, idx) => {
      if (m.deleted) return;
      if (!m.text) return;
      if (m.text.toLowerCase().includes(q)) {
        found.push({ msg: m, index: idx });
      }
    });
    countEl.textContent = found.length.toString();
    if (found.length === 0) {
      resultsEl.innerHTML = '<div class="cs-empty">Ничего не найдено</div>';
      return;
    }
    let html = '';
    found.slice(0, 50).forEach(item => {
      const m = item.msg;
      const user = usersMap.get(keyOf(m.userId));
      const username = user ? user.username : (m.username || 'Unknown');
      const color = user ? (user.color || m.color || '#a78bfa') : (m.color || '#a78bfa');
      const avaUrl = user ? user.avatarUrl : m.avatarUrl;
      const avaEmoji = user ? user.avatar : m.avatar;
      let avaHtml = '';
      if (avaUrl) avaHtml = `<div class="cs-result-ava" style="background-image:url(${esc(avaUrl)})"></div>`;
      else if (avaEmoji && /\p{Emoji}/u.test(avaEmoji)) avaHtml = `<div class="cs-result-ava" style="background:${color}">${avaEmoji}</div>`;
      else avaHtml = `<div class="cs-result-ava" style="background:${color}">${(username[0] || '?').toUpperCase()}</div>`;

      // Подсветка совпадения в тексте
      const safeText = esc(m.text);
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      const highlighted = safeText.replace(re, '<mark>$1</mark>');

      html += `<div class="cs-result" data-msg-id="${esc(m.id)}" data-index="${item.index}">
        ${avaHtml}
        <div class="cs-result-body">
          <div class="cs-result-head">
            <span class="cs-result-author" style="color:${color}">${esc(username)}</span>
            <span class="cs-result-time">${formatTime(m.time)}</span>
          </div>
          <div class="cs-result-text">${highlighted}</div>
        </div>
      </div>`;
    });
    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll('.cs-result').forEach(el => {
      el.onclick = () => {
        const msgId = el.dataset.msgId;
        // Закрываем панель поиска и скроллим к сообщению
        closeSearch();
        setTimeout(() => scrollToMessage(msgId), 100);
      };
    });
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSearch();
  });
}

/* Скролл к сообщению + подсветка */
function scrollToMessage(msgId) {
  const el = $('msgs')?.querySelector(`[data-id="${msgId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash');
  // Перезапуск анимации
  void el.offsetWidth;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
}

/* ============================================================
   ПРОФИЛЬ ДРУГОГО ПОЛЬЗОВАТЕЛЯ
   ============================================================ */
function openUserProfile(username) {
  if (!username) return;
  const key = keyOf(username);
  const user = usersMap.get(key);
  const modal = $('profileModal');
  const body = $('upBody');
  const title = $('upTitle');
  if (!modal || !body) return;

  if (title) title.textContent = 'Профиль';
  modal.classList.add('on');

  // Если пользователя нет в usersMap — пробуем догрузить через поиск
  if (!user) {
    body.innerHTML = '<div class="up-loading"><div class="up-spinner"></div><div class="up-loading-text">Загрузка профиля…</div></div>';
    socket.emit('users:search', { query: key }, list => {
      const found = (list || []).find(u => keyOf(u.username) === key);
      if (found) {
        usersMap.set(key, found);
        renderUserProfile(found);
      } else {
        body.innerHTML = '<div class="up-error">⚠️ Пользователь не найден</div>';
      }
    });
    return;
  }

  renderUserProfile(user);
}

function renderUserProfile(user) {
  const body = $('upBody');
  if (!body) return;

  const key = keyOf(user.username);
  const isMe = me && key === keyOf(me.username);
  const color = user.color || '#a78bfa';
  const username = user.username || key;
  const handle = '@' + key;
  const bio = (user.bio || '').trim();

  // Аватар
  let avaHtml = '';
  if (user.avatarUrl) {
    avaHtml = `<div class="up-ava" style="background-image:url(${esc(user.avatarUrl)})"></div>`;
  } else if (user.avatar && /\p{Emoji}/u.test(user.avatar)) {
    avaHtml = `<div class="up-ava" style="background:${color}">${user.avatar}</div>`;
  } else {
    avaHtml = `<div class="up-ava" style="background:${color}">${(username[0] || '?').toUpperCase()}</div>`;
  }

  // Статус
  let statusHtml = '';
  if (user.online) {
    statusHtml = '<div class="up-status online"><span class="up-dot"></span>в сети</div>';
  } else {
    statusHtml = '<div class="up-status"><span class="up-dot off"></span>не в сети</div>';
  }

  // Верификация
  const verify = verifyIconsHtml(user);

  // Общие чаты / группы (считаем локально)
  let commonChats = 0, commonGroups = 0;
  if (!isMe && me) {
    const myKey = keyOf(me.username);
    messagesByChat.forEach((msgs, chatId) => {
      if (chatId.startsWith('g_')) return;
      const parts = chatId.split('::');
      if (parts.length !== 2) return;
      if ((parts[0] === myKey || parts[1] === myKey) && (parts[0] === key || parts[1] === key)) commonChats++;
    });
    groups.forEach(g => {
      const members = (g.members || []).map(m => keyOf(m));
      if (members.includes(myKey) && members.includes(key)) commonGroups++;
    });
  }

  // Кнопки действий
  let actionsHtml = '';
  if (isMe) {
    actionsHtml = `
      <div class="up-actions">
        <button class="up-btn primary" id="upEditMe">Редактировать профиль</button>
      </div>`;
  } else {
    actionsHtml = `
      <div class="up-actions">
        <button class="up-btn primary" id="upWriteBtn">✉ Написать сообщение</button>
        <div class="up-actions-row">
          <button class="up-btn" id="upCallBtn">📞 Звонок</button>
          <button class="up-btn" id="upVideoBtn">📹 Видео</button>
        </div>
      </div>`;
  }

  // Инфо-блоки
  const bioHtml = bio
    ? `<div class="up-section">
         <div class="up-section-title">О СЕБЕ</div>
         <div class="up-info-row">📝 <span>${esc(bio)}</span></div>
       </div>`
    : '';

  const commonHtml = isMe ? '' : `
    <div class="up-section">
      <div class="up-section-title">ОБЩЕЕ</div>
      <div class="up-info-row">💬 <span>${commonChats} ${plural(commonChats, 'личный чат', 'личных чата', 'личных чатов')}</span></div>
      <div class="up-info-row">👥 <span>${commonGroups} ${plural(commonGroups, 'общая группа', 'общие группы', 'общих групп')}</span></div>
    </div>`;

  body.innerHTML = `
    <div class="up-hero">
      ${avaHtml}
      <div class="up-name">${esc(username)}${verify}</div>
      <div class="up-handle">${esc(handle)}</div>
      ${statusHtml}
    </div>
    ${actionsHtml}
    ${bioHtml}
    ${commonHtml}
  `;

  // Привязка кнопок
  $('upEditMe') && ($('upEditMe').onclick = () => {
    closeUserProfile();
    $('editProfileBtn')?.click();
  });

  $('upWriteBtn') && ($('upWriteBtn').onclick = () => {
    closeUserProfile();
    socket.emit('chat:open', { withUsername: username });
  });

  $('upCallBtn') && ($('upCallBtn').onclick = () => {
    toast('📞 Звонки — скоро');
  });

  $('upVideoBtn') && ($('upVideoBtn').onclick = () => {
    toast('📹 Видео — скоро');
  });
}

function closeUserProfile() {
  const modal = $('profileModal');
  if (modal) modal.classList.remove('on');
}

/* ============================================================
   INIT ALL
   ============================================================ */
function initAll() {
  initAuth();
  initVkLoginModal();
  initEmailLoginModal();
  initComposer();
  initSearch();
  initChatSearch();   // ← ДОБАВЬ
  initGroups();
  initInviteToast();
  initCalls();
  initStories();
  initAdmin();
  initProfileEdit();
  initSettings();
  initNewChat();
  initMobileNav();
  initScrollBottomBtn();
  initImageViewer();
  initMessageInteractions();
  initHotkeys();

     // Кнопка закрытия профиля
  $('upClose') && ($('upClose').onclick = closeUserProfile);
  document.querySelectorAll('.emoji-tabs button').forEach(b => b.onclick = () => renderEmojiTab(b.dataset.emojiTab));
  document.querySelectorAll('.modal-bg').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('on'); }));
     initRailNav();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
else initAll();

/* ============================================================
   AURORA PARALLAX — фон переливается при движении мыши
   ============================================================ */
function initAurora() {
  const aurora = document.getElementById('aurora');
  if (!aurora) return;

  let targetX = 0, targetY = 0;
  let currentX = 0, currentY = 0;
  let rafId = null;

  function onMove(e) {
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    targetX = (x - 0.5) * 2;   // -1 .. 1
    targetY = (y - 0.5) * 2;
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function onTouch(e) {
    if (!e.touches || !e.touches[0]) return;
    const t = e.touches[0];
    const x = t.clientX / window.innerWidth;
    const y = t.clientY / window.innerHeight;
    targetX = (x - 0.5) * 2;
    targetY = (y - 0.5) * 2;
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function loop() {
    currentX += (targetX - currentX) * 0.06;
    currentY += (targetY - currentY) * 0.06;

    aurora.style.setProperty('--mx', currentX.toFixed(4));
    aurora.style.setProperty('--my', currentY.toFixed(4));

    if (Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
    }
  }

  window.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('touchmove', onTouch, { passive: true });
  window.addEventListener('touchstart', onTouch, { passive: true });
}

/* ============================================================
   RAIL NAVIGATION
   ============================================================ */
function initRailNav() {
  const railAvatar = document.getElementById('railAvatar');
  const railAvaImg = document.getElementById('railAvaImg');

  function syncRailAva() {
    const src = document.getElementById('myBarAva');
    if (!src || !railAvaImg) return;
    railAvaImg.style.backgroundImage = src.style.backgroundImage || '';
    railAvaImg.style.background = src.style.background || 'var(--accent)';
    railAvaImg.textContent = src.textContent || '?';
  }

  const observer = new MutationObserver(syncRailAva);
  const target = document.getElementById('myBarAva');
  if (target) {
    observer.observe(target, { attributes: true, childList: true, subtree: true, characterData: true });
    syncRailAva();
  }

  railAvatar && (railAvatar.onclick = () => {
    document.getElementById('panel')?.classList.add('on');
  });

    document.querySelectorAll('.rail-btn').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.rail;
      document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');

      if (action === 'chats') {
        document.body.classList.remove('in-chat');
        document.getElementById('side')?.classList.remove('hidden');
        document.getElementById('main')?.classList.remove('on-mobile');
      } else if (action === 'search') {
        const s = document.getElementById('searchInput');
        if (s) { s.focus(); s.select(); }
      } else if (action === 'newchat') {
        openModal('newChatModal');
        const inp = document.getElementById('ncSearchInput');
        const res = document.getElementById('ncResults');
        if (inp) { inp.value = ''; inp.focus(); }
        if (res) res.innerHTML = 'Введи имя';
      } else if (action === 'calls') {
        const c = document.getElementById('toasts');
        if (c) {
          const el = document.createElement('div');
          el.className = 'toast';
          el.textContent = '📞 Звонки — скоро';
          c.appendChild(el);
          setTimeout(() => el.remove(), 2000);
        }
      } else if (action === 'settings') {
        document.getElementById('panel')?.classList.add('on');
      }
    };
  });
}
/* ============================================================
   КОНЕЦ ФАЙЛА app.js
   ============================================================ */
