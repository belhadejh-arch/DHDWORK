(() => {
  "use strict";

  let latestPreview = null;
  let latestPreviewUrl = "";
  const originalFetch = window.fetch.bind(window);

  const formatAmount = (value) =>
    `${Number(value || 0).toLocaleString("ar-DZ")} دج`;

  const adminHeaders = (accept = "application/json") => {
    const headers = new Headers({ Accept: accept });
    const token = localStorage.getItem("dhd_admin_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  };

  const fetchAdminJson = async (path, options = {}) => {
    const headers = adminHeaders();
    if (options.body) headers.set("Content-Type", "application/json");
    const response = await originalFetch(path, {
      ...options,
      credentials: "include",
      headers,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || body?.error || `HTTP ${response.status}`);
    return body;
  };

  const notify = (message) => {
    const note = document.createElement("div");
    note.className = "dhd-salary-review-toast";
    note.textContent = message;
    document.body.appendChild(note);
    window.setTimeout(() => note.remove(), 3600);
  };

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const input = args[0];
    const requestUrl = typeof input === "string" ? input : input?.url || "";
    if (requestUrl.includes("/salaries/preview?") && response.ok) {
      response.clone().json().then((payload) => {
        latestPreview = payload;
        latestPreviewUrl = payload.previewPdfUrl || "";
        window.setTimeout(enhanceSalaryReview, 0);
      }).catch(() => {});
    }
    return response;
  };

  async function openPreviewPdf(button) {
    if (!latestPreviewUrl) {
      notify("تعذر تحديد رابط معاينة PDF");
      return;
    }

    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      notify("اسمح بفتح النوافذ المنبثقة لعرض كشف الراتب");
      return;
    }

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = "جارٍ إنشاء PDF...";
    try {
      popup.document.title = "جارٍ تجهيز كشف الراتب";
      popup.document.body.dir = "rtl";
      popup.document.body.innerHTML = "<p style='font-family: sans-serif; padding: 24px'>جارٍ تجهيز معاينة كشف الراتب...</p>";
      const headers = adminHeaders("application/pdf");
      const response = await originalFetch(latestPreviewUrl, {
        credentials: "include",
        headers,
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      if (blob.type !== "application/pdf") throw new Error("الاستجابة ليست ملف PDF");
      const objectUrl = URL.createObjectURL(blob);
      popup.location.replace(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
    } catch (error) {
      popup.close();
      console.error("[salary-review] PDF preview failed", error);
      notify("تعذر فتح معاينة PDF");
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function addStandaloneReviewButtons() {
    document.querySelectorAll("button").forEach((payButton) => {
      if (payButton.textContent?.trim() !== "دفع" || payButton.dataset.dhdReviewBound === "1") return;
      const row = payButton.closest("tr");
      if (!row) return;
      payButton.dataset.dhdReviewBound = "1";

      const reviewButton = document.createElement("button");
      reviewButton.type = "button";
      reviewButton.className = "dhd-salary-review-trigger";
      reviewButton.textContent = "مراجعة الكشف";
      reviewButton.title = "راجع الحساب وPDF قبل تنفيذ الدفع";
      reviewButton.addEventListener("click", () => payButton.click());
      payButton.parentElement?.insertBefore(reviewButton, payButton);
    });
  }

  function addGeneratedSalaryGuards() {
    document.querySelectorAll("tr button.bg-emerald-600").forEach((button) => {
      const label = button.textContent?.trim() || "";
      if (label === "دفع" || label.includes("تأكيد") || button.dataset.dhdGeneratedReviewPay === "1") return;
      button.dataset.dhdGeneratedReviewPay = "1";
      button.textContent = "مراجعة ثم دفع";
      button.title = "لا يمكن الدفع قبل مراجعة الكشف";
    });
  }

  function closeGeneratedReview() {
    document.querySelector("[data-dhd-generated-review-overlay]")?.remove();
  }

  async function showGeneratedSalaryReview(payButton) {
    closeGeneratedReview();
    const row = payButton.closest("tr");
    const employeeLink = row?.querySelector('a[href*="/employees/"]');
    const employeeId = Number(employeeLink?.getAttribute("href")?.match(/employees\/(\d+)/)?.[1]);
    const period = row?.textContent?.match(/(0[1-9]|1[0-2])\/(20\d{2})/);
    if (!employeeId || !period) {
      notify("تعذر تحديد بيانات الراتب للمراجعة");
      return;
    }

    const month = period[1];
    const year = Number(period[2]);
    const overlay = document.createElement("div");
    overlay.dataset.dhdGeneratedReviewOverlay = "1";
    overlay.className = "dhd-generated-review-overlay";
    overlay.innerHTML = `
      <section role="dialog" aria-modal="true" aria-label="مراجعة كشف الراتب قبل الدفع" class="dhd-generated-review-dialog">
        <header>
          <div>
            <h2>مراجعة كشف الراتب قبل الدفع</h2>
            <p class="dhd-generated-review-name"></p>
          </div>
          <button type="button" class="dhd-generated-review-close" aria-label="إغلاق">×</button>
        </header>
        <div class="dhd-generated-review-body">
          <p class="dhd-generated-review-loading">جارٍ تحميل الحساب الحي من PostgreSQL...</p>
        </div>
      </section>
    `;
    overlay.querySelector(".dhd-generated-review-name").textContent =
      `${employeeLink.textContent?.trim() || "الموظف"} — ${month}/${year}`;
    overlay.querySelector(".dhd-generated-review-close").addEventListener("click", closeGeneratedReview);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeGeneratedReview();
    });
    document.body.appendChild(overlay);

    try {
      const [preview, salaryRows] = await Promise.all([
        fetchAdminJson(`/api/salaries/preview?employeeId=${employeeId}&month=${month}&year=${year}`),
        fetchAdminJson(`/api/salaries?employeeId=${employeeId}`),
      ]);
      const salary = salaryRows.find((item) =>
        String(item.month).padStart(2, "0") === month &&
        Number(item.year) === year &&
        item.status !== "paid"
      );
      if (!salary) throw new Error("تعذر العثور على سجل راتب غير مدفوع");

      latestPreview = preview;
      latestPreviewUrl = preview.previewPdfUrl || "";
      const summary = preview.summary || preview;
      const body = overlay.querySelector(".dhd-generated-review-body");
      body.innerHTML = `
        <div class="dhd-salary-review-state">
          <strong>قيد المراجعة قبل الدفع</strong>
          <span>الحساب أدناه حي، ولن يصبح الراتب مدفوعًا إلا بعد الضغط على زر التأكيد النهائي.</span>
        </div>
        <div class="dhd-generated-review-breakdown">
          <div><span>الراتب الأساسي</span><b>${formatAmount(summary.baseSalary)}</b></div>
          <div><span>المكافآت والإضافي</span><b class="positive">+ ${formatAmount(Number(summary.bonusTotal || 0) + Number(summary.overtimeBonus || 0))}</b></div>
          <div><span>خصم الغياب</span><b class="negative">- ${formatAmount(summary.absenceDeduction)}</b></div>
          <div><span>إجمالي الخصومات</span><b class="negative">- ${formatAmount(summary.totalDeductions)}</b></div>
          <div class="net"><span>صافي الراتب النهائي</span><b>${formatAmount(summary.finalSalary)}</b></div>
        </div>
        <div class="dhd-generated-review-actions"></div>
      `;

      const actions = body.querySelector(".dhd-generated-review-actions");
      const pdfButton = document.createElement("button");
      pdfButton.type = "button";
      pdfButton.className = "dhd-salary-preview-pdf";
      pdfButton.textContent = "فتح PDF قبل الدفع";
      pdfButton.addEventListener("click", () => openPreviewPdf(pdfButton));

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "dhd-generated-review-confirm";
      confirmButton.textContent = "تأكيد الدفع وإشعار الموظف";
      confirmButton.addEventListener("click", async () => {
        confirmButton.disabled = true;
        confirmButton.textContent = "جارٍ تنفيذ الدفع...";
        try {
          await fetchAdminJson(`/api/salaries/${salary.id}/pay`, { method: "PATCH" });
          closeGeneratedReview();
          notify("تم دفع الراتب وتجميد كشفه النهائي");
          window.setTimeout(() => location.reload(), 700);
        } catch (error) {
          console.error("[salary-review] payment failed", error);
          notify(error.message || "تعذر تنفيذ الدفع");
          confirmButton.disabled = false;
          confirmButton.textContent = "تأكيد الدفع وإشعار الموظف";
        }
      });
      actions.append(pdfButton, confirmButton);
    } catch (error) {
      console.error("[salary-review] generated salary review failed", error);
      overlay.querySelector(".dhd-generated-review-body").innerHTML =
        `<p class="dhd-generated-review-error">تعذر تحميل مراجعة الراتب. أغلق النافذة وحاول مرة أخرى.</p>`;
    }
  }

  function decoratePaymentDialog() {
    if (!latestPreview) return;
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const dialog = dialogs.find((item) => item.textContent?.includes("صرف الراتب"));
    if (!dialog) return;

    const previous = dialog.querySelector("[data-dhd-salary-review-summary]");
    if (previous?.dataset.previewAt === String(latestPreview.summary?.calculatedAt || "")) return;
    previous?.remove();

    const confirmButton = Array.from(dialog.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("تأكيد الدفع"));
    const footer = confirmButton?.parentElement;
    if (!footer) return;

    const summary = latestPreview.summary || latestPreview;
    const box = document.createElement("section");
    box.dataset.dhdSalaryReviewSummary = "1";
    box.dataset.previewAt = String(summary.calculatedAt || "");
    box.className = "dhd-salary-review-summary";
    box.innerHTML = `
      <div class="dhd-salary-review-state">
        <strong>قيد المراجعة قبل الدفع</strong>
        <span>فتح المعاينة أو PDF لا يغيّر حالة الراتب إلى مدفوع.</span>
      </div>
      <div class="dhd-salary-review-totals">
        <div><span>خصم الغياب</span><b>${formatAmount(summary.absenceDeduction)}</b></div>
        <div><span>إجمالي الخصومات</span><b>${formatAmount(summary.totalDeductions)}</b></div>
      </div>
    `;

    const pdfButton = document.createElement("button");
    pdfButton.type = "button";
    pdfButton.className = "dhd-salary-preview-pdf";
    pdfButton.textContent = "فتح PDF قبل الدفع";
    pdfButton.addEventListener("click", () => openPreviewPdf(pdfButton));
    box.appendChild(pdfButton);
    dialog.insertBefore(box, footer);
  }

  function enhanceSalaryReview() {
    if (!location.pathname.includes("/salaries")) return;
    addStandaloneReviewButtons();
    addGeneratedSalaryGuards();
    decoratePaymentDialog();
  }

  const style = document.createElement("style");
  style.textContent = `
    .dhd-salary-review-trigger,
    .dhd-salary-preview-pdf {
      min-height: 2rem;
      border: 1px solid #f59e0b;
      border-radius: .5rem;
      padding: .35rem .7rem;
      background: #fff7ed;
      color: #9a3412;
      font: inherit;
      font-size: .75rem;
      font-weight: 700;
      cursor: pointer;
    }
    .dhd-salary-review-trigger:hover,
    .dhd-salary-preview-pdf:hover { background: #ffedd5; }
    .dhd-salary-review-summary {
      display: grid;
      gap: .75rem;
      margin-top: .25rem;
      border: 1px solid #fed7aa;
      border-radius: .75rem;
      padding: .8rem;
      background: #fffaf3;
    }
    .dhd-salary-review-state {
      display: grid;
      gap: .2rem;
      color: #7c2d12;
      font-size: .78rem;
    }
    .dhd-salary-review-state span { color: #78716c; font-weight: 500; }
    .dhd-salary-review-totals { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
    .dhd-salary-review-totals > div {
      display: grid;
      gap: .15rem;
      border-radius: .55rem;
      padding: .55rem .65rem;
      background: white;
      color: #78716c;
      font-size: .72rem;
    }
    .dhd-salary-review-totals b { color: #be123c; font-size: .9rem; }
    .dhd-salary-preview-pdf { width: 100%; }
    .dhd-salary-review-toast {
      position: fixed;
      inset-inline: 1rem;
      bottom: 1.25rem;
      z-index: 99999;
      max-width: 28rem;
      margin-inline: auto;
      border-radius: .7rem;
      padding: .8rem 1rem;
      background: #7f1d1d;
      color: white;
      text-align: center;
      font-weight: 700;
      box-shadow: 0 12px 30px rgb(0 0 0 / .22);
    }
    .dhd-generated-review-overlay {
      position: fixed;
      inset: 0;
      z-index: 9998;
      display: grid;
      place-items: center;
      padding: 1rem;
      background: rgb(15 23 42 / .58);
      backdrop-filter: blur(3px);
    }
    .dhd-generated-review-dialog {
      width: min(100%, 34rem);
      max-height: calc(100dvh - 2rem);
      overflow: auto;
      border-radius: 1rem;
      padding: 1rem;
      background: hsl(var(--background, 0 0% 100%));
      color: hsl(var(--foreground, 222 47% 11%));
      box-shadow: 0 24px 70px rgb(0 0 0 / .28);
    }
    .dhd-generated-review-dialog > header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .dhd-generated-review-dialog h2 { margin: 0; font-size: 1.15rem; }
    .dhd-generated-review-dialog header p { margin: .2rem 0 0; color: #64748b; font-size: .8rem; }
    .dhd-generated-review-close {
      border: 0;
      background: transparent;
      color: #64748b;
      font-size: 1.6rem;
      line-height: 1;
      cursor: pointer;
    }
    .dhd-generated-review-body { display: grid; gap: .85rem; }
    .dhd-generated-review-loading,
    .dhd-generated-review-error { margin: 1rem 0; color: #64748b; text-align: center; }
    .dhd-generated-review-error { color: #b91c1c; }
    .dhd-generated-review-breakdown {
      display: grid;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      border-radius: .75rem;
    }
    .dhd-generated-review-breakdown > div {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: .65rem .8rem;
      border-bottom: 1px solid #e2e8f0;
      font-size: .82rem;
    }
    .dhd-generated-review-breakdown > div:last-child { border-bottom: 0; }
    .dhd-generated-review-breakdown span { color: #64748b; }
    .dhd-generated-review-breakdown .positive { color: #15803d; }
    .dhd-generated-review-breakdown .negative { color: #be123c; }
    .dhd-generated-review-breakdown .net { background: #fff7ed; font-weight: 800; }
    .dhd-generated-review-breakdown .net b { color: #c2410c; font-size: 1rem; }
    .dhd-generated-review-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .65rem; }
    .dhd-generated-review-confirm {
      min-height: 2.35rem;
      border: 0;
      border-radius: .55rem;
      padding: .45rem .7rem;
      background: #059669;
      color: white;
      font: inherit;
      font-size: .78rem;
      font-weight: 800;
      cursor: pointer;
    }
    .dhd-generated-review-confirm:hover { background: #047857; }
    .dhd-generated-review-confirm:disabled { opacity: .65; cursor: wait; }
    @media (max-width: 640px) {
      .dhd-salary-review-totals { grid-template-columns: 1fr; }
      .dhd-salary-review-trigger { width: 100%; }
      .dhd-generated-review-actions { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);

  new MutationObserver(enhanceSalaryReview).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener("click", (event) => {
    const payButton = event.target.closest?.("button[data-dhd-generated-review-pay='1']");
    if (!payButton || !location.pathname.includes("/salaries")) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showGeneratedSalaryReview(payButton);
  }, true);
  window.addEventListener("popstate", enhanceSalaryReview);
  window.setTimeout(enhanceSalaryReview, 800);
})();