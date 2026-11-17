# 생활일지 웹앱 — 작업 안내 (Claude용)

- 대답은 한국어로. 사용자: 노현우(제작자, shgusdn56@gmail.com).
- 사이트: https://shgusdn56.github.io/diary/ (GitHub Pages, main 브랜치를 그대로 공개)
- 일지 화면 코드는 `src/app.html` 하나. 고친 뒤 `python3 tools/build.py`로 `index.html`을 만들어 함께 올려요.
  - `src/app.html`은 공개 저장소에 올라가므로 개인 내용(일지 글, 이름, 메일, 반려견 이름 등)을 넣지 않아요.
  - 고칠 때마다 `src/app.html` 안의 `BUILD` 숫자를 1 올리고, `RELEASES` 맨 끝 항목에 바뀐 점을 쉬운 말로 적어요.
- `shim.js`: Google 로그인, 일지 공간 고르기, Firestore를 일지 코드가 쓰던 저장 방식(db/user/downloads)으로 연결.
- `web.js`: 웹앱 전용 화면(공유·초대, 내 이름, 로그아웃, 옮기기 파일 가져오기).
- `sw.js`: 파일을 기기에 저장해 빠르게 열고, 새 버전이 오면 '새 버전' 알림.
- `firestore.rules`: Firebase 콘솔 → Firestore → 규칙에 붙여 넣는 보안 규칙(바꾸면 사용자에게 붙여 넣기를 부탁).
- 디자인·기능은 기존과 같은 모양을 유지하고, 제작자 전용 기능은 '노현우님 전용'으로 표시해요.
- 확인한 것만 됐다고 말해요. 실제 휴대폰에서 못 해 본 건 그렇다고 말해요.
