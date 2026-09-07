(() => {
  "use strict";

  // The imported admin form sends its complete form state on PATCH. Keep the
  // update truly partial at the browser boundary: read the current PostgreSQL
  // row, drop unchanged/blank values, and let the API preserve every omitted
  // column.
  const originalFetch = window.fetch.bind(window);
  const isEmployeePatch = (input, init) => {
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = typeof input === "string" ? input : input?.url || "";
    return method === "PATCH" && /\/api\/employees\/\d+$/.test(url);
  };
  const comparable = (key, value) => {
    if (key === "baseSalary" || key === "officeId" || key === "paymentDay") return String(value ?? "");
    if (key === "workDays") return JSON.stringify(Array.isArray(value) ? value : []);
    if (key === "isActive" || key === "isUnrestricted") return String(Boolean(value));
    return String(value ?? "").trim();
  };

  window.fetch = async (input, init = {}) => {
    if (!isEmployeePatch(input, init) || !init.body) return originalFetch(input, init);

    let submitted;
    try {
      submitted = JSON.parse(typeof init.body === "string" ? init.body : await new Response(init.body).text());
    } catch {
      return originalFetch(input, init);
    }

    const url = typeof input === "string" ? input : input.url;
    const employeeId = url.match(/\/api\/employees\/(\d+)$/)?.[1];
    if (!employeeId) return originalFetch(input, init);

    try {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      const currentResponse = await originalFetch(`/api/employees/${employeeId}`, {
        credentials: "include",
        headers,
      });
      if (currentResponse.ok) {
        const current = await currentResponse.json();
        const partial = {};
        Object.entries(submitted).forEach(([key, value]) => {
          if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return;
          const currentKey = key === "role" ? "position" : key;
          if (comparable(currentKey, value) !== comparable(currentKey, current[currentKey])) {
            partial[key] = value;
          }
        });
        init = { ...init, body: JSON.stringify(partial) };
      }
    } catch {
      // If the comparison request fails, retain the original request rather
      // than silently losing an intentional edit.
    }
    return originalFetch(input, init);
  };
})();