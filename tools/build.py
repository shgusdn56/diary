# 일지 서식(내용 없는 빈 서식 template_utf8.html)으로 웹앱 index.html을 만들어요
#  - 서식 코드는 그대로 두고, 로그인 화면과 Firebase 연결(shim.js)을 끼워 넣어요
#  - 화면 코드는 로그인과 일지 공간이 정해진 뒤에 실행되도록 type="text/x-app"으로 바꿔 둬요
import re, sys
src = sys.argv[1] if len(sys.argv) > 1 else 'src/app.html'; out = sys.argv[2] if len(sys.argv) > 2 else 'index.html'
s = open(src, encoding='utf-8').read()
s = re.sub(r'<!--\s*Diary template.*?-->', '', s, count=1, flags=re.S)
i0 = s.index('const TEMPLATE = true;')  # 첫 번째가 실제 정의(뒤쪽은 문자열·검사용)
assert s.rfind('\n', 0, i0) < i0 and s[s.rfind('\n', 0, i0)+1:i0].strip() == ''
s = s.replace('const TEMPLATE = true;', 'const TEMPLATE = !window.__CREATOR; // 웹앱: 제작자(노현우) 본인 일지에서만 제작자 기능', 1)
assert s.count("const DEF_LABEL0 = '메모';") == 1
s = s.replace("const DEF_LABEL0 = '메모';", "const DEF_LABEL0 = window.__DEF_LABEL || '메모'; // 웹앱: 일지 공간마다 정한 아래 칸 기본 이름", 1)
main = '<script>\n(() => {\n  const WD = '
assert s.count(main) == 1
s = s.replace(main, '<script type="text/x-app">\n(() => {\n  const WD = ', 1)
head_add = '''<script>
/* 로그인 전 감시: 20초가 지나도 로그인 화면이 안 뜨고 '불러오는 중'에 멈춰 있으면, 기기·브라우저·오류만 담아 보고해요(로그인 없이, 이름·메일 없음) */
(function () {
  var errs = [];
  window.addEventListener('error', function (e) { if (errs.length < 6) errs.push((e.message || 'load error') + ' @' + ((e.filename || (e.target && (e.target.src || e.target.href)) || '') + '').split('/').pop() + ':' + (e.lineno || '')); }, true);
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; if (errs.length < 6) errs.push('promise: ' + ((r && (r.message || r.code)) || r)); });
  // 6초가 지나도 '불러오는 중'이면 기다려 달라는 안내를 붙여요(로그인 화면 · 일지 여는 자물쇠 화면 둘 다)
  setTimeout(function () {
    var hint = ' 조금만 기다려 주세요. 20초가 지나도 안 열리면 문제 내용을 자동으로 전달해요.';
    var g = document.getElementById('gate'), m = document.getElementById('gateMsg');
    if (g && !g.hidden && m && /불러오는 중|여는 중|로그인 중/.test(m.textContent || '') && (m.textContent || '').indexOf('기다려') < 0) m.textContent += hint;
    var lk = document.getElementById('lock'), lt = document.getElementById('lkText');
    if (lk && getComputedStyle(lk).display !== 'none' && lt && /불러오는 중/.test(lt.textContent || '') && (lt.textContent || '').indexOf('기다려') < 0) lt.textContent += hint;
  }, 6000);
  setTimeout(function () {
    var g = document.getElementById('gate'), m = document.getElementById('gateMsg'); if (!g || g.hidden || !m) return;
    var t = m.textContent || ''; if (!/불러오는 중|여는 중|로그인 중/.test(t)) return;
    var S = function (v) { return { stringValue: String(v || '').slice(0, 900) }; };
    var body = { fields: { at: { integerValue: String(Date.now()) }, ua: S(navigator.userAgent.slice(0, 220)), msg: S(t.slice(0, 100)), errs: S(errs.join(' | ')), url: S(location.href.slice(0, 200)), gsi: { booleanValue: !!(window.google && google.accounts && google.accounts.id) }, step: S(window.__step || '(로그인 코드가 시작되지 않음)') } };
    try { fetch('https://firestore.googleapis.com/v1/projects/life-diary-1c3b8/databases/(default)/documents/prereports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(function () {}); } catch (e) {}
    m.textContent = t.replace(/ 조금만 기다려.*$/, '') + ' — 오래 걸리고 있어요. 문제 내용은 자동으로 전달됐어요. 잠시 뒤 새로고침해 보세요.';
  }, 20000);
})();
</script>
<link rel="modulepreload" href="shim.js">
<link rel="modulepreload" href="https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js">
<link rel="modulepreload" href="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js">
<link rel="modulepreload" href="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#1f5bc4">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-192.png">
<style>
#gate { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; background: var(--kf5f7fa, #f5f7fa); padding: 24px 16px; font-family: system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
#gate[hidden] { display: none; }
/* 일지 화면은 다 불러오기 전까지 자물쇠 말고 전부 숨기는데(body.locked), 로그인 화면·안내 띠·진단 상자·새 버전 단추는 보여야 해요 */
html body.locked > #gate, html body.locked > #wDiag, html body.locked > #wInapp, html body.locked > #wNew, html body.locked > #testBadge { visibility: visible !important; }
#gate .gcard { width: 100%; max-width: 360px; text-align: center; }
#gate h1 { font-size: 26px; color: #1f5bc4; margin: 0 0 8px; }
#gate p { color: #6b7385; margin: 0 0 20px; font-size: 15px; line-height: 1.6; }
#gate #gbtn { display: flex; justify-content: center; min-height: 44px; }
#gate #gOut { margin-top: 16px; background: none; border: 0; color: #1f5bc4; font: inherit; font-size: 14px; text-decoration: underline; cursor: pointer; }
html.dark #gate { background: #16191f; } html.dark #gate p { color: #9aa3b5; } html.dark #gate h1 { color: #7da0ff; }
</style>
'''
assert s.count('</head>') == 1
s = s.replace('</head>', head_add + '</head>', 1)
m = re.search(r'<body[^>]*>', s)
gate = '\n<div id="gate"><div class="gcard"><h1>생활일지</h1><p id="gateMsg">불러오는 중…</p><div id="gbtn" hidden></div><button id="gOut" hidden>다른 계정으로 로그인</button></div></div>\n'
s = s[:m.end()] + gate + s[m.end():]
tail = '<script src="https://accounts.google.com/gsi/client" async></script>\n<script type="module" src="shim.js"></script>\n<script>if (\'serviceWorker\' in navigator) { navigator.serviceWorker.register(\'sw.js\').catch(() => {}); navigator.serviceWorker.addEventListener(\'message\', (e) => { if (e.data !== \'diary-update\' || document.getElementById(\'wNew\')) return; const b = document.createElement(\'button\'); b.id = \'wNew\'; b.type = \'button\'; b.textContent = \'새 버전이 있어요 · 눌러서 새로고침\'; b.style.cssText = \'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147483001;border:0;border-radius:20px;padding:10px 18px;background:#1f5bc4;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.2)\'; b.onclick = () => location.reload(); document.body.appendChild(b); }); }</script>\n'
i = s.rindex('</body>')
s = s[:i] + tail + s[i:]
open(out, 'w', encoding='utf-8').write(s)
print('built', out, len(s))
