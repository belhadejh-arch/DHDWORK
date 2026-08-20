(function () {
  'use strict';
  var json = function (url, options) {
    return fetch(url, Object.assign({ credentials: 'include' }, options || {})).then(function (r) {
      return r.text().then(function (text) {
        var payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = {}; }
        if (!r.ok) {
          var error = new Error(payload.message || ('فشل الطلب (' + r.status + ')'));
          error.status = r.status;
          throw error;
        }
        return payload;
      });
    });
  };
  var auth = function (key) { var t = localStorage.getItem(key); return t ? { Authorization: 'Bearer ' + t } : {}; };
  var esc = function (value) { var d = document.createElement('div'); d.textContent = value == null ? '' : String(value); return d.innerHTML; };
  var date = function (value) { try { return value ? new Intl.DateTimeFormat('ar-DZ', { dateStyle: 'medium' }).format(new Date(value)) : 'الآن'; } catch (_) { return 'الآن'; } };
  var css = [
    '.dhd-live-announcements{margin:0 auto 20px;max-width:960px;display:grid;gap:10px;font-family:inherit;direction:rtl}',
    '.dhd-live-announcements h2{font-size:14px;margin:0;color:#40362e}.dhd-live-announcements-head{display:flex;gap:9px;align-items:center}',
    '.dhd-live-announcement{position:relative;padding:15px 18px;border:1px solid #f0bd8c;border-right:4px solid #dd620d;border-radius:15px;background:linear-gradient(110deg,#fff8ed,#fff);box-shadow:0 8px 22px #5a361414;animation:dhdAnnIn .35s ease both}',
    '.dhd-live-announcement.important{border-right-color:#d69a1a;background:#fffbed}.dhd-live-announcement.urgent{border-right-color:#d33d35;background:#fff2f1}',
    '.dhd-live-announcement h3{font-size:15px;margin:5px 0;color:#40362e}.dhd-live-announcement p{font-size:12px;line-height:1.8;margin:0;color:#68594d;white-space:pre-wrap}.dhd-live-announcement small{font-size:10px;color:#a39488}',
    '.dhd-live-announcement .dhd-live-close{position:absolute;left:10px;top:10px;border:0;background:transparent;color:#a39488;font-size:22px;cursor:pointer}',
    '@keyframes dhdAnnIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}',
    '.dhd-admin-ann-page{min-height:100vh;background:#f7f4ef;padding:30px;direction:rtl;font-family:inherit;color:#40362e}.dhd-admin-ann-page>*{max-width:1060px;margin-left:auto;margin-right:auto}',
    '.dhd-admin-ann-page h1{margin:0 0 5px}.dhd-admin-ann-form,.dhd-admin-ann-list{background:#fffdfa;border:1px solid #eadfd4;border-radius:18px;padding:22px;margin-top:20px;box-shadow:0 8px 24px #503b280d}',
    '.dhd-admin-ann-form{display:grid;gap:13px}.dhd-admin-ann-form label{display:grid;gap:6px;font-size:12px;font-weight:700;color:#716258}.dhd-admin-ann-form input,.dhd-admin-ann-form textarea,.dhd-admin-ann-form select{font:inherit;border:1px solid #e5ddd5;border-radius:9px;padding:10px;background:#fff}.dhd-admin-ann-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:12px}',
    '.dhd-admin-ann-actions{display:flex;gap:8px}.dhd-admin-ann-actions button{border:0;border-radius:9px;padding:10px 16px;background:#dd620d;color:#fff;cursor:pointer;font-weight:700}.dhd-admin-ann-actions button.secondary{background:#eee5dc;color:#66584c}',
    '.dhd-admin-ann-row{display:flex;justify-content:space-between;gap:18px;border-top:1px solid #f0e9e2;padding:15px 0}.dhd-admin-ann-row h3{margin:3px 0;font-size:15px}.dhd-admin-ann-row p{font-size:12px;color:#76685d;white-space:pre-wrap}.dhd-admin-ann-row small{color:#a39488}.dhd-admin-ann-tools{display:flex;gap:5px;align-items:flex-start}.dhd-admin-ann-tools button{border:1px solid #e5ddd5;border-radius:7px;background:#fff;padding:7px;cursor:pointer}@media(max-width:620px){.dhd-admin-ann-page{padding:20px 14px}.dhd-admin-ann-grid{grid-template-columns:1fr}.dhd-admin-ann-row{display:block}.dhd-admin-ann-tools{margin-top:10px}}'
  ].join('');
  var addStyle = function () { if (!document.getElementById('dhd-announcement-style')) { var s = document.createElement('style'); s.id = 'dhd-announcement-style'; s.textContent = css; document.head.appendChild(s); } };

  function employeeBanner() {
    if (document.querySelector('.dhd-live-announcements')) return;
    json('/api/employee/announcements', { headers: auth('dhd_employee_token') }).then(function (items) {
      if (!Array.isArray(items) || !items.length) return;
      addStyle();
      var box = document.createElement('section'); box.className = 'dhd-live-announcements';
      box.innerHTML = '<div class="dhd-live-announcements-head"><span style="color:#dd620d">📣</span><h2>إعلانات الإدارة <small style="color:#a39488;font-weight:400">(' + items.filter(function (x) { return !x.isRead; }).length + ' جديد)</small></h2></div>';
      items.forEach(function (item) {
        var card = document.createElement('article'); card.className = 'dhd-live-announcement ' + esc(item.severity);
        card.innerHTML = '<button class="dhd-live-close" aria-label="إغلاق الإعلان">×</button><small>' + esc(item.severity === 'urgent' ? 'عاجل' : item.severity === 'important' ? 'مهم' : 'عادي') + ' · ' + esc(date(item.createdAt)) + '</small><h3>' + esc(item.title) + '</h3><p>' + esc(item.body) + '</p>';
        card.querySelector('.dhd-live-close').style.display = item.allowDismiss ? '' : 'none';
        card.querySelector('.dhd-live-close').onclick = function () { card.remove(); json('/api/employee/announcements/' + item.id + '/read', { method: 'POST', headers: auth('dhd_employee_token') }).catch(function () {}); };
        card.onclick = function () { json('/api/employee/announcements/' + item.id + '/read', { method: 'POST', headers: auth('dhd_employee_token') }).catch(function () {}); };
        box.appendChild(card);
      });
      var target = document.querySelector('.dhd-portal-content') || document.querySelector('main');
      if (target) target.insertBefore(box, target.firstChild);
    }).catch(function () {});
  }

  function adminPage() {
    addStyle();
    var root = document.getElementById('root'); root.innerHTML = '<main class="dhd-admin-ann-page"><div><p style="color:#dd620d">التواصل الداخلي</p><h1>الإعلانات</h1><p>إعلانات متحركة موجهة للموظفين مع متابعة المشاهدة.</p></div><form class="dhd-admin-ann-form"><div class="dhd-admin-ann-grid"><label>العنوان<input name="title" required></label><label>النوع<select name="severity"><option value="normal">عادي</option><option value="important">مهم</option><option value="urgent">عاجل</option></select></label></div><label>نص الإعلان<textarea name="body" rows="4" required></textarea></label><div class="dhd-admin-ann-grid"><label>مدة الظهور<select name="durationSeconds"><option value="0">بدون انتهاء</option><option value="86400">24 ساعة</option><option value="259200">3 أيام</option><option value="604800">7 أيام</option></select></label><label>المستهدفون<select name="audience"><option value="all">كل الموظفين</option><option value="selected">موظفون محددون</option></select></label></div><div class="dhd-ann-employee-picker" style="display:none"></div><label style="display:flex;align-items:center;gap:7px"><input type="checkbox" name="allowDismiss" checked> السماح بالإغلاق ×</label><div class="dhd-admin-ann-actions"><button>نشر الإعلان</button></div></form><section class="dhd-admin-ann-list"><h2>الإعلانات المنشورة</h2><div class="dhd-admin-ann-items">جارٍ التحميل...</div></section></main>';
    var form = root.querySelector('form'), list = root.querySelector('.dhd-admin-ann-items');
    var submitButton = form.querySelector('button[type="submit"]') || form.querySelector('button');
    var status = document.createElement('p');
    status.className = 'dhd-ann-form-status';
    status.setAttribute('role', 'status');
    form.insertBefore(status, form.firstChild);
    var picker = root.querySelector('.dhd-ann-employee-picker'), audience = form.audience;
    json('/api/employees', { headers: auth('dhd_admin_token') }).then(function (employees) { picker.innerHTML = (employees || []).map(function (e) { return '<label style="display:inline-flex;gap:5px;margin:5px;font-size:11px"><input type="checkbox" value="' + e.id + '"> ' + esc((e.firstName || '') + ' ' + (e.lastName || '')) + '</label>'; }).join(''); }).catch(function () {});
    audience.onchange = function () { picker.style.display = audience.value === 'selected' ? 'block' : 'none'; };
    function load() { json('/api/announcements', { headers: auth('dhd_admin_token') }).then(function (items) { list.innerHTML = items.length ? items.map(function (x) { return '<article class="dhd-admin-ann-row"><div><small>' + esc(x.severity) + ' · ' + (x.isActive ? 'نشط' : 'متوقف') + '</small><h3>' + esc(x.title) + '</h3><p>' + esc(x.body) + '</p><small>👁 ' + (x.readCount || 0) + ' شاهدوا · ' + (x.audience === 'all' ? 'كل الموظفين' : 'موظفون محددون') + '</small></div><div class="dhd-admin-ann-tools"><button data-stop="' + x.id + '">' + (x.isActive ? 'إيقاف' : 'تفعيل') + '</button><button data-delete="' + x.id + '">حذف</button></div></article>'; }).join('') : '<p>لا توجد إعلانات بعد.</p>'; list.querySelectorAll('[data-stop]').forEach(function (b) { b.onclick = function () { json('/api/announcements/' + b.dataset.stop, { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, auth('dhd_admin_token')), body: JSON.stringify({ isActive: b.textContent === 'تفعيل' }) }).then(load); }; }); list.querySelectorAll('[data-delete]').forEach(function (b) { b.onclick = function () { if (confirm('حذف هذا الإعلان؟')) json('/api/announcements/' + b.dataset.delete, { method: 'DELETE', headers: auth('dhd_admin_token') }).then(load); }; }); }).catch(function () { list.textContent = 'تعذر تحميل الإعلانات. تأكد من تسجيل الدخول كأدمن.'; }); }
    form.onsubmit = function (e) {
      e.preventDefault();
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'جارٍ النشر...'; }
      status.textContent = '';
      var data = Object.fromEntries(new FormData(form));
      data.allowDismiss = form.allowDismiss.checked;
      data.durationSeconds = Number(data.durationSeconds || 0);
      data.employeeIds = Array.from(picker.querySelectorAll('input:checked')).map(function (x) { return Number(x.value); });
      json('/api/announcements', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth('dhd_admin_token')), body: JSON.stringify(data) })
        .then(function () {
          form.reset();
          picker.style.display = 'none';
          status.style.color = '#16804b';
          status.textContent = 'تم نشر الإعلان بنجاح وسيظهر للموظفين خلال لحظات.';
          load();
        })
        .catch(function (error) {
          status.style.color = '#b42318';
          status.textContent = error.message || 'تعذر نشر الإعلان. تحقق من تسجيل الدخول والبيانات.';
        })
        .finally(function () {
          if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'نشر الإعلان'; }
        });
    };
    load();
  }

  function init() {
    if (location.pathname === '/announcements') {
      // The imported bundle mounts React after the document script runs.
      // Render after it settles so the compatibility page is not overwritten.
      window.setTimeout(adminPage, 350);
    }
    else if (location.pathname.indexOf('/portal') === 0 && location.pathname !== '/portal/login') { addStyle(); var observer = new MutationObserver(employeeBanner); observer.observe(document.body, { childList: true, subtree: true }); employeeBanner(); }
    if (location.pathname.indexOf('/portal') !== 0) {
      var addAdminLink = function () {
        var nav = document.querySelector('nav') || document.querySelector('aside') || document.querySelector('[role="navigation"]');
        var adminShell = document.querySelector('[data-testid="button-open-menu"]') || document.querySelector('[data-testid="button-close-menu"]');
        if (nav && adminShell && !document.querySelector('[data-dhd-announcements-link]')) {
          var a = document.createElement('a');
          a.href = '/announcements';
          a.dataset.dhdAnnouncementsLink = 'true';
          a.textContent = '📣 الإعلانات';
          a.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 16px;color:inherit;text-decoration:none;cursor:pointer';
          var notificationLink = Array.from(nav.querySelectorAll('a,button,[role="link"]')).find(function (node) {
            return (node.textContent || '').indexOf('الإشعارات') !== -1;
          });
          if (notificationLink && notificationLink.parentNode) {
            notificationLink.parentNode.insertBefore(a, notificationLink.nextSibling);
          } else {
            nav.appendChild(a);
          }
        }
      };
      addAdminLink();
      var adminObserver = new MutationObserver(addAdminLink);
      adminObserver.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(addAdminLink, 500);
      window.setTimeout(addAdminLink, 1500);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();