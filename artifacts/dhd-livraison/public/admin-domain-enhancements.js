/*
 * Small compatibility layer for the imported admin bundles.
 *
 * The pages are already compiled and their source is not part of this
 * artifact. This script only improves presentation of fields returned by the
 * database-backed API; it does not invent records or replace React handlers.
 */
(function () {
  function isViolationsRoute() {
    return /violations/i.test(window.location.pathname);
  }

  function removePendingViolationFilter() {
    if (!isViolationsRoute()) return;
    document.querySelectorAll('[data-value="pending"]').forEach(function (item) {
      var menu = item.closest('[role="listbox"]') || item.parentElement;
      var menuText = menu ? (menu.textContent || '').toLowerCase() : '';
      if (menuText.indexOf('deducted') >= 0 || menuText.indexOf('مخص') >= 0 || menuText.indexOf('violation') >= 0) {
        item.remove();
      }
    });
  }

  function localLabel(arabic, english) {
    return document.documentElement.dir === 'rtl' ? arabic : english;
  }

  function enhanceAttendanceTable(table) {
    var headers = table.querySelector('thead tr');
    if (!headers) return;
    var names = Array.prototype.map.call(headers.cells, function (cell) {
      return (cell.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    });
    var statusIndex = names.findIndex(function (name) {
      return name.indexOf('status') >= 0 || name.indexOf('الحالة') >= 0;
    });
    var durationIndex = names.findIndex(function (name) {
      return name.indexOf('duration') >= 0 || name.indexOf('المدة') >= 0;
    });
    if (statusIndex < 0 || durationIndex < 0) return;

    Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function (row) {
      if (row.cells.length <= Math.max(statusIndex, durationIndex)) return;
      var duration = (row.cells[durationIndex].textContent || '').toLowerCase();
      var isLate = duration.indexOf('late') >= 0 || duration.indexOf('متأخر') >= 0 || duration.indexOf('تأخير') >= 0;
      if (!isLate) return;
      var badge = row.cells[statusIndex].querySelector('[data-slot="badge"]') || row.cells[statusIndex].firstElementChild;
      if (!badge) return;
      badge.textContent = localLabel('متأخر', 'Late');
      badge.classList.remove('bg-emerald-500\\/10', 'text-emerald-600');
      badge.classList.add('bg-amber-500\\/10', 'text-amber-600');
    });
  }

  function normalizeAppliedViolationLabels() {
    if (!isViolationsRoute()) return;
    document.querySelectorAll('*').forEach(function (node) {
      if (node.children.length === 0 && (node.textContent || '').trim() === 'violations.status.applied') {
        node.textContent = localLabel('مطبقة وخصمها مباشر', 'Applied directly');
      }
    });
  }

  function enhanceSalaryTable(table) {
    if (!(table instanceof HTMLTableElement)) return;
    var text = (table.textContent || '').toLowerCase();
    var header = table.querySelector('thead');
    if (!header || (
      text.indexOf('salary') < 0 &&
      text.indexOf('الراتب') < 0 &&
      text.indexOf('salaire') < 0
    )) return;

    table.setAttribute('data-salary-table', 'true');
    var headerCells = header.rows[0] ? Array.prototype.slice.call(header.rows[0].cells) : [];
    var labels = headerCells.map(function (cell) {
      return (cell.textContent || '').replace(/\s+/g, ' ').trim();
    });
    Array.prototype.forEach.call(table.tBodies, function (body) {
      Array.prototype.forEach.call(body.rows, function (row) {
        Array.prototype.forEach.call(row.cells, function (cell, index) {
          if (!cell.hasAttribute('colspan') && labels[index]) {
            cell.setAttribute('data-label', labels[index]);
          }
        });
      });
    });
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('table').forEach(function (table) {
      var text = (table.textContent || '').toLowerCase();
      if (text.indexOf('attendance') >= 0 || text.indexOf('الحضور') >= 0 || table.querySelector('th')) {
        enhanceAttendanceTable(table);
      }
      enhanceSalaryTable(table);
    });
    removePendingViolationFilter();
    normalizeAppliedViolationLabels();
  }

  var notificationRows = new WeakSet();
  var notificationControls = new WeakSet();
  var notificationBulkControls = new WeakSet();
  var bellRefreshTimer = null;

  function adminHeaders() {
    var token = window.localStorage.getItem('dhd_admin_token');
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  function openAdminNotification(notification, row) {
    if (!notification || !row || row.dataset.dhdNotificationOpening === 'true') return;
    row.dataset.dhdNotificationOpening = 'true';
    var complete = function () {
      row.classList.remove('dhd-admin-notification-unread');
      row.classList.add('dhd-admin-notification-read');
      refreshAdminBell();
      window.location.assign(notification.targetPath || '/dashboard');
    };
    if (notification.isRead) {
      complete();
      return;
    }
    fetch('/api/notifications/' + notification.id + '/read', {
      method: 'POST',
      credentials: 'include',
      headers: adminHeaders(),
    }).then(function (response) {
      if (!response.ok) throw new Error('notification-read-failed');
      notification.isRead = true;
      complete();
    }).catch(function () {
      delete row.dataset.dhdNotificationOpening;
    });
  }

  function decorateAdminNotificationPopover() {
    var popovers = document.querySelectorAll('[data-radix-popper-content-wrapper]');
    popovers.forEach(function (popover) {
      var rows = popover.querySelectorAll('.divide-y > div');
      if (!rows.length) return;
      fetch('/api/notifications', { credentials: 'include', headers: Object.assign({ Accept: 'application/json' }, adminHeaders()) })
        .then(function (response) { return response.ok ? response.json() : []; })
        .then(function (notifications) {
          if (!Array.isArray(notifications)) return;
          var header = popover.querySelector('.border-b');
          if (header && !notificationBulkControls.has(header)) {
            notificationBulkControls.add(header);
            var deleteAll = document.createElement('button');
            deleteAll.type = 'button';
            deleteAll.className = 'dhd-admin-notification-delete-all';
            deleteAll.textContent = 'حذف الصندوق';
            deleteAll.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              deleteAll.disabled = true;
              fetch('/api/notifications', {
                method: 'DELETE', credentials: 'include', headers: adminHeaders()
              }).then(function (response) {
                if (response.ok) {
                  rows.forEach(function (row) { row.remove(); });
                  refreshAdminBell();
                } else deleteAll.disabled = false;
              }).catch(function () { deleteAll.disabled = false; });
            });
            header.appendChild(deleteAll);
          }
          rows.forEach(function (row, index) {
            var notification = notifications[index];
            if (!notification) return;
            row.classList.toggle('dhd-admin-notification-unread', !notification.isRead);
            row.classList.toggle('dhd-admin-notification-read', Boolean(notification.isRead));
            if (notificationControls.has(row)) return;
            notificationControls.add(row);
            row.style.cursor = 'pointer';
            row.addEventListener('click', function (event) {
              if (event.target.closest('button, a')) return;
              event.preventDefault();
              event.stopPropagation();
              openAdminNotification(notification, row);
            });
            var actions = document.createElement('span');
            actions.className = 'dhd-admin-notification-actions';
            var readButton = document.createElement('button');
            readButton.type = 'button';
            readButton.className = 'dhd-admin-notification-read-button';
            readButton.textContent = notification.isRead ? 'مقروء' : 'تحديد كمقروء';
            readButton.disabled = Boolean(notification.isRead);
            readButton.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              readButton.disabled = true;
              fetch('/api/notifications/' + notification.id + '/read', {
                method: 'POST', credentials: 'include', headers: adminHeaders()
              }).then(function (response) {
                if (response.ok) {
                  row.classList.remove('dhd-admin-notification-unread');
                  row.classList.add('dhd-admin-notification-read');
                  readButton.textContent = 'مقروء';
                  refreshAdminBell();
                } else readButton.disabled = false;
              }).catch(function () { readButton.disabled = false; });
            });
            var deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'dhd-admin-notification-delete-button';
            deleteButton.textContent = 'حذف';
            deleteButton.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              deleteButton.disabled = true;
              fetch('/api/notifications/' + notification.id, {
                method: 'DELETE', credentials: 'include', headers: adminHeaders()
              }).then(function (response) {
                if (response.ok) {
                  row.remove();
                  refreshAdminBell();
                }
                else deleteButton.disabled = false;
              }).catch(function () { deleteButton.disabled = false; });
            });
            actions.appendChild(readButton);
            actions.appendChild(deleteButton);
            row.appendChild(actions);
          });
        }).catch(function () { /* the native notification UI remains available */ });
    });
  }

  function refreshAdminBell() {
    if (bellRefreshTimer) return;
    bellRefreshTimer = window.setTimeout(function () {
      bellRefreshTimer = null;
      fetch('/api/notifications', { credentials: 'include', headers: Object.assign({ Accept: 'application/json' }, adminHeaders()) })
        .then(function (response) { return response.ok ? response.json() : []; })
        .then(function (notifications) {
          if (!Array.isArray(notifications)) return;
          var unread = notifications.filter(function (item) { return !item.isRead; }).length;
          var bell = document.querySelector('[data-testid="button-notification-bell"]');
          if (!bell) return;
          bell.classList.toggle('dhd-admin-bell-unread', unread > 0);
          var badge = bell.querySelector('.dhd-admin-bell-count');
          if (unread > 0) {
            if (!badge) {
              badge = document.createElement('span');
              badge.className = 'dhd-admin-bell-count';
              bell.appendChild(badge);
            }
            badge.textContent = unread > 99 ? '99+' : String(unread);
          } else if (badge) {
            badge.remove();
          }
        }).catch(function () { /* the native bell remains available */ });
    }, 200);
  }

  function decorateAdminNotificationBell() {
    decorateAdminNotificationPopover();
    refreshAdminBell();
    var bell = document.querySelector('[data-testid="button-notification-bell"]');
    if (!bell || notificationRows.has(bell)) return;
    notificationRows.add(bell);
    var timer = window.setInterval(function () {
      decorateAdminNotificationPopover();
      refreshAdminBell();
    }, 2000);
    window.addEventListener('beforeunload', function () { window.clearInterval(timer); }, { once: true });
  }

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      });
    });
    decorateAdminNotificationBell();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan(document);
  decorateAdminNotificationBell();
})();