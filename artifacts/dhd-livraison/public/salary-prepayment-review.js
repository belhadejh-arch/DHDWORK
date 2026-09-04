(() => {
  "use strict";
  let latestPreview = null;
  let latestPreviewUrl = "";
  const originalFetch = window.fetch.bind(window);
  const formatAmount = (value) =>
    `${Number(value || 0).toLocaleString("ar-DZ")} دج`;
  const escapeHtml = (value) => String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? String(value).slice(0, 10)
      : date.toLocaleDateString("ar-DZ");
  };
  const detailTable = (title, headers, rows, empty) => `
    <section class="dhd-review-detail-section">
      <h3>${escapeHtml(title)}</h3>
      <div class="dhd-review-detail-scroll">
        <table class="dhd-review-detail-table">
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>${rows.length
            ? rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")
            : `<tr><td colspan="${headers.length}" class="empty">${escapeHtml(empty)}</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
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
  const getSalaryContext = (button) => {
    const row = button.closest("tr");
    const employeeLink = row?.querySelector('a[href*="/employees/"]');
    const employeeId = Number(employeeLink?.getAttribute("href")?.match(/employees\/(\d+)/)?.[1]);
    const currentDate = new Date();
    const period = row?.textContent?.match(/(0[1-9]|1[0-2])\s*[\/-]\s*(20\d{2})/) || [
      "",
      String(currentDate.getMonth() + 1).padStart(2, "0"),
      String(currentDate.getFullYear()),
    ];
    return {
      row,
      employeeLink,
      employeeId,
      month: period[1],
      year: Number(period[2]),
    };
  };
  window.fetch = async (...args) => {
    // The currently shipped employee portal bundle predates the /api proxy
    // prefix for receipt confirmation. Normalize that one legacy request at
    // the boundary so it reaches the API service instead of the Vite app.
    const requestArgs = [...args];
    if (
      typeof requestArgs[0] === "string" &&
      /^\/employee\/salaries\/\d+\/receive(?:\?|$)/.test(requestArgs[0])
    ) {
      requestArgs[0] = `/api${requestArgs[0]}`;
    }
    const response = await originalFetch(...requestArgs);
    const input = requestArgs[0];
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
      const label = payButton.textContent?.trim() || "";
      if (label !== "تحويل" && label !== "دفع") return;
      if (payButton.dataset.dhdReviewBound === "1") return;
      const row = payButton.closest("tr");
      if (!row) return;
      payButton.dataset.dhdReviewBound = "1";
      // The imported React salary page's handler opens the live review dialog.
      // Do not relabel that same control as "تحويل": doing so makes the
      // transfer button look executable while it only opens the review.
      payButton.textContent = "مراجعة كشف الحساب";
      payButton.title = "راجع الحساب وPDF قبل تنفيذ التحويل";
    });
  }
  function addGeneratedSalaryGuards() {
    document.querySelectorAll("tr button.bg-emerald-600").forEach((button) => {
      const label = button.textContent?.trim() || "";
      if (label.includes("مراجعة") || label.includes("تأكيد") || button.dataset.dhdGeneratedReviewPay === "1") return;
      button.dataset.dhdGeneratedReviewPay = "1";
      button.textContent = "مراجعة كشف الحساب";
      button.title = "راجع الحساب وPDF قبل تنفيذ التحويل";
    });
  }
  async function postponeSalary(button) {
    const context = getSalaryContext(button);
    if (!context.employeeId) {
      notify("تعذر تحديد الموظف لتأجيل الراتب");
      return;
    }
    const rawDays = window.prompt("تأجيل الراتب بعدد الأيام:", "1");
    if (rawDays === null) return;
    const days = Number(rawDays);
    if (!Number.isInteger(days) || days < 1 || days > 31) {
      notify("أدخل عدد أيام صحيحًا بين 1 و31");
      return;
    }
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = "جارٍ التأجيل...";
    try {
      const salaryRows = await fetchAdminJson(`/api/salaries?employeeId=${context.employeeId}`);
      let salary = salaryRows.find((item) =>
        String(item.month).padStart(2, "0") === context.month &&
        Number(item.year) === context.year &&
        item.status !== "paid" &&
        item.status !== "received"
      );
      if (!salary) {
        salary = await fetchAdminJson("/api/salaries/single", {
          method: "POST",
          body: JSON.stringify({
            employeeId: context.employeeId,
            month: context.month,
            year: context.year,
          }),
        });
      }
      if (!salary?.id) throw new Error("تعذر إنشاء سجل الراتب");
      const postponedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      await fetchAdminJson(`/api/salaries/${salary.id}/postpone`, {
        method: "PATCH",
        body: JSON.stringify({ postponedUntil }),
      });
      notify(`تم تأجيل الراتب لمدة ${days} يوم`);
      window.setTimeout(() => location.reload(), 500);
    } catch (error) {
      console.error("[salary-review] postpone failed", error);
      notify(error.message || "تعذر تأجيل الراتب");
      button.disabled = false;
      button.textContent = oldText;
    }
  }
  function closeGeneratedReview() {
    document.querySelector("[data-dhd-generated-review-overlay]")?.remove();
  }
  async function showGeneratedSalaryReview(payButton) {
    closeGeneratedReview();
    const context = getSalaryContext(payButton);
    if (!context.employeeId) {
      notify("تعذر تحديد بيانات الراتب للمراجعة");
      return;
    }
    const { employeeId, month, year, employeeLink } = context;
    const overlay = document.createElement("div");
    overlay.dataset.dhdGeneratedReviewOverlay = "1";
    overlay.className = "dhd-generated-review-overlay";
    overlay.innerHTML = `
      <section role="dialog" aria-modal="true" aria-label="مراجعة كشف الراتب قبل التحويل" class="dhd-generated-review-dialog">
        <header>
          <div>
            <h2>مراجعة كشف الراتب قبل التحويل</h2>
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
      // The preview endpoint already returns the complete live calculation and
      // the persisted salary when one exists. Do not make a second list call
      // here: a failure in that unrelated request used to hide a valid review.
      const preview = await fetchAdminJson(
        `/api/salaries/preview?employeeId=${encodeURIComponent(employeeId)}&month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`,
      );
      const salary = preview?.salary && preview.salary.id != null
        ? preview.salary
        : null;
      latestPreview = preview;
      latestPreviewUrl = preview.previewPdfUrl || "";
      const summary = preview.summary || preview;
      if (preview.previewState === "paid" && salary?.status !== "paid" && salary?.status !== "received") {
        throw new Error("تم دفع هذا الراتب بالفعل");
      }
      const attendanceRecords = Array.isArray(preview.attendanceRecords) ? preview.attendanceRecords : [];
      const violations = Array.isArray(preview.violations) ? preview.violations : [];
      const bonuses = Array.isArray(preview.bonuses) ? preview.bonuses : [];
      const advances = Array.isArray(preview.advances) ? preview.advances : [];
      const absenceCount = attendanceRecords.filter((record) => record.isAbsent).length;
      const absenceRate = absenceCount
        ? Number(summary.absenceDeduction || 0) / absenceCount
        : 0;
      const detailMarkup = [
        detailTable(
          "تفاصيل الحضور والغياب",
          ["التاريخ", "الحالة", "الدخول", "الخروج", "التأخير", "خصم الغياب"],
          attendanceRecords.map((record) => [
            formatDate(record.date),
            record.isAbsent ? "غائب" : Number(record.lateMinutes || 0) > 0 ? "متأخر" : "حاضر",
            record.checkInTime || "—",
            record.checkOutTime || "—",
            Number(record.lateMinutes || 0) > 0 ? `${record.lateMinutes} دقيقة` : "—",
            record.isAbsent ? `- ${formatAmount(absenceRate)}` : "—",
          ]),
          "لا توجد سجلات حضور لهذه الفترة",
        ),
        detailTable(
          "المخالفات والخصومات",
          ["التاريخ", "النوع", "السبب", "المبلغ"],
          violations.map((violation) => [
            formatDate(violation.violationDate || violation.createdAt),
            violation.violationType || violation.type || "مخالفة",
            violation.reason || violation.notes || "—",
            `- ${formatAmount(violation.amount)}`,
          ]),
          "لا توجد مخالفات أو خصومات",
        ),
        detailTable(
          "الإضافات والمكافآت",
          ["التاريخ", "السبب", "المبلغ"],
          bonuses.map((bonus) => [
            formatDate(bonus.date || bonus.createdAt),
            bonus.reason || bonus.notes || "مكافأة",
            `+ ${formatAmount(bonus.amount)}`,
          ]),
          "لا توجد إضافات أو مكافآت",
        ),
        detailTable(
          "السلف المعتمدة",
          ["التاريخ", "السبب", "المبلغ"],
          advances.map((advance) => [
            formatDate(advance.requestedAt || advance.createdAt),
            advance.reason || "سلفة",
            `- ${formatAmount(advance.amount)}`,
          ]),
          "لا توجد سلف معتمدة",
        ),
      ].join("");
      const body = overlay.querySelector(".dhd-generated-review-body");
      body.innerHTML = `
        <div class="dhd-salary-review-state">
          <strong>قيد المراجعة قبل التحويل</strong>
          <span>الحساب أدناه حي من قاعدة البيانات، ولن يتم تسجيل التحويل إلا بعد الضغط على زر التأكيد النهائي.</span>
        </div>
        <div class="dhd-generated-review-breakdown">
          <div><span>الراتب الأساسي</span><b>${formatAmount(summary.baseSalary)}</b></div>
          <div><span>أيام الحضور</span><b>${summary.presentDays || 0} يوم</b></div>
          <div><span>الغياب</span><b class="negative">${summary.absentDays || 0} يوم (${formatAmount(summary.absenceDeduction)})</b></div>
          <div><span>التأخير</span><b class="negative">${summary.lateMinutes || 0} دقيقة (${formatAmount(summary.lateDeduction)})</b></div>
          <div><span>الوقت الإضافي</span><b class="positive">+ ${formatAmount(summary.overtimeBonus)} (${Number(summary.overtimeHours || 0).toFixed(1)} ساعة)</b></div>
          <div><span>المخالفات</span><b class="negative">${formatAmount(summary.violationTotal)}</b></div>
          <div><span>السلف</span><b class="negative">${formatAmount(summary.advanceTotal)}</b></div>
          <div><span>الزيادات والمكافآت</span><b class="positive">+ ${formatAmount(Number(summary.bonusTotal || 0) + Number(summary.overtimeBonus || 0))}</b></div>
          <div><span>خصم الغياب المطبق</span><b class="negative">- ${formatAmount(summary.absenceDeduction)}</b></div>
          <div><span>إجمالي الخصومات</span><b class="negative">- ${formatAmount(summary.totalDeductions)}</b></div>
          <div class="net"><span>صافي المبلغ المستحق</span><b>${formatAmount(summary.finalSalary)}</b></div>
        </div>
        <div class="dhd-generated-review-details">${detailMarkup}</div>
        <div class="dhd-generated-review-actions"></div>
      `;
      const actions = body.querySelector(".dhd-generated-review-actions");
      const pdfButton = document.createElement("button");
      pdfButton.type = "button";
      pdfButton.className = "dhd-salary-preview-pdf";
      pdfButton.textContent = "فتح PDF قبل التحويل";
      pdfButton.addEventListener("click", () => openPreviewPdf(pdfButton));
      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "dhd-generated-review-confirm";
      confirmButton.textContent = "تأكيد التحويل وإشعار الموظف";
      confirmButton.addEventListener("click", async () => {
        confirmButton.disabled = true;
        confirmButton.textContent = "جارٍ تنفيذ التحويل...";
        try {
          let salaryId = salary?.id;
          if (!salaryId) {
            const created = await fetchAdminJson("/api/salaries/single", {
              method: "POST",
              body: JSON.stringify({ employeeId, month, year }),
            });
            salaryId = created?.id || created?.salary?.id;
          }
          if (!salaryId) throw new Error("تعذر إنشاء سجل الراتب");
          await fetchAdminJson(`/api/salaries/${salaryId}/pay`, { method: "PATCH" });
          closeGeneratedReview();
          notify("تم تحويل الراتب بنجاح وتجميد كشفه النهائي");
          window.setTimeout(() => location.reload(), 700);
        } catch (error) {
          console.error("[salary-review] transfer failed", error);
          notify(error.message || "تعذر تنفيذ التحويل");
          confirmButton.disabled = false;
          confirmButton.textContent = "تأكيد التحويل وإشعار الموظف";
        }
      });
      actions.append(pdfButton, confirmButton);
    } catch (error) {
      console.error("[salary-review] generated salary review failed", error);
      overlay.querySelector(".dhd-generated-review-body").innerHTML =
        `<p class="dhd-generated-review-error">تعذر تحميل مراجعة الراتب: ${escapeHtml(error?.message || "خطأ غير معروف")}</p>`;
    }
  }
  function decoratePaymentDialog() {
    if (!latestPreview) return;
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const dialog = dialogs.find((item) => item.textContent?.includes("صرف الراتب") || item.textContent?.includes("الراتب"));
    if (!dialog) return;
    const previous = dialog.querySelector("[data-dhd-salary-review-summary]");
    if (previous?.dataset.previewAt === String(latestPreview.summary?.calculatedAt || "")) return;
    previous?.remove();
    const confirmButton = Array.from(dialog.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("تأكيد") || button.textContent?.includes("دفع") || button.textContent?.includes("تحويل"));
    if (confirmButton) confirmButton.textContent = "تحويل";
    const footer = confirmButton?.parentElement;
    if (!footer) return;
    const summary = latestPreview.summary || latestPreview;
    const box = document.createElement("section");
    box.dataset.dhdSalaryReviewSummary = "1";
    box.dataset.previewAt = String(summary.calculatedAt || "");
    box.className = "dhd-salary-review-summary";
    box.innerHTML = `
      <div class="dhd-salary-review-state">
        <strong>قيد المراجعة قبل التحويل</strong>
        <span>فتح المعاينة أو PDF لا يغيّر حالة الراتب إلى مدفوع.</span>
      </div>
      <div class="dhd-salary-review-totals">
        <div><span>أيام الحضور</span><b>${summary.presentDays || 0}</b></div>
        <div><span>الغياب</span><b>${summary.absentDays || 0}</b></div>
        <div><span>التأخير</span><b>${formatAmount(summary.lateDeduction)}</b></div>
        <div><span>المخالفات</span><b>${formatAmount(summary.violationTotal)}</b></div>
        <div><span>السلف</span><b>${formatAmount(summary.advanceTotal)}</b></div>
        <div><span>الزيادات</span><b>${formatAmount(summary.bonusTotal)}</b></div>
        <div><span>إجمالي الخصومات</span><b>${formatAmount(summary.totalDeductions)}</b></div>
        <div><span>صافي المستحق</span><b>${formatAmount(summary.finalSalary)}</b></div>
      </div>
    `;
    const pdfButton = document.createElement("button");
    pdfButton.type = "button";
    pdfButton.className = "dhd-salary-preview-pdf";
    pdfButton.textContent = "فتح PDF قبل التحويل";
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
    .dhd-salary-review-totals { display: grid; grid-template-columns: repeat(2, 1fr); gap: .5rem; }
    .dhd-salary-review-totals > div {
      display: grid;
      gap: .15rem;
      border-radius: .55rem;
      padding: .5rem .6rem;
      background: white;
      color: #78716c;
      font-size: .72rem;
    }
    .dhd-salary-review-totals b { color: #be123c; font-size: .85rem; }
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
      width: min(100%, 36rem);
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
      padding: .6rem .8rem;
      border-bottom: 1px solid #e2e8f0;
      font-size: .82rem;
    }
    .dhd-generated-review-breakdown > div:last-child { border-bottom: 0; }
    .dhd-generated-review-breakdown span { color: #64748b; }
    .dhd-generated-review-breakdown .positive { color: #15803d; }
    .dhd-generated-review-breakdown .negative { color: #be123c; }
    .dhd-generated-review-breakdown .net { background: #fff7ed; font-weight: 800; }
    .dhd-generated-review-breakdown .net b { color: #c2410c; font-size: 1rem; }
    .dhd-generated-review-details { display: grid; gap: .8rem; }
    .dhd-review-detail-section {
      overflow: hidden;
      border: 1px solid #e2e8f0;
      border-radius: .75rem;
      background: #fff;
    }
    .dhd-review-detail-section h3 {
      margin: 0;
      padding: .65rem .8rem;
      background: #f8fafc;
      color: #334155;
      font-size: .82rem;
    }
    .dhd-review-detail-scroll { overflow-x: auto; }
    .dhd-review-detail-table {
      width: 100%;
      min-width: 32rem;
      border-collapse: collapse;
      font-size: .74rem;
    }
    .dhd-review-detail-table th,
    .dhd-review-detail-table td {
      padding: .5rem .65rem;
      border-top: 1px solid #f1f5f9;
      text-align: right;
      vertical-align: top;
    }
    .dhd-review-detail-table th { color: #64748b; font-weight: 700; white-space: nowrap; }
    .dhd-review-detail-table td { color: #334155; }
    .dhd-review-detail-table td:nth-last-child(1) { font-weight: 700; white-space: nowrap; }
    .dhd-review-detail-table .empty { color: #94a3b8; text-align: center; }
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
      .dhd-salary-review-totals { grid-template-columns: 1fr 1fr; }
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
    const clickedButton = event.target.closest?.("button");
    const label = clickedButton?.textContent?.trim() ||
      clickedButton?.getAttribute("aria-label")?.trim() ||
      clickedButton?.getAttribute("title")?.trim() ||
      "";
    const isPostpone = clickedButton && /^(تأجيل|تأجيل الدفع|تأجيل الراتب|Postpone)$/i.test(label);
    // The React salary page already owns the review and payment flow. Never
    // intercept those buttons here: doing so prevents its modal mutation and
    // turns a normal payment click into a second, fragile review implementation.
    if (!isPostpone || !location.pathname.includes("/salaries")) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    postponeSalary(clickedButton);
  }, true);
  window.addEventListener("popstate", enhanceSalaryReview);
  window.setTimeout(enhanceSalaryReview, 800);
})();
