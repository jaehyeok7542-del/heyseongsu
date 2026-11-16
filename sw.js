/* =====================================================
   sw.js — 서비스 워커 ("앱 파일을 폰에 저장해두는 도우미")
   한 번 열어보면 파일들이 저장돼서, 다음엔 더 빨리 열려요.
   ★ 코드를 고쳤다면 아래 VERSION 숫자를 올려야 폰이 새 파일을 받아가요!
   ===================================================== */
const VERSION = 'v3';
const CACHE = 'heyseongsu-' + VERSION;
const FILES = [
  './', 'index.html', 'manifest.json', 'css/style.css',
  'js/config.js', 'js/data.js', 'js/rules.js', 'js/ui.js', 'js/home.js',
  'js/advertiser.js', 'js/assist.js', 'js/admin.js', 'js/tourist.js', 'js/main.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// 인터넷이 되면 최신 파일, 안 되면 저장해둔 파일을 보여줘요
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // 카카오 지도 같은 다른 사이트 파일은 건드리지 않아요 (우리 파일만 저장)
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
