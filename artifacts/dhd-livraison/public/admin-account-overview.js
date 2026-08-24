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

  function authenticatedFetch(url, options) {
    var requestOptions = Object.assign({}, options || {}, {
      credentials: 'include',
      headers: Object.assign({}, headers(), options && options.headers ? options.headers : {})
    });
    return fetch(url, requestOptions).then(function (response) {
      if ((response.status !== 401 && response.status !== 403) || !requestOptions.headers.Authorization) {
        return response;
      }
      var cookieOptions = Object.assign({}, requestOptions, {
        headers: Object.assign({}, requestOptions.headers)
      });
      delete cookieOptions.headers.Authorization;
      return fetch(url, cookieOptions);
    });
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
    return authenticatedFetch('/api/auth/me')
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        account = data && data.userType === 'admin' ? data.admin : null;
        return account;
      })
      .catch(function () { return null; });
  }

  function getSettingsContent() {
    var main = document.querySelector('main, [role="main"]');
    if (!main) return null;
    return main.querySelector('.max-w-4xl.space-y-6, .space-y-6.max-w-4xl');
  }

  function getDashboardHost() {
    return document.querySelector('main > div.flex-1, main [class*="overflow-y-auto"], main') || document.querySelector('main');
  }

  function placeSettingsCard(card) {
    var content = getSettingsContent();
    if (!content) return false;
    var firstSettingsCard = Array.from(content.children).find(function (child, index) {
      return index > 0 && child.querySelector && child.querySelector('form, [class*="CardContent"]');
    });
    if (firstSettingsCard && firstSettingsCard.nextSibling) {
      content.insertBefore(card, firstSettingsCard.nextSibling);
    } else {
      content.appendChild(card);
    }
    return true;
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
      authenticatedFetch('/api/admins/' + encodeURIComponent(admin.id) + '/qrcode/regenerate', {
        method: 'POST',
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
    return authenticatedFetch('/api/admins/' + encodeURIComponent(admin.id) + '/qrcode.svg?ts=' + Date.now(), {
      headers: { Accept: 'image/svg+xml' }
    }).then(function (response) {
      if (!response.ok || !String(response.headers.get('content-type') || '').includes('image/svg+xml')) {
        throw new Error('تعذر تحميل رمز QR');
      }
      return response.blob();
    }).then(function (blob) {
      var image = new Image();
      image.alt = 'رمز QR الخاص بالمسؤول';
      image.width = 220;
      image.height = 220;
      image.src = URL.createObjectURL(blob);
      image.addEventListener('load', function () { URL.revokeObjectURL(image.src); }, { once: true });
      container.replaceChildren(image);
    }).catch(function () {
      container.innerHTML = '<span class="is-error">تعذر تحميل رمز QR. أعد تسجيل الدخول ثم حاول مرة أخرى.</span>';
    });
  }

  function mount() {
    if ((!isDashboard() && !isSettings()) || document.querySelector('.dhd-admin-account-card')) return;
    fetchAccount().then(function (admin) {
      if (!admin || document.querySelector('.dhd-admin-account-card')) return;
      var card = isSettings() ? buildSettingsCard(admin) : buildDashboardCard(admin);
      if (isSettings()) {
        placeSettingsCard(card);
      } else {
        var host = getDashboardHost();
        if (host) host.prepend(card);
      }
    });
  }

  var observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', mount);
  mount();
})();