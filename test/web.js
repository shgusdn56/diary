// 웹앱에서만 쓰는 화면: 공유(초대), 내 이름, 로그아웃 — Claude 아티팩트 전용 메뉴는 숨겨요
import {
  doc, getDoc, onSnapshot, updateDoc, setDoc, addDoc, deleteDoc, collection, arrayUnion, arrayRemove, deleteField, FieldPath, query, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const W = window.__web, { fs, U, SID } = W;
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROLE = { owner: '주인', edit: '함께 쓰기', view: '보기만' };
let space = W.SPACE;
const isOwner = () => space.owner === U.uid;

// ── 아티팩트에서만 되던 메뉴(서식 업데이트 메일, 기능 확인)는 감춰요 — 휴대폰 알림·PDF 백업 메일은 웹앱용으로 바꿔 끼워요(아래)
const st = document.createElement('style');
st.textContent = `#mCheck { display: none !important; }
.wrow { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line, #e3e7ee); }
.wrow:last-child { border-bottom: 0; }
.wrow .wm { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.wrow select, .wadd select { font: inherit; font-size: 13px; height: 34px; padding: 0 8px; border-radius: 10px; border: 1px solid var(--k9fb2d4, #c9d3e6); background: transparent; color: inherit; }
.wrow .wx { flex: none; font: inherit; font-size: 13px; height: 34px; padding: 0 12px; border-radius: 17px; border: 1px solid var(--k9fb2d4, #c9d3e6); background: transparent; color: inherit; cursor: pointer; }
.wadd { display: flex; gap: 6px; margin-top: 10px; }
.wadd input { flex: 1 1 auto; min-width: 0; }
.wtag { font-size: 12px; opacity: .75; flex: none; }
.modal .sheet:has(> .wclose) { position: relative; }
.modal .sheet > .wclose { position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; border-radius: 50%; border: 0; background: transparent; color: var(--mute, #6b7385); font-size: 18px; line-height: 34px; padding: 0; cursor: pointer; }
.modal .sheet > .wclose:active { background: var(--line, #e3e7ee); }
.modal .sheet:has(> .wclose) > h2 { padding-right: 36px; }
.wst { font-size: 13px; line-height: 1.5; margin-top: 8px; padding: 6px 10px; border-radius: 10px; background: var(--blue-l, #e8f0fe); color: var(--blue-d, #174ea6); }
.wst:empty { display: none; } .wst.bad { background: #fde3e3; color: #b3261e; }`;
document.head.appendChild(st);

// ── 새 창(모달) 두 개: 공유, 내 이름
document.body.insertAdjacentHTML('beforeend', `
<div class="modal" id="wShareModal" role="dialog" aria-modal="true"><div class="sheet"><button class="wclose" type="button" aria-label="닫기">✕</button><h2>공유</h2>
  <p class="note" id="wShareNote"></p>
  <div id="wMembers"></div>
  <div class="wadd" id="wAdd"><input class="tin" id="wEmail" type="email" placeholder="초대할 Google 메일" autocomplete="off">
    <select id="wRole"><option value="edit">함께 쓰기</option><option value="view">보기만</option></select></div>
  <div class="actions"><button class="ghost" id="wShareNo">닫기</button><button class="go" id="wShareGo">초대</button></div><div class="msg" id="wShareMsg"></div></div></div>
<div class="modal" id="wNameModal" role="dialog" aria-modal="true"><div class="sheet"><button class="wclose" type="button" aria-label="닫기">✕</button><h2>내 이름</h2>
  <p class="note">일지에서 '마지막 저장', 수정 기록 등에 보이는 이름이에요.</p>
  <div class="field"><label for="wName">이름</label><input class="tin" id="wName" maxlength="20" autocomplete="off"></div>
  <div class="actions"><button class="ghost" id="wNameNo">닫기</button><button class="go" id="wNameGo">저장</button></div><div class="msg" id="wNameMsg"></div></div></div>`);
const open = (id) => $(id).classList.add('on'), close = (id) => $(id).classList.remove('on');
const closeMenu = () => { const m = $('menu'); if (m) m.classList.remove('on'); document.body.classList.remove('menuon'); const b = $('menuBtn'); if (b) b.setAttribute('aria-expanded', 'false'); };

// ── 공유: 초대한 메일만 일지를 볼 수 있어요(보안 규칙이 서버에서 막아요)
function drawMembers() {
  const roles = space.roles || {}, own = isOwner();
  $('wShareNote').textContent = own ? '초대한 Google 메일만 이 일지를 열 수 있어요. 초대하면 그 메일로 들어오는 주소와 방법이 담긴 초대 메일이 가요(Google 계정으로 로그인해요).' : '이 일지를 함께 보는 사람이에요. 초대와 권한은 일지 주인만 바꿀 수 있어요.';
  $('wAdd').hidden = !own; $('wShareGo').hidden = !own;
  const list = (space.members || []).slice().sort((a, b) => (roles[a] === 'owner' ? -1 : roles[b] === 'owner' ? 1 : a.localeCompare(b)));
  $('wMembers').innerHTML = list.map((m) => {
    const r = roles[m] || 'view', me = m === U.email;
    const ctl = r === 'owner' || !own ? `<span class="wtag">${ROLE[r] || r}</span>` :
      `<select data-m="${esc(m)}"><option value="edit"${r === 'edit' ? ' selected' : ''}>함께 쓰기</option><option value="view"${r === 'view' ? ' selected' : ''}>보기만</option></select><button class="wx" data-mail="${esc(m)}" type="button" title="초대 메일 다시 보내기">메일</button><button class="wx" data-x="${esc(m)}" type="button">빼기</button>`;
    return `<div class="wrow"><span class="wm">${esc(m)}${me ? ' (나)' : ''}</span>${ctl}</div>`;
  }).join('');
}
// 알림·PDF 창에서는 결과 글을 누른 단추 바로 옆(그 칸 안)에 보여 줘요 — 맨 아래까지 내려 보지 않아도 되게
let lastBtn = null;
const say = (id, t, bad) => {
  const m = $(id); m.textContent = t || ''; m.classList.toggle('err', !!bad);
  const md = m.closest('#wNotiModal, #wPdfModal'); if (!md) return;
  m.hidden = true;
  md.querySelectorAll('.wst').forEach((x) => { x.textContent = ''; });
  const b = lastBtn && md.contains(lastBtn) ? lastBtn : null; if (!b || !t) return;
  const box = b.closest('.aubox'); if (!box) { m.hidden = false; return; }
  let w = box.querySelector('.wst'); if (!w) { w = document.createElement('div'); w.className = 'wst'; box.appendChild(w); }
  w.textContent = t; w.classList.toggle('bad', !!bad);
};
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('#wNotiModal button, #wPdfModal button'); if (b) lastBtn = b; }, true);
const ref = () => doc(fs, 'spaces', SID);
onSnapshot(ref(), (s) => { if (s.exists()) { space = { id: s.id, ...s.data() }; W.SPACE = space; if ($('wShareModal').classList.contains('on')) drawMembers(); } }, () => {});
$('wMembers').addEventListener('change', async (e) => {
  const m = e.target.dataset.m; if (!m) return;
  try { await updateDoc(ref(), new FieldPath('roles', m), e.target.value); say('wShareMsg', '바꿨어요. 다음에 열 때부터 적용돼요.'); } catch (er) { say('wShareMsg', '바꾸지 못했어요: ' + (er.code || er.message), true); }
});
$('wMembers').addEventListener('click', async (e) => {
  const mm = e.target.dataset && e.target.dataset.mail; if (mm) { job('invite', { sid: SID, to: mm }, 'wShareMsg'); return; }
  const m = e.target.dataset && e.target.dataset.x; if (!m) return;
  try { await updateDoc(ref(), 'members', arrayRemove(m), new FieldPath('roles', m), deleteField()); say('wShareMsg', `${m} 님을 뺐어요.`); } catch (er) { say('wShareMsg', '빼지 못했어요: ' + (er.code || er.message), true); }
});
$('wShareGo').addEventListener('click', async () => {
  const m = $('wEmail').value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) { say('wShareMsg', 'Google 메일 주소를 정확히 적어 주세요.', true); return; }
  if ((space.members || []).includes(m)) { say('wShareMsg', '이미 초대한 메일이에요.', true); return; }
  try { await updateDoc(ref(), 'members', arrayUnion(m), new FieldPath('roles', m), $('wRole').value); $('wEmail').value = ''; say('wShareMsg', `${m} 님을 초대했어요. 초대 메일을 보내는 중…`); setTimeout(() => job('invite', { sid: SID, to: m }, 'wShareMsg'), 600); } // 명단이 서버에 들어간 뒤 메일
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
<div class="modal" id="wImpModal" role="dialog" aria-modal="true"><div class="sheet"><button class="wclose" type="button" aria-label="닫기">✕</button><h2>옮기기 파일 가져오기</h2>
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
  // 이미 웹앱에 같은 문서가 있으면 더 새것만 남겨요(웹앱에서 고친 날짜를 옛 내용으로 덮지 않게)
  let kept = 0, same = 0;
  for (const [p, d] of jobs) {
    try {
      const cur = await getDoc(doc(fs, p));
      if (cur.exists()) {
        const a = cur.data() || {}, ta = +a.updatedAt || 0, tb = +(d && d.updatedAt) || 0;
        if (JSON.stringify(a) === JSON.stringify(d)) { same++; done++; continue; }
        if (!(tb > ta)) { if (tb === ta) same++; else kept++; done++; continue; }
      }
      await setDoc(doc(fs, p), d);
    } catch (er) { fail++; console.warn('[import]', p, er && er.code); }
    done++; if (done % 5 === 0 || done === jobs.length) say('wImpMsg', `옮기는 중… ${done} / ${jobs.length}`);
  }
  if (M.space && typeof M.space.memoLabel === 'string') { try { await updateDoc(doc(fs, 'spaces', SID), 'memoLabel', M.space.memoLabel.slice(0, 12)); } catch (er) {} }
  for (const [id, pr] of Object.entries(M.profiles || {})) {
    const key = id === OLD ? NEW : id;
    try { const cur = await getDoc(doc(fs, `spaces/${SID}/profiles/${key}`)); if (!(cur.exists() && cur.data().set)) await setDoc(doc(fs, `spaces/${SID}/profiles/${key}`), { name: pr.name || '', set: true, ...(key === NEW ? { email: U.email } : {}) }, { merge: true }); } catch (er) {}
  }
  $('wImpPick').disabled = false;
  say('wImpMsg', (fail ? `${jobs.length - fail - kept - same}개를 옮겼고 ${fail}개는 옮기지 못했어요. 같은 파일을 한 번 더 가져와 주세요.` : `${jobs.length - kept - same}개를 옮겼어요.`) + (kept ? ` 웹앱 쪽이 더 새로운 ${kept}개는 그대로 뒀어요.` : '') + (same ? ` 이미 같은 ${same}개는 건너뛰었어요.` : '') + (fail ? '' : ' 새로고침하면 옮긴 내용으로 열려요.'), !!fail);
});

// ── 휴대폰 알림(4단계): 이 기기에서 알림 받기, 수정 알림, 오늘 일정 알림 — 서버(Cloud Functions)가 보내요
const CREATOR = !!W.creator;
const crTag = () => '<em class="otag">노현우님 전용</em>';
const st2 = document.createElement('style');
st2.textContent = `#wNotiModal .aubox .aur, #wPdfModal .aubox .aur { margin-top: 6px; }
#wNotiModal .aur input[type=time], #wPdfModal .aur input[type=time], #wPdfModal .aur select { font: inherit; font-size: 14px; height: 34px; padding: 0 8px; border-radius: 10px; border: 1px solid var(--k9fb2d4, #c9d3e6); background: transparent; color: inherit; }
#wNotiModal .aur .autest, #wPdfModal .aur .autest { margin-left: 0; }
#wPdfModal .aur input.tin { flex: 1 1 100%; }
#wPdfModal select[hidden] { display: none; }
.wstat { font-size: 12.5px; margin: 4px 0 2px; color: var(--mute, #6b7385); line-height: 1.5; }
.wstat.ok { color: var(--blue, #1f5bc4); font-weight: 600; } .wstat.bad { color: #d93025; }
.wro { font-size: 13.5px; line-height: 1.7; } .wro b { font-weight: 600; }`;
document.head.appendChild(st2);
const sw = (id, label) => `<button class="mrowbtn ausw" id="${id}" type="button" role="switch" aria-label="${label}"><span class="sw"></span></button>`;
const setSw = (id, on) => { const b = $(id); b.classList.toggle('on', !!on); b.setAttribute('aria-checked', String(!!on)); };
document.body.insertAdjacentHTML('beforeend', `
<div class="modal" id="wNotiModal" role="dialog" aria-modal="true"><div class="sheet"><button class="wclose" type="button" aria-label="닫기">✕</button><h2>휴대폰 알림</h2>
  <p class="note">알림은 이 일지를 연 휴대폰·컴퓨터로 와요. 알림을 받을 기기마다 한 번씩 '이 기기에서 알림 받기'를 켜 주세요.</p>
  <div class="aubox"><div class="auh"><b>이 기기에서 알림 받기</b>${sw('wDevSw', '이 기기에서 알림 받기')}</div>
    <p class="wstat" id="wDevNote"></p></div>
  <div class="aubox"><div class="auh"><b>수정 알림</b>${sw('wEditSw', '수정 알림')}</div>
    <p>다른 사람이 일지를 고치면 바로 알려 줘요(고친 사람이 칸을 빠져나갈 때). 내가 고친 건 알리지 않아요.</p>
    <div class="aur"><button type="button" class="autest" id="wEditTest">테스트</button></div></div>
  <div class="aubox"><div class="auh"><b>오늘 일정 알림</b>${sw('wMornSw', '오늘 일정 알림')}</div>
    <p>정한 시각에 그날 일지에 적힌 일정을 알려 줘요(근무·아래 칸은 빼요).</p>
    <div class="aur"><input type="time" id="wMornAt" value="07:20" aria-label="알림 시각"><button type="button" class="go" id="wMornSave">저장</button><button type="button" class="autest" id="wMornTest">테스트</button></div></div>
  <div class="aubox" id="wHolBox" hidden><div class="auh"><b>공휴일 채우기 ${crTag()}</b></div>
    <p>매일 새벽 공휴일 달력(Google '대한민국의 휴일')을 확인해서 올해·내년 공휴일을 모든 일지에 맞춰요. 새로 생긴 임시공휴일은 더하고, 바뀐 이름은 고치고, 빠진 날은 지워요(직접 넣은 날짜는 그대로). 지금 바로 한 번 맞출 수도 있어요.</p>
    <div class="aur"><button type="button" class="autest" id="wHolGo">지금 맞추기</button></div></div>
  <div class="actions"><button class="ghost" id="wNotiNo">닫기</button></div><div class="msg" id="wNotiMsg"></div></div></div>
<div class="modal" id="wPdfModal" role="dialog" aria-modal="true"><div class="sheet"><button class="wclose" type="button" aria-label="닫기">✕</button><h2>PDF 백업 메일</h2>
  <p class="note">이 일지 전체(사진 포함)를 PDF로 만들어 메일로 보내요. 매월은 지난달까지, 매주·매일은 오늘까지 넣어요.</p>
  <div class="aubox" id="wPdfEdit"><div class="auh"><b>사용하기</b>${sw('wPdfSw', 'PDF 백업 메일 사용하기')}</div>
    <div class="aur"><input class="tin" id="wPdfMails" type="text" inputmode="email" placeholder="받는 메일 (여러 명은 쉼표로)" autocomplete="off"></div>
    <div class="aur"><select id="wPdfF" aria-label="주기"><option value="m">매월</option><option value="w">매주</option><option value="d">매일</option></select>
      <select id="wPdfDom" aria-label="날짜">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">${i + 1}일</option>`).join('')}<option value="L">말일</option></select>
      <select id="wPdfDow" aria-label="요일">${[...'일월화수목금토'].map((d, i) => `<option value="${i}">${d}요일</option>`).join('')}</select>
      <input type="time" id="wPdfAt" value="09:00" aria-label="보내는 시각"></div>
    <p class="wstat" id="wPdfLast"></p>
    <div class="aur"><button type="button" class="go" id="wPdfSave">저장</button><button type="button" class="autest" id="wPdfTest" title="지금 바로 한 번 보내 봐요">테스트</button></div></div>
  <div class="aubox" id="wPdfView" hidden><div class="wro" id="wPdfRo"></div></div>
  <div class="aubox" id="wMailBox" hidden><div class="auh"><b>메일 보내는 계정 ${crTag()}</b></div>
    <p>모든 일지의 PDF 메일은 이 Gmail로 보내요. Google 계정 → 보안 → 2단계 인증 → 맨 아래 '앱 비밀번호'에서 만든 16자리를 넣어 주세요. 저장한 비밀번호는 서버만 읽을 수 있어요(화면에서 다시 볼 수 없어요).</p>
    <div class="aur"><input class="tin" id="wMailUser" type="email" placeholder="보내는 Gmail 주소" autocomplete="off"></div>
    <div class="aur"><input class="tin" id="wMailPass" type="password" placeholder="앱 비밀번호 16자리" autocomplete="new-password"></div>
    <p class="wstat" id="wMailInfo"></p>
    <div class="aur"><button type="button" class="go" id="wMailSave">저장</button></div></div>
  <div class="actions"><button class="ghost" id="wPdfNo">닫기</button></div><div class="msg" id="wPdfMsg"></div></div></div>`);
$('wNotiNo').addEventListener('click', () => close('wNotiModal'));
$('wPdfNo').addEventListener('click', () => close('wPdfModal'));
// 원래 메뉴 단추(Claude 예약 작업용)를 새 창으로 바꿔 끼워요 — 같은 id라 메뉴 표시(소유자 표시 등)는 그대로
const swapBtn = (id, fn) => { const o = $(id); if (!o) return; const n = o.cloneNode(true); o.replaceWith(n); n.hidden = false; n.addEventListener('click', () => { closeMenu(); fn(); }); };

// 서버 작업 부탁: jobs에 문서를 만들고, 끝나면 결과 글을 보여 줘요
async function job(kind, extra, msgId) {
  const b0 = lastBtn, sayJ = (id, t, bad) => { const pv = lastBtn; lastBtn = b0; say(id, t, bad); lastBtn = pv; }; // 결과는 처음 누른 단추 옆에
  sayJ(msgId, '서버에 부탁하는 중…');
  try {
    const r = await addDoc(collection(fs, 'jobs'), { kind, by: U.uid, at: Date.now(), ...extra });
    sayJ(msgId, kind === 'pdf' ? 'PDF를 만들어 보내는 중… (1분쯤 걸려요)' : '보내는 중…');
    let un = () => {};
    const t = setTimeout(() => { un(); sayJ(msgId, '서버가 아직 대답하지 않아요. 서버 기능이 아직 켜지지 않았을 수 있어요.', true); }, 180000);
    un = onSnapshot(r, (s) => { const x = s.data(); if (!x || !x.status) return; clearTimeout(t); un(); sayJ(msgId, (x.status === 'done' ? '' : '실패: ') + (x.msg || ''), x.status !== 'done'); }, () => {});
  } catch (er) { sayJ(msgId, '부탁하지 못했어요: ' + (er.code || er.message), true); }
}

// 이 기기 알림: 브라우저 푸시 등록 → private/{나}/devices/{기기}
const DKEY = 'diary.push.' + U.uid;
const devId = () => { try { return localStorage.getItem(DKEY) || ''; } catch (e) { return ''; } };
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let msgMod = null;
async function messaging() {
  if (!msgMod) msgMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');
  if (!(await msgMod.isSupported())) return null;
  return msgMod.getMessaging(W.auth.app);
}
async function hashOf(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].slice(0, 12).map((x) => x.toString(16).padStart(2, '0')).join(''); }
async function registerDevice(ask) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new Error(isIOS && !standalone ? 'IOS' : 'NOSUP');
  if (ask && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') throw new Error(p === 'denied' ? 'DENIED' : 'NOPERM'); }
  if (Notification.permission !== 'granted') throw new Error('NOPERM');
  const m = await messaging(); if (!m) throw new Error(isIOS && !standalone ? 'IOS' : 'NOSUP');
  const reg = await navigator.serviceWorker.ready;
  const token = await msgMod.getToken(m, { serviceWorkerRegistration: reg });
  if (!token) throw new Error('NOTOKEN');
  const id = await hashOf(token), old = devId();
  await setDoc(doc(fs, `private/${U.uid}/devices/${id}`), { token, at: Date.now(), ua: navigator.userAgent.slice(0, 160) });
  if (old && old !== id) deleteDoc(doc(fs, `private/${U.uid}/devices/${old}`)).catch(() => {});
  try { localStorage.setItem(DKEY, id); } catch (e) {}
}
const devErr = (e) => ({
  IOS: 'iPhone·iPad는 Safari에서 공유 버튼 → \'홈 화면에 추가\'를 한 뒤, 홈 화면의 생활일지 아이콘으로 열어야 알림을 받을 수 있어요(iOS 16.4 이상).',
  NOSUP: '이 브라우저는 알림을 지원하지 않아요. 휴대폰은 Chrome(안드로이드)이나 홈 화면에 추가한 앱으로 열어 주세요.',
  DENIED: '알림이 차단돼 있어요. 브라우저(또는 휴대폰 설정)의 사이트 알림에서 이 사이트를 \'허용\'으로 바꿔 주세요.',
  NOPERM: '알림 허용을 눌러야 받을 수 있어요.',
  NOTOKEN: '알림 등록 번호를 받지 못했어요. 잠시 뒤 다시 해 주세요.'
}[e && e.message] || ('알림을 켜지 못했어요: ' + ((e && (e.code || e.message)) || e)));
function drawDev() {
  const on = !!devId() && 'Notification' in window && Notification.permission === 'granted';
  setSw('wDevSw', on);
  const n = $('wDevNote');
  n.className = 'wstat' + (on ? ' ok' : '');
  n.textContent = on ? '이 기기에서 알림을 받고 있어요.' : (isIOS && !standalone) ? devErr({ message: 'IOS' }) : ('Notification' in window && Notification.permission === 'denied') ? devErr({ message: 'DENIED' }) : '켜면 이 기기로 아래 알림이 와요.';
}
$('wDevSw').addEventListener('click', async () => {
  const id = devId();
  if (id && $('wDevSw').classList.contains('on')) {
    try { await deleteDoc(doc(fs, `private/${U.uid}/devices/${id}`)); localStorage.removeItem(DKEY); } catch (e) {}
    drawDev(); say('wNotiMsg', '이 기기 알림을 껐어요.'); return;
  }
  say('wNotiMsg', '알림을 켜는 중…');
  try { await registerDevice(true); drawDev(); say('wNotiMsg', '이 기기에서 알림을 받아요. 아래 \'테스트\'로 확인해 보세요.'); }
  catch (e) { console.warn('[push]', e); drawDev(); const n = $('wDevNote'); n.className = 'wstat bad'; n.textContent = devErr(e); say('wNotiMsg', ''); }
});
// 열 때마다 조용히 등록 번호를 새로 맞춰요(바뀌면 저장)
setTimeout(() => { if (devId() && 'Notification' in window && Notification.permission === 'granted') registerDevice(false).catch(() => {}); }, 4000);

// 수정 알림·오늘 일정 알림 설정: spaces/{id}/notify/{나}
let nset = {};
const nref = () => doc(fs, `spaces/${SID}/notify/${U.uid}`);
onSnapshot(nref(), (s) => { nset = s.exists() ? s.data() : {}; drawN(); }, () => {});
function drawN() {
  setSw('wEditSw', nset.on === true); setSw('wMornSw', nset.mOn === true);
  const at = /^\d\d:\d\d$/.test(nset.mAt || '') ? nset.mAt : /^\d\d:\d\d$/.test(nset.mAtSet || '') ? nset.mAtSet : '';
  if (at && document.activeElement !== $('wMornAt')) $('wMornAt').value = at;
}
const myName = () => { const p = W.profCache[U.uid]; return (p && p.name) || U.displayName || ''; };
async function saveN(x, ok) { try { await setDoc(nref(), { ...x, name: myName(), updatedAt: Date.now() }, { merge: true }); say('wNotiMsg', ok); } catch (er) { say('wNotiMsg', '저장하지 못했어요: ' + (er.code || er.message), true); } }
const needDev = () => (devId() ? '' : ' 이 기기로 받으려면 맨 위 \'이 기기에서 알림 받기\'도 켜 주세요.');
$('wEditSw').addEventListener('click', () => { const on = !(nset.on === true); saveN({ on }, on ? '수정 알림을 켰어요.' + needDev() : '수정 알림을 껐어요.'); });
const mornAt = () => (/^\d\d:\d\d$/.test($('wMornAt').value) ? $('wMornAt').value : '07:20');
$('wMornSw').addEventListener('click', () => { const on = !(nset.mOn === true), at = mornAt(); saveN({ mOn: on, mAt: on ? at : '', mAtSet: at }, on ? `매일 ${at}에 오늘 일정을 알려 줘요.` + needDev() : '오늘 일정 알림을 껐어요.'); });
$('wMornSave').addEventListener('click', () => { const at = mornAt(); saveN({ mOn: true, mAt: at, mAtSet: at }, `저장했어요: 매일 ${at}에 오늘 일정을 알려 줘요.` + needDev()); });
$('wEditTest').addEventListener('click', () => job('test-edit', { sid: SID }, 'wNotiMsg'));
$('wMornTest').addEventListener('click', () => job('test-morning', { sid: SID }, 'wNotiMsg'));
$('wHolGo').addEventListener('click', () => job('holidays', {}, 'wNotiMsg'));
swapBtn('mNotiBtn', () => { say('wNotiMsg', ''); drawDev(); drawN(); $('wHolBox').hidden = !CREATOR; open('wNotiModal'); });

// ── PDF 백업 메일: 설정은 일지 주인만, 함께 쓰는 사람은 보기만 (설정은 spaces/{id}.pdf)
const FREQ = (c) => (c.f === 'd' ? '매일' : c.f === 'w' ? `매주 ${'일월화수목금토'[+c.dow || 0]}요일` : `매월 ${c.dom === 'L' ? '말일' : (c.dom || 1) + '일'}`);
const MAIL1 = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function lastTxt() { const l = space.pdfLast; if (!l || !l.at) return ''; const d = new Date(l.at); return `마지막 발송: ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${l.ok ? '보냄' : '실패'}${l.msg ? ' (' + l.msg + ')' : ''}`; }
function pdfVis() { const f = $('wPdfF').value; $('wPdfDom').hidden = f !== 'm'; $('wPdfDow').hidden = f !== 'w'; }
function drawPdfForm() {
  const c = space.pdf || {};
  setSw('wPdfSw', c.on === true);
  $('wPdfMails').value = (c.mails || []).join(', ');
  $('wPdfF').value = c.f || 'm'; $('wPdfDom').value = String(c.dom || 1); $('wPdfDow').value = String(c.dow || 0); $('wPdfAt').value = c.at || '09:00';
  pdfVis(); const l = $('wPdfLast'); l.textContent = lastTxt(); l.className = 'wstat' + (space.pdfLast && !space.pdfLast.ok ? ' bad' : '');
}
$('wPdfF').addEventListener('change', pdfVis);
$('wPdfSw').addEventListener('click', () => setSw('wPdfSw', !$('wPdfSw').classList.contains('on')));
function readPdf() {
  const mails = [...new Set($('wPdfMails').value.split(/[,;\s]+/).map((m) => m.trim().toLowerCase()).filter(Boolean))];
  const bad = mails.filter((m) => !MAIL1.test(m));
  if (bad.length) throw new Error(`메일 주소를 확인해 주세요: ${bad.join(', ')}`);
  const on = $('wPdfSw').classList.contains('on');
  if (on && !mails.length) throw new Error('받는 메일을 적어 주세요.');
  const at = /^\d\d:\d\d$/.test($('wPdfAt').value) ? $('wPdfAt').value : '09:00';
  return { on, mails: mails.slice(0, 10), f: $('wPdfF').value, dom: $('wPdfDom').value === 'L' ? 'L' : +$('wPdfDom').value, dow: +$('wPdfDow').value, at };
}
async function savePdf() { const c = readPdf(); await updateDoc(ref(), 'pdf', c, 'pdfAt', c.on ? c.at : ''); return c; }
const errTxt = (er) => (er.code ? '저장하지 못했어요: ' + er.code : er.message);
$('wPdfSave').addEventListener('click', async () => {
  try { const c = await savePdf(); say('wPdfMsg', c.on ? `저장했어요: ${FREQ(c)} ${c.at}에 ${c.mails.length}명에게 보내요.` : '저장했어요(꺼 둠).'); }
  catch (er) { say('wPdfMsg', errTxt(er), true); }
});
$('wPdfTest').addEventListener('click', async () => {
  try { const c = await savePdf(); if (!c.mails.length) throw new Error('받는 메일을 적어 주세요.'); } catch (er) { say('wPdfMsg', errTxt(er), true); return; }
  job('pdf', { sid: SID, test: true }, 'wPdfMsg');
});
function drawPdfView() {
  const c = space.pdf || {};
  $('wPdfRo').innerHTML = c.on ? `<div><b>받는 사람</b> · ${esc((c.mails || []).join(', '))}</div><div><b>보내는 때</b> · ${FREQ(c)} ${esc(c.at || '09:00')}</div><div class="wstat">${esc(lastTxt())}</div><div class="wstat">설정은 이 일지의 주인만 바꿀 수 있어요.</div>` : '<div>지금은 꺼져 있어요. 설정은 이 일지의 주인만 바꿀 수 있어요.</div>';
}
// 메일 보내는 계정(제작자): 비밀번호는 secret/mail(아무도 못 읽음), 주소·저장 시각은 config/mailinfo
async function drawMail() {
  try {
    const s = await getDoc(doc(fs, 'config', 'mailinfo')), x = s.exists() ? s.data() : null;
    $('wMailInfo').className = 'wstat' + (x ? ' ok' : ' bad');
    $('wMailInfo').textContent = x ? `설정됨: ${x.user} (${new Date(x.at).toLocaleDateString('ko-KR')})` : '아직 설정되지 않았어요. 설정해야 PDF 메일이 나가요.';
    if (x && !$('wMailUser').value) $('wMailUser').value = x.user;
  } catch (e) {}
}
$('wMailSave').addEventListener('click', async () => {
  const user = $('wMailUser').value.trim().toLowerCase(), pass = $('wMailPass').value.replace(/\s+/g, '');
  if (!MAIL1.test(user)) { say('wPdfMsg', 'Gmail 주소를 적어 주세요.', true); return; }
  if (!/^[a-z]{16}$/i.test(pass)) { say('wPdfMsg', '앱 비밀번호 16자리(영문)를 적어 주세요.', true); return; }
  try { await setDoc(doc(fs, 'secret', 'mail'), { user, pass, at: Date.now() }); await setDoc(doc(fs, 'config', 'mailinfo'), { user, at: Date.now() }); $('wMailPass').value = ''; say('wPdfMsg', '보내는 계정을 저장했어요. \'테스트\'로 확인해 보세요.'); drawMail(); }
  catch (er) { say('wPdfMsg', '저장하지 못했어요: ' + (er.code || er.message), true); }
});
swapBtn('mPdf', () => {
  say('wPdfMsg', '');
  const own = isOwner();
  $('wPdfEdit').hidden = !own; $('wPdfView').hidden = own; $('wMailBox').hidden = !CREATOR;
  if (own) drawPdfForm(); else drawPdfView();
  if (CREATOR) drawMail();
  open('wPdfModal');
});

// 창 오른쪽 위 ✕: 그 창 닫기
document.addEventListener('click', (e) => { const x = e.target.closest && e.target.closest('.sheet > .wclose'); if (x) { const md = x.closest('.modal'); if (md) md.classList.remove('on'); } });

// ── 업데이트 내역: 메뉴 '업데이트 내역'에서 언제 무엇이 바뀌었는지 보고, 새 버전이면 들어올 때 한 번 '새로 바뀐 점'을 띄워요
const APP_SRC = [...document.scripts].map((s) => s.textContent).find((t) => /const RELEASES = \[\{"d"/.test(t)) || '';
let REL = []; try { REL = JSON.parse((APP_SRC.match(/const RELEASES = (\[\{"d"[^\n]*\]);/) || [])[1] || '[]'); } catch (e) {}
const BUILD_NOW = +((APP_SRC.match(/const BUILD = (\d+);/) || [])[1] || 0);
const IS_TEST = !!window.__WEBJS;
const st3 = document.createElement('style');
st3.textContent = `#mUpd.crrow::after, #mUpd.ownrow::after { display: none !important; } #mUpdDot { display: none !important; }
#wUpdList { max-height: 60vh; overflow: auto; margin: 4px 0 8px; }
.wrel { padding: 10px 0; border-bottom: 1px solid var(--line, #e3e7ee); } .wrel:last-child { border-bottom: 0; }
.wrelh { font-size: 13px; color: var(--mute, #6b7385); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; } .wrelh b { color: var(--ink, #1f2329); font-size: 14px; }
.wrel ul { margin: 6px 0 0; padding-left: 18px; } .wrel li { font-size: 13.5px; line-height: 1.55; margin: 2px 0; }
.wnew { font-style: normal; font-size: 11px; font-weight: 700; color: #fff; background: var(--blue, #1f5bc4); border-radius: 8px; padding: 0 6px; }
.wrel.on { background: var(--blue-l, #e8f0fe); border-radius: 10px; padding: 10px; border-bottom: 0; margin-bottom: 6px; }
.wrel > summary { list-style: none; cursor: pointer; -webkit-tap-highlight-color: transparent; } .wrel > summary::-webkit-details-marker { display: none; }
.wcnt { margin-left: auto; font-size: 12px; } .wchev { width: 8px; height: 8px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); margin: 0 4px 3px 6px; transition: transform .15s; }
.wrel[open] .wchev { transform: rotate(-135deg); margin-bottom: -3px; }
.wtools { display: flex; justify-content: flex-end; gap: 6px; margin-top: -4px; } .wtools button { font: inherit; font-size: 12.5px; border: 0; background: none; color: var(--blue, #1f5bc4); padding: 4px 6px; cursor: pointer; }
body:has(.modal.on) #testBadge, body:has(#wDiag) #testBadge { display: none !important; }`;
document.head.appendChild(st3);
document.body.insertAdjacentHTML('beforeend', `
<div class="modal" id="wUpdModal" role="dialog" aria-modal="true"><div class="sheet"><button class="wclose" type="button" aria-label="닫기">✕</button><h2 id="wUpdTitle">업데이트 내역</h2>
  <p class="note" id="wUpdNote"></p>
  <div class="wtools"><button type="button" id="wUpdAll">모두 펼치기</button><button type="button" id="wUpdNone">모두 접기</button></div>
  <div id="wUpdList"></div>
  <div class="aubox" id="wGhBox" hidden><div class="auh"><b>올리기 연결 ${crTag()}</b></div>
    <p>시험판의 '원래 주소에 올리기' 단추가 쓰는 GitHub 열쇠예요. GitHub → Settings → Developer settings → Fine-grained tokens에서 diary 저장소 하나만, Contents 'Read and write' 권한으로 만든 열쇠를 넣어 주세요. 저장한 열쇠는 서버만 읽을 수 있어요.</p>
    <div class="aur"><input class="tin" id="wGhTok" type="password" placeholder="github_pat_로 시작하는 열쇠" autocomplete="off"></div>
    <p class="wstat" id="wGhInfo"></p>
    <div class="aur"><button type="button" class="go" id="wGhSave">저장</button></div></div>
  <div class="actions"><button class="ghost" id="wUpdNo">닫기</button></div><div class="msg" id="wUpdMsg"></div></div></div>`);
$('wUpdNo').addEventListener('click', () => close('wUpdModal'));
$('wUpdAll').addEventListener('click', () => $('wUpdList').querySelectorAll('details').forEach((d) => { d.open = true; }));
$('wUpdNone').addEventListener('click', () => $('wUpdList').querySelectorAll('details').forEach((d) => { d.open = false; }));
const relDate = (r) => { const [y, m, d] = String(r.d || '').split('-').map(Number); return m ? `${y}년 ${m}월 ${d}일${r.t ? ' ' + r.t : ''}` : ''; };
function drawUpd(sinceB) {
  const list = REL.slice().reverse();
  $('wUpdNote').textContent = `지금 버전 v${BUILD_NOW}` + (sinceB ? ' · 지난번에 보신 뒤로 바뀐 점이에요(파란 칸).' : ' · 최근 것부터 보여 줘요.');
  $('wUpdList').innerHTML = list.map((r, i) => {
    const isNew = sinceB && (+r.b || 0) > sinceB;
    const openIt = sinceB ? isNew : i === 0; // 새로 바뀐 것(없으면 맨 위 하나)만 펼쳐 두고 나머지는 접어요
    return `<details class="wrel${isNew ? ' on' : ''}"${openIt ? ' open' : ''}><summary class="wrelh"><b>${r.b ? 'v' + esc(r.b) : '초기 판'}</b><span>${esc(relDate(r))}</span>${isNew ? '<em class="wnew">새로</em>' : ''}<span class="wcnt">${(r.notes || []).length}가지</span><i class="wchev" aria-hidden="true"></i></summary><ul>${(r.notes || []).map((n) => `<li>${esc(String(n).replace(/\*\*/g, ''))}</li>`).join('')}</ul></details>`;
  }).join('') || '<p class="note">아직 기록이 없어요.</p>';
}
async function drawGh() {
  try { const s = await getDoc(doc(fs, 'config', 'ghinfo')), x = s.exists() ? s.data() : null; $('wGhInfo').className = 'wstat' + (x ? ' ok' : ' bad'); $('wGhInfo').textContent = x ? `연결됨 (${new Date(x.at).toLocaleDateString('ko-KR')} 저장 · …${x.tail || ''})` : '아직 연결되지 않았어요.'; } catch (e) {}
}
$('wGhSave').addEventListener('click', async () => {
  const t = $('wGhTok').value.trim();
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) { say('wUpdMsg', 'github_pat_로 시작하는 열쇠를 붙여 넣어 주세요.', true); return; }
  try { await setDoc(doc(fs, 'secret', 'github'), { token: t, at: Date.now() }); await setDoc(doc(fs, 'config', 'ghinfo'), { at: Date.now(), tail: t.slice(-4) }); $('wGhTok').value = ''; say('wUpdMsg', '올리기 연결을 저장했어요.'); drawGh(); }
  catch (er) { say('wUpdMsg', '저장하지 못했어요: ' + (er.code || er.message), true); }
});
function openUpd(sinceB) {
  say('wUpdMsg', ''); $('wUpdTitle').textContent = sinceB ? '새로 바뀐 점' : '업데이트 내역'; drawUpd(sinceB);
  $('wGhBox').hidden = !(CREATOR && IS_TEST); if (CREATOR && IS_TEST) drawGh();
  open('wUpdModal'); $('wUpdList').scrollTop = 0;
}
swapBtn('mUpd', () => openUpd(0));
(() => { const m = $('mUpd'); if (m) { const sp = m.querySelector('span'); if (sp) sp.textContent = '업데이트 내역'; } })();
// 들어올 때: 지난번에 본 버전보다 새로우면 한 번 띄워요 (처음 쓰는 분은 띄우지 않고 기억만)
(async () => {
  if (!BUILD_NOW) return;
  const r = doc(fs, `private/${U.uid}/web/${IS_TEST ? 'seenTest' : 'seen'}`);
  try {
    const s = await getDoc(r), seen = s.exists() ? +s.data().b || 0 : 0;
    if (s.exists() && BUILD_NOW > seen && REL.some((x) => (+x.b || 0) > seen)) setTimeout(() => { if (!document.querySelector('.modal.on')) openUpd(seen); }, 1500);
    if (!s.exists() || BUILD_NOW > seen) await setDoc(r, { b: BUILD_NOW, at: Date.now() });
  } catch (e) {}
})();

// ── 시험판 → 원래 주소 올리기 (제작자, 시험판에서만): 서버가 GitHub 작업을 시작시켜요
if (IS_TEST && CREATOR) window.__testRelease = async (badge) => {
  if (!confirm('지금 시험판을 원래 주소에 올릴까요? 함께 쓰는 모든 분에게 적용돼요.')) return;
  const set = (t, c) => { badge.textContent = t; if (c) badge.style.background = c; };
  set('올리는 중… 서버에 부탁하는 중');
  try {
    const r = await addDoc(collection(fs, 'jobs'), { kind: 'release', by: U.uid, at: Date.now() });
    const un = onSnapshot(r, (s) => { const x = s.data(); if (!x || !x.status) return; un(); if (x.status === 'done') set('올리기 시작됨 · 2~3분 뒤 새로고침하면 초록색으로 바뀌어요', '#1f5bc4'); else set('올리지 못했어요: ' + (x.msg || ''), '#d93025'); }, () => {});
  } catch (er) { set('올리지 못했어요: ' + (er.code || er.message), '#d93025'); }
};

// ── 오류 보고(노현우님 전용): 다른 분 화면이 막히거나 오류가 나면 자동으로 남는 보고를 일지 안에서 봐요
if (CREATOR) {
  setDoc(doc(fs, 'config', 'creator'), { uid: U.uid, at: Date.now() }, { merge: true }).catch(() => {}); // 서버가 보고 알림을 보낼 곳
  const st4 = document.createElement('style');
  st4.textContent = `.wrep { padding: 10px 0; border-bottom: 1px solid var(--line, #e3e7ee); } .wrep:last-child { border-bottom: 0; }
.wreph { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--mute, #6b7385); } .wreph b { color: var(--ink, #1f2329); font-size: 13.5px; }
.wrep.new { background: var(--blue-l, #e8f0fe); border-radius: 10px; padding: 10px; border-bottom: 0; margin-bottom: 6px; }
.wrep pre { margin: 6px 0 0; font: 12px/1.5 system-ui, sans-serif; white-space: pre-wrap; word-break: break-all; color: var(--ink, #1f2329); max-height: 40vh; overflow: auto; }
.wrepk { font-style: normal; font-size: 11px; font-weight: 700; border-radius: 8px; padding: 0 6px; color: #fff; background: #d93025; } .wrepk.e { background: #e8710a; }
#wRepBtn .wrepn { margin-left: auto; margin-right: 6px; min-width: 18px; height: 18px; border-radius: 9px; background: #d93025; color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; padding: 0 5px; } #wRepBtn .wrepn:empty { display: none; }`;
  document.head.appendChild(st4);
  document.body.insertAdjacentHTML('beforeend', `
<div class="modal" id="wRepModal" role="dialog" aria-modal="true"><div class="sheet"><button class="wclose" type="button" aria-label="닫기">✕</button><h2>오류 보고 ${crTag()}</h2>
  <p class="note">함께 쓰는 분 화면이 막히거나 오류가 나면 자동으로 여기 남아요(같은 분은 1시간에 한 번 알림). 내용을 Claude에게 "오류 보고 왔어"라고 알려 주면 확인해요.</p>
  <div id="wRepList" style="max-height:60vh;overflow:auto"></div>
  <div class="actions"><button class="ghost" id="wRepNo">닫기</button></div><div class="msg" id="wRepMsg"></div></div></div>`);
  $('wRepNo').addEventListener('click', () => close('wRepModal'));
  const acct = $('wAcct');
  if (acct) acct.insertAdjacentHTML('afterbegin', `<button class="mrowbtn" id="wRepBtn" type="button"><span>오류 보고</span><span class="wrepn" id="wRepN"></span><span class="chev">›</span></button>`);
  const seenRef = doc(fs, `private/${U.uid}/web/reportsSeen`);
  let reps = [], seenAt = 0;
  getDoc(seenRef).then((s) => { seenAt = s.exists() ? +s.data().at || 0 : 0; drawRepN(); }).catch(() => {});
  const fmt = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const drawRepN = () => { const n = reps.filter((r) => (r.at || 0) > seenAt).length; if ($('wRepN')) $('wRepN').textContent = n ? String(n) : ''; };
  const drawList = () => {
    $('wRepList').innerHTML = reps.length ? reps.map((r) => `<div class="wrep${(r.at || 0) > seenAt ? ' new' : ''}"><div class="wreph"><em class="wrepk${r.kind === 'error' ? ' e' : ''}">${r.kind === 'error' ? '화면 오류' : r.kind === 'prelogin' ? '로그인 전 막힘' : '불러오기 막힘'}</em><b>${esc(r.email || r.by || '')}</b><span>${esc(fmt(r.at || 0))}</span></div><pre>${esc((r.lines || []).join('\n'))}\n${esc(r.ua || '')}</pre></div>`).join('') : '<p class="note">아직 보고가 없어요.</p>';
  };
  // 최근 30건 (보고는 제작자만 읽을 수 있어요)
  onSnapshot(query(collection(fs, 'reports'), orderBy('at', 'desc'), limit(30)), (s) => { reps = s.docs.map((d) => d.data()); drawRepN(); if ($('wRepModal').classList.contains('on')) drawList(); }, () => {});
  const openRep = () => { closeMenu(); drawList(); open('wRepModal'); seenAt = Date.now(); setDoc(seenRef, { at: seenAt }).catch(() => {}); setTimeout(drawRepN, 300); };
  if ($('wRepBtn')) $('wRepBtn').addEventListener('click', openRep);
  if (/[?&]reports=1/.test(location.search)) setTimeout(openRep, 1500); // 오류 보고 알림을 눌러 들어오면 바로 열어요
}

// ── 들어온 기록: 일지를 열 때마다(같은 기기는 10분에 한 번) 누가·언제·어떤 기기로 들어왔는지 남겨요. 주인만 봐요(90일 보관)
// 그리고 사람마다 '마지막 사용일·버전' 한 줄(usage)을 남겨요 — 제작자만 봐요(일지 내용·접속 기록은 아님)
const devOf = (ua) => {
  const os = /iPhone|iPad|iPod/.test(ua) ? '아이폰' : /Android/.test(ua) ? '안드로이드' : /Windows/.test(ua) ? '윈도우' : /Mac OS X/.test(ua) ? '맥' : '기타';
  const br = /SamsungBrowser/.test(ua) ? '삼성 인터넷' : /NAVER\(inapp|NAVER/.test(ua) ? '네이버 앱' : /KAKAOTALK/.test(ua) ? '카카오톡' : /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '브라우저';
  const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true ? ' · 홈 화면 앱' : '';
  return `${os} · ${br}${app}`;
};
(async () => {
  const k = 'diary.vlog.' + SID; let last = 0;
  try { last = +localStorage.getItem(k) || 0; } catch (e) {}
  if (Date.now() - last > 10 * 60e3) {
    try { localStorage.setItem(k, String(Date.now())); } catch (e) {}
    addDoc(collection(fs, `vlog/${SID}/v`), { by: U.uid, email: U.email || '', name: myName(), at: Date.now(), ua: devOf(navigator.userAgent), b: BUILD_NOW }).catch(() => {});
  }
  setDoc(doc(fs, 'usage', U.uid), { email: U.email || '', name: myName(), at: Date.now(), b: BUILD_NOW, sid: SID, own: isOwner() }, { merge: true }).catch(() => {});
})();
// 알려 두기: 구성원은 '주인이 들어온 기록을 볼 수 있어요', 다른 일지 주인은 '제작자는 마지막 사용일·버전만 봐요'
(() => {
  const note = $('wShareNote'); if (!note) return;
  const add = () => {
    if (note.querySelector('.wvnote')) return;
    const s = document.createElement('span'); s.className = 'wvnote';
    s.textContent = isOwner() ? ' 함께 쓰는 분이 언제 들어왔는지(기기 종류까지)는 일지 주인만 볼 수 있어요.' + (CREATOR ? '' : ' 제작자는 이 일지의 마지막 사용일과 버전만 볼 수 있어요(일지 내용·접속 기록은 볼 수 없어요).') : ' 일지 주인은 누가 언제 들어왔는지(기기 종류까지) 볼 수 있어요. 일지 내용 말고 들어온 시각만 남아요.';
    note.appendChild(s);
  };
  new MutationObserver(add).observe(note, { childList: true, characterData: true, subtree: true }); add();
})();
// 메뉴 '접속 기록'(일지 주인): 사람별 마지막 접속 + 최근 기록 / 제작자는 '다른 일지 주인'의 마지막 사용일·버전도
{
  const st5 = document.createElement('style');
  st5.textContent = `#wVlList, #wVlUse { max-height: 46vh; overflow: auto; }
.wvl { display: flex; gap: 8px; align-items: baseline; padding: 7px 0; border-bottom: 1px solid var(--line, #e3e7ee); font-size: 13px; } .wvl:last-child { border-bottom: 0; }
.wvl b { font-weight: 600; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .wvl span { flex: none; color: var(--mute, #6b7385); font-size: 12px; }
.wvlh { font-size: 12.5px; font-weight: 700; color: var(--blue-d, #174ea6); margin: 10px 0 2px; }`;
  document.head.appendChild(st5);
  document.body.insertAdjacentHTML('beforeend', `
<div class="modal" id="wVlModal" role="dialog" aria-modal="true"><div class="sheet"><button class="wclose" type="button" aria-label="닫기">✕</button><h2>접속 기록</h2>
  <p class="note">이 일지에 누가 언제 들어왔는지예요(같은 기기는 10분에 한 번, 90일 보관). 일지 내용은 남지 않아요.</p>
  <div class="wvlh">사람별 마지막 접속</div><div id="wVlPeople"></div>
  <div class="wvlh">최근 기록</div><div id="wVlList"></div>
  <div id="wVlCr" hidden><div class="wvlh">다른 일지 주인 · 마지막 사용일과 버전 ${crTag()}</div><div id="wVlUse"></div></div>
  <div class="actions"><button class="ghost" id="wVlNo">닫기</button></div><div class="msg" id="wVlMsg"></div></div></div>`);
  $('wVlNo').addEventListener('click', () => close('wVlModal'));
  const acct = $('wAcct');
  if (acct) acct.insertAdjacentHTML('afterbegin', `<button class="mrowbtn" id="wVlBtn" type="button"${isOwner() ? '' : ' hidden'}><span>접속 기록</span><span class="chev">›</span></button>`);
  const when = (t) => { const d = new Date(t), m = Math.round((Date.now() - t) / 60e3); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const who = (x) => esc(x.name ? `${x.name} (${x.email || ''})` : (x.email || x.by || ''));
  async function openVl() {
    closeMenu(); say('wVlMsg', '불러오는 중…'); $('wVlPeople').innerHTML = ''; $('wVlList').innerHTML = ''; $('wVlCr').hidden = !CREATOR; open('wVlModal');
    try {
      const q = await getDocs(query(collection(fs, `vlog/${SID}/v`), orderBy('at', 'desc'), limit(200)));
      const L = q.docs.map((d) => d.data()), seen = new Map();
      for (const x of L) if (!seen.has(x.by)) seen.set(x.by, x);
      $('wVlPeople').innerHTML = [...seen.values()].map((x) => `<div class="wvl"><b>${who(x)}</b><span>${esc(when(x.at))} · ${esc(x.ua || '')}</span></div>`).join('') || '<p class="note">아직 기록이 없어요.</p>';
      $('wVlList').innerHTML = L.slice(0, 60).map((x) => `<div class="wvl"><b>${who(x)}</b><span>${esc(when(x.at))} · ${esc(x.ua || '')}${x.b ? ' · v' + esc(x.b) : ''}</span></div>`).join('') || '<p class="note">아직 기록이 없어요.</p>';
      if (CREATOR) {
        const u = await getDocs(query(collection(fs, 'usage'), orderBy('at', 'desc'), limit(100)));
        const others = u.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.id !== U.uid && x.own);
        $('wVlUse').innerHTML = others.map((x) => `<div class="wvl"><b>${who(x)}</b><span>${esc(when(x.at))}${x.b ? ' · v' + esc(x.b) : ''}${x.b && x.b < BUILD_NOW ? ' (옛 버전)' : ''}</span></div>`).join('') || '<p class="note">아직 다른 일지 주인이 없어요.</p>';
      }
      say('wVlMsg', '');
    } catch (er) { say('wVlMsg', '불러오지 못했어요: ' + (er.code || er.message), true); }
  }
  if ($('wVlBtn')) $('wVlBtn').addEventListener('click', openVl);
}
