/* ============================================================
   DANUMES · migrate.js
   Миграция users.json → Supabase
   Запуск: node migrate.js
   ============================================================ */

// Загружаем переменные окружения из .env вручную (без dotenv)
const fs = require('fs');
const path = require('path');

if (fs.existsSync('.env')) {
  fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Нет SUPABASE_URL или SUPABASE_ANON_KEY в .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DB_FILE = path.join(__dirname, 'users.json');
if (!fs.existsSync(DB_FILE)) {
  console.error('❌ users.json не найден');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

async function migrate() {
  console.log('✦ Начинаю миграцию...\n');

  let accountsCount = 0, messagesCount = 0, groupsCount = 0,
      membersCount = 0, settingsCount = 0, sessionsCount = 0,
      pinnedCount = 0, mutedCount = 0, pinnedMsgsCount = 0,
      privacyCount = 0, invitesCount = 0, contactsCount = 0,
      joinReqCount = 0, storiesCount = 0, lastSeenCount = 0;

  // ---------- 1. ACCOUNTS ----------
  if (db.accounts && typeof db.accounts === 'object') {
    for (const [key, acc] of Object.entries(db.accounts)) {
      const row = {
        username: key,
        username_display: acc.username || key,
        password_hash: acc.passwordHash,
        bio: acc.bio || '',
        birthday: acc.birthday || '',
        email: acc.email || '',
        email_verified: !!acc.emailVerified,
        phone: acc.phone || '',
        phone_verified: !!acc.phoneVerified,
        color: acc.color || '#a855f7',
        avatar: acc.avatar || null,
        avatar_url: acc.avatarUrl || null,
        created_at: acc.createdAt || Date.now(),
        is_admin: false,
        is_verified: false,
        is_banned: false,
        ban_reason: '',
        banned_at: null
      };
      const { error } = await supabase.from('accounts').upsert(row, { onConflict: 'username' });
      if (error) console.error('  ✗ accounts[' + key + ']:', error.message);
      else accountsCount++;
    }
    console.log('✓ accounts:', accountsCount);
  }

  // ---------- 2. MESSAGES ----------
  if (db.chatHistory && typeof db.chatHistory === 'object') {
    for (const [chatId, msgs] of Object.entries(db.chatHistory)) {
      if (!Array.isArray(msgs) || !msgs.length) continue;
      const rows = msgs.map(m => ({
        id: m.id,
        chat_id: chatId,
        type: m.type || 'user',
        user_id: m.userId || null,
        username: m.username || null,
        color: m.color || null,
        avatar: m.avatar || null,
        avatar_url: m.avatarUrl || null,
        text: m.text || '',
        time: m.time || Date.now(),
        reactions: m.reactions || {},
        reply_to: m.replyTo || null,
        edited: !!m.edited,
        deleted: !!m.deleted,
        attachments: m.attachments || null,
        sticker: m.sticker || null,
        mentions: m.mentions || null,
        poll: m.poll || null,
        censored: !!m.censored,
        call_type: m.callType || null,
        call_status: m.callStatus || null,
        duration: m.duration || null,
        forwarded_from: m.forwardedFrom || null,
        scheduled_for: m.scheduledFor || null
      }));
      // Upsert батчами по 100
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase.from('messages').upsert(batch, { onConflict: 'id' });
        if (error) console.error('  ✗ messages[' + chatId + ']:', error.message);
        else messagesCount += batch.length;
      }
    }
    console.log('✓ messages:', messagesCount);
  }

  // ---------- 3. GROUPS ----------
  if (db.groups && typeof db.groups === 'object') {
    for (const [gid, g] of Object.entries(db.groups)) {
      const row = {
        id: gid,
        name: g.name,
        description: g.description || '',
        rules: g.rules || '',
        avatar_url: g.avatarUrl || null,
        type: g.type || 'group',
        owner: g.owner,
        color: g.color || '#a855f7',
        created_at: g.createdAt || Date.now()
      };
      const { error } = await supabase.from('groups').upsert(row, { onConflict: 'id' });
      if (error) console.error('  ✗ groups[' + gid + ']:', error.message);
      else groupsCount++;

      // members
      if (Array.isArray(g.members)) {
        const memberRows = g.members.map(m => ({
          group_id: gid,
          username: m,
          is_admin: Array.isArray(g.admins) && g.admins.includes(m)
        }));
        if (memberRows.length) {
          const { error: e2 } = await supabase.from('group_members').upsert(memberRows, { onConflict: 'group_id,username' });
          if (e2) console.error('  ✗ group_members[' + gid + ']:', e2.message);
          else membersCount += memberRows.length;
        }
      }
    }
    console.log('✓ groups:', groupsCount, '/ members:', membersCount);
  }

  // ---------- 4. SETTINGS ----------
  if (db.settings && typeof db.settings === 'object') {
    for (const [key, s] of Object.entries(db.settings)) {
      const { error } = await supabase.from('settings').upsert(
        { username: key, data: s },
        { onConflict: 'username' }
      );
      if (error) console.error('  ✗ settings[' + key + ']:', error.message);
      else settingsCount++;
    }
    console.log('✓ settings:', settingsCount);
  }

  // ---------- 5. SESSIONS ----------
  if (db.sessions && typeof db.sessions === 'object') {
    const allSessions = [];
    for (const [key, arr] of Object.entries(db.sessions)) {
      if (!Array.isArray(arr)) continue;
      arr.forEach(s => allSessions.push({
        sid: s.sid,
        username: key,
        joined_at: s.joinedAt || Date.now(),
        last_active: s.lastActive || Date.now(),
        ua: s.ua || 'unknown'
      }));
    }
    for (let i = 0; i < allSessions.length; i += 100) {
      const batch = allSessions.slice(i, i + 100);
      const { error } = await supabase.from('sessions').upsert(batch, { onConflict: 'sid' });
      if (error) console.error('  ✗ sessions:', error.message);
      else sessionsCount += batch.length;
    }
    console.log('✓ sessions:', sessionsCount);
  }

  // ---------- 6. PINNED_CHATS ----------
  if (db.pinnedChats && typeof db.pinnedChats === 'object') {
    const rows = [];
    for (const [key, arr] of Object.entries(db.pinnedChats)) {
      if (!Array.isArray(arr)) continue;
      arr.forEach(cid => rows.push({ username: key, chat_id: cid }));
    }
    if (rows.length) {
      const { error } = await supabase.from('pinned_chats').upsert(rows, { onConflict: 'username,chat_id' });
      if (error) console.error('  ✗ pinned_chats:', error.message);
      else pinnedCount = rows.length;
    }
    console.log('✓ pinned_chats:', pinnedCount);
  }

  // ---------- 7. MUTED_CHATS ----------
  if (db.mutedChats && typeof db.mutedChats === 'object') {
    const rows = [];
    for (const [key, arr] of Object.entries(db.mutedChats)) {
      if (!Array.isArray(arr)) continue;
      arr.forEach(cid => rows.push({ username: key, chat_id: cid }));
    }
    if (rows.length) {
      const { error } = await supabase.from('muted_chats').upsert(rows, { onConflict: 'username,chat_id' });
      if (error) console.error('  ✗ muted_chats:', error.message);
      else mutedCount = rows.length;
    }
    console.log('✓ muted_chats:', mutedCount);
  }

  // ---------- 8. PINNED_MSGS ----------
  if (db.pinnedMsgs && typeof db.pinnedMsgs === 'object') {
    const rows = [];
    for (const [key, obj] of Object.entries(db.pinnedMsgs)) {
      if (!obj || typeof obj !== 'object') continue;
      for (const [cid, mid] of Object.entries(obj)) {
        rows.push({ username: key, chat_id: cid, message_id: mid });
      }
    }
    if (rows.length) {
      const { error } = await supabase.from('pinned_msgs').upsert(rows, { onConflict: 'username,chat_id' });
      if (error) console.error('  ✗ pinned_msgs:', error.message);
      else pinnedMsgsCount = rows.length;
    }
    console.log('✓ pinned_msgs:', pinnedMsgsCount);
  }

  // ---------- 9. PRIVACY ----------
  if (db.privacy && typeof db.privacy === 'object') {
    const rows = Object.entries(db.privacy).map(([key, p]) => ({
      username: key,
      last_seen: p.lastSeen || 'all',
      bio: p.bio || 'all',
      birthday: p.birthday || 'all'
    }));
    if (rows.length) {
      const { error } = await supabase.from('privacy').upsert(rows, { onConflict: 'username' });
      if (error) console.error('  ✗ privacy:', error.message);
      else privacyCount = rows.length;
    }
    console.log('✓ privacy:', privacyCount);
  }

  // ---------- 10. INVITES ----------
  if (db.invites && typeof db.invites === 'object') {
    const rows = Object.entries(db.invites).map(([code, inv]) => ({
      code,
      group_id: inv.groupId,
      expires_at: inv.expiresAt,
      created_by: inv.createdBy
    }));
    if (rows.length) {
      const { error } = await supabase.from('invites').upsert(rows, { onConflict: 'code' });
      if (error) console.error('  ✗ invites:', error.message);
      else invitesCount = rows.length;
    }
    console.log('✓ invites:', invitesCount);
  }

  // ---------- 11. CONTACTS ----------
  if (db.contacts && typeof db.contacts === 'object') {
    const rows = [];
    for (const [owner, arr] of Object.entries(db.contacts)) {
      if (!Array.isArray(arr)) continue;
      arr.forEach(c => rows.push({ owner, contact: c }));
    }
    if (rows.length) {
      const { error } = await supabase.from('contacts').upsert(rows, { onConflict: 'owner,contact' });
      if (error) console.error('  ✗ contacts:', error.message);
      else contactsCount = rows.length;
    }
    console.log('✓ contacts:', contactsCount);
  }

  // ---------- 12. JOIN_REQUESTS ----------
  if (db.joinRequests && typeof db.joinRequests === 'object') {
    const rows = [];
    for (const [gid, arr] of Object.entries(db.joinRequests)) {
      if (!Array.isArray(arr)) continue;
      arr.forEach(r => rows.push({
        group_id: gid,
        username: r.username,
        requested_by: r.requestedBy || '',
        requested_at: r.requestedAt || Date.now()
      }));
    }
    if (rows.length) {
      const { error } = await supabase.from('join_requests').upsert(rows, { onConflict: 'group_id,username' });
      if (error) console.error('  ✗ join_requests:', error.message);
      else joinReqCount = rows.length;
    }
    console.log('✓ join_requests:', joinReqCount);
  }

  // ---------- 13. STORIES ----------
  if (db.stories && typeof db.stories === 'object') {
    const storyRows = [];
    const viewRows = [];
    for (const [owner, arr] of Object.entries(db.stories)) {
      if (!Array.isArray(arr)) continue;
      arr.forEach(s => {
        storyRows.push({
          id: s.id,
          owner,
          url: s.url,
          mime: s.mime || 'image/jpeg',
          time: s.time
        });
        if (Array.isArray(s.viewers)) {
          s.viewers.forEach(v => viewRows.push({
            story_id: s.id,
            username: v,
            viewed_at: s.time
          }));
        }
      });
    }
    if (storyRows.length) {
      const { error } = await supabase.from('stories').upsert(storyRows, { onConflict: 'id' });
      if (error) console.error('  ✗ stories:', error.message);
      else storiesCount = storyRows.length;
    }
    if (viewRows.length) {
      const { error } = await supabase.from('story_views').upsert(viewRows, { onConflict: 'story_id,username' });
      if (error) console.error('  ✗ story_views:', error.message);
    }
    console.log('✓ stories:', storiesCount, '/ views:', viewRows.length);
  }

  // ---------- 14. LAST_SEEN ----------
  if (db.lastSeen && typeof db.lastSeen === 'object') {
    const rows = Object.entries(db.lastSeen).map(([key, t]) => ({
      username: key,
      time: t
    }));
    if (rows.length) {
      const { error } = await supabase.from('last_seen').upsert(rows, { onConflict: 'username' });
      if (error) console.error('  ✗ last_seen:', error.message);
      else lastSeenCount = rows.length;
    }
    console.log('✓ last_seen:', lastSeenCount);
  }

  console.log('\n✦ Миграция завершена!');
}

migrate().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});