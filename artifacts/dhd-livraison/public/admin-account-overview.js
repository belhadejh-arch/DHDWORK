/*
 * Account overview for the compiled admin dashboard.
 * Shows the authenticated administrator's persisted identity and directs QR
 * management to Settings, where the imported application already renders the
 * scannable QR dialog.
 */
(function () {
  'use strict';

  var account = null;

  function isDashboard() {
    return /^\/dashboard\/?$/.test(window.location.pathname);
  }

  function isSettings() {
    return /^\/settings\/?$/.test(window.location.pathname);
  }

  function headers() {
    var token = window.localStorage.getItem('dhd_admin_token');
    return token ? { Authorization: 'Bearer ' + token, Accept: 'application/json' } : { Accept: 'application/json' };
  }

  function escapeHtml(value) {
    return String(value == null || value === '' ? '—' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fetchAccount() {
    if (account) return Promise.resolve(account);
    return fetch('/api/auth/me', { credentials: 'include', headers: headers() })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        account = data && data.userType === 'admin' ? data.admin : null;
        return account;
      })
      .catch(function () { return null; });
  }

  function getHost() {
    return document.querySelector('main > div.flex-1, main [class*="overflow-y-auto"], main') || document.querySelector('main');
  }

  function buildDashboardCard(admin) {
    var section = document.createElement('section');
    section.className = 'dhd-admin-account-card dhd-admin-account-card--dashboard';
    section.dir = 'rtl';
    section.innerHTML =
      '<div class="dhd-admin-account-card__heading"><span class="dhd-admin-account-card__icon" aria-hidden="true">◉</span>' +
      '<div><strong>حساب المسؤول</strong><span>بيانات الدخول المسجلة في النظام</span></div></div>' +
      '<div class="dhd-admin-account-card__fields">' +
      '<div><span>البريد الإلكتروني</span><b dir="ltr">' + escapeHtml(admin.email) + '</b></div>' +
      '<div><span>الرقم التسلسلي</span><b dir="ltr">' + escapeHtml(admin.serialNumber) + '</b></div>' +
      '</div><a href="/settings" class="dhd-admin-account-card__link">إدارة رمز QR والإعدادات ←</a>';
    return section;
  }

  function buildSettingsCard(admin) {
    var section = document.createElement('section');
    section.className = 'dhd-admin-account-card dhd-admin-account-card--settings';
    section.dir = 'rtl';
    section.innerHTML =
      '<div class="dhd-admin-account-card__heading"><span class="dhd-admin-account-card__icon" aria-hidden="true">◉</span>' +
      '<div><strong>بيانات حساب المسؤول</strong><span>تستخدم هذه البيانات للدخول إلى لوحة التحكم</span></div></div>' +
      '<div class="dhd-admin-account-card__fields">' +
      '<div><span>البريد الإلكتروني الأصلي</span><b dir="ltr">' + escapeHtml(admin.email) + '</b></div>' +
      '<div><span>الرقم التسلسلي</span><b dir="ltr">' + escapeHtml(admin.serialNumber) + '</b></div>' +
      '</div>' +
      '<div class="dhd-admin-account-card__qr">' +
      '<strong>رمز QR للدخول</strong><p>امسح هذا الرمز من شاشة تسجيل الدخول للدخول إلى حساب المسؤول. حافظ عليه بسرية لأنه يمثل بيانات دخول.</p>' +
      '<div class="dhd-admin-account-card__qr-image" data-admin-qr-image role="img" aria-label="رمز QR الخاص بالمسؤول"><span>جارٍ تحميل رمز QR…</span></div>' +
      '<div class="dhd-admin-account-card__qr-actions">' +
      '<button type="button" class="dhd-admin-account-card__copy" data-copy-admin-serial>نسخ الرقم التسلسلي</button>' +
      '<button type="button" class="dhd-admin-account-card__copy" data-refresh-admin-qr>توليد رمز QR جديد</button>' +
      '</div></div>';
    section.querySelector('[data-copy-admin-serial]').addEventListener('click', function (event) {
      var button = event.currentTarget;
      navigator.clipboard.writeText(String(admin.serialNumber || '')).then(function () {
        button.textContent = 'تم النسخ';
        window.setTimeout(function () { button.textContent = 'نسخ الرقم التسلسلي'; }, 1800);
      }).catch(function () {
        button.textContent = 'تعذر النسخ';
      });
    });
    section.querySelector('[data-refresh-admin-qr]').addEventListener('click', function (event) {
      var button = event.currentTarget;
      if (!window.confirm('سيتم إلغاء رمز QR القديم ولن يعمل بعد الآن. هل تريد المتابعة؟')) return;
      button.disabled = true;
      button.textContent = 'جارٍ التوليد…';
      fetch('/api/admins/' + encodeURIComponent(admin.id) + '/qrcode/regenerate', {
        method: 'POST',
        credentials: 'include',
        headers: headers()
      }).then(function (response) {
        if (!response.ok) throw new Error('تعذر توليد الرمز');
        return loadAdminQr(section, admin);
      }).then(function () {
        button.textContent = 'تم توليد رمز جديد';
        window.setTimeout(function () { button.textContent = 'توليد رمز QR جديد'; }, 1800);
      }).catch(function () {
        button.textContent = 'تعذر توليد الرمز';
      }).finally(function () {
        button.disabled = false;
      });
    });
    loadAdminQr(section, admin);
    return section;
  }

  function loadAdminQr(section, admin) {
    var container = section.querySelector('[data-admin-qr-image]');
    if (!container) return Promise.resolve();
    container.innerHTML = '<span>جارٍ تحميل رمز QR…</span>';
    return fetch('/api/admins/' + encodeURIComponent(admin.id) + '/qrcode.svg', {
      credentials: 'include',
      headers: headers()
    }).then(function (response) {
      if (!response.ok) throw new Error('تعذر تحميل رمز QR');
      return response.text();
    }).then(function (svg) {
      container.innerHTML = svg;
    }).catch(function () {
      container.innerHTML = '<span class="is-error">تعذر تحميل رمز QR. أعد تسجيل الدخول ثم حاول مرة أخرى.</span>';
    });
  }

  function mount() {
    if ((!isDashboard() && !isSettings()) || document.querySelector('.dhd-admin-account-card')) return;
    var host = getHost();
    if (!host) return;
    fetchAccount().then(function (admin) {
      if (!admin || document.querySelector('.dhd-admin-account-card')) return;
      var card = isSettings() ? buildSettingsCard(admin) : buildDashboardCard(admin);
      host.prepend(card);
    });
  }

  var observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', mount);
  mount();
})();