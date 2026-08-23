/*
 * Employee detail safety layer.
 *
 * The legacy admin application is delivered as a compiled bundle.  This
 * lightweight route layer guarantees that opening /employees/:id always has a
 * usable state (loading, details, or an explicit error) rather than exposing a
 * blank screen when that legacy view fails to render.
 */
(function () {
  'use strict';

  var overlayId = 'dhd-employee-detail-safe-view';
  var currentEmployeeId = null;
  var routeLockedId = getEmployeeId();

  function getEmployeeId() {
    var match = window.location.pathname.match(/^\/employees\/(\d+)\/?$/);
    return match ? match[1] : null;
  }

  function getHeaders() {
    var token = window.localStorage.getItem('dhd_admin_token');
    return token ? { Authorization: 'Bearer ' + token, Accept: 'application/json' } : { Accept: 'application/json' };
  }

  function text(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback || '—';
    return String(value);
  }

  function fullName(employee) {
    var name = [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim();
    return name || employee.name || employee.employeeCode || employee.serialNumber || 'موظف DHD';
  }

  function createShell() {
    var existing = document.getElementById(overlayId);
    if (existing) return existing;

    var element = document.createElement('section');
    element.id = overlayId;
    element.className = 'dhd-safe-detail';
    element.setAttribute('dir', document.documentElement.dir || 'rtl');
    document.body.appendChild(element);
    return element;
  }

  function hideShell() {
    var element = document.getElementById(overlayId);
    if (element) element.remove();
    currentEmployeeId = null;
  }

  function renderLoading() {
    var shell = createShell();
    shell.innerHTML = '<div class="dhd-safe-detail__panel dhd-safe-detail__state" role="status">' +
      '<span class="dhd-safe-detail__spinner" aria-hidden="true"></span>' +
      '<strong>جارٍ تحميل معلومات الموظف…</strong>' +
      '<span>يتم جلب البيانات المسجلة في النظام.</span>' +
      '</div>';
  }

  function renderError(message) {
    var shell = createShell();
    shell.innerHTML = '<div class="dhd-safe-detail__panel dhd-safe-detail__state" role="alert">' +
      '<div class="dhd-safe-detail__error-icon" aria-hidden="true">!</div>' +
      '<strong>تعذر عرض معلومات الموظف</strong>' +
      '<span>' + text(message, 'تأكد من وجود الموظف ومن اتصالك بالنظام.') + '</span>' +
      '<div class="dhd-safe-detail__actions">' +
      '<button type="button" class="dhd-safe-detail__secondary" data-safe-back>العودة إلى الموظفين</button>' +
      '<button type="button" class="dhd-safe-detail__primary" data-safe-retry>إعادة المحاولة</button>' +
      '</div></div>';
    shell.querySelector('[data-safe-back]').addEventListener('click', function () {
      window.location.assign('/employees');
    });
    shell.querySelector('[data-safe-retry]').addEventListener('click', function () {
      loadEmployee(currentEmployeeId);
    });
  }

  function item(label, value) {
    return '<div class="dhd-safe-detail__item"><span>' + label + '</span><strong>' + text(value) + '</strong></div>';
  }

  function renderEmployee(employee) {
    var shell = createShell();
    var initials = fullName(employee).split(/\s+/).slice(0, 2).map(function (part) {
      return part.charAt(0);
    }).join('') || 'D';
    var active = employee.isActive !== false && !employee.deletedAt;
    var status = active ? 'نشط' : 'غير نشط';
    shell.innerHTML = '<div class="dhd-safe-detail__panel">' +
      '<header class="dhd-safe-detail__header">' +
      '<button type="button" class="dhd-safe-detail__back" data-safe-back aria-label="العودة إلى قائمة الموظفين">← <span>الموظفون</span></button>' +
      '<span class="dhd-safe-detail__status ' + (active ? 'is-active' : 'is-inactive') + '">' + status + '</span>' +
      '</header>' +
      '<div class="dhd-safe-detail__hero">' +
      '<div class="dhd-safe-detail__avatar" aria-hidden="true">' + initials + '</div>' +
      '<div><p>ملف الموظف</p><h1>' + fullName(employee) + '</h1>' +
      '<span>' + text(employee.jobTitle || employee.position || employee.role, 'موظف') + '</span></div></div>' +
      '<div class="dhd-safe-detail__grid">' +
      item('الرقم التسلسلي', employee.serialNumber || employee.employeeCode) +
      item('البريد الإلكتروني', employee.email) +
      item('رقم الهاتف', employee.phone || employee.phoneNumber) +
      item('المكتب', employee.officeName || employee.office) +
      item('تاريخ التوظيف', employee.hireDate || employee.joinedAt) +
      item('وقت العمل', employee.workStartTime && employee.workEndTime ? employee.workStartTime + ' — ' + employee.workEndTime : null) +
      item('الراتب الأساسي', employee.baseSalary || employee.salary) +
      item('يوم الدفع', employee.paymentDay) +
      '</div>' +
      '<div class="dhd-safe-detail__footer">هذه البيانات معروضة مباشرة من ملف الموظف المحفوظ في النظام.</div>' +
      '</div>';
    shell.querySelector('[data-safe-back]').addEventListener('click', function () {
      window.location.assign('/employees');
    });
  }

  function loadEmployee(id) {
    if (!id) return hideShell();
    currentEmployeeId = id;
    routeLockedId = id;
    renderLoading();
    fetch('/api/employees/' + encodeURIComponent(id), { credentials: 'include', headers: getHeaders() })
      .then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (body) {
            throw new Error(body.message || (response.status === 404 ? 'الموظف غير موجود أو تم حذفه.' : 'حدث خطأ أثناء جلب بيانات الموظف.'));
          });
        }
        return response.json();
      })
      .then(function (employee) {
        if (getEmployeeId() === id) renderEmployee(employee || {});
      })
      .catch(function (error) {
        if (getEmployeeId() === id) renderError(error.message);
      });
  }

  function syncRoute() {
    var id = getEmployeeId();
    if (!id) return hideShell();
    routeLockedId = id;
    if (id !== currentEmployeeId || !document.getElementById(overlayId)) loadEmployee(id);
  }

  ['pushState', 'replaceState'].forEach(function (method) {
    var original = history[method];
    history[method] = function () {
      var nextUrl = arguments.length > 2 && arguments[2]
        ? new URL(String(arguments[2]), window.location.href)
        : null;
      if (routeLockedId && nextUrl && !new RegExp('^/employees/' + routeLockedId + '/?$').test(nextUrl.pathname)) {
        return;
      }
      var result = original.apply(this, arguments);
      routeLockedId = getEmployeeId();
      window.setTimeout(syncRoute, 0);
      return result;
    };
  });

  window.addEventListener('popstate', function () {
    routeLockedId = null;
    syncRoute();
  });
  document.addEventListener('DOMContentLoaded', syncRoute);
  if (document.readyState !== 'loading') syncRoute();
})();