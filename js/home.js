/* =====================================================
   home.js — 첫 화면
   앱 이름 + 광고주용 / 관광객용 / 구청용 버튼 3개
   ===================================================== */

SCREENS.home = function (root) {
  root.innerHTML = `
    <main class="home">
      <div class="home-top">
        <div class="logo">H</div>
        <h1>헤이성수</h1>
        <p class="tagline">성수 연무장7길, 광고 규격을 미리 확인해요</p>
      </div>

      <div class="role-list">
        <button class="role" data-go="adv-map">
          <span class="role-icon">🏪</span>
          <span class="role-text"><b>광고주용</b><small>광고 규격을 미리 진단해요</small></span>
        </button>

        <!-- 관광객용은 나중에! disabled를 지우고 data-go="tourist-map"으로 바꾸면 열려요 -->
        <button class="role" disabled>
          <span class="role-icon">🧳</span>
          <span class="role-text"><b>관광객용 <em class="soon">준비 중</em></b><small>우수 광고를 지도에서 봐요</small></span>
        </button>

        <button class="role" data-go="admin-list">
          <span class="role-icon">🏛️</span>
          <span class="role-text"><b>구청용</b><small>제출된 광고를 확인해요</small></span>
        </button>
      </div>

      <footer class="home-foot">학생 프로젝트 프로토타입</footer>
    </main>`;
};
