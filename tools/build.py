# 일지 서식(내용 없는 빈 서식 template_utf8.html)으로 웹앱 index.html을 만들어요
#  - 서식 코드는 그대로 두고, 로그인 화면과 Firebase 연결(shim.js)을 끼워 넣어요
#  - 화면 코드는 로그인과 일지 공간이 정해진 뒤에 실행되도록 type="text/x-app"으로 바꿔 둬요
import re, sys
src = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else 'index.html'
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
head_add = '''<link rel="modulepreload" href="shim.js">
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
