(() => {
  "use strict";
  const status = document.getElementById("status");
  const periods = document.getElementById("periods");
  const periodCard = document.getElementById("period-card");
  const statement = document.getElementById("statement");
  let activeRequest = null;

  const escapeHtml = (value) => String(value ?? "—")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const amount = (value) => `${Number(value || 0).toLocaleString("ar-DZ")} دج`;
  const date = (value) => value ? escapeHtml(String(value).slice(0, 10)) : "—";
  const period = (salary) => `${String(salary.month || "").padStart(2, "0")}/${salary.year || "—"}`;
  const row = (cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
  const table = (title, headings, rows, empty) => `
    <section class="card">
      <h2>${escapeHtml(title)}</h2>
      <div class="table-wrap"><table>
        <thead><tr>${headings.map((text) => `<th>${escapeHtml(text)}</th>`).join("")}</tr></thead>
        <tbody>${rows.length ? rows.map(row).join("") : `<tr><td class="empty" colspan="${headings.length}">${escapeHtml(empty)}</td></tr>`}</tbody>
      </table></div>
    </section>`;
  const metric = (label, value, className = "") =>
    `<div class="metric ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  const showStatus = (message, isError = false) => {
    status.hidden = false;
    status.classList.toggle("error", isError);
    status.textContent = message;
  };
  const hideStatus = () => { status.hidden = true; };

  async function fetchJson(url, signal) {
    const token = localStorage.getItem("dhd_employee_token") || localStorage.getItem("employee_token");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const response = await fetch(url, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("انتهت الجلسة أو ليس لديك صلاحية الاطلاع. سجل الدخول إلى حساب الموظف مجددًا.");
        }
        throw new Error(data?.message || `تعذر تحميل كشف الراتب (HTTP ${response.status})`);
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) {
        throw new Error("انتهت مهلة تحميل كشف الراتب. حاول مجددًا.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }

  function renderDetails(data) {
    if (!data?.salary || !data?.summary ||
      !["attendanceRecords", "violations", "advances", "bonuses"].every((key) => Array.isArray(data[key])) ) {
      throw new Error("بيانات كشف الراتب غير مكتملة. يرجى إعادة المحاولة.");
    }
    const { salary, summary, employee } = data;
    const attendance = data.attendanceRecords;
    const absences = attendance.filter((record) => record.isAbsent);
    const late = attendance.filter((record) => Number(record.lateMinutes || 0) > 0);
    const absenceRate = absences.length ? Number(summary.absenceDeduction || 0) / absences.length : 0;
    const fullName = `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim();

    statement.innerHTML = `
      <section class="card">
        <h2>كشف ${escapeHtml(period(salary))} · ${escapeHtml(fullName)}</h2>
        <p class="muted">الحالة: ${escapeHtml(salary.status === "received" ? "تم الاستلام" : salary.status === "paid" ? "مدفوع" : salary.status === "postponed" ? "مؤجل" : "قيد المراجعة")}</p>
        <div class="grid">
          ${metric("الراتب الأساسي", amount(summary.baseSalary))}
          ${metric("أيام الحضور", `${summary.presentDays || 0} يوم`)}
          ${metric("أيام الغياب", `${summary.absentDays || 0} يوم`)}
          ${metric("دقائق التأخير", `${summary.lateMinutes || 0} دقيقة`)}
          ${metric("ساعات العمل", `${Number(summary.workedHours || 0).toFixed(2)} ساعة`)}
          ${metric("خصم الغياب", amount(summary.absenceDeduction))}
          ${metric("خصم التأخير", amount(summary.lateDeduction))}
          ${metric("المخالفات والغرامات", amount(summary.violationTotal))}
          ${metric("السلف", amount(summary.advanceTotal))}
          ${metric("خصومات أخرى", amount(summary.otherDeductions))}
          ${metric("الوقت الإضافي", amount(summary.overtimeBonus))}
          ${metric("المكافآت والزيادات", amount(summary.bonusTotal))}
          ${metric("إجمالي الخصومات", amount(summary.totalDeductions))}
          ${metric("صافي الراتب المستحق", amount(summary.finalSalary), "net")}
        </div>
      </section>
      ${table("الحضور والغياب والتأخير",
        ["التاريخ", "الحالة", "الدخول", "الخروج", "ساعات العمل", "التأخير", "خصم التأخير", "خصم الغياب"],
        attendance.map((item) => [
          date(item.date), item.isAbsent ? "غائب" : "حاضر",
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
        data.violations.map((item) => [
          date(item.violationDate || item.createdAt), item.violationType || item.type || "مخالفة",
          item.reason || item.notes || "لا يوجد سبب موضح", `- ${amount(item.amount || item.deductionAmount)}`,
        ]), "لا توجد مخالفات مسجلة")}
      ${table("السلف المستقطعة",
        ["التاريخ", "السبب", "المبلغ"],
        data.advances.map((item) => [
          date(item.requestedAt || item.createdAt), item.reason || "سلفة معتمدة", `- ${amount(item.amount)}`,
        ]), "لا توجد سلف معتمدة")}
      ${table("المكافآت والإضافات",
        ["التاريخ", "السبب", "المبلغ"],
        data.bonuses.map((item) => [
          date(item.date || item.createdAt), item.reason || item.notes || "مكافأة", `+ ${amount(item.amount)}`,
        ]), "لا توجد مكافآت مسجلة")}
      ${table("الإجازات والعطل المعتمدة",
        ["النوع", "من", "إلى", "الملاحظة"],
        [
          ...(data.leaveRequests || []).map((item) => [item.leaveType || "إجازة", date(item.startDate), date(item.endDate || item.startDate), item.description || item.adminNote || "—"]),
          ...(data.vacationRequests || []).map((item) => ["عطلة", date(item.startDate), date(item.endDate || item.startDate), item.description || item.adminNote || "—"]),
        ], "لا توجد إجازات معتمدة")}
      <button type="button" id="print-statement" class="action no-print">طباعة الكشف</button>
    `;
    statement.querySelector("#print-statement").addEventListener("click", () => window.print());
    hideStatus();
  }

  async function openSalary(salaryId) {
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    statement.replaceChildren();
    showStatus("جارٍ تحميل تفاصيل كشف الراتب…");
    periods.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.id === String(salaryId)));
    });
    try {
      const data = await fetchJson(`/api/employee/salaries/${encodeURIComponent(salaryId)}/details`, controller.signal);
      if (!controller.signal.aborted) {
        renderDetails(data);
        const url = new URL(window.location.href);
        url.searchParams.set("id", String(salaryId));
        history.replaceState(history.state, "", url);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        showStatus(error instanceof Error ? error.message : "تعذر تحميل كشف الراتب", true);
        const retry = document.createElement("button");
        retry.className = "action error-actions no-print";
        retry.type = "button";
        retry.textContent = "إعادة المحاولة";
        retry.addEventListener("click", () => openSalary(salaryId));
        status.appendChild(retry);
      }
    } finally {
      if (activeRequest === controller) activeRequest = null;
    }
  }

  async function start() {
    try {
      const me = await fetchJson("/api/auth/me");
      if (!me?.isAuthenticated || me.userType !== "employee") {
        throw new Error("يجب تسجيل الدخول بحساب الموظف لعرض كشف الراتب.");
      }
      const salaries = await fetchJson("/api/employee/salaries");
      if (!Array.isArray(salaries)) throw new Error("تعذر قراءة قائمة كشوف الرواتب.");
      if (!salaries.length) {
        showStatus("لا توجد كشوف رواتب مسجلة في حسابك حاليًا.");
        return;
      }
      periodCard.hidden = false;
      for (const salary of salaries) {
        const button = document.createElement("button");
        button.className = "period";
        button.type = "button";
        button.dataset.id = String(salary.id);
        button.textContent = period(salary);
        button.addEventListener("click", () => openSalary(salary.id));
        periods.appendChild(button);
      }
      const requested = new URLSearchParams(location.search).get("id");
      const selected = salaries.find((item) => String(item.id) === requested) || salaries[0];
      await openSalary(selected.id);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "تعذر تحميل كشوف الرواتب", true);
      const link = document.createElement("a");
      link.href = "/employee-login.html";
      link.className = "action error-actions no-print";
      link.textContent = "العودة إلى تسجيل دخول الموظف";
      status.appendChild(link);
    }
  }

  void start();
})();