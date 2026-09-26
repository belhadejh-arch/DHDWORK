(() => {
  const target = "/admin-attendance.html";
  function redirect() {
    if (/^\/attendance\/?$/.test(location.pathname)) {
      location.replace(target + location.search);
    }
  }
  redirect();
  document.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target?.closest?.("a[href]");
    if (link && link.origin === location.origin && /^\/attendance\/?$/.test(link.pathname)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(target);
    }
  }, true);
  window.addEventListener("popstate", redirect);
  window.setInterval(redirect, 400);
})();