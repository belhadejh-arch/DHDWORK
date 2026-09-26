(() => {
  "use strict";
  const id = "dhd-employee-detailed-payslip-link";
  const adminId = "dhd-admin-readonly-payslip-link";
  const style = document.createElement("style");
  style.textContent = `
    #${id} {
      position: fixed;
      z-index: 900;
      right: 16px;
      bottom: calc(78px + env(safe-area-inset-bottom, 0px));
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      max-width: calc(100vw - 32px);
      padding: 8px 16px;
      border-radius: 999px;
      background: #f97316;
      color: #fff;
      font: 700 14px/1.4 system-ui, sans-serif;
      text-decoration: none;
      box-shadow: 0 8px 22px rgb(30 41 59 / .25);
    }
    #${id}:focus-visible { outline: 3px solid #172b4d; outline-offset: 3px; }
    #${adminId} {
      position: fixed;
      z-index: 900;
      left: 16px;
      bottom: calc(78px + env(safe-area-inset-bottom, 0px));
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      max-width: calc(50vw - 24px);
      padding: 8px 14px;
      border: 1px solid #155e75;
      border-radius: 999px;
      background: #ecfeff;
      color: #164e63;
      font: 700 14px/1.4 system-ui, sans-serif;
      text-decoration: none;
      box-shadow: 0 8px 22px rgb(30 41 59 / .2);
    }
    #${adminId}:focus-visible { outline: 3px solid #172b4d; outline-offset: 3px; }
  `;
  document.head.appendChild(style);

  function sync() {
    const portalVisible = /^\/portal(?:\/|$)/.test(location.pathname) &&
      !/^\/portal\/login\/?$/.test(location.pathname);
    const existing = document.getElementById(id);
    if (!portalVisible) {
      existing?.remove();
    } else if (!existing) {
      // Keep the employee entry point outside React's root on every portal route.
      const link = document.createElement("a");
      link.id = id;
      link.href = "/employee-payslip.html";
      link.textContent = "كشف الراتب المفصل";
      document.body.appendChild(link);
    }

    const adminVisible = /^\/salaries(?:\/|$)/.test(location.pathname);
    const adminExisting = document.getElementById(adminId);
    if (!adminVisible) {
      adminExisting?.remove();
    } else if (!adminExisting) {
      // This independently navigates to a standalone, GET-only payslip page.
      const adminLink = document.createElement("a");
      adminLink.id = adminId;
      adminLink.href = "/admin-payslip.html";
      adminLink.textContent = "كشف راتب الموظف · قراءة فقط";
      document.body.appendChild(adminLink);
    }
  }
  sync();
  window.addEventListener("popstate", sync);
  window.setInterval(sync, 800);
})();