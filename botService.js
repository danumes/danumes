/* ============================================================
   DANUMES · botService.js
   VK-бот для Danumes (Long Poll API)
   ============================================================ */

const crypto = require('crypto');

let VK_TOKEN = null;
let VK_GROUP_ID = null;
let vkApi = null;
let vkInstance = null;         // VK instance из vk-io
let onLinkCallback = null;     // колбэк для сохранения привязки
let onMessageCallback = null;  // колбэк для действий в Danumes

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
async function initBot(supabase, callbacks) {
  VK_TOKEN = process.env.VK_BOT_TOKEN;
  VK_GROUP_ID = parseInt(process.env.VK_GROUP_ID, 10);

  if (!VK_TOKEN || !VK_GROUP_ID) {
    console.log('⚠️  VK-бот не запущен: нет VK_BOT_TOKEN или VK_GROUP_ID в .env');
    return { ok: false, error: 'no-token' };
  }

  onLinkCallback = callbacks.onLink;
  onMessageCallback = callbacks.onMessage;

  try {
    const { VK } = require('vk-io');
    vkApi = new VK({ token: VK_TOKEN });
    vkInstance = vkApi;

    // Проверим, что токен рабочий
    const groupInfo = await vkApi.api.groups.getById({ group_id: VK_GROUP_ID });
    console.log('✅ VK-бот запущен:', groupInfo.groups[0].name);

    // Запускаем Long Poll
    startLongPoll();
    return { ok: true, groupName: groupInfo.groups[0].name };
  } catch (e) {
    console.error('❌ Ошибка VK-бота:', e.message);
    return { ok: false, error: e.message };
  }
}

/* ============================================================
   LONG POLL — постоянный приём событий
   ============================================================ */
let longPollStarted = false;

async function startLongPoll() {
  if (longPollStarted) return;
  longPollStarted = true;

  try {
    // Подключаем Long Poll через vk-io updates
    vkApi.updates.on('message_new', async (context) => {
      try {
        await handleIncomingMessage(context);
      } catch (e) {
        console.error('VK message error:', e);
      }
    });

    vkApi.updates.on('error', err => {
      console.error('VK Long Poll error:', err);
    });

    // Запускаем (в vk-io это делается через .start())
    vkApi.updates.start().then(() => {
      console.log('🔄 VK Long Poll запущен');
    }).catch(err => {
      console.error('VK Long Poll start error:', err);
      longPollStarted = false;
      // Попробуем перезапустить через 10 сек
      setTimeout(startLongPoll, 10000);
    });
  } catch (e) {
    console.error('Ошибка запуска Long Poll:', e.message);
    longPollStarted = false;
  }
}

/* ============================================================
   ОБРАБОТКА ВХОДЯЩИХ СООБЩЕНИЙ
   ============================================================ */
async function handleIncomingMessage(context) {
  // context — это MessageContext из vk-io
  const fromId = context.senderId;         // ID пользователя ВК
  const text = (context.text || '').trim();

  if (!text) {
    // Возможно, юзер прислал что-то не текстовое — попросим команду
    await sendMessage(fromId, '🤖 Я понимаю только текст. Напиши /help для списка команд.');
    return;
  }

  const firstWord = text.split(/\s+/)[0].toLowerCase();

  // ---------- /start ----------
  if (firstWord === '/start' || firstWord === 'начать' || firstWord === 'start') {
    await handleStart(fromId, context);
    return;
  }

  // ---------- /login КОД ----------
  if (firstWord === '/login' || firstWord === 'войти') {
    const parts = text.split(/\s+/);
    const code = parts[1];
    if (!code) {
      await sendMessage(fromId,
        '❌ Укажи код: /login A1B2C3\n\n' +
        'Код можно получить на странице входа в Danumes → «Войти через ВКонтакте».'
      );
      return;
    }
    await handleLogin(fromId, context, code);
    return;
  }

  // ---------- /help ----------
  if (firstWord === '/help' || firstWord === 'помощь') {
    await handleHelp(fromId);
    return;
  }

  // ---------- /link КОД ----------
  if (firstWord === '/link' || firstWord === 'связать') {
    const parts = text.split(/\s+/);
    const code = parts[1];
    if (!code) {
      await sendMessage(fromId, '❌ Укажи код: /link ABC123\n\nКод можно получить в настройках Danumes → Способы входа → VK.');
      return;
    }
    await handleLink(fromId, context, code);
    return;
  }

  // ---------- /status ----------
  if (firstWord === '/status' || firstWord === 'статус') {
    await handleStatus(fromId);
    return;
  }

  // ---------- /mute ----------
  if (firstWord === '/mute' || firstWord === 'выкл') {
    await handleMute(fromId, false);
    return;
  }

  // ---------- /unmute ----------
  if (firstWord === '/unmute' || firstWord === 'вкл') {
    await handleMute(fromId, true);
    return;
  }

  // ---------- /unlink ----------
  if (firstWord === '/unlink' || firstWord === 'отвязать') {
    await handleUnlink(fromId);
    return;
  }

  // ---------- Просто текст — подскажем команды ----------
  await sendMessage(fromId, '🤖 Не понимаю. Напиши /help для списка команд.\n\nЕсли хочешь привязать Danumes — напиши /link КОД.');
}

/* ============================================================
   ВХОД ЧЕРЕЗ VK (по коду из Danumes)
   ============================================================ */
async function handleLogin(fromId, context, code) {
  if (!onLinkCallback) {
    await sendMessage(fromId, '⚠️ Бот не настроен. Попробуй позже.');
    return;
  }

  const cleanCode = String(code).toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length !== 6) {
    await sendMessage(fromId, '❌ Код должен быть 6 символов (буквы и цифры).\n\nПример: /login A1B2C3');
    return;
  }

  // Информация о юзере VK
  const sender = context.sender || {};
  const vkUser = {
    vkId: fromId,
    vkUsername: sender.username || null,
    vkFirstName: sender.first_name || '',
    vkLastName: sender.last_name || '',
    vkPhoto: sender.photo_200 || sender.photo_100 || sender.photo_50 || null
  };

  // Проверяем, не привязан ли уже этот VK к аккаунту (через старую привязку)
  const existing = await onLinkCallback('__check_vk__', { vkId: fromId });
  if (existing && existing.linked && existing.username) {
    // VK уже привязан к аккаунту — просто входим в него
    const result = await onLinkCallback(cleanCode, vkUser, 'login');
    if (!result || !result.ok) {
      await sendMessage(fromId,
        '❌ Не удалось войти: ' + ((result && result.error) || 'неизвестная ошибка')
      );
      return;
    }
    await sendMessage(fromId,
      '✅ Вход выполнен!\n\n' +
      '👤 Аккаунт: @' + result.username + '\n' +
      '🔗 Вернись в Danumes — там ты уже в системе.'
    );
    return;
  }

  // VK не привязан — пробуем войти через код
  const result = await onLinkCallback(cleanCode, vkUser, 'login');
  if (!result || !result.ok) {
    if (result && result.error === 'code-not-found') {
      await sendMessage(fromId, '❌ Код не найден. Проверь, что скопировал его правильно.');
    } else if (result && result.error === 'code-expired') {
      await sendMessage(fromId, '⏰ Код истёк. Получи новый в Danumes.');
    } else if (result && result.error === 'already-linked') {
      await sendMessage(fromId, '❌ Этот VK уже привязан к другому аккаунту Danumes.');
    } else {
      await sendMessage(fromId, '⚠️ Ошибка: ' + ((result && result.error) || 'неизвестная'));
    }
    return;
  }

  await sendMessage(fromId,
    '✅ Вход выполнен!\n\n' +
    '👤 Твой аккаунт в Danumes: @' + result.username + '\n' +
    '🔗 Вернись в Danumes — там ты уже в системе.\n\n' +
    (result.isNew
      ? '💡 Ты вошёл впервые — аккаунт создан автоматически.\nПароль не нужен, вход всегда через VK.\n\n📝 Позже сможешь указать email в настройках, чтобы восстановить доступ если что-то потеряешь.'
      : '')
  );
}

/* ============================================================
   КОМАНДЫ
   ============================================================ */
async function handleStart(fromId, context) {
  const name = context.sender ? (context.sender.first_name || 'друг') : 'друг';
  const welcome =
    `👋 Привет, ${name}!\n\n` +
    `Я — бот Danumes. Помогу:\n` +
    `• Привязать твой профиль Danumes\n` +
    `• Получать уведомления о новых сообщениях\n` +
    `• Подтвердить телефон\n\n` +
    `📌 Что делать:\n` +
    `1. Открой Danumes → Настройки → Способы входа → VK\n` +
    `2. Нажми «Получить код»\n` +
    `3. Скопируй код и отправь мне: /link ТВОЙ_КОД\n\n` +
    `Напиши /help чтобы узнать все команды.`;
  await sendMessage(fromId, welcome);
}

async function handleHelp(fromId) {
  const help =
    `🤖 Команды бота Danumes:\n\n` +
    `/start — приветствие и инструкция\n` +
    `/login КОД — войти в Danumes через VK (код со страницы входа)\n` +
    `/link КОД — привязать VK к существующему аккаунту\n` +
    `/status — показать статус привязки\n` +
    `/mute — выключить уведомления\n` +
    `/unmute — включить уведомления\n` +
    `/unlink — отвязать аккаунт\n` +
    `/help — эта справка\n\n` +
    `💡 Если у тебя уже есть аккаунт Danumes — используй /link КОД.\n` +
    `💡 Если аккаунта нет — используй /login КОД со страницы входа.`;
  await sendMessage(fromId, help);
}
async function handleLink(fromId, context, code) {
  if (!onLinkCallback) {
    await sendMessage(fromId, '⚠️ Бот не настроен. Попробуй позже.');
    return;
  }

  const cleanCode = String(code).toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length !== 6) {
    await sendMessage(fromId, '❌ Код должен быть 6 символов (буквы и цифры).\n\nПример: /link A1B2C3');
    return;
  }

  // Информация о юзере VK
  const sender = context.sender || {};
  const vkUser = {
    vkId: fromId,
    vkUsername: sender.username || null,
    vkFirstName: sender.first_name || '',
    vkLastName: sender.last_name || ''
  };

  const result = await onLinkCallback(cleanCode, vkUser);

  if (!result.ok) {
    if (result.error === 'code-not-found') {
      await sendMessage(fromId, '❌ Код не найден. Проверь, что ты скопировал его правильно.');
    } else if (result.error === 'code-expired') {
      await sendMessage(fromId, '⏰ Код истёк. Получи новый в Danumes.');
    } else if (result.error === 'code-used') {
      await sendMessage(fromId, '❌ Этот код уже использован. Получи новый.');
    } else if (result.error === 'already-linked') {
      await sendMessage(fromId, '❌ Этот VK уже привязан к другому аккаунту Danumes.');
    } else {
      await sendMessage(fromId, '⚠️ Ошибка: ' + (result.error || 'неизвестная'));
    }
    return;
  }

  await sendMessage(fromId,
    `✅ Готово! Твой VK привязан к Danumes.\n\n` +
    `👤 Аккаунт: @${result.username}\n` +
    `🔔 Уведомления: включены\n\n` +
    `Теперь я буду присылать тебе сюда уведомления о новых сообщениях.\n\n` +
    `Если захочешь выключить — напиши /mute`
  );
}

async function handleStatus(fromId) {
  if (!onLinkCallback) {
    await sendMessage(fromId, '⚠️ Бот не настроен.');
    return;
  }

  const info = await onLinkCallback(null, { vkId: fromId });
  // info = { linked: bool, username, notifyEnabled, phone, phoneVerified }

  if (!info || !info.linked) {
    await sendMessage(fromId,
      `🔗 Статус: не привязан\n\n` +
      `Чтобы привязать — открой Danumes → Настройки → Способы входа → VK → «Получить код».\n` +
      `Потом отправь мне: /link ТВОЙ_КОД`
    );
    return;
  }

  const notify = info.notifyEnabled ? '🔔 включены' : '🔕 выключены';
  const phone = info.phone
    ? (info.phoneVerified ? `📱 ${info.phone} ✅ подтверждён` : `📱 ${info.phone} ⏳ не подтверждён`)
    : '📱 не указан';

  await sendMessage(fromId,
    `📊 Статус\n\n` +
    `👤 Аккаунт: @${info.username}\n` +
    `${notify}\n` +
    `${phone}`
  );
}

async function handleMute(fromId, enable) {
  if (!onLinkCallback) return;
  const info = await onLinkCallback(null, { vkId: fromId });
  if (!info || !info.linked) {
    await sendMessage(fromId, '❌ Сначала привяжи аккаунт: /link КОД');
    return;
  }

  await onLinkCallback('__toggle_notify__', { vkId: fromId, enable });
  await sendMessage(fromId, enable ? '🔔 Уведомления включены' : '🔕 Уведомления выключены');
}

async function handleUnlink(fromId) {
  if (!onLinkCallback) return;
  const info = await onLinkCallback(null, { vkId: fromId });
  if (!info || !info.linked) {
    await sendMessage(fromId, '❌ Ты и так не привязан.');
    return;
  }
  await onLinkCallback('__unlink__', { vkId: fromId });
  await sendMessage(fromId, '✅ Аккаунт отвязан. Если захочешь снова — /link КОД');
}

/* ============================================================
   ОТПРАВКА СООБЩЕНИЙ
   ============================================================ */
async function sendMessage(vkUserId, text) {
  if (!vkApi) {
    console.log('VK не инициализирован, сообщение пропущено:', text);
    return false;
  }
  try {
    await vkApi.api.messages.send({
      peer_id: vkUserId,
      message: text,
      random_id: Math.floor(Math.random() * 2147483647),
      dont_parse_links: 0
    });
    return true;
  } catch (e) {
    console.error('VK send error:', e.message);
    return false;
  }
}

/* ============================================================
   ОТПРАВКА УВЕДОМЛЕНИЙ ИЗ DANUMES
   ============================================================ */
async function sendNotification(vkUserId, title, text, chatId) {
  const msg =
    `🔔 ${title}\n\n` +
    `${text}\n\n` +
    `👉 Открыть Danumes: ${process.env.PUBLIC_URL || 'https://danumes.ru'}${chatId ? '?chat=' + chatId : ''}`;
  return sendMessage(vkUserId, msg);
}

/* ============================================================
   ГЕНЕРАЦИЯ КОДА ПРИВЯЗКИ
   ============================================================ */
function generateLinkCode() {
  // 6 символов: буквы + цифры (без похожих 0/O, 1/I)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/* ============================================================
   ЭКСПОРТ
   ============================================================ */
module.exports = {
  initBot,
  sendMessage,
  sendNotification,
  generateLinkCode
};