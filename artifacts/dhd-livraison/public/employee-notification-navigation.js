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
  const decoratedRows = new WeakSet();

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

      if (notification && !notification.isRead) {
        await fetch(`/api/employee/notifications/${notification.id}/read`, {
          method: 'POST',
          credentials: 'include',
        });
      }
      window.location.assign(notification?.targetPath || '/portal');
    } catch {
      // The default employee home remains a safe destination if the
      // notification list cannot be loaded.
      window.location.assign('/portal');
    }
  }

  async function decorateNotifications() {
    const container = document.querySelector('#notifications');
    if (!container) return;

    const response = await fetch('/api/employee/notifications', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }).catch(() => null);
    if (!response?.ok) return;
    const notifications = await response.json().catch(() => []);
    if (!Array.isArray(notifications)) return;

    const rows = Array.from(container.querySelectorAll(':scope > div > div'));
    rows.forEach((row, index) => {
      if (decoratedRows.has(row)) return;
      const notification = notifications[index];
      if (!notification) return;
      decoratedRows.add(row);
      row.classList.add('dhd-legacy-notification');
      row.classList.add(notification.isRead ? 'dhd-legacy-notification-read' : 'dhd-legacy-notification-unread');
      row.setAttribute('data-notification-id', String(notification.id));

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'dhd-legacy-notification-delete';
      deleteButton.textContent = 'حذف';
      deleteButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        deleteButton.disabled = true;
        const deleted = await fetch(`/api/employee/notifications/${notification.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (deleted.ok) row.remove();
        else deleteButton.disabled = false;
      });
      row.appendChild(deleteButton);
    });

    const header = container.querySelector(':scope > div:first-child');
    if (header && !header.querySelector('.dhd-legacy-mark-all')) {
      const markAll = document.createElement('button');
      markAll.type = 'button';
      markAll.className = 'dhd-legacy-mark-all';
      markAll.textContent = 'تحديد الكل كمقروء';
      markAll.addEventListener('click', async (event) => {
        event.stopPropagation();
        const marked = await fetch('/api/employee/notifications/read-all', {
          method: 'POST',
          credentials: 'include',
        });
        if (marked.ok) {
          container.querySelectorAll('.dhd-legacy-notification-unread').forEach((row) => {
            row.classList.remove('dhd-legacy-notification-unread');
            row.classList.add('dhd-legacy-notification-read');
          });
        }
      });
      header.appendChild(markAll);
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

  const observer = new MutationObserver(() => void decorateNotifications());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(() => void decorateNotifications(), 30000);
})();