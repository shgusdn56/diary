// 일지 PDF 만들기 — Claude 예약 작업에서 쓰던 diary_pdf.py를 그대로 옮겼어요(모양·규칙 같음)
const path = require('path');
const fs = require('fs');
const os = require('os');

const WD = '월화수목금토일';
const MK = '⁣', CT = '⁢';
const FC = ['', '#d93025', '#e8710a', '#188038', '#1f5bc4', '#8430ce', '#80868b'];
const KEYRE = /^(b)?(s)?(?:c([0-9a-f]{6}))?(?:z(\d{2,3}))?$/;
const LRE = /^(\s*)(\d+\.|[•-]|☐|☑)\s/;
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const isTag = (cp) => cp >= 0xE0000 && cp <= 0xE007F;

function dec(tag) {
  if (tag.length === 1 && tag.charCodeAt(0) < 0x40) {
    const bits = tag.charCodeAt(0) - 0x20, c = bits >> 2;
    return [!!(bits & 1), !!(bits & 2), c > 0 && c < FC.length ? FC[c] : '', 0];
  }
  const m = KEYRE.exec(tag);
  if (!m) return [false, false, '', 0];
  return [!!m[1], !!m[2], m[3] ? '#' + m[3] : '', m[4] ? +m[4] : 0];
}
const same = (a, b) => (a === b) || (!!a && !!b && a.every((x, i) => x === b[i]));
function runs(s) {
  const chars = Array.from(s), items = [];
  for (let i = 0; i < chars.length;) {
    const o = chars[i].codePointAt(0);
    if (isTag(o)) {
      let tag = ''; let j = i;
      while (j < chars.length && isTag(chars[j].codePointAt(0))) { tag += String.fromCharCode(chars[j].codePointAt(0) - 0xE0000); j++; }
      if (items.length) items[items.length - 1][1] = dec(tag);
      i = j; continue;
    }
    items.push([chars[i], null]); i++;
  }
  const out = []; let cur = null, buf = '';
  const flush = () => {
    if (!buf) return;
    if (!cur || same(cur, [false, false, '', 0])) { out.push(esc(buf)); return; }
    const [b, st, c, z] = cur, css = [];
    if (b) css.push('font-weight:700'); if (st) css.push('text-decoration:line-through'); if (c) css.push('color:' + c); if (z && z !== 100) css.push(`font-size:${z}%`);
    out.push(`<span style="${css.join(';')}">${esc(buf)}</span>`);
  };
  for (const [ch, st] of items) { if (!same(st, cur)) { flush(); cur = st; buf = ''; } buf += ch; }
  flush();
  return out.join('');
}
const stripTags = (s) => Array.from(s).filter((c) => !isTag(c.codePointAt(0))).join('');
function fmtLog(t) {
  if (!t) return '';
  const out = []; let pre = '';
  for (const ln of t.split('\n')) {
    const i = ln.indexOf(MK);
    if (ln.startsWith(CT)) {
      const [a, b] = i > 0 ? [ln.slice(0, i + 1), ln.slice(i + 1)] : [CT, ln.slice(1)];
      out.push(`<div class="hg"><span class="gh">${esc(pre)}</span><span class="hp">${runs(a)}</span><span class="hr">${runs(b.split(MK).join(''))}</span></div>`);
      continue;
    }
    const pl = stripTags(ln).split(MK).join('');
    const mm = LRE.exec(pl); pre = mm ? mm[0] : (pl.trim() ? '' : pre);
    if (i > 0) out.push(`<div class="hg"><span class="hp">${runs(ln.slice(0, i))}</span><span class="hr">${runs(ln.slice(i + 1).split(MK).join(''))}</span></div>`);
    else out.push(`<div class="ln">${runs(ln.split(MK).join('')) || '&#8203;'}</div>`);
  }
  return out.join('');
}

// 한국 시간 기준 날짜 조각
function seoulNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: p.hour, mi: p.minute, iso: `${p.year}-${p.month}-${p.day}`, ym: `${p.year}-${p.month}`, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
const pad = (n) => String(n).padStart(2, '0');
const prevMonth = (n) => (n.m === 1 ? `${n.y - 1}-12` : `${n.y}-${pad(n.m - 1)}`);

// days: {날짜: 문서}, photos: [문서], hol: {날짜: 이름}, labels: settings.labels, opt: {title, workH, logH, empty, defLabel, last}
function buildHtml({ days, photos, hol, labels, opt }) {
  const now = seoulNow();
  const last = opt.last || prevMonth(now);
  const RULES = (Array.isArray(labels) ? labels : []).filter((r) => r && typeof r === 'object').map((r) => [String(r.from || ''), String(r.label || '')]).sort();
  const labelFor = (k, d) => {
    if (typeof d.mlabel === 'string') return d.mlabel;
    let L = opt.defLabel || '메모';
    for (const [f, l] of RULES) if (!f || f <= k) L = l;
    return L;
  };
  const data = {};
  for (const [k, d] of Object.entries(days || {})) if (k.length === 10 && k.slice(0, 7) <= last && d && ['work', 'log', 'molly'].some((x) => String(d[x] || '').trim())) data[k] = d;
  const pics = {};
  for (const ph of (photos || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
    const src = String(ph.src || ''), dt = String(ph.date || '');
    if (src.startsWith('data:image/') && dt.slice(0, 7) <= last) (pics[dt] = pics[dt] || []).push([src, ph.name || '사진']);
  }
  const keys = [...Object.keys(data), ...Object.keys(pics)];
  if (!keys.length) return null;
  const months = [...new Set(keys.map((k) => k.slice(0, 7)))].sort();
  const body = []; let ndays = 0;
  for (const m of months) {
    const [y, mo] = m.split('-').map(Number), rows = []; let filled = 0;
    const nd = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    for (let day = 1; day <= nd; day++) {
      const k = `${y}-${pad(mo)}-${pad(day)}`, wd = (new Date(Date.UTC(y, mo - 1, day)).getUTCDay() + 6) % 7;
      const d = data[k] || {};
      const cls = wd === 6 || hol[k] ? 'sun' : wd === 5 ? 'sat' : '';
      const holH = hol[k] ? `<div class="hol">${esc(hol[k])}</div>` : '';
      const pH = (pics[k] || []).map(([s, n]) => `<figure><img src="${s}"><figcaption>${esc(n)}</figcaption></figure>`).join('');
      const molly = String(d.molly || '').trim();
      const w = String(d.work || '').trim(), wk = !w ? ' none' : ['당', '야', '주', '비', '휴'].includes(w) ? ' has' : w === '연' ? ' plain' : ' etc';
      const wh = w.split(/\s+/).filter(Boolean).flatMap((t) => { const a = Array.from(t), o = []; for (let i = 0; i < a.length; i += 2) o.push(esc(a.slice(i, i + 2).join(''))); return o; }).join('<br>') || esc(opt.empty || '비');
      const ml = labelFor(k, d), mlh = ml ? `<b>${esc(ml)}</b> ` : '';
      const logtxt = fmtLog(String(d.log || '').replace(/\s+$/, ''));
      const log = logtxt + (pH ? `<div class="pics">${pH}</div>` : '') + (molly ? `<div class="molrow${!(logtxt || pH) ? ' only' : ''}"><span class="mol">${mlh}${esc(molly)}</span></div>` : '');
      if (data[k] || pics[k]) filled++;
      rows.push(`<tr class="${cls}"><td class="d">${y}.${pad(mo)}.${pad(day)} (${WD[wd]})${holH}</td><td class="w${wk}">${wh}</td><td class="l">${log}</td></tr>`);
    }
    ndays += filled;
    body.push(`<section><h2>${y}년 ${mo}월</h2><table><colgroup><col style="width:124px"><col style="width:60px"><col></colgroup><thead><tr><th>날짜</th><th>${esc(opt.workH || '근무')}</th><th>${esc(opt.logH || '일지')}</th></tr></thead><tbody>${rows.join('')}</tbody></table></section>`);
  }
  const span = `${months[0].replace('-', '.')} ~ ${months[months.length - 1].replace('-', '.')}`;
  const fontDir = path.dirname(require.resolve('@fontsource/noto-sans-kr/400.css'));
  const fonts = ['400', '500', '700'].map((w) => `<link rel="stylesheet" href="file://${fontDir}/${w}.css">`).join('');
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8">${fonts}<style>
* { font-size:10pt; }
body { font-family: "Noto Sans KR", "Noto Sans CJK KR", sans-serif; color:#1f2329; margin:0; }
.top { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:2px solid #1f5bc4; padding-bottom:6px; margin-bottom:6px; } h1 { color:#1f5bc4; margin:0; font-weight:700; font-size:20pt; line-height:1.1; } .sub { color:#6b7280; font-size:8pt; padding-bottom:2px; }
section + section { break-before: page; }
h2 { color:#1f2329; margin:12px 0 6px; font-weight:700; font-size:13pt; }
table { width:100%; border-collapse:collapse; table-layout:fixed; } thead { display:table-header-group; }
th { background:#f2f2f2; color:#1f2329; text-align:center; padding:5px 6px; border:1px solid #9fb2d4; font-weight:700; }
td { border:1px solid #b4bcc8; padding:5px 6px; vertical-align:top; line-height:1.55; }
tr { break-inside: avoid; }
tr.sat td.d { background:#e3e5f8; } tr.sun td.d { background:#fde3e3; color:#d93025; } tr.sun td.d .hol { color:#d93025; }
td.d { white-space:nowrap; font-weight:700; color:#1f2329; text-align:center; vertical-align:middle; }
td.d .hol { color:#1f2329; font-weight:500; white-space:normal; }
td.w { text-align:center; vertical-align:middle; font-weight:700; } td.w.has { background:#f2f2f2; color:#1f2329; } td.w.etc { background:#f2f2f2; color:#1f2329; line-height:1.35; } td.w.none { color:#6b7280; } td.w.plain { color:#1f2329; } td.l { word-break:break-all; } .ln { white-space:pre-wrap; } .hg { display:flex; } .hp { flex:none; white-space:pre; } .gh { flex:none; white-space:pre; visibility:hidden; } .hr { flex:1; min-width:0; white-space:pre-wrap; }
.molrow { margin-top:6px; white-space:normal; } .molrow.only { margin-top:0; } .mol { display:inline-block; padding:1px 12px; border:1px solid #c4c9d1; border-radius:20px; background:#f2f2f2; color:#1f2329; white-space:pre-wrap; }
.pics { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; white-space:normal; }
figure { margin:0; } figure img { max-width:220px; max-height:220px; display:block; border:1px solid #e3e6eb; } figcaption { color:#6b7280; }
</style><div class="top"><h1>${esc(opt.title || '생활일지')}</h1><div class="sub">${span} 누적 · ${now.y}.${pad(now.m)}.${pad(now.d)} 생성</div></div>${body.join('')}</html>`;
  return { html, span, ndays, first: months[0], last: months[months.length - 1] };
}

// HTML → PDF (Cloud Functions에서는 @sparticuz/chromium, 내 컴퓨터 시험에서는 CHROME_PATH)
async function renderPdf(html) {
  const puppeteer = require('puppeteer-core');
  let exe = process.env.CHROME_PATH, args = ['--no-sandbox', '--headless=new', '--allow-file-access-from-files'];
  if (!exe) { const chromium = require('@sparticuz/chromium'); const C = chromium.default || chromium; exe = await C.executablePath(); args = [...C.args, '--allow-file-access-from-files']; }
  const tmp = path.join(os.tmpdir(), `diary-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, html);
  const b = await puppeteer.launch({ executablePath: exe, args, headless: true });
  try {
    const pg = await b.newPage();
    await pg.goto('file://' + tmp, { waitUntil: 'networkidle0', timeout: 120000 });
    await pg.evaluate(() => document.fonts.ready);
    const pdf = await pg.pdf({ format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' }, timeout: 240000 });
    return Buffer.from(pdf);
  } finally { await b.close().catch(() => {}); try { fs.unlinkSync(tmp); } catch (e) {} }
}

module.exports = { buildHtml, renderPdf, seoulNow, prevMonth, stripTags, pad };
