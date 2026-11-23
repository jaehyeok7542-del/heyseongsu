/* =====================================================
   raters.js — "판단자 구분 + 판단자 간 일치도" (실험용 기능)

   ▶ 끄는 법   : 바로 아래 RATERS_ON 을 false 로 바꾸면 끝이에요.
   ▶ 지우는 법 : 이 파일을 지우고 index.html 의 raters.js 줄, sw.js 의 'js/raters.js' 를 지우면 돼요.
                (다른 파일은 "Rater가 있으면 쓰고, 없으면 원래대로" 동작하게 만들어 뒀어요.)

   ▶ 하는 일
     1) 이 기기에 무작위 판단자 코드(예: r-7f3k)를 하나 만들어요. 이름은 받지 않아요.
     2) 판단 기록에 그 코드를 같이 적어요. 같은 사례를 여러 명이 따로 판단할 수 있어요.
     3) 모델은 같은 사례의 여러 판단을 "다수결"로 합쳐서 배워요 (동점이면 보류).
     4) 모델 화면에 전체 일치도, 판단이 갈린 사례, 모델 vs 사람 비교를 보여줘요.

   ▶ 개인정보를 위해 일부러 안 하는 것
     - 판단자별 승인·반려 비율 같은 "개인 성향" 표는 만들지 않아요.
     - 판단자가 MIN_RATERS 명보다 적으면 일치도를 보여주지 않아요.
     - 다른 판단자의 판단은 판단 화면에 보이지 않아요 (서로 영향 주지 않게).
   ===================================================== */

const RATERS_ON = true;        // ← false 로 바꾸면 이 기능 전체가 꺼져요
const MIN_RATERS = 3;          // 일치도를 보여줄 최소 판단자 수
const MIN_SHARED = 5;          // 일치도를 보여줄 최소 "여러 명이 판단한 사례" 수

const Rater = {
  on: RATERS_ON,
  KEY: 'heyseongsu_rater_v1',

  /* ---------- 내 판단자 코드 ---------- */
  id() {
    let r = null;
    try { r = localStorage.getItem(this.KEY); } catch (e) {}
    if (!r) { r = this._newCode(); try { localStorage.setItem(this.KEY, r); } catch (e) {} }
    return r;
  },
  _newCode() {
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = 'r-';
    for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  },
  // 한 기기를 여러 명이 돌려 쓸 때: 새 판단자로 시작
  startNew() {
    const r = this._newCode();
    try { localStorage.setItem(this.KEY, r); } catch (e) {}
    return r;
  },
  // 내 판단 기록만 지우기
  forgetMine() {
    const me = this.id();
    const before = CaseBook.all().length;
    CaseBook._save(CaseBook.all().filter(c => c.raterId !== me));
    return before - CaseBook.all().length;
  },

  /* ---------- 같은 사례 알아보기 ----------
     기기가 달라도 같은 광고면 같은 열쇠가 나오게, 내용(종류·건물·입력값)으로 만들어요. */
  itemKey(c) {
    if (c.itemKey) return c.itemKey;
    const v = c.values || {};
    const vals = Object.keys(v).sort().map(k => k + '=' + v[k]).join('&');
    return [c.kind, c.buildingId, vals].join('|');
  },

  /* ---------- 학습용: 같은 사례의 여러 판단 → 다수결 하나 ---------- */
  consensus(cases) {
    const groups = new Map();
    cases.forEach(c => {
      const k = this.itemKey(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    });
    return [...groups.values()].map(g => {
      if (g.length === 1) return g[0];
      const n = DECISIONS.map(d => g.filter(c => c.decision === d).length);
      const top = Math.max(...n);
      const winners = DECISIONS.filter((d, i) => n[i] === top);
      const decision = winners.length > 1 ? 'hold' : winners[0];     // 동점이면 보류 (판단이 갈렸다는 뜻)
      return { ...g[0], decision, raterCount: g.length };
    });
  },

  /* ---------- 일치도 계산 ---------- */
  stats() {
    const rated = CaseBook.all().filter(c => c.raterId);
    const raters = new Set(rated.map(c => c.raterId));
    const groups = new Map();
    rated.forEach(c => {
      const k = this.itemKey(c);
      if (!groups.has(k)) groups.set(k, new Map());
      groups.get(k).set(c.raterId, c);           // 한 사람은 한 사례에 하나만
    });
    const shared = [...groups.values()].map(m => [...m.values()]).filter(g => g.length >= 2);

    // 사람끼리: 같은 사례를 본 두 사람이 같은 답을 낸 비율
    let pairs = 0, same = 0;
    shared.forEach(g => {
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        pairs++; if (g[i].decision === g[j].decision) same++;
      }
    });

    // 플라이스 카파 (우연히 맞을 확률을 뺀 일치도. 1=완전 일치, 0=우연 수준)
    let kappa = null;
    if (shared.length) {
      const tot = DECISIONS.map(() => 0);
      let Pbar = 0, N = 0;
      shared.forEach(g => {
        const n = g.length;
        const cnt = DECISIONS.map(d => g.filter(c => c.decision === d).length);
        cnt.forEach((v, j) => { tot[j] += v; });
        N += n;
        Pbar += cnt.reduce((s, v) => s + v * (v - 1), 0) / (n * (n - 1));
      });
      Pbar /= shared.length;
      const Pe = tot.reduce((s, v) => s + (v / N) ** 2, 0);
      kappa = Pe < 1 ? (Pbar - Pe) / (1 - Pe) : 1;
    }

    // 모델 vs 사람: 판단하기 직전 모델 추천이 그 사람 판단과 같았던 비율
    const withGuess = rated.filter(c => c.assistGuess);
    const modelSame = withGuess.filter(c => c.assistGuess === c.decision).length;

    // 판단이 갈린 사례 (누가 뭘 했는지는 빼고, 몇 명이 무엇을 골랐는지만)
    const split = shared
      .map(g => ({ c: g[0], n: DECISIONS.map(d => g.filter(x => x.decision === d).length) }))
      .filter(o => o.n.filter(v => v > 0).length >= 2);

    return {
      raters: raters.size, sharedItems: shared.length,
      humanRate: pairs ? same / pairs : null, kappa,
      modelRate: withGuess.length ? modelSame / withGuess.length : null, modelN: withGuess.length,
      split,
      enough: raters.size >= MIN_RATERS && shared.length >= MIN_SHARED,
    };
  },

  /* ---------- 화면 조각 ---------- */
  // 판단 화면 위쪽 띠
  barHTML() {
    return `
      <div class="rater-bar">
        <span>판단자 코드 <b>${esc(this.id())}</b> <small>(무작위 코드 · 이름은 저장하지 않아요)</small></span>
        <button type="button" class="link-btn" id="rater-new">다른 사람으로 판단하기</button>
      </div>`;
  },
  bindBar(root, rerender) {
    const b = $('#rater-new', root);
    if (b) b.addEventListener('click', () => {
      if (!confirm('이 기기에서 새 판단자 코드로 시작할까요?\n(지금까지의 판단은 그대로 남아요)')) return;
      this.startNew(); rerender(); toast('새 판단자 코드로 바뀌었어요');
    });
  },

  // 모델 화면의 "판단자 간 일치도" 칸
  panelHTML() {
    const s = this.stats();
    const pct = v => (v == null ? '–' : Math.round(v * 100) + '%');
    const kTxt = k => (k == null ? '–' : (Math.round(k * 100) / 100).toFixed(2));
    const kWord = k => k == null ? '' : k >= 0.8 ? '거의 일치' : k >= 0.6 ? '상당히 일치' : k >= 0.4 ? '보통' : k >= 0.2 ? '약간 일치' : '거의 우연 수준';

    const body = !s.enough ? `
        <p class="muted small">판단자 <b>${s.raters}</b>명 · 여러 명이 판단한 사례 <b>${s.sharedItems}</b>건.
          판단자 ${MIN_RATERS}명 이상, 같은 사례 ${MIN_SHARED}건 이상이 모이면 보여줘요.
          (인원이 적으면 누가 어떻게 판단했는지 짐작될 수 있어서 숨겨요)</p>` : `
        <div class="m-stats">
          <div><b>${s.raters}</b><small>판단자</small></div>
          <div><b>${s.sharedItems}</b><small>여러 명이 본 사례</small></div>
          <div><b>${pct(s.humanRate)}</b><small>사람끼리 일치</small></div>
          <div><b>${kTxt(s.kappa)}</b><small>κ ${kWord(s.kappa)}</small></div>
        </div>
        <h4>모델은 사람 한 명만큼 쓸 만한가?</h4>
        <div class="vs">
          <div class="prob-row"><span>사람끼리</span><i><b class="ok" style="width:${pct(s.humanRate)}"></b></i><em>${pct(s.humanRate)}</em></div>
          <div class="prob-row"><span>모델↔사람</span><i><b class="check" style="width:${pct(s.modelRate)}"></b></i><em>${pct(s.modelRate)}</em></div>
        </div>
        <p class="muted small">사람끼리 일치하는 정도가 모델이 닿을 수 있는 천장이에요. 두 막대가 비슷하면
          "모델이 담당자 한 명 정도의 참고가 된다"고 볼 수 있어요. (모델 비교 ${s.modelN}건 기준)</p>
        <h4>판단이 갈린 사례 ${s.split.length}건 <small>(법이 애매한 지점일 수 있어요)</small></h4>
        ${s.split.length ? `<ul class="sim-list">
          ${s.split.slice(0, 8).map(o => `<li>
            <div><b>${esc(o.c.buildingName)}</b> · ${AD_TYPES[o.c.kind].name}${o.c.sample ? ' <em class="soon">가상</em>' : ''}
            <small>${DECISIONS.map((d, i) => o.n[i] ? `${DECISION_LABEL[d]} ${o.n[i]}명` : '').filter(Boolean).join(' · ')}</small></div></li>`).join('')}
        </ul>${s.split.length > 8 ? `<p class="muted small">…외 ${s.split.length - 8}건 (CSV에서 모두 볼 수 있어요)</p>` : ''}`
        : '<p class="muted small">모든 사례에서 판단이 같았어요.</p>'}`;

    return `
      <section class="m-card">
        <h3>👥 판단자 간 일치도 <small class="muted">실험용</small></h3>
        ${body}
        <p class="muted small">판단자는 무작위 코드로만 구분하고, 개인별 성향은 분석하지 않아요.</p>
        <div class="m-actions">
          <button class="btn secondary" id="rater-common">공통 판단 세트 넣기 (20건)</button>
          <button class="btn secondary" id="rater-forget">내 판단 기록 지우기</button>
        </div>
      </section>`;
  },
  bindPanel(root) {
    const c = $('#rater-common', root), f = $('#rater-forget', root);
    if (c) c.addEventListener('click', () => { const n = this.loadCommonSet(); go(App.current); toast(n ? `공통 판단 세트 ${n}건을 넣었어요` : '이미 들어 있어요'); });
    if (f) f.addEventListener('click', () => {
      if (!confirm(`이 기기의 판단자 코드(${this.id()})로 남긴 판단 기록을 지울까요?\n되돌릴 수 없어요.`)) return;
      const n = this.forgetMine(); go(App.current); toast(`${n}건을 지웠어요`);
    });
  },

  /* ---------- 공통 판단 세트 ----------
     팀원 모두의 기기에 "똑같은" 신청 20건을 넣어요. 각자 판단 → 백업(JSON) 내려받기 →
     한 사람이 모두 불러오면 같은 사례끼리 묶여서 일치도가 나와요. */
  loadCommonSet(count = 20) {
    const list = Store.all();
    if (list.some(s => s.common)) return 0;
    const base = makeSampleCases(Math.ceil(count / 2)).slice(0, count);
    base.forEach((c, i) => {
      const b = getBuilding(c.buildingId);
      const dg = diagnose(c.kind, c.values, b);
      list.push({
        id: 'common-' + String(i + 1).padStart(2, '0'), common: true,
        buildingId: c.buildingId, kind: c.kind, values: c.values,
        photo: this._placeholder(b.name, AD_TYPES[c.kind].name, i + 1),
        diagnosis: dg.verdict, items: dg.items,
        createdAt: Date.now() - (count - i) * 60e3, status: 'received', rejectReason: '', excellent: false,
      });
    });
    Store._save(list);
    return count;
  },
  _placeholder(name, kind, n) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
      <rect width="640" height="480" fill="#e7e2da"/>
      <text x="320" y="210" font-size="34" text-anchor="middle" fill="#555" font-family="sans-serif">공통 사례 #${n}</text>
      <text x="320" y="260" font-size="26" text-anchor="middle" fill="#777" font-family="sans-serif">${esc(name)} · ${esc(kind)}</text>
      <text x="320" y="310" font-size="18" text-anchor="middle" fill="#999" font-family="sans-serif">(사진 자리 · 실제 사진으로 바꿀 수 있어요)</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  },

  /* ---------- 시연용: 가상 판단자 4명 ----------
     같은 가상 사례를 4명이 조금씩 다르게 판단한 것처럼 만들어요. (진짜 사람 아님, 가상 표시됨) */
  expandSamples(samples) {
    const r = rng(77);
    const shift = (d, toward, p) => (r() < p ? toward : d);
    const people = [
      d => shift(d, d === 'approve' ? 'hold' : d, 0.2),           // 조금 엄격한 사람
      d => shift(d, d === 'hold' ? 'approve' : d, 0.25),          // 조금 너그러운 사람
      d => (r() < 0.15 ? DECISIONS[Math.floor(r() * 3)] : d),     // 가끔 다르게 보는 사람
      d => d,                                                      // 기준대로 보는 사람
    ];
    const out = [];
    samples.forEach(c => {
      const key = this.itemKey(c);
      people.forEach((f, k) => out.push({ ...c, id: c.id + '-r' + (k + 1), itemKey: key, raterId: 'r-sample' + (k + 1), decision: f(c.decision) }));
    });
    return out;
  },
};
