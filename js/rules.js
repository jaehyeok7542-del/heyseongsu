/* =====================================================
   rules.js — "기준표" + "진단하는 심판"
   광고 종류마다
     fields : 광고주가 입력할 칸들
     checks : 하나씩 확인할 규칙들
   을 적어둬요. 새 광고 종류(예: 돌출간판)를 추가하려면 AD_TYPES에 한 덩어리만 더 쓰면 돼요!

   ⚠️ verify: true 인 규칙은 "초안"이에요.
      서울시 옥외광고물 조례 / 담당자 답변으로 꼭 확인하고 숫자를 고쳐주세요.
      숫자는 모두 'limit' 같은 이름으로 위쪽에 모아뒀어요.
   ===================================================== */

const AD_TYPES = {
  /* ---------------- 입간판 ---------------- */
  sign: {
    name: '입간판',
    icon: '🪧',
    where: '건물 앞 바닥',
    fields: [
      { key: 'height',   label: '입간판 높이',     type: 'number', unit: 'cm' },
      { key: 'width',    label: '가로',            type: 'number', unit: 'cm' },
      { key: 'depth',    label: '세로',            type: 'number', unit: 'cm' },
      // 면적은 칸이 아니라 자동 계산 (가로×세로).  TODO: 앞면 면적 기준(가로×높이)인지 담당자에게 확인
      { key: 'electric', label: '전기·조명을 쓰나요?', type: 'choice', options: ['예', '아니오'] },
      { key: 'count',    label: '입간판 개수',     type: 'number', unit: '개' },
      { key: 'distance', label: '건물 벽면에서 떨어진 거리', type: 'number', unit: 'cm' },
      { key: 'walkway',  label: '보행자 통로 위에 놓이나요?', type: 'choice', options: ['예', '아니오', '잘 모르겠어요'] },
      { key: 'selfAd',   label: '우리 가게 광고만 담았나요?', type: 'choice', options: ['예', '아니오'] },
    ],
    // 화면에 보여줄 "자동 계산" 값
    derived(v) {
      const area = (v.width * v.depth) / 10000;            // cm×cm → ㎡
      return { area, totalArea: area * v.count };
    },
    checks(v, b) {
      const d = this.derived(v);
      return [
        num('높이', v.height, 'cm', '이하', 120, true),
        num('한 면의 면적', round2(d.area), '㎡', '이하', 0.6, true),
        num('전체 면적(개수 포함)', round2(d.totalArea), '㎡', '이하', 1.2, true),
        yesno('전기·조명 사용', v.electric, '아니오', '사용 안 함', true),
        num('건물 벽면과의 거리', v.distance, 'cm', '이하', 100, true),
        yesno('보행자 통로 위에 놓임', v.walkway, '아니오', '놓이면 안 됨', true),
        yesno('자기 가게 광고만 담음', v.selfAd, '예', '자사광고만 가능', true),
      ];
    },
  },

  /* ---------------- 현수막 ---------------- */
  banner: {
    name: '현수막',
    icon: '🎏',
    where: '건물 벽면',
    fields: [
      { key: 'width',    label: '가로',            type: 'number', unit: 'm' },
      { key: 'height',   label: '세로',            type: 'number', unit: 'm' },
      { key: 'bottom',   label: '현수막 아랫부분의 땅에서 높이', type: 'number', unit: 'm' },
      { key: 'days',     label: '표시 기간',       type: 'number', unit: '일' },
      { key: 'selfAd',   label: '자기 가게 광고·행사 내용인가요?', type: 'choice', options: ['예', '아니오'] },
      { key: 'consent',  label: '건물주 승낙을 받았나요?', type: 'choice', options: ['예', '아니오', '잘 모르겠어요'] },
    ],
    derived(v) {
      return { area: v.width * v.height, top: v.bottom + v.height };
    },
    checks(v, b) {
      const d = this.derived(v);
      return [
        num('가로 길이(세로의 2배 이하)', v.width, 'm', '이하', v.height * 2, true),
        num('면적(벽면의 1/5 이하)', round2(d.area), '㎡', '이하', round2(b.wallArea / 5), true),
        num('세로 길이(건물 높이의 1/2 이하)', v.height, 'm', '이하', round2(b.height / 2), true),
        num('아랫부분 높이', v.bottom, 'm', '이상', 4, true),
        num('윗부분 높이(건물 높이의 3/4 이하)', round2(d.top), 'm', '이하', round2(b.height * 0.75), true),
        num('표시 기간(벽면 1년)', v.days, '일', '이하', 365, true),
        yesno('자기 가게 광고·행사 내용', v.selfAd, '예', '자사광고·행사만 가능', true),
        yesno('건물주 승낙', v.consent, '예', '승낙 필요', true),
      ];
    },
  },
};

/* ---------- 규칙 한 줄을 만드는 도우미 함수들 ---------- */

function round2(n) { return Math.round(n * 100) / 100; }

// 숫자 규칙: mode가 '이하'면 value ≤ limit 이어야 적합, '이상'이면 value ≥ limit
function num(label, value, unit, mode, limit, verify) {
  let state;
  if (value === undefined || value === null || isNaN(value)) state = 'unknown';
  else if (mode === '이하') state = value <= limit ? 'ok' : 'bad';
  else state = value >= limit ? 'ok' : 'bad';
  const word = state === 'ok' ? '' : mode === '이하' ? ' → 초과' : ' → 부족';
  return {
    label, state, verify,
    text: `내 값 ${value}${unit}, 기준 ${limit}${unit} ${mode}${word}`,
  };
}

// 예/아니오 규칙: 정답(want)과 같으면 적합, '잘 모르겠어요'면 확인 필요
function yesno(label, value, want, note, verify) {
  let state;
  if (!value || value === '잘 모르겠어요') state = 'unknown';
  else state = value === want ? 'ok' : 'bad';
  return {
    label, state, verify,
    text: state === 'unknown' ? `내 답: ${value || '입력 안 함'} → 구청 확인 필요` : `내 답: ${value} (${note})`,
  };
}

/* ---------- 진단하기 ----------
   결과: { verdict: 'ok'|'bad'|'check', items: [...] }
   - bad(부적합)가 하나라도 있으면 → 부적합
   - 없고 unknown(확인 필요)이 있으면 → 확인 필요
   - 모두 ok면 → 적합
   문제 있는 항목이 위로 오도록 정렬해요. */
function diagnose(kind, values, building) {
  const items = AD_TYPES[kind].checks(values, building);
  const order = { bad: 0, unknown: 1, ok: 2 };
  items.sort((a, b) => order[a.state] - order[b.state]);
  let verdict = 'ok';
  if (items.some(i => i.state === 'bad')) verdict = 'bad';
  else if (items.some(i => i.state === 'unknown')) verdict = 'check';
  return { verdict, items };
}

const VERDICT = {
  ok:    { label: '적합',      icon: '✅', cls: 'ok' },
  bad:   { label: '부적합',    icon: '⛔', cls: 'bad' },
  check: { label: '확인 필요', icon: '⚠️', cls: 'check' },
};

/* ---------- AI 설명 (지금은 "가짜 AI") ----------
   나중에 이 함수 안에서 Claude API(서버 경유)를 부르도록 바꿔요.
   바꿀 때도 '진단 결과'는 위의 규칙표가 정하고, AI는 설명만 해요. */
function aiExplain(kind, result, forOfficial) {
  const name = AD_TYPES[kind].name;
  const bad = result.items.filter(i => i.state === 'bad');
  const unk = result.items.filter(i => i.state === 'unknown');
  if (forOfficial) {
    if (bad.length) return `기준을 넘는 항목이 ${bad.length}개 있어요: ${bad.map(i => i.label).join(', ')}.`;
    if (unk.length) return `광고주가 확실하지 않다고 답한 항목이 있어요: ${unk.map(i => i.label).join(', ')}. 현장 확인이 필요해 보여요.`;
    return `입력한 값은 모두 기준 안에 들어와요. 사진과 입력 내용이 같은지만 확인해 주세요.`;
  }
  if (bad.length) return `${name}이(가) 기준을 넘는 곳이 있어요. 위의 빨간 항목을 기준 안으로 고쳐서 다시 진단해 보세요.`;
  if (unk.length) return `확실하지 않은 항목이 있어요. 구청에 확인을 요청하면 담당자가 알려줘요.`;
  return `입력한 값이 모두 기준 안에 들어와요. 구청에 제출해 보세요!`;
}
