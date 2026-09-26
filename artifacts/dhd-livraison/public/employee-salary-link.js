(() => {
  "use strict";
  const id = "dhd-employee-detailed-payslip-link";
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
  `;
  document.head.appendChild(style);

  function sync() {
    const visible = /^\/portal(?:\/account)?\/?$/.test(location.pathname);
    const existing = document.getElementById(id);
    if (!visible) {
      existing?.remove();
      return;
    }
    if (existing) return;
    // Place the link outside React's root so a React rerender cannot remove
    // an injected node and crash the employee account.
    const link = document.createElement("a");
    link.id = id;
    link.href = "/employee-payslip.html";
    link.textContent = "كشف الراتب المفصل";
    document.body.appendChild(link);
  }
  sync();
  window.addEventListener("popstate", sync);
  window.setInterval(sync, 800);
})();