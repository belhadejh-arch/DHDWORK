(() => {
  "use strict";
  const status = document.getElementById("status");
  const periods = document.getElementById("periods");
  const periodCard = document.getElementById("period-card");
  const periodTitle = document.getElementById("period-title");
  const statement = document.getElementById("statement");
  let selectedRow = null;
  let activeRequest = null;

  const escapeHtml = (value) => String(value ?? "—")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const amount = (value) => `${Number(value || 0).toLocaleString("ar-DZ")} دج`;
  const date = (value) => value ? escapeHtml(String(value).slice(0, 10)) : "—";
  const period = (month, year) => `${String(month || "").padStart(2, "0")}/${year || "—"}`;
  const metric = (label, value, className = "") =>
    `<div class="metric ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  const table = (title, headings, rows, empty) => `
    <section class="card">
      <h2>${escapeHtml(title)}</h2>
      <div class="table-wrap"><table>
        <thead><tr>${headings.map((heading) => `<th>${escapeHtml(heading)}</th>`).join("")}</tr></thead>
        <tbody>${rows.length
          ? rows.map((cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
          : `<tr><td class="empty" colspan="${headings.length}">${escapeHtml(empty)}</td></tr>`}</tbody>
      </table></div>
    </section>`;
  const showStatus = (message, isError = false) => {
    status.hidden = false;
    status.classList.toggle("error", isError);
    status.textContent = message;
  };
  const hideStatus = () => { status.hidden = true; };

  async function fetchJson(url, signal) {
    const token = localStorage.getItem("dhd_admin_token");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const fetchOnce = async (withToken) => {
      const headers = { Accept: "application/json" };
      if (withToken && token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(url, { credentials: "include", headers, signal: controller.signal });
      const data = await response.json().catch(() => null);
      return { response, data };
    };
    let result;
    try {
      result = await fetchOnce(true);
      // Ignore an expired local token when the admin session cookie is valid.
      if (result.response.status === 401 && token) result = await fetchOnce(false);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw signal?.aborted ? error : new Error("انتهت مهلة تحميل الكشف. أعد المحاولة.");
      }
      throw new Error("تعذر الاتصال بالخادم. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
    if (!result.response.ok) {
      if (result.response.status === 404) {
        throw new Error(result.data?.message || "لا يوجد كشف راتب محفوظ لهذا الموظف في الفترة المحددة (404).");
      }
      if (result.response.status === 401 || result.response.status === 403) {
        throw new Error(result.data?.message || "انتهت الجلسة أو لا تملك صلاحية المسؤول. سجّل الدخول بحساب مسؤول ثم أعد المحاولة.");
      }
      throw new Error(result.data?.message || result.data?.error || `تعذر تحميل البيانات (HTTP ${result.response.status})`);
    }
    return result.data;
  }

  function renderDetails(data, employeeRow) {
    if (!data || !data.summary || !data.salary) {
      throw new Error("بيانات كشف الراتب غير مكتملة، تعذر عرض الكشف.");
    }
    const summary = data.summary;
    const employee = data.employee || {};
    const attendance = Array.isArray(data.attendance) ? data.attendance
      : Array.isArray(data.attendanceRecords) ? data.attendanceRecords : [];
    const violations = Array.isArray(data.violations) ? data.violations : [];
    const advances = Array.isArray(data.advances) ? data.advances : [];
    const bonuses = Array.isArray(data.bonusRecords) ? data.bonusRecords
      : Array.isArray(data.bonuses) ? data.bonuses : [];
    const absences = attendance.filter((record) => record.isAbsent);
    const late = attendance.filter((record) => Number(record.lateMinutes || 0) > 0);
    const absenceRate = absences.length ? Number(summary.absenceDeduction || 0) / absences.length : 0;
    const fullName = `${employee.firstName || ""} ${employee.lastName || ""}`.trim() ||
      employeeRow.employeeName || "—";
    const month = data.month || data.salary.month || employeeRow.currentMonth;
    const year = data.year || data.salary.year || employeeRow.currentYear;

    statement.innerHTML = `
      <section class="card">
        <h2>كشف ${escapeHtml(period(month, year))} · ${escapeHtml(fullName)}</h2>
        <p class="muted">الحالة: ${escapeHtml(data.salary.status || employeeRow.salaryStatus || "مسجل")}</p>
        <div class="grid">
          ${metric("الراتب الأساسي", amount(summary.baseSalary))}
          ${metric("أيام الحضور", `${summary.presentDays || 0} يوم`)}
          ${metric("أيام الغياب", `${summary.absentDays || 0} يوم`)}
          ${metric("دقائق التأخير", `${summary.lateMinutes || 0} دقيقة`)}
          ${metric("ساعات العمل", `${Number(summary.workedHours || 0).toFixed(2)} ساعة`)}
          ${metric("خصم الغياب", amount(summary.absenceDeduction))}
          ${metric("خصم التأخير", amount(summary.lateDeduction ?? summary.lateDeductions))}
          ${metric("المخالفات والغرامات", amount(summary.violationTotal ?? summary.violationDeductions))}
          ${metric("السلف", amount(summary.advanceTotal ?? summary.advanceDeductions))}
          ${metric("خصومات أخرى", amount(summary.otherDeductions))}
          ${metric("الوقت الإضافي", `+ ${amount(summary.overtimeBonus)} · ${Number(summary.overtimeHours || 0).toFixed(2)} ساعة`)}
          ${metric("المكافآت والزيادات", amount(summary.bonusTotal ?? summary.bonuses))}
          ${metric("إجمالي الخصومات", amount(summary.totalDeductions))}
          ${metric("صافي الراتب المستحق", amount(summary.finalSalary), "net")}
        </div>
      </section>
      ${table("الحضور والغياب والتأخير",
        ["التاريخ", "الحالة", "الدخول", "الخروج", "ساعات العمل", "التأخير", "خصم التأخير", "خصم الغياب"],
        attendance.map((item) => [
          date(item.date), item.isAbsent ? "غائب" : Number(item.lateMinutes || 0) ? "متأخر" : "حاضر",
          item.checkInTime || "—", item.checkOutTime || "—",
          `${(Number(item.workedMinutes || 0) / 60).toFixed(2)} ساعة`,
          Number(item.lateMinutes || 0) ? `${item.lateMinutes} دقيقة` : "—",
          Number(item.lateDeduction || 0) ? amount(item.lateDeduction) : "—",
          item.isAbsent ? amount(absenceRate) : "—",
        ]), "لا توجد سجلات حضور لهذه الفترة")}
      ${table("الغيابات والخصومات",
        ["التاريخ", "السبب / الملاحظة", "المبلغ"],
        absences.map((item) => [date(item.date), item.notes || "غياب مسجل", `- ${amount(absenceRate)}`]),
        "لا توجد غيابات مسجلة")}
      ${table("التأخير وخصوماته",
        ["التاريخ", "المدة", "المبلغ"],
        late.map((item) => [date(item.date), `${item.lateMinutes} دقيقة`, `- ${amount(item.lateDeduction)}`]),
        "لا يوجد تأخير مسجل")}
      ${table("المخالفات والغرامات",
        ["التاريخ", "النوع", "السبب", "المبلغ"],
        violations.map((item) => [
          date(item.violationDate || item.createdAt), item.violationType || item.type || "مخالفة",
          item.reason || item.notes || "لا يوجد سبب موضح", `- ${amount(item.amount || item.deductionAmount)}`,
        ]), "لا توجد مخالفات مسجلة")}
      ${table("السلف المستقطعة",
        ["التاريخ", "السبب", "المبلغ"],
        advances.map((item) => [
          date(item.requestedAt || item.createdAt), item.reason || "سلفة معتمدة", `- ${amount(item.amount)}`,
        ]), "لا توجد سلف معتمدة")}
      ${table("المكافآت والإضافات",
        ["التاريخ", "السبب", "المبلغ"],
        bonuses.map((item) => [
          date(item.date || item.createdAt), item.reason || item.notes || "مكافأة", `+ ${amount(item.amount)}`,
        ]), "لا توجد مكافآت مسجلة")}
      <button type="button" id="print-statement" class="action no-print">طباعة الكشف</button>
    `;
    statement.querySelector("#print-statement").addEventListener("click", () => window.print());
  }

  async function openSalary(employeeRow) {
    selectedRow = employeeRow;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    statement.replaceChildren();
    showStatus("جارٍ تحميل تفاصيل كشف الراتب المسجل…");
    periods.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.employeeId === String(employeeRow.employeeId)));
    });
    const query = new URLSearchParams({
      employeeId: String(employeeRow.employeeId),
      month: String(employeeRow.currentMonth).padStart(2, "0"),
      year: String(employeeRow.currentYear),
    });
    try {
      const data = await fetchJson(`/api/salaries/preview?${query}`, controller.signal);
      if (!controller.signal.aborted) {
        renderDetails(data, employeeRow);
        hideStatus();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        showStatus(error?.name === "AbortError"
          ? "انتهت مهلة تحميل الكشف. أعد المحاولة."
          : error instanceof Error ? error.message : "تعذر تحميل كشف الراتب.", true);
        const retry = document.createElement("button");
        retry.className = "action no-print";
        retry.type = "button";
        retry.textContent = "إعادة المحاولة";
        retry.addEventListener("click", () => openSalary(employeeRow));
        status.appendChild(retry);
      }
    } finally {
      if (activeRequest === controller) activeRequest = null;
    }
  }

  async function start() {
    try {
      const me = await fetchJson("/api/auth/me");
      if (!me?.isAuthenticated || me.userType !== "admin") {
        throw new Error("هذه الصفحة مخصصة للمسؤولين فقط. سجّل الدخول بحساب مسؤول.");
      }
      const rows = await fetchJson("/api/salaries/upcoming");
      if (!Array.isArray(rows)) throw new Error("استجابة قائمة الرواتب غير صالحة.");
      if (!rows.length) {
        showStatus("لا يوجد موظفون في قائمة الرواتب للفترة الحالية.");
        return;
      }
      const currentMonth = rows[0].currentMonth;
      const currentYear = rows[0].currentYear;
      periodTitle.textContent = `كشوف الرواتب للفترة الحالية · ${period(currentMonth, currentYear)}`;
      periodCard.hidden = false;
      for (const row of rows) {
        const button = document.createElement("button");
        button.className = "period";
        button.type = "button";
        button.dataset.employeeId = String(row.employeeId);
        button.textContent = `${row.employeeName || `موظف ${row.employeeId}`} · ${row.salaryId
          ? row.salaryStatus || "مسجل" : "الكشف لم يُنشأ بعد"}`;
        button.addEventListener("click", () => openSalary(row));
        periods.appendChild(button);
      }
      const requestedId = new URLSearchParams(location.search).get("employeeId");
      const selected = rows.find((row) => String(row.employeeId) === requestedId) ||
        rows.find((row) => row.salaryId != null) || rows[0];
      await openSalary(selected);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "تعذر تحميل كشوف الرواتب.", true);
    }
  }

  void start();
})();