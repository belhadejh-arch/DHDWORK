(() => {
  "use strict";

  const dateInput = document.getElementById("date");
  const searchInput = document.getElementById("search");
  const message = document.getElementById("message");
  const cards = document.getElementById("cards");
  const summary = document.getElementById("summary");
  const refreshButton = document.getElementById("refresh");
  const editor = document.getElementById("editor");
  const form = document.getElementById("edit-form");
  const absentInput = document.getElementById("absent");
  const checkInInput = document.getElementById("check-in");
  const checkOutInput = document.getElementById("check-out");
  const notesInput = document.getElementById("notes");
  const saveButton = document.getElementById("save");
  const editError = document.getElementById("edit-error");
  const statusNames = {
    present: "حاضر", late: "متأخر", absent: "غائب",
    rest: "راحة أسبوعية", leave: "إجازة معتمدة",
    future: "يوم قادم", pending: "لم يسجل بعد",
  };
  let rows = [];
  let editing = null;
  let activeRequest = null;
  let requestNumber = 0;

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  function algiersDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Algiers", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function algiersTime(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit",
      second: "2-digit", hourCycle: "h23",
    }).format(parsed);
  }

  async function request(url, { method = "GET", body, signal } = {}) {
    const token = localStorage.getItem("dhd_admin_token");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const once = async (useToken) => {
      const headers = { Accept: "application/json" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (useToken && token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(url, {
        method, headers, credentials: "include", cache: "no-store",
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      return { response, data: await response.json().catch(() => null) };
    };
    let result;
    try {
      result = await once(true);
      if (result.response.status === 401 && token) result = await once(false);
    } catch (error) {
      if (error?.name === "AbortError" && !signal?.aborted) {
        throw new Error("انتهت مهلة الاتصال. سيعاد تحديث السجلات تلقائيًا.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
    if (!result.response.ok) {
      throw new Error(result.data?.message ||
        (result.response.status === 401 || result.response.status === 403
          ? "انتهت جلسة الإدارة. سجّل الدخول مرة أخرى."
          : `تعذر حفظ أو تحميل السجلات (HTTP ${result.response.status}).`));
    }
    return result.data;
  }

  function setMessage(text, error = false) {
    message.classList.toggle("error", error);
    message.textContent = text;
  }

  function timeValue(value, missing) {
    if (!value) return `<strong class="muted">${missing}</strong>`;
    const text = String(value);
    return `<strong>${escapeHtml(/^\d{1,2}:\d{2}(:\d{2})?$/.test(text) ? text : "وقت غير صالح")}</strong>`;
  }

  function timeCell(label, value, missing) {
    return `<div class="time"><span>${escapeHtml(label)}</span>${timeValue(value, missing)}</div>`;
  }

  function textCell(label, value) {
    return `<div class="time"><span>${escapeHtml(label)}</span><strong class="muted">${escapeHtml(value)}</strong></div>`;
  }

  function render() {
    const term = searchInput.value.trim().toLocaleLowerCase();
    const filtered = rows.filter((row) =>
      `${row.employeeName || ""} ${row.officeName || ""}`.toLocaleLowerCase().includes(term));
    const count = (status) => rows.filter((row) => row.status === status).length;
    summary.innerHTML = [
      ["الموظفون", rows.length],
      ["حاضرون", count("present") + count("late")],
      ["غائبون", count("absent")],
      ["راحة", count("rest")],
      ["إجازات", count("leave")],
      ["بانتظار التسجيل", count("pending")],
    ].map(([label, number]) =>
      `<span class="count">${escapeHtml(label)}: ${number}</span>`).join("");
    if (!filtered.length) {
      cards.innerHTML = `<p class="notice">${rows.length
        ? "لم يُعثر على موظف مطابق للبحث." : "لا توجد سجلات متاحة لهذا التاريخ."}</p>`;
      return;
    }
    cards.innerHTML = filtered.map((row) => {
      const status = row.isAbsent ? "absent" : statusNames[row.status] ? row.status : "pending";
      const work = row.workedMinutes != null && Number.isFinite(Number(row.workedMinutes))
        ? `${Math.floor(Number(row.workedMinutes) / 60)} س ${Math.round(Number(row.workedMinutes) % 60)} د`
        : row.checkInTime ? "بانتظار الانصراف" : "لا توجد ساعات مسجلة";
      const absenceTime = algiersTime(row.absenceRecordedAt);
      return `
        <article class="card">
          <div class="card-head">
            <div><h2>${escapeHtml(row.employeeName || `موظف ${row.employeeId}`)}</h2>
              <p class="office">${escapeHtml(row.officeName || "بدون مكتب")}</p></div>
            <span class="badge ${status}">${escapeHtml(statusNames[status])}</span>
          </div>
          <div class="times">
            ${timeCell("وقت الحضور", row.checkInTime, "لا يوجد دخول")}
            ${timeCell("وقت الانصراف", row.checkOutTime, "لا يوجد خروج")}
            ${textCell("ساعات العمل", work)}
            ${status === "absent"
              ? timeCell("وقت تسجيل الغياب", absenceTime, "غير متوفر للسجل القديم")
              : `<div class="time"><span>حالة اليوم</span><strong class="muted">${escapeHtml(statusNames[status])}</strong></div>`}
          </div>
          <div class="card-foot">
            <small>${status === "rest" ? "لا يُسجل غياب في يوم الراحة" :
              status === "leave" ? "إجازة معتمدة، بلا خصم غياب" :
              status === "pending" ? "يسجل الغياب تلقائيًا بعد نهاية المناوبة إذا لم يحدث دخول" :
              status === "absent" ? escapeHtml(row.notes || "لم يسجل حضور في يوم عمل") :
              "الأوقات مأخوذة من سجل الحضور"}</small>
            <button class="edit" type="button" data-employee-id="${Number(row.employeeId)}">تصحيح</button>
          </div>
        </article>`;
    }).join("");
  }

  async function refresh(force = false) {
    if (editor.open || (activeRequest && !force)) return;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const requestId = ++requestNumber;
    const requestedDate = dateInput.value;
    refreshButton.disabled = true;
    if (!rows.length) setMessage("جارٍ تحميل سجلات الحضور…");
    try {
      const result = await request(`/api/attendance?date=${encodeURIComponent(requestedDate)}`,
        { signal: controller.signal });
      if (requestId !== requestNumber || requestedDate !== dateInput.value) return;
      if (!Array.isArray(result)) throw new Error("استجابة سجلات الحضور غير صالحة.");
      rows = result;
      render();
      setMessage(`آخر تحديث: ${algiersTime(new Date().toISOString()) || "الآن"} بتوقيت الجزائر. تُحدّث القائمة كل 15 ثانية.`);
    } catch (error) {
      if (requestId !== requestNumber || controller.signal.aborted) return;
      setMessage(error instanceof Error ? error.message : "تعذر تحميل السجلات. سيُعاد المحاولة.", true);
    } finally {
      if (activeRequest === controller) {
        activeRequest = null;
        refreshButton.disabled = false;
      }
    }
  }

  function updateAbsentInputs() {
    checkInInput.disabled = absentInput.checked;
    checkOutInput.disabled = absentInput.checked;
  }

  function openEditor(row) {
    editing = row;
    document.getElementById("editor-title").textContent = `تصحيح: ${row.employeeName || "موظف"}`;
    document.getElementById("editor-description").textContent = `تاريخ السجل: ${dateInput.value}`;
    checkInInput.value = row.checkInTime ? String(row.checkInTime).slice(0, 8) : "";
    checkOutInput.value = row.checkOutTime ? String(row.checkOutTime).slice(0, 8) : "";
    absentInput.checked = Boolean(row.isAbsent);
    notesInput.value = row.notes || "";
    editError.textContent = "";
    updateAbsentInputs();
    editor.showModal();
  }

  async function save(event) {
    event.preventDefault();
    if (!editing) return;
    const absent = absentInput.checked;
    const checkInTime = absent ? null : checkInInput.value || null;
    const checkOutTime = absent ? null : checkOutInput.value || null;
    if (!absent && !checkInTime) {
      editError.textContent = "حدد وقت الدخول، أو اختر تسجيل غياب.";
      return;
    }
    if (checkOutTime && !checkInTime) {
      editError.textContent = "لا يمكن تسجيل انصراف دون وقت دخول.";
      return;
    }
    const body = {
      isAbsent: absent,
      checkInTime,
      checkOutTime,
      notes: notesInput.value.trim() || null,
    };
    saveButton.disabled = true;
    editError.textContent = "";
    try {
      if (editing.id != null) {
        await request(`/api/attendance/${encodeURIComponent(editing.id)}`, { method: "PATCH", body });
      } else {
        await request("/api/attendance", {
          method: "POST",
          body: { ...body, employeeId: editing.employeeId, date: dateInput.value,
            status: absent ? "absent" : "present" },
        });
      }
      editor.close();
      editing = null;
    } catch (error) {
      editError.textContent = error instanceof Error ? error.message : "تعذر حفظ السجل.";
    } finally {
      saveButton.disabled = false;
    }
  }

  async function start() {
    dateInput.value = algiersDate();
    dateInput.max = dateInput.value;
    const requestedDate = new URLSearchParams(location.search).get("date");
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate <= dateInput.max) {
      dateInput.value = requestedDate;
    }
    try {
      const me = await request("/api/auth/me");
      if (!me?.isAuthenticated || me.userType !== "admin") {
        throw new Error("سجّل الدخول بحساب المسؤول لعرض سجلات الحضور.");
      }
      await refresh(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر التحقق من جلسة الإدارة.", true);
      cards.innerHTML = '<p><a class="back" href="/">العودة إلى تسجيل الدخول</a></p>';
      return;
    }
    window.setInterval(() => {
      if (!document.hidden && !editor.open) void refresh();
    }, 15000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void refresh(true);
    });
  }

  dateInput.addEventListener("change", () => {
    if (!dateInput.value || dateInput.value > algiersDate()) {
      dateInput.value = algiersDate();
    }
    rows = [];
    render();
    void refresh(true);
  });
  searchInput.addEventListener("input", render);
  refreshButton.addEventListener("click", () => void refresh(true));
  cards.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-employee-id]");
    if (!button) return;
    const row = rows.find((item) => String(item.employeeId) === button.dataset.employeeId);
    if (row) openEditor(row);
  });
  absentInput.addEventListener("change", () => {
    if (!absentInput.checked && editing?.isAbsent && notesInput.value.startsWith("غياب تلقائي")) {
      notesInput.value = "";
    }
    updateAbsentInputs();
  });
  document.getElementById("cancel").addEventListener("click", () => editor.close());
  editor.addEventListener("close", () => { editing = null; void refresh(true); });
  form.addEventListener("submit", (event) => void save(event));
  void start();
})();