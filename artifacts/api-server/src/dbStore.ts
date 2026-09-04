import { getDb, offices, employees, attendance, advances, bonuses, violations, salaries, leaveRequests, vacationRequests, notifications, settings, admins, announcements, announcementRecipients, announcementReads, pushSubscriptions, sessions } from "../../../lib/db/src/index.js";
import { eq, and, asc, desc, sql, like, or, isNull, gt, ne } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import webpush from "web-push";

let pushConfigured = false;
function configurePush() {
  if (pushConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  pushConfigured = true;
  return true;
}

type NotificationListener = (notification: any) => void;
const notificationListeners = new Set<NotificationListener>();

export function subscribeToNotifications(listener: NotificationListener) {
  notificationListeners.add(listener);
  return () => notificationListeners.delete(listener);
}

function publishNotification(notification: any) {
  if (!notification) return;
  for (const listener of notificationListeners) {
    try {
      listener(notification);
    } catch (error) {
      console.warn("notification stream listener failed:", error);
    }
  }
}

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

// Empty local compatibility store. PostgreSQL remains the source of truth and
// no generated identities or demo offices are returned from this store.
const defaultStore: DataStore = {
  admins: [],
  offices: [],
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
    qrCodeSecret: o.qrCodeData || null,
    qrCodeData: o.qrCodeData || null
  };
}

function formatEmployee(e: any, officeMap?: Map<number, string>) {
  if (!e) return null;
  const empId = Number(e.id);
  const isAct = e.isActive !== false && e.status !== "inactive" && !e.deletedAt;
  const officeName = officeMap?.get(Number(e.officeId)) || e.officeName || null;

  return {
    ...e,
    id: empId,
    nationalId: e.nationalId || null,
    employeeCode: e.serialNumber || e.employeeCode || null,
    serialNumber: e.serialNumber || e.employeeCode || null,
    firstName: e.firstName || "",
    lastName: e.lastName || "",
    email: e.email || "",
    phone: e.phone || "",
    role: e.position || e.role || null,
    position: e.position || e.role || null,
    officeId: e.officeId == null ? null : Number(e.officeId),
    officeName,
    // The admin employee page formats this value immediately; keep the API
    // numeric-safe even when an employee has not been assigned a salary yet.
    baseSalary: e.baseSalary == null ? "0" : String(e.baseSalary),
    status: isAct ? "active" : "inactive",
    isActive: isAct,
    qrCodeSecret: e.qrCodeData || e.qrCodeSecret || null,
    qrCodeData: e.qrCodeData || e.qrCodeSecret || null,
    restDays: e.restDays || null,
    joinedAt: e.hireDate || e.joinedAt || null,
    createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : null
  };
}

function employeeName(employee: any) {
  if (!employee) return null;
  return `${employee.firstName || ""} ${employee.lastName || ""}`.trim() || employee.serialNumber || `#${employee.id}`;
}

function timeToMinutes(value: unknown) {
  if (!value) return null;
  const parts = String(value).split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part)) || parts.length < 2) return null;
  return parts[0] * 60 + parts[1];
}

function attendanceMetrics(record: any, employee?: any) {
  const checkIn = timeToMinutes(record?.checkInTime);
  const checkOut = timeToMinutes(record?.checkOutTime);
  const start = timeToMinutes(employee?.workStartTime) ?? timeToMinutes(memoryStore.settings?.workStartTime) ?? 8 * 60;
  const end = timeToMinutes(employee?.workEndTime) ?? timeToMinutes(memoryStore.settings?.workEndTime) ?? 17 * 60;

  const workedMinutes = record?.isAbsent
    ? null
    : record?.workedMinutes != null
      ? Number(record.workedMinutes)
      : checkIn != null && checkOut != null
        ? (checkOut >= checkIn ? checkOut - checkIn : checkOut + 24 * 60 - checkIn)
        : null;
  const lateMinutes = record?.lateMinutes != null
    ? Number(record.lateMinutes)
    : checkIn != null
      ? Math.max(0, checkIn - start)
      : 0;
  const isAbsent = Boolean(record?.isAbsent);
  const status = isAbsent ? "absent" : lateMinutes > 0 ? "late" : checkIn != null ? "present" : "absent";
  const overtimeMinutes = record?.overtimeMinutes != null
    ? Number(record.overtimeMinutes)
    : checkOut != null ? Math.max(0, checkOut - end) : 0;

  return { workedMinutes, lateMinutes, overtimeMinutes, isAbsent, status };
}

function formatAttendanceRecord(record: any, employee?: any, office?: any, requestedDate?: string) {
  const metrics = attendanceMetrics(record, employee);
  return {
    ...(record || {}),
    id: record?.id ?? null,
    employeeId: Number(employee?.id ?? record?.employeeId),
    officeId: record?.officeId ?? employee?.officeId ?? office?.id ?? null,
    date: record?.date || requestedDate || null,
    employeeName: employeeName(employee) || record?.employeeName || "—",
    officeName: office?.name || record?.officeName || null,
    ...metrics,
  };
}

function employeeHasRestDay(employee: any, dateValue: string) {
  const raw = employee?.restDays;
  const date = new Date(`${dateValue}T12:00:00Z`);
  const weekday = date.getUTCDay();
  if (!raw) return weekday === 5 || weekday === 6;
  let values: unknown[] = [];
  try {
    const parsed = JSON.parse(String(raw));
    values = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    values = String(raw).split(",");
  }
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const arabicNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  return values.some((value) => {
    const normalized = String(value).trim().toLowerCase();
    return normalized === String(weekday) || normalized === names[weekday] ||
      normalized === arabicNames[weekday].toLowerCase() ||
      (weekday === 0 && ["الأحد", "الاحد"].includes(normalized)) ||
      (weekday === 1 && ["الإثنين", "الاثنين"].includes(normalized));
  });
}

async function syncDailyAbsences(db: any, dateFilter: string) {
  const activeEmployees = await db.select().from(employees).where(eq(employees.isActive, true));
  const [approvedLeaves, approvedVacations] = await Promise.all([
    db.select().from(leaveRequests).where(eq(leaveRequests.status, "approved")),
    db.select().from(vacationRequests).where(eq(vacationRequests.status, "approved")),
  ]);
  const onApprovedTimeOff = (employeeId: number) => [...approvedLeaves, ...approvedVacations].some((request: any) =>
    Number(request.employeeId) === Number(employeeId) &&
    String(request.startDate || "") <= dateFilter &&
    String(request.endDate || request.startDate || "") >= dateFilter,
  );
  const existing = await db.select({ employeeId: attendance.employeeId })
    .from(attendance).where(eq(attendance.date, dateFilter));
  const existingIds = new Set(existing.map((row: any) => Number(row.employeeId)));
  const missing = activeEmployees.filter((employee: any) => {
    const hireDate = String(employee.hireDate || "").slice(0, 10);
    return !existingIds.has(Number(employee.id)) &&
      (!hireDate || dateFilter >= hireDate) &&
      !employeeHasRestDay(employee, dateFilter) &&
      !onApprovedTimeOff(Number(employee.id));
  });
  if (!missing.length) return;
  await db.insert(attendance).values(missing.map((employee: any) => ({
    employeeId: Number(employee.id),
    officeId: employee.officeId == null ? null : Number(employee.officeId),
    date: dateFilter,
    isAbsent: true,
    notes: "غياب تلقائي: لم يتم تسجيل الحضور في يوم عمل",
    createdAt: new Date(),
  }))).onConflictDoNothing({ target: [attendance.employeeId, attendance.date] });
}

function formatRequestRecord(record: any, employee?: any, office?: any) {
  return {
    ...record,
    employeeName: employeeName(employee) || record?.employeeName || "—",
    officeName: office?.name || record?.officeName || null,
  };
}

// PostgreSQL is the source of truth. The local store is kept only for legacy
// write compatibility; reads for identities, employees, offices, and QR never
// fall back to generated or mock records.
export async function getAdminById(id: number) {
  try {
    const db = getDb();
    const res = await db.select().from(admins).where(eq(admins.id, Number(id)));
    return res[0] || null;
  } catch (err) {
    throw err;
  }
}

export async function getAdminByEmail(emailOrUsername: string) {
  try {
    const db = getDb();
    const allAdmins = await db.select().from(admins);
    const q = String(emailOrUsername || "").toLowerCase().trim();
    return allAdmins.find((a: any) =>
      (a.email && a.email.toLowerCase() === q) ||
      (a.username && a.username.toLowerCase() === q) ||
      (a.serialNumber && a.serialNumber.toLowerCase() === q)
    ) || null;
  } catch (err) {
    throw err;
  }
}

export async function getAdminByQrSecret(secret: string) {
  const value = String(secret || "").trim();
  if (!value) return null;
  const db = getDb();
  const result = await db.select().from(admins).where(eq(admins.qrCodeData, value));
  return result[0] || null;
}

export async function createSession(userType: "admin" | "employee", userId: number) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ token, userType, userId: Number(userId), createdAt: now, expiresAt });
  return token;
}

export async function getSession(token: string) {
  if (!token) return null;
  const db = getDb();
  const rows = await db.select().from(sessions).where(and(
    eq(sessions.token, token),
    gt(sessions.expiresAt, new Date()),
  )).limit(1);
  return rows[0] || null;
}

export async function deleteSession(token: string) {
  if (!token) return false;
  const db = getDb();
  const deleted = await db.delete(sessions).where(eq(sessions.token, token)).returning({ id: sessions.id });
  return deleted.length > 0;
}

export async function getEmployeeByCode(code: string) {
  const q = String(code || "").toLowerCase().trim();
  if (!q) return null;

  try {
    const db = getDb();
    if (db) {
      // Employee login is a hot path. Match the common credentials in SQL so a
      // login does not load the complete employees table into memory.
      const directMatches = await db.select().from(employees).where(or(
        sql`lower(coalesce(${employees.serialNumber}, '')) = ${q}`,
        sql`lower(coalesce(${employees.phone}, '')) = ${q}`,
        sql`lower(coalesce(${employees.email}, '')) = ${q}`,
        sql`lower(coalesce(${employees.passwordHash}, '')) = ${q}`,
        ...(Number.isInteger(Number(q)) ? [eq(employees.id, Number(q))] : [])
      )).limit(1);

      if (directMatches[0]) {
        const matchingOffice = directMatches[0].officeId
          ? await db.select().from(offices).where(eq(offices.id, Number(directMatches[0].officeId))).limit(1)
          : [];
        const officeMap = new Map<number, string>(
          matchingOffice.map((o: any) => [Number(o.id), o.name] as [number, string]),
        );
        return formatEmployee(directMatches[0], officeMap);
      }
    }
  } catch (err) {
    console.error("DB query employee by code failed:", err);
    throw err;
  }

  return null;
}

export async function getEmployeeByQrSecret(secret: string) {
  const s = String(secret || "").trim();
  if (!s) return null;

  try {
    const db = getDb();
    const result = await db.select().from(employees).where(eq(employees.qrCodeData, s));
    const matched = result[0];
    if (matched) {
      const allOffices = await db.select().from(offices);
      const officeMap = new Map<number, string>(allOffices.map((o: any) => [Number(o.id), o.name] as [number, string]));
      return formatEmployee(matched, officeMap);
    }
  } catch (err) {
    throw err;
  }
  return null;
}

export async function getEmployeeById(id: number) {
  try {
    const db = getDb();
    const res = await db.select().from(employees).where(eq(employees.id, Number(id)));
    if (res.length > 0) {
      const allOffices = await db.select().from(offices);
      const officeMap = new Map<number, string>(allOffices.map((o: any) => [Number(o.id), o.name] as [number, string]));
      return formatEmployee(res[0], officeMap);
    }
  } catch (err) {
    throw err;
  }
  return null;
}

export async function listEmployees(queryFilter?: any) {
  try {
    const db = getDb();
    const allOffices = await db.select().from(offices);
    const officeMap = new Map<number, string>(allOffices.map((o: any) => [Number(o.id), o.name] as [number, string]));

    // Default: return only active, non-deleted employees.
    // Pass queryFilter.all='1' or queryFilter.includeAll=true to bypass this.
    const includeAll = queryFilter?.all === '1' || queryFilter?.all === true || queryFilter?.includeAll;
    const statusFilter = queryFilter?.status;

    let allEmps: any[];
    if (includeAll) {
      allEmps = await db.select().from(employees).orderBy(asc(employees.id));
    } else if (statusFilter === 'inactive' || statusFilter === 'former') {
      allEmps = await db.select().from(employees)
        .where(or(eq(employees.isActive, false), sql`${employees.deletedAt} IS NOT NULL`))
        .orderBy(asc(employees.id));
    } else {
      // Default: active employees only
      allEmps = await db.select().from(employees)
        .where(and(eq(employees.isActive, true), isNull(employees.deletedAt)))
        .orderBy(asc(employees.id));
    }

    let result = allEmps.map((e: any) => formatEmployee(e, officeMap));

    if (queryFilter?.officeId) {
      result = result.filter((e: any) => Number(e.officeId) === Number(queryFilter.officeId));
    }
    // Status is already handled in the SQL query above, but keep the in-memory filter
    // for 'active' when includeAll is set
    if (includeAll && statusFilter && statusFilter !== 'inactive' && statusFilter !== 'former') {
      result = result.filter((e: any) => e.status === statusFilter);
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
  } catch (err) {
    throw err;
  }
}

export async function createEmployee(data: any) {
  const code = data.employeeCode || data.serialNumber || `EMP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const qr = data.qrCodeSecret || data.qrCodeData || `dhd-auth-${crypto.randomBytes(24).toString("base64url")}`;

  try {
    const db = getDb();
    if (db) {
      const officeId = Number(data.officeId);
      if (!Number.isInteger(officeId) || officeId <= 0) throw new Error("يجب اختيار مكتب صالح للموظف");
      const office = await db.select({ id: offices.id }).from(offices).where(eq(offices.id, officeId)).limit(1);
      if (!office[0]) throw new Error("المكتب المحدد غير موجود");
      if (!String(data.firstName || "").trim() || !String(data.lastName || "").trim()) {
        throw new Error("اسم الموظف مطلوب");
      }
      const [newEmp] = await db
        .insert(employees)
        .values({
          officeId,
          firstName: String(data.firstName).trim(),
          lastName: String(data.lastName).trim(),
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
    throw err;
  }
  return null;
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
      if (data.role !== undefined || data.position !== undefined) {
        updateData.position = data.position || data.role;
      }
      if (data.officeId !== undefined) {
        const officeId = Number(data.officeId);
        if (!Number.isInteger(officeId) || officeId <= 0) throw new Error("المكتب المحدد غير صالح");
        const office = await db.select({ id: offices.id }).from(offices).where(eq(offices.id, officeId)).limit(1);
        if (!office[0]) throw new Error("المكتب المحدد غير موجود");
        updateData.officeId = officeId;
      }
      if (data.baseSalary !== undefined) updateData.baseSalary = String(data.baseSalary);
      if (data.status !== undefined) updateData.isActive = data.status === "active";
      if (data.isActive !== undefined) {
        updateData.isActive = data.isActive === true || data.isActive === "true" || data.isActive === 1 || data.isActive === "1";
      }
      if (data.restDays !== undefined) {
        updateData.restDays = typeof data.restDays === "string" ? data.restDays : JSON.stringify(data.restDays);
      }
      if (data.qrCodeSecret !== undefined || data.qrCodeData !== undefined) {
        updateData.qrCodeData = data.qrCodeData || data.qrCodeSecret;
      }
      // Additional fields that were previously missing
      if (data.serialNumber !== undefined) updateData.serialNumber = data.serialNumber;
      if (data.workStartTime !== undefined) updateData.workStartTime = data.workStartTime;
      if (data.workEndTime !== undefined) updateData.workEndTime = data.workEndTime;
      if (data.hireDate !== undefined) updateData.hireDate = data.hireDate;
      if (data.joinedAt !== undefined) updateData.hireDate = data.joinedAt;
      if (data.paymentDay !== undefined) updateData.paymentDay = Number(data.paymentDay);
      if (data.isUnrestricted !== undefined) updateData.isUnrestricted = Boolean(data.isUnrestricted);
      const [updated] = await db.update(employees).set(updateData).where(eq(employees.id, Number(id))).returning();
      if (updated) {
        const allOffices = await db.select().from(offices);
        const officeMap = new Map<number, string>(allOffices.map((o: any) => [Number(o.id), o.name] as [number, string]));
        return formatEmployee(updated, officeMap);
      }
    }
  } catch (err) {
    throw err;
  }
  return null;
}

export async function deleteEmployee(id: number, reason = "Deleted by admin") {
  try {
    const db = getDb();
    if (db) {
      const updated = await db.update(employees)
        .set({ isActive: false, deletedAt: new Date(), deletionReason: reason, updatedAt: new Date() })
        .where(eq(employees.id, Number(id)))
        .returning({ id: employees.id });
      return updated.length > 0;
    }
  } catch (err) {
    throw err;
  }
  return false;
}

let syncedOfficesOnce = false;

async function syncOfficialOfficesInDb(db: any) {
  if (syncedOfficesOnce) return;
  try {
    const existing = await db.select().from(offices);
    if (existing.length === 0) {
      await db.insert(offices).values([
        {
          name: "مكتب أم البواقي",
          address: "أم البواقي، الجزائر",
          latitude: "35.8707722",
          longitude: "7.1101606",
          qrCodeData: "DHD-OFFICE-1"
        },
        {
          name: "مكتب عين الفكرون",
          address: "عين الفكرون، أم البواقي، الجزائر",
          latitude: "35.9700208",
          longitude: "6.8771648",
          qrCodeData: "DHD-OFFICE-2"
        }
      ]);
    }
    syncedOfficesOnce = true;
  } catch (err) {
    console.warn("syncOfficialOfficesInDb error:", err);
  }
}

// Offices
export async function listOffices() {
  try {
    const db = getDb();
    const res = await db.select().from(offices).orderBy(asc(offices.id));
    return res.map(formatOffice);
  } catch (err) {
    throw err;
  }
}

export async function getOfficeById(id: number) {
  const db = getDb();
  const result = await db.select().from(offices).where(eq(offices.id, Number(id)));
  return result[0] ? formatOffice(result[0]) : null;
}

export async function getOfficeByQrSecret(secret: string) {
  const value = String(secret || "").trim();
  if (!value) return null;
  const db = getDb();
  const result = await db.select().from(offices).where(eq(offices.qrCodeData, value));
  return result[0] ? formatOffice(result[0]) : null;
}

function newQrValue(prefix: string) {
  return `${prefix}${crypto.randomBytes(24).toString("hex")}`;
}

export async function rotateEmployeeQr(id: number) {
  const db = getDb();
  const [updated] = await db.update(employees)
    .set({ qrCodeData: newQrValue("dhd-auth-"), updatedAt: new Date() })
    .where(eq(employees.id, Number(id)))
    .returning();
  if (!updated) return null;
  const allOffices = await db.select().from(offices);
  return formatEmployee(updated, new Map<number, string>(allOffices.map((o: any) => [Number(o.id), o.name] as [number, string])));
}

export async function rotateOfficeQr(id: number) {
  const db = getDb();
  const [updated] = await db.update(offices)
    .set({ qrCodeData: newQrValue("DHD-OFFICE-") })
    .where(eq(offices.id, Number(id)))
    .returning();
  return updated ? formatOffice(updated) : null;
}

export async function rotateAdminQr(id: number) {
  const db = getDb();
  const [updated] = await db.update(admins)
    .set({ qrCodeData: newQrValue("dhd-auth-") })
    .where(eq(admins.id, Number(id)))
    .returning();
  return updated || null;
}

// Update admin profile (email, password, name)
export async function updateAdmin(id: number, data: any) {
  const db = getDb();
  const updateData: any = {};
  if (data.email !== undefined) updateData.email = data.email;
  if (data.username !== undefined) updateData.username = data.username;
  if (data.passwordHash !== undefined) updateData.passwordHash = data.passwordHash;
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (Object.keys(updateData).length === 0) return await getAdminById(id);
  const [updated] = await db.update(admins).set(updateData).where(eq(admins.id, Number(id))).returning();
  return updated || null;
}

// Ensure every admin has a persistent unique serial number (generated once only)
export async function ensureAdminSerial(id: number) {
  const db = getDb();
  const admin = await getAdminById(id);
  if (!admin) return null;
  if (admin.serialNumber) return admin;
  const serial = `ADM-${String(id).padStart(4, "0")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const [updated] = await db.update(admins).set({ serialNumber: serial }).where(eq(admins.id, Number(id))).returning();
  return updated || null;
}

// Seed both official offices with real coordinates if DB has no offices
export async function seedOfficialOffices() {
  try {
    const db = getDb();
    const existing = await db.select().from(offices).orderBy(asc(offices.id));
    if (existing.length === 0) {
      await db.insert(offices).values([
        {
          name: "مكتب أم البواقي",
          address: "أم البواقي، الجزائر",
          latitude: "35.8707722",
          longitude: "7.1101606",
          qrCodeData: "DHD-OFFICE-OEB-1"
        },
        {
          name: "مكتب عين الفكرون",
          address: "عين الفكرون، أم البواقي، الجزائر",
          latitude: "35.9700208",
          longitude: "6.8771648",
          qrCodeData: "DHD-OFFICE-OEF-2"
        }
      ]);
    } else {
      // Update coordinates on existing offices to ensure they match
      for (const o of existing) {
        const isEye = (o.name || "").includes("عين") || Number(o.id) === 2;
        const lat = isEye ? "35.9700208" : "35.8707722";
        const lng = isEye ? "6.8771648" : "7.1101606";
        const qr = (o.qrCodeData && String(o.qrCodeData).length > 5) ? o.qrCodeData :
          (isEye ? "DHD-OFFICE-OEF-2" : "DHD-OFFICE-OEB-1");
        await db.update(offices).set({ latitude: lat, longitude: lng, qrCodeData: qr }).where(eq(offices.id, Number(o.id)));
      }
    }
  } catch (err) {
    console.warn("seedOfficialOffices error:", err);
  }
}

async function calculateSalaryPeriodData(salaryRecord: any, employeeRecord?: any, database?: any) {
  const salary = { ...salaryRecord };
  const emp = employeeRecord || await getEmployeeById(Number(salary.employeeId));
  if (!emp) return null;
  const db = database || getDb();

  // Keep these reads sequential: during payment they share one transaction
  // client and must represent one consistent PostgreSQL snapshot.
  let allViolations: any[] = [];
  let allAdvances: any[] = [];
  let allAttendance: any[] = [];
  let allBonuses: any[] = [];
  let allLeaves: any[] = [];
  let allVacations: any[] = [];
  let settingsRows: any[] = [];
  try {
    allViolations = await db.select().from(violations).where(eq(violations.employeeId, Number(salary.employeeId)));
  } catch {}
  try {
    allAdvances = await db.select().from(advances).where(eq(advances.employeeId, Number(salary.employeeId)));
  } catch {}
  try {
    allAttendance = await db.select().from(attendance).where(eq(attendance.employeeId, Number(salary.employeeId)));
  } catch {}
  try {
    allBonuses = await db.select().from(bonuses).where(eq(bonuses.employeeId, Number(salary.employeeId)));
  } catch {}
  try {
    allLeaves = await db.select().from(leaveRequests).where(eq(leaveRequests.employeeId, Number(salary.employeeId)));
  } catch {}
  try {
    allVacations = await db.select().from(vacationRequests).where(eq(vacationRequests.employeeId, Number(salary.employeeId)));
  } catch {}
  try {
    settingsRows = await db.select().from(settings);
  } catch {}
  const settingsRecord = settingsRows[0] || memoryStore.settings;

  const monthPrefix = `${salary.year}-${String(salary.month).padStart(2, "0")}`;
  const periodStart = `${monthPrefix}-01`;
  const periodEndDate = new Date(Date.UTC(Number(salary.year), Number(salary.month), 0));
  const periodEnd = periodEndDate.toISOString().slice(0, 10);
  const inSalaryPeriod = (dateValue: unknown) => {
    const normalized = dateValue instanceof Date ? dateValue.toISOString() : String(dateValue || "");
    return normalized.startsWith(monthPrefix);
  };
  const linkedToSalary = (record: any) =>
    salary.id != null && Number(record.salaryId) === Number(salary.id);
  const monthViolations = allViolations.filter((v: any) =>
    linkedToSalary(v) ||
    (v.salaryId == null && inSalaryPeriod(v.violationDate || v.createdAt))
  );
  const approvedAdvances = allAdvances.filter((a: any) =>
    a.status === "approved" &&
    (linkedToSalary(a) || (a.salaryId == null && inSalaryPeriod(a.requestedAt || a.createdAt)))
  );
  const monthAttendance = allAttendance.filter((a: any) => String(a.date || "").startsWith(monthPrefix));
  const monthBonuses = allBonuses.filter((b: any) =>
    (b.status === 'approved' || b.status == null) && (
      linkedToSalary(b) ||
      (b.salaryId == null && inSalaryPeriod(b.date || b.createdAt))
    )
  );
  const overlapsPeriod = (request: any) => {
    const start = String(request.startDate || "").slice(0, 10);
    const end = String(request.endDate || request.startDate || "").slice(0, 10);
    return request.status === "approved" && start <= periodEnd && end >= periodStart;
  };
  const approvedLeaves = allLeaves.filter(overlapsPeriod);
  const approvedVacations = allVacations.filter(overlapsPeriod);

  const attendancePresentDays = monthAttendance.filter((a: any) => !a.isAbsent && (a.checkInTime || a.checkOutTime)).length;
  const attendanceAbsentDays = monthAttendance.filter((a: any) => a.isAbsent).length;
  const presentDays = attendancePresentDays;
  const absentDays = attendanceAbsentDays;
  const violationTotalFromRecords = monthViolations.reduce((s: number, v: any) => s + Number(v.amount || 0), 0);
  const advanceTotalFromRecords = approvedAdvances.reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
  const bonusTotalFromRecords = monthBonuses.reduce((s: number, b: any) => s + Number(b.amount || 0), 0);
  const attendanceLateDeduction = monthAttendance.reduce((s: number, a: any) => s + Number(a.lateDeduction || 0), 0);
  const attendanceOvertimeBonus = monthAttendance.reduce((s: number, a: any) => s + Number(a.overtimeBonus || 0), 0);
  const lateMinutes = monthAttendance.reduce((s: number, a: any) => s + Number(a.lateMinutes || 0), 0);
  const lateDays = monthAttendance.filter((a: any) => Number(a.lateMinutes || 0) > 0).length;
  const workedMinutes = monthAttendance.reduce((s: number, a: any) => s + Number(a.workedMinutes || 0), 0);
  const overtimeMinutes = monthAttendance.reduce((s: number, a: any) => s + Number(a.overtimeMinutes || 0), 0);

  const numberOr = (value: unknown, fallback: number) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const isPaidSnapshot = salary.status === "paid" || salary.status === "received";
  const baseSalary = isPaidSnapshot
    ? numberOr(salary.baseSalary, numberOr(emp.baseSalary, 0))
    : numberOr(emp.baseSalary, numberOr(salary.baseSalary, 0));
  const violationTotal = isPaidSnapshot ? numberOr(salary.violationDeductions, violationTotalFromRecords) : violationTotalFromRecords;
  const advanceTotal = isPaidSnapshot ? numberOr(salary.advanceDeductions, advanceTotalFromRecords) : advanceTotalFromRecords;
  const lateDeduction = isPaidSnapshot ? numberOr(salary.lateDeductions, attendanceLateDeduction) : attendanceLateDeduction;
  const overtimeBonus = isPaidSnapshot ? numberOr(salary.overtimeBonus, attendanceOvertimeBonus) : attendanceOvertimeBonus;
  const bonusTotal = isPaidSnapshot ? numberOr(salary.bonuses, bonusTotalFromRecords) : bonusTotalFromRecords;
  const calculatedAbsenceDeduction = absentDays * Number(settingsRecord?.absenceDeductionAmount || 0);
  // The legacy schema has no dedicated absence column. Persist the frozen
  // absence amount in other_deductions, but expose it explicitly everywhere.
  const absenceDeduction = isPaidSnapshot
    ? numberOr(salary.otherDeductions, calculatedAbsenceDeduction)
    : calculatedAbsenceDeduction;
  const otherDeductions = 0;
  const totalDeductions = lateDeduction + absenceDeduction + advanceTotal + violationTotal + otherDeductions;
  const computedFinalSalary = baseSalary + overtimeBonus + bonusTotal - totalDeductions;
  const finalSalary = isPaidSnapshot ? numberOr(salary.finalSalary, computedFinalSalary) : computedFinalSalary;
  const calculatedSalary = {
    ...salary,
    baseSalary: String(baseSalary),
    presentDays,
    absentDays,
    workedHours: String(workedMinutes / 60),
    overtimeHours: String(overtimeMinutes / 60),
    overtimeBonus: String(overtimeBonus),
    lateDeductions: String(lateDeduction),
    absenceDeductions: String(absenceDeduction),
    advanceDeductions: String(advanceTotal),
    violationDeductions: String(violationTotal),
    bonuses: String(bonusTotal),
    otherDeductions: String(absenceDeduction + otherDeductions),
    totalDeductions: String(totalDeductions),
    finalSalary: String(finalSalary),
  };

  return {
    salary: calculatedSalary,
    employee: emp,
    violations: monthViolations,
    advances: approvedAdvances,
    attendance: monthAttendance,
    bonuses: monthBonuses,
    leaveRequests: approvedLeaves,
    vacationRequests: approvedVacations,
    companyName: settingsRecord?.companyName || "DHD Livraison",
    summary: {
      presentDays,
      absentDays,
      workDays: presentDays + absentDays,
      lateDays,
      lateMinutes,
      workedHours: workedMinutes / 60,
      overtimeHours: overtimeMinutes / 60,
      violationTotal,
      advanceTotal,
      lateDeduction,
      absenceDeduction,
      overtimeBonus,
      bonusTotal,
      otherDeductions,
      totalDeductions,
      grossSalary: baseSalary + overtimeBonus + bonusTotal,
      baseSalary,
      finalSalary,
      isPaid: isPaidSnapshot,
      calculatedAt: new Date().toISOString(),
    }
  };
}

// Get full salary data for a persisted PDF payslip.
export async function getSalaryPdfData(salaryId: number) {
  const salary = await getSalaryById(salaryId);
  if (!salary) return null;
  if ((salary.status === "paid" || salary.status === "received") && salary.snapshot) {
    try {
      return JSON.parse(String(salary.snapshot));
    } catch {
      // Legacy paid rows without a valid snapshot still use their frozen totals.
    }
  }
  return calculateSalaryPeriodData(salary);
}

// Build the same complete payslip from PostgreSQL without creating or paying a
// salary record. If an open record exists, live data overrides its old totals.
export async function getSalaryPreviewData(employeeId: number, month: string, year: number) {
  const emp = await getEmployeeById(employeeId);
  if (!emp) return null;
  const normalizedMonth = String(month).padStart(2, "0");
  const db = getDb();
  const rows = await db.select().from(salaries).where(and(
    eq(salaries.employeeId, employeeId),
    eq(salaries.year, year),
  ));
  const existing = rows
    .filter((record: any) => String(record.month).padStart(2, "0") === normalizedMonth)
    .sort((a: any, b: any) => Number(b.id) - Number(a.id))[0];
  if (existing?.status === "paid" || existing?.status === "received") {
    return getSalaryPdfData(Number(existing.id));
  }
  const salary = existing || {
    id: null,
    employeeId,
    month: normalizedMonth,
    year,
    baseSalary: emp.baseSalary,
    status: "pending",
    paidAt: null,
    createdAt: null,
  };
  return calculateSalaryPeriodData(salary, emp);
}

async function refreshOpenSalaryCalculations(employeeId: number) {
  const db = getDb();
  const records = await db.select().from(salaries).where(eq(salaries.employeeId, Number(employeeId)));
  for (const record of records) {
    if (record.status === "paid" || record.status === "received") continue;
    await db.update(salaries).set({
      finalSalary: null,
      violationDeductions: null,
      advanceDeductions: null,
      lateDeductions: null,
      overtimeBonus: null,
      bonuses: null,
      otherDeductions: null,
    }).where(eq(salaries.id, Number(record.id)));
    const calculation = await getSalaryPdfData(Number(record.id));
    const summary = calculation?.summary;
    if (!summary) continue;
    await db.update(salaries).set({
      presentDays: Number(summary.presentDays || 0),
      absentDays: Number(summary.absentDays || 0),
      workedHours: String(Number(summary.workedHours || 0)),
      overtimeHours: String(Number(summary.overtimeHours || 0)),
      overtimeBonus: String(Number(summary.overtimeBonus || 0)),
      lateDeductions: String(Number(summary.lateDeduction || 0)),
      advanceDeductions: String(Number(summary.advanceTotal || 0)),
      violationDeductions: String(Number(summary.violationTotal || 0)),
      bonuses: String(Number(summary.bonusTotal || 0)),
      otherDeductions: String(Number(summary.absenceDeduction || 0) + Number(summary.otherDeductions || 0)),
      finalSalary: String(Number(summary.finalSalary || 0)),
    }).where(eq(salaries.id, Number(record.id)));
  }
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
          qrCodeData: `DHD-OFFICE-${crypto.randomBytes(24).toString("base64url")}`
        })
        .returning();
      if (newOffice) {
        return formatOffice(newOffice);
      }
    }
  } catch (err) {
    throw err;
  }
  return null;
}

// Attendance
export async function listAttendance(employeeId?: number, dateFilter?: string) {
  try {
    const db = getDb();
    // The admin date view persists missing workday records as absences.
    if (!employeeId && dateFilter) {
      await syncDailyAbsences(db, dateFilter);
      const rows = await db
        .select({ employee: employees, attendance: attendance, office: offices })
        .from(employees)
        .leftJoin(attendance, and(
          eq(attendance.employeeId, employees.id),
          eq(attendance.date, dateFilter),
        ))
        .leftJoin(offices, eq(offices.id, employees.officeId))
        .where(eq(employees.isActive, true))
        .orderBy(asc(employees.id));

      return rows.map((row: any) => formatAttendanceRecord(row.attendance, row.employee, row.office, dateFilter));
    }

    const rows = await db
      .select({ attendance: attendance, employee: employees, office: offices })
      .from(attendance)
      .leftJoin(employees, eq(employees.id, attendance.employeeId))
      .leftJoin(offices, eq(offices.id, attendance.officeId))
      .where(employeeId ? eq(attendance.employeeId, Number(employeeId)) : undefined)
      .orderBy(desc(attendance.date), desc(attendance.id));

    return rows.map((row: any) => formatAttendanceRecord(row.attendance, row.employee, row.office));
  } catch (err) {
    throw err;
  }
}

export async function recordAttendance(data: any) {
  const emp = await getEmployeeById(Number(data.employeeId));
  const dateStr = data.date || new Date().toISOString().split("T")[0];
  const checkInTimeStr = data.checkInTime || new Date().toTimeString().split(" ")[0];

  try {
    const db = getDb();
    if (db) {
      const settingsRecord = await getSettings();
      const metrics = attendanceMetrics({ checkInTime: checkInTimeStr, isAbsent: data.status === "absent" }, emp);
      const lateDeduction = metrics.lateMinutes > 0 ? Number(settingsRecord?.lateDeductionAmount || 0) : 0;
      const [record] = await db
        .insert(attendance)
        .values({
          employeeId: Number(data.employeeId),
          officeId: Number(data.officeId || emp?.officeId || 1),
          date: dateStr,
          checkInTime: checkInTimeStr,
          lateMinutes: metrics.lateMinutes,
          lateDeduction: String(lateDeduction),
          isAbsent: data.status === "absent",
          checkInLat: data.latitude ? String(data.latitude) : null,
          checkInLng: data.longitude ? String(data.longitude) : null,
          notes: data.notes || null
        })
        .onConflictDoNothing({ target: [attendance.employeeId, attendance.date] })
        .returning();
      if (record) {
        await refreshOpenSalaryCalculations(Number(data.employeeId));
        return formatAttendanceRecord(record, emp);
      }
      const [existing] = await db.select().from(attendance).where(and(
        eq(attendance.employeeId, Number(data.employeeId)),
        eq(attendance.date, dateStr),
      )).limit(1);
      if (existing) return formatAttendanceRecord(existing, emp);
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

export async function completeAttendance(id: number, data: any) {
  const db = getDb();
  const current = await db
    .select({ attendance: attendance, employee: employees, office: offices })
    .from(attendance)
    .leftJoin(employees, eq(employees.id, attendance.employeeId))
    .leftJoin(offices, eq(offices.id, attendance.officeId))
    .where(eq(attendance.id, Number(id)))
    .limit(1);
  const existing = current[0];
  if (!existing?.attendance) return null;
  const metrics = attendanceMetrics({
    ...existing.attendance,
    checkOutTime: data.checkOutTime,
  }, existing.employee);
  const settingsRecord = await getSettings();
  const overtimeRate = Number(settingsRecord?.overtimeHourlyRate || 0);
  const [updated] = await db.update(attendance)
    .set({
      checkOutTime: data.checkOutTime,
      workedMinutes: metrics.workedMinutes,
      lateMinutes: metrics.lateMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      overtimeBonus: String((metrics.overtimeMinutes / 60) * overtimeRate),
      lateDeduction: String(metrics.lateMinutes > 0 ? Number(settingsRecord?.lateDeductionAmount || 0) : 0),
      checkOutLat: data.latitude == null ? null : String(data.latitude),
      checkOutLng: data.longitude == null ? null : String(data.longitude)
    })
    .where(eq(attendance.id, Number(id)))
    .returning();
  if (updated) await refreshOpenSalaryCalculations(Number(updated.employeeId));
  return updated ? formatAttendanceRecord(updated, existing.employee, existing.office) : null;
}

// Advances
export async function listAdvances(employeeId?: number) {
  try {
    const db = getDb();
    if (db) {
      const rows = await db
        .select({ request: advances, employee: employees, office: offices })
        .from(advances)
        .leftJoin(employees, eq(employees.id, advances.employeeId))
        .leftJoin(offices, eq(offices.id, employees.officeId))
        .where(employeeId ? eq(advances.employeeId, Number(employeeId)) : undefined)
        .orderBy(desc(advances.requestedAt), desc(advances.id));
      return rows.map((row: any) => formatRequestRecord(row.request, row.employee, row.office));
    }
  } catch (err) {
    throw err;
  }
  return [];
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
          status: "pending",
          requestedAt: new Date(),
        })
        .returning();
      if (record) {
        const fullRecord = {
          ...record,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف"
        };
        await createNotificationRecord({
          type: "advance_request",
          message: `طلب سلفة جديد من ${fullRecord.employeeName}`,
          recipientType: "admin",
          referenceId: Number(record.id),
          referenceIdType: "advance",
        });
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

export async function updateAdvanceStatus(id: number, status: string, details: { reason?: string; adminNote?: string } = {}) {
  try {
    const db = getDb();
    if (!db) throw new Error("Database is not available");
    const [updated] = await db
      .update(advances)
      .set({
        status,
        resolvedAt: new Date(),
        ...(status === "rejected" && details.reason !== undefined ? { rejectionReason: details.reason } : {}),
        ...(status === "approved" && details.adminNote !== undefined ? { adminNote: details.adminNote } : {}),
      })
      .where(eq(advances.id, Number(id)))
      .returning();
    if (updated) {
      await refreshOpenSalaryCalculations(Number(updated.employeeId));
      await createNotificationRecord({
        type: status === "approved" ? "advance_approved" : "advance_rejected",
        message: status === "approved" ? "تمت الموافقة على طلب السلفة" : "تم رفض طلب السلفة",
        recipientType: "employee",
        recipientEmployeeId: Number(updated.employeeId),
        referenceId: Number(updated.id),
        referenceIdType: "advance",
      });
      return updated;
    }
  } catch (err) {
    console.error("DB updateAdvanceStatus failed:", err);
    throw err;
  }
  return null;
}

// Leave Requests
export async function listLeaveRequests(employeeId?: number) {
  try {
    const db = getDb();
    if (db) {
      const rows = await db
        .select({ request: leaveRequests, employee: employees, office: offices })
        .from(leaveRequests)
        .leftJoin(employees, eq(employees.id, leaveRequests.employeeId))
        .leftJoin(offices, eq(offices.id, employees.officeId))
        .where(employeeId ? eq(leaveRequests.employeeId, Number(employeeId)) : undefined)
        .orderBy(desc(leaveRequests.requestedAt), desc(leaveRequests.id));
      return rows.map((row: any) => formatRequestRecord(row.request, row.employee, row.office));
    }
  } catch (err) {
    throw err;
  }
  return [];
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
          status: "pending",
          requestedAt: new Date(),
        })
        .returning();
      if (record) {
        const fullRecord = {
          ...record,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف"
        };
        await createNotificationRecord({
          type: "leave_request",
          message: `طلب غياب جديد من ${fullRecord.employeeName}`,
          recipientType: "admin",
          referenceId: Number(record.id),
          referenceIdType: "leave",
        });
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

export async function updateLeaveRequestStatus(id: number, status: string, details: { reason?: string; adminNote?: string } = {}) {
  try {
    const db = getDb();
    if (!db) throw new Error("Database is not available");
    const [updated] = await db
      .update(leaveRequests)
      .set({
        status,
        resolvedAt: new Date(),
        ...(status === "rejected" && details.reason !== undefined ? { rejectionReason: details.reason } : {}),
        ...(status === "approved" && details.adminNote !== undefined ? { adminNote: details.adminNote } : {}),
      })
      .where(eq(leaveRequests.id, Number(id)))
      .returning();
    if (updated) {
      await createNotificationRecord({
        type: status === "approved" ? "leave_approved" : "leave_rejected",
        message: status === "approved" ? "تمت الموافقة على طلب الغياب" : "تم رفض طلب الغياب",
        recipientType: "employee",
        recipientEmployeeId: Number(updated.employeeId),
        referenceId: Number(updated.id),
        referenceIdType: "leave",
      });
      return updated;
    }
  } catch (err) {
    console.error("DB updateLeaveRequestStatus failed:", err);
    throw err;
  }
  return null;
}

// Vacation Requests
export async function listVacationRequests(employeeId?: number) {
  try {
    const db = getDb();
    if (db) {
      const rows = await db
        .select({ request: vacationRequests, employee: employees, office: offices })
        .from(vacationRequests)
        .leftJoin(employees, eq(employees.id, vacationRequests.employeeId))
        .leftJoin(offices, eq(offices.id, employees.officeId))
        .where(employeeId ? eq(vacationRequests.employeeId, Number(employeeId)) : undefined)
        .orderBy(desc(vacationRequests.requestedAt), desc(vacationRequests.id));
      return rows.map((row: any) => formatRequestRecord(row.request, row.employee, row.office));
    }
  } catch (err) {
    throw err;
  }
  return [];
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
          status: "pending",
          requestedAt: new Date(),
        })
        .returning();
      if (record) {
        const fullRecord = {
          ...record,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "الموظف"
        };
        await createNotificationRecord({
          type: "vacation_request",
          message: `طلب عطلة جديد من ${fullRecord.employeeName}`,
          recipientType: "admin",
          referenceId: Number(record.id),
          referenceIdType: "vacation",
        });
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

export async function updateVacationRequestStatus(id: number, status: string, details: { reason?: string; adminNote?: string } = {}) {
  try {
    const db = getDb();
    if (!db) throw new Error("Database is not available");
    const [updated] = await db
      .update(vacationRequests)
      .set({
        status,
        resolvedAt: new Date(),
        ...(status === "rejected" && details.reason !== undefined ? { rejectionReason: details.reason } : {}),
        ...(status === "approved" && details.adminNote !== undefined ? { adminNote: details.adminNote } : {}),
      })
      .where(eq(vacationRequests.id, Number(id)))
      .returning();
    if (updated) {
      await createNotificationRecord({
        type: status === "approved" ? "vacation_approved" : "vacation_rejected",
        message: status === "approved" ? "تمت الموافقة على طلب العطلة" : "تم رفض طلب العطلة",
        recipientType: "employee",
        recipientEmployeeId: Number(updated.employeeId),
        referenceId: Number(updated.id),
        referenceIdType: "vacation",
      });
      return updated;
    }
  } catch (err) {
    console.error("DB updateVacationRequestStatus failed:", err);
    throw err;
  }
  return null;
}

// Bonuses
export async function listBonuses(employeeId?: number) {
  try {
    const db = getDb();
    if (db) {
      const rows = await db
        .select({ bonus: bonuses, employee: employees, office: offices })
        .from(bonuses)
        .leftJoin(employees, eq(employees.id, bonuses.employeeId))
        .leftJoin(offices, eq(offices.id, employees.officeId))
        .where(employeeId ? eq(bonuses.employeeId, Number(employeeId)) : undefined)
        .orderBy(desc(bonuses.createdAt), desc(bonuses.id));

      return rows.map((row: any) => ({
        ...row.bonus,
        id: Number(row.bonus.id),
        employeeId: Number(row.bonus.employeeId),
        amount: row.bonus.amount == null ? 0 : Number(row.bonus.amount),
        employeeName: employeeName(row.employee) || row.bonus.employeeName || "—",
        officeName: row.office?.name || null,
      }));
    }
  } catch (err) {
    throw err;
  }
  return [];
}

export async function createBonus(data: any) {
  const employeeId = Number(data.employeeId);
  const amount = Number(data.amount ?? 0);

  const db = getDb();
  const [record] = await db
    .insert(bonuses)
    .values({
      employeeId,
      amount: String(amount),
      reason: data.reason || data.notes || "",
      notes: data.notes || null,
      date: data.date || new Date().toISOString().split("T")[0],
      salaryId: data.salaryId ? Number(data.salaryId) : null,
      status: "approved",
      createdAt: new Date(),
    })
    .returning();
  if (!record) throw new Error("تعذر إضافة الزيادة");
  await refreshOpenSalaryCalculations(employeeId);
  const employee = await getEmployeeById(employeeId);
  return {
    ...record,
    id: Number(record.id),
    employeeId,
    amount,
    employeeName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : "—",
  };
}

export async function deleteBonus(id: number) {
  try {
    const db = getDb();
    if (db) {
      const [deleted] = await db.delete(bonuses).where(eq(bonuses.id, Number(id))).returning();
      if (deleted) await refreshOpenSalaryCalculations(Number(deleted.employeeId));
      return deleted || null;
    }
  } catch (err) {
    throw err;
  }
  return null;
}

export async function updateBonus(id: number, data: any) {
  try {
    const db = getDb();
    if (db) {
      const update: any = {};
      if (data.amount !== undefined) update.amount = String(Number(data.amount));
      if (data.reason !== undefined) update.reason = data.reason;
      if (data.notes !== undefined) update.notes = data.notes;
      if (data.date !== undefined) update.date = data.date;
      if (data.status !== undefined) update.status = data.status;
      const [updated] = await db.update(bonuses).set(update).where(eq(bonuses.id, Number(id))).returning();
      if (updated) await refreshOpenSalaryCalculations(Number(updated.employeeId));
      return updated || null;
    }
  } catch (err) {
    throw err;
  }
  return null;
}

// Violations
export async function listViolations(employeeId?: number) {
  try {
    const db = getDb();
    if (db) {
      const rows = await db
        .select({ violation: violations, employee: employees, office: offices })
        .from(violations)
        .leftJoin(employees, eq(employees.id, violations.employeeId))
        .leftJoin(offices, eq(offices.id, employees.officeId))
        .where(employeeId ? eq(violations.employeeId, Number(employeeId)) : undefined)
        .orderBy(desc(violations.violationDate), desc(violations.createdAt), desc(violations.id));

      return rows.map((row: any) => {
        const amount = row.violation?.amount == null ? null : Number(row.violation.amount);
        return {
          ...formatRequestRecord(row.violation, row.employee, row.office),
          amount,
          // A violation is never pending. Keep the existing "deducted" label
          // for the imported UI while preserving open/no-amount records.
          status: amount != null && amount > 0 ? "deducted" : "applied",
        };
      });
    }
  } catch (err) {
    throw err;
  }
  return [];
}

export async function createViolation(data: any) {
  const employeeId = Number(data.employeeId);
  const vDate = data.date || new Date().toISOString().split("T")[0];
  const amount = Number(data.deductionAmount ?? data.amount ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("مبلغ الخصم غير صالح");
  }

  const db = getDb();
  const result = await db.transaction(async (tx: any) => {
    const [record] = await tx
      .insert(violations)
      .values({
        employeeId,
        violationType: data.violationType || data.type || "manual",
        amount: String(amount),
        reason: data.reason || "",
        notes: data.notes || null,
        violationDate: vDate,
        violationTime: data.violationTime || data.time || null,
        // The old pending state is intentionally not used.
        status: amount > 0 ? "deducted" : "applied",
      })
      .returning();

    if (!record) throw new Error("تعذر تسجيل المخالفة");

    let salaryId: number | null = null;
    let deductionApplied = false;
    if (amount > 0) {
      const now = new Date();
      const salaryRows = await tx
        .select()
        .from(salaries)
        .where(and(eq(salaries.employeeId, employeeId), eq(salaries.year, now.getFullYear())));
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const salary = salaryRows
        .filter((row: any) => String(row.month).padStart(2, "0") === month && row.status !== "paid")
        .sort((a: any, b: any) => Number(b.id) - Number(a.id))[0];

      if (salary) {
        const previousDeductions = Number(salary.violationDeductions || 0);
        const currentFinalSalary = Number(salary.finalSalary ?? salary.baseSalary ?? 0);
        await tx.update(salaries)
          .set({
            violationDeductions: String(previousDeductions + amount),
            finalSalary: String(currentFinalSalary - amount),
          })
          .where(eq(salaries.id, salary.id));
        salaryId = Number(salary.id);
        deductionApplied = true;
        await tx.update(violations).set({ salaryId }).where(eq(violations.id, record.id));
      }
    }

        const [adminNotification] = await tx.insert(notifications).values({
      type: "violation_deduction",
      message: amount > 0
        ? `تم تسجيل مخالفة وخصم ${amount.toLocaleString("en-US")} DZD من رصيد الموظف #${employeeId}`
        : `تم تسجيل مخالفة للموظف #${employeeId} بدون مبلغ خصم`,
      recipientType: "admin",
      recipientEmployeeId: null,
      referenceId: record.id,
      referenceIdType: "violation",
      isRead: false,
      createdAt: new Date(),
        }).returning();

    return {
      record: { ...record, salaryId, status: amount > 0 ? "deducted" : "applied" },
      deductionApplied,
      notification: adminNotification || null,
    };
  });

  const employee = await getEmployeeById(employeeId);
  const officeRows = employee?.officeId
    ? await db.select().from(offices).where(eq(offices.id, Number(employee.officeId)))
    : [];
  const office = officeRows[0] || null;
  const formatted = {
    ...formatRequestRecord(result.record, employee, office),
    amount,
    deductionApplied: result.deductionApplied,
    success: true,
    message: amount > 0 ? "تم تسجيل المخالفة وتطبيق الخصم مباشرة" : "تم تسجيل المخالفة",
  };
  publishNotification(result.notification);
  await refreshOpenSalaryCalculations(employeeId);
  await createNotificationRecord({
    type: "violation_deduction",
    message: amount > 0
      ? `تم تسجيل مخالفة وخصم ${amount.toLocaleString("en-US")} DZD من راتبك`
      : "تم تسجيل مخالفة في حسابك",
    recipientType: "employee",
    recipientEmployeeId: employeeId,
    referenceId: Number(result.record.id),
    referenceIdType: "violation",
  });
  return formatted;
}

// Salaries
export async function listSalaries(employeeId?: number) {
  const normalizeSalary = (salary: any) => ({
    ...salary,
    baseSalary: Number(salary?.baseSalary || 0),
    overtimeBonus: Number(salary?.overtimeBonus || 0),
    lateDeductions: Number(salary?.lateDeductions || 0),
    advanceDeductions: Number(salary?.advanceDeductions || 0),
    violationDeductions: Number(salary?.violationDeductions || 0),
    bonuses: Number(salary?.bonuses || 0),
    finalSalary: Number(salary?.finalSalary || salary?.netSalary || 0),
  });

  try {
    const db = getDb();
    if (db) {
      const all = await db.select().from(salaries);
      let list = all;
      if (employeeId) {
        list = list.filter((s: any) => Number(s.employeeId) === Number(employeeId));
      }
      return list.map(normalizeSalary);
    }
  } catch (err) {
    console.warn("DB listSalaries failed, using fallback:", err);
  }

  let list = memoryStore.salaries;
  if (employeeId) {
    list = list.filter((s) => Number(s.employeeId) === Number(employeeId));
  }
  return list.map(normalizeSalary);
}

// Notifications
export async function listNotifications(recipientType = "admin", recipientId?: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not available");
  const all = await db.select().from(notifications).where(eq(notifications.recipientType, recipientType));
  let list = all;
  if (recipientId) {
    list = list.filter((n: any) => Number(n.recipientEmployeeId) === Number(recipientId));
  }
  return list.map((notification: any) => ({ ...notification, isRead: Boolean(notification.isRead) })).sort((a: any, b: any) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime || Number(b.id) - Number(a.id);
  });
}

export async function markNotificationsRead(recipientType = "admin", recipientId?: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not available");
  const scope = recipientId
    ? and(
      eq(notifications.recipientType, recipientType),
      eq(notifications.recipientEmployeeId, Number(recipientId)),
    )
    : eq(notifications.recipientType, recipientType);
  await db.update(notifications).set({ isRead: true }).where(scope);
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

// Office CRUD additions
export async function updateOffice(id: number, data: any) {
  const db = getDb();
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.latitude !== undefined) updateData.latitude = String(data.latitude);
  if (data.longitude !== undefined) updateData.longitude = String(data.longitude);
  if (data.qrCodeData !== undefined) updateData.qrCodeData = data.qrCodeData;
  const [updated] = await db.update(offices).set(updateData).where(eq(offices.id, Number(id))).returning();
  return updated ? formatOffice(updated) : null;
}

export async function deleteOffice(id: number) {
  const db = getDb();
  await db.delete(offices).where(eq(offices.id, Number(id)));
  return true;
}

// Former employees
export async function listFormerEmployees() {
  const db = getDb();
  const allEmps = await db.select().from(employees);
  const allOffices = await db.select().from(offices);
  const officeMap = new Map<number, string>(allOffices.map((o: any) => [Number(o.id), o.name] as [number, string]));
  return allEmps
    .filter((e: any) => e.deletedAt != null || e.isActive === false)
    .map((e: any) => formatEmployee(e, officeMap));
}

export async function restoreEmployee(id: number) {
  const db = getDb();
  const [updated] = await db
    .update(employees)
    .set({ isActive: true, deletedAt: null, deletionReason: null, updatedAt: new Date() })
    .where(eq(employees.id, Number(id)))
    .returning();
  if (!updated) return null;
  const allOffices = await db.select().from(offices);
  return formatEmployee(updated, new Map<number, string>(allOffices.map((o: any) => [Number(o.id), o.name] as [number, string])));
}

export async function permanentlyDeleteEmployee(id: number) {
  const db = getDb();
  const employeeId = Number(id);
  const deleted = await db.transaction(async (tx: any) => {
    await tx.delete(attendance).where(eq(attendance.employeeId, employeeId));
    await tx.delete(advances).where(eq(advances.employeeId, employeeId));
    await tx.delete(bonuses).where(eq(bonuses.employeeId, employeeId));
    await tx.delete(violations).where(eq(violations.employeeId, employeeId));
    await tx.delete(salaries).where(eq(salaries.employeeId, employeeId));
    await tx.delete(leaveRequests).where(eq(leaveRequests.employeeId, employeeId));
    await tx.delete(vacationRequests).where(eq(vacationRequests.employeeId, employeeId));
    await tx.delete(notifications).where(eq(notifications.recipientEmployeeId, employeeId));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.employeeId, employeeId));
    return tx.delete(employees).where(eq(employees.id, employeeId)).returning({ id: employees.id });
  });
  return deleted.length > 0;
}

// Attendance CRUD
export async function getAttendanceById(id: number) {
  const db = getDb();
  const res = await db.select().from(attendance).where(eq(attendance.id, Number(id)));
  return res[0] || null;
}

export async function updateAttendance(id: number, data: any) {
  const db = getDb();
  const current = await db
    .select({ attendance: attendance, employee: employees, office: offices })
    .from(attendance)
    .leftJoin(employees, eq(employees.id, attendance.employeeId))
    .leftJoin(offices, eq(offices.id, attendance.officeId))
    .where(eq(attendance.id, Number(id)))
    .limit(1);
  const existing = current[0];
  if (!existing?.attendance) return null;

  const nextRecord = { ...existing.attendance, ...data };
  const metrics = attendanceMetrics(nextRecord, existing.employee);
  const settingsRecord = await getSettings();
  const overtimeRate = Number(settingsRecord?.overtimeHourlyRate || 0);
  const updateData: any = {
    workedMinutes: metrics.workedMinutes,
    lateMinutes: metrics.lateMinutes,
    overtimeMinutes: metrics.overtimeMinutes,
    overtimeBonus: String((metrics.overtimeMinutes / 60) * overtimeRate),
    lateDeduction: String(metrics.lateMinutes > 0 ? Number(settingsRecord?.lateDeductionAmount || 0) : 0),
  };
  if (data.checkInTime !== undefined) updateData.checkInTime = data.checkInTime;
  if (data.checkOutTime !== undefined) updateData.checkOutTime = data.checkOutTime;
  if (data.isAbsent !== undefined) updateData.isAbsent = data.isAbsent;
  if (data.notes !== undefined) updateData.notes = data.notes;
  const [updated] = await db.update(attendance).set(updateData).where(eq(attendance.id, Number(id))).returning();
  if (updated) await refreshOpenSalaryCalculations(Number(updated.employeeId));
  return updated ? formatAttendanceRecord(updated, existing.employee, existing.office) : null;
}

export async function deleteAttendance(id: number) {
  const db = getDb();
  const current = await getAttendanceById(id);
  const deleted = await db.delete(attendance).where(eq(attendance.id, Number(id))).returning({ id: attendance.id });
  if (deleted.length && current) await refreshOpenSalaryCalculations(Number(current.employeeId));
  return deleted.length > 0;
}

// Violations CRUD
export async function getViolationById(id: number) {
  const db = getDb();
  const res = await db.select().from(violations).where(eq(violations.id, Number(id)));
  return res[0] || null;
}

export async function updateViolation(id: number, data: any) {
  const db = getDb();
  const current = await db.select().from(violations).where(eq(violations.id, Number(id))).limit(1);
  if (!current[0]) return null;
  if (current[0].salaryId) {
    const [linkedSalary] = await db.select().from(salaries).where(eq(salaries.id, Number(current[0].salaryId))).limit(1);
    if (linkedSalary?.status === "paid" || linkedSalary?.status === "received") {
      throw new Error("لا يمكن تعديل مخالفة مرتبطة براتب مدفوع");
    }
  }
  const oldAmount = Number(current[0].amount || 0);
  const nextAmount = data.amount !== undefined || data.deductionAmount !== undefined
    ? Number(data.amount ?? data.deductionAmount ?? 0)
    : oldAmount;
  if (!Number.isFinite(nextAmount) || nextAmount < 0) throw new Error("مبلغ الخصم غير صالح");

  const updateData: any = {
    updatedAt: new Date(),
    // Pending is not a valid violation state anymore.
    status: nextAmount > 0 ? "deducted" : "applied",
  };
  if (data.reason !== undefined) updateData.reason = data.reason;
  if (data.type !== undefined || data.violationType !== undefined) updateData.violationType = data.violationType || data.type;
  if (data.amount !== undefined || data.deductionAmount !== undefined) updateData.amount = String(nextAmount);
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.violationDate !== undefined || data.date !== undefined) updateData.violationDate = data.violationDate || data.date || null;
  if (data.violationTime !== undefined || data.time !== undefined) updateData.violationTime = data.violationTime || data.time || null;

  const [updated] = await db.transaction(async (tx: any) => {
    const delta = nextAmount - oldAmount;
    if (delta !== 0 && current[0].salaryId) {
      const salaryRows = await tx.select().from(salaries).where(eq(salaries.id, Number(current[0].salaryId))).limit(1);
      const salary = salaryRows[0];
      if (salary) {
        await tx.update(salaries).set({
          violationDeductions: String(Number(salary.violationDeductions || 0) + delta),
          finalSalary: String(Number(salary.finalSalary ?? salary.baseSalary ?? 0) - delta),
        }).where(eq(salaries.id, salary.id));
      }
    }
    return tx.update(violations).set(updateData).where(eq(violations.id, Number(id))).returning();
  });
  if (updated) await refreshOpenSalaryCalculations(Number(updated.employeeId));
  return updated || null;
}

export async function deleteViolation(id: number) {
  const db = getDb();
  const current = await getViolationById(id);
  if (current?.salaryId) {
    const [linkedSalary] = await db.select().from(salaries).where(eq(salaries.id, Number(current.salaryId))).limit(1);
    if (linkedSalary?.status === "paid" || linkedSalary?.status === "received") {
      throw new Error("لا يمكن حذف مخالفة مرتبطة براتب مدفوع");
    }
  }
  const deleted = await db.delete(violations).where(eq(violations.id, Number(id))).returning({ id: violations.id });
  if (deleted.length && current) await refreshOpenSalaryCalculations(Number(current.employeeId));
  return deleted.length > 0;
}

// Salaries
export async function getSalaryById(id: number) {
  const db = getDb();
  const res = await db.select().from(salaries).where(eq(salaries.id, Number(id)));
  return res[0] || null;
}

export async function createSalary(data: any) {
  const db = getDb();
  const emp = await getEmployeeById(Number(data.employeeId));
  if (!emp) throw new Error("الموظف غير موجود");
  const values: any = {
    employeeId: Number(data.employeeId),
    month: data.month || String(new Date().getMonth() + 1).padStart(2, '0'),
    year: data.year ? Number(data.year) : new Date().getFullYear(),
    baseSalary: String(data.baseSalary || emp?.baseSalary || 0),
    status: 'pending'
  };
  if (data.presentDays != null) values.presentDays = Number(data.presentDays);
  if (data.absentDays != null) values.absentDays = Number(data.absentDays);
  const [record] = await db.insert(salaries).values(values).returning();
  if (!record) return null;
  const calculation = await getSalaryPdfData(Number(record.id));
  const summary = calculation?.summary;
  if (!summary) return { ...record, employeeName: `${emp.firstName} ${emp.lastName}` };
  const [updated] = await db.update(salaries).set({
    presentDays: Number(summary.presentDays || 0),
    absentDays: Number(summary.absentDays || 0),
    workedHours: String(Number(summary.workedHours || 0)),
    overtimeHours: String(Number(summary.overtimeHours || 0)),
    overtimeBonus: String(Number(summary.overtimeBonus || 0)),
    lateDeductions: String(Number(summary.lateDeduction || 0)),
    advanceDeductions: String(Number(summary.advanceTotal || 0)),
    violationDeductions: String(Number(summary.violationTotal || 0)),
    bonuses: String(Number(summary.bonusTotal || 0)),
    otherDeductions: String(Number(summary.absenceDeduction || 0) + Number(summary.otherDeductions || 0)),
    finalSalary: String(Number(summary.finalSalary || 0)),
  }).where(eq(salaries.id, Number(record.id))).returning();
  return updated ? { ...updated, employeeName: `${emp.firstName} ${emp.lastName}` } : null;
}

export async function updateSalaryStatus(id: number, status: string, extra?: any) {
  const db = getDb();
  let [before] = await db.select().from(salaries).where(eq(salaries.id, Number(id)));
  if (!before) return null;
  if (before.status === "paid" || before.status === "received") return before;
  if (status === "paid") {
    const finalizePayment = () => db.transaction(async (tx: any) => {
      const [locked] = await tx.select().from(salaries)
        .where(eq(salaries.id, Number(id))).for("update").limit(1);
      if (!locked) return { paid: null, transitioned: false, notification: null };
      if (locked.status === "paid" || locked.status === "received") {
        return { paid: locked, transitioned: false, notification: null };
      }
      const [employee] = await tx.select().from(employees)
        .where(eq(employees.id, Number(locked.employeeId))).limit(1);
      const frozen = await calculateSalaryPeriodData(locked, employee, tx);
      if (!frozen) return { paid: null, transitioned: false, notification: null };
      const summary = frozen.summary;
      const paidAt = new Date();
      const frozenSalary = { ...frozen.salary, status: "paid", paidAt };
      const snapshot = { ...frozen, salary: frozenSalary, summary: { ...summary, isPaid: true } };
      const [paid] = await tx.update(salaries).set({
        baseSalary: String(summary.baseSalary || 0),
        presentDays: Number(summary.presentDays || 0),
        absentDays: Number(summary.absentDays || 0),
        workedHours: String(Number(summary.workedHours || 0)),
        overtimeHours: String(Number(summary.overtimeHours || 0)),
        overtimeBonus: String(Number(summary.overtimeBonus || 0)),
        lateDeductions: String(Number(summary.lateDeduction || 0)),
        advanceDeductions: String(Number(summary.advanceTotal || 0)),
        violationDeductions: String(Number(summary.violationTotal || 0)),
        bonuses: String(Number(summary.bonusTotal || 0)),
        otherDeductions: String(Number(summary.absenceDeduction || 0) + Number(summary.otherDeductions || 0)),
        finalSalary: String(Number(summary.finalSalary || 0)),
        status: "paid",
        paidAt,
        snapshot: JSON.stringify(snapshot),
      }).where(and(eq(salaries.id, Number(id)), ne(salaries.status, "paid"))).returning();
      let paymentNotification = null;
      if (paid) {
        [paymentNotification] = await tx.insert(notifications).values({
          type: "salary_paid",
          message: "تم صرف راتبك وإصدار كشف الراتب",
          recipientType: "employee",
          recipientEmployeeId: Number(paid.employeeId),
          referenceId: Number(paid.id),
          referenceIdType: "salary",
          isRead: false,
          createdAt: new Date(),
        }).returning();
      }
      return { paid: paid || locked, transitioned: Boolean(paid), notification: paymentNotification };
    }, { isolationLevel: "serializable" });
    let result: { paid: any; transitioned: boolean; notification: any } | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await finalizePayment();
        break;
      } catch (error: any) {
        const errorCode = error?.code || error?.cause?.code;
        if (errorCode !== "40001") throw error;
        const [winner] = await db.select().from(salaries).where(eq(salaries.id, Number(id))).limit(1);
        if (winner?.status === "paid") return winner;
      }
    }
    if (!result) {
      const [winner] = await db.select().from(salaries).where(eq(salaries.id, Number(id))).limit(1);
      return winner?.status === "paid" ? winner : null;
    }
    const paid = result.paid;
    if (!paid) return null;
    if (!result.transitioned) return paid;
    if (result.notification) {
      publishNotification(result.notification);
      void sendPushNotification(result.notification).catch((error) => {
        console.warn("salary payment push delivery failed:", error);
      });
    }
    return paid;
  }
  const updateData: any = { status };
  if (extra?.postponedUntil) updateData.postponedUntil = new Date(extra.postponedUntil);
  const [updated] = await db.update(salaries).set(updateData).where(eq(salaries.id, Number(id))).returning();
  if (updated && before && before.status !== status && (status === 'paid' || status === 'postponed')) {
    await createNotificationRecord({
      type: status === 'paid' ? 'salary_paid' : 'salary_postponed',
      message: status === 'paid'
        ? 'تم صرف راتبك وإصدار كشف الراتب'
        : 'تم تأجيل صرف راتبك',
      recipientType: 'employee',
      recipientEmployeeId: Number(updated.employeeId),
      referenceId: Number(updated.id),
      referenceIdType: 'salary',
    });
  }
  return updated || null;
}

export async function markSalaryReceived(salaryId: number, employeeId: number) {
  const db = getDb();
  const result = await db.transaction(async (tx: any) => {
    const [salary] = await tx.select().from(salaries)
      .where(eq(salaries.id, Number(salaryId))).for("update").limit(1);
    if (!salary) throw new Error("كشف الراتب غير موجود");
    if (Number(salary.employeeId) !== Number(employeeId)) {
      throw new Error("غير مصرح لك بتأكيد استلام هذا الراتب");
    }
    if (salary.status === "received") {
      return { updated: salary, transitioned: false, notification: null };
    }
    if (salary.status !== "paid" && salary.status !== "transferred") {
      throw new Error("لم يتم تحويل الراتب بعد من قبل الإدارة");
    }

    const [employee] = await tx.select().from(employees)
      .where(eq(employees.id, Number(employeeId))).limit(1);
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : "الموظف";
    const [updated] = await tx.update(salaries).set({
      status: "received",
      receivedAt: new Date(),
    }).where(and(eq(salaries.id, Number(salaryId)), ne(salaries.status, "received"))).returning();
    if (!updated) {
      return { updated: salary, transitioned: false, notification: null };
    }

    const [adminNotification] = await tx.insert(notifications).values({
      type: "salary_received",
      message: `قام الموظف ${employeeName} بتأكيد استلام راتب شهر ${salary.month}/${salary.year}`,
      recipientType: "admin",
      recipientEmployeeId: null,
      referenceId: Number(salaryId),
      referenceIdType: "salary",
      isRead: false,
      createdAt: new Date(),
    }).returning();

    return { updated, transitioned: true, notification: adminNotification || null };
  });

  if (result.transitioned && result.notification) {
    publishNotification(result.notification);
    void sendPushNotification(result.notification).catch((err) => {
      console.warn("salary receipt push delivery failed:", err);
    });
  }
  return result.updated;
}

export async function getEmployeeSalaryBalance(employeeId: number) {
  const db = getDb();
  const empSalaries = await db.select().from(salaries).where(eq(salaries.employeeId, Number(employeeId)));
  const totalPaid = empSalaries
    .filter((s: any) => s.status === 'paid' || s.status === 'received')
    .reduce((sum: number, s: any) => sum + Number(s.finalSalary || 0), 0);
  const totalPending = empSalaries.filter((s: any) => s.status === 'pending').reduce((sum: number, s: any) => sum + Number(s.finalSalary || 0), 0);
  const employeeViolations = await db.select().from(violations).where(eq(violations.employeeId, Number(employeeId)));
  const unlinkedDeductions = employeeViolations
    .filter((v: any) => !v.salaryId)
    .reduce((sum: number, v: any) => sum + Number(v.amount || 0), 0);
  const emp = await getEmployeeById(employeeId);
  return {
    employeeId,
    baseSalary: emp?.baseSalary || 0,
    totalPaid,
    totalPending,
    totalViolationDeductions: employeeViolations.reduce((sum: number, v: any) => sum + Number(v.amount || 0), 0),
    balance: totalPending - unlinkedDeductions
  };
}

// Notifications
export async function createNotificationRecord(data: {
  type?: string;
  message: string;
  recipientType?: string;
  recipientEmployeeId?: number | null;
  referenceId?: number | null;
  referenceIdType?: string | null;
}) {
  try {
    const db = getDb();
    const [record] = await db.insert(notifications).values({
      type: data.type || 'info',
      message: data.message || '',
      recipientType: data.recipientType || 'admin',
      recipientEmployeeId: data.recipientEmployeeId ?? null,
      referenceId: data.referenceId ?? null,
      referenceIdType: data.referenceIdType ?? null,
      isRead: false,
      createdAt: new Date(),
    }).returning();
    if (record) {
      publishNotification(record);
      await sendPushNotification(record);
    }
    return record || null;
  } catch (err) {
    console.warn("createNotificationRecord failed:", err);
    return null;
  }
}

export async function savePushSubscription(data: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userType: "admin" | "employee";
  employeeId?: number | null;
}) {
  const db = getDb();
  const existing = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, data.endpoint)).limit(1);
  if (existing[0]) {
    const [updated] = await db.update(pushSubscriptions).set({
      p256dh: data.p256dh,
      auth: data.auth,
      userType: data.userType,
      employeeId: data.employeeId ?? null,
      updatedAt: new Date(),
    }).where(eq(pushSubscriptions.id, existing[0].id)).returning();
    return updated || existing[0];
  }
  const [created] = await db.insert(pushSubscriptions).values({
    endpoint: data.endpoint,
    p256dh: data.p256dh,
    auth: data.auth,
    userType: data.userType,
    employeeId: data.employeeId ?? null,
  }).returning();
  return created || null;
}

export async function deletePushSubscription(endpoint: string, userType?: "admin" | "employee", employeeId?: number | null) {
  const db = getDb();
  const scope = userType
    ? and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userType, userType),
        userType === "employee" ? eq(pushSubscriptions.employeeId, Number(employeeId)) : isNull(pushSubscriptions.employeeId),
      )
    : eq(pushSubscriptions.endpoint, endpoint);
  const deleted = await db.delete(pushSubscriptions).where(scope).returning({ id: pushSubscriptions.id });
  return deleted.length > 0;
}

function pushTargetPath(notification: any) {
  if (notification.recipientType === "employee") {
    const type = String(notification.type || "");
    if (type.includes("violation")) return "/portal/violations";
    if (type.includes("advance") || type.includes("leave") || type.includes("vacation")) return "/portal/requests";
    if (type.includes("salary")) return "/portal/account";
    return "/portal";
  }
  if (String(notification.type || "").includes("salary")) return "/salaries";
  if (String(notification.type || "").includes("request") || String(notification.type || "").includes("advance")) return "/requests";
  if (String(notification.type || "").includes("violation")) return "/violations";
  return "/dashboard";
}

export async function sendPushNotification(notification: any) {
  if (!configurePush()) return false;
  const db = getDb();
  const rows = await db.select().from(pushSubscriptions).where(eq(
    pushSubscriptions.userType,
    String(notification.recipientType || "admin"),
  ));
  const recipients = rows.filter((row: any) =>
    notification.recipientType !== "employee" ||
    notification.recipientEmployeeId == null ||
    Number(row.employeeId) === Number(notification.recipientEmployeeId),
  );
  await Promise.all(recipients.map(async (row: any) => {
    try {
      await webpush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      }, JSON.stringify({
        title: "DHD Livraison",
        body: notification.message || "إشعار جديد",
        notificationId: notification.id,
        type: notification.type || "info",
        url: pushTargetPath(notification),
      }));
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await deletePushSubscription(row.endpoint);
      }
    }
  }));
  return recipients.length > 0;
}

export async function markSingleNotificationRead(id: number, recipientType = "admin", recipientId?: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not available");
  const scope = recipientId
    ? and(
      eq(notifications.id, Number(id)),
      eq(notifications.recipientType, recipientType),
      eq(notifications.recipientEmployeeId, Number(recipientId)),
    )
    : and(eq(notifications.id, Number(id)), eq(notifications.recipientType, recipientType));
  const [updated] = await db.update(notifications).set({ isRead: true }).where(scope).returning();
  return updated || null;
}

export async function deleteNotification(id: number, recipientType = "admin", recipientId?: number) {
  try {
    const db = getDb();
    const scope = recipientId
      ? and(
          eq(notifications.id, Number(id)),
          eq(notifications.recipientType, recipientType),
          eq(notifications.recipientEmployeeId, Number(recipientId)),
        )
      : and(eq(notifications.id, Number(id)), eq(notifications.recipientType, recipientType));
    const [deleted] = await db.delete(notifications).where(scope).returning();
    return deleted || null;
  } catch (err) {
    console.warn("deleteNotification failed:", err);
    return null;
  }
}

export async function deleteAllNotifications(recipientType = "admin", recipientId?: number) {
  try {
    const db = getDb();
    if (db) {
      const scope = recipientId
        ? and(
            eq(notifications.recipientType, recipientType),
            eq(notifications.recipientEmployeeId, Number(recipientId)),
          )
        : eq(notifications.recipientType, recipientType);
      await db.delete(notifications).where(scope);
    }
  } catch (err) {
    console.warn("deleteAllNotifications failed:", err);
    return false;
  }

  memoryStore.notifications = memoryStore.notifications.filter((n) => {
    if (n.recipientType !== recipientType) return true;
    if (!recipientId) return false;
    const notificationEmployeeId = n.recipientEmployeeId ?? n.recipientId;
    return notificationEmployeeId != null && Number(notificationEmployeeId) !== Number(recipientId);
  });
  saveLocalStore();
  return true;
}

// Admin announcements are persisted separately from the legacy notification feed.
const ANNOUNCEMENT_NEVER_EXPIRES = new Date("2999-12-31T23:59:59.999Z");

function announcementDurationSeconds(value: unknown): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
}

function announcementEndsAt(startsAt: Date, durationSeconds: number): Date {
  return durationSeconds > 0
    ? new Date(startsAt.getTime() + durationSeconds * 1000)
    : ANNOUNCEMENT_NEVER_EXPIRES;
}

function formatAnnouncement(row: any, recipientEmployeeIds: number[] = [], readEmployeeIds: number[] = []) {
  const startsAt = row.startsAt ? new Date(row.startsAt) : new Date(row.createdAt);
  const durationSeconds = announcementDurationSeconds(row.durationSeconds);
  return {
    ...row,
    severity: row.level || "normal",
    audience: row.targetAll ? "all" : "selected",
    durationSeconds,
    recipientEmployeeIds,
    readEmployeeIds,
    readCount: readEmployeeIds.length,
  };
}

export async function listAnnouncements() {
  const db = getDb();
  const rows = await db.select().from(announcements).orderBy(desc(announcements.createdAt));
  const recipientRows = await db.select().from(announcementRecipients);
  const readRows = await db.select().from(announcementReads);
  return rows.map((row: any) => {
    const recipients = recipientRows.filter((r: any) => Number(r.announcementId) === Number(row.id));
    const reads = readRows.filter((r: any) => Number(r.announcementId) === Number(row.id));
    return formatAnnouncement(
      row,
      recipients.map((r: any) => Number(r.employeeId)),
      reads.map((r: any) => Number(r.employeeId)),
    );
  });
}

export async function listEmployeeAnnouncements(employeeId: number) {
  const db = getDb();
  const rows = await db.select().from(announcements).where(eq(announcements.isActive, true)).orderBy(desc(announcements.createdAt));
  const recipients = await db.select().from(announcementRecipients).where(eq(announcementRecipients.employeeId, Number(employeeId)));
  const reads = await db.select().from(announcementReads).where(eq(announcementReads.employeeId, Number(employeeId)));
  const recipientIds = new Set(recipients.map((r: any) => Number(r.announcementId)));
  const readIds = new Set(reads.map((r: any) => Number(r.announcementId)));
  const now = Date.now();
  return rows.filter((row: any) => (row.targetAll || recipientIds.has(Number(row.id))) &&
    (!row.endsAt || new Date(row.endsAt).getTime() > now))
    .map((row: any) => ({
      ...formatAnnouncement(row, [], Array.from(readIds.has(Number(row.id)) ? [Number(employeeId)] : [])),
      isRead: readIds.has(Number(row.id)),
    }));
}

export async function createAnnouncement(data: any) {
  const db = getDb();
  const startsAt = new Date();
  const durationSeconds = announcementDurationSeconds(data.durationSeconds);
  const employeeIds: number[] = Array.from(new Set<number>(
    (Array.isArray(data.employeeIds) ? data.employeeIds : [])
      .map(Number)
      .filter((id: number) => Number.isInteger(id) && id > 0),
  ));
  return db.transaction(async (tx: any) => {
    const [created] = await tx.insert(announcements).values({
      title: String(data.title).trim(),
      body: String(data.body).trim(),
      level: data.severity || "normal",
      durationSeconds,
      allowDismiss: data.allowDismiss !== false,
      isActive: data.isActive !== false,
      startsAt,
      endsAt: announcementEndsAt(startsAt, durationSeconds),
      createdByAdminId: data.createdByAdminId ? Number(data.createdByAdminId) : null,
      createdAt: startsAt,
      updatedAt: new Date(),
      targetAll: data.audience !== "selected",
    }).returning();
    if (created && employeeIds.length) {
      await tx.insert(announcementRecipients).values(employeeIds.map((employeeId: number) => ({
        announcementId: created.id,
        employeeId,
        isRead: false,
        createdAt: startsAt,
      })));
    }
    return formatAnnouncement(created, employeeIds);
  });
}

export async function updateAnnouncement(id: number, data: any) {
  const db = getDb();
  const durationSeconds = data.durationSeconds !== undefined
    ? announcementDurationSeconds(data.durationSeconds)
    : undefined;
  return db.transaction(async (tx: any) => {
    const [updated] = await tx.update(announcements).set({
      ...(data.title !== undefined ? { title: String(data.title).trim() } : {}),
      ...(data.body !== undefined ? { body: String(data.body).trim() } : {}),
      ...(data.severity !== undefined ? { level: data.severity } : {}),
      ...(durationSeconds !== undefined ? {
        durationSeconds,
        endsAt: announcementEndsAt(new Date(), durationSeconds),
      } : {}),
      ...(data.audience !== undefined ? { targetAll: data.audience !== "selected" } : {}),
      ...(data.allowDismiss !== undefined ? { allowDismiss: Boolean(data.allowDismiss) } : {}),
      ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
      updatedAt: new Date(),
    }).where(eq(announcements.id, Number(id))).returning();
    if (!updated) return null;
    if (data.employeeIds) {
      await tx.delete(announcementRecipients).where(eq(announcementRecipients.announcementId, Number(id)));
      const ids: number[] = Array.from(new Set<number>(
        data.employeeIds.map(Number).filter((employeeId: number) => Number.isInteger(employeeId) && employeeId > 0),
      ));
      if (ids.length) {
        await tx.insert(announcementRecipients).values(ids.map((employeeId: number) => ({
          announcementId: Number(id),
          employeeId,
          isRead: false,
          createdAt: new Date(),
        })));
      }
    }
    const recipients = await tx.select().from(announcementRecipients)
      .where(eq(announcementRecipients.announcementId, Number(id)));
    return formatAnnouncement(updated, recipients.map((row: any) => Number(row.employeeId)));
  });
}

export async function deleteAnnouncement(id: number) {
  const db = getDb();
  return db.transaction(async (tx: any) => {
    await tx.delete(announcementReads).where(eq(announcementReads.announcementId, Number(id)));
    await tx.delete(announcementRecipients).where(eq(announcementRecipients.announcementId, Number(id)));
    const [deleted] = await tx.delete(announcements).where(eq(announcements.id, Number(id))).returning();
    return deleted || null;
  });
}

export async function markAnnouncementRead(id: number, employeeId: number) {
  const db = getDb();
  const [row] = await db.insert(announcementReads).values({ announcementId: Number(id), employeeId: Number(employeeId), readAt: new Date() }).onConflictDoNothing().returning();
  return row || null;
}

// Auto-absence: mark employees absent for past workdays they missed
export async function markAutoAbsences(lookbackDays = 30) {
  const db = getDb();
  if (!db) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const since = new Date(today);
  since.setDate(since.getDate() - lookbackDays);
  const sinceStr = since.toISOString().slice(0, 10);

  // Load all active employees
  const allEmps = await db.select().from(employees)
    .where(and(eq(employees.isActive, true), isNull(employees.deletedAt)));
  if (!allEmps.length) return 0;

  // Load existing attendance since lookback date (date column is a text/date field)
  const existingAtt = await db.select({ employeeId: attendance.employeeId, date: attendance.date })
    .from(attendance)
    .where(sql`${attendance.date} >= ${sinceStr}`);
  const [approvedLeaves, approvedVacations] = await Promise.all([
    db.select().from(leaveRequests).where(eq(leaveRequests.status, "approved")),
    db.select().from(vacationRequests).where(eq(vacationRequests.status, "approved")),
  ]);

  const attSet = new Set<string>(
    existingAtt.map((a: any) => `${a.employeeId}:${String(a.date || '').slice(0, 10)}`)
  );

  const REST_DAY_MAP: Record<string, number> = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6,
    'الأحد': 0, 'الاحد': 0, 'الإثنين': 1, 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3,
    'الخميس': 4, 'الجمعة': 5, 'السبت': 6,
  };

  const inserts: any[] = [];
  const now = new Date();

  for (const emp of allEmps) {
    // Parse rest days — stored as JSON array e.g. ["Friday","Saturday"]
    let restDayNums: number[] = [];
    try {
      const parsed = typeof emp.restDays === 'string' ? JSON.parse(emp.restDays) : (emp.restDays ?? []);
      if (Array.isArray(parsed)) {
        restDayNums = parsed
          .map((d: any) => REST_DAY_MAP[String(d).trim().toLowerCase()] ?? -1)
          .filter((n: number) => n >= 0);
      }
    } catch {}
    // Default: Friday + Saturday (common Algerian work week)
    if (!restDayNums.length) restDayNums = [5, 6];

    for (let d = 0; d < lookbackDays; d++) {
      const date = new Date(since);
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().slice(0, 10);
      if (dateStr >= todayStr) break; // never mark today absent
      const hireDate = String(emp.hireDate || '').slice(0, 10);
      if (hireDate && dateStr < hireDate) continue;
      if (restDayNums.includes(date.getDay())) continue; // skip rest days

      const key = `${emp.id}:${dateStr}`;
      if (attSet.has(key)) continue; // already has a record for this day
      const onApprovedTimeOff = [...approvedLeaves, ...approvedVacations].some((request: any) =>
        Number(request.employeeId) === Number(emp.id) &&
        String(request.startDate || '') <= dateStr &&
        String(request.endDate || request.startDate || '') >= dateStr,
      );
      if (onApprovedTimeOff) continue;

      attSet.add(key); // prevent duplication within this run
      inserts.push({
        employeeId: emp.id,
        officeId: emp.officeId || null,
        date: dateStr,
        isAbsent: true,
        notes: 'غياب تلقائي',
        createdAt: now,
      });
    }
  }

  if (inserts.length) {
    // Insert in batches; the unique index on (employeeId, date) prevents duplicates
    for (let i = 0; i < inserts.length; i += 100) {
      await db.insert(attendance).values(inserts.slice(i, i + 100)).onConflictDoNothing();
    }
    console.log(`[markAutoAbsences] Inserted ${inserts.length} absent records`);
  }
  return inserts.length;
}

// Unified requests listing (advances + leave + vacation) with optional status filter
export async function listAllRequests(opts?: { status?: string; employeeId?: number }) {
  const db = getDb();
  const [advRows, leaveRows, vacRows] = await Promise.all([
    db.select({ request: advances, employee: employees, office: offices })
      .from(advances)
      .leftJoin(employees, eq(employees.id, advances.employeeId))
      .leftJoin(offices, eq(offices.id, employees.officeId))
      .where(opts?.employeeId ? eq(advances.employeeId, Number(opts.employeeId)) : undefined)
      .orderBy(desc(advances.requestedAt), desc(advances.id)),
    db.select({ request: leaveRequests, employee: employees, office: offices })
      .from(leaveRequests)
      .leftJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .leftJoin(offices, eq(offices.id, employees.officeId))
      .where(opts?.employeeId ? eq(leaveRequests.employeeId, Number(opts.employeeId)) : undefined)
      .orderBy(desc(leaveRequests.requestedAt), desc(leaveRequests.id)),
    db.select({ request: vacationRequests, employee: employees, office: offices })
      .from(vacationRequests)
      .leftJoin(employees, eq(employees.id, vacationRequests.employeeId))
      .leftJoin(offices, eq(offices.id, employees.officeId))
      .where(opts?.employeeId ? eq(vacationRequests.employeeId, Number(opts.employeeId)) : undefined)
      .orderBy(desc(vacationRequests.requestedAt), desc(vacationRequests.id)),
  ]);

  const toItem = (row: any, type: string) => ({
    ...formatRequestRecord(row.request, row.employee, row.office),
    requestType: type,
  });

  let all = [
    ...advRows.map((r: any) => toItem(r, 'advance')),
    ...leaveRows.map((r: any) => toItem(r, 'leave')),
    ...vacRows.map((r: any) => toItem(r, 'vacation')),
  ];

  if (opts?.status && opts.status !== 'all') {
    all = all.filter((r) => r.status === opts.status);
  }

  // Sort by requestedAt descending
  return all.sort((a: any, b: any) => {
    const aTime = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
    const bTime = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
    return bTime - aTime || Number(b.id) - Number(a.id);
  });
}

// Stats
export async function getDashboardStats() {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];

  const [employeesList, officesList, advancesList, todayAttendance, leaveRows, vacRows] = await Promise.all([
    listEmployees(),
    listOffices(),
    listAdvances(),
    db.select().from(attendance).where(and(eq(attendance.date, today), eq(attendance.isAbsent, false))),
    db.select().from(leaveRequests).where(eq(leaveRequests.status, "pending")),
    db.select().from(vacationRequests).where(eq(vacationRequests.status, "pending")),
  ]);

  const totalEmployees = employeesList.length;
  const activeOffices = officesList.filter((o: any) => o.active).length;
  const presentToday = todayAttendance.filter((a: any) => a.checkInTime != null).length;
  const pendingAdvances = advancesList.filter((a: any) => a.status === "pending").length;
  const pendingRequests = pendingAdvances + leaveRows.length + vacRows.length;

  return {
    totalEmployees,
    presentToday,
    activeOffices,
    pendingAdvances,
    pendingRequests,
  };
}

// Real attendance chart data for the past N days
export async function getAttendanceChartData(days = 7) {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);
  const rows = await db.select().from(attendance)
    .where(sql`${attendance.date} >= ${sinceStr}`)
    .orderBy(asc(attendance.date));

  const byDate: Record<string, { date: string; present: number; absent: number; late: number }> = {};
  for (const row of rows) {
    const d = String(row.date || '').slice(0, 10);
    if (!d) continue;
    if (!byDate[d]) byDate[d] = { date: d, present: 0, absent: 0, late: 0 };
    if (row.isAbsent) {
      byDate[d].absent++;
    } else if (row.checkInTime) {
      byDate[d].present++;
      if (Number(row.lateMinutes || 0) > 0) byDate[d].late++;
    }
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

// Real salary chart data (last 6 months)
export async function getSalaryChartData() {
  const db = getDb();
  const rows = await db.select().from(salaries).orderBy(asc(salaries.year), asc(salaries.month));
  const monthNames: Record<string, string> = {
    '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل',
    '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس',
    '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر',
  };
  const byPeriod: Record<string, { month: string; totalSalary: number }> = {};
  for (const row of rows) {
    const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
    if (!byPeriod[key]) {
      byPeriod[key] = {
        month: `${monthNames[String(row.month).padStart(2, '0')] || row.month} ${row.year}`,
        totalSalary: 0,
      };
    }
    byPeriod[key].totalSalary += Number(row.finalSalary || row.baseSalary || 0);
  }
  return Object.values(byPeriod).slice(-6);
}
