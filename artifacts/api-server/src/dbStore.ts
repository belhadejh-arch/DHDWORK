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
      name: "المكتب الرئيسي - الجزائر العاصمة",
      code: "ALG-01",
      city: "الجزائر",
      address: "الجزائر الوسطى، العاصمة",
      phone: "021000001",
      latitude: "36.7538",
      longitude: "3.0588",
      geofenceRadiusMeters: 100,
      active: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 2,
      name: "فرع وهران",
      code: "ORN-01",
      city: "وهران",
      address: "حي أكيد لطفي، وهران",
      phone: "041000002",
      latitude: "35.6971",
      longitude: "-0.6308",
      geofenceRadiusMeters: 150,
      active: true,
      createdAt: new Date().toISOString()
    }
  ],
  employees: [
    {
      id: 1,
      nationalId: "1098237491",
      employeeCode: "EMP-001",
      firstName: "أحمد",
      lastName: "بن علي",
      email: "ahmed@dhd-livraison.dz",
      phone: "0550123456",
      role: "delivery_driver",
      officeId: 1,
      officeName: "المكتب الرئيسي - الجزائر العاصمة",
      baseSalary: "45000",
      status: "active",
      qrCodeSecret: "QR-EMP-001-A1",
      pinCode: "1234",
      joinedAt: "2024-01-15",
      createdAt: new Date().toISOString()
    },
    {
      id: 2,
      nationalId: "1098237492",
      employeeCode: "EMP-002",
      firstName: "كريم",
      lastName: "محمودي",
      email: "karim@dhd-livraison.dz",
      phone: "0660987654",
      role: "office_agent",
      officeId: 2,
      officeName: "فرع وهران",
      baseSalary: "50000",
      status: "active",
      qrCodeSecret: "QR-EMP-002-B2",
      pinCode: "5678",
      joinedAt: "2024-02-01",
      createdAt: new Date().toISOString()
    }
  ],
  attendance: [
    {
      id: 1,
      employeeId: 1,
      employeeName: "أحمد بن علي",
      date: new Date().toISOString().split("T")[0],
      checkIn: new Date().toISOString(),
      checkOut: null,
      status: "present",
      notes: "حضور مبكر",
      createdAt: new Date().toISOString()
    }
  ],
  advances: [],
  bonuses: [],
  violations: [],
  salaries: [],
  leaveRequests: [],
  vacationRequests: [],
  notifications: [
    {
      id: 1,
      recipientType: "admin",
      recipientId: null,
      title: "مرحباً بكم في نظام DHD Livraison",
      message: "تم تشغيل النظام وربطه بقاعدة البيانات بنجاح.",
      read: false,
      createdAt: new Date().toISOString()
    }
  ],
  settings: {
    id: 1,
    companyName: "DHD Livraison",
    currency: "DZD",
    language: "ar",
    workStartTime: "08:00",
    workEndTime: "17:00",
    updatedAt: new Date().toISOString()
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

// Database helper functions with fallback
export async function getAdminByEmail(email: string) {
  try {
    const db = getDb();
    if (db) {
      const res = await db.select().from(admins).where(eq(admins.email, email));
      if (res.length > 0) return res[0];
    }
  } catch (err) {
    console.warn("DB query admin failed, using fallback:", err);
  }
  return memoryStore.admins.find((a) => a.email.toLowerCase() === email.toLowerCase()) || null;
}

export async function getEmployeeByCode(code: string) {
  try {
    const db = getDb();
    if (db) {
      const res = await db.select().from(employees).where(eq(employees.employeeCode, code));
      if (res.length > 0) {
        const emp = res[0];
        const officeRes = emp.officeId ? await db.select().from(offices).where(eq(offices.id, emp.officeId)) : [];
        return {
          ...emp,
          officeName: officeRes[0]?.name || "DHD Livraison"
        };
      }
    }
  } catch (err) {
    console.warn("DB query employee by code failed, using fallback:", err);
  }
  const emp = memoryStore.employees.find((e) => e.employeeCode.toLowerCase() === code.toLowerCase() || e.pinCode === code);
  if (emp) {
    const office = memoryStore.offices.find((o) => o.id === emp.officeId);
    return { ...emp, officeName: office?.name || "DHD Livraison" };
  }
  return null;
}

export async function getEmployeeByQrSecret(secret: string) {
  try {
    const db = getDb();
    if (db) {
      const res = await db.select().from(employees).where(eq(employees.qrCodeSecret, secret));
      if (res.length > 0) {
        const emp = res[0];
        const officeRes = emp.officeId ? await db.select().from(offices).where(eq(offices.id, emp.officeId)) : [];
        return {
          ...emp,
          officeName: officeRes[0]?.name || "DHD Livraison"
        };
      }
    }
  } catch (err) {
    console.warn("DB query employee by QR failed, using fallback:", err);
  }
  const emp = memoryStore.employees.find((e) => e.qrCodeSecret === secret);
  if (emp) {
    const office = memoryStore.offices.find((o) => o.id === emp.officeId);
    return { ...emp, officeName: office?.name || "DHD Livraison" };
  }
  return null;
}

export async function getEmployeeById(id: number) {
  try {
    const db = getDb();
    if (db) {
      const res = await db.select().from(employees).where(eq(employees.id, id));
      if (res.length > 0) {
        const emp = res[0];
        const officeRes = emp.officeId ? await db.select().from(offices).where(eq(offices.id, emp.officeId)) : [];
        return {
          ...emp,
          officeName: officeRes[0]?.name || "DHD Livraison"
        };
      }
    }
  } catch (err) {
    console.warn("DB query employee by id failed, using fallback:", err);
  }
  const emp = memoryStore.employees.find((e) => e.id === Number(id));
  if (emp) {
    const office = memoryStore.offices.find((o) => o.id === emp.officeId);
    return { ...emp, officeName: office?.name || "DHD Livraison" };
  }
  return null;
}

export async function listEmployees(queryFilter?: any) {
  try {
    const db = getDb();
    if (db) {
      const allEmps = await db.select().from(employees);
      const allOffices = await db.select().from(offices);
      const officeMap = new Map(allOffices.map((o: any) => [o.id, o.name]));
      let result = allEmps.map((e: any) => ({
        ...e,
        officeName: e.officeId ? officeMap.get(e.officeId) || "DHD Livraison" : "DHD Livraison"
      }));

      if (queryFilter?.officeId) {
        result = result.filter((e: any) => e.officeId === Number(queryFilter.officeId));
      }
      if (queryFilter?.status) {
        result = result.filter((e: any) => e.status === queryFilter.status);
      }
      if (queryFilter?.search) {
        const q = String(queryFilter.search).toLowerCase();
        result = result.filter(
          (e: any) =>
            e.firstName.toLowerCase().includes(q) ||
            e.lastName.toLowerCase().includes(q) ||
            e.employeeCode.toLowerCase().includes(q)
        );
      }
      return result;
    }
  } catch (err) {
    console.warn("DB listEmployees failed, using fallback:", err);
  }

  let result = memoryStore.employees.map((e) => {
    const office = memoryStore.offices.find((o) => o.id === e.officeId);
    return { ...e, officeName: office?.name || "DHD Livraison" };
  });

  if (queryFilter?.officeId) {
    result = result.filter((e) => e.officeId === Number(queryFilter.officeId));
  }
  if (queryFilter?.status) {
    result = result.filter((e) => e.status === queryFilter.status);
  }
  if (queryFilter?.search) {
    const q = String(queryFilter.search).toLowerCase();
    result = result.filter(
      (e) =>
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q)
    );
  }
  return result;
}

export async function createEmployee(data: any) {
  const code = data.employeeCode || `EMP-${String(memoryStore.employees.length + 1).padStart(3, "0")}`;
  const qr = data.qrCodeSecret || `QR-${code}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  try {
    const db = getDb();
    if (db) {
      const [newEmp] = await db
        .insert(employees)
        .values({
          nationalId: data.nationalId || null,
          employeeCode: code,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email || null,
          phone: data.phone || null,
          role: data.role || "delivery_driver",
          officeId: data.officeId ? Number(data.officeId) : null,
          baseSalary: String(data.baseSalary || 40000),
          status: data.status || "active",
          qrCodeSecret: qr,
          pinCode: data.pinCode || "1234",
          joinedAt: data.joinedAt || new Date().toISOString().split("T")[0]
        })
        .returning();
      if (newEmp) {
        // Backup to memory
        memoryStore.employees.push(newEmp);
        saveLocalStore();
        return newEmp;
      }
    }
  } catch (err) {
    console.warn("DB createEmployee failed, using fallback:", err);
  }

  const newEmp = {
    id: memoryStore.employees.length > 0 ? Math.max(...memoryStore.employees.map((e) => e.id)) + 1 : 1,
    nationalId: data.nationalId || null,
    employeeCode: code,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    phone: data.phone || null,
    role: data.role || "delivery_driver",
    officeId: data.officeId ? Number(data.officeId) : null,
    baseSalary: String(data.baseSalary || 40000),
    status: data.status || "active",
    qrCodeSecret: qr,
    pinCode: data.pinCode || "1234",
    joinedAt: data.joinedAt || new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString()
  };

  memoryStore.employees.push(newEmp);
  saveLocalStore();
  return newEmp;
}

export async function updateEmployee(id: number, data: any) {
  try {
    const db = getDb();
    if (db) {
      const updateData: any = {};
      if (data.firstName !== undefined) updateData.firstName = data.firstName;
      if (data.lastName !== undefined) updateData.lastName = data.lastName;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.officeId !== undefined) updateData.officeId = Number(data.officeId);
      if (data.baseSalary !== undefined) updateData.baseSalary = String(data.baseSalary);
      if (data.status !== undefined) updateData.status = data.status;

      const [updated] = await db.update(employees).set(updateData).where(eq(employees.id, Number(id))).returning();
      if (updated) {
        const idx = memoryStore.employees.findIndex((e) => e.id === Number(id));
        if (idx !== -1) {
          memoryStore.employees[idx] = { ...memoryStore.employees[idx], ...updated };
          saveLocalStore();
        }
        return updated;
      }
    }
  } catch (err) {
    console.warn("DB updateEmployee failed, using fallback:", err);
  }

  const idx = memoryStore.employees.findIndex((e) => e.id === Number(id));
  if (idx !== -1) {
    memoryStore.employees[idx] = { ...memoryStore.employees[idx], ...data };
    saveLocalStore();
    return memoryStore.employees[idx];
  }
  return null;
}

export async function deleteEmployee(id: number) {
  try {
    const db = getDb();
    if (db) {
      await db.delete(employees).where(eq(employees.id, Number(id)));
    }
  } catch (err) {
    console.warn("DB deleteEmployee failed:", err);
  }
  memoryStore.employees = memoryStore.employees.filter((e) => e.id !== Number(id));
  saveLocalStore();
  return true;
}

// Offices
export async function listOffices() {
  try {
    const db = getDb();
    if (db) {
      const res = await db.select().from(offices);
      if (res.length > 0) return res;
    }
  } catch (err) {
    console.warn("DB listOffices failed, using fallback:", err);
  }
  return memoryStore.offices;
}

export async function createOffice(data: any) {
  try {
    const db = getDb();
    if (db) {
      const [newOffice] = await db
        .insert(offices)
        .values({
          name: data.name,
          code: data.code || `OFF-${Math.floor(Math.random() * 1000)}`,
          city: data.city,
          address: data.address || null,
          phone: data.phone || null,
          latitude: data.latitude ? String(data.latitude) : null,
          longitude: data.longitude ? String(data.longitude) : null,
          geofenceRadiusMeters: data.geofenceRadiusMeters || 100,
          active: true
        })
        .returning();
      if (newOffice) {
        memoryStore.offices.push(newOffice);
        saveLocalStore();
        return newOffice;
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
    latitude: data.latitude || "36.7538",
    longitude: data.longitude || "3.0588",
    geofenceRadiusMeters: data.geofenceRadiusMeters || 100,
    active: true,
    createdAt: new Date().toISOString()
  };
  memoryStore.offices.push(newOffice);
  saveLocalStore();
  return newOffice;
}

// Attendance
export async function listAttendance(employeeId?: number) {
  let list = memoryStore.attendance;
  if (employeeId) {
    list = list.filter((a) => a.employeeId === Number(employeeId));
  }
  return list;
}

export async function recordAttendance(data: any) {
  const emp = await getEmployeeById(Number(data.employeeId));
  const record = {
    id: memoryStore.attendance.length > 0 ? Math.max(...memoryStore.attendance.map((a) => a.id)) + 1 : 1,
    employeeId: Number(data.employeeId),
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف",
    date: data.date || new Date().toISOString().split("T")[0],
    checkIn: data.checkIn || new Date().toISOString(),
    checkOut: data.checkOut || null,
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
  let list = memoryStore.advances;
  if (employeeId) {
    list = list.filter((a) => a.employeeId === Number(employeeId));
  }
  return list;
}

export async function createAdvance(data: any) {
  const emp = await getEmployeeById(Number(data.employeeId));
  const record = {
    id: memoryStore.advances.length > 0 ? Math.max(...memoryStore.advances.map((a) => a.id)) + 1 : 1,
    employeeId: Number(data.employeeId),
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف",
    amount: String(data.amount),
    reason: data.reason || "",
    status: "pending",
    requestDate: new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString()
  };
  memoryStore.advances.unshift(record);
  saveLocalStore();
  return record;
}

export async function updateAdvanceStatus(id: number, status: string) {
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
  let list = memoryStore.leaveRequests;
  if (employeeId) {
    list = list.filter((l) => l.employeeId === Number(employeeId));
  }
  return list;
}

export async function createLeaveRequest(data: any) {
  const emp = await getEmployeeById(Number(data.employeeId));
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
  let list = memoryStore.vacationRequests;
  if (employeeId) {
    list = list.filter((v) => v.employeeId === Number(employeeId));
  }
  return list;
}

export async function createVacationRequest(data: any) {
  const emp = await getEmployeeById(Number(data.employeeId));
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
  let list = memoryStore.violations;
  if (employeeId) {
    list = list.filter((v) => v.employeeId === Number(employeeId));
  }
  return list;
}

export async function createViolation(data: any) {
  const emp = await getEmployeeById(Number(data.employeeId));
  const record = {
    id: memoryStore.violations.length > 0 ? Math.max(...memoryStore.violations.map((v) => v.id)) + 1 : 1,
    employeeId: Number(data.employeeId),
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف",
    type: data.type || "تأخير",
    deductionAmount: String(data.deductionAmount || 0),
    reason: data.reason || "",
    date: data.date || new Date().toISOString().split("T")[0],
    status: "applied",
    createdAt: new Date().toISOString()
  };
  memoryStore.violations.unshift(record);
  saveLocalStore();
  return record;
}

// Salaries
export async function listSalaries(employeeId?: number) {
  let list = memoryStore.salaries;
  if (employeeId) {
    list = list.filter((s) => s.employeeId === Number(employeeId));
  }
  return list;
}

// Notifications
export async function listNotifications(recipientType = "admin", recipientId?: number) {
  let list = memoryStore.notifications.filter((n) => n.recipientType === recipientType);
  if (recipientId) {
    list = list.filter((n) => n.recipientId === Number(recipientId) || n.recipientId === null);
  }
  return list;
}

export async function markNotificationsRead() {
  memoryStore.notifications.forEach((n) => (n.read = true));
  saveLocalStore();
  return true;
}

// Settings
export async function getSettings() {
  return memoryStore.settings;
}

export async function updateSettings(data: any) {
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
  const totalEmployees = memoryStore.employees.length;
  const activeOffices = memoryStore.offices.filter((o) => o.active).length;
  const today = new Date().toISOString().split("T")[0];
  const presentToday = memoryStore.attendance.filter((a) => a.date === today && a.status === "present").length;
  const pendingAdvances = memoryStore.advances.filter((a) => a.status === "pending").length;

  return {
    totalEmployees,
    presentToday,
    activeOffices,
    pendingAdvances
  };
}
