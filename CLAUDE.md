# 생활일지 웹앱 — 작업 안내 (Claude용)

- 대답은 한국어로. 사용자: 노현우(제작자, shgusdn56@gmail.com).
- 사이트: https://shgusdn56.github.io/diary/ (GitHub Pages, main 브랜치를 그대로 공개)
- 일지 화면 코드는 `src/app.html` 하나. 고친 뒤 `python3 tools/build.py`로 `index.html`을 만들어 함께 올려요.
  - `src/app.html`은 공개 저장소에 올라가므로 개인 내용(일지 글, 이름, 메일, 반려견 이름 등)을 넣지 않아요.
  - 고칠 때마다 `src/app.html` 안의 `BUILD` 숫자를 1 올리고, `RELEASES` 맨 끝 항목에 바뀐 점을 쉬운 말로 적어요.
- `shim.js`: Google 로그인, 일지 공간 고르기, Firestore를 일지 코드가 쓰던 저장 방식(db/user/downloads)으로 연결.
- `web.js`: 웹앱 전용 화면(공유·초대, 내 이름, 로그아웃, 옮기기 파일 가져오기).
- `sw.js`: 파일을 기기에 저장해 빠르게 열고, 새 버전이 오면 '새 버전' 알림.
- `firestore.rules`: Firestore 보안 규칙. 자동 올리기가 연결된 뒤로는 main에 올리면 자동 적용(그 전에는 콘솔에 붙여 넣기를 부탁).
- `functions/`: 서버 작업(Cloud Functions) — 수정 알림 푸시, 오늘 일정 알림, PDF 백업 메일(Gmail 앱 비밀번호, `secret/mail`), 공휴일 채우기, `jobs` 컬렉션(테스트·지금 보내기).
  - main에 올리면 `.github/workflows/firebase-deploy.yml`이 Firebase에 자동으로 올려요. 처음 한 번 `tools/setup-cloud.sh`를 Cloud Shell에서 실행해야 해요.
  - 시험: 에뮬레이터(`firebase emulators:exec --only firestore`)에서 FCM·메일만 가짜로 바꿔 돌려 볼 수 있어요.
- 시험판: 화면을 고치면 먼저 `tools/push-test.sh`로 https://shgusdn56.github.io/diary/test/ 에만 올려 사용자 확인을 받고, "올려"라고 하면 작업 브랜치를 main에 합쳐요.
  - 시험판은 진짜 일지 데이터와 로그인 연결(shim.js)을 같이 써요. shim.js·functions·보안 규칙은 시험판이 없어요.
- 디자인·기능은 기존과 같은 모양을 유지하고, 제작자 전용 기능은 '노현우님 전용'으로 표시해요.
- 확인한 것만 됐다고 말해요. 실제 휴대폰에서 못 해 본 건 그렇다고 말해요.
