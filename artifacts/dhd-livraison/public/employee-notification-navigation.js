/*
 * Unified employee notification behavior for the imported employee bundle.
 * A notification is routed only after the server confirms it was marked read.
 */
(function () {
  'use strict';

  var handledRows = new WeakSet();
  var decoratedRows = new WeakSet();
  var lastNotifications = [];
  var loading = null;

  function employeeHeaders() {
    var token = window.localStorage.getItem('dhd_employee_token') || window.localStorage.getItem('employee_token');
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  function loadNotifications() {
    if (loading) return loading;
    loading = fetch('/api/employee/notifications', {
      credentials: 'include',
      headers: Object.assign({ Accept: 'application/json' }, employeeHeaders()),
    }).then(function (response) {
      if (!response.ok) throw new Error('notifications-unavailable');
      return response.json();
    }).then(function (data) {
      lastNotifications = Array.isArray(data) ? data : [];
      updateUnreadBadges(lastNotifications);
      return lastNotifications;
    }).finally(function () {
      loading = null;
    });
    return loading;
  }

  function fallbackTarget(notification) {
    var type = String(notification && notification.type || '');
    if (type.indexOf('violation') >= 0) return '/portal/violations';
    if (type.indexOf('advance') >= 0 || type.indexOf('leave') >= 0 || type.indexOf('vacation') >= 0) return '/portal/requests';
    if (type.indexOf('salary') >= 0) return '/portal/account';
    return '/portal';
  }

  function setReadStyle(row, isRead) {
    row.classList.add('dhd-legacy-notification');
    row.classList.toggle('dhd-legacy-notification-unread', !isRead);
    row.classList.toggle('dhd-legacy-notification-read', Boolean(isRead));
    row.setAttribute('data-notification-read', String(Boolean(isRead)));
    row.style.cursor = 'pointer';
  }

  function updateUnreadBadges(notifications) {
    var unread = notifications.filter(function (item) { return !item.isRead; }).length;
    document.querySelectorAll('h1, h2, h3, p').forEach(function (heading) {
      var text = (heading.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^الإشعارات(?:\s|$)/.test(text) && !/^Notifications(?:\s|$)/i.test(text)) return;
      var badge = Array.from(heading.querySelectorAll('span')).find(function (span) {
        return /^\d+$/.test((span.textContent || '').trim());
      });
      if (unread > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'dhd-employee-notification-count';
          heading.appendChild(badge);
        }
        badge.textContent = String(unread);
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function findNotification(row, notifications) {
    var id = row.getAttribute('data-notification-id');
    if (id) {
      var byId = notifications.find(function (item) { return String(item.id) === id; });
      if (byId) return byId;
    }
    var text = (row.textContent || '').replace(/\s+/g, ' ').trim();
    return notifications.find(function (item) {
      return item.message && text.indexOf(String(item.message)) >= 0;
    }) || null;
  }

  function routeNotification(row, notification) {
    if (!notification || handledRows.has(row)) return;
    handledRows.add(row);
    var go = function () {
      setReadStyle(row, true);
      updateUnreadBadges(lastNotifications.map(function (item) {
        return item.id === notification.id ? Object.assign({}, item, { isRead: true }) : item;
      }));
      window.location.assign(notification.targetPath || fallbackTarget(notification));
    };
    if (notification.isRead) {
      go();
      return;
    }
    fetch('/api/employee/notifications/' + notification.id + '/read', {
      method: 'POST',
      credentials: 'include',
      headers: employeeHeaders(),
    }).then(function (response) {
      if (!response.ok) throw new Error('notification-read-failed');
      notification.isRead = true;
      go();
    }).catch(function () {
      handledRows.delete(row);
    });
  }

  function decorateDashboard(notifications) {
    var container = document.querySelector('#notifications');
    if (!container) return;
    container.querySelectorAll(':scope > div > div').forEach(function (row) {
      if ((row.textContent || '').indexOf('آخر إشعار') < 0) return;
      var notification = findNotification(row, notifications);
      if (!notification) return;
      setReadStyle(row, notification.isRead);
      row.setAttribute('data-notification-id', String(notification.id));
      if (decoratedRows.has(row)) return;
      decoratedRows.add(row);
      row.addEventListener('click', function (event) {
        if (event.target.closest('button, a')) return;
        event.preventDefault();
        event.stopPropagation();
        routeNotification(row, notification);
      }, true);
    });
  }

  function decorateAccountNotifications(notifications) {
    var lists = Array.from(document.querySelectorAll('[class*="max-h-64"]'));
    lists.forEach(function (list) {
      var rows = Array.from(list.children).filter(function (row) {
        return row instanceof HTMLElement && (row.textContent || '').trim();
      });
      rows.slice(0, notifications.length).forEach(function (row, index) {
        var notification = notifications[index];
        if (!notification) return;
        setReadStyle(row, notification.isRead);
        row.setAttribute('data-notification-id', String(notification.id));
        if (decoratedRows.has(row)) return;
        decoratedRows.add(row);
        row.addEventListener('click', function (event) {
          if (event.target.closest('button, a')) return;
          event.preventDefault();
          event.stopPropagation();
          routeNotification(row, notification);
        }, true);
      });
    });
  }

  function decorate() {
    if (!/^\/portal(?:\/|$)/.test(window.location.pathname)) return;
    loadNotifications().then(function (notifications) {
      decorateDashboard(notifications);
      decorateAccountNotifications(notifications);
    }).catch(function () {});
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var row = target.closest('[data-notification-id]');
    if (!row || !/^\/portal(?:\/|$)/.test(window.location.pathname)) return;
    if (target.closest('button, a')) return;
    var notification = findNotification(row, lastNotifications);
    if (!notification) return;
    event.preventDefault();
    event.stopPropagation();
    routeNotification(row, notification);
  }, true);

  var observer = new MutationObserver(decorate);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  decorate();
  window.setInterval(decorate, 10000);
})();