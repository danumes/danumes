const https = require('https');

const BOT_TOKEN = '8961321906:AAGQ7JwmaObHk4cC7tFbnDkzr0ApYMvFhTY';
const CHAT_ID = '-1004416005877';

const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

const data = JSON.stringify({
  chat_id: CHAT_ID,
  text: 'test_from_danumes_node'
});

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(url, options, (res) => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    console.log('Статус:', res.statusCode);
    console.log('Ответ Telegram:', body);
  });
});

req.on('error', (e) => {
  console.error('❌ Ошибка запроса:', e.message);
});

req.write(data);
req.end();
