/*
 * Employee notification routing compatibility layer.
 *
 * The imported employee screen is shipped as a pre-built bundle. The latest
 * activity row is intentionally kept compatible with that bundle here:
 * clicking the notification asks the API for its source and routes to the
 * matching employee section.
 */
(function () {
  const NOTIFICATION_LABEL = 'آخر إشعار';
  const handledRows = new WeakSet();

  function isEmployeeNotificationRow(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (!element.closest('#notifications')) return false;
    return element.textContent?.includes(NOTIFICATION_LABEL) === true;
  }

  async function routeNotification(row) {
    if (handledRows.has(row)) return;
    handledRows.add(row);

    try {
      const response = await fetch('/api/employee/notifications', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('notifications-unavailable');

      const notifications = await response.json();
      const message = row.textContent?.replace(NOTIFICATION_LABEL, '').trim();
      const notification = Array.isArray(notifications)
        ? notifications.find((item) => item.message && message?.includes(item.message))
        : null;

      window.location.assign(notification?.targetPath || '/portal');
    } catch {
      // The default employee home remains a safe destination if the
      // notification list cannot be loaded.
      window.location.assign('/portal');
    }
  }

  document.addEventListener(
    'click',
    function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const row = target.closest('#notifications > div > div');
      if (!row || !isEmployeeNotificationRow(row)) return;

      event.preventDefault();
      routeNotification(row);
    },
    true,
  );
})();