/* =====================================================
   advertiser.js — 광고주용 화면들
   흐름:  adv-map(건물 고르기) → adv-kind(곳/종류) → adv-form(입력)
          → adv-result(진단 결과) → adv-done(제출 현황)
   내가 고른 것들은 App.draft 에 차곡차곡 담겨요.
   ===================================================== */

function newDraft() {
  return { buildingId: null, kind: null, values: {}, photo: null, resubmitOf: null };
}

/* ---------- 1. 건물 고르기 (지도) ---------- */
SCREENS['adv-map'] = function (root) {
  if (!App.draft) App.draft = newDraft();
  const d = App.draft;

  root.innerHTML = `
    ${headerHTML('어느 건물에 광고하나요?', 'home', '지도에서 건물 핀을 눌러 주세요')}
    <main class="page">
      <div class="map" id="map"><div class="map-msg">지도 불러오는 중…</div></div>
      <p class="muted small" id="map-note"></p>
      <div class="picked" id="picked"></div>
      <button class="link-btn" data-go="adv-done">내 제출 현황 보기</button>
    </main>
    <div class="bottom-bar">
      <button class="btn secondary" data-go="home">뒤로</button>
      <button class="btn primary" id="next" disabled>다음</button>
    </div>`;

  const refresh = () => {
    const b = getBuilding(d.buildingId);
    $('#picked', root).innerHTML = b
      ? `<b>${esc(b.name)}</b><span class="muted small"> · 높이 ${b.height}m</span>`
      : '<span class="muted">아직 고르지 않았어요</span>';
    $('#next', root).disabled = !b;
    $$('.pin, .kpin', root).forEach(p => p.classList.toggle('on', p.dataset.id === d.buildingId));
  };
  const pick = id => { d.buildingId = id; refresh(); };
  $('#next', root).addEventListener('click', () => go('adv-kind'));
  refresh();

  // 카카오맵을 불러와서 그려요. 실패하면 예전 임시 그림 지도를 보여줘요.
  const screen = App.current;
  loadKakao()
    .then(() => { if (App.current === screen) drawKakaoMap(root, pick, refresh); })
    .catch(err => { if (App.current === screen) drawFallbackMap(root, d, pick, refresh, err); });
};

/* ---------- 카카오맵 불러오기 ----------
   스크립트 태그를 필요할 때 만들어 붙여요. (키는 config.js에 있어요)
   libraries=services : 주소로 위치를 찾는 기능(연무장7길 중심 찾기)에 필요해요 */
let kakaoLoading = null;
function loadKakao() {
  if (kakaoLoading) return kakaoLoading;
  kakaoLoading = new Promise((resolve, reject) => {
    if (!KAKAO_JS_KEY) { reject(new Error('config.js에 키가 없어요')); return; }
    const timer = setTimeout(() => reject(new Error('시간 초과')), 8000);
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false`;
    s.onload = () => kakao.maps.load(() => { clearTimeout(timer); resolve(); });
    s.onerror = () => { clearTimeout(timer); reject(new Error('스크립트를 못 불러왔어요')); };
    document.head.appendChild(s);
  });
  kakaoLoading.catch(() => { kakaoLoading = null; });   // 실패하면 다음에 다시 시도
  return kakaoLoading;
}

// 건물의 실제 위치. b.lat / b.lng 가 있으면 그걸 쓰고,
// 없으면(샘플 건물) 거리 중심 + 지도 그림의 x,y 위치를 살짝 옮겨서 대신 써요.
function buildingLatLng(b, center) {
  if (b.lat != null && b.lng != null) return { lat: b.lat, lng: b.lng };
  return { lat: center.lat + (50 - b.y) * 0.00002, lng: center.lng + (b.x - 50) * 0.00003 };
}

function drawKakaoMap(root, pick, refresh) {
  const box = $('#map', root);
  box.innerHTML = '<div id="kmap" class="kmap"></div>';

  const build = center => {
    const map = new kakao.maps.Map($('#kmap', root), {
      center: new kakao.maps.LatLng(center.lat, center.lng), level: 3,
    });
    BUILDINGS.forEach(b => {
      const pos = buildingLatLng(b, center);
      const el = document.createElement('button');
      el.className = 'kpin';
      el.dataset.id = b.id;
      el.setAttribute('aria-label', b.name);
      el.textContent = '📍';
      el.addEventListener('click', () => pick(b.id));
      new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(pos.lat, pos.lng), content: el, yAnchor: 1 });
    });
    // 현장조사용: 주소 끝에 #coords 를 붙여 열고 지도를 누르면 그 곳의 좌표가 나와요
    if (location.hash === '#coords') {
      kakao.maps.event.addListener(map, 'click', e => {
        const t = `${e.latLng.getLat().toFixed(6)}, ${e.latLng.getLng().toFixed(6)}`;
        console.log('좌표', t); toast('좌표 ' + t);
      });
    }
    refresh();
  };

  // 먼저 "연무장7길"의 위치를 카카오에 물어보고, 못 찾으면 기본 위치를 써요
  let done = false;
  const finish = c => { if (!done) { done = true; build(c); } };
  setTimeout(() => finish(DEFAULT_CENTER), 2500);
  try {
    new kakao.maps.services.Geocoder().addressSearch(STREET_ADDRESS, (res, status) => {
      if (status === kakao.maps.services.Status.OK && res[0]) finish({ lat: Number(res[0].y), lng: Number(res[0].x) });
      else finish(DEFAULT_CENTER);
    });
  } catch (e) { finish(DEFAULT_CENTER); }
}

// 카카오맵을 못 불러왔을 때 보여주는 임시 그림 지도
function drawFallbackMap(root, d, pick, refresh, err) {
  console.warn('카카오맵 실패:', err && err.message);
  $('#map', root).innerHTML = `
    <div class="map-road"></div><div class="map-label">연무장7길</div>
    ${BUILDINGS.map(b => `<button class="pin" data-id="${b.id}" style="left:${b.x}%;top:${b.y}%"
        aria-label="${esc(b.name)}">📍</button>`).join('')}`;
  $$('.pin', root).forEach(p => p.addEventListener('click', () => pick(p.dataset.id)));
  $('#map-note', root).textContent = '※ 카카오맵을 불러오지 못해 임시 그림 지도를 보여줘요. (인터넷, 키, 등록한 주소, 카카오맵 ON 확인)';
  refresh();
}

/* ---------- 2. 곳 / 종류 고르기 ---------- */
SCREENS['adv-kind'] = function (root) {
  const d = App.draft;
  const b = getBuilding(d.buildingId);

  root.innerHTML = `
    ${headerHTML('어디에 광고하나요?', 'adv-map', b.name)}
    <main class="page">
      <p class="muted">광고를 거는 곳을 골라 주세요. 종류는 자동으로 정해져요.</p>
      <div class="kind-list">
        ${Object.entries(AD_TYPES).map(([k, t]) => `
          <button class="kind-card ${d.kind === k ? 'on' : ''}" data-kind="${k}">
            <span class="kind-icon">${t.icon}</span>
            <span class="kind-text"><b>${t.where}</b><small>→ ${t.name}</small></span>
          </button>`).join('')}
      </div>
    </main>`;

  $$('.kind-card', root).forEach(c => c.addEventListener('click', () => {
    if (d.kind !== c.dataset.kind) d.values = {};   // 종류가 바뀌면 입력값 초기화
    d.kind = c.dataset.kind;
    go('adv-form');
  }));
};

/* ---------- 3. 규격 입력 ---------- */
SCREENS['adv-form'] = function (root) {
  const d = App.draft;
  const b = getBuilding(d.buildingId);
  const t = AD_TYPES[d.kind];

  const fieldHTML = f => {
    const v = d.values[f.key];
    if (f.type === 'number') {
      return `<label class="field"><span class="flabel">${f.label}</span>
        <span class="input-wrap"><input type="number" inputmode="decimal" min="0" step="any"
          data-key="${f.key}" value="${v == null ? '' : v}" placeholder="0"><i>${f.unit}</i></span></label>`;
    }
    return `<div class="field"><span class="flabel">${f.label}</span>
      <div class="choices">${f.options.map(o =>
        `<button type="button" class="choice ${v === o ? 'on' : ''}" data-key="${f.key}" data-val="${o}">${o}</button>`).join('')}
      </div></div>`;
  };

  root.innerHTML = `
    ${headerHTML(t.name + ' 정보 입력', 'adv-kind', `${b.name} · ${t.where}`)}
    <main class="page form-page">
      ${t.fields.map(fieldHTML).join('')}
      <div class="derived" id="derived"></div>

      <div class="field">
        <span class="flabel">광고 사진</span>
        <label class="photo-pick">
          <input type="file" accept="image/*" id="photo" hidden>
          <span id="photo-box">${d.photo ? `<img src="${d.photo}" alt="">` : '📷 사진 찍기 / 고르기'}</span>
        </label>
      </div>
      <div class="spacer"></div>
    </main>
    <div class="bottom-bar right">
      <button class="btn primary" id="go-diag">진단하기</button>
    </div>`;

  // 자동 계산 표시 (면적 등)
  const showDerived = () => {
    const v = d.values;
    const ready = t.fields.filter(f => f.type === 'number').every(f => typeof v[f.key] === 'number');
    const el = $('#derived', root);
    if (!ready) { el.innerHTML = ''; return; }
    const x = t.derived(v);
    el.innerHTML = Object.entries(x).map(([k, val]) =>
      `<div>${{ area: '자동 계산 · 면적', totalArea: '자동 계산 · 전체 면적', top: '자동 계산 · 윗부분 높이' }[k] || k}: <b>${round2(val)}${k === 'top' ? 'm' : '㎡'}</b></div>`).join('');
  };

  $$('input[type=number]', root).forEach(inp => inp.addEventListener('input', () => {
    d.values[inp.dataset.key] = inp.value === '' ? undefined : Number(inp.value);
    showDerived();
  }));
  $$('.choice', root).forEach(btn => btn.addEventListener('click', () => {
    d.values[btn.dataset.key] = btn.dataset.val;
    $$(`.choice[data-key="${btn.dataset.key}"]`, root).forEach(x => x.classList.toggle('on', x === btn));
  }));
  $('#photo', root).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    d.photo = await readPhoto(file);
    $('#photo-box', root).innerHTML = `<img src="${d.photo}" alt="">`;
  });
  showDerived();

  $('#go-diag', root).addEventListener('click', () => {
    const missing = t.fields.find(f => d.values[f.key] === undefined || d.values[f.key] === '');
    if (missing) { toast(`"${missing.label}"을(를) 입력해 주세요`); return; }
    if (!d.photo) { toast('광고 사진을 넣어 주세요'); return; }
    go('adv-result');
  });
};

/* ---------- 4. 진단 결과 ---------- */
SCREENS['adv-result'] = function (root) {
  const d = App.draft;
  const b = getBuilding(d.buildingId);
  const t = AD_TYPES[d.kind];

  // 진단 중… 화면 (조금 기다리는 느낌을 줘요. 나중에 진짜 AI 호출이 여기 들어가요)
  root.innerHTML = `<main class="loading"><div class="spinner"></div><p>진단 중…</p></main>`;

  setTimeout(() => {
    if (App.current !== 'adv-result') return;
    const result = diagnose(d.kind, d.values, b);
    const vd = VERDICT[result.verdict];
    const mark = { ok: '✓', bad: '✗', unknown: '?' };

    const btn = {
      ok:    ['구청에 제출하기', 'submit'],
      bad:   ['수정하러 가기', 'edit'],
      check: ['구청에 확인 요청하기', 'submit'],
    }[result.verdict];

    root.innerHTML = `
      ${headerHTML('진단 결과', 'adv-form', `${b.name} · ${t.name}`)}
      <main class="page result-page">
        <section class="banner ${vd.cls}">
          <div class="banner-icon">${vd.icon}</div>
          <div><b>${vd.label}</b>
            <small>${{ ok: '기준 안에 들어와요', bad: '기준을 넘는 항목이 있어요', check: '확실하지 않은 항목이 있어요' }[result.verdict]}</small></div>
        </section>

        <div class="photo-row"><img class="thumb" src="${d.photo}" alt="내 광고 사진"><span class="muted small">내가 올린 사진</span></div>

        <ul class="checklist">
          ${result.items.map(i => `
            <li class="${i.state}"><span class="mk">${mark[i.state]}</span>
              <div><b>${esc(i.label)}</b><small>${esc(i.text)}</small></div></li>`).join('')}
          <li class="info"><span class="mk">i</span>
            <div><b>사진과 입력 내용이 맞는지</b><small>AI 연결 후에 자동으로 확인돼요 (지금은 준비 중)</small></div></li>
        </ul>

        <section class="ai-box"><b>🤖 AI 쉬운 설명</b><p>${esc(aiExplain(d.kind, result, false))}</p></section>
        <p class="muted small">1차 진단 결과예요. 최종 판단은 구청이 해요.</p>
        <div class="spacer"></div>
      </main>
      <div class="bottom-bar">
        <button class="btn primary wide" id="act">${btn[0]}</button>
      </div>`;

    // 화면을 늦게 그려서 go()가 연결 못 한 뒤로가기 버튼을 여기서 연결해요
    $$('[data-go]', root).forEach(el => el.addEventListener('click', () => go(el.dataset.go)));

    $('#act', root).addEventListener('click', () => {
      if (btn[1] === 'edit') { go('adv-form'); return; }
      // 제출: 구청이 볼 수 있게 저장소에 넣어요 (부적합은 여기까지 오지 않아요)
      const sub = Store.add({
        buildingId: d.buildingId, kind: d.kind, values: d.values, photo: d.photo,
        diagnosis: result.verdict, items: result.items,
      });
      if (d.resubmitOf) Store.update(d.resubmitOf, { superseded: true });
      App.draft = newDraft();
      go('adv-done', { id: sub.id });
      toast('제출됐어요');
    });
  }, 900);
};

/* ---------- 5. 제출 완료 · 내 제출 현황 ---------- */
SCREENS['adv-done'] = function (root, p) {
  const list = Store.all().filter(s => !s.superseded);
  const steps = ['접수됨', '확인 중', '결과'];
  const stepIndex = { received: 0, checking: 1, approved: 2, rejected: 2, held: 2 };

  const card = s => {
    const b = getBuilding(s.buildingId);
    const t = AD_TYPES[s.kind];
    const idx = stepIndex[s.status];
    return `
      <article class="status-card ${s.id === p.id ? 'hl' : ''}">
        <div class="sc-head">
          <img src="${s.photo}" alt="">
          <div><b>${esc(b.name)}</b><small>${t.name} · ${fmtTime(s.createdAt)}</small></div>
          <span class="badge ${s.status}">${STATUS_LABEL[s.status]}</span>
        </div>
        <ol class="steps">
          ${steps.map((n, i) => `<li class="${i <= idx ? 'done' : ''}"><i></i>${i === 2 && idx === 2 ? STATUS_LABEL[s.status] : n}</li>`).join('')}
        </ol>
        ${s.status === 'approved' ? `<p class="note-ok">승인됐어요! ${s.excellent
          ? '🏆 <b>우수 광고</b>로 선정됐어요. 성동구청 홍보 채널에 소개될 수 있어요 (안).' : ''}</p>` : ''}
        ${s.status === 'rejected' ? `<p class="note-bad">반려 이유: ${esc(s.rejectReason)}</p>
          <button class="btn secondary small-btn" data-resubmit="${s.id}">수정해서 다시 제출</button>` : ''}
        ${s.status === 'held' ? `<p class="note-hold">보류됐어요. 구청 의견: ${esc(s.rejectReason)}</p>
          <button class="btn secondary small-btn" data-resubmit="${s.id}">수정해서 다시 제출</button>` : ''}
      </article>`;
  };

  root.innerHTML = `
    ${headerHTML(p.id ? '제출 완료' : '내 제출 현황', 'adv-map')}
    <main class="page">
      ${p.id ? '<div class="done-msg">✅ 구청에 제출했어요. 아래에서 진행 상태를 볼 수 있어요.</div>' : ''}
      ${list.length ? list.map(card).join('') : '<p class="muted">아직 제출한 광고가 없어요.</p>'}
      <div class="spacer"></div>
    </main>
    <div class="bottom-bar">
      <button class="btn secondary" data-go="home">처음으로</button>
      <button class="btn primary" id="another">다른 광고 등록하기</button>
    </div>`;

  $('#another', root).addEventListener('click', () => { App.draft = newDraft(); go('adv-map'); });
  $$('[data-resubmit]', root).forEach(btn => btn.addEventListener('click', () => {
    const s = Store.get(btn.dataset.resubmit);
    // 반려된 값을 그대로 가지고 입력 화면으로 (값 유지!)
    App.draft = { buildingId: s.buildingId, kind: s.kind, values: { ...s.values }, photo: s.photo, resubmitOf: s.id };
    go('adv-form');
  }));
};
