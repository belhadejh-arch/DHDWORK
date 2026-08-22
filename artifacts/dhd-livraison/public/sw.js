self.addEventListener('push', function (event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'DHD Livraison';
  const options = {
    body: data.body || 'إشعار جديد',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/favicon-96x96.png',
    dir: 'rtl',
    lang: 'ar',
    tag: data.notificationId ? 'dhd-' + data.notificationId : 'dhd-notification',
    data: { url: data.url || '/portal' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url || '/portal';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
    for (const client of windows) {
      if ('focus' in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  }));
});