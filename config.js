// Адреса API для автоматичних субтитрів.
// '' — той самий сайт (локально через `node server.js` або на Vercel).
// GitHub Pages сервера не має, тому там використовується API, розгорнутий на Vercel.
window.SH_API = location.hostname.endsWith('github.io') ? 'https://subtitle-hacker.vercel.app' : '';
