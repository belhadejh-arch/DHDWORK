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

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan(document);
})();