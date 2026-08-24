(function () {
  "use strict";

  function isLoginPage() {
    return /^\/(?:login)?\/?$/.test(window.location.pathname);
  }

  function enhanceForm() {
    if (!isLoginPage()) return;
    var identifier = document.querySelector('form input[name="email"]');
    var password = document.querySelector('form input[name="password"]');
    var form = identifier && identifier.closest("form");
    if (!identifier || !password || !form) return;

    identifier.setAttribute("type", "text");
    identifier.inputMode = "text";
    identifier.autocomplete = "username";
    identifier.placeholder = "البريد أو اسم المستخدم أو الرقم التسلسلي";
    form.noValidate = true;

    var label = identifier.closest("div")?.querySelector("label");
    if (label) label.textContent = "معرّف حساب الأدمن";

    if (form.dataset.dhdAdminIdentifiers === "1") return;
    form.dataset.dhdAdminIdentifiers = "1";

    form.addEventListener("submit", async function (event) {
      var value = identifier.value.trim();
      if (!value || value.includes("@")) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      var submit = form.querySelector('button[type="submit"]');
      if (submit) {
        submit.disabled = true;
        submit.dataset.originalText = submit.textContent || "";
        submit.textContent = "جارٍ تسجيل الدخول…";
      }

      try {
        var response = await fetch("/api/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: value, password: password.value }),
        });
        var body = await response.json().catch(function () { return null; });
        if (!response.ok || body?.userType !== "admin" || !body?.token) {
          throw new Error(body?.message || "بيانات الدخول غير صحيحة");
        }
        localStorage.setItem("dhd_admin_token", body.token);
        window.location.href = "/offices";
      } catch (error) {
        var existing = form.querySelector("[data-dhd-login-error]");
        if (!existing) {
          existing = document.createElement("p");
          existing.dataset.dhdLoginError = "1";
          existing.setAttribute("role", "alert");
          existing.style.cssText = "margin:.75rem 0 0;color:#dc2626;font-size:.875rem;text-align:center";
          form.appendChild(existing);
        }
        existing.textContent = error.message || "بيانات الدخول غير صحيحة";
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = submit.dataset.originalText || "تسجيل الدخول";
        }
      }
    }, true);
  }

  new MutationObserver(enhanceForm).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("pointerdown", enhanceForm, true);
  document.addEventListener("keydown", enhanceForm, true);
  window.setInterval(enhanceForm, 400);
  enhanceForm();
})();