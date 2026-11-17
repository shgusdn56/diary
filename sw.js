// 홈 화면 설치용 최소 서비스 워커: 늘 인터넷에서 새로 받아요(옛 버전이 남지 않게)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
