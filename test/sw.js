// 빠르게 열기: 사이트 파일과 Firebase 프로그램을 이 기기에 저장해 두고 바로 열어요.
// 열 때 새 파일을 먼저 받고(느리면 저장해 둔 걸로), 늦게 받은 새 버전은 '새 버전' 알림을 띄워요.
const C = 'diary-v1'; // sw 2
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
  // 새 파일을 먼저 받아요(4초 안에 못 받으면 저장해 둔 걸로 열고, 늦게 오면 '새 버전' 알림)
  e.respondWith(caches.open(C).then(async (c) => {
    const hit = await c.match(key);
    const net = fetch(r, { cache: 'no-store' }).then(async (res) => {
      if (res.ok && res.type === 'basic') {
        const body = await res.clone().text();
        const old = hit ? await hit.clone().text().catch(() => null) : null;
        await c.put(key, new Response(body, { headers: res.headers }));
        if (late && old !== null && old !== body) notify();
      }
      return res;
    });
    let late = false;
    if (!hit) return net;
    e.waitUntil(net.catch(() => {}));
    return Promise.race([net.catch(() => hit), new Promise((ok) => setTimeout(() => { late = true; ok(hit); }, 4000))]);
  }));
});

// 휴대폰 알림(푸시): 서버가 보낸 제목·내용을 알림으로 띄우고, 누르면 일지를 열어요
self.addEventListener('push', (e) => {
  let p = {}; try { p = e.data ? e.data.json() : {}; } catch (er) { p = { body: e.data ? e.data.text() : '' }; }
  const d = p.data || p.notification || p;
  const opt = { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || self.registration.scope } };
  if (d.tag) { opt.tag = d.tag; opt.renotify = true; }
  e.waitUntil(self.registration.showNotification(d.title || '생활일지', opt));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.startsWith(self.registration.scope));
    if (c) return c.focus().then((w) => (w && w.navigate && !w.url.includes(new URL(url).search) ? w.navigate(url) : w)).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
