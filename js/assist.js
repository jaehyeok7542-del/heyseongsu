/* =====================================================
   assist.js — 구청 "판단 보조 모델"

   ▶ 하는 일
     구청 담당자가 승인 / 보류 / 반려를 누를 때마다 그 판단을 "사례장(CaseBook)"에 모아요.
     새 광고가 들어오면 지금까지 모인 사례로 다시 학습해서
       ① 비슷했던 과거 사례 3개 (어떻게 판단했는지)
       ② 승인·보류·반려 가능성 (%)
       ③ 그렇게 본 이유 (어떤 값이 영향을 줬는지)
     를 보여줘요. 사례가 쌓일수록 점점 담당자 판단에 가까워져요.

   ▶ 꼭 지킬 것
     - 이 모델은 "참고 의견"이에요. 판단은 항상 담당자가 해요.
     - 법 기준표(rules.js)를 대신하지 않아요. 법 기준 결과도 하나의 재료로만 써요.

   ▶ 어떤 모델이에요?
     - 다항 로지스틱 회귀 (승인/보류/반려 3가지 중 하나를 고르는 통계 모델)
     - k-최근접 이웃 (가장 비슷한 과거 사례 찾기)
     둘 다 브라우저 안에서 바로 학습해요. 서버나 AI 키가 필요 없어요.

   ▶ 사진은?
     지금은 담당자가 사진을 보고 체크한 "사진 특징"(글씨·색이 과함 등)을 재료로 써요.
     나중에 Claude API 서버를 붙이면 이 체크를 AI가 미리 채워주도록 바꿀 수 있어요
     (아래 photoTagsFromAI 함수 자리).
   ===================================================== */

/* ---------- 판단 종류 / 이유 / 사진 특징 ---------- */
const DECISIONS = ['approve', 'hold', 'reject'];
const DECISION_LABEL = { approve: '승인', hold: '보류', reject: '반려' };
const DECISION_CLS   = { approve: 'ok', hold: 'check', reject: 'bad' };

const REASONS = [
  ['size',     '규격 초과'],
  ['place',    '설치 위치 문제'],
  ['walk',     '보행 방해'],
  ['design',   '디자인·경관'],
  ['mismatch', '사진과 입력 불일치'],
  ['docs',     '서류 부족(승낙서 등)'],
  ['etc',      '기타'],
];

const PHOTO_TAGS = [
  ['loud',     '글씨·색이 과하게 눈에 띔'],
  ['clutter',  '주변에 광고가 많아 어수선함'],
  ['block',    '보행이나 시야를 가림'],
  ['mismatch', '사진과 입력값이 달라 보임'],
  ['harmony',  '거리 경관과 잘 어울림'],
];

/* ---------- 재료(특징) 만들기 ----------
   광고 값을 "기준 대비 몇 배인지" 같은 숫자로 바꿔요.
   1보다 크면 기준을 넘은 거예요. (너무 큰 값은 3으로 잘라요) */
const cap = x => (isFinite(x) ? Math.max(0, Math.min(3, x)) : 0);
const yes = v => (v === '예' ? 1 : 0);
const unsure = v => (v === '잘 모르겠어요' ? 0.5 : yes(v));

const FEATURES = {
  sign: [
    ['높이 ÷ 기준(120cm)',        (v, b, d) => cap(v.height / 120)],
    ['한 면 면적 ÷ 기준(0.6㎡)',   (v, b, d) => cap(d.area / 0.6)],
    ['전체 면적 ÷ 기준(1.2㎡)',    (v, b, d) => cap(d.totalArea / 1.2)],
    ['벽면 거리 ÷ 기준(1m)',       (v, b, d) => cap(v.distance / 100)],
    ['전기·조명 사용',             (v)       => yes(v.electric)],
    ['보행자 통로 위',             (v)       => unsure(v.walkway)],
    ['자기 가게 광고 아님',        (v)       => (v.selfAd === '아니오' ? 1 : 0)],
  ],
  banner: [
    ['가로 ÷ 기준(세로의 2배)',    (v)       => cap(v.width / (2 * v.height))],
    ['면적 ÷ 기준(벽면의 1/5)',    (v, b, d) => cap(d.area / (b.wallArea / 5))],
    ['세로 ÷ 기준(건물 높이 1/2)', (v, b)    => cap(v.height / (b.height / 2))],
    ['아랫부분 높이 부족(4m ÷ 값)', (v)      => cap(4 / Math.max(v.bottom, 0.1))],
    ['윗부분 ÷ 기준(건물 높이 3/4)', (v, b, d) => cap(d.top / (b.height * 0.75))],
    ['표시 기간 ÷ 1년',           (v)       => cap(v.days / 365)],
    ['자기 가게·행사 아님',        (v)       => (v.selfAd === '아니오' ? 1 : 0)],
    ['건물주 승낙 없음·불명',      (v)       => (v.consent === '예' ? 0 : v.consent === '아니오' ? 1 : 0.5)],
  ],
};

function featureNames(kind) {
  return [
    ...FEATURES[kind].map(f => f[0]),
    '법 기준 초과 항목 수',
    '확인 필요 항목 수',
    ...PHOTO_TAGS.map(t => '사진: ' + t[1]),
  ];
}

// 한 사례 → 숫자 줄 하나
function featureVector(kind, values, building, photoTags) {
  const d = AD_TYPES[kind].derived(values);
  const items = AD_TYPES[kind].checks(values, building);
  const tags = photoTags || [];
  return [
    ...FEATURES[kind].map(f => f[1](values, building, d)),
    Math.min(5, items.filter(i => i.state === 'bad').length),
    Math.min(5, items.filter(i => i.state === 'unknown').length),
    ...PHOTO_TAGS.map(t => (tags.includes(t[0]) ? 1 : 0)),
  ];
}

// 나중에 Claude API 서버가 생기면: 사진을 보내서 PHOTO_TAGS 코드 목록을 받아오는 자리
async function photoTagsFromAI(/* photoDataUrl */) {
  return null;   // 아직 없음 → 담당자가 직접 체크
}

/* =====================================================
   사례장 (판단 기록 저장소)
   사진은 넣지 않아요 (저장 공간이 작아서). 숫자 · 판단 · 이유 · 사진 특징만 저장해요.
   ===================================================== */
const CaseBook = {
  KEY: 'heyseongsu_cases_v1',
  _cache: null,
  version: 0,

  all() {
    if (this._cache) return this._cache;
    try { this._cache = JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
    catch (e) { this._cache = []; }
    return this._cache;
  },
  _save(list) {
    this._cache = list;
    this.version++;
    try { localStorage.setItem(this.KEY, JSON.stringify(list)); }
    catch (e) { alert('판단 기록을 저장하지 못했어요. (저장 공간 부족)'); }
  },
  ofKind(kind) { return this.all().filter(c => c.kind === kind); },
  bySubmission(subId) { return this.all().find(c => c.subId === subId); },

  // 같은 제출에 대한 판단이 이미 있으면 바꿔요 (보류 → 승인 같은 재판단)
  upsert(rec) {
    const list = this.all().slice();
    const i = list.findIndex(c => rec.subId && c.subId === rec.subId);
    if (i >= 0) list[i] = { ...list[i], ...rec, decidedAt: Date.now() };
    else list.push({ id: 'c' + Date.now() + Math.floor(Math.random() * 1000), decidedAt: Date.now(), ...rec });
    this._save(list);
  },
  importMany(recs) {
    const list = this.all().slice();
    let added = 0;
    recs.forEach(r => {
      if (!r || !r.kind || !DECISIONS.includes(r.decision) || !AD_TYPES[r.kind]) return;
      if (list.some(c => c.id === r.id)) return;
      list.push(r); added++;
    });
    this._save(list);
    return added;
  },
  removeSamples() { this._save(this.all().filter(c => !c.sample)); },
  clear() { this._save([]); },
};

/* =====================================================
   통계 모델: 다항 로지스틱 회귀 (softmax)
   ===================================================== */
function standardize(X) {
  const F = X[0].length;
  const mean = Array(F).fill(0), sd = Array(F).fill(0);
  X.forEach(x => x.forEach((v, j) => { mean[j] += v / X.length; }));
  X.forEach(x => x.forEach((v, j) => { sd[j] += (v - mean[j]) ** 2 / X.length; }));
  for (let j = 0; j < F; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  return { mean, sd, apply: x => x.map((v, j) => (v - mean[j]) / sd[j]) };
}

function softmax(z) {
  const m = Math.max(...z);
  const e = z.map(v => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / s);
}

function trainLogistic(X, y, opt = {}) {
  const epochs = opt.epochs || 300, lr = opt.lr || 0.3, l2 = opt.l2 || 0.02;
  const K = DECISIONS.length, n = X.length;
  const sc = standardize(X);
  const Z = X.map(sc.apply);
  const F = Z[0].length;
  const W = Array.from({ length: K }, () => Array(F + 1).fill(0));   // 마지막 칸 = 절편
  for (let ep = 0; ep < epochs; ep++) {
    const G = Array.from({ length: K }, () => Array(F + 1).fill(0));
    for (let i = 0; i < n; i++) {
      const p = softmax(W.map(w => w[F] + Z[i].reduce((s, v, j) => s + w[j] * v, 0)));
      for (let k = 0; k < K; k++) {
        const g = p[k] - (y[i] === k ? 1 : 0);
        for (let j = 0; j < F; j++) G[k][j] += g * Z[i][j] / n;
        G[k][F] += g / n;
      }
    }
    for (let k = 0; k < K; k++) for (let j = 0; j <= F; j++) {
      W[k][j] -= lr * (G[k][j] + (j < F ? l2 * W[k][j] : 0));
    }
  }
  return {
    W, sc,
    predict(x) {
      const z = sc.apply(x);
      return softmax(W.map(w => w[F] + z.reduce((s, v, j) => s + w[j] * v, 0)));
    },
    // 예측된 판단 쪽으로 각 재료가 얼마나 밀었는지
    contributions(x, k) {
      const z = sc.apply(x);
      return z.map((v, j) => {
        const avgW = W.reduce((s, w) => s + w[j], 0) / K;
        return (W[k][j] - avgW) * v;
      });
    },
  };
}

// 작은 난수 발생기 (매번 같은 결과가 나오게)
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// 5겹 교차검증: 모델이 "처음 보는 사례"를 얼마나 맞히는지
function crossValidate(X, y) {
  const n = X.length;
  const idx = [...Array(n).keys()];
  const r = rng(42);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const folds = Math.min(5, n);
  let correct = 0;
  for (let f = 0; f < folds; f++) {
    const test = idx.filter((_, i) => i % folds === f);
    const train = idx.filter((_, i) => i % folds !== f);
    if (new Set(train.map(i => y[i])).size < 2) continue;
    const m = trainLogistic(train.map(i => X[i]), train.map(i => y[i]), { epochs: 200 });
    test.forEach(i => { const p = m.predict(X[i]); if (p.indexOf(Math.max(...p)) === y[i]) correct++; });
  }
  return correct / n;
}

/* =====================================================
   보조 모델 (사례 종류별로 학습하고, 사례가 바뀌면 다시 학습)
   ===================================================== */
const MIN_CASES = 10;   // 이보다 적으면 확률은 안 보여주고 비슷한 사례만 보여줘요
const _models = {};

function caseVector(c) {
  return featureVector(c.kind, c.values, c.building, c.photoTags);
}

function getModel(kind) {
  const m = _models[kind];
  if (m && m.version === CaseBook.version) return m;
  const cases = CaseBook.ofKind(kind);
  const X = cases.map(caseVector);
  const y = cases.map(c => DECISIONS.indexOf(c.decision));
  const counts = DECISIONS.map((_, k) => y.filter(v => v === k).length);
  const ready = cases.length >= MIN_CASES && counts.filter(c => c > 0).length >= 2;
  const model = { version: CaseBook.version, kind, cases, X, y, counts, ready };
  if (ready) {
    model.lr = trainLogistic(X, y);
    model.cv = crossValidate(X, y);
    model.baseline = Math.max(...counts) / cases.length;   // 가장 흔한 판단만 찍었을 때 정확도
    model.sc = model.lr.sc;
  } else if (cases.length) {
    model.sc = standardize(X);
  }
  _models[kind] = model;
  return model;
}

function confidenceLabel(m) {
  if (!m.ready) return { text: `사례가 부족해요 (${m.cases.length}건 / 최소 ${MIN_CASES}건)`, cls: 'low' };
  const gain = m.cv - m.baseline;
  if (m.cases.length >= 100 && gain > 0.15) return { text: '높음', cls: 'high' };
  if (m.cases.length >= 30 && gain > 0.05) return { text: '보통', cls: 'mid' };
  return { text: '낮음', cls: 'low' };
}

// 새 제출 하나에 대한 보조 의견
function assistFor(sub, photoTags) {
  const b = getBuilding(sub.buildingId);
  const m = getModel(sub.kind);
  const x = featureVector(sub.kind, sub.values, b, photoTags);
  const names = featureNames(sub.kind);
  const out = { model: m, conf: confidenceLabel(m), similar: [], probs: null, guess: null, factors: [] };

  // ① 비슷한 과거 사례 (자기 자신 제외)
  if (m.cases.length) {
    const z = m.sc.apply(x);
    out.similar = m.cases
      .map((c, i) => ({ c, d: Math.sqrt(m.sc.apply(m.X[i]).reduce((s, v, j) => s + (v - z[j]) ** 2, 0)) }))
      .filter(o => o.c.subId !== sub.id)
      .sort((a, b2) => a.d - b2.d)
      .slice(0, 3);
  }
  // ② 가능성 ③ 이유
  if (m.ready) {
    const p = m.lr.predict(x);
    const k = p.indexOf(Math.max(...p));
    out.probs = p;
    out.guess = DECISIONS[k];
    const contrib = m.lr.contributions(x, k);
    out.factors = contrib
      .map((v, j) => ({ name: names[j], value: x[j], push: v, high: x[j] > m.lr.sc.mean[j] }))
      .filter(f => f.push > 0.05)
      .sort((a, b2) => b2.push - a.push)
      .slice(0, 3);
  }
  return out;
}

/* ---------- 모델 현황용: 판단에 영향이 큰 재료 ---------- */
function globalImportance(kind) {
  const m = getModel(kind);
  if (!m.ready) return [];
  const names = featureNames(kind);
  const W = m.lr.W, a = DECISIONS.indexOf('approve'), r = DECISIONS.indexOf('reject');
  return names
    .map((name, j) => ({ name, w: W[r][j] - W[a][j] }))   // + 이면 반려 쪽, - 이면 승인 쪽
    .sort((p, q) => Math.abs(q.w) - Math.abs(p.w))
    .slice(0, 6);
}

// 보조 의견과 실제 판단이 같았던 비율을 10건씩 묶어서 (점점 좋아지는지 보기)
function agreementCurve() {
  const list = CaseBook.all().filter(c => c.assistGuess).sort((a, b) => a.decidedAt - b.decidedAt);
  const chunks = [];
  for (let i = 0; i < list.length; i += 10) {
    const part = list.slice(i, i + 10);
    chunks.push({ from: i + 1, to: i + part.length, rate: part.filter(c => c.assistGuess === c.decision).length / part.length });
  }
  return chunks;
}

/* =====================================================
   내보내기 / 불러오기 (기기가 달라도 사례를 모을 수 있게)
   ===================================================== */
function downloadFile(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportJSON() {
  downloadFile(`heyseongsu_판단기록_${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(CaseBook.all(), null, 2), 'application/json');
}

// 엑셀·R·파이썬 분석용 표 (종류마다 재료 칸이 달라서 종류별 파일)
function exportCSV(kind) {
  const names = featureNames(kind);
  const q = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const head = ['id', '가상사례', '판단시각', '건물', '건물높이m', '벽면면적㎡',
    ...AD_TYPES[kind].fields.map(f => f.label), ...names, '법기준_진단', '담당자_판단', '판단이유', '메모', '보조모델_추천'];
  const rows = CaseBook.ofKind(kind).map(c => {
    const b = c.building;
    return [c.id, c.sample ? 'Y' : 'N', new Date(c.decidedAt).toISOString(), c.buildingName, b.height, b.wallArea,
      ...AD_TYPES[kind].fields.map(f => c.values[f.key]),
      ...caseVector(c).map(v => Math.round(v * 1000) / 1000),
      c.diagnosis, DECISION_LABEL[c.decision],
      (c.reasons || []).map(r => (REASONS.find(x => x[0] === r) || [, r])[1]).join('/'),
      c.note, c.assistGuess ? DECISION_LABEL[c.assistGuess] : ''];
  });
  const csv = '﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\n');   // ﻿: 엑셀 한글 깨짐 방지
  downloadFile(`heyseongsu_${AD_TYPES[kind].name}_판단기록.csv`, csv, 'text/csv');
}

/* =====================================================
   시연용 가상 사례 만들기
   ⚠️ 진짜 구청 판단이 아니에요! "가상 사례"로 표시되고 언제든 지울 수 있어요.
   가상의 담당자는 이렇게 판단한다고 정했어요:
     - 크게 넘거나(1.2배 초과) 보행 방해 · 전기 사용 → 반려
     - 살짝 넘으면 → 보류 (단, 경관과 잘 어울리면 승인할 때도 있음)
     - 글씨·색이 과하면 → 보류
     - 확실하지 않은 항목 → 대부분 보류
     - 나머지 → 승인 (가끔 사람마다 다르게 보류)
   ===================================================== */
function makeSampleCases(count = 60) {
  const r = rng(2026);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const between = (a, b, step = 1) => Math.round((a + r() * (b - a)) / step) * step;
  const out = [];

  for (let i = 0; i < count * 2; i++) {
    const kind = i % 2 ? 'banner' : 'sign';
    const b = pick(BUILDINGS);
    let v;
    if (kind === 'sign') {
      v = {
        height: between(70, 140, 5), width: between(30, 65, 5), depth: between(30, 70, 5),
        electric: r() < 0.08 ? '예' : '아니오', count: r() < 0.15 ? 2 : 1, distance: between(20, 120, 10),
        walkway: r() < 0.08 ? '예' : r() < 0.1 ? '잘 모르겠어요' : '아니오', selfAd: r() < 0.08 ? '아니오' : '예',
      };
    } else {
      const h = between(0.6, 2.2, 0.1);
      v = {
        width: Math.round(h * between(1.2, 2.4, 0.1) * 10) / 10, height: h, bottom: between(3.5, 7, 0.5),
        days: pick([15, 30, 90, 180, 365, 365, 400]), selfAd: r() < 0.08 ? '아니오' : '예',
        consent: r() < 0.12 ? '잘 모르겠어요' : r() < 0.06 ? '아니오' : '예',
      };
    }
    const tags = PHOTO_TAGS.map(t => t[0]).filter(t => r() < (t === 'harmony' ? 0.25 : 0.1));
    const items = AD_TYPES[kind].checks(v, b);
    const bad = items.filter(x => x.state === 'bad');
    const unk = items.filter(x => x.state === 'unknown');
    const fv = featureVector(kind, v, b, tags).slice(0, FEATURES[kind].length);
    const worst = Math.max(...fv.filter(x => x > 0 && x <= 3));

    let decision, reasons = [];
    if (yes(v.walkway) || yes(v.electric) || tags.includes('block')) { decision = 'reject'; reasons = ['walk']; }
    else if (bad.length && worst > 1.2) { decision = 'reject'; reasons = ['size']; }
    else if (bad.length) { decision = tags.includes('harmony') && r() < 0.6 ? 'approve' : 'hold'; reasons = decision === 'hold' ? ['size'] : []; }
    else if (tags.includes('loud') || tags.includes('clutter')) { decision = 'hold'; reasons = ['design']; }
    else if (unk.length) { decision = r() < 0.7 ? 'hold' : 'approve'; reasons = decision === 'hold' ? ['docs'] : []; }
    else { decision = r() < 0.1 ? 'hold' : 'approve'; reasons = decision === 'hold' ? ['etc'] : []; }
    if (tags.includes('mismatch') && decision === 'approve') { decision = 'hold'; reasons = ['mismatch']; }

    out.push({
      id: 'sample-' + i, sample: true, kind, buildingId: b.id, buildingName: b.name,
      building: { height: b.height, wallArea: b.wallArea }, values: v, photoTags: tags,
      diagnosis: bad.length ? 'bad' : unk.length ? 'check' : 'ok',
      decision, reasons, note: '가상 사례', decidedAt: Date.now() - (count * 2 - i) * 3600e3,
    });
  }
  return out;
}

// 가상 사례를 "순서대로 판단해 나간 것처럼" 넣어요.
// 각 사례를 판단하기 직전까지의 사례로 학습한 모델의 추천을 같이 기록해서,
// 모델 현황 화면에서 "사례가 쌓일수록 추천이 맞아지는 모습"을 볼 수 있어요.
function loadSampleCases() {
  const samples = makeSampleCases();
  const done = CaseBook.all().filter(c => !c.sample);
  const byKind = { sign: [], banner: [] };
  let model = { sign: null, banner: null };
  samples.forEach((c, i) => {
    const prev = byKind[c.kind];
    if (prev.length >= MIN_CASES && prev.length % 5 === 0) {
      const y = prev.map(p => DECISIONS.indexOf(p.decision));
      if (new Set(y).size >= 2) model[c.kind] = trainLogistic(prev.map(caseVector), y, { epochs: 150 });
    }
    if (model[c.kind]) {
      const p = model[c.kind].predict(caseVector(c));
      c.assistGuess = DECISIONS[p.indexOf(Math.max(...p))];
    }
    prev.push(c);
  });
  CaseBook._save([...done, ...samples]);
}
