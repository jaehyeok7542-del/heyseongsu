/* =====================================================
   data.js — "데이터 창고"
   1) 건물 목록 (지도에 찍히는 핀)
   2) 제출 내역 저장소 (광고주가 낸 것을 구청이 봐요)

   지금은 '이 기기(브라우저) 안'에 저장해요 (localStorage).
   그래서 같은 폰/노트북에서 광고주 → 구청 순서로 눌러보면 연결돼 보여요.
   나중에 진짜 서버를 붙이면 Store 안의 함수 내용만 바꾸면 돼요.
   ===================================================== */

// ★ 아래 건물 정보는 "샘플"이에요. 현장조사 후 실제 값으로 바꿔주세요!
//   x, y : 지도 그림 위의 위치(%)    height : 건물 높이(m)    wallArea : 벽면 면적(㎡)
const BUILDINGS = [
  { id: 'b1', name: '연무장7길 건물 A (샘플)', x: 18, y: 28, height: 12, wallArea: 90 },
  { id: 'b2', name: '연무장7길 건물 B (샘플)', x: 42, y: 20, height: 9,  wallArea: 70 },
  { id: 'b3', name: '연무장7길 건물 C (샘플)', x: 70, y: 32, height: 15, wallArea: 120 },
  { id: 'b4', name: '연무장7길 건물 D (샘플)', x: 28, y: 62, height: 10, wallArea: 80 },
  { id: 'b5', name: '연무장7길 건물 E (샘플)', x: 58, y: 66, height: 8,  wallArea: 60 },
  { id: 'b6', name: '연무장7길 건물 F (샘플)', x: 82, y: 72, height: 18, wallArea: 150 },
];

function getBuilding(id) {
  return BUILDINGS.find(b => b.id === id);
}

const Store = {
  KEY: 'heyseongsu_submissions_v1',

  // 모든 제출 내역 꺼내기 (최신이 위)
  all() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || '[]');
    } catch (e) {
      return [];
    }
  },

  _save(list) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(list));
    } catch (e) {
      alert('저장 공간이 부족해요. (사진이 너무 큰 것 같아요)');
    }
  },

  get(id) {
    return this.all().find(s => s.id === id);
  },

  // 새 제출 만들기
  add(sub) {
    const list = this.all();
    sub.id = 's' + Date.now();
    sub.createdAt = Date.now();
    sub.status = 'received';   // received(접수됨) → checking(확인 중) → approved / held(보류) / rejected
    sub.rejectReason = '';
    sub.excellent = false;     // 우수 광고 선정 여부
    list.unshift(sub);
    this._save(list);
    return sub;
  },

  // 일부 값만 고치기
  update(id, changes) {
    const list = this.all();
    const s = list.find(x => x.id === id);
    if (s) Object.assign(s, changes);
    this._save(list);
  },

  // 데모 다시 시작할 때 (주소 뒤에 #reset 붙이면 실행)
  clear() {
    localStorage.removeItem(this.KEY);
  },
};

// 상태 이름표
const STATUS_LABEL = {
  received: '접수됨',
  checking: '확인 중',
  approved: '승인',
  rejected: '반려',
  held: '보류',
};

// 사진을 작게 줄여서 저장하기 (너무 크면 저장이 안 돼요)
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 640;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.7));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
