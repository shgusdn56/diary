// 생활일지 웹앱 연결 코드
// 일지 화면 코드는 Claude 아티팩트에서 쓰던 그대로 두고, 아티팩트가 주던 저장(db)·사용자(user)·파일 저장(downloads)
// 기능을 Firebase로 똑같이 흉내 내요. 로그인과 '어느 일지 공간을 열지'도 여기서 정해요.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithCredential, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot,
  query, where, orderBy, limit, deleteField, FieldPath
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CREATOR_EMAIL = 'shgusdn56@gmail.com';
const CLIENT_ID = '500724626014-2767hjbbl5fgd88skef9rdubqi4sr2l2.apps.googleusercontent.com';
const app = initializeApp({
  apiKey: "AIzaSyCCWE99k_oUukdtAuyWWqy2V3l1oMu2h7Y",
  authDomain: "life-diary-1c3b8.firebaseapp.com",
  projectId: "life-diary-1c3b8",
  storageBucket: "life-diary-1c3b8.firebasestorage.app",
  messagingSenderId: "500724626014",
  appId: "1:500724626014:web:d429923495cd82e663bacf"
});
const auth = getAuth(app);
let fs;
// 기기 저장은 한 탭만 써요: 여러 탭이 나눠 쓰면 휴대폰이 멈춰 둔 뒤쪽 탭 때문에 앞 탭이 서버 내용을 못 받을 수 있어요.
// 다른 탭이 이미 쓰고 있으면 이 탭은 저장 없이(메모리로) 서버에 바로 연결해요.
// 기기에 사본을 저장하지 않고 창마다 서버에서 바로 받아요: 같은 일지를 여러 창(탭·홈 화면 앱·알림으로 연 창)에서
// 열면 휴대폰 사본 저장소를 두고 다투다 한 창이 서버 연결을 놓쳐 '데이터를 불러오지 못했어요'가 뜨던 문제
fs = initializeFirestore(app, { ignoreUndefinedProperties: true });

const gate = document.getElementById('gate'), gMsg = document.getElementById('gateMsg');
const showGate = (msg, withBtn) => { gate.hidden = false; gMsg.textContent = msg || ''; document.getElementById('gbtn').hidden = !withBtn; document.getElementById('gOut').hidden = !auth.currentUser; };

// ── 로그인: 페이지 안에서 바로 받아요(다른 주소로 넘어가지 않아 휴대폰 브라우저에서도 막히지 않음)
const gsiReady = () => new Promise((ok) => { const t = setInterval(() => { if (window.google && google.accounts && google.accounts.id) { clearInterval(t); ok(); } }, 100); });
gsiReady().then(() => {
  google.accounts.id.initialize({ client_id: CLIENT_ID, ux_mode: 'popup', use_fedcm_for_prompt: true,
    callback: async (r) => { try { gMsg.textContent = '로그인 중…'; await signInWithCredential(auth, GoogleAuthProvider.credential(r.credential)); } catch (e) { gMsg.textContent = '로그인하지 못했어요: ' + (e.code || e.message); } } });
  google.accounts.id.renderButton(document.getElementById('gbtn'), { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ko' });
});
window.__logout = async () => { try { if (window.google) google.accounts.id.disableAutoSelect(); } catch (e) {} await signOut(auth); location.reload(); };
document.getElementById('gOut').onclick = () => window.__logout();

// ── 일지 공간: 일지 하나(내 생활일지, 서식 받은 분의 일지 등)가 spaces/{id} 아래에 통째로 들어가요
let U = null, SID = null, SPACE = null;
const SPKEY = (u) => 'diary.spaceCache.' + u.uid;
function cachedSpace(u) {
  try { const want = new URLSearchParams(location.search).get('s'); const c = JSON.parse(localStorage.getItem(SPKEY(u)) || 'null'); if (c && c.id && (!want || want === c.id) && (c.members || []).includes(u.email)) return c; } catch (e) {}
  return null;
}
const roleKey = (sp) => Object.entries(sp.roles || {}).sort().map((x) => x.join(':')).join(',');
const rememberSpace = (u, sp) => { try { localStorage.setItem(SPKEY(u), JSON.stringify(sp)); localStorage.setItem('diary.space', sp.id); } catch (e) {} };
async function pickSpace(u) {
  const email = u.email;
  const qs = await getDocs(query(collection(fs, 'spaces'), where('members', 'array-contains', email)));
  const list = qs.docs.map(d => ({ id: d.id, ...d.data() }));
  const want = new URLSearchParams(location.search).get('s') || (() => { try { return localStorage.getItem('diary.space'); } catch (e) { return null; } })();
  let sp = list.find(x => x.id === want) || list.find(x => x.owner === u.uid) || list[0];
  if (!sp) {
    let allowed = email === CREATOR_EMAIL;
    if (!allowed) { try { const a = await getDoc(doc(fs, 'config', 'allow')); allowed = a.exists() && (a.data().emails || []).includes(email); } catch (e) {} }
    if (!allowed) return null;
    const ref = doc(collection(fs, 'spaces'));
    const data = { owner: u.uid, ownerEmail: email, members: [email], roles: { [email]: 'owner' }, created: Date.now() };
    await setDoc(ref, data);
    sp = { id: ref.id, ...data };
  }
  rememberSpace(u, sp);
  window.__spaces = list.length ? list : [sp];
  return sp;
}

// ── 연결 진단: 일지를 연 뒤 12초가 지나도 서버에서 아무것도 못 받으면, 어디서 막혔는지 화면 아래에 보여 줘요
// 받기마다 상태를 적어 둬요: 대기 → 저장본 → 서버 / 오류
const DIAG = { ok: false, errs: [], st: {},
  watch(p) { if (!(p in this.st)) this.st[p] = '대기'; },
  mark(p, fromCache) { if (!fromCache) { this.ok = true; this.st[p] = '서버'; } else if (this.st[p] !== '서버') this.st[p] = '저장본만'; },
  err(p, e) { console.warn('[db]', p, e && e.code); this.st[p] = '오류 ' + ((e && (e.code || e.message)) || e); if (this.errs.length < 6) this.errs.push(`${p}: ${(e && (e.code || e.message)) || e}`); } };
const stuck = () => { const b = document.getElementById('banner'); return !DIAG.ok || !!(b && b.classList.contains('on') && /불러오지/.test(b.textContent)); };
async function runDiag() {
  if ((!stuck() && !/[?&]diag/.test(location.search)) || document.getElementById('wDiag')) return;
  const box = document.createElement('div'); box.id = 'wDiag';
  box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:2147483002;background:#fff8e1;color:#5f4300;border:1px solid #f0c36d;border-radius:12px;padding:10px 12px;font:12.5px/1.5 system-ui,sans-serif;white-space:pre-wrap;word-break:break-all;max-height:45vh;overflow:auto';
  const L = ['연결 진단 (이 화면을 캡처해 Claude에게 보내 주세요)', `시각 ${new Date().toLocaleString('ko-KR')} · 온라인 ${navigator.onLine} · ${navigator.userAgent.replace(/^.*?\) /, '').slice(0, 60)}`];
  const draw = () => { box.textContent = L.join('\n'); };
  const x = document.createElement('button'); x.textContent = '닫기'; x.style.cssText = 'float:right;margin-left:8px;border:1px solid #f0c36d;background:#fff;border-radius:8px;padding:2px 8px';
  x.onclick = () => box.remove();
  draw(); box.prepend(x); document.body.appendChild(box);
  // 늦게라도 서버 내용이 들어오면 상자를 스스로 닫아요
  if (!/[?&]diag/.test(location.search)) { const iv = setInterval(() => { if (!document.body.contains(box)) clearInterval(iv); else if (!stuck()) { clearInterval(iv); box.remove(); } }, 2000); }
  const add = (t) => { L.push(t); draw(); box.prepend(x); };
  if (DIAG.errs.length) add('받기 오류: ' + DIAG.errs.join(' / '));
  try { const c = await fetch('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js', { cache: 'no-store' }); add('Firebase 파일 서버: ' + c.status); } catch (e) { add('Firebase 파일 서버: 연결 실패 ' + e.message); }
  try {
    const t = await U.getIdToken(), t0 = Date.now(), ac = new AbortController(); setTimeout(() => ac.abort(), 15000);
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/life-diary-1c3b8/databases/(default)/documents/spaces/${SID}`, { headers: { Authorization: 'Bearer ' + t }, signal: ac.signal });
    add(`일지 서버 직접 읽기: ${r.status} (${Date.now() - t0}ms)` + (r.ok ? '' : ' ' + (await r.text()).replace(/\s+/g, ' ').slice(0, 220)));
  } catch (e) { add('일지 서버 직접 읽기: 실패 ' + (e.name === 'AbortError' ? '15초 안에 대답 없음' : e.message)); }
  add('실시간 연결로 받은 것: ' + (DIAG.ok ? '있음' : '없음') + (DIAG.errs.length ? ' · 오류 ' + DIAG.errs.length + '건' : ''));
  // 받기별 상태(서버/저장본만/대기/오류) — 대기·오류인 것만 보여 줘요
  const bad = Object.entries(DIAG.st).filter(([, v]) => v !== '서버');
  add(`받기 ${Object.keys(DIAG.st).length}곳 중 서버에서 못 받은 곳: ` + (bad.length ? bad.map(([p, v]) => `${p}(${v})`).join(', ').slice(0, 400) : '없음'));
  try {
    const t = await U.getIdToken(), r = await fetch(`https://firestore.googleapis.com/v1/projects/life-diary-1c3b8/databases/(default)/documents/spaces/${SID}/days?pageSize=300&mask.fieldPaths=updatedAt`, { headers: { Authorization: 'Bearer ' + t } });
    const j = r.ok ? await r.json() : null; add(`날짜 기록 직접 읽기: ${r.status}` + (j ? ` · ${(j.documents || []).length}개` : ''));
  } catch (e) { add('날짜 기록 직접 읽기: 실패 ' + e.message); }
}

// ── 아티팩트 저장(db)과 같은 모양으로: 경로는 spaces/{id}/… 아래로, 'data/users/{나}/…'(나만 보는 칸)는 private/{나}/s_{id}/… 로
const full = (p) => {
  p = String(p).replace(/^\/+|\/+$/g, '');
  const m = p.match(/^data\/users\/([^/]+)(?:\/(.*))?$/);
  if (m) { const who = m[1] === 'me' ? U.uid : m[1]; return `private/${who}/s_${SID}` + (m[2] ? '/' + m[2] : ''); } // 칸 수(짝·홀)를 그대로 지켜요
  return `spaces/${SID}/${p}`;
};
const clean = (x) => { if (Array.isArray(x)) return x.map(clean); if (x && typeof x === 'object' && !(x instanceof Date)) { const o = {}; for (const [k, v] of Object.entries(x)) { if (v === undefined) continue; o[k] = clean(v); } return o; } return x; };
const dsnap = (s) => ({ exists: s.exists(), id: s.id, data: () => s.data(), metadata: { fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites } });
const qsnap = (s) => {
  const docs = s.docs.map(d => ({ id: d.id, exists: true, data: () => d.data() }));
  return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f),
    docChanges: () => s.docChanges().map(c => ({ type: c.type, doc: { id: c.doc.id, exists: c.type !== 'removed', data: () => c.doc.data() } })),
    metadata: { fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites } };
};
// 아직 서버에 안 올라간 저장 수: 이게 남아 있는 채로 창을 닫으려 하면 브라우저가 한 번 물어봐요(사본 저장을 안 하니까)
let PEND = 0;
const W = async (f) => { PEND++; try { return await f(); } finally { PEND--; } };
window.addEventListener('beforeunload', (e) => { if (PEND > 0) { e.preventDefault(); e.returnValue = ''; } });
const docApi = (p) => {
  const ref = () => doc(fs, full(p));
  return {
    id: String(p).split('/').pop(), path: p,
    get: async () => dsnap(await getDoc(ref())),
    set: (x, opt) => W(async () => { await setDoc(ref(), clean(x), opt && opt.merge ? { merge: true } : {}); }),
    // 아티팩트의 update는 맨 위 칸 단위로 통째로 바꿔요(점이 든 이름도 그대로) — 문서가 없으면 새로 만들어요
    update: (x) => W(async () => {
      const ent = Object.entries(clean(x || {}));
      if (!ent.length) return;
      const args = []; for (const [k, v] of ent) { args.push(new FieldPath(k), v && typeof v === 'object' && v.__delete__ ? deleteField() : v); }
      try { await updateDoc(ref(), ...args); }
      catch (e) { if (e && e.code === 'not-found') { const o = {}; for (const [k, v] of ent) if (!(v && typeof v === 'object' && v.__delete__)) o[k] = v; await setDoc(ref(), o, { merge: true }); } else throw e; }
    }),
    delete: () => W(async () => { await deleteDoc(ref()); }),
    onSnapshot: (cb, err) => { DIAG.watch(p); return onSnapshot(ref(), { includeMetadataChanges: false }, (s) => { DIAG.mark(p, s.metadata.fromCache); cb(dsnap(s)); }, (e) => { DIAG.err(p, e); if (err) err(e); }); },
    collection: (c) => collApi(`${p}/${c}`)
  };
};
const collApi = (p, cons = []) => {
  const q = () => cons.length ? query(collection(fs, full(p)), ...cons) : collection(fs, full(p));
  return {
    path: p,
    doc: (id) => docApi(`${p}/${id}`),
    where: (f, op, v) => collApi(p, [...cons, where(f, op === '==' || op === 'eq' ? '==' : op, v)]),
    orderBy: (f, dir) => collApi(p, [...cons, orderBy(f, dir || 'asc')]),
    limit: (n) => collApi(p, [...cons, limit(n)]),
    get: async () => qsnap(await getDocs(q())),
    add: (x) => W(async () => { const r = await addDoc(collection(fs, full(p)), clean(x)); return { id: r.id }; }),
    onSnapshot: (cb, err) => { DIAG.watch(p); return onSnapshot(q(), (s) => { DIAG.mark(p, s.metadata.fromCache); cb(qsnap(s)); }, (e) => { DIAG.err(p, e); if (err) err(e); }); }
  };
};
const db = { doc: docApi, collection: (p) => collApi(p) };

// ── 사용자(user): 누가 열었는지, 주인인지, 고칠 수 있는지, 이름
const profCache = {};
const user = {
  id: async () => U.uid,
  me: async () => ({ id: U.uid, name: U.displayName || '', email: U.email }),
  email: async () => U.email,
  isOwner: async () => SPACE.owner === U.uid,
  canEdit: async () => SPACE.owner === U.uid,
  can: async (k) => k === 'data.write' ? ['owner', 'edit'].includes((SPACE.roles || {})[U.email]) : null,
  profiles: async (ids) => {
    const out = {};
    await Promise.all([...new Set(ids || [])].filter(Boolean).map(async (id) => {
      if (!profCache[id]) { try { const s = await getDoc(doc(fs, `spaces/${SID}/profiles/${id}`)); profCache[id] = s.exists() ? s.data() : { name: '' }; } catch (e) { profCache[id] = { name: '' }; } }
      out[id] = profCache[id];
    }));
    return out;
  },
  search: async () => []
};
// ── 파일 저장(downloads): 휴대폰·컴퓨터에 파일로 내려받기
const downloads = {
  save: async ({ filename, data }) => {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename || 'file';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
};
const caps = { db, user, downloads };
window.claude = { use: async (n) => caps[n] || null };

// ── 일지 화면 코드 실행: 로그인과 일지 공간이 정해진 뒤에 원래 순서대로 실행해요
let started = false;
function runApp() {
  if (started) return; started = true;
  document.querySelectorAll('script[type="text/x-app"]').forEach((old) => {
    const s = document.createElement('script'); s.textContent = old.textContent; old.replaceWith(s);
  });
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

onAuthStateChanged(auth, async (u) => {
  if (!u) { showGate('Google 계정으로 로그인해 주세요.', true); return; }
  U = u;
  showGate('일지를 여는 중…', false);
  try {
    const cached = cachedSpace(u);
    SPACE = cached || await pickSpace(u);
    if (!SPACE) { showGate(`${u.email} 계정은 아직 초대받지 않았어요. 일지 주인에게 초대를 부탁해 주세요.`, false); return; }
    SID = SPACE.id;
    // 뒤에서: 기억해 둔 공간이 아직 맞는지 확인(빠졌거나 권한이 바뀌었으면 다시 열기), 이름 저장
    if (cached) pickSpace(u).then((sp) => { if (!sp || sp.id !== cached.id || roleKey(sp) !== roleKey(cached) || sp.memoLabel !== cached.memoLabel) location.reload(); }).catch(() => {});
    (async () => { try { const pr = await getDoc(doc(fs, `spaces/${SID}/profiles/${u.uid}`)); if (!pr.exists() || !pr.data().set) await setDoc(doc(fs, `spaces/${SID}/profiles/${u.uid}`), { name: u.displayName || u.email.split('@')[0], email: u.email }, { merge: true }); } catch (e) {} })(); // 직접 정한 이름(set)은 그대로 둬요
    window.__CREATOR = u.email === CREATOR_EMAIL && SPACE.owner === u.uid;
    if (typeof SPACE.memoLabel === 'string' && SPACE.memoLabel) window.__DEF_LABEL = SPACE.memoLabel.slice(0, 12);
    gate.hidden = true;
    window.__web = { fs, auth, U: u, SID, SPACE, profCache, creator: u.email === CREATOR_EMAIL };
    runApp();
    setTimeout(runDiag, /[?&]diag/.test(location.search) ? 3000 : 12000);
    import(window.__WEBJS || './web.js').catch((e) => console.error('[web]', e)); // 시험판(test/)은 자기 web.js를 써요
  } catch (e) {
    console.error(e);
    showGate('일지를 열지 못했어요: ' + (e.code || e.message) + ' — 인터넷 연결을 확인하고 새로고침해 주세요.', false);
  }
});
