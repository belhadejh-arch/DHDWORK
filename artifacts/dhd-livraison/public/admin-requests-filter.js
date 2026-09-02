/*
 * DHD Admin – Requests page filter enhancement
 *
 * The pre-built bundle fetches /api/advances, /api/leave-requests and
 * /api/vacation-requests individually without a unified status filter.
 * This script intercepts the unified /api/requests endpoint (added in the
 * API server) and wires up a visible filter bar above the requests table
 * whenever the admin navigates to a requests-related page.
 */
(function () {
  'use strict';

  var STATUSES = [
    { value: 'all',      label: 'الكل',        ar: 'الكل',       fr: 'Tout',      en: 'All' },
    { value: 'pending',  label: 'قيد الانتظار', ar: 'قيد الانتظار', fr: 'En attente', en: 'Pending' },
    { value: 'approved', label: 'مقبول',        ar: 'مقبول',       fr: 'Approuvé',  en: 'Approved' },
    { value: 'rejected', label: 'مرفوض',        ar: 'مرفوض',       fr: 'Rejeté',    en: 'Rejected' },
  ];

  var TYPES = [
    { value: 'all',      label: 'جميع الطلبات', ar: 'جميع الطلبات', fr: 'Tous',       en: 'All types' },
    { value: 'advance',  label: 'سلف',          ar: 'سلف',          fr: 'Avances',    en: 'Advances' },
    { value: 'leave',    label: 'إجازة',         ar: 'إجازة',         fr: 'Congés',     en: 'Leaves' },
    { value: 'vacation', label: 'عطلة',          ar: 'عطلة',          fr: 'Vacances',   en: 'Vacations' },
  ];

  var STATUS_CLASSES = {
    pending:  { badge: 'dhd-req-badge-pending',  row: 'dhd-req-row-pending'  },
    approved: { badge: 'dhd-req-badge-approved', row: 'dhd-req-row-approved' },
    rejected: { badge: 'dhd-req-badge-rejected', row: 'dhd-req-row-rejected' },
  };

  var adminToken = function () {
    return window.localStorage.getItem('dhd_admin_token') || '';
  };

  var authHeaders = function () {
    var t = adminToken();
    return t ? { Authorization: 'Bearer ' + t, Accept: 'application/json' } : { Accept: 'application/json' };
  };

  function isRequestsPage() {
    var path = window.location.pathname || '';
    return /requests|طلبات|advances|leave|vacation/i.test(path) ||
           /requests|طلبات|السلف|الإجازة|advances|leave/i.test(document.title || '');
  }

  function getLang() {
    return document.documentElement.lang || window.localStorage.getItem('dhd-language') || 'ar';
  }

  function labelFor(item) {
    var lang = getLang();
    return item[lang] || item.ar || item.label;
  }

  var currentStatus = 'all';
  var currentType = 'all';
  var requestsData = [];
  var filterBar = null;
  var tableContainer = null;

  function renderTable(data) {
    if (!tableContainer) return;
    var filtered = data.filter(function (r) {
      var statusOk = currentStatus === 'all' || r.status === currentStatus;
      var typeOk   = currentType === 'all'   || r.requestType === currentType;
      return statusOk && typeOk;
    });

    var lang = getLang();
    var isRtl = lang === 'ar';

    var html = '<table class="dhd-req-table" dir="' + (isRtl ? 'rtl' : 'ltr') + '">';
    html += '<thead><tr>';
    html += '<th>' + (isRtl ? 'الموظف'  : 'Employé')  + '</th>';
    html += '<th>' + (isRtl ? 'نوع الطلب' : 'Type')   + '</th>';
    html += '<th>' + (isRtl ? 'المبلغ / المدة' : 'Montant / Durée') + '</th>';
    html += '<th>' + (isRtl ? 'السبب'   : 'Motif')    + '</th>';
    html += '<th>' + (isRtl ? 'الحالة'  : 'Statut')   + '</th>';
    html += '<th>' + (isRtl ? 'التاريخ' : 'Date')     + '</th>';
    html += '</tr></thead><tbody>';

    if (!filtered.length) {
      html += '<tr><td colspan="6" class="dhd-req-empty">' +
        (isRtl ? 'لا توجد طلبات' : 'Aucune demande') + '</td></tr>';
    } else {
      filtered.forEach(function (r) {
        var cls = STATUS_CLASSES[r.status] || {};
        var empName = [r.employeeFirstName, r.employeeLastName].filter(Boolean).join(' ') ||
                      r.employeeName || r.employeeCode || ('#' + r.employeeId);
        var typeName = TYPES.find(function (t) { return t.value === r.requestType; });
        typeName = typeName ? labelFor(typeName) : r.requestType;
        var amount = r.amount != null ? String(r.amount) + ' دج' :
                     r.days != null ? r.days + (isRtl ? ' يوم' : ' j') : '—';
        var reason = r.reason || r.notes || '—';
        var date = r.requestedAt ? r.requestedAt.slice(0, 10) : '—';
        var statusLabel = (isRtl
          ? { pending: 'قيد الانتظار', approved: 'مقبول', rejected: 'مرفوض' }
          : { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté' }
        )[r.status] || r.status;

        html += '<tr class="' + (cls.row || '') + '">';
        html += '<td>' + escapeHtml(empName) + '</td>';
        html += '<td>' + escapeHtml(typeName) + '</td>';
        html += '<td>' + escapeHtml(amount) + '</td>';
        html += '<td class="dhd-req-reason">' + escapeHtml(reason) + '</td>';
        html += '<td><span class="dhd-req-badge ' + (cls.badge || '') + '">' + escapeHtml(statusLabel) + '</span></td>';
        html += '<td>' + escapeHtml(date) + '</td>';
        html += '</tr>';
      });
    }
    html += '</tbody></table>';
    tableContainer.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadRequests() {
    fetch('/api/requests', { credentials: 'include', headers: authHeaders() })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) {
        requestsData = Array.isArray(data) ? data : [];
        renderTable(requestsData);
      })
      .catch(function () {});
  }

  function buildFilterBar() {
    if (filterBar) return filterBar;
    var lang = getLang();
    var isRtl = lang === 'ar';

    var bar = document.createElement('div');
    bar.className = 'dhd-req-filter-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', isRtl ? 'فلترة الطلبات' : 'Filtrer les demandes');
    bar.dir = isRtl ? 'rtl' : 'ltr';

    // Status filter
    var statusGroup = document.createElement('div');
    statusGroup.className = 'dhd-req-filter-group';
    STATUSES.forEach(function (s) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dhd-req-filter-btn' + (s.value === currentStatus ? ' is-active' : '');
      btn.textContent = labelFor(s);
      btn.dataset.value = s.value;
      btn.addEventListener('click', function () {
        currentStatus = s.value;
        statusGroup.querySelectorAll('.dhd-req-filter-btn').forEach(function (b) {
          b.classList.toggle('is-active', b.dataset.value === currentStatus);
        });
        renderTable(requestsData);
      });
      statusGroup.appendChild(btn);
    });
    bar.appendChild(statusGroup);

    // Type filter
    var typeGroup = document.createElement('div');
    typeGroup.className = 'dhd-req-filter-group';
    TYPES.forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dhd-req-filter-btn dhd-req-type-btn' + (t.value === currentType ? ' is-active' : '');
      btn.textContent = labelFor(t);
      btn.dataset.value = t.value;
      btn.addEventListener('click', function () {
        currentType = t.value;
        typeGroup.querySelectorAll('.dhd-req-filter-btn').forEach(function (b) {
          b.classList.toggle('is-active', b.dataset.value === currentType);
        });
        renderTable(requestsData);
      });
      typeGroup.appendChild(btn);
    });
    bar.appendChild(typeGroup);

    // Refresh button
    var refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'dhd-req-refresh-btn';
    refreshBtn.textContent = isRtl ? '⟳ تحديث' : '⟳ Actualiser';
    refreshBtn.addEventListener('click', loadRequests);
    bar.appendChild(refreshBtn);

    filterBar = bar;
    return bar;
  }

  function buildTableContainer() {
    if (tableContainer) return tableContainer;
    var container = document.createElement('div');
    container.className = 'dhd-req-table-wrap';
    tableContainer = container;
    return container;
  }

  function injectFilterPanel() {
    if (!isRequestsPage()) return;
    if (document.querySelector('.dhd-req-filter-bar')) return;

    // Try to find a content area to inject into
    var host = document.querySelector('main .space-y-6, main .space-y-7, main > div.flex-1 > div, [role="main"]');
    if (!host) host = document.querySelector('main');
    if (!host) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'dhd-req-panel';

    var heading = document.createElement('div');
    heading.className = 'dhd-req-panel-heading';
    var isRtl = document.documentElement.dir === 'rtl';
    heading.innerHTML = '<strong>' + (isRtl ? 'الطلبات الموحدة' : 'Demandes unifiées') + '</strong>' +
      '<span>' + (isRtl ? 'سلف · إجازات · عطل' : 'Avances · Congés · Vacances') + '</span>';

    wrapper.appendChild(heading);
    wrapper.appendChild(buildFilterBar());
    wrapper.appendChild(buildTableContainer());

    // Prepend so it appears above the existing page content
    host.insertBefore(wrapper, host.firstChild);

    loadRequests();
  }

  // Auto-poll requests every 5 seconds for real-time updates without manual refresh
  setInterval(function () {
    if (isRequestsPage()) {
      loadRequests();
    }
  }, 5000);

  // Style injection
  var style = document.createElement('style');
  style.textContent = [
    '.dhd-req-panel{margin-bottom:1.5rem;padding:1.1rem 1.25rem;border:1px solid hsl(var(--border));border-radius:1rem;background:hsl(var(--card));box-shadow:0 2px 8px rgb(15 23 42/.05)}',
    '.dhd-req-panel-heading{display:flex;align-items:baseline;gap:.6rem;margin-bottom:.85rem}',
    '.dhd-req-panel-heading strong{font-size:1rem;font-weight:700}',
    '.dhd-req-panel-heading span{font-size:.8rem;color:hsl(var(--muted-foreground))}',
    '.dhd-req-filter-bar{display:flex;flex-wrap:wrap;gap:.5rem .75rem;margin-bottom:.9rem;align-items:center}',
    '.dhd-req-filter-group{display:flex;flex-wrap:wrap;gap:.35rem}',
    '.dhd-req-filter-btn{border:1px solid hsl(var(--border));border-radius:.55rem;padding:.3rem .75rem;font:600 .78rem Changa,Inter,sans-serif;cursor:pointer;background:hsl(var(--background));color:hsl(var(--foreground));transition:background .15s,color .15s}',
    '.dhd-req-filter-btn.is-active{background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-color:hsl(var(--primary))}',
    '.dhd-req-refresh-btn{border:1px solid hsl(var(--border));border-radius:.55rem;padding:.3rem .75rem;font:.78rem Changa,Inter,sans-serif;cursor:pointer;background:transparent;color:hsl(var(--muted-foreground))}',
    '.dhd-req-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:.7rem;border:1px solid hsl(var(--border))}',
    '.dhd-req-table{width:100%;border-collapse:collapse;font-size:.82rem}',
    '.dhd-req-table th{padding:.55rem .8rem;font-weight:700;background:hsl(var(--muted)/.4);text-align:start;border-bottom:1px solid hsl(var(--border))}',
    '.dhd-req-table td{padding:.6rem .8rem;border-bottom:1px solid hsl(var(--border)/.5);vertical-align:middle}',
    '.dhd-req-table tr:last-child td{border-bottom:0}',
    '.dhd-req-table tbody tr:hover{background:hsl(var(--muted)/.2)}',
    '.dhd-req-empty{text-align:center;padding:1.5rem;color:hsl(var(--muted-foreground));font-size:.85rem}',
    '.dhd-req-reason{max-width:14rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dhd-req-badge{display:inline-block;padding:.2rem .55rem;border-radius:.4rem;font-size:.72rem;font-weight:700}',
    '.dhd-req-badge-pending{background:#fff8e1;color:#b45309}',
    '.dhd-req-badge-approved{background:#e8f5e9;color:#1b5e20}',
    '.dhd-req-badge-rejected{background:#fdecea;color:#b71c1c}',
    '.dhd-req-row-pending td{border-left:3px solid #f59e0b}',
    '.dhd-req-row-approved td{border-left:3px solid #4ade80}',
    '.dhd-req-row-rejected td{border-left:3px solid #f87171}',
    '@media(max-width:767px){.dhd-req-table{min-width:38rem}',
    '.dhd-req-filter-bar{gap:.35rem}.dhd-req-filter-btn{font-size:.72rem;padding:.25rem .55rem}}',
  ].join('');
  document.head.appendChild(style);

  // Watch for navigation to requests pages (SPA routing)
  var lastPath = window.location.pathname;
  var observer = new MutationObserver(function () {
    var path = window.location.pathname;
    if (path !== lastPath) {
      lastPath = path;
      filterBar = null;
      tableContainer = null;
      setTimeout(injectFilterPanel, 500);
    } else {
      injectFilterPanel();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setTimeout(injectFilterPanel, 600);
})();
