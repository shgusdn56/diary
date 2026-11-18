#!/bin/bash
# 시험판 올리기: 지금 작업 중인 화면(src/app.html, web.js, sw.js 등)을 main의 test/ 폴더에만 올려요.
#  → https://shgusdn56.github.io/diary/test/ 에서 먼저 확인 (모두가 쓰는 /diary/ 는 그대로)
#  - 일지 내용(Firebase)은 진짜 일지와 같아요. 화면만 시험판이에요.
#  - 로그인 연결(shim.js)·서버(functions/)·보안 규칙은 시험판이 없어요(진짜 것을 같이 써요).
# 확인이 끝나면 작업 브랜치를 main에 합쳐 모두에게 올려요.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
OUT=$(mktemp -d); WT=$(mktemp -d)
python3 tools/build.py src/app.html "$OUT/index.html" >/dev/null
cp web.js sw.js manifest.webmanifest icon-192.png icon-512.png diag.html "$OUT/"
python3 - "$OUT/index.html" <<'PY'
import sys; p = sys.argv[1]; s = open(p, encoding='utf-8').read()
# 로그인 연결은 진짜(../shim.js)를 쓰고, 화면 코드(web.js)는 시험판 것을 쓰게
s = s.replace('href="shim.js"', 'href="../shim.js"').replace('src="shim.js"', 'src="../shim.js"')
s = s.replace('<script type="module" src="../shim.js">', '<script>window.__WEBJS = new URL("web.js", location.href).href;</script>\n<script type="module" src="../shim.js">', 1)
assert 'window.__WEBJS' in s
# 시험판 표시: 원래 주소(../)와 화면 파일을 비교해서 '아직 안 올림'인지 '올라감'인지 보여 줘요
tag = '''<div id="testBadge" style="position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:2147483003;background:#e8710a;color:#fff;font:700 12px/1.4 system-ui,sans-serif;padding:4px 10px;border-radius:10px;pointer-events:none;max-width:70vw">시험판 · 비교하는 중…</div>
<script>(async () => {
  const b = document.getElementById('testBadge');
  const g = async (u) => { try { const r = await fetch(u + '?x=' + Date.now(), { cache: 'no-store' }); return r.ok ? await r.text() : ''; } catch (e) { return ''; } };
  const [li, ti, lw, tw, ls, ts] = await Promise.all([g('../'), g('./'), g('../web.js'), g('web.js'), g('../sw.js'), g('sw.js')]);
  const bn = (s) => (s.match(/const BUILD = (\\d+)/) || [])[1] || '?';
  const lb = bn(li), tb = bn(ti), diff = [];
  if (lb !== tb) diff.push('일지 화면'); if (lw !== tw) diff.push('웹앱 창'); if (ls !== ts) diff.push('빠르게 열기');
  if (!li || !lw) { b.textContent = '시험판 v' + tb + ' · 원래 주소와 비교하지 못했어요'; return; }
  if (!diff.length) { b.style.background = '#188038'; b.textContent = '시험판 v' + tb + ' · 원래 주소에 올라감(같아요)'; }
  else b.textContent = '시험판 v' + tb + ' · 아직 안 올림 (원래 v' + lb + ' · 다른 곳: ' + diff.join(', ') + ')';
})();</script>
'''
i = s.rindex('</body>'); open(p, 'w', encoding='utf-8').write(s[:i] + tag + s[i:])
PY
git fetch -q origin main
git worktree add -q --detach "$WT" origin/main
rm -rf "$WT/test"; mkdir -p "$WT/test"; cp "$OUT"/* "$WT/test/"
cd "$WT"; git add -A test
if git diff --cached --quiet; then echo "시험판이 이미 같아요"; else
  git commit -q -m "시험판 올리기 (test/)" -m "${TEST_NOTE:-}"
  git push -q origin HEAD:main && echo "시험판을 올렸어요: https://shgusdn56.github.io/diary/test/"
fi
cd "$ROOT"; git worktree remove --force "$WT"; rm -rf "$OUT"
