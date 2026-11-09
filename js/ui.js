/* =====================================================
   ui.js — 화면 이동과 공통 도구
   핵심은 go('화면이름') 하나예요.
   go를 부르면 → 화면 상자(#app)를 비우고 → 그 화면을 새로 그려요.
   ===================================================== */

const SCREENS = {};            // 화면 이름 → 화면을 그리는 함수 (각 파일에서 채워요)
const App = { current: 'home', params: {}, draft: null };

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

// 사용자가 쓴 글을 화면에 넣을 때는 꼭 이걸로 감싸요 (안전하게)
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function go(name, params) {
  if (!SCREENS[name]) { console.error('없는 화면:', name); return; }
  App.current = name;
  App.params = params || {};
  // 구청용 화면은 다른 색/넓은 레이아웃
  document.body.className = name.startsWith('admin') ? 'mode-admin' : 'mode-adv';
  const root = $('#app');
  root.innerHTML = '';
  SCREENS[name](root, App.params);
  // data-go="화면이름" 이 붙은 버튼은 자동으로 이동 버튼이 돼요
  $$('[data-go]', root).forEach(el => {
    el.addEventListener('click', () => { if (!el.disabled) go(el.dataset.go); });
  });
  window.scrollTo(0, 0);
}

// 잠깐 나타났다 사라지는 안내 문구
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2200);
}

// 위쪽 제목줄 (뒤로가기 버튼 포함)
function headerHTML(title, backTo, sub) {
  return `
    <header class="topbar">
      ${backTo ? `<button class="back" data-go="${backTo}" aria-label="뒤로">←</button>` : '<span class="back-space"></span>'}
      <div class="topbar-text">
        <div class="topbar-title">${esc(title)}</div>
        ${sub ? `<div class="topbar-sub">${esc(sub)}</div>` : ''}
      </div>
    </header>`;
}

function fmtTime(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
