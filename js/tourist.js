/* =====================================================
   tourist.js — 관광객용 화면 (지금은 보류! 자리만 잡아둔 파일)

   나중에 추가하는 방법 (3단계):
   1) 이 파일에 SCREENS['tourist-map'] = function (root) { ... } 를 만든다.
      - 우수 광고 목록: Store.all().filter(s => s.excellent) 로 가져오면 돼요.
      - 별점 5개는 Store에 rating 값을 저장하는 함수를 하나 추가하면 돼요.
   2) home.js 에서 관광객용 버튼의 disabled를 지우고 data-go="tourist-map" 을 단다.
   3) 끝! 광고주/구청 화면은 하나도 안 건드려도 돼요.
   ===================================================== */

SCREENS['tourist-map'] = function (root) {
  root.innerHTML = headerHTML('관광객용', 'home') +
    `<main class="page"><p class="muted">준비 중이에요.</p></main>`;
};
