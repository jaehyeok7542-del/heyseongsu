/* =====================================================
   admin.js — 구청용 화면들
   admin-list(제출 목록) → admin-detail(상세 · 승인/보류/반려 · 우수 광고)
   admin-model(판단 보조 모델 현황 · 기록 내려받기)
   ===================================================== */

let adminTab = 'all';

const OPEN = s => s.status === 'received' || s.status === 'checking';
const TABS = [
  ['all',   '전체',       s => true],
  ['new',   '접수됨',     s => s.diagnosis === 'ok' && OPEN(s)],
  ['check', '확인 필요',  s => s.diagnosis === 'check' && OPEN(s)],
  ['held',  '보류',       s => s.status === 'held'],
  ['done',  '처리 완료',  s => s.status === 'approved' || s.status === 'rejected'],
];

function adminTop(title, sub, backTo, right) {
  return `
    <header class="a-top">
      <button class="back" data-go="${backTo}" aria-label="뒤로">←</button>
      <div class="a-top-text"><div class="topbar-title">${esc(title)}</div><div class="topbar-sub">${esc(sub)}</div></div>
      ${right || ''}
    </header>`;
}

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
    ${adminTop('구청 · 광고 심사', '성동구청 담당자 화면 (프로토타입)', 'home',
      `<button class="a-top-btn" data-go="admin-model">📊 판단 보조 모델</button>`)}
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

/* ---------- 판단 보조 패널 (참고 의견) ---------- */
function assistPanelHTML(a) {
  const m = a.model;
  const pct = v => Math.round(v * 100) + '%';
  const sim = a.similar.length ? `
      <h4>비슷했던 과거 사례</h4>
      <ul class="sim-list">
        ${a.similar.map(o => `
          <li><span class="badge ${DECISION_CLS[o.c.decision]}">${DECISION_LABEL[o.c.decision]}</span>
            <div><b>${esc(o.c.buildingName)}</b>${o.c.sample ? ' <em class="soon">가상</em>' : ''}
              <small>${(o.c.reasons || []).map(r => (REASONS.find(x => x[0] === r) || [, r])[1]).join(', ') || '이유 기록 없음'}
              ${o.c.note && o.c.note !== '가상 사례' ? ' · ' + esc(o.c.note) : ''}</small></div></li>`).join('')}
      </ul>` : '<p class="muted small">아직 판단 기록이 없어요. 판단할수록 이곳이 채워져요.</p>';

  const probs = a.probs ? `
      <h4>지금까지의 판단으로 본 가능성</h4>
      <div class="prob">
        ${DECISIONS.map((d, k) => `
          <div class="prob-row ${a.guess === d ? 'top' : ''}"><span>${DECISION_LABEL[d]}</span>
            <i><b class="${DECISION_CLS[d]}" style="width:${pct(a.probs[k])}"></b></i><em>${pct(a.probs[k])}</em></div>`).join('')}
      </div>
      ${a.factors.length ? `<p class="small"><b>${DECISION_LABEL[a.guess]}</b> 쪽으로 본 주된 이유:
        ${a.factors.map(f => `${esc(f.name)} <small>(값 ${Math.round(f.value * 100) / 100}, 지난 사례들보다 ${f.high ? '높음' : '낮음'})</small>`).join(', ')}</p>` : ''}` : '';

  return `
    <details class="assist" id="assist">
      <summary>🧭 판단 보조 의견 보기 <small>(참고용 · 신뢰도: <span class="conf ${a.conf.cls}">${a.conf.text}</span>)</small></summary>
      <div class="assist-body">
        ${probs}
        ${sim}
        <p class="muted small">이 의견은 이 기기에 쌓인 판단 기록 ${m.cases.length}건으로 계산했어요.
          ${m.ready ? `처음 보는 사례 정확도 ${pct(m.cv)} (가장 흔한 판단만 골랐을 때 ${pct(m.baseline)}).` : ''}
          최종 판단은 담당자가 해요.</p>
      </div>
    </details>`;
}

SCREENS['admin-detail'] = function (root, p) {
  let s = Store.get(p.id);
  if (!s) { go('admin-list'); return; }
  // 구청이 열어보면 "확인 중"으로 바뀌어요 (광고주 화면에도 반영돼요)
  if (s.status === 'received') { Store.update(s.id, { status: 'checking' }); s = Store.get(p.id); }

  const b = getBuilding(s.buildingId);
  const t = AD_TYPES[s.kind];
  const vd = VERDICT[s.diagnosis];
  const mark = { ok: '✓', bad: '✗', unknown: '?' };
  const R = typeof Rater !== 'undefined' && Rater.on ? Rater : null;   // 판단자 기능 (raters.js)
  const me = R ? R.id() : undefined;
  const prev = CaseBook.bySubmission(s.id, me);                        // 판단자 기능이 켜져 있으면 "내" 판단만
  // 판단자 기능이 켜져 있으면, 내가 아직 판단하지 않은 사례는 다른 사람이 끝냈어도 판단할 수 있어요
  const finished = (s.status === 'approved' || s.status === 'rejected') && (!R || !!prev);
  const photoTags = new Set(prev ? prev.photoTags : []);
  const reasons = new Set(prev ? prev.reasons : []);

  const inputs = t.fields.map(f => `<tr><th>${f.label}</th><td>${esc(s.values[f.key])}${f.unit ? ' ' + f.unit : ''}</td></tr>`).join('');

  root.innerHTML = `
    ${adminTop(b.name, `${t.icon} ${t.name} · ${fmtTime(s.createdAt)}`, 'admin-list')}
    <main class="a-page">
      <div class="detail-grid">
        <section class="d-photo"><img src="${s.photo}" alt="광고 사진"></section>

        <section class="d-info">
          <div class="banner ${vd.cls} compact"><div class="banner-icon">${vd.icon}</div>
            <div><b>1차 진단: ${vd.label}</b><small>법 기준표로 본 광고주 자체 진단 결과</small></div></div>

          <h3>광고주가 입력한 값</h3>
          <table class="kv">${inputs}</table>

          <h3>기준 확인</h3>
          <ul class="checklist">
            ${s.items.map(i => `<li class="${i.state}"><span class="mk">${mark[i.state]}</span>
              <div><b>${esc(i.label)}</b><small>${esc(i.text)}</small></div></li>`).join('')}
          </ul>

          <h3>사진을 보고 체크해 주세요 <small>(판단 보조 모델이 배우는 재료가 돼요)</small></h3>
          <div class="chips" id="tags">
            ${PHOTO_TAGS.map(([k, l]) => `<button type="button" class="chip ${photoTags.has(k) ? 'on' : ''}" data-k="${k}" ${finished ? 'disabled' : ''}>${l}</button>`).join('')}
          </div>

          <div id="assist-slot"></div>
          ${R ? R.barHTML() : ''}

          ${finished ? `
            <div class="done-box ${s.status}">
              <b>${s.status === 'approved' ? '✅ 승인 완료' : '⛔ 반려 완료'}</b>
              ${s.rejectReason ? `<p>이유: ${esc(s.rejectReason)}</p>` : ''}
              ${s.excellent ? '<p>🏆 우수 광고로 선정됨</p>' : ''}
            </div>` : `
            ${s.status === 'held' ? `<div class="done-box held"><b>⏸ 보류 중</b><p>이유: ${esc(s.rejectReason)}</p><small>다시 판단할 수 있어요.</small></div>` : ''}
            <h3>판단 이유 <small>(여러 개 고를 수 있어요)</small></h3>
            <div class="chips" id="reasons">
              ${REASONS.map(([k, l]) => `<button type="button" class="chip ${reasons.has(k) ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}
            </div>
            <textarea id="note" class="note" rows="2" placeholder="광고주에게 보낼 말 / 메모 (보류·반려 때는 꼭 적어 주세요)">${esc(s.status === 'held' ? s.rejectReason : '')}</textarea>
            <label class="star-check"><input type="checkbox" id="star"> 🏆 우수 광고로 선정하기 <small>(승인할 때 함께 적용돼요)</small></label>
            <div class="actions three">
              <button class="btn approve" data-dec="approve">승인</button>
              <button class="btn hold" data-dec="hold">보류</button>
              <button class="btn reject" data-dec="reject">반려</button>
            </div>`}
        </section>
      </div>
    </main>`;

  // 사진 체크가 바뀌면 보조 의견도 다시 계산
  const currentTags = () => $$('#tags .chip.on', root).map(c => c.dataset.k);
  let lastAssist = null;
  const renderAssist = () => {
    const open = $('#assist', root) && $('#assist', root).open;
    lastAssist = assistFor(s, currentTags());
    $('#assist-slot', root).innerHTML = assistPanelHTML(lastAssist);
    if (open) $('#assist', root).open = true;
  };
  renderAssist();
  if (R) R.bindBar(root, () => go('admin-detail', { id: s.id }));

  if (finished) return;

  $$('#tags .chip', root).forEach(c => c.addEventListener('click', () => { c.classList.toggle('on'); renderAssist(); }));
  $$('#reasons .chip', root).forEach(c => c.addEventListener('click', () => c.classList.toggle('on')));

  $$('[data-dec]', root).forEach(btn => btn.addEventListener('click', () => {
    const dec = btn.dataset.dec;
    const note = $('#note', root).value.trim();
    const why = $$('#reasons .chip.on', root).map(c => c.dataset.k);
    if (dec !== 'approve' && !note) { toast('보류·반려 이유를 적어 주세요 (광고주에게 보여요)'); $('#note', root).focus(); return; }

    // 1) 제출 상태 바꾸기 (광고주 화면에 반영)
    Store.update(s.id, {
      status: { approve: 'approved', hold: 'held', reject: 'rejected' }[dec],
      rejectReason: dec === 'approve' ? '' : note,
      excellent: dec === 'approve' && $('#star', root).checked,
    });
    // 2) 판단 기록 남기기 (보조 모델이 배우는 재료)
    CaseBook.upsert({
      subId: s.id, kind: s.kind, buildingId: s.buildingId, buildingName: b.name,
      building: { height: b.height, wallArea: b.wallArea }, values: s.values,
      photoTags: currentTags(), diagnosis: s.diagnosis,
      decision: dec, reasons: why, note,
      assistGuess: lastAssist && lastAssist.guess,              // 판단 전에 모델이 뭐라고 했는지
      assistViewed: !!($('#assist', root) && $('#assist', root).open),
      ...(R ? { raterId: me, itemKey: R.itemKey(s) } : {}),       // 판단자 코드 (이름 아님)
    });
    go('admin-list');
    toast(`처리됐어요 (${DECISION_LABEL[dec]})`);
  }));
};

/* ---------- 판단 보조 모델 현황 ---------- */
SCREENS['admin-model'] = function (root) {
  const pct = v => Math.round(v * 100) + '%';
  const cases = CaseBook.all();
  const samples = cases.filter(c => c.sample).length;
  const curve = agreementCurve();

  const kindBlock = kind => {
    const m = getModel(kind);
    const conf = confidenceLabel(m);
    const imp = globalImportance(kind);
    return `
      <section class="m-card">
        <h3>${AD_TYPES[kind].icon} ${AD_TYPES[kind].name} <span class="conf ${conf.cls}">${conf.text}</span></h3>
        <div class="m-stats">
          <div><b>${m.cases.length}</b><small>판단 기록</small></div>
          ${DECISIONS.map((d, k) => `<div><b class="t-${DECISION_CLS[d]}">${m.counts[k]}</b><small>${DECISION_LABEL[d]}</small></div>`).join('')}
        </div>
        ${m.ready ? `
          <p class="small">처음 보는 사례 정확도 <b>${pct(m.cv)}</b>
            <span class="muted">(가장 흔한 판단만 골랐을 때 ${pct(m.baseline)})</span></p>
          <h4>판단에 영향이 큰 재료</h4>
          <ul class="imp">
            ${imp.map(f => `<li><span>${esc(f.name)}</span>
              <em class="${f.w > 0 ? 't-bad' : 't-ok'}">${f.w > 0 ? '반려 쪽 ↑' : '승인 쪽 ↑'}</em></li>`).join('')}
          </ul>` : `<p class="muted small">${MIN_CASES}건 이상, 두 가지 이상의 판단이 모이면 학습을 시작해요.</p>`}
        <button class="btn secondary small-btn" data-csv="${kind}">표(CSV) 내려받기</button>
      </section>`;
  };

  root.innerHTML = `
    ${adminTop('판단 보조 모델', '담당자 판단이 쌓일수록 똑똑해져요 · 참고용', 'admin-list')}
    <main class="a-page">
      <p class="m-intro">담당자가 <b>승인 · 보류 · 반려</b>를 누를 때마다 값, 사진 체크, 이유가 기록돼요.
        새 광고가 오면 이 기록으로 다시 학습해서 비슷한 사례와 가능성을 알려줘요.
        <b>판단은 항상 담당자가 해요.</b></p>

      <div class="m-grid">${kindBlock('sign')}${kindBlock('banner')}</div>

      ${typeof Rater !== 'undefined' && Rater.on ? Rater.panelHTML() : ''}

      <section class="m-card">
        <h3>점점 맞아지고 있나요?</h3>
        <p class="muted small">판단하기 전 보조 모델의 추천과 실제 판단이 같았던 비율 (10건씩 묶음)</p>
        ${curve.length ? `<div class="curve">
          ${curve.map(c => `<div class="bar-col"><i style="height:${Math.max(4, c.rate * 100)}%"></i>
            <em>${pct(c.rate)}</em><small>${c.from}–${c.to}</small></div>`).join('')}</div>`
          : '<p class="muted small">아직 기록이 없어요.</p>'}
      </section>

      <section class="m-card">
        <h3>기록 관리</h3>
        <p class="muted small">기록은 지금 이 기기(브라우저)에만 저장돼요. 다른 기기와 합치려면 내려받아서 불러오세요.
          ${samples ? `<br>⚠️ 지금 <b>가상 사례 ${samples}건</b>이 섞여 있어요. 실제 분석 전에 꼭 지워 주세요.` : ''}</p>
        <div class="m-actions">
          <button class="btn secondary" id="ex-json">전체 백업(JSON) 내려받기</button>
          <label class="btn secondary">백업 불러오기<input type="file" accept=".json,application/json" id="im-json" hidden></label>
          ${samples
            ? '<button class="btn secondary" id="rm-sample">가상 사례 지우기</button>'
            : '<button class="btn secondary" id="add-sample">시연용 가상 사례 넣기</button>'}
        </div>
      </section>
    </main>`;

  $$('[data-csv]', root).forEach(b => b.addEventListener('click', () => exportCSV(b.dataset.csv)));
  if (typeof Rater !== 'undefined' && Rater.on) Rater.bindPanel(root);
  $('#ex-json', root).addEventListener('click', exportJSON);
  $('#im-json', root).addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const n = CaseBook.importMany(JSON.parse(await f.text()));
      go('admin-model'); toast(`${n}건을 불러왔어요`);
    } catch (err) { toast('파일을 읽지 못했어요'); }
  });
  const add = $('#add-sample', root), rm = $('#rm-sample', root);
  if (add) add.addEventListener('click', () => {
    add.textContent = '만드는 중…'; add.disabled = true;
    setTimeout(() => { loadSampleCases(); go('admin-model'); toast('가상 사례를 넣었어요 (시연용)'); }, 30);
  });
  if (rm) rm.addEventListener('click', () => { CaseBook.removeSamples(); go('admin-model'); toast('가상 사례를 지웠어요'); });
};
