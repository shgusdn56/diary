# 생활일지 웹앱

- 사이트: https://shgusdn56.github.io/diary/
- `index.html`은 `tools/build.py`로 만들어요 (빈 서식 + 로그인 화면 + `shim.js`).
- `shim.js`: Google 로그인, 일지 공간 고르기, Firebase(Firestore)를 일지 코드가 쓰던 저장 방식으로 연결.
- `firestore.rules`: Firebase 콘솔 → Firestore → 규칙에 붙여 넣는 보안 규칙.
