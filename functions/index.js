// 생활일지 서버 작업 (Firebase Cloud Functions)
//  1) 수정 알림: 누가 일지를 고치면(activity 기록이 생기면) 알림을 켠 다른 사람 휴대폰으로 바로 푸시
//  2) 오늘 일정 알림: 각자 정한 시각에 그날 일지(일정)를 푸시
//  3) PDF 백업 메일: 일지 주인이 정한 주기·시각에 누적 PDF를 메일로
//  4) 공휴일 채우기: 매일, 올해·내년 공휴일을 각 일지의 meta/holidays와 맞춰요(자동으로 넣은 날짜만 고치고 지워요)
//  5) 시험판 올리기(release): GitHub 작업을 시작시켜 test/ 를 원래 주소로 복사
//  테스트·지금 보내기는 jobs 컬렉션에 문서를 하나 만들면 실행돼요(보안 규칙이 누가 만들 수 있는지 막아요).
const { setGlobalOptions } = require('firebase-functions/v2');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { syncHol } = require('./holidays-base');
const { buildHtml, renderPdf, seoulNow, prevMonth, stripTags, pad } = require('./pdf');

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: process.env.FN_REGION || 'asia-northeast3', maxInstances: 2 });

const SITE = 'https://shgusdn56.github.io/diary/';
const WDK = '일월화수목금토';
const lnk = (sid) => `${SITE}?s=${encodeURIComponent(sid)}`;

// ── 푸시: private/{uid}/devices 에 저장된 기기 모두에게 (없어진 기기는 지워요)
async function pushTo(uid, { title, body, url, tag }) {
  const ds = await db.collection(`private/${uid}/devices`).get();
  const toks = ds.docs.map((d) => [d.ref, d.data().token]).filter(([, t]) => typeof t === 'string' && t);
  if (!toks.length) return { sent: 0, devices: 0 };
  const r = await getMessaging().sendEachForMulticast({
    tokens: toks.map((x) => x[1]),
    data: { title: String(title || '생활일지'), body: String(body || '').slice(0, 900), url: url || SITE, tag: tag || '' },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } }
  });
  let sent = 0; const errs = [];
  await Promise.all(r.responses.map(async (x, i) => {
    if (x.success) { sent++; return; }
    const c = x.error && x.error.code; errs.push(`${c} ${(x.error && x.error.message || '').slice(0, 120)}`);
    logger.warn('push fail', uid, c);
    if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token' || c === 'messaging/invalid-argument') await toks[i][0].delete().catch(() => {});
  }));
  return { sent, devices: toks.length, errs };
}

const journalName = async (sid) => { try { const s = await db.doc(`spaces/${sid}/meta/journal`).get(); const n = s.exists && s.data().name; return typeof n === 'string' && n.trim() ? n.trim() : '생활일지'; } catch (e) { return '생활일지'; } };
async function holidaysOf(sid) { try { const s = await db.doc(`spaces/${sid}/meta/holidays`).get(); const m = s.exists && s.data().map; return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; } }
// 아직 이 일지의 구성원인지 (빠진 사람에게는 보내지 않아요)
async function isMember(sid, uid, space) {
  try { const p = await db.doc(`spaces/${sid}/profiles/${uid}`).get(); const em = p.exists && p.data().email; return !!em && (space.members || []).includes(em); } catch (e) { return false; }
}
const md = (iso) => `${+iso.slice(5, 7)}월 ${+iso.slice(8, 10)}일`;
const actLine = (a) => `${a.byName || '공유자'} · ${a.msg || ((a.dates || []).map(md).join(', ') + ' 수정')}`;

// ── 1) 수정 알림
// 수정 알림: 날짜 칸을 고친 사람이 그 칸을 빠져나가면(fin이 새로 찍히면) 바로 — 앱을 닫을 때까지 기다리지 않아요
//  지난번 알린 내용(dayNoti)과 비교해 더한 줄·지운 줄·근무·메모 변경을 짧게 보내고, 같은 날짜는 알림 하나로 바꿔 보여요
const clean = (t) => stripTags(String(t || '')).replace(/[\u2062\u2063]/g, '');
function dayDiff(o, n) {
  const out = [];
  const ol = clean(o.log).split('\n').map((x) => x.trim()).filter(Boolean), nl = clean(n.log).split('\n').map((x) => x.trim()).filter(Boolean);
  const os = new Set(ol), ns = new Set(nl);
  for (const x of nl) if (!os.has(x)) out.push('+ ' + x);
  for (const x of ol) if (!ns.has(x)) out.push('- ' + x);
  if ((o.work || '') !== (n.work || '')) out.push(`근무: ${o.work || '없음'} → ${n.work || '없음'}`);
  if ((o.molly || '') !== (n.molly || '')) out.push(`메모: ${o.molly || '없음'} → ${n.molly || '없음'}`);
  return out;
}
// 임시 진단(2시간): 수정 알림이 어디서 멈추는지 제작자 메일로 짧게 보내요
exports.dayAlert = onDocumentWritten('spaces/{sid}/days/{date}', async (ev) => {
  const { sid, date } = ev.params;
  const before = ev.data.before.exists ? ev.data.before.data() : {}, after = ev.data.after.exists ? ev.data.after.data() : null;
  const D = [`날짜 ${date} · 고친 사람 ${after && after.updatedBy} · fin ${before.fin || 0} → ${after && after.fin || 0} · updatedAt ${after && after.updatedAt}`];
  if (!after || !after.updatedBy || !((after.fin || 0) > (before.fin || 0))) return; // 칸을 빠져나간 순간만
  const nref = db.doc(`spaces/${sid}/dayNoti/${date}`), last = await nref.get();
  const base = last.exists ? last.data() : (Array.isArray(after.hist) && after.hist.length ? after.hist[after.hist.length - 1] : before);
  const diff = dayDiff(base || {}, after);
  await nref.set({ log: after.log || '', work: after.work || '', molly: after.molly || '', at: Date.now() });
  D.push('비교 기준: ' + (last.exists ? '지난 알림' : '수정 기록'), '바뀐 점: ' + (diff.join(' | ') || '없음'));
  if (!diff.length) return;
  const sp = await db.doc(`spaces/${sid}`).get(); if (!sp.exists) return;
  let who = '공유자'; try { const p = await db.doc(`spaces/${sid}/profiles/${after.updatedBy}`).get(); if (p.exists && p.data().name) who = p.data().name; } catch (e) {}
  const jn = await journalName(sid), ns = await db.collection(`spaces/${sid}/notify`).where('on', '==', true).get();
  const body = `${who} · ${md(date)}\n` + diff.slice(0, 6).join('\n') + (diff.length > 6 ? `\n외 ${diff.length - 6}곳` : '');
  for (const n of ns.docs) {
    if (n.id === after.updatedBy) { D.push(`${n.id}: 고친 사람이라 건너뜀`); continue; }
    if (!(await isMember(sid, n.id, sp.data()))) { D.push(`${n.id}: 구성원 확인 실패(프로필 메일 없음?)`); continue; }
    try { const r = await pushTo(n.id, { title: `[${jn}] 수정 알림`, body: body.slice(0, 600), url: lnk(sid), tag: `day-${sid}-${date}` }); D.push(`${n.id}: 보냄 ${r.sent}/${r.devices}` + (r.errs && r.errs.length ? ' · 오류: ' + r.errs.join(' / ') : '')); } catch (e) { D.push(`${n.id}: 실패 ${e.message}`); logger.error('dayAlert', e); }
  }
  D.push('알림 켠 사람 수: ' + ns.size); console.log('[dayAlert] ' + D.join(' / ')); // 메일 대신 서버 기록에만
});

// ── 2) 오늘 일정
function morningMsg(log, iso, hol, jn) {
  const [y, m, d] = iso.split('-').map(Number), wd = WDK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const title = `${m}/${d}(${wd}) 오늘 일정${hol ? ' · ' + hol : ''}${jn !== '생활일지' ? ' · ' + jn : ''}`;
  const lines = stripTags(String(log || '')).replace(/[⁢⁣]/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  const MAX = 8;
  const body = !lines.length ? '오늘 일정 없음' : lines.slice(0, MAX).join('\n') + (lines.length > MAX ? `\n외 ${lines.length - MAX}줄` : '');
  return { title, body };
}
async function sendMorning(sid, uid, test) {
  const n = seoulNow(), jn = await journalName(sid);
  const day = await db.doc(`spaces/${sid}/days/${n.iso}`).get();
  const hol = (await holidaysOf(sid))[n.iso] || '';
  const msg = morningMsg(day.exists ? day.data().log : '', n.iso, hol, jn);
  if (test) msg.title = '[테스트] ' + msg.title;
  return pushTo(uid, { ...msg, url: lnk(sid), tag: `morning-${sid}` });
}

// ── 3) PDF 백업 메일
async function mailer() {
  const s = await db.doc('secret/mail').get();
  const x = s.exists ? s.data() : null;
  if (!x || !x.user || !x.pass) throw new Error('메일 보내는 계정이 아직 설정되지 않았어요');
  const nodemailer = require('nodemailer');
  return { from: x.user, t: nodemailer.createTransport({ service: 'gmail', auth: { user: x.user, pass: String(x.pass).replace(/\s+/g, '') } }) };
}
async function sendPdf(sid, opts = {}) {
  const sp = await db.doc(`spaces/${sid}`).get(); if (!sp.exists) throw new Error('일지가 없어요');
  const S = sp.data(), cfg = S.pdf || {};
  const mails = (opts.mails || cfg.mails || []).filter((m) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)).slice(0, 10);
  if (!mails.length) throw new Error('받는 사람이 없어요');
  const n = seoulNow(), f = cfg.f || 'm';
  const last = f === 'm' ? prevMonth(n) : n.ym;
  const [days, photos, hol, settings, jn] = await Promise.all([
    db.collection(`spaces/${sid}/days`).get().then((q) => Object.fromEntries(q.docs.map((d) => [d.id, d.data()]))),
    db.collection(`spaces/${sid}/photos`).get().then((q) => q.docs.map((d) => d.data())),
    holidaysOf(sid),
    db.doc(`spaces/${sid}/meta/settings`).get().then((s) => (s.exists ? s.data() : {})).catch(() => ({})),
    journalName(sid)
  ]);
  const { HOL } = require('./holidays-base');
  const r = buildHtml({ days, photos, hol: { ...HOL, ...hol }, labels: settings.labels, opt: { title: jn, defLabel: typeof S.memoLabel === 'string' && S.memoLabel ? S.memoLabel : '메모', last } });
  if (!r) return { skipped: '보낼 기록이 없어요' };
  const pdf = await renderPdf(r.html);
  const { from, t } = await mailer();
  const [ly, lm] = r.last.split('-').map(Number);
  const freq = f === 'd' ? '매일' : f === 'w' ? '매주' : '매월';
  const subject = `${opts.test ? '[테스트] ' : ''}[${jn}] ${r.first.replace('-', '.')}~${r.last.replace('-', '.')} 누적 PDF (${f === 'm' ? `${ly}년 ${lm}월분까지` : `${n.m}월 ${n.d}일까지`})`;
  const text = `${opts.test ? '지금 한 번 보내 본 테스트 메일이에요.\n' : `${freq} 자동으로 보내는 ${jn} 누적 PDF예요.\n`}기간: ${r.span}\n기록한 날: ${r.ndays}일\n\n${lnk(sid)}`;
  const safe = jn.replace(/[\\/:*?"<>|]/g, '_');
  await t.sendMail({ from: `"${jn.replace(/"/g, '')}" <${from}>`, to: mails.join(', '), subject, text, attachments: [{ filename: `${safe}_${r.last.replace('-', '')}.pdf`, content: pdf, contentType: 'application/pdf' }] });
  return { sent: mails.length, span: r.span, days: r.ndays, kb: Math.round(pdf.length / 1024) };
}
function pdfDue(cfg, n) {
  const f = cfg.f || 'm';
  if (f === 'd') return true;
  if (f === 'w') return n.dow === (+cfg.dow || 0);
  const lastDay = new Date(Date.UTC(n.y, n.m, 0)).getUTCDate();
  const want = cfg.dom === 'L' ? lastDay : Math.min(lastDay, Math.max(1, +cfg.dom || 1));
  return n.d === want;
}

// ── 4) 공휴일: Google 공개 '대한민국 휴일' 달력에서 공휴일만 골라요
async function fetchHolidays() {
  const url = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';
  const res = await fetch(url); if (!res.ok) throw new Error('공휴일 달력을 받지 못했어요: ' + res.status);
  const txt = (await res.text()).replace(/\r?\n[ \t]/g, '');
  const n = seoulNow(), years = [String(n.y), String(n.y + 1)], out = {};
  for (const ev of txt.split('BEGIN:VEVENT').slice(1)) {
    const g = (k) => { const m = ev.match(new RegExp('^' + k + '(?:;[^:\\n]*)?:(.*)$', 'm')); return m ? m[1].trim().replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1') : ''; };
    const ds = g('DTSTART'), name = g('SUMMARY'), desc = g('DESCRIPTION');
    if (!/^\d{8}/.test(ds) || !name) continue;
    if (!/^공휴일/.test(desc) && !/Public holiday/i.test(desc)) continue; // '기념일'(어버이날 등)은 빼요
    const iso = `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}`;
    if (years.includes(iso.slice(0, 4))) out[iso] = name;
  }
  return out;
}
async function fillHolidays() {
  const got = await fetchHolidays();
  if (Object.keys(got).length < 10) throw new Error('공휴일이 너무 적게 받아졌어요(' + Object.keys(got).length + '개) — 그대로 두었어요');
  const n = seoulNow(), years = [String(n.y), String(n.y + 1)];
  const sps = await db.collection('spaces').get(); const tot = { add: 0, upd: 0, del: 0 };
  for (const s of sps.docs) {
    const ref = db.doc(`spaces/${s.id}/meta/holidays`), cur = await ref.get(), x = cur.exists ? cur.data() : {};
    const map0 = x.map && typeof x.map === 'object' ? x.map : {}, auto0 = x.auto && typeof x.auto === 'object' ? x.auto : {};
    const r = syncHol(map0, auto0, got, years);
    if (!r.ch.add && !r.ch.upd && !r.ch.del && JSON.stringify(r.auto) === JSON.stringify(auto0)) continue;
    for (const k of Object.keys(tot)) tot[k] += r.ch[k];
    await ref.set({ map: r.map, auto: r.auto, updatedAt: Date.now(), source: 'google-calendar' });
  }
  return { found: Object.keys(got).length, ...tot, spaces: sps.size };
}

// ── 1분마다: 오늘 일정 알림과 PDF 메일 시각 확인 (무거운 PDF는 jobs로 넘겨 따로 실행)
exports.tick = onSchedule({ schedule: '* * * * *', timeZone: 'Asia/Seoul', memory: '256MiB', retryCount: 0 }, async () => {
  const n = seoulNow(), hhmm = `${n.hh}:${n.mi}`;
  const ms = await db.collectionGroup('notify').where('mAt', '==', hhmm).get();
  for (const d of ms.docs) {
    const x = d.data(), sid = d.ref.parent.parent && d.ref.parent.parent.id;
    if (x.mOn !== true || x.mSent === n.iso || !sid) continue;
    try {
      const sp = await db.doc(`spaces/${sid}`).get(); if (!sp.exists || !(await isMember(sid, d.id, sp.data()))) continue;
      await d.ref.update({ mSent: n.iso });
      await sendMorning(sid, d.id, false);
    } catch (e) { logger.error('morning', sid, d.id, e); }
  }
  const ps = await db.collection('spaces').where('pdfAt', '==', hhmm).get();
  for (const s of ps.docs) {
    const cfg = s.data().pdf || {};
    if (cfg.on !== true || s.data().pdfSent === n.iso || !pdfDue(cfg, n)) continue;
    await s.ref.update({ pdfSent: n.iso });
    await db.collection('jobs').add({ kind: 'pdf', sid: s.id, by: 'schedule', at: Date.now() });
  }
});

// 매일 새벽 4시 10분에 공휴일 달력과 맞춰요
// ── 문제 보고: 화면이 막히거나 오류가 나면 reports에 남고, 제작자(보내는 Gmail 계정)에게 메일로 알려요(같은 사람은 1시간에 한 번)
exports.reportMail = onDocumentCreated('reports/{rid}', async (ev) => {
  const r = ev.data && ev.data.data(); if (!r || !r.by) return;
  const rate = db.doc(`reportRate/${r.by}`), last = await rate.get();
  if (last.exists && Date.now() - (last.data().at || 0) < 3600e3) return;
  await rate.set({ at: Date.now() });
  // 제작자 기기로 휴대폰 알림(제작자가 일지를 열 때 config/creator에 자기 id를 남겨 둬요)
  try { const c = await db.doc('config/creator').get(); const cu = c.exists && c.data().uid; if (cu) await pushTo(cu, { title: `[오류 보고] ${r.kind === 'error' ? '화면 오류' : r.kind === 'prelogin' ? '로그인 전 막힘' : '불러오기 막힘'}`, body: `${r.email || r.by} · ${(r.lines || [])[0] || ''}`.slice(0, 200), url: SITE + '?reports=1', tag: 'report' }); } catch (e) { logger.error('reportPush', e); }
  try {
    const { from, t } = await mailer();
    const jn = r.sid ? await journalName(r.sid) : '생활일지';
    const when = new Date(r.at || Date.now()).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    await t.sendMail({ from: `"생활일지 오류 보고" <${from}>`, to: from, subject: `[생활일지 오류 보고] ${r.email || r.by} · ${r.kind === 'error' ? '화면 오류' : r.kind === 'prelogin' ? '로그인 전 막힘' : '불러오기 막힘'} · ${when}`,
      text: `일지: ${jn} (${r.sid || '-'})\n사람: ${r.email || '-'} (${r.by})\n시각: ${when}\n주소: ${r.url || '-'}\n브라우저: ${r.ua || '-'}\n\n${(r.lines || []).join('\n')}\n\n— 이 메일을 Claude에게 \"오류 보고 왔어\"라고 알려 주면 확인해요. (보고 번호 ${ev.params.rid})` });
  } catch (e) { logger.error('reportMail', e); }
});

// ── 로그인 전 막힘 보고 → 보통 오류 보고로 옮겨요(목록·휴대폰 알림·메일이 그대로 따라와요, 1시간에 한 번)
exports.preReport = onDocumentCreated('prereports/{rid}', async (ev) => {
  const r = ev.data && ev.data.data(); if (!r) return;
  await db.collection('reports').add({ kind: 'prelogin', by: '(로그인 전)', email: '(로그인 전 · 누군지 모름)', sid: '', at: Number(r.at) || Date.now(), url: String(r.url || ''), ua: String(r.ua || ''),
    lines: ['로그인 화면이 안 뜨고 멈춤', '화면 글: ' + (r.msg || ''), '멈춘 단계: ' + (r.step || ''), 'Google 로그인 단추 프로그램: ' + (r.gsi ? '받음' : '못 받음'), '오류: ' + (r.errs || '없음')] });
});

// ── 연결이 막혔을 때 실수로 생긴 빈 일지 정리: 주인이 먼저 만든 다른 일지가 있고, 혼자만 들어 있고, 비밀번호·날짜 기록이 하나도 없는 일지만 지워요
async function cleanEmptySpaces() {
  const all = await db.collection('spaces').get(), out = [];
  const byOwner = {}; all.docs.forEach((d) => { const o = d.data().owner; if (o) (byOwner[o] = byOwner[o] || []).push(d); });
  for (const d of all.docs) {
    const x = d.data(); if (!x.created || !x.owner || (x.members || []).length > 1) continue;
    if (Date.now() - x.created < 30 * 60e3) continue; // 막 만든 건 건드리지 않아요
    const others = (byOwner[x.owner] || []).filter((o) => o.id !== d.id && (o.data().created || 0) < x.created);
    if (!others.length) continue;
    const [auth, days] = await Promise.all([d.ref.collection('meta').doc('auth').get(), d.ref.collection('days').limit(1).get()]);
    if (auth.exists || !days.empty) continue;
    await db.recursiveDelete(d.ref); out.push(d.id);
  }
  logger.info('empty spaces removed', out); return out;
}

exports.holidaysDaily = onSchedule({ schedule: '10 4 * * *', timeZone: 'Asia/Seoul', retryCount: 1 }, async () => {
  // 매일 새벽: 90일 지난 들어온 기록 지우기
  try { const old = await db.collectionGroup('v').where('at', '<', Date.now() - 90 * 864e5).limit(400).get(); await Promise.all(old.docs.filter((d) => d.ref.parent.parent && d.ref.parent.parent.parent.id === 'vlog').map((d) => d.ref.delete())); logger.info('vlog cleanup', old.size); } catch (e) { logger.error('vlog cleanup', e); }
  try { await cleanEmptySpaces(); } catch (e) { logger.error('clean', e); }
  const r = await fillHolidays(); logger.info('holidays', r);
});

// ── jobs: 테스트 알림, PDF 보내기(예약·테스트), 공휴일 지금 채우기
exports.runJob = onDocumentCreated({ document: 'jobs/{jid}', memory: '2GiB', timeoutSeconds: 540, cpu: 1 }, async (ev) => {
  const j = ev.data && ev.data.data(); if (!j) return;
  const ref = ev.data.ref;
  const done = (o) => ref.set({ status: 'done', doneAt: Date.now(), ...o }, { merge: true });
  try {
    if (j.kind === 'test-edit') {
      const q = await db.collection(`spaces/${j.sid}/activity`).orderBy('at', 'desc').limit(1).get();
      const last = q.empty ? '아직 수정 기록 없음' : actLine(q.docs[0].data());
      const r = await pushTo(j.by, { title: `[${await journalName(j.sid)} 테스트] 수정 알림 연결 정상`, body: '마지막 수정: ' + last, url: lnk(j.sid), tag: 'test' });
      await done({ result: r, msg: r.devices ? `알림을 보냈어요(기기 ${r.sent}/${r.devices}대).` + (r.errs && r.errs.length ? ' 실패 이유: ' + r.errs.join(' / ') : '') : '알림 받을 기기가 없어요. 먼저 \'이 기기에서 알림 받기\'를 눌러 주세요.' });
    } else if (j.kind === 'test-morning') {
      const r = await sendMorning(j.sid, j.by, true);
      await done({ result: r, msg: r.devices ? `알림을 보냈어요(기기 ${r.sent}/${r.devices}대).` + (r.errs && r.errs.length ? ' 실패 이유: ' + r.errs.join(' / ') : '') : '알림 받을 기기가 없어요. 먼저 \'이 기기에서 알림 받기\'를 눌러 주세요.' });
    } else if (j.kind === 'pdf') {
      const r = await sendPdf(j.sid, { test: !!j.test });
      await done({ result: r, msg: r.skipped || `${r.sent}명에게 보냈어요 · ${r.span} · 기록한 날 ${r.days}일 · ${r.kb}KB` });
      if (!j.test) await db.doc(`spaces/${j.sid}`).set({ pdfLast: { at: Date.now(), ok: true, msg: r.skipped || `${r.span} · ${r.days}일` } }, { merge: true });
    } else if (j.kind === 'invite') {
      // 초대 메일: 일지 주인이 공유에 넣은 메일로 들어오는 주소와 방법을 보내요(PDF 메일과 같은 Gmail 계정)
      const sp = await db.doc(`spaces/${j.sid}`).get(); const S = sp.exists ? sp.data() : null;
      if (!S || S.owner !== j.by) throw new Error('일지 주인만 초대 메일을 보낼 수 있어요');
      const to = String(j.to || '').toLowerCase();
      if (!(S.members || []).includes(to)) throw new Error('공유 명단에 없는 메일이에요');
      const pr = await db.doc(`spaces/${j.sid}/profiles/${j.by}`).get(); const who = (pr.exists && pr.data().name) || '일지 주인';
      const jn = await journalName(j.sid), role = (S.roles || {})[to] === 'view' ? '보기만' : '함께 쓰기';
      const google = /@(gmail\.com|googlemail\.com)$/.test(to) ? '' : `\n※ 로그인은 Google 계정으로 해요. ${to} 주소로 만든 Google 계정이 없으면 들어올 수 없어요. 그럴 땐 쓰시는 Gmail 주소를 ${who}님께 알려 주세요.\n`;
      const { from, t } = await mailer();
      await t.sendMail({ from: `"${jn.replace(/"/g, '')}" <${from}>`, to, subject: `[${jn}] ${who}님이 일지에 초대했어요`,
        text: `${who}님이 '${jn}'을 같이 쓰자고 초대했어요(${role}).\n\n1. 아래 주소를 삼성 인터넷·Chrome(아이폰은 Safari) 같은 브라우저에서 열어요\n${lnk(j.sid)}\n※ 네이버·카카오톡 앱 안에서 바로 누르면 로그인이 안 될 수 있어요. 주소를 길게 눌러 복사한 뒤 브라우저에 붙여 넣어 열어 주세요.\n\n2. 'Google 계정으로 로그인'을 눌러 이 메일(${to})의 Google 계정으로 로그인하면 바로 열려요.\n${google}\n휴대폰 알림을 받으려면 일지 메뉴 → 휴대폰 알림 → '이 기기에서 알림 받기'를 켜 주세요.\n(아이폰은 Safari에서 공유 → '홈 화면에 추가'를 한 뒤 그 아이콘으로 열어야 알림이 와요)` });
      await done({ msg: `${to}로 초대 메일을 보냈어요.` });
    } else if (j.kind === 'release') {
      // 시험판(test/)을 원래 주소에 올리기: GitHub의 '시험판 올리기' 작업을 시작시켜요(열쇠는 secret/github, 제작자만 저장)
      const g = await db.doc('secret/github').get(), tok = g.exists && g.data().token;
      if (!tok) throw new Error('올리기 연결(GitHub 열쇠)이 아직 없어요. 업데이트 내역 창에서 먼저 저장해 주세요.');
      const r = await fetch('https://api.github.com/repos/shgusdn56/diary/dispatches', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'User-Agent': 'diary-release', 'X-GitHub-Api-Version': '2022-11-28' }, body: JSON.stringify({ event_type: 'release-test', client_payload: { at: j.at } }) });
      if (r.status !== 204) throw new Error('GitHub이 받아 주지 않았어요(' + r.status + '): ' + (await r.text()).replace(/\s+/g, ' ').slice(0, 160));
      await done({ msg: '올리기를 시작했어요. 2~3분 뒤 원래 주소에 반영돼요.' });
    } else if (j.kind === 'holidays') {
      let gone = []; try { gone = await cleanEmptySpaces(); } catch (e) { logger.error('clean', e); }
      const r = await fillHolidays();
      await done({ result: r, msg: `공휴일 ${r.found}개를 확인했어요 · 새로 넣음 ${r.add} · 이름 고침 ${r.upd} · 빠져서 지움 ${r.del}` + (gone.length ? ` · 실수로 생긴 빈 일지 ${gone.length}개 정리` : '') });
    } else await done({ status: 'error', msg: '알 수 없는 작업' });
  } catch (e) {
    logger.error('job', j.kind, e);
    await ref.set({ status: 'error', doneAt: Date.now(), msg: String((e && e.message) || e).slice(0, 300) }, { merge: true });
    if (j.kind === 'pdf' && !j.test && j.sid) await db.doc(`spaces/${j.sid}`).set({ pdfLast: { at: Date.now(), ok: false, msg: String((e && e.message) || e).slice(0, 200) } }, { merge: true }).catch(() => {});
  }
});



// ── 관리자 열람 알림: 누군가(제작자 포함) Firebase 관리 화면·관리자 도구로 일지 자료를 읽으면
//  Google 감사 로그(Data Access) → 로그 싱크 → Pub/Sub 'admin-reads' → 여기로 와요.
//  읽은 일지의 구성원에게 휴대폰 알림, 주인에게 메일을 보내요(기록은 서버 adminReads에만 남겨요).
//  (일지 앱으로 평소 읽고 쓰는 건 Firebase 로그인 요청이라 이 로그에 걸리지 않게 싱크에서 걸러요. 서버 기능(서비스 계정)도 빼요)
const { onMessagePublished } = require('firebase-functions/v2/pubsub');
const REL_KO = { spaces: '일지', private: '나만 보는 일지·개인 설정' };
function adminPaths(entry) {
  const s = JSON.stringify((entry && entry.protoPayload) || {});
  const out = new Map(); // key 'spaces/SID' | 'private/UID' → 읽은 문서 경로 몇 개
  const re = /documents\/(spaces|private)\/([A-Za-z0-9_-]{6,})((?:\/[^"\\\s]{1,200})?)/g; let m;
  while ((m = re.exec(s))) { const k = m[1] + '/' + m[2]; if (!out.has(k)) out.set(k, new Set()); if (out.get(k).size < 8) out.get(k).add((m[3] || '').replace(/^\//, '') || '(일지 자료)'); }
  return out;
}
const pathKo = (p) => { if (p === '(일지 자료)') return '일지 자료'; const a = p.split('/'); if (a[0] === 'days' && a[1]) return md(a[1]) + ' 기록'; if (a[0] === 'days') return '날짜별 기록'; if (a[0] === 'photos') return '사진'; if (a[0] === 'meta') return '설정'; if (a[0] === 'activity') return '수정 기록'; if (/^s_/.test(a[0])) return '나만 보는 일지'; if (a[0] === 'devices') return '알림 기기'; return p.split('/')[0]; };
async function adminReadAlert(entry) {
  const pp = (entry && entry.protoPayload) || {}, who = (pp.authenticationInfo && pp.authenticationInfo.principalEmail) || '';
  if (!who || /gserviceaccount\.com$/.test(who)) return { skipped: 'no-user' };
  const method = String(pp.methodName || '').split('.').pop(), at = Date.parse(entry.timestamp || '') || Date.now();
  const paths = adminPaths(entry); if (!paths.size) return { skipped: 'no-diary-path' };
  const done = [];
  for (const [k, set] of paths) {
    const [kind, id] = k.split('/'), what = [...set].map(pathKo).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4).join(', ');
    const logCol = kind === 'spaces' ? `adminReads/${id}/r` : `adminReadsP/${id}/r`;
    await db.collection(logCol).add({ at, who, method, what, paths: [...set] });
    // 같은 일지는 10분에 한 번만 알려요(관리 화면은 한 번 열 때 여러 번 읽어요)
    const gate = db.doc(kind === 'spaces' ? `adminReads/${id}` : `adminReadsP/${id}`);
    const g = await gate.get(); const last = g.exists ? +g.data().notifiedAt || 0 : 0;
    if (Date.now() - last < 10 * 60e3) { done.push(k + ':logged'); continue; }
    await gate.set({ notifiedAt: Date.now() }, { merge: true });
    const title = '[생활일지] 관리자가 일지 자료를 열었어요';
    const body = `${who} 계정이 서버 관리 화면에서 ${REL_KO[kind]}(${what})를 열었어요.`;
    let uids = [], ownerMail = '';
    if (kind === 'spaces') {
      const sp = await db.doc(`spaces/${id}`).get(); if (!sp.exists) { done.push(k + ':gone'); continue; }
      const S = sp.data(); ownerMail = S.ownerEmail || Object.entries(S.roles || {}).find(([, r]) => r === 'owner')?.[0] || '';
      const pr = await db.collection(`spaces/${id}/profiles`).get();
      uids = pr.docs.filter((d) => (S.members || []).includes(d.data().email)).map((d) => d.id);
    } else {
      uids = [id];
      const u = await db.doc(`usage/${id}`).get(); ownerMail = u.exists ? u.data().email || '' : '';
    }
    for (const u of uids) { try { await pushTo(u, { title, body, url: kind === 'spaces' ? lnk(id) : SITE, tag: 'adminread-' + id }); } catch (e) { logger.warn('adminread push', u, e.message); } }
    if (ownerMail) { try { const { from, t } = await mailer(); await t.sendMail({ from: `"생활일지 알림" <${from}>`, to: ownerMail, subject: title, text: body + `\n\n시각: ${new Date(at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n방식: ${method}\n\n일지를 쓰는 사람의 내용 보호를 위해 자동으로 보내는 메일이에요.` }); } catch (e) { logger.warn('adminread mail', e.message); } }
    done.push(k + ':notified');
  }
  return { done };
}
exports.adminReads = onMessagePublished({ topic: 'admin-reads', retry: false }, async (ev) => {
  let entry = null; try { entry = ev.data.message.json; } catch (e) {}
  if (!entry) { try { entry = JSON.parse(Buffer.from(ev.data.message.data, 'base64').toString()); } catch (e) { logger.warn('adminReads bad message'); return; } }
  const r = await adminReadAlert(entry); logger.info('adminReads', r);
});
global.__adminReadAlert = adminReadAlert; // 시험용(배포 대상 아님)
