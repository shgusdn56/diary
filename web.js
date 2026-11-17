// 웹앱에서만 쓰는 화면: 공유(초대), 내 이름, 로그아웃 — Claude 아티팩트 전용 메뉴는 숨겨요
import {
  doc, getDoc, onSnapshot, updateDoc, setDoc, arrayUnion, arrayRemove, deleteField, FieldPath
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const W = window.__web, { fs, U, SID } = W;
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROLE = { owner: '주인', edit: '함께 쓰기', view: '보기만' };
let space = W.SPACE;
const isOwner = () => space.owner === U.uid;

// ── 아티팩트에서만 되던 메뉴(서식 업데이트 메일, PDF 메일, Claude 예약 알림, 기능 확인)는 감춰요 — 웹앱용은 다음 단계에서 새로
const st = document.createElement('style');
st.textContent = `#mUpd, #mPdf, #mNotiBtn, #mCheck { display: none !important; }
.wrow { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line, #e3e7ee); }
.wrow:last-child { border-bottom: 0; }
.wrow .wm { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.wrow select, .wadd select { font: inherit; font-size: 13px; height: 34px; padding: 0 8px; border-radius: 10px; border: 1px solid var(--k9fb2d4, #c9d3e6); background: transparent; color: inherit; }
.wrow .wx { flex: none; font: inherit; font-size: 13px; height: 34px; padding: 0 12px; border-radius: 17px; border: 1px solid var(--k9fb2d4, #c9d3e6); background: transparent; color: inherit; cursor: pointer; }
.wadd { display: flex; gap: 6px; margin-top: 10px; }
.wadd input { flex: 1 1 auto; min-width: 0; }
.wtag { font-size: 12px; opacity: .75; flex: none; }`;
document.head.appendChild(st);

// ── 새 창(모달) 두 개: 공유, 내 이름
document.body.insertAdjacentHTML('beforeend', `
<div class="modal" id="wShareModal" role="dialog" aria-modal="true"><div class="sheet"><h2>공유</h2>
  <p class="note" id="wShareNote"></p>
  <div id="wMembers"></div>
  <div class="wadd" id="wAdd"><input class="tin" id="wEmail" type="email" placeholder="초대할 Google 메일" autocomplete="off">
    <select id="wRole"><option value="edit">함께 쓰기</option><option value="view">보기만</option></select></div>
  <div class="actions"><button class="ghost" id="wShareNo">닫기</button><button class="go" id="wShareGo">초대</button></div><div class="msg" id="wShareMsg"></div></div></div>
<div class="modal" id="wNameModal" role="dialog" aria-modal="true"><div class="sheet"><h2>내 이름</h2>
  <p class="note">일지에서 '마지막 저장', 수정 기록 등에 보이는 이름이에요.</p>
  <div class="field"><label for="wName">이름</label><input class="tin" id="wName" maxlength="20" autocomplete="off"></div>
  <div class="actions"><button class="ghost" id="wNameNo">닫기</button><button class="go" id="wNameGo">저장</button></div><div class="msg" id="wNameMsg"></div></div></div>`);
const open = (id) => $(id).classList.add('on'), close = (id) => $(id).classList.remove('on');
const closeMenu = () => { const m = $('menu'); if (m) m.classList.remove('on'); document.body.classList.remove('menuon'); const b = $('menuBtn'); if (b) b.setAttribute('aria-expanded', 'false'); };

// ── 공유: 초대한 메일만 일지를 볼 수 있어요(보안 규칙이 서버에서 막아요)
function drawMembers() {
  const roles = space.roles || {}, own = isOwner();
  $('wShareNote').textContent = own ? '초대한 Google 메일만 이 일지를 열 수 있어요. 초대받은 분은 같은 주소로 들어와 Google로 로그인하면 돼요.' : '이 일지를 함께 보는 사람이에요. 초대와 권한은 일지 주인만 바꿀 수 있어요.';
  $('wAdd').hidden = !own; $('wShareGo').hidden = !own;
  const list = (space.members || []).slice().sort((a, b) => (roles[a] === 'owner' ? -1 : roles[b] === 'owner' ? 1 : a.localeCompare(b)));
  $('wMembers').innerHTML = list.map((m) => {
    const r = roles[m] || 'view', me = m === U.email;
    const ctl = r === 'owner' || !own ? `<span class="wtag">${ROLE[r] || r}</span>` :
      `<select data-m="${esc(m)}"><option value="edit"${r === 'edit' ? ' selected' : ''}>함께 쓰기</option><option value="view"${r === 'view' ? ' selected' : ''}>보기만</option></select><button class="wx" data-x="${esc(m)}" type="button">빼기</button>`;
    return `<div class="wrow"><span class="wm">${esc(m)}${me ? ' (나)' : ''}</span>${ctl}</div>`;
  }).join('');
}
const say = (id, t, bad) => { const m = $(id); m.textContent = t || ''; m.classList.toggle('err', !!bad); };
const ref = () => doc(fs, 'spaces', SID);
onSnapshot(ref(), (s) => { if (s.exists()) { space = { id: s.id, ...s.data() }; W.SPACE = space; if ($('wShareModal').classList.contains('on')) drawMembers(); } }, () => {});
$('wMembers').addEventListener('change', async (e) => {
  const m = e.target.dataset.m; if (!m) return;
  try { await updateDoc(ref(), new FieldPath('roles', m), e.target.value); say('wShareMsg', '바꿨어요. 다음에 열 때부터 적용돼요.'); } catch (er) { say('wShareMsg', '바꾸지 못했어요: ' + (er.code || er.message), true); }
});
$('wMembers').addEventListener('click', async (e) => {
  const m = e.target.dataset && e.target.dataset.x; if (!m) return;
  try { await updateDoc(ref(), 'members', arrayRemove(m), new FieldPath('roles', m), deleteField()); say('wShareMsg', `${m} 님을 뺐어요.`); } catch (er) { say('wShareMsg', '빼지 못했어요: ' + (er.code || er.message), true); }
});
$('wShareGo').addEventListener('click', async () => {
  const m = $('wEmail').value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) { say('wShareMsg', 'Google 메일 주소를 정확히 적어 주세요.', true); return; }
  if ((space.members || []).includes(m)) { say('wShareMsg', '이미 초대한 메일이에요.', true); return; }
  try { await updateDoc(ref(), 'members', arrayUnion(m), new FieldPath('roles', m), $('wRole').value); $('wEmail').value = ''; say('wShareMsg', `${m} 님을 초대했어요. 사이트 주소를 보내 주세요: ${location.origin}${location.pathname}`); }
  catch (er) { say('wShareMsg', '초대하지 못했어요: ' + (er.code || er.message), true); }
});
$('wShareNo').addEventListener('click', () => close('wShareModal'));
// 원래 '공유' 단추(Claude 공유·서식 파일)는 새 공유 창으로 바꿔 끼워요
const sh = $('mShare'); if (sh) { const n = sh.cloneNode(true); sh.replaceWith(n); n.addEventListener('click', () => { closeMenu(); say('wShareMsg', ''); drawMembers(); open('wShareModal'); }); }

// ── 내 이름
$('wNameNo').addEventListener('click', () => close('wNameModal'));
$('wNameGo').addEventListener('click', async () => {
  const n = $('wName').value.trim(); if (!n) { say('wNameMsg', '이름을 적어 주세요.', true); return; }
  try { await setDoc(doc(fs, `spaces/${SID}/profiles/${U.uid}`), { name: n, email: U.email, set: true }, { merge: true }); W.profCache[U.uid] = { name: n, email: U.email }; say('wNameMsg', '저장했어요.'); setTimeout(() => close('wNameModal'), 600); }
  catch (er) { say('wNameMsg', '저장하지 못했어요: ' + (er.code || er.message), true); }
});

// ── 메뉴 맨 아래: 내 이름, 로그아웃
const menu = $('menu'), anchor = $('mCatAdd');
if (menu && anchor) {
  anchor.insertAdjacentHTML('beforebegin', `<div id="wAcct" style="margin-top:8px;border-top:1px solid var(--line,#e3e7ee);padding-top:6px">
    <button class="mrowbtn" id="wNameBtn" type="button"><span>내 이름</span><span class="mval" id="wNameVal"></span><span class="chev">›</span></button>
    <button class="mrowbtn" id="wImpBtn" type="button"${isOwner() ? '' : ' hidden'}><span>옮기기 파일 가져오기</span><span class="chev">›</span></button>
    <button class="mrowbtn" id="wOutBtn" type="button"><span>로그아웃</span><span class="mval">${esc(U.email)}</span><span class="chev">›</span></button></div>`);
  const showName = () => { const p = W.profCache[U.uid]; $('wNameVal').textContent = (p && p.name) || U.displayName || ''; };
  showName();
  $('wNameBtn').addEventListener('click', () => { closeMenu(); const p = W.profCache[U.uid]; $('wName').value = (p && p.name) || U.displayName || ''; say('wNameMsg', ''); open('wNameModal'); setTimeout(showName, 1500); });
  $('wOutBtn').addEventListener('click', () => { closeMenu(); window.__logout(); });
}

// ── 옮기기 파일 가져오기: Claude 일지에서 꺼낸 내용(날짜별 기록·쪽지·사진·설정·수정 기록·나만 보는 일지)을 이 일지에 넣어요
document.body.insertAdjacentHTML('beforeend', `<input type="file" id="wImpFile" accept=".json,application/json" hidden>
<div class="modal" id="wImpModal" role="dialog" aria-modal="true"><div class="sheet"><h2>옮기기 파일 가져오기</h2>
  <p class="note" id="wImpNote">Claude 일지에서 꺼낸 옮기기 파일(.json)을 골라 주세요. 같은 날짜의 내용은 파일 내용으로 바뀌어요.</p>
  <div class="actions"><button class="ghost" id="wImpNo">닫기</button><button class="go" id="wImpPick">파일 고르기</button></div><div class="msg" id="wImpMsg"></div></div></div>`);
$('wImpNo').addEventListener('click', () => close('wImpModal'));
$('wImpPick').addEventListener('click', () => $('wImpFile').click());
if ($('wImpBtn')) $('wImpBtn').addEventListener('click', () => { closeMenu(); say('wImpMsg', ''); open('wImpModal'); });
$('wImpFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  say('wImpMsg', '파일을 읽는 중…');
  let M; try { M = JSON.parse(await f.text()); } catch (er) { say('wImpMsg', '옮기기 파일을 읽지 못했어요.', true); return; }
  if (!M || M.kind !== 'diary-migration' || !Array.isArray(M.docs)) { say('wImpMsg', '일지 옮기기 파일이 아니에요.', true); return; }
  if (!isOwner()) { say('wImpMsg', '일지 주인만 가져올 수 있어요.', true); return; }
  const OLD = M.oldOwnerId, NEW = U.uid;
  const swap = (v) => { if (typeof v === 'string') return v === OLD ? NEW : v; if (Array.isArray(v)) return v.map(swap); if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k === OLD ? NEW : k] = swap(x); return o; } return v; };
  const target = (p) => {
    const seg = p.split('/').map((x) => (x === OLD ? NEW : x));
    if (seg[0] === 'data' && seg[1] === 'users') { if (seg[2] !== NEW) return null; return `private/${NEW}/s_${SID}/${seg.slice(3).join('/')}`; }
    return `spaces/${SID}/${seg.join('/')}`;
  };
  const jobs = M.docs.map(([p, d]) => [target(p), swap(d)]).filter(([p]) => p && p.split('/').length % 2 === 0);
  let done = 0, fail = 0;
  $('wImpPick').disabled = true;
  for (const [p, d] of jobs) {
    try { await setDoc(doc(fs, p), d); } catch (er) { fail++; console.warn('[import]', p, er && er.code); }
    done++; if (done % 5 === 0 || done === jobs.length) say('wImpMsg', `옮기는 중… ${done} / ${jobs.length}`);
  }
  if (M.space && typeof M.space.memoLabel === 'string') { try { await updateDoc(doc(fs, 'spaces', SID), 'memoLabel', M.space.memoLabel.slice(0, 12)); } catch (er) {} }
  for (const [id, pr] of Object.entries(M.profiles || {})) {
    const key = id === OLD ? NEW : id;
    try { const cur = await getDoc(doc(fs, `spaces/${SID}/profiles/${key}`)); if (!(cur.exists() && cur.data().set)) await setDoc(doc(fs, `spaces/${SID}/profiles/${key}`), { name: pr.name || '', set: true, ...(key === NEW ? { email: U.email } : {}) }, { merge: true }); } catch (er) {}
  }
  $('wImpPick').disabled = false;
  say('wImpMsg', fail ? `${jobs.length - fail}개를 옮겼고 ${fail}개는 옮기지 못했어요. 같은 파일을 한 번 더 가져와 주세요.` : `${jobs.length}개를 모두 옮겼어요. 새로고침하면 옮긴 내용으로 열려요.`, !!fail);
});
