/* ============================================================
   DANUMES · supabase-storage.js
   Загружает файлы в Supabase Storage, возвращает публичный URL.
   ============================================================ */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'uploads';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL или SUPABASE_SERVICE_KEY не заданы');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

/* ---------- Сохранить файл ---------- */
async function uploadToSupabase(buffer, fileName, mimeType) {
  try {
    const ext = (fileName || '').split('.').pop() || 'bin';
    const safeExt = ext.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '');
    const key = `f_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${safeExt}`;

    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(key, buffer, {
        contentType: mimeType || 'application/octet-stream',
        upsert: false
      });

    if (error) {
      console.error('❌ uploadToSupabase:', error.message);
      return { ok: false, error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(key);

    console.log('✅ Файл загружен в Supabase:', key, 'размер:', buffer.length);

    return {
      ok: true,
      fileId: key,
      url: urlData.publicUrl,
      name: fileName,
      size: buffer.length,
      mime: mimeType
    };
  } catch (e) {
    console.error('❌ uploadToSupabase exception:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { uploadToSupabase, supabase, SUPABASE_BUCKET };
