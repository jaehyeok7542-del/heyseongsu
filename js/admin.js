/* =====================================================
   admin.js — 구청용 화면들
   admin-list(제출 목록) → admin-detail(상세 · 승인/반려/우수 광고)
   ===================================================== */

let adminTab = 'all';

const TABS = [
  ['all',     '전체',       s => true],
  ['new',     '접수됨',     s => s.diagnosis === 'ok' && (s.status === 'received' || s.status === 'checking')],
  ['check',   '확인 필요',  s => s.diagnosis === 'check' && (s.status === 'received' || s.status === 'checking')],
  ['done',    '처리 완료',  s => s.status === 'approved' || s.status === 'rejected'],
];

SCREENS['admin-list'] = function (root) {
  const all = Store.all().filter(s => !s.superseded);
  const tab = TABS.find(t => t[0] === adminTab);
  const shown = all.filter(tab[2]);

  const card = s => {
    const b = getBuilding(s.buildingId);
    const vd = VERDICT[s.diagnosis];
    return `
      <button class="a-card" data-id="${s.id}">
        <img src="${s.photo}" alt="">
        <div class="a-info">
          <b>${esc(b.name)}</b>
          <small>${AD_TYPES[s.kind].name} · ${fmtTime(s.createdAt)}</small>
          <div class="a-tags">
            <span class="badge ${vd.cls}">${vd.icon} ${vd.label}</span>
            <span class="badge ${s.status}">${STATUS_LABEL[s.status]}</span>
            ${s.excellent ? '<span class="badge star">🏆 우수</span>' : ''}
          </div>
        </div>
      </button>`;
  };

  root.innerHTML = `
    <header class="a-top">
      <button class="back" data-go="home" aria-label="처음으로">←</button>
      <div><div class="topbar-title">구청 · 광고 심사</div><div class="topbar-sub">성동구청 담당자 화면 (프로토타입)</div></div>
    </header>
    <main class="a-page">
      <nav class="tabs">
        ${TABS.map(t => `<button class="tab ${t[0] === adminTab ? 'on' : ''}" data-tab="${t[0]}">${t[1]}
          <span>${all.filter(t[2]).length}</span></button>`).join('')}
      </nav>
      <div class="a-grid">
        ${shown.length ? shown.map(card).join('') : '<p class="muted empty">여기에는 아직 아무것도 없어요.</p>'}
      </div>
    </main>`;

  $$('.tab', root).forEach(b => b.addEventListener('click', () => { adminTab = b.dataset.tab; go('admin-list'); }));
  $$('.a-card', root).forEach(c => c.addEventListener('click', () => go('admin-detail', { id: c.dataset.id })));
};

SCREENS['admin-detail'] = function (root, p) {
  let s = Store.get(p.id);
  if (!s) { go('admin-list'); return; }
  // 구청이 열어보면 "확인 중"으로 바뀌어요 (광고주 화면에도 반영돼요)
  if (s.status === 'received') { Store.update(s.id, { status: 'checking' }); s = Store.get(p.id); }

  const b = getBuilding(s.buildingId);
  const t = AD_TYPES[s.kind];
  const vd = VERDICT[s.diagnosis];
  const mark = { ok: '✓', bad: '✗', unknown: '?' };
  const finished = s.status === 'approved' || s.status === 'rejected';

  // 광고주가 입력한 값을 한 줄씩 보여주기
  const inputs = t.fields.map(f => `<tr><th>${f.label}</th><td>${esc(s.values[f.key])}${f.unit ? ' ' + f.unit : ''}</td></tr>`).join('');

  root.innerHTML = `
    <header class="a-top">
      <button class="back" data-go="admin-list" aria-label="목록으로">←</button>
      <div><div class="topbar-title">${esc(b.name)}</div><div class="topbar-sub">${t.icon} ${t.name} · ${fmtTime(s.createdAt)}</div></div>
    </header>
    <main class="a-page">
      <div class="detail-grid">
        <section class="d-photo"><img src="${s.photo}" alt="광고 사진"></section>

        <section class="d-info">
          <div class="banner ${vd.cls} compact"><div class="banner-icon">${vd.icon}</div>
            <div><b>1차 진단: ${vd.label}</b><small>광고주 자체 진단 결과</small></div></div>

          <h3>광고주가 입력한 값</h3>
          <table class="kv">${inputs}</table>

          <h3>기준 확인</h3>
          <ul class="checklist">
            ${s.items.map(i => `<li class="${i.state}"><span class="mk">${mark[i.state]}</span>
              <div><b>${esc(i.label)}</b><small>${esc(i.text)}</small></div></li>`).join('')}
          </ul>

          <section class="ai-box"><b>🤖 담당자용 AI 요약</b><p>${esc(aiExplain(s.kind, { items: s.items }, true))}</p>
            <small class="muted">사진과 입력값이 같은지는 사진을 보고 직접 확인해 주세요. (AI 비교는 준비 중)</small></section>

          ${finished ? `
            <div class="done-box ${s.status}">
              <b>${s.status === 'approved' ? '✅ 승인 완료' : '⛔ 반려 완료'}</b>
              ${s.status === 'rejected' ? `<p>이유: ${esc(s.rejectReason)}</p>` : ''}
              ${s.excellent ? '<p>🏆 우수 광고로 선정됨</p>' : ''}
            </div>` : `
            <label class="star-check"><input type="checkbox" id="star"> 🏆 우수 광고로 선정하기 <small>(승인할 때 함께 적용돼요)</small></label>
            <div class="actions">
              <button class="btn approve" id="approve">승인</button>
              <button class="btn reject" id="reject">반려</button>
            </div>
            <div class="reject-box" id="reject-box" hidden>
              <textarea id="reason" rows="3" placeholder="반려 이유를 적어 주세요 (광고주에게 보여요)"></textarea>
              <button class="btn reject" id="reject-ok">반려 확정</button>
            </div>`}
        </section>
      </div>
    </main>`;

  if (finished) return;

  const back = msg => { go('admin-list'); toast(msg); };
  $('#approve', root).addEventListener('click', () => {
    Store.update(s.id, { status: 'approved', excellent: $('#star', root).checked });
    back('처리됐어요 (승인)');
  });
  $('#reject', root).addEventListener('click', () => { $('#reject-box', root).hidden = false; $('#reason', root).focus(); });
  $('#reject-ok', root).addEventListener('click', () => {
    const reason = $('#reason', root).value.trim();
    if (!reason) { toast('반려 이유를 적어 주세요'); return; }
    Store.update(s.id, { status: 'rejected', rejectReason: reason, excellent: false });
    back('처리됐어요 (반려)');
  });
};
