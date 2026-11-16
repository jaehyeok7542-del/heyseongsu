/* =====================================================
   main.js — 앱의 "시작 버튼"
   ===================================================== */

// 주소 끝에 #reset 을 붙여 열면 저장된 제출 내역을 모두 지워요 (발표 전 초기화용)
if (location.hash === '#reset') {
  Store.clear();
  history.replaceState(null, '', location.pathname);
}

go('home');

// 다른 탭/창에서 제출 내역이 바뀌면 구청 목록을 자동으로 새로고침
window.addEventListener('storage', () => {
  if (App.current === 'admin-list' || App.current === 'adv-done' || App.current === 'admin-model') go(App.current, App.params);
});

// PWA: 서비스 워커 등록 (https 또는 localhost에서만 작동해요)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('서비스워커 등록 실패', err));
}
