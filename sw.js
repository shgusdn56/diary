// 빠르게 열기: 사이트 파일과 Firebase 프로그램을 이 기기에 저장해 두고 바로 열어요.
// 새 버전은 뒤에서 받아 두고, 받았으면 화면에 '새 버전' 알림을 띄워요(다음 새로고침부터 적용).
const C = 'diary-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
let tm = null;
const notify = () => { clearTimeout(tm); tm = setTimeout(() => self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage('diary-update'))), 300); };
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const scope = new URL(self.registration.scope);
  const same = u.origin === scope.origin && u.pathname.startsWith(scope.pathname);
  const fb = u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/');
  if (!same && !fb) return;
  if (fb) { // 버전이 박힌 주소라 바뀌지 않아요: 저장해 둔 걸 그대로
    e.respondWith(caches.open(C).then(async (c) => { const hit = await c.match(r); if (hit) return hit; const res = await fetch(r); if (res.ok) c.put(r, res.clone()); return res; }));
    return;
  }
  const key = new Request(u.origin + u.pathname);
  e.respondWith(caches.open(C).then(async (c) => {
    const hit = await c.match(key);
    const net = fetch(r, { cache: 'no-store' }).then(async (res) => {
      if (res.ok && res.type === 'basic') {
        const body = await res.clone().text();
        const old = hit ? await hit.clone().text().catch(() => null) : null;
        await c.put(key, new Response(body, { headers: res.headers }));
        if (hit && old !== body) notify();
      }
      return res;
    }).catch(() => hit || Response.error());
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
