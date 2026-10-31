// GET /api/subs?v=<id>&lang=en&tr=uk — субтитри відео й переклад рядків.
// Працює як Vercel-функція і як обробник у локальному server.js.
const { getSubs } = require('../lib/youtube');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');   // щоб GitHub Pages міг звертатися до цього API
  const { v = '', lang = 'en', tr = '' } = req.query || {};
  if (!/^[\w-]{11}$/.test(v)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Невірний ID відео.' }));
  }
  try {
    const data = await getSubs(v, lang, tr);
    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e.message }));
  }
};
