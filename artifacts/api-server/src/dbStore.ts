import { getDb, offices, employees, attendance, advances, bonuses, violations, salaries, leaveRequests, vacationRequests, notifications, settings, admins } from "../../../lib/db/src/index.js";
import { eq, and, desc, sql, like } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

// Local file backup path for resilient storage if PG is offline
const BACKUP_FILE = path.resolve(process.cwd(), "data-store.json");

interface DataStore {
  admins: any[];
  offices: any[];
  employees: any[];
  attendance: any[];
  advances: any[];
  bonuses: any[];
  violations: any[];
  salaries: any[];
  leaveRequests: any[];
  vacationRequests: any[];
  notifications: any[];
  settings: any;
}

// Initial default seed
const defaultStore: DataStore = {
  admins: [
    {
      id: 1,
      email: "admin@dhd-livraison.dz",
      passwordHash: "admin123",
      name: "مدير DHD",
      role: "superadmin",
      officeId: null,
      createdAt: new Date().toISOString()
    }
  ],
  offices: [
    {
      id: 1,
      name: "مكتب أم البواقي",
      code: "OEB-01",
      city: "أم البواقي",
      address: "أم البواقي، الجزائر",
      phone: "032000001",
      latitude: "35.8707722",
      longitude: "7.1101606",
      geofenceRadiusMeters: 100,
      active: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 2,
      name: "مكتب عين الفكرون",
      code: "OEF-01",
      city: "عين الفكرون",
      address: "عين الفكرون، أم البواقي",
      phone: "032000002",
      latitude: "35.9700208",
      longitude: "6.8771648",
      geofenceRadiusMeters: 150,
      active: true,
      createdAt: new Date().toISOString()
    }
  ],
  employees: [],
  attendance: [],
  advances: [],
  bonuses: [],
  violations: [],
  salaries: [],
  leaveRequests: [],
  vacationRequests: [],
  notifications: [],
  settings: {
    id: 1,
    companyName: "DHD Livraison",
    currency: "DZD",
    language: "ar",
    workStartTime: "08:00",
    workEndTime: "17:00"
  }
};

let memoryStore: DataStore = loadLocalStore();

function loadLocalStore(): DataStore {
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      const data = fs.readFileSync(BACKUP_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to load local store file:", err);
  }
  return defaultStore;
}

function saveLocalStore() {
  try {
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(memoryStore, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save local store file:", err);
  }
}

// Helpers to format PostgreSQL rows into rich API objects
function formatOffice(o: any) {
  if (!o) return null;
  const officeId = Number(o.id);
  const rawName = o.name || (officeId === 2 ? "مكتب عين الفكرون" : "مكتب أم البواقي");
  const isEye = rawName.includes("عين") || officeId === 2;

  return {
    ...o,
    id: officeId,
    name: rawName,
    code: o.code || (isEye ? "OEF-01" : officeId === 1 ? "OEB-01" : `OFF-${officeId}`),
    city: o.city || (isEye ? "عين الفكرون" : "أم البواقي"),
    address: o.address || (isEye ? "عين الفكرون، أم البواقي، الجزائر" : "أم البواقي، الجزائر"),
    phone: o.phone || (isEye ? "032000002" : "032000001"),
    latitude: String(o.latitude || (isEye ? "35.9700208" : "35.8707722")),
    longitude: String(o.longitude || (isEye ? "6.8771648" : "7.1101606")),
    geofenceRadiusMeters: o.geofenceRadiusMeters ? Number(o.geofenceRadiusMeters) : (isEye ? 150 : 100),
    active: o.active !== false && o.isActive !== false,
    qrCodeSecret: o.qrCodeData || o.qrCodeSecret || `DHD-OFFICE-${officeId}`,
    qrCodeData: o.qrCodeData || o.qrCodeSecret || `DHD-OFFICE-${officeId}`
  };
}

function formatEmployee(e: any, officeMap?: Map<number, string>) {
  if (!e) return null;
  const empId = Number(e.id);
  const isAct = e.isActive !== false && e.status !== "inactive" && !e.deletedAt;
  const officeName = officeMap?.get(Number(e.officeId)) || e.officeName || (e.officeId === 2 ? "مكتب عين الفكرون" : "مكتب أم البواقي");

  return {
    ...e,
    id: empId,
    nationalId: e.nationalId || e.serialNumber || `NAT-${empId}`,
    employeeCode: e.serialNumber || e.employeeCode || `EMP-${empId}`,
    serialNumber: e.serialNumber || e.employeeCode || `EMP-${empId}`,
    firstName: e.firstName || "",
    lastName: e.lastName || "",
    email: e.email || "",
    phone: e.phone || "",
    role: e.position || e.role || "delivery_driver",
    position: e.position || e.role || "سائق توصيل",
    officeId: e.officeId ? Number(e.officeId) : 1,
    officeName,
    baseSalary: String(e.baseSalary || 40000),
    status: isAct ? "active" : "inactive",
    isActive: isAct,
    qrCodeSecret: e.qrCodeData || e.qrCodeSecret || `QR-EMP-${empId}`,
    qrCodeData: e.qrCodeData || e.qrCodeSecret || `QR-EMP-${empId}`,
    pinCode: e.pinCode || e.passwordHash || "1234",
    joinedAt: e.hireDate || e.joinedAt || (e.createdAt ? new Date(e.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]),
    createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : new Date().toISOString()
  };
}

// Database helper functions with fallback
export async function getAdminById(id: number) {
  try {
    const db = getDb();
    if (db) {
      const res = await db.select().from(admins).where(eq(admins.id, Number(id)));
      if (res.length > 0) return res[0];
    }
  } catch (err) {
    console.warn("DB query admin by id failed, using fallback:", err);
  }
  return memoryStore.admins.find((a) => Number(a.id) === Number(id)) || memoryStore.admins[0] || null;
}

export async function getAdminByEmail(emailOrUsername: string) {
  try {
    const db = getDb();
    if (db) {
      const allAdmins = await db.select().from(admins);
      if (allAdmins.length > 0) {
        const q = String(emailOrUsername || "").toLowerCase().trim();
        const matched = allAdmins.find((a: any) =>
          (a.email && a.email.toLowerCase() === q) ||
          (a.username && a.username.toLowerCase() === q) ||
          (a.serialNumber && a.serialNumber.toLowerCase() === q)
        );
        if (matched) return matched;
        
        // Return primary admin as fallback for default login queries
        const primary = allAdmins.find((a: any) => a.isPrimary) || allAdmins[0];
        return primary;
      }
    }
  } catch (err) {
    console.warn("DB query admin failed, using fallback:", err);
  }
  const q = String(emailOrUsername || "").toLowerCase().trim();
  const found = memoryStore.admins.find((a) => a.email?.toLowerCase() === q || a.username?.toLowerCase() === q);
  return found || memoryStore.admins[0] || null;
}

export async function getEmployeeByCode(code: string) {
  const q = String(code || "").toLowerCase().trim();
  if (!q) return null;

  try {
    const db = getDb();
    if (db) {
      const allEmps = await db.select().from(employees);
      const allOffices = await db.select().from(offices);
      const officeMap = new Map(allOffices.map((o: any) => [Number(o.id), o.name]));

      const matched = allEmps.find((e: any) => {
        const serial = String(e.serialNumber || "").toLowerCase();
        const empCode = String(e.employeeCode || "").toLowerCase();
        const natId = String(e.nationalId || "").toLowerCase();
        const phone = String(e.phone || "").toLowerCase();
        const email = String(e.email || "").toLowerCase();
        const empId = String(e.id);
        const fullName = `${e.firstName || ""} ${e.lastName || ""}`.toLowerCase().trim();
        const pin = String(e.pinCode || e.passwordHash || "");

        return (
          serial === q ||
          empCode === q ||
          natId === q ||
          phone === q ||
          email === q ||
          empId === q ||
          fullName === q ||
          pin === q
        );
      });

      if (matched) {
        return formatEmployee(matched, officeMap);
      }
    }
  } catch (err) {
    console.warn("DB query employee by code failed, using fallback:", err);
  }

  const emp = memoryStore.employees.find((e) => {
    const serial = String(e.serialNumber || e.employeeCode || "").toLowerCase();
    const phone = String(e.phone || "").toLowerCase();
    const pin = String(e.pinCode || "");
    const empId = String(e.id);
    return serial === q || phone === q || pin === q || empId === q;
  });

  if (emp) {
    const office = memoryStore.offices.find((o) => o.id === emp.officeId);
    return formatEmployee({ ...emp, officeName: office?.name });
  }
  return null;
}

export async function getEmployeeByQrSecret(secret: string) {
  const s = String(secret || "").trim();
  if (!s) return null;

  try {
    const db = getDb();
    if (db) {
      const allEmps = await db.select().from(employees);
      const allOffices = await db.select().from(offices);
      const officeMap = new Map(allOffices.map((o: any) => [Number(o.id), o.name]));

      const matched = allEmps.find((e: any) =>
        (e.qrCodeData && String(e.qrCodeData) === s) ||
        (e.qrCodeSecret && String(e.qrCodeSecret) === s) ||
        (e.serialNumber && String(e.serialNumber) === s) ||
        (e.employeeCode && String(e.employeeCode) === s)
      );

      if (matched) {
        return formatEmployee(matched, officeMap);
      }
    }
  } catch (err) {
    console.warn("DB query employee by QR failed, using fallback:", err);
  }

  const emp = memoryStore.employees.find((e) => e.qrCodeSecret === s || e.qrCodeData === s || e.serialNumber === s);
  if (emp) {
    const office = memoryStore.offices.find((o) => o.id === emp.officeId);
    return formatEmployee({ ...emp, officeName: office?.name });
  }
  return null;
}

export async function getEmployeeById(id: number) {
  try {
    const db = getDb();
    if (db) {
      const res = await db.select().from(employees).where(eq(employees.id, Number(id)));
      if (res.length > 0) {
        const allOffices = await db.select().from(offices);
        const officeMap = new Map(allOffices.map((o: any) => [Number(o.id), o.name]));
        return formatEmployee(res[0], officeMap);
      }
    }
  } catch (err) {
    console.warn("DB query employee by id failed, using fallback:", err);
  }
  const emp = memoryStore.employees.find((e) => e.id === Number(id));
  if (emp) {
    const office = memoryStore.offices.find((o) => o.id === emp.officeId);
    return formatEmployee({ ...emp, officeName: office?.name });
  }
  return null;
}

export async function listEmployees(queryFilter?: any) {
  try {
    const db = getDb();
    if (db) {
      const allEmps = await db.select().from(employees);
      const allOffices = await db.select().from(offices);
      const officeMap = new Map(allOffices.map((o: any) => [Number(o.id), o.name]));

      let result = allEmps.map((e: any) => formatEmployee(e, officeMap));

      if (queryFilter?.officeId) {
        result = result.filter((e: any) => Number(e.officeId) === Number(queryFilter.officeId));
      }
      if (queryFilter?.status) {
        result = result.filter((e: any) => e.status === queryFilter.status);
      }
      if (queryFilter?.search) {
        const q = String(queryFilter.search).toLowerCase();
        result = result.filter(
          (e: any) =>
            (e.firstName && e.firstName.toLowerCase().includes(q)) ||
            (e.lastName && e.lastName.toLowerCase().includes(q)) ||
            (e.employeeCode && e.employeeCode.toLowerCase().includes(q)) ||
            (e.serialNumber && e.serialNumber.toLowerCase().includes(q))
        );
      }
      return result;
    }
  } catch (err) {
    console.warn("DB listEmployees failed, using fallback:", err);
  }

  let result = memoryStore.employees.map((e) => formatEmployee(e));

  if (queryFilter?.officeId) {
    result = result.filter((e) => Number(e.officeId) === Number(queryFilter.officeId));
  }
  if (queryFilter?.status) {
    result = result.filter((e) => e.status === queryFilter.status);
  }
  if (queryFilter?.search) {
    const q = String(queryFilter.search).toLowerCase();
    result = result.filter(
      (e) =>
        (e.firstName && e.firstName.toLowerCase().includes(q)) ||
        (e.lastName && e.lastName.toLowerCase().includes(q)) ||
        (e.employeeCode && e.employeeCode.toLowerCase().includes(q))
    );
  }
  return result;
}

export async function createEmployee(data: any) {
  const code = data.employeeCode || data.serialNumber || `EMP-${Math.floor(100000 + Math.random() * 900000)}`;
  const qr = data.qrCodeSecret || data.qrCodeData || `dhd-auth-${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;

  try {
    const db = getDb();
    if (db) {
      const [newEmp] = await db
        .insert(employees)
        .values({
          officeId: data.officeId ? Number(data.officeId) : 1,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email || null,
          phone: data.phone || null,
          position: data.role || data.position || "سائق توصيل",
          baseSalary: String(data.baseSalary || 40000),
          isActive: data.status ? data.status === "active" : true,
          serialNumber: code,
          qrCodeData: qr,
          hireDate: data.joinedAt || data.hireDate || new Date().toISOString().split("T")[0]
        })
        .returning();
      if (newEmp) {
        return formatEmployee(newEmp);
      }
    }
  } catch (err) {
    console.warn("DB createEmployee failed, using fallback:", err);
  }

  const newEmp = {
    id: memoryStore.employees.length > 0 ? Math.max(...memoryStore.employees.map((e) => e.id)) + 1 : 1,
    officeId: data.officeId ? Number(data.officeId) : 1,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    phone: data.phone || null,
    position: data.role || data.position || "سائق توصيل",
    baseSalary: String(data.baseSalary || 40000),
    isActive: true,
    serialNumber: code,
    qrCodeData: qr,
    createdAt: new Date().toISOString()
  };

  memoryStore.employees.push(newEmp);
  saveLocalStore();
  return formatEmployee(newEmp);
}

export async function updateEmployee(id: number, data: any) {
  try {
    const db = getDb();
    if (db) {
      const updateData: any = { updatedAt: new Date() };
      if (data.firstName !== undefined) updateData.firstName = data.firstName;
      if (data.lastName !== undefined) updateData.lastName = data.lastName;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.role !== undefined || data.position !== undefined) updateData.position = data.position || data.role;
      if (data.officeId !== undefined) updateData.officeId = Number(data.officeId);
      if (data.baseSalary !== undefined) updateData.baseSalary = String(data.baseSalary);
      if (data.status !== undefined) updateData.isActive = data.status === "active";
      if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);
      if (data.qrCodeSecret !== undefined || data.qrCodeData !== undefined) updateData.qrCodeData = data.qrCodeData || data.qrCodeSecret;

      const [updated] = await db.update(employees).set(updateData).where(eq(employees.id, Number(id))).returning();
      if (updated) {
        return formatEmployee(updated);
      }
    }
  } catch (err) {
    console.warn("DB updateEmployee failed, using fallback:", err);
  }

  const idx = memoryStore.employees.findIndex((e) => e.id === Number(id));
  if (idx !== -1) {
    memoryStore.employees[idx] = { ...memoryStore.employees[idx], ...data };
    saveLocalStore();
    return formatEmployee(memoryStore.employees[idx]);
  }
  return null;
}

export async function deleteEmployee(id: number, reason = "Deleted by admin") {
  try {
    const db = getDb();
    if (db) {
      await db.update(employees).set({ isActive: false, deletedAt: new Date(), deletionReason: reason }).where(eq(employees.id, Number(id)));
      return true;
    }
  } catch (err) {
    console.warn("DB deleteEmployee failed, using fallback:", err);
  }
  const emp = memoryStore.employees.find((e) => e.id === Number(id));
  if (emp) {
    emp.status = "inactive";
    emp.isActive = false;
    saveLocalStore();
    return true;
  }
  return false;
}

async function syncOfficialOfficesInDb(db: any) {
  try {
    const existing = await db.select().from(offices);
    let oeb = existing.find((o: any) => o.name?.includes("أم البواقي") || Number(o.id) === 1);
    let oef = existing.find((o: any) => o.name?.includes("عين الفكرون") || Number(o.id) === 2);

    if (oeb) {
      await db.update(offices).set({
        name: "مكتب أم البواقي",
        address: "أم البواقي، الجزائر",
        latitude: "35.8707722",
        longitude: "7.1101606"
      }).where(eq(offices.id, oeb.id));
    } else {
      await db.insert(offices).values({
        name: "مكتب أم البواقي",
        address: "أم البواقي، الجزائر",
        latitude: "35.8707722",
        longitude: "7.1101606",
        qrCodeData: "DHD-OFFICE-1"
      });
    }

    if (oef) {
      await db.update(offices).set({
        name: "مكتب عين الفكرون",
        address: "عين الفكرون، أم البواقي، الجزائر",
        latitude: "35.9700208",
        longitude: "6.8771648"
      }).where(eq(offices.id, oef.id));
    } else {
      await db.insert(offices).values({
        name: "مكتب عين الفكرون",
        address: "عين الفكرون، أم البواقي، الجزائر",
        latitude: "35.9700208",
        longitude: "6.8771648",
        qrCodeData: "DHD-OFFICE-2"
      });
    }
  } catch (err) {
    console.warn("syncOfficialOfficesInDb error:", err);
  }
}

// Offices
export async function listOffices() {
  try {
    const db = getDb();
    if (db) {
      await syncOfficialOfficesInDb(db);
      const res = await db.select().from(offices);
      if (res.length > 0) return res.map(formatOffice);
    }
  } catch (err) {
    console.warn("DB listOffices failed, using fallback:", err);
  }
  return memoryStore.offices.map(formatOffice);
}

export async function createOffice(data: any) {
  try {
    const db = getDb();
    if (db) {
      const [newOffice] = await db
        .insert(offices)
        .values({
          name: data.name,
          address: data.address || null,
          latitude: data.latitude ? String(data.latitude) : null,
          longitude: data.longitude ? String(data.longitude) : null,
          qrCodeData: `DHD-OFFICE-${Math.floor(Math.random() * 10000)}`
        })
        .returning();
      if (newOffice) {
        return formatOffice(newOffice);
      }
    }
  } catch (err) {
    console.warn("DB createOffice failed, using fallback:", err);
  }

  const newOffice = {
    id: memoryStore.offices.length > 0 ? Math.max(...memoryStore.offices.map((o) => o.id)) + 1 : 1,
    name: data.name,
    code: data.code || `OFF-${Math.floor(Math.random() * 1000)}`,
    city: data.city,
    address: data.address || null,
    phone: data.phone || null,
    latitude: data.latitude || "35.8707722",
    longitude: data.longitude || "7.1101606",
    geofenceRadiusMeters: data.geofenceRadiusMeters || 100,
    active: true,
    createdAt: new Date().toISOString()
  };
  memoryStore.offices.push(newOffice);
  saveLocalStore();
  return formatOffice(newOffice);
}

// Attendance
export async function listAttendance(employeeId?: number) {
  try {
    const db = getDb();
    if (db) {
      const all = await db.select().from(attendance);
      let list = all;
      if (employeeId) {
        list = list.filter((a: any) => Number(a.employeeId) === Number(employeeId));
      }
      return list;
    }
  } catch (err) {
    console.warn("DB listAttendance failed, using fallback:", err);
  }

  let list = memoryStore.attendance;
  if (employeeId) {
    list = list.filter((a) => Number(a.employeeId) === Number(employeeId));
  }
  return list;
}

export async function recordAttendance(data: any) {
  const emp = await getEmployeeById(Number(data.employeeId));
  const dateStr = data.date || new Date().toISOString().split("T")[0];
  const checkInTimeStr = data.checkInTime || new Date().toTimeString().split(" ")[0];

  try {
    const db = getDb();
    if (db) {
      const [record] = await db
        .insert(attendance)
        .values({
          employeeId: Number(data.employeeId),
          officeId: Number(data.officeId || emp?.officeId || 1),
          date: dateStr,
          checkInTime: checkInTimeStr,
          checkInLat: data.latitude ? String(data.latitude) : null,
          checkInLng: data.longitude ? String(data.longitude) : null,
          isAbsent: data.status === "absent",
          notes: data.notes || null
        })
        .returning();
      if (record) {
        const fullRecord = {
          ...record,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف"
        };
        return fullRecord;
      }
    }
  } catch (err) {
    console.warn("DB recordAttendance failed, using fallback:", err);
  }

  const record = {
    id: memoryStore.attendance.length > 0 ? Math.max(...memoryStore.attendance.map((a) => a.id)) + 1 : 1,
    employeeId: Number(data.employeeId),
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف",
    date: dateStr,
    checkInTime: checkInTimeStr,
    status: data.status || "present",
    notes: data.notes || null,
    createdAt: new Date().toISOString()
  };

  memoryStore.attendance.unshift(record);
  saveLocalStore();
  return record;
}

// Advances
export async function listAdvances(employeeId?: number) {
  try {
    const db = getDb();
    if (db) {
      const all = await db.select().from(advances);
      let list = all;
      if (employeeId) {
        list = list.filter((a: any) => Number(a.employeeId) === Number(employeeId));
      }
      return list;
    }
  } catch (err) {
    console.warn("DB listAdvances failed, using fallback:", err);
  }

  let list = memoryStore.advances;
  if (employeeId) {
    list = list.filter((a) => Number(a.employeeId) === Number(employeeId));
  }
  return list;
}

export async function createAdvance(data: any) {
  const emp = await getEmployeeById(Number(data.employeeId));

  try {
    const db = getDb();
    if (db) {
      const [record] = await db
        .insert(advances)
        .values({
          employeeId: Number(data.employeeId),
          amount: String(data.amount),
          reason: data.reason || "",
          status: "pending"
        })
        .returning();
      if (record) {
        const fullRecord = {
          ...record,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف"
        };
        return fullRecord;
      }
    }
  } catch (err) {
    console.warn("DB createAdvance failed, using fallback:", err);
  }

  const record = {
    id: memoryStore.advances.length > 0 ? Math.max(...memoryStore.advances.map((a) => a.id)) + 1 : 1,
    employeeId: Number(data.employeeId),
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف",
    amount: String(data.amount),
    reason: data.reason || "",
    status: "pending",
    createdAt: new Date().toISOString()
  };
  memoryStore.advances.unshift(record);
  saveLocalStore();
  return record;
}

export async function updateAdvanceStatus(id: number, status: string) {
  try {
    const db = getDb();
    if (db) {
      const [updated] = await db
        .update(advances)
        .set({
          status,
          resolvedAt: new Date()
        })
        .where(eq(advances.id, Number(id)))
        .returning();
      if (updated) {
        return updated;
      }
    }
  } catch (err) {
    console.warn("DB updateAdvanceStatus failed, using fallback:", err);
  }

  const adv = memoryStore.advances.find((a) => a.id === Number(id));
  if (adv) {
    adv.status = status;
    saveLocalStore();
    return adv;
  }
  return null;
}

// Leave Requests
export async function listLeaveRequests(employeeId?: number) {
  try {
    const db = getDb();
    if (db) {
      const all = await db.select().from(leaveRequests);
      let list = all;
      if (employeeId) {
        list = list.filter((l: any) => Number(l.employeeId) === Number(employeeId));
      }
      return list;
    }
  } catch (err) {
    console.warn("DB listLeaveRequests failed, using fallback:", err);
  }

  let list = memoryStore.leaveRequests;
  if (employeeId) {
    list = list.filter((l) => Number(l.employeeId) === Number(employeeId));
  }
  return list;
}

export async function createLeaveRequest(data: any) {
  const emp = await getEmployeeById(Number(data.employeeId));

  try {
    const db = getDb();
    if (db) {
      const [record] = await db
        .insert(leaveRequests)
        .values({
          employeeId: Number(data.employeeId),
          leaveType: data.leaveType || "personal",
          startDate: data.startDate,
          endDate: data.endDate,
          description: data.reason || data.description || "",
          status: "pending"
        })
        .returning();
      if (record) {
        const fullRecord = {
          ...record,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف"
        };
        return fullRecord;
      }
    }
  } catch (err) {
    console.warn("DB createLeaveRequest failed, using fallback:", err);
  }

  const record = {
    id: memoryStore.leaveRequests.length > 0 ? Math.max(...memoryStore.leaveRequests.map((l) => l.id)) + 1 : 1,
    employeeId: Number(data.employeeId),
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف",
    leaveType: data.leaveType || "personal",
    startDate: data.startDate,
    endDate: data.endDate,
    reason: data.reason || "",
    status: "pending",
    createdAt: new Date().toISOString()
  };
  memoryStore.leaveRequests.unshift(record);
  saveLocalStore();
  return record;
}

export async function updateLeaveRequestStatus(id: number, status: string) {
  try {
    const db = getDb();
    if (db) {
      const [updated] = await db
        .update(leaveRequests)
        .set({ status, resolvedAt: new Date() })
        .where(eq(leaveRequests.id, Number(id)))
        .returning();
      if (updated) {
        return updated;
      }
    }
  } catch (err) {
    console.warn("DB updateLeaveRequestStatus failed, using fallback:", err);
  }

  const req = memoryStore.leaveRequests.find((l) => l.id === Number(id));
  if (req) {
    req.status = status;
    saveLocalStore();
    return req;
  }
  return null;
}

// Vacation Requests
export async function listVacationRequests(employeeId?: number) {
  try {
    const db = getDb();
    if (db) {
      const all = await db.select().from(vacationRequests);
      let list = all;
      if (employeeId) {
        list = list.filter((v: any) => Number(v.employeeId) === Number(employeeId));
      }
      return list;
    }
  } catch (err) {
    console.warn("DB listVacationRequests failed, using fallback:", err);
  }

  let list = memoryStore.vacationRequests;
  if (employeeId) {
    list = list.filter((v) => Number(v.employeeId) === Number(employeeId));
  }
  return list;
}

export async function createVacationRequest(data: any) {
  const emp = await getEmployeeById(Number(data.employeeId));

  try {
    const db = getDb();
    if (db) {
      const [record] = await db
        .insert(vacationRequests)
        .values({
          employeeId: Number(data.employeeId),
          startDate: data.startDate,
          endDate: data.endDate,
          description: data.reason || data.description || "",
          status: "pending"
        })
        .returning();
      if (record) {
        const fullRecord = {
          ...record,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف"
        };
        return fullRecord;
      }
    }
  } catch (err) {
    console.warn("DB createVacationRequest failed, using fallback:", err);
  }

  const record = {
    id: memoryStore.vacationRequests.length > 0 ? Math.max(...memoryStore.vacationRequests.map((v) => v.id)) + 1 : 1,
    employeeId: Number(data.employeeId),
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف",
    startDate: data.startDate,
    endDate: data.endDate,
    daysRequested: Number(data.daysRequested || 1),
    reason: data.reason || "",
    status: "pending",
    createdAt: new Date().toISOString()
  };
  memoryStore.vacationRequests.unshift(record);
  saveLocalStore();
  return record;
}

export async function updateVacationRequestStatus(id: number, status: string) {
  try {
    const db = getDb();
    if (db) {
      const [updated] = await db
        .update(vacationRequests)
        .set({ status, resolvedAt: new Date() })
        .where(eq(vacationRequests.id, Number(id)))
        .returning();
      if (updated) {
        return updated;
      }
    }
  } catch (err) {
    console.warn("DB updateVacationRequestStatus failed, using fallback:", err);
  }

  const req = memoryStore.vacationRequests.find((v) => v.id === Number(id));
  if (req) {
    req.status = status;
    saveLocalStore();
    return req;
  }
  return null;
}

// Violations
export async function listViolations(employeeId?: number) {
  try {
    const db = getDb();
    if (db) {
      const all = await db.select().from(violations);
      let list = all;
      if (employeeId) {
        list = list.filter((v: any) => Number(v.employeeId) === Number(employeeId));
      }
      return list;
    }
  } catch (err) {
    console.warn("DB listViolations failed, using fallback:", err);
  }

  let list = memoryStore.violations;
  if (employeeId) {
    list = list.filter((v) => Number(v.employeeId) === Number(employeeId));
  }
  return list;
}

export async function createViolation(data: any) {
  const emp = await getEmployeeById(Number(data.employeeId));
  const vDate = data.date || new Date().toISOString().split("T")[0];

  try {
    const db = getDb();
    if (db) {
      const [record] = await db
        .insert(violations)
        .values({
          employeeId: Number(data.employeeId),
          violationType: data.type || "تأخير",
          amount: String(data.deductionAmount || data.amount || 0),
          reason: data.reason || "",
          violationDate: vDate,
          status: "applied"
        })
        .returning();
      if (record) {
        const fullRecord = {
          ...record,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف"
        };
        return fullRecord;
      }
    }
  } catch (err) {
    console.warn("DB createViolation failed, using fallback:", err);
  }

  const record = {
    id: memoryStore.violations.length > 0 ? Math.max(...memoryStore.violations.map((v) => v.id)) + 1 : 1,
    employeeId: Number(data.employeeId),
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف",
    type: data.type || "تأخير",
    deductionAmount: String(data.deductionAmount || 0),
    reason: data.reason || "",
    date: vDate,
    status: "applied",
    createdAt: new Date().toISOString()
  };
  memoryStore.violations.unshift(record);
  saveLocalStore();
  return record;
}

// Salaries
export async function listSalaries(employeeId?: number) {
  try {
    const db = getDb();
    if (db) {
      const all = await db.select().from(salaries);
      let list = all;
      if (employeeId) {
        list = list.filter((s: any) => Number(s.employeeId) === Number(employeeId));
      }
      return list;
    }
  } catch (err) {
    console.warn("DB listSalaries failed, using fallback:", err);
  }

  let list = memoryStore.salaries;
  if (employeeId) {
    list = list.filter((s) => Number(s.employeeId) === Number(employeeId));
  }
  return list;
}

// Notifications
export async function listNotifications(recipientType = "admin", recipientId?: number) {
  try {
    const db = getDb();
    if (db) {
      const all = await db.select().from(notifications).where(eq(notifications.recipientType, recipientType));
      let list = all;
      if (recipientId) {
        list = list.filter((n: any) => Number(n.recipientEmployeeId) === Number(recipientId) || n.recipientEmployeeId === null);
      }
      return list;
    }
  } catch (err) {
    console.warn("DB listNotifications failed, using fallback:", err);
  }

  let list = memoryStore.notifications.filter((n) => n.recipientType === recipientType);
  if (recipientId) {
    list = list.filter((n) => Number(n.recipientId) === Number(recipientId) || n.recipientId === null);
  }
  return list;
}

export async function markNotificationsRead() {
  try {
    const db = getDb();
    if (db) {
      await db.update(notifications).set({ isRead: true });
    }
  } catch (err) {
    console.warn("DB markNotificationsRead failed:", err);
  }
  memoryStore.notifications.forEach((n) => (n.read = true));
  saveLocalStore();
  return true;
}

// Settings
export async function getSettings() {
  try {
    const db = getDb();
    if (db) {
      const res = await db.select().from(settings);
      if (res.length > 0) return res[0];
    }
  } catch (err) {
    console.warn("DB getSettings failed, using fallback:", err);
  }
  return memoryStore.settings;
}

export async function updateSettings(data: any) {
  try {
    const db = getDb();
    if (db) {
      const existing = await db.select().from(settings);
      if (existing.length > 0) {
        const [updated] = await db
          .update(settings)
          .set({
            ...data,
            updatedAt: new Date()
          })
          .where(eq(settings.id, existing[0].id))
          .returning();
        if (updated) {
          return updated;
        }
      } else {
        const [inserted] = await db
          .insert(settings)
          .values({
            language: data.language || "ar",
            darkMode: false
          })
          .returning();
        if (inserted) {
          return inserted;
        }
      }
    }
  } catch (err) {
    console.warn("DB updateSettings failed, using fallback:", err);
  }

  memoryStore.settings = {
    ...memoryStore.settings,
    ...data,
    updatedAt: new Date().toISOString()
  };
  saveLocalStore();
  return memoryStore.settings;
}

// Stats
export async function getDashboardStats() {
  const employeesList = await listEmployees();
  const officesList = await listOffices();
  const attendanceList = await listAttendance();
  const advancesList = await listAdvances();

  const totalEmployees = employeesList.length;
  const activeOffices = officesList.filter((o: any) => o.active).length;
  const today = new Date().toISOString().split("T")[0];
  const presentToday = attendanceList.filter((a: any) => String(a.date).startsWith(today) && (a.status === "present" || !a.isAbsent)).length;
  const pendingAdvances = advancesList.filter((a: any) => a.status === "pending").length;

  return {
    totalEmployees,
    presentToday,
    activeOffices,
    pendingAdvances
  };
}
