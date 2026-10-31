// Отримання субтитрів YouTube (працює лише на сервері: браузеру YouTube не віддає їх через CORS).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

async function tracksFromInnertube(id) {
  const clients = [
    { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30,
      ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip' },
    { clientName: 'WEB', clientVersion: '2.20250101.00.00', ua: UA },
  ];
  for (const c of clients) {
    try {
      const { ua, ...client } = c;
      const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
        body: JSON.stringify({ context: { client: { ...client, hl: 'en' } }, videoId: id }),
      });
      const j = await r.json();
      const t = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (t && t.length) return { tracks: t, title: j?.videoDetails?.title || '' };
    } catch (e) { /* пробуємо наступний клієнт */ }
  }
  return null;
}

async function tracksFromWatchPage(id) {
  const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1' },
  });
  const html = await r.text();
  const m = html.match(/"captionTracks":(\[.*?\])(?:,"audioTracks"|,"translationLanguages")/);
  if (!m) return null;
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  return { tracks: JSON.parse(m[1]), title: decodeEntities(title.replace(/ - YouTube$/, '')) };
}

function parseXml(xml) {
  const cues = [];
  // srv1: <text start="1.2" dur="3.4">…</text>
  for (const m of xml.matchAll(/<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)) {
    const start = +m[1], dur = +(m[2] || 2);
    cues.push({ start, end: start + dur, text: decodeEntities(decodeEntities(m[3])).replace(/<[^>]+>/g, '') });
  }
  if (cues.length) return cues;
  // srv3: <p t="1200" d="3400">…<s>word</s>…</p>
  for (const m of xml.matchAll(/<p t="(\d+)"(?: d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, ''));
    if (!text.trim()) continue;
    const start = +m[1] / 1000;
    cues.push({ start, end: start + (+(m[2] || 2000)) / 1000, text });
  }
  return cues;
}

function parseJson3(j) {
  return (j.events || [])
    .filter(e => e.segs)
    .map(e => ({
      start: e.tStartMs / 1000,
      end: (e.tStartMs + (e.dDurationMs || 2000)) / 1000,
      text: e.segs.map(s => s.utf8).join(''),
    }))
    .filter(c => c.text.trim() && c.text !== '\n');
}

// Автоматичні субтитри дають «рвані» рядки, що накладаються в часі — прибираємо накладки.
function tidy(cues) {
  cues = cues.map(c => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() })).filter(c => c.text);
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start;
  }
  return cues;
}

async function fetchTrack(baseUrl) {
  const url = baseUrl.replace(/&fmt=[^&]*/, '');
  try {
    const r = await fetch(url + '&fmt=json3', { headers: { 'User-Agent': UA } });
    const txt = await r.text();
    if (txt.trim().startsWith('{')) {
      const cues = parseJson3(JSON.parse(txt));
      if (cues.length) return cues;
    }
  } catch (e) { /* далі XML */ }
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  return parseXml(await r.text());
}

// Переклад рядків рідною мовою: справжня доріжка, якщо є, інакше машинний переклад YouTube (tlang).
async function getTranslation(tracks, pick, tr) {
  if (!tr || tr === pick.lang) return [];
  const own = tracks.find(t => t.lang === tr && !t.auto);
  try {
    return tidy(await fetchTrack(own ? own.baseUrl : pick.baseUrl + '&tlang=' + encodeURIComponent(tr)));
  } catch (e) {
    return [];
  }
}

async function getSubs(id, lang, tr) {
  const info = (await tracksFromInnertube(id)) || (await tracksFromWatchPage(id));
  if (!info) throw new Error('У цього відео немає субтитрів, або YouTube їх не віддав.');
  const tracks = info.tracks.map(t => ({
    lang: t.languageCode,
    name: t.name?.simpleText || t.name?.runs?.map(r => r.text).join('') || t.languageCode,
    auto: t.kind === 'asr',
    baseUrl: t.baseUrl,
  }));
  const pick =
    tracks.find(t => t.lang === lang && !t.auto) || tracks.find(t => t.lang === lang) ||
    tracks.find(t => !t.auto) || tracks[0];
  const cues = tidy(await fetchTrack(pick.baseUrl));
  if (!cues.length) throw new Error('YouTube повернув порожні субтитри. Завантажте .srt або .vtt вручну.');
  return {
    title: info.title,
    lang: pick.lang,
    tracks: tracks.map(({ baseUrl, ...t }) => t),
    cues,
    trCues: await getTranslation(tracks, pick, tr),
  };
}

module.exports = { getSubs };
