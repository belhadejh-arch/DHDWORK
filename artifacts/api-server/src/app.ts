import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// ─── Short-lived PDF download tokens ─────────────────────────────────────────
// Allows window.open(pdfUrl) to work without relying on cookies or auth headers.
// Tokens are valid for 2 minutes and single-use.
const _pdfTokens = new Map<string, { salaryId: number; expiresAt: number }>();

function issuePdfToken(salaryId: number): string {
  const token = crypto.randomBytes(16).toString('hex');
  _pdfTokens.set(token, { salaryId, expiresAt: Date.now() + 120_000 });
  // Prune expired entries
  const now = Date.now();
  for (const [t, v] of _pdfTokens) { if (v.expiresAt < now) _pdfTokens.delete(t); }
  return token;
}

function consumePdfToken(token: string | undefined, salaryId: number): boolean {
  if (!token) return false;
  const entry = _pdfTokens.get(token);
  if (!entry || entry.salaryId !== salaryId || entry.expiresAt < Date.now()) return false;
  _pdfTokens.delete(token); // single-use
  return true;
}

const _previewPdfTokens = new Map<string, { employeeId: number; month: string; year: number; expiresAt: number }>();

function issuePreviewPdfToken(employeeId: number, month: string, year: number): string {
  const token = crypto.randomBytes(16).toString('hex');
  _previewPdfTokens.set(token, { employeeId, month, year, expiresAt: Date.now() + 120_000 });
  const now = Date.now();
  for (const [t, v] of _previewPdfTokens) { if (v.expiresAt < now) _previewPdfTokens.delete(t); }
  return token;
}

function consumePreviewPdfToken(token: string | undefined): { employeeId: number; month: string; year: number } | null {
  if (!token) return null;
  const entry = _previewPdfTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) return null;
  _previewPdfTokens.delete(token);
  return { employeeId: entry.employeeId, month: entry.month, year: entry.year };
}
// ─────────────────────────────────────────────────────────────────────────────

import {
  getAdminByEmail,
  getAdminById,
  getAdminByQrSecret,
  createSession,
  getSession,
  deleteSession,
  getEmployeeByCode,
  getEmployeeByQrSecret,
  getEmployeeById,
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listFormerEmployees,
  restoreEmployee,
  permanentlyDeleteEmployee,
  listOffices,
  getOfficeById,
  getOfficeByQrSecret,
  createOffice,
  updateOffice,
  deleteOffice,
  rotateEmployeeQr,
  rotateOfficeQr,
  rotateAdminQr,
  ensureAdminSerial,
  updateAdmin,
  seedOfficialOffices,
  getSalaryPdfData,
  getSalaryPreviewData,
  listAttendance,
  recordAttendance,
  completeAttendance,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  listAdvances,
  createAdvance,
  updateAdvanceStatus,
  listLeaveRequests,
  createLeaveRequest,
  updateLeaveRequestStatus,
  listVacationRequests,
  createVacationRequest,
  updateVacationRequestStatus,
  listViolations,
  createViolation,
  getViolationById,
  updateViolation,
  deleteViolation,
  listSalaries,
  getSalaryById,
  createSalary,
  updateSalaryStatus,
  getEmployeeSalaryBalance,
  listBonuses,
  createBonus,
  deleteBonus,
  updateBonus,
  listNotifications,
  createNotificationRecord,
  markNotificationsRead,
  markSingleNotificationRead,
  deleteNotification,
  deleteAllNotifications,
  getSettings,
  updateSettings,
  getDashboardStats
  ,savePushSubscription
  ,deletePushSubscription
  ,listAnnouncements
  ,listEmployeeAnnouncements
  ,createAnnouncement
  ,updateAnnouncement
  ,deleteAnnouncement
  ,markAnnouncementRead
  ,listAllRequests
  ,getAttendanceChartData
  ,getSalaryChartData
  ,markAutoAbsences
  ,markSalaryReceived
  ,subscribeToNotifications
} from './dbStore.js';

export const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health Check Endpoints
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Primary API Router
const apiRouter = express.Router();

apiRouter.get('/status', (req, res) => {
  res.json({ status: 'active', app: 'DHD Livraison API Server', database: 'connected' });
});

// Helper to resolve current authenticated user from request token/headers
async function getAuthContext(req: express.Request) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim() || req.cookies?.dhd_admin_token || req.cookies?.employee_token || '';
  const session = await getSession(token);
  if (!session) return null;

  if (session.userType === 'employee') {
    const employee = await getEmployeeById(Number(session.userId));
    if (employee && employee.isActive !== false && employee.status !== 'inactive') {
      return { userType: 'employee' as const, employee };
    }
    await deleteSession(token);
    return null;
  }

  if (session.userType === 'admin') {
    let admin = await getAdminById(Number(session.userId));
    if (!admin) return null;
    if (!admin.serialNumber) {
      const provisionedAdmin = await ensureAdminSerial(Number(admin.id));
      if (!provisionedAdmin) return null;
      admin = provisionedAdmin;
    }
    if (!admin) return null;
    return {
      userType: 'admin' as const,
      admin: {
        id: admin.id,
        email: admin.email || null,
        serialNumber: admin.serialNumber || null,
        username: admin.username || null,
        firstName: admin.firstName || '',
        lastName: admin.lastName || '',
        phone: admin.phone || null,
        name: `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.username || 'مدير DHD',
        role: 'superadmin'
      }
    };
  }

  return null;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
  };
}

async function requireAdmin(req: express.Request, res: express.Response) {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'admin') {
    res.status(401).json({ message: 'يجب تسجيل الدخول كمسؤول' });
    return null;
  }
  return ctx;
}

async function requireAuthenticated(req: express.Request, res: express.Response) {
  const ctx = await getAuthContext(req);
  if (!ctx) {
    res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
    return null;
  }
  return ctx;
}

// Auth Endpoints
apiRouter.post('/auth/login', async (req, res) => {
  const { email, username, password } = req.body || {};
  const identifier = String(email || username || '').trim();
  if (!identifier) {
    return res.status(400).json({ success: false, message: 'برجاء إدخال البريد الإلكتروني أو اسم المستخدم' });
  }

  const admin = await getAdminByEmail(identifier);
  if (admin) {
    const pwdStr = String(password || '').trim();
    const hashed = crypto.createHash('sha256').update(pwdStr).digest('hex');
    const isPasswordCorrect = Boolean(pwdStr) && (
      admin.passwordHash === pwdStr ||
      admin.passwordHash === hashed
    );

    if (isPasswordCorrect) {
      const token = await createSession('admin', Number(admin.id));
      res.cookie('dhd_admin_token', token, sessionCookieOptions());
      return res.json({
        success: true,
        userType: 'admin',
        token,
        admin: {
          id: admin.id,
          email: admin.email || null,
          serialNumber: admin.serialNumber || null,
          username: admin.username || null,
          firstName: admin.firstName || '',
          lastName: admin.lastName || '',
          phone: admin.phone || null,
          name: `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.username || 'مدير DHD',
          role: 'superadmin'
        }
      });
    }
  }

  return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
});

apiRouter.post('/auth/login/serial', async (req, res) => {
  const { serial, serialNumber, employeeCode, phone, pinCode, code: rawCode } = req.body || {};
  const code = String(serial || serialNumber || employeeCode || phone || pinCode || rawCode || '').trim();
  if (!code) {
    return res.status(400).json({ success: false, message: 'برجاء إدخال الرقم التسلسلي أو الكود الخاص بك' });
  }

  const emp = await getEmployeeByCode(code);
  if (emp) {
    if (emp.status === 'inactive' || emp.isActive === false) {
      return res.status(403).json({ success: false, message: 'الحساب موقوف أو غير نشط' });
    }
    const token = await createSession('employee', Number(emp.id));
    res.cookie('employee_token', token, sessionCookieOptions());
    return res.json({
      success: true,
      userType: 'employee',
      token,
      employee: emp
    });
  }

  return res.status(401).json({ success: false, message: 'الرقم التسلسلي أو الكود غير صحيح' });
});

apiRouter.post('/auth/login/qr', async (req, res) => {
  const { qrCodeData } = req.body || {};
  if (!qrCodeData) {
    return res.status(400).json({ success: false, message: 'رمز QR غير صالح' });
  }

  const emp = await getEmployeeByQrSecret(qrCodeData);
  if (emp) {
    if (emp.status === 'inactive' || emp.isActive === false) {
      return res.status(403).json({ success: false, message: 'الحساب موقوف أو غير نشط' });
    }
    const token = await createSession('employee', Number(emp.id));
    res.cookie('employee_token', token, sessionCookieOptions());
    return res.json({
      success: true,
      userType: 'employee',
      token,
      employee: emp
    });
  }

  const admin = await getAdminByQrSecret(qrCodeData);
  if (admin) {
    const token = await createSession('admin', Number(admin.id));
    res.cookie('dhd_admin_token', token, sessionCookieOptions());
    return res.json({
      success: true,
      userType: 'admin',
      token,
      admin: {
        id: admin.id,
        email: admin.email || null,
        serialNumber: admin.serialNumber || null,
        username: admin.username || null,
        firstName: admin.firstName || '',
        lastName: admin.lastName || '',
        phone: admin.phone || null,
        name: `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.username || 'مدير DHD',
        role: 'superadmin'
      }
    });
  }

  return res.status(401).json({ success: false, message: 'رمز QR غير صالح أو منتهي الصلاحية' });
});

apiRouter.get('/auth/me', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx) {
    return res.json({
      isAuthenticated: true,
      ...ctx
    });
  }

  return res.json({
    isAuthenticated: false
  });
});

apiRouter.post('/auth/change-email', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'admin') return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول كمسؤول' });
  const { newEmail } = req.body || {};
  if (!newEmail || !String(newEmail).includes('@')) return res.status(400).json({ success: false, message: 'البريد الإلكتروني غير صالح' });
  const adminId = (ctx.admin as any).id;
  const updated = await updateAdmin(adminId, { email: String(newEmail).trim() });
  if (!updated) return res.status(500).json({ success: false, message: 'فشل تحديث البريد الإلكتروني' });
  return res.json({ success: true, message: 'تم تحديث البريد الإلكتروني بنجاح', email: updated.email });
});

apiRouter.post('/auth/change-password', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'admin') return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول كمسؤول' });
  const { newPassword, currentPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
  const adminId = (ctx.admin as any).id;
  const admin = await getAdminById(adminId);
  if (!admin) return res.status(404).json({ success: false, message: 'المسؤول غير موجود' });
  // Verify current password if provided
  if (currentPassword) {
    const curHashed = crypto.createHash('sha256').update(String(currentPassword)).digest('hex');
    const isOk = admin.passwordHash === String(currentPassword) || admin.passwordHash === curHashed;
    if (!isOk) return res.status(403).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
  }
  const hashedNew = crypto.createHash('sha256').update(String(newPassword)).digest('hex');
  const updated = await updateAdmin(adminId, { passwordHash: hashedNew });
  if (!updated) return res.status(500).json({ success: false, message: 'فشل تحديث كلمة المرور' });
  return res.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح' });
});

apiRouter.post('/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim() || req.cookies?.dhd_admin_token || req.cookies?.employee_token || '';
  await deleteSession(token);
  res.clearCookie('dhd_admin_token');
  res.clearCookie('employee_token');
  res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
});

// Employees Endpoints
apiRouter.get('/employees', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const list = await listEmployees(req.query);
  res.json(list);
});

apiRouter.post('/employees', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const newEmp = await createEmployee(req.body);
  res.status(201).json(newEmp);
});

// Former employees
apiRouter.get('/employees/former', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const list = await listFormerEmployees();
  res.json(list);
});

// Seed defaults — no-op, DB already has real data
apiRouter.post('/employees/seed-defaults', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  res.json({ success: true, message: 'البيانات محفوظة في قاعدة البيانات' });
});

apiRouter.get('/employees/attendance-summary', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const filterEmpId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const filterMonth = req.query.month ? String(req.query.month).padStart(2, '0') : undefined;
  const filterYear = req.query.year ? Number(req.query.year) : undefined;

  const employeesList = filterEmpId
    ? [await getEmployeeById(filterEmpId)].filter(Boolean)
    : await listEmployees();
  const attendanceList = await listAttendance(filterEmpId);

  const summary = (employeesList as any[]).filter(Boolean).map((e: any) => {
    let empAtt = (attendanceList as any[]).filter((a: any) => Number(a.employeeId) === Number(e.id));
    if (filterMonth) {
      empAtt = empAtt.filter((a: any) => String(a.date || '').slice(5, 7) === filterMonth);
    }
    if (filterYear) {
      empAtt = empAtt.filter((a: any) => String(a.date || '').slice(0, 4) === String(filterYear));
    }
    return {
      employeeId: e.id,
      employeeName: `${e.firstName || ''} ${e.lastName || ''}`.trim(),
      totalDays: empAtt.length,
      present: empAtt.filter((a: any) => a.status === 'present' || (!a.isAbsent && a.checkInTime)).length,
      absent: empAtt.filter((a: any) => a.status === 'absent' || a.isAbsent).length,
      late: empAtt.filter((a: any) => a.status === 'late' || Number(a.lateMinutes || 0) > 0).length,
      records: empAtt,
    };
  });
  // Return single object if filtering by employee, array otherwise
  if (filterEmpId) {
    return res.json(summary[0] || { employeeId: filterEmpId, totalDays: 0, present: 0, absent: 0, late: 0, records: [] });
  }
  return res.json(summary);
});

apiRouter.get('/employees/:id', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const emp = await getEmployeeById(Number(req.params.id));
  if (!emp) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json(emp);
});

apiRouter.patch('/employees/:id', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const updated = await updateEmployee(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json(updated);
});

apiRouter.delete('/employees/:id', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const reason = req.body?.reason || 'Deleted by admin';
  const deleted = await deleteEmployee(Number(req.params.id), reason);
  if (!deleted) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json({ success: true, message: 'تم حذف الموظف' });
});

apiRouter.post('/employees/:id/restore', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const emp = await restoreEmployee(Number(req.params.id));
  if (!emp) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json(emp);
});

apiRouter.post('/employees/:id/permanent', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const deleted = await permanentlyDeleteEmployee(Number(req.params.id));
  if (!deleted) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json({ success: true, message: 'تم الحذف النهائي للموظف' });
});

apiRouter.get('/employees/:id/salary-balance', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const balance = await getEmployeeSalaryBalance(Number(req.params.id));
  res.json(balance);
});

apiRouter.get('/employees/:id/transactions', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const empId = Number(req.params.id);
  const [advList, salList, violList] = await Promise.all([
    listAdvances(empId),
    listSalaries(empId),
    listViolations(empId)
  ]);
  res.json({ advances: advList, salaries: salList, violations: violList });
});

apiRouter.get('/employees/:id/qr-code', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const emp = await getEmployeeById(Number(req.params.id));
  if (!emp) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json({
    employeeId: emp.id,
    qrCodeSecret: emp.qrCodeSecret,
    qrCodeData: emp.qrCodeSecret
  });
});

// Keep both spellings because the imported UI uses /qrcode while older clients
// use /qr-code. Both routes return the same database-backed value.
apiRouter.get('/employees/:id/qrcode', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const emp = await getEmployeeById(Number(req.params.id));
  if (!emp) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json({
    employeeId: emp.id,
    qrCodeSecret: emp.qrCodeSecret,
    qrCodeData: emp.qrCodeData
  });
});

apiRouter.post('/employees/:id/qrcode/regenerate', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const emp = await rotateEmployeeQr(Number(req.params.id));
  if (!emp) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json({
    employeeId: emp.id,
    qrCodeSecret: emp.qrCodeSecret,
    qrCodeData: emp.qrCodeData
  });
});

// Offices Endpoints
apiRouter.get('/offices', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const list = await listOffices();
  res.json(list);
});

apiRouter.post('/offices', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const office = await createOffice(req.body);
  res.status(201).json(office);
});

apiRouter.get('/offices/:id', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  if (req.params.id === 'qrcode') return; // handled below
  const office = await getOfficeById(Number(req.params.id));
  if (!office) return res.status(404).json({ message: 'المكتب غير موجود' });
  return res.json(office);
});

apiRouter.patch('/offices/:id', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const office = await updateOffice(Number(req.params.id), req.body);
  if (!office) return res.status(404).json({ message: 'المكتب غير موجود' });
  return res.json(office);
});

apiRouter.delete('/offices/:id', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  await deleteOffice(Number(req.params.id));
  res.json({ success: true });
});

apiRouter.get('/offices/:id/qrcode', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const office = await getOfficeById(Number(req.params.id));
  if (!office) return res.status(404).json({ message: 'المكتب غير موجود' });
  const qr = office.qrCodeData || office.qrCodeSecret || null;
  return res.json({
    officeId: office.id,
    qrCodeSecret: qr,
    qrCodeData: qr,
    token: qr           // ← the offices list JS reads i.token
  });
});

apiRouter.post('/offices/:id/qrcode/regenerate', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const office = await rotateOfficeQr(Number(req.params.id));
  if (!office) return res.status(404).json({ message: 'المكتب غير موجود' });
  const qr = office.qrCodeData || office.qrCodeSecret || null;
  return res.json({
    officeId: office.id,
    qrCodeSecret: qr,
    qrCodeData: qr,
    token: qr           // ← the offices list JS reads i.token after regenerate
  });
});

apiRouter.get('/admins/:id/qrcode', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'admin') return res.status(401).json({ message: 'يجب تسجيل الدخول كمسؤول' });
  if (Number(ctx.admin.id) !== Number(req.params.id)) return res.status(403).json({ message: 'غير مصرح لك بإدارة رمز مسؤول آخر' });
  let admin = await getAdminById(Number(req.params.id));
  if (!admin) return res.status(404).json({ message: 'المسؤول غير موجود' });
  if (!admin.qrCodeData) admin = await rotateAdminQr(Number(req.params.id));
  return res.json({
    adminId: admin.id,
    qrCodeSecret: admin.qrCodeData || null,
    qrCodeData: admin.qrCodeData || null
  });
});

apiRouter.get('/admins/:id/qrcode.svg', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'admin') return res.status(401).json({ message: 'يجب تسجيل الدخول كمسؤول' });
  if (Number(ctx.admin.id) !== Number(req.params.id)) return res.status(403).json({ message: 'غير مصرح لك بإدارة رمز مسؤول آخر' });
  let admin = await getAdminById(Number(req.params.id));
  if (!admin) return res.status(404).json({ message: 'المسؤول غير موجود' });
  if (!admin.qrCodeData) admin = await rotateAdminQr(Number(req.params.id));
  if (!admin?.qrCodeData) return res.status(500).json({ message: 'تعذر إنشاء رمز QR للمسؤول' });
  const svg = await QRCode.toString(admin.qrCodeData, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 220,
    color: { dark: '#2d2926', light: '#ffffff' }
  });
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(svg);
});

apiRouter.get('/admins/:id/serial', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'admin') return res.status(401).json({ message: 'يجب تسجيل الدخول كمسؤول' });
  if (Number(ctx.admin.id) !== Number(req.params.id)) return res.status(403).json({ message: 'غير مصرح لك بعرض بيانات مسؤول آخر' });
  const admin = await ensureAdminSerial(Number(req.params.id));
  if (!admin) return res.status(404).json({ message: 'المسؤول غير موجود' });
  return res.json({
    adminId: admin.id,
    serialNumber: admin.serialNumber || null,
    email: admin.email,
    name: `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.username || 'مدير DHD'
  });
});

apiRouter.patch('/admins/:id', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'admin') return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول كمسؤول' });
  if (Number(ctx.admin.id) !== Number(req.params.id)) return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل حساب مسؤول آخر' });
  const updated = await updateAdmin(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ message: 'المسؤول غير موجود' });
  return res.json({ success: true, admin: updated });
});

apiRouter.post('/admins/:id/qrcode/regenerate', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'admin') return res.status(401).json({ message: 'يجب تسجيل الدخول كمسؤول' });
  if (Number(ctx.admin.id) !== Number(req.params.id)) return res.status(403).json({ message: 'غير مصرح لك بإدارة رمز مسؤول آخر' });
  const admin = await rotateAdminQr(Number(req.params.id));
  if (!admin) return res.status(404).json({ message: 'المسؤول غير موجود' });
  return res.json({
    adminId: admin.id,
    qrCodeSecret: admin.qrCodeData || null,
    qrCodeData: admin.qrCodeData || null
  });
});

// One strict QR verification endpoint for camera scans and WebViews. It only
// accepts the persisted qr_code_data value; serial numbers and IDs are not QR
// credentials and must not authenticate an account.
apiRouter.post('/qr/verify', async (req, res) => {
  const raw = req.body?.qrCodeData ?? req.body?.value ?? req.body?.data ?? req.body?.token;
  const qrValue = normalizeQrValue(raw);
  if (!qrValue) return res.status(400).json({ valid: false, message: 'رمز QR فارغ أو غير صالح' });

  const employee = await getEmployeeByQrSecret(qrValue);
  if (employee) {
    return res.json({
      valid: employee.isActive !== false,
      type: 'employee',
      entity: employee.isActive !== false ? employee : null,
      message: employee.isActive !== false ? 'تم التحقق من الموظف' : 'حساب الموظف غير نشط'
    });
  }

  const office = await getOfficeByQrSecret(qrValue);
  if (office) {
    return res.json({ valid: true, type: 'office', entity: office, message: 'تم التحقق من المكتب' });
  }

  const admin = await getAdminByQrSecret(qrValue);
  if (admin) {
    return res.json({
      valid: true,
      type: 'admin',
      entity: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        serialNumber: admin.serialNumber,
        qrCodeData: admin.qrCodeData
      },
      message: 'تم التحقق من المسؤول'
    });
  }

  return res.status(401).json({ valid: false, message: 'رمز QR غير مسجل أو غير صالح' });
});

// Attendance Endpoints
apiRouter.get('/attendance', async (req, res) => {
  const ctx = await requireAuthenticated(req, res);
  if (!ctx) return;
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const dateFilter = typeof req.query.date === 'string' ? req.query.date : undefined;
  const list = await listAttendance(empId, dateFilter);
  res.json(list);
});

apiRouter.post('/attendance', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const record = await recordAttendance(req.body);
  res.status(201).json(record);
});

// Employee self-service attendance actions. Keeping this under /api makes it
// available through the artifact proxy in both development and production.
apiRouter.post('/attendance/:action', employeeAttendanceAction);

apiRouter.get('/attendance/:id', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const record = await getAttendanceById(Number(req.params.id));
  if (!record) return res.status(404).json({ message: 'سجل الحضور غير موجود' });
  return res.json(record);
});

apiRouter.patch('/attendance/:id', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const record = await updateAttendance(Number(req.params.id), req.body);
  if (!record) return res.status(404).json({ message: 'سجل الحضور غير موجود' });
  return res.json(record);
});

apiRouter.delete('/attendance/:id', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const deleted = await deleteAttendance(Number(req.params.id));
  if (!deleted) return res.status(404).json({ message: 'سجل الحضور غير موجود' });
  return res.json({ success: true });
});

// Advances Endpoints
apiRouter.get('/advances', async (req, res) => {
  const ctx = await requireAuthenticated(req, res);
  if (!ctx) return;
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listAdvances(empId);
  res.json(list);
});

apiRouter.post('/advances', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const record = await createAdvance(req.body);
  res.status(201).json(record);
});

async function approveAdvance(req: express.Request, res: express.Response) {
  if (!await requireAdmin(req, res)) return;
  const updated = await updateAdvanceStatus(Number(req.params.id), 'approved', req.body || {});
  if (!updated) return res.status(404).json({ message: 'طلب السلفة غير موجود' });
  return res.json(updated);
}

async function rejectAdvance(req: express.Request, res: express.Response) {
  if (!await requireAdmin(req, res)) return;
  const updated = await updateAdvanceStatus(Number(req.params.id), 'rejected', req.body || {});
  if (!updated) return res.status(404).json({ message: 'طلب السلفة غير موجود' });
  return res.json(updated);
}

apiRouter.post('/advances/:id/approve', approveAdvance);
apiRouter.patch('/advances/:id/approve', approveAdvance);
apiRouter.post('/advances/:id/reject', rejectAdvance);
apiRouter.patch('/advances/:id/reject', rejectAdvance);

// Leave Requests Endpoints
apiRouter.get('/leave-requests', async (req, res) => {
  const ctx = await requireAuthenticated(req, res);
  if (!ctx) return;
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listLeaveRequests(empId);
  res.json(list);
});

apiRouter.post('/leave-requests', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const record = await createLeaveRequest(req.body);
  res.status(201).json(record);
});

async function approveLeaveRequest(req: express.Request, res: express.Response) {
  if (!await requireAdmin(req, res)) return;
  const updated = await updateLeaveRequestStatus(Number(req.params.id), 'approved', req.body || {});
  if (!updated) return res.status(404).json({ message: 'طلب الغياب غير موجود' });
  return res.json(updated);
}

async function rejectLeaveRequest(req: express.Request, res: express.Response) {
  if (!await requireAdmin(req, res)) return;
  const updated = await updateLeaveRequestStatus(Number(req.params.id), 'rejected', req.body || {});
  if (!updated) return res.status(404).json({ message: 'طلب الغياب غير موجود' });
  return res.json(updated);
}

apiRouter.post('/leave-requests/:id/approve', approveLeaveRequest);
apiRouter.patch('/leave-requests/:id/approve', approveLeaveRequest);
apiRouter.post('/leave-requests/:id/reject', rejectLeaveRequest);
apiRouter.patch('/leave-requests/:id/reject', rejectLeaveRequest);

// Vacation Requests Endpoints
apiRouter.get('/vacation-requests', async (req, res) => {
  const ctx = await requireAuthenticated(req, res);
  if (!ctx) return;
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listVacationRequests(empId);
  res.json(list);
});

apiRouter.post('/vacation-requests', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const record = await createVacationRequest(req.body);
  res.status(201).json(record);
});

async function approveVacationRequest(req: express.Request, res: express.Response) {
  if (!await requireAdmin(req, res)) return;
  const updated = await updateVacationRequestStatus(Number(req.params.id), 'approved', req.body || {});
  if (!updated) return res.status(404).json({ message: 'طلب العطلة غير موجود' });
  return res.json(updated);
}

async function rejectVacationRequest(req: express.Request, res: express.Response) {
  if (!await requireAdmin(req, res)) return;
  const updated = await updateVacationRequestStatus(Number(req.params.id), 'rejected', req.body || {});
  if (!updated) return res.status(404).json({ message: 'طلب العطلة غير موجود' });
  return res.json(updated);
}

apiRouter.post('/vacation-requests/:id/approve', approveVacationRequest);
apiRouter.patch('/vacation-requests/:id/approve', approveVacationRequest);
apiRouter.post('/vacation-requests/:id/reject', rejectVacationRequest);
apiRouter.patch('/vacation-requests/:id/reject', rejectVacationRequest);

// Bonuses Endpoints
// Bonuses — admin manages; employees may read only their own records
apiRouter.get('/bonuses', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  // Employees can only read their own bonuses
  const empId = ctx.userType === 'employee'
    ? ctx.employee.id
    : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listBonuses(empId);
  return res.json(list);
});

apiRouter.post('/bonuses', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'admin') return res.status(403).json({ message: 'يجب تسجيل الدخول كمسؤول أولاً' });
  const record = await createBonus(req.body);
  return res.status(201).json(record);
});

apiRouter.get('/bonuses/:id', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const list = await listBonuses();
  const bonus = (list as any[]).find((b: any) => Number(b.id) === Number(req.params.id));
  if (!bonus) return res.status(404).json({ message: 'الزيادة غير موجودة' });
  // Employees can only access their own bonus records
  if (ctx.userType === 'employee' && Number(bonus.employeeId) !== ctx.employee.id) {
    return res.status(403).json({ message: 'غير مصرح لك بالوصول إلى هذه البيانات' });
  }
  return res.json(bonus);
});

apiRouter.patch('/bonuses/:id', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'admin') return res.status(403).json({ message: 'يجب تسجيل الدخول كمسؤول أولاً' });
  const updated = await updateBonus(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ message: 'الزيادة غير موجودة' });
  return res.json(updated);
});

apiRouter.delete('/bonuses/:id', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'admin') return res.status(403).json({ message: 'يجب تسجيل الدخول كمسؤول أولاً' });
  const deleted = await deleteBonus(Number(req.params.id));
  if (!deleted) return res.status(404).json({ message: 'الزيادة غير موجودة' });
  return res.json({ success: true });
});

// Violations Endpoints
apiRouter.get('/violations', async (req, res) => {
  const ctx = await requireAuthenticated(req, res);
  if (!ctx) return;
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listViolations(empId);
  res.json(list);
});

apiRouter.post('/violations', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const record = await createViolation(req.body);
  res.status(201).json(record);
});

apiRouter.get('/violations/:id', async (req, res) => {
  const ctx = await requireAuthenticated(req, res);
  if (!ctx) return;
  const v = await getViolationById(Number(req.params.id));
  if (!v) return res.status(404).json({ message: 'المخالفة غير موجودة' });
  if (ctx.userType === 'employee' && Number(v.employeeId) !== Number(ctx.employee.id)) {
    return res.status(403).json({ message: 'غير مصرح لك بالوصول إلى هذه المخالفة' });
  }
  return res.json(v);
});

apiRouter.patch('/violations/:id', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const existing = await getViolationById(Number(req.params.id));
  if (!existing) return res.status(404).json({ message: 'المخالفة غير موجودة' });
  if (existing.salaryId) {
    const salary = await getSalaryById(Number(existing.salaryId));
    if (salary?.status === 'paid' || salary?.status === 'received') {
      return res.status(409).json({ message: 'لا يمكن تعديل مخالفة مرتبطة براتب مدفوع' });
    }
  }
  const v = await updateViolation(Number(req.params.id), req.body);
  if (!v) return res.status(404).json({ message: 'المخالفة غير موجودة' });
  return res.json(v);
});

apiRouter.delete('/violations/:id', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const existing = await getViolationById(Number(req.params.id));
  if (!existing) return res.status(404).json({ message: 'المخالفة غير موجودة' });
  if (existing.salaryId) {
    const salary = await getSalaryById(Number(existing.salaryId));
    if (salary?.status === 'paid' || salary?.status === 'received') {
      return res.status(409).json({ message: 'لا يمكن حذف مخالفة مرتبطة براتب مدفوع' });
    }
  }
  const deleted = await deleteViolation(Number(req.params.id));
  if (!deleted) return res.status(404).json({ message: 'المخالفة غير موجودة' });
  return res.json({ success: true });
});

// Salaries Endpoints
apiRouter.get('/salaries', async (req, res) => {
  const ctx = await requireAuthenticated(req, res);
  if (!ctx) return;
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listSalaries(empId);
  res.json(list);
});

async function requireSalaryAccess(req: express.Request, res: express.Response, salaryId: number) {
  const ctx = await requireAuthenticated(req, res);
  if (!ctx) return null;
  const salary = await getSalaryById(salaryId);
  if (!salary) {
    res.status(404).json({ message: 'الراتب غير موجود' });
    return null;
  }
  if (ctx.userType === 'employee' && Number(salary.employeeId) !== Number(ctx.employee.id)) {
    res.status(403).json({ message: 'غير مصرح لك بالوصول إلى هذا الراتب' });
    return null;
  }
  return { ctx, salary };
}

function toPayslipPayload(data: Awaited<ReturnType<typeof getSalaryPdfData>>, pdfUrl?: string) {
  if (!data) return null;
  return {
    salary: data.salary,
    employee: data.employee,
    companyName: data.companyName || 'DHD Livraison',
    attendanceRecords: data.attendance,
    advances: data.advances,
    violations: data.violations,
    leaveRequests: data.leaveRequests || [],
    vacationRequests: data.vacationRequests || [],
    bonuses: data.bonuses,
    summary: data.summary,
    pdfUrl,
  };
}

async function getSalaryForPeriod(employeeId: number, month: unknown, year: unknown) {
  const normalizedMonth = String(month || '').padStart(2, '0');
  const numericYear = Number(year);
  const list = await listSalaries(employeeId);
  return (list as any[]).find((salary) =>
    String(salary.month).padStart(2, '0') === normalizedMonth &&
    Number(salary.year) === numericYear,
  ) || null;
}

async function buildSalaryPreview(employeeId: number, month: unknown, year: unknown) {
  const normalizedMonth = String(month || '').padStart(2, '0');
  const numericYear = Number(year);
  const complete = await getSalaryPreviewData(employeeId, normalizedMonth, numericYear);
  if (!complete) return null;
  const payload = toPayslipPayload(complete);
  const summary = complete.summary;
  const previewToken = issuePreviewPdfToken(employeeId, normalizedMonth, numericYear);
  const pdfToken = complete.salary?.id != null ? issuePdfToken(Number(complete.salary.id)) : previewToken;
  return {
    ...payload,
    ...summary,
    salaryId: complete.salary.id,
    month: complete.salary.month,
    year: complete.salary.year,
    baseSalary: Number(summary.baseSalary || 0),
    overtimeBonus: Number(summary.overtimeBonus || 0),
    bonuses: Number(summary.bonusTotal || 0),
    lateDeductions: Number(summary.lateDeduction || 0),
    absenceDeductions: Number(summary.absenceDeduction || 0),
    advanceDeductions: Number(summary.advanceTotal || 0),
    violationDeductions: Number(summary.violationTotal || 0),
    totalDeductions: Number(summary.totalDeductions || 0),
    finalSalary: Number(summary.finalSalary || 0),
    previewState: complete.salary.status === 'paid' || complete.salary.status === 'received'
      ? 'paid'
      : 'review_before_payment',
    previewPdfUrl: complete.salary?.id != null
      ? `/api/salaries/${complete.salary.id}/pdf?t=${pdfToken}`
      : `/api/salaries/preview/pdf?employeeId=${employeeId}&month=${encodeURIComponent(normalizedMonth)}&year=${numericYear}&t=${previewToken}`,
  };
}

apiRouter.get('/employees/:id/salary-history', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const employee = await getEmployeeById(Number(req.params.id));
  if (!employee) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json(await listSalaries(Number(req.params.id)));
});

apiRouter.get('/salaries/upcoming', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const now = new Date();
  const month = String(req.query.month || now.getMonth() + 1).padStart(2, '0');
  const year = Number(req.query.year || now.getFullYear());
  const employeesList = await listEmployees();
  const result = await Promise.all(employeesList.map(async (employee: any) => {
    const salary = await getSalaryForPeriod(Number(employee.id), month, year);
    return {
      employeeId: employee.id,
      employeeName: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
      officeName: employee.officeName || null,
      baseSalary: Number(employee.baseSalary || 0),
      currentMonth: month,
      currentYear: year,
      salaryId: salary?.id || null,
      salaryStatus: salary?.status || 'pending',
      daysRemaining: Math.max(0, Number(employee.paymentDay || 0) - now.getDate()),
    };
  }));
  return res.json(result);
});

apiRouter.get('/salaries/preview', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const employeeId = Number(req.query.employeeId);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return res.status(400).json({ message: 'معرف الموظف غير صالح' });
  }
  const now = new Date();
  const month = String(req.query.month || String(now.getMonth() + 1).padStart(2, '0')).padStart(2, '0');
  const year = Number(req.query.year || now.getFullYear());
  if (!/^(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(year) || year < 2000 || year > 2200) {
    return res.status(400).json({ message: 'فترة الراتب غير صالحة' });
  }
  try {
    const preview = await buildSalaryPreview(employeeId, month, year);
    if (!preview) return res.status(404).json({ message: 'الموظف غير موجود' });
    return res.json(preview);
  } catch (error) {
    console.error('salary preview failed:', error);
    return res.status(500).json({ message: 'تعذر قراءة بيانات الراتب من قاعدة البيانات' });
  }
});

apiRouter.get('/salaries/preview/pdf', async (req, res) => {
  const tokenOk = consumePreviewPdfToken(req.query.t as string | undefined);
  let employeeId = tokenOk ? tokenOk.employeeId : Number(req.query.employeeId);
  let month = tokenOk ? tokenOk.month : String(req.query.month || '').padStart(2, '0');
  let year = tokenOk ? tokenOk.year : Number(req.query.year);

  if (!tokenOk) {
    if (!await requireAdmin(req, res)) return;
  }

  if (!Number.isInteger(employeeId) || employeeId <= 0 ||
      !/^(0[1-9]|1[0-2])$/.test(month) ||
      !Number.isInteger(year) || year < 2000 || year > 2200) {
    return res.status(400).json({ message: 'بيانات فترة الراتب غير صالحة' });
  }
  const data = await getSalaryPreviewData(employeeId, month, year);
  if (!data) return res.status(404).json({ message: 'الموظف غير موجود' });
  return sendPayslipPdf(res, data, req.query.download === '1');
});

apiRouter.post('/salaries/single', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const employeeId = Number(req.body?.employeeId);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return res.status(400).json({ message: 'معرف الموظف غير صالح' });
  }
  const existing = await getSalaryForPeriod(employeeId, req.body?.month, req.body?.year);
  if (existing) return res.json(existing);
  try {
    const created = await createSalary({
      ...req.body,
      employeeId,
    });
    if (!created) return res.status(500).json({ message: 'تعذر إنشاء سجل الراتب' });
    return res.status(201).json(created);
  } catch (error) {
    const concurrent = await getSalaryForPeriod(employeeId, req.body?.month, req.body?.year);
    if (concurrent) return res.json(concurrent);
    throw error;
  }
});

apiRouter.post('/salaries/generate', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const record = await createSalary(req.body);
  res.status(201).json(record);
});

apiRouter.get('/salaries/:id', async (req, res) => {
  const result = await requireSalaryAccess(req, res, Number(req.params.id));
  if (!result) return;
  return res.json(result.salary);
});

// JSON payslip data used by the admin and employee print views.
// Keep this endpoint separate from the printable HTML endpoint so the
// browser-side renderer can produce the same professional document in both
// account types.
apiRouter.get('/salaries/:id/payslip', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'admin') return res.status(401).json({ message: 'يجب تسجيل الدخول كمسؤول أولاً' });
  const salaryId = Number(req.params.id);
  const token = issuePdfToken(salaryId);
  const data = toPayslipPayload(await getSalaryPdfData(salaryId), `/api/salaries/${salaryId}/pdf?t=${token}`);
  if (!data) return res.status(404).json({ message: 'كشف الراتب غير موجود' });
  return res.json(data);
});

async function paySalary(req: express.Request, res: express.Response) {
  if (!await requireAdmin(req, res)) return;
  const salaryId = Number(req.params.id);
  if (!Number.isInteger(salaryId) || salaryId <= 0) {
    return res.status(400).json({ message: 'معرف الراتب غير صالح' });
  }
  try {
    const s = await updateSalaryStatus(salaryId, 'paid');
    if (!s) return res.status(404).json({ message: 'الراتب غير موجود' });
    return res.json({
      ...s,
      ok: true,
      paymentRecord: {
        salaryId: Number(s.id),
        employeeId: Number(s.employeeId),
        amount: Number(s.finalSalary || 0),
        paidAt: s.paidAt,
        status: s.status,
      },
    });
  } catch (error) {
    console.error('salary payment failed:', error);
    return res.status(500).json({ message: 'تعذر تنفيذ دفع الراتب من قاعدة البيانات' });
  }
}

apiRouter.post('/salaries/:id/pay', paySalary);
apiRouter.patch('/salaries/:id/pay', paySalary);

async function postponeSalary(req: express.Request, res: express.Response) {
  if (!await requireAdmin(req, res)) return;
  const salaryId = Number(req.params.id);
  if (!Number.isInteger(salaryId) || salaryId <= 0) {
    return res.status(400).json({ message: 'معرف الراتب غير صالح' });
  }
  try {
    const current = await getSalaryById(salaryId);
    if (!current) return res.status(404).json({ message: 'الراتب غير موجود' });
    if (current.status === 'paid' || current.status === 'received') {
      return res.status(409).json({ message: 'لا يمكن تعديل راتب تم دفعه' });
    }
    let postponedUntil = req.body?.postponedUntil;
    if (!postponedUntil && req.body?.days != null) {
      const days = Number(req.body.days);
      if (!Number.isInteger(days) || days < 1 || days > 31) {
        return res.status(400).json({ message: 'مدة التأجيل يجب أن تكون بين 1 و31 يومًا' });
      }
      postponedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }
    if (!postponedUntil) {
      return res.status(400).json({ message: 'يجب تحديد مدة أو تاريخ التأجيل' });
    }
    const parsedPostponedUntil = new Date(postponedUntil);
    if (Number.isNaN(parsedPostponedUntil.getTime())) {
      return res.status(400).json({ message: 'تاريخ التأجيل غير صالح' });
    }
    const s = await updateSalaryStatus(salaryId, 'postponed', {
      postponedUntil: parsedPostponedUntil.toISOString(),
    });
    if (!s) return res.status(404).json({ message: 'الراتب غير موجود' });
    return res.json({ ...s, ok: true });
  } catch (error) {
    console.error('salary postponement failed:', error);
    return res.status(500).json({ message: 'تعذر تأجيل الراتب من قاعدة البيانات' });
  }
}

apiRouter.post('/salaries/:id/postpone', postponeSalary);
apiRouter.patch('/salaries/:id/postpone', postponeSalary);

// PDF payslip — a real PDF stream that can be opened, downloaded, and printed
apiRouter.get('/salaries/:id/pdf', async (req, res) => {
  const salaryId = Number(req.params.id);
  // Accept a short-lived token so window.open() works without relying on cookies
  const tokenOk = consumePdfToken(req.query.t as string | undefined, salaryId);
  if (!tokenOk) {
    const access = await requireSalaryAccess(req, res, salaryId);
    if (!access) return;
  }
  const data = await getSalaryPdfData(salaryId);
  if (!data) return res.status(404).json({ message: 'كشف الراتب غير موجود' });
  return sendPayslipPdf(res, data, req.query.download === '1');
});

// Create notification — admin only
apiRouter.post('/notifications', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'admin') return res.status(403).json({ message: 'يجب تسجيل الدخول كمسؤول أولاً' });
  try {
    const { type, message, recipientType, recipientEmployeeId, referenceId, referenceIdType } = req.body || {};
    const record = await createNotificationRecord({
      type,
      message,
      recipientType,
      recipientEmployeeId: recipientEmployeeId ? Number(recipientEmployeeId) : null,
      referenceId: referenceId ? Number(referenceId) : null,
      referenceIdType: referenceIdType || null,
    });
    if (!record) return res.status(500).json({ message: 'تعذر إنشاء الإشعار' });
    return res.status(201).json(record);
  } catch (err: any) {
    return res.status(500).json({ message: 'تعذر إنشاء الإشعار', error: String(err?.message || '') });
  }
});

// Notifications
function notificationTargetPath(notification: { type?: string | null; recipientType?: string | null }) {
  if (notification.recipientType === 'employee') {
    switch (notification.type) {
      case 'advance_request':
      case 'advance_approved':
      case 'advance_rejected':
      case 'leave_request':
      case 'leave_approved':
      case 'leave_rejected':
      case 'vacation_request':
      case 'vacation_approved':
      case 'vacation_rejected':
        return '/portal/requests';
      case 'violation_added':
      case 'violation_updated':
      case 'violation_deduction':
        return '/portal/violations';
      case 'salary_due':
      case 'salary_paid':
      case 'salary_postponed':
      case 'salary_received':
        return '/portal/account';
      case 'attendance_alert':
      case 'late_alert':
        return '/portal';
      default:
        return '/portal';
    }
  }

  switch (notification.type) {
    case 'advance_request':
    case 'advance_approved':
    case 'advance_rejected':
    case 'leave_request':
    case 'leave_approved':
    case 'leave_rejected':
    case 'vacation_request':
    case 'vacation_approved':
    case 'vacation_rejected':
      return '/requests';
    case 'violation_added':
    case 'violation_updated':
      return '/violations';
    case 'salary_due':
    case 'salary_paid':
    case 'salary_postponed':
      return '/salaries';
    case 'attendance_alert':
    case 'late_alert':
      return '/attendance';
    default:
      return '/dashboard';
  }
}

function withNotificationTarget(notification: any) {
  return {
    ...notification,
    targetPath: notificationTargetPath(notification),
  };
}

apiRouter.get('/notifications/stream', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });

  const recipientType = ctx.userType === 'employee' ? 'employee' : 'admin';
  const recipientEmployeeId = ctx.userType === 'employee' ? Number(ctx.employee.id) : null;
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`retry: 3000\n\n`);

  const isForThisUser = (notification: any) =>
    notification.recipientType === recipientType &&
    (recipientType !== 'employee' ||
      Number(notification.recipientEmployeeId) === recipientEmployeeId);
  const send = (notification: any) => {
    if (!isForThisUser(notification) || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(withNotificationTarget(notification))}\n\n`);
  };
  const unsubscribe = subscribeToNotifications(send);
  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
  return res;
});

apiRouter.get('/notifications', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const recipientType = ctx.userType === 'employee' ? 'employee' : 'admin';
  const recipientId = ctx.userType === 'employee' ? ctx.employee.id : undefined;
  const list = await listNotifications(recipientType, recipientId);
  return res.json(list.map(withNotificationTarget));
});

apiRouter.get('/push/public-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    return res.status(503).json({ enabled: false, message: 'Push Notifications غير مهيأة بعد' });
  }
  return res.json({ enabled: true, publicKey });
});

apiRouter.post('/push/subscribe', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const subscription = req.body?.subscription || req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ message: 'بيانات اشتراك Push غير صالحة' });
  }
  const saved = await savePushSubscription({
    endpoint: String(subscription.endpoint),
    p256dh: String(subscription.keys.p256dh),
    auth: String(subscription.keys.auth),
    userType: ctx.userType === 'employee' ? 'employee' : 'admin',
    employeeId: ctx.userType === 'employee' ? ctx.employee.id : null,
  });
  return res.status(201).json({ success: Boolean(saved) });
});

apiRouter.delete('/push/subscribe', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  if (req.body?.endpoint) {
    await deletePushSubscription(
      String(req.body.endpoint),
      ctx.userType === 'employee' ? 'employee' : 'admin',
      ctx.userType === 'employee' ? ctx.employee.id : null,
    );
  }
  return res.json({ success: true });
});

apiRouter.get('/announcements', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'admin') return res.status(403).json({ message: 'يجب تسجيل الدخول كمسؤول أولاً' });
  return res.json(await listAnnouncements());
});

apiRouter.post('/announcements', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'admin') return res.status(403).json({ message: 'يجب تسجيل الدخول كمسؤول أولاً' });
  try {
    const adminId = ctx.admin?.id;
    const { title, body, severity, durationSeconds, audience, employeeIds, allowDismiss } = req.body || {};
    if (!String(title || '').trim() || !String(body || '').trim()) {
      return res.status(400).json({ message: 'العنوان ونص الإعلان مطلوبان' });
    }
    if (audience === 'selected' && (!Array.isArray(employeeIds) || employeeIds.length === 0)) {
      return res.status(400).json({ message: 'اختر موظفًا واحدًا على الأقل' });
    }
    const created = await createAnnouncement({
      title,
      body,
      severity,
      durationSeconds,
      audience,
      employeeIds,
      allowDismiss,
      createdByAdminId: adminId,
    });
    return res.status(201).json(created);
  } catch (error: any) {
    console.error('[announcements] publish failed:', error);
    return res.status(500).json({
      message: 'تعذر حفظ الإعلان في قاعدة البيانات. لم يتم نشر الإعلان.',
    });
  }
});

apiRouter.patch('/announcements/:id', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'admin') return res.status(403).json({ message: 'يجب تسجيل الدخول كمسؤول أولاً' });
  const updated = await updateAnnouncement(Number(req.params.id), req.body || {});
  if (!updated) return res.status(404).json({ message: 'الإعلان غير موجود' });
  return res.json(updated);
});

apiRouter.delete('/announcements/:id', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'admin') return res.status(403).json({ message: 'يجب تسجيل الدخول كمسؤول أولاً' });
  const deleted = await deleteAnnouncement(Number(req.params.id));
  if (!deleted) return res.status(404).json({ message: 'الإعلان غير موجود' });
  return res.json({ success: true });
});

apiRouter.post('/notifications/read-all', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const recipientType = ctx.userType === 'employee' ? 'employee' : 'admin';
  const recipientId = ctx.userType === 'employee' ? ctx.employee.id : undefined;
  await markNotificationsRead(recipientType, recipientId);
  return res.json({ success: true });
});

apiRouter.post('/notifications/:id/read', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const recipientType = ctx.userType === 'employee' ? 'employee' : 'admin';
  const recipientId = ctx.userType === 'employee' ? ctx.employee.id : undefined;
  const n = await markSingleNotificationRead(Number(req.params.id), recipientType, recipientId);
  if (!n) return res.status(404).json({ message: 'الإشعار غير موجود' });
  return res.json({ success: true, notification: n });
});

apiRouter.patch('/notifications/:id/read', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const recipientType = ctx.userType === 'employee' ? 'employee' : 'admin';
  const recipientId = ctx.userType === 'employee' ? ctx.employee.id : undefined;
  const n = await markSingleNotificationRead(Number(req.params.id), recipientType, recipientId);
  if (!n) return res.status(404).json({ message: 'الإشعار غير موجود' });
  return res.json({ success: true, notification: n });
});

apiRouter.delete('/notifications/:id', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const recipientType = ctx.userType === 'employee' ? 'employee' : 'admin';
  const recipientId = ctx.userType === 'employee' ? ctx.employee.id : undefined;
  const deleted = await deleteNotification(Number(req.params.id), recipientType, recipientId);
  if (!deleted) return res.status(404).json({ message: 'الإشعار غير موجود' });
  return res.json({ success: true, notification: deleted });
});

apiRouter.delete('/notifications', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const recipientType = ctx.userType === 'employee' ? 'employee' : 'admin';
  const recipientId = ctx.userType === 'employee' ? ctx.employee.id : undefined;
  const deleted = await deleteAllNotifications(recipientType, recipientId);
  if (!deleted) return res.status(500).json({ message: 'تعذر حذف صندوق الإشعارات' });
  return res.json({ success: true });
});

// Settings
apiRouter.get('/settings', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const s = await getSettings();
  res.json(s);
});

apiRouter.patch('/settings', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const s = await updateSettings(req.body);
  res.json(s);
});

// Statistics
apiRouter.get('/stats/dashboard', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const stats = await getDashboardStats();
  res.json(stats);
});

apiRouter.get('/stats/office', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const officesList = await listOffices();
  const employeesList = await listEmployees();
  const result = officesList.map((o: any) => ({
    officeId: o.id,
    officeName: o.name,
    employeeCount: employeesList.filter((e: any) => e.officeId === o.id).length
  }));
  res.json(result);
});

apiRouter.get('/stats/attendance-chart', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const days = Number(req.query.days || 7);
  const data = await getAttendanceChartData(Math.min(Math.max(days, 3), 90));
  res.json(data);
});

apiRouter.get('/stats/salary-chart', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const data = await getSalaryChartData();
  res.json(data);
});

// Admin: manually trigger the auto-absence marker
apiRouter.post('/admin/mark-absences', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'admin') return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول كمسؤول' });
  try {
    const count = await markAutoAbsences(Number(req.query.days || 30));
    return res.json({ success: true, markedCount: count, message: `تم تسجيل ${count} غياب تلقائي` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'فشل التحديث' });
  }
});

// Unified requests endpoint with optional status filter
apiRouter.get('/requests', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listAllRequests({ status, employeeId });
  return res.json(list);
});

apiRouter.get('/requests/pending', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const list = await listAllRequests({ status: 'pending' });
  return res.json(list);
});

apiRouter.get('/requests/approved', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const list = await listAllRequests({ status: 'approved' });
  return res.json(list);
});

apiRouter.get('/requests/rejected', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const list = await listAllRequests({ status: 'rejected' });
  return res.json(list);
});

app.use('/api', apiRouter);

// The imported employee bundle prefixes its self-service calls with /api.
// Keep these aliases beside the original /employee routes so the old portal
// can authenticate and load its own data without a second page or redirect.
apiRouter.get('/employee/me', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  return res.json(ctx.employee);
});

apiRouter.post('/employee/auth/logout', (req, res) => {
  res.clearCookie('employee_token');
  return res.json({ success: true });
});

apiRouter.get('/employee/attendance', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  return res.json(await listAttendance(ctx.employee.id));
});

apiRouter.post('/employee/attendance/:action', employeeAttendanceAction);

apiRouter.get('/employee/violations', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  return res.json(await listViolations(ctx.employee.id));
});

apiRouter.get('/employee/salary-balance', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  return res.json(await getEmployeeSalaryBalance(ctx.employee.id));
});

apiRouter.get('/employee/salaries', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  return res.json(await listSalaries(ctx.employee.id));
});

async function getEmployeePayslip(req: express.Request, res: express.Response) {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const list = await listSalaries(ctx.employee.id);
  const requestedValue = String(req.params.month);
  const payslip = (list as any[]).find((salary: any) =>
    String(salary.id) === requestedValue ||
    String(salary.month) === requestedValue,
  );
  if (!payslip) return res.status(404).json({ message: 'لم يتم العثور على كشف الراتب' });
  const salaryId = Number(payslip.id);
  const token = issuePdfToken(salaryId);
  const data = toPayslipPayload(
    await getSalaryPdfData(salaryId),
    `/api/employee/salaries/${salaryId}/pdf?t=${token}`,
  );
  if (!data) return res.status(404).json({ message: 'كشف الراتب غير موجود' });
  return res.json(data);
}

async function getEmployeePayslipPdf(req: express.Request, res: express.Response) {
  const salaryId = Number(req.params.id);
  // Accept a short-lived token so window.open() works without relying on cookies
  const tokenOk = consumePdfToken(req.query.t as string | undefined, salaryId);
  if (!tokenOk) {
    const ctx = await getAuthContext(req);
    if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
    const data = await getSalaryPdfData(salaryId);
    if (!data) return res.status(404).json({ message: 'كشف الراتب غير موجود' });
    if (Number(data.salary.employeeId) !== Number(ctx.employee.id)) {
      return res.status(403).json({ message: 'غير مصرح لك بعرض هذا الكشف' });
    }
    return sendPayslipPdf(res, data, req.query.download === '1');
  }
  const data = await getSalaryPdfData(salaryId);
  if (!data) return res.status(404).json({ message: 'كشف الراتب غير موجود' });
  return sendPayslipPdf(res, data, req.query.download === '1');
}

// The imported employee bundle prefixes all of its calls with /api.
apiRouter.get('/employee/salaries/:month/payslip', getEmployeePayslip);
apiRouter.get('/employee/salaries/:id/pdf', getEmployeePayslipPdf);
apiRouter.post('/employee/salaries/:id/receive', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  try {
    const updated = await markSalaryReceived(Number(req.params.id), ctx.employee.id);
    return res.json({ ...updated, ok: true });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'تعذر تأكيد استلام الراتب' });
  }
});
apiRouter.patch('/employee/salaries/:id/receive', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  try {
    const updated = await markSalaryReceived(Number(req.params.id), ctx.employee.id);
    return res.json({ ...updated, ok: true });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'تعذر تأكيد استلام الراتب' });
  }
});

apiRouter.get('/employee/requests', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const [advancesList, leaveList, vacationList] = await Promise.all([
    listAdvances(ctx.employee.id),
    listLeaveRequests(ctx.employee.id),
    listVacationRequests(ctx.employee.id),
  ]);
  return res.json({ advances: advancesList, leaveRequests: leaveList, vacationRequests: vacationList });
});

apiRouter.post('/employee/requests/advance', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const record = await createAdvance({ ...req.body, employeeId: ctx.employee.id });
  return res.status(201).json(record);
});

apiRouter.post('/employee/requests/leave', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const record = await createLeaveRequest({ ...req.body, employeeId: ctx.employee.id });
  return res.status(201).json(record);
});

apiRouter.post('/employee/requests/vacation', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const record = await createVacationRequest({ ...req.body, employeeId: ctx.employee.id });
  return res.status(201).json(record);
});

apiRouter.get('/employee/notifications', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  return res.json((await listNotifications('employee', ctx.employee.id)).map(withNotificationTarget));
});

apiRouter.get('/employee/announcements', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  return res.json(await listEmployeeAnnouncements(ctx.employee.id));
});

apiRouter.post('/employee/announcements/:id/read', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  await markAnnouncementRead(Number(req.params.id), ctx.employee.id);
  return res.json({ success: true });
});

apiRouter.post('/employee/notifications/read-all', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  await markNotificationsRead('employee', ctx.employee.id);
  return res.json({ success: true });
});

apiRouter.patch('/employee/notifications/read-all', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  await markNotificationsRead('employee', ctx.employee.id);
  return res.json({ success: true });
});

apiRouter.post('/employee/notifications/:id/read', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const notification = await markSingleNotificationRead(Number(req.params.id), 'employee', ctx.employee.id);
  if (!notification) return res.status(404).json({ message: 'الإشعار غير موجود' });
  return res.json({ success: true, notification });
});

apiRouter.patch('/employee/notifications/:id/read', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const notification = await markSingleNotificationRead(Number(req.params.id), 'employee', ctx.employee.id);
  if (!notification) return res.status(404).json({ message: 'الإشعار غير موجود' });
  return res.json({ success: true, notification });
});

apiRouter.delete('/employee/notifications/:id', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const notification = await deleteNotification(Number(req.params.id), 'employee', ctx.employee.id);
  if (!notification) return res.status(404).json({ message: 'الإشعار غير موجود' });
  return res.json({ success: true, notification });
});

apiRouter.delete('/employee/notifications', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const deleted = await deleteAllNotifications('employee', ctx.employee.id);
  if (!deleted) return res.status(500).json({ message: 'تعذر حذف صندوق الإشعارات' });
  return res.json({ success: true });
});

// Employee portal compatibility routes — all /employee/* paths used by the WebView
app.get('/employee/me', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  return res.json(ctx.employee);
});

app.post('/employee/auth/logout', (req, res) => {
  res.clearCookie('employee_token');
  res.json({ success: true });
});

app.get('/employee/notifications', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const list = (await listNotifications('employee', ctx.employee.id)).map(withNotificationTarget);
  return res.json(list);
});

app.post('/employee/notifications/read-all', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  await markNotificationsRead('employee', ctx.employee.id);
  return res.json({ success: true });
});

app.post('/employee/notifications/:id/read', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const n = await markSingleNotificationRead(Number(req.params.id), 'employee', ctx.employee.id);
  if (!n) return res.status(404).json({ message: 'الإشعار غير موجود' });
  return res.json({ success: true, notification: n });
});

app.delete('/employee/notifications/:id', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const n = await deleteNotification(Number(req.params.id), 'employee', ctx.employee.id);
  if (!n) return res.status(404).json({ message: 'الإشعار غير موجود' });
  return res.json({ success: true, notification: n });
});

app.delete('/employee/notifications', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (!ctx || ctx.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const deleted = await deleteAllNotifications('employee', ctx.employee.id);
  if (!deleted) return res.status(500).json({ message: 'تعذر حذف صندوق الإشعارات' });
  return res.json({ success: true });
});

app.get('/employee/salaries', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const list = await listSalaries(ctx.employee.id);
  return res.json(list);
});

app.get('/employee/salaries/:month/payslip', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const list = await listSalaries(ctx.employee.id);
  const requestedValue = String(req.params.month);
  // The employee bundle historically sent the salary id, while older
  // versions sent the month. Accept both forms and always return the full
  // payslip payload expected by the print renderer.
  const payslip = (list as any[]).find((s: any) =>
    String(s.id) === requestedValue ||
    String(s.month) === requestedValue
  );
  if (!payslip) return res.status(404).json({ message: 'لم يتم العثور على كشف الراتب' });

  const data = toPayslipPayload(
    await getSalaryPdfData(Number(payslip.id)),
    `/employee/salaries/${Number(payslip.id)}/pdf?t=${issuePdfToken(Number(payslip.id))}`,
  );
  if (!data) return res.status(404).json({ message: 'كشف الراتب غير موجود' });
  return res.json(data);
});

// Employee PDF payslip by salary ID
app.get('/employee/salaries/:id/pdf', async (req, res) => {
  const salaryId = Number(req.params.id);
  const tokenOk = consumePdfToken(req.query.t as string | undefined, salaryId);
  const ctx = tokenOk ? null : await getAuthContext(req);
  if (!tokenOk && ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const data = await getSalaryPdfData(salaryId);
  if (!data) return res.status(404).json({ message: 'كشف الراتب غير موجود' });
  // Ensure employee only sees own payslips
  if (!tokenOk && Number(data.salary.employeeId) !== Number(ctx!.employee.id)) {
    return res.status(403).json({ message: 'غير مصرح لك بعرض هذا الكشف' });
  }
  return sendPayslipPdf(res, data, req.query.download === '1');
});

app.post('/employee/salaries/:id/receive', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  try {
    const updated = await markSalaryReceived(Number(req.params.id), ctx.employee.id);
    return res.json({ ...updated, ok: true });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'تعذر تأكيد استلام الراتب' });
  }
});

app.get('/employee/salary-balance', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const balance = await getEmployeeSalaryBalance(ctx.employee.id);
  return res.json(balance);
});

app.get('/employee/requests', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const [adv, leaves, vacations] = await Promise.all([
    listAdvances(ctx.employee.id),
    listLeaveRequests(ctx.employee.id),
    listVacationRequests(ctx.employee.id)
  ]);
  return res.json({ advances: adv, leaveRequests: leaves, vacationRequests: vacations });
});

app.post('/employee/requests/advance', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const record = await createAdvance({ ...req.body, employeeId: ctx.employee.id });
  return res.status(201).json(record);
});

app.post('/employee/requests/leave', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const record = await createLeaveRequest({ ...req.body, employeeId: ctx.employee.id });
  return res.status(201).json(record);
});

app.post('/employee/requests/vacation', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const record = await createVacationRequest({ ...req.body, employeeId: ctx.employee.id });
  return res.status(201).json(record);
});

app.get('/employee/violations', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const list = await listViolations(ctx.employee.id);
  return res.json(list);
});

// Compatibility routes used by the imported employee WebView. They retain the
// original paths while delegating identity and QR validation to the same DB
// backed functions as the admin API.
app.get('/employee/attendance', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const list = await listAttendance(ctx.employee.id);
  return res.json(list);
});

async function employeeAttendanceAction(req: express.Request, res: express.Response) {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  if (req.params.action !== 'checkin' && req.params.action !== 'checkout') {
    return res.status(404).json({ message: 'عملية حضور غير معروفة' });
  }

  const qrValue = normalizeQrValue(req.body?.qrToken ?? req.body?.qrCodeData);
  const office = await getOfficeByQrSecret(qrValue);
  if (!office) return res.status(401).json({ code: 'invalid_qr', message: 'رمز المكتب غير صالح' });
  if (ctx.employee.officeId != null && Number(ctx.employee.officeId) !== Number(office.id)) {
    return res.status(403).json({ code: 'wrong_office', message: 'رمز QR يخص مكتباً آخر' });
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const existing = (await listAttendance(ctx.employee.id)).find((item: any) => String(item.date).slice(0, 10) === date);
  if (req.params.action === 'checkin' && existing?.checkInTime) {
    return res.status(409).json({ code: 'already_checked_in', message: 'تم تسجيل الحضور مسبقاً اليوم' });
  }
  if (req.params.action === 'checkout' && (!existing || existing.checkOutTime)) {
    return res.status(409).json({ code: 'already_checked_out', message: 'لا يوجد تسجيل حضور مفتوح اليوم' });
  }
  if (!existing && req.params.action === 'checkout') {
    return res.status(409).json({ code: 'already_checked_out', message: 'لا يوجد تسجيل حضور مفتوح اليوم' });
  }

  // GPS distance check — use office-configured geofence radius (default 150 m)
  const empLat = parseFloat(String(req.body?.latitude ?? ''));
  const empLng = parseFloat(String(req.body?.longitude ?? ''));
  if (!Number.isFinite(empLat) || !Number.isFinite(empLng) || empLat < -90 || empLat > 90 || empLng < -180 || empLng > 180) {
    return res.status(403).json({ code: 'gps_required', message: 'يجب تفعيل GPS وتحديد موقعك الجغرافي' });
  }
  const officeLat = parseFloat(String(office.latitude || '0'));
  const officeLng = parseFloat(String(office.longitude || '0'));
  if (!Number.isFinite(officeLat) || !Number.isFinite(officeLng) || officeLat < -90 || officeLat > 90 || officeLng < -180 || officeLng > 180) {
    return res.status(500).json({ code: 'office_location_invalid', message: 'موقع المكتب غير مهيأ بشكل صحيح' });
  }
  const geofenceRadius = Number(office.geofenceRadiusMeters || 150);
  const distM = haversineMeters(empLat, empLng, officeLat, officeLng);
  if (distM > geofenceRadius) {
    return res.status(403).json({
      code: 'out_of_range',
      message: `أنت خارج نطاق المكتب (${Math.round(distM)} متر). الحد المسموح: ${geofenceRadius} متر`,
      distance: Math.round(distM),
      radius: geofenceRadius,
    });
  }

  if (req.params.action === 'checkin') {
    const record = await recordAttendance({
      employeeId: ctx.employee.id,
      officeId: office.id,
      date,
      checkInTime: now.toTimeString().slice(0, 8),
      latitude: empLat,
      longitude: empLng
    });
    return res.status(201).json({ ...record, ok: true });
  }

  if (Number(existing!.officeId) !== Number(office.id)) {
    return res.status(403).json({ code: 'wrong_office', message: 'يجب تسجيل الانصراف من مكتب الحضور نفسه' });
  }

  const updated = await completeAttendance(existing!.id, {
    checkOutTime: now.toTimeString().slice(0, 8),
    latitude: empLat,
    longitude: empLng
  });
  return res.json({ ...updated, ok: true });
}

app.post('/employee/attendance/:action', employeeAttendanceAction);

const PDF_FONT_REGULAR = '/usr/share/fonts/truetype/freefont/FreeSans.ttf';
const PDF_FONT_BOLD = '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf';
const PDF_LOGO_CANDIDATES = [
  path.resolve(process.cwd(), 'artifacts/dhd-livraison/public/assets/1000034141-removebg-preview_1785699198526-C-34cSbP.png'),
  path.resolve(process.cwd(), 'attached_assets/1000034141-removebg-preview_1786535542080.png'),
  path.resolve(process.cwd(), 'public/assets/1000034141-removebg-preview_1785699198526-C-34cSbP.png'),
];

function pdfText(value: unknown, fallback = '—') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function pdfAmount(value: unknown) {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount.toLocaleString('ar-DZ') : '0'} دج`;
}

function pdfDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? pdfText(value) : date.toLocaleDateString('ar-DZ');
}

function pdfMonth(month: unknown, year: unknown) {
  const months: Record<string, string> = {
    '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل',
    '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس',
    '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر',
  };
  const key = String(month ?? '').padStart(2, '0');
  return `${months[key] || pdfText(month)} ${pdfText(year)}`;
}

function pdfFontPath(bold = false) {
  const candidate = bold ? PDF_FONT_BOLD : PDF_FONT_REGULAR;
  return fs.existsSync(candidate) ? candidate : bold ? 'Helvetica-Bold' : 'Helvetica';
}

function sendPayslipPdf(res: express.Response, data: any, download = false) {
  const { salary, employee, summary } = data;
  const isPaid = salary.status === 'paid' || salary.status === 'received';
  const employeeName = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim();
  const period = pdfMonth(salary.month, salary.year);
  const fileName = `كشف-راتب-${employee?.serialNumber || employee?.id || salary.id}-${salary.month}-${salary.year}.pdf`;
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 42, bottom: 52, left: 42, right: 42 },
    info: {
      Title: `${isPaid ? 'كشف راتب' : 'معاينة كشف راتب قبل الدفع'} - ${employeeName || 'موظف'} - ${period}`,
      Author: data.companyName || 'DHD Livraison',
      Subject: isPaid ? 'كشف راتب رسمي مدفوع' : 'معاينة كشف راتب غير مدفوعة',
    },
  });

  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const navy = '#12355B';
  const blue = '#1E6BB8';
  const pale = '#F3F7FB';
  const border = '#D9E2EC';
  const text = '#1F2937';
  const muted = '#64748B';
  const red = '#B42318';
  const green = '#15803D';

  const write = (value: unknown, x: number, y: number, width: number, options: any = {}) => {
    doc.text(pdfText(value), x, y, {
      width,
      align: 'right',
      lineBreak: false,
      ...options,
    });
  };
  const line = (y: number, color = border) => {
    doc.save().moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y)
      .lineWidth(0.7).strokeColor(color).stroke().restore();
  };
  const sectionTitle = (title: string) => {
    if (doc.y > doc.page.height - 150) doc.addPage();
    const y = doc.y;
    doc.roundedRect(doc.page.margins.left, y, pageWidth, 25, 4).fill(pale);
    doc.rect(doc.page.width - doc.page.margins.right - 4, y, 4, 25).fill(blue);
    doc.font(pdfFontPath(true)).fontSize(11).fillColor(navy);
    write(title, doc.page.margins.left + 12, y + 7, pageWidth - 24);
    doc.y = y + 36;
  };
  const tableHeader = (columns: Array<{ label: string; width: number }>) => {
    const y = doc.y;
    doc.rect(doc.page.margins.left, y, pageWidth, 23).fill(navy);
    let x = doc.page.margins.left;
    doc.font(pdfFontPath(true)).fontSize(8).fillColor('#FFFFFF');
    columns.forEach((column) => {
      write(column.label, x + 5, y + 7, column.width - 10, { align: 'right' });
      x += column.width;
    });
    doc.y = y + 23;
  };
  const tableRow = (values: Array<unknown>, columns: Array<{ label: string; width: number }>, color = text) => {
    if (doc.y > doc.page.height - 75) {
      doc.addPage();
      tableHeader(columns);
    }
    const y = doc.y;
    doc.font(pdfFontPath(false)).fontSize(8).fillColor(color);
    let x = doc.page.margins.left;
    columns.forEach((column, index) => {
      write(values[index], x + 5, y + 7, column.width - 10);
      x += column.width;
    });
    line(y + 22);
    doc.y = y + 23;
  };
  const metric = (label: string, value: unknown, x: number, y: number, width: number, fill: string, valueColor = text) => {
    doc.roundedRect(x, y, width, 48, 5).fill(fill);
    doc.font(pdfFontPath(false)).fontSize(8).fillColor(muted);
    write(label, x + 8, y + 9, width - 16);
    doc.font(pdfFontPath(true)).fontSize(13).fillColor(valueColor);
    write(value, x + 8, y + 24, width - 16);
  };

  // Formal header with the real DHD logo when it is available.
  doc.roundedRect(doc.page.margins.left, doc.y, pageWidth, 92, 8).fill(navy);
  const headerY = doc.y;
  const logoPath = PDF_LOGO_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (logoPath) {
    try {
      doc.image(logoPath, doc.page.margins.left + 16, headerY + 16, { fit: [70, 60], align: 'center', valign: 'center' });
    } catch {
      // The PDF remains valid if an optional logo asset is unavailable.
    }
  }
  doc.font(pdfFontPath(true)).fontSize(19).fillColor('#FFFFFF');
  write(data.companyName || 'DHD Livraison', doc.page.margins.left + 98, headerY + 19, pageWidth - 120);
  doc.font(pdfFontPath(false)).fontSize(9).fillColor('#D9E8F7');
  write(isPaid ? 'كشف راتب رسمي ومفصل' : 'معاينة كشف الراتب قبل الدفع — غير مدفوع', doc.page.margins.left + 98, headerY + 47, pageWidth - 120);
  write(`الفترة: ${period}`, doc.page.margins.left + 98, headerY + 64, pageWidth - 120);
  doc.y = headerY + 108;

  sectionTitle('بيانات الموظف');
  const infoColumns = [
    ['اسم الموظف', employeeName],
    ['رقم / معرف الموظف', employee?.serialNumber || employee?.employeeCode || employee?.id],
    ['المسمى الوظيفي', employee?.position || employee?.role],
    ['المكتب', employee?.officeName],
    ['فترة الكشف', period],
    ['حالة الراتب', isPaid ? 'مدفوع ومقفل' : salary.status === 'postponed' ? 'مؤجل — قيد المراجعة' : 'قيد المراجعة قبل الدفع'],
  ];
  const infoWidth = pageWidth / 2;
  infoColumns.forEach(([label, value], index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const x = doc.page.margins.left + col * infoWidth;
    const y = doc.y + row * 31;
    doc.font(pdfFontPath(false)).fontSize(8).fillColor(muted);
    write(label, x + 8, y, infoWidth - 16);
    doc.font(pdfFontPath(true)).fontSize(9).fillColor(text);
    write(value, x + 8, y + 12, infoWidth - 16);
    if (col === 1) line(y + 28);
  });
  doc.y += Math.ceil(infoColumns.length / 2) * 31 + 12;

  sectionTitle('ملخص الحضور والعمل');
  const metricWidth = (pageWidth - 18) / 4;
  [
    ['أيام العمل', summary.workDays ?? (summary.presentDays + summary.absentDays), `${summary.workDays ?? (summary.presentDays + summary.absentDays)} يوم`, pale, text],
    ['أيام الحضور', summary.presentDays, `${summary.presentDays} يوم`, '#ECFDF3', green],
    ['أيام الغياب', summary.absentDays, `${summary.absentDays} يوم`, '#FFF1F2', red],
    ['أيام التأخير', summary.lateDays, `${summary.lateDays} يوم`, '#FFFBEB', '#A16207'],
  ].forEach(([label, _value, display, fill, valueColor], index) => {
    metric(String(label), display, doc.page.margins.left + index * (metricWidth + 6), doc.y, metricWidth, String(fill), String(valueColor));
  });
  doc.y += 62;
  const attendanceColumns = [
    { label: 'التاريخ', width: pageWidth * 0.19 },
    { label: 'الدخول', width: pageWidth * 0.15 },
    { label: 'الخروج', width: pageWidth * 0.15 },
    { label: 'ساعات العمل', width: pageWidth * 0.18 },
    { label: 'التأخير', width: pageWidth * 0.14 },
    { label: 'الحالة', width: pageWidth * 0.19 },
  ];
  tableHeader(attendanceColumns);
  const attendanceRecords = data.attendance || [];
  if (attendanceRecords.length === 0) {
    tableRow(['لا توجد سجلات حضور مسجلة لهذه الفترة', '', '', '', '', ''], attendanceColumns, muted);
  } else {
    attendanceRecords.forEach((record: any) => {
      tableRow([
        record.date,
        record.checkInTime,
        record.checkOutTime,
        `${(Number(record.workedMinutes || 0) / 60).toFixed(1)} س`,
        Number(record.lateMinutes || 0) > 0 ? `${record.lateMinutes} د` : '—',
        record.isAbsent ? 'غائب' : Number(record.lateMinutes || 0) > 0 ? 'متأخر' : 'حاضر',
      ], attendanceColumns, record.isAbsent ? red : text);
    });
  }
  doc.y += 12;
  doc.font(pdfFontPath(false)).fontSize(8).fillColor(muted);
  write(`إجمالي ساعات العمل: ${(summary.workedHours || 0).toFixed(1)} س   |   إجمالي التأخير: ${summary.lateMinutes || 0} دقيقة   |   الوقت الإضافي: ${(summary.overtimeHours || 0).toFixed(1)} س`, doc.page.margins.left, doc.y, pageWidth);
  doc.y += 24;

  sectionTitle('تفاصيل الراتب والبدلات والخصومات');
  const breakdownColumns = [
    { label: 'البند', width: pageWidth * 0.68 },
    { label: 'المبلغ', width: pageWidth * 0.32 },
  ];
  tableHeader(breakdownColumns);
  const breakdownRows: Array<[string, string, string]> = [
    ['الراتب الأساسي', pdfAmount(summary.baseSalary), green],
    ['الوقت الإضافي', `+ ${pdfAmount(summary.overtimeBonus)}`, green],
    ['الزيادات / المكافآت', `+ ${pdfAmount(summary.bonusTotal)}`, green],
    ['خصم التأخير', `- ${pdfAmount(summary.lateDeduction)}`, red],
    ['خصم الغياب', `- ${pdfAmount(summary.absenceDeduction)}`, red],
    ['خصم السلف', `- ${pdfAmount(summary.advanceTotal)}`, red],
    ['خصم المخالفات', `- ${pdfAmount(summary.violationTotal)}`, red],
    ['خصومات أخرى', `- ${pdfAmount(summary.otherDeductions)}`, red],
    ['إجمالي الخصومات', `- ${pdfAmount(summary.totalDeductions)}`, navy],
  ];
  breakdownRows.forEach(([label, amount, color]) => tableRow([label, amount], breakdownColumns, color));
  tableRow(['صافي الراتب النهائي', pdfAmount(summary.finalSalary)], breakdownColumns, navy);

  const detailTable = (title: string, columns: Array<{ label: string; width: number }>, rows: unknown[][], empty: string) => {
    doc.y += 16;
    sectionTitle(title);
    tableHeader(columns);
    if (rows.length === 0) tableRow([empty, ...Array(columns.length - 1).fill('')], columns, muted);
    else rows.forEach((row) => tableRow(row, columns));
  };
  detailTable('الزيادات والمكافآت', [
    { label: 'التاريخ', width: pageWidth * 0.22 },
    { label: 'السبب', width: pageWidth * 0.48 },
    { label: 'المبلغ', width: pageWidth * 0.30 },
  ], (data.bonuses || []).map((bonus: any) => [pdfDate(bonus.date || bonus.createdAt), bonus.reason || bonus.notes, `+ ${pdfAmount(bonus.amount)}`]), 'لا توجد زيادات مسجلة');
  detailTable('السلف', [
    { label: 'التاريخ', width: pageWidth * 0.22 },
    { label: 'السبب', width: pageWidth * 0.48 },
    { label: 'المبلغ', width: pageWidth * 0.30 },
  ], (data.advances || []).map((advance: any) => [pdfDate(advance.requestedAt || advance.createdAt), advance.reason, `- ${pdfAmount(advance.amount)}`]), 'لا توجد سلف معتمدة');
  detailTable('الخصومات والمخالفات', [
    { label: 'التاريخ', width: pageWidth * 0.20 },
    { label: 'النوع', width: pageWidth * 0.25 },
    { label: 'السبب', width: pageWidth * 0.30 },
    { label: 'المبلغ', width: pageWidth * 0.25 },
  ], (data.violations || []).map((violation: any) => [
    pdfDate(violation.violationDate || violation.createdAt),
    violation.violationType || violation.type,
    violation.reason || violation.notes,
    `- ${pdfAmount(violation.amount)}`,
  ]), 'لا توجد مخالفات أو خصومات مسجلة');
  const absenceRecords = (data.attendance || []).filter((record: any) => record.isAbsent);
  const absenceRate = absenceRecords.length > 0
    ? Number(summary.absenceDeduction || 0) / absenceRecords.length
    : 0;
  detailTable('تفاصيل الغياب', [
    { label: 'التاريخ', width: pageWidth * 0.25 },
    { label: 'السبب / الملاحظة', width: pageWidth * 0.50 },
    { label: 'خصم الغياب', width: pageWidth * 0.25 },
  ], absenceRecords.map((record: any) => [
    pdfDate(record.date),
    record.notes || 'غياب مسجل',
    `- ${pdfAmount(absenceRate)}`,
  ]), 'لا توجد أيام غياب مسجلة');

  const footerY = doc.page.height - 42;
  line(footerY - 8, navy);
  doc.font(pdfFontPath(false)).fontSize(8).fillColor(muted);
  write(
    `تاريخ إصدار الكشف: ${new Date().toLocaleDateString('ar-DZ')}   |   ${salary.id ? `رقم الكشف: #${salary.id}` : 'معاينة قبل إنشاء سجل الدفع'}${isPaid ? '' : '   |   هذه المعاينة لا تثبت الدفع'}`,
    doc.page.margins.left,
    footerY,
    pageWidth,
  );
  doc.end();
  return res;
}

// ─── Payslip HTML builder ──────────────────────────────────────────────────
function buildPayslipHtml(data: any): string {
  const { salary, employee, summary, violations: viols, advances: advs } = data;
  const empName = employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : '—';
  const empSerial = employee?.serialNumber || '—';
  const officeName = employee?.officeName || '—';
  const position = employee?.position || '—';

  const monthNames: Record<string, string> = {
    '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل',
    '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس',
    '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر'
  };
  const monthStr = monthNames[String(salary.month).padStart(2, '0')] || salary.month;
  const periodLabel = `${monthStr} ${salary.year}`;

  const fmt = (n: number) => n.toLocaleString('ar-DZ') + ' دج';

  const violRows = (viols || []).map((v: any) =>
    `<tr><td>${v.violationType || v.type || '—'}</td><td>${v.reason || '—'}</td><td class="amount deduct">${fmt(Number(v.amount || 0))}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="empty">لا توجد مخالفات</td></tr>';

  const advRows = (advs || []).map((a: any) =>
    `<tr><td>${new Date(a.createdAt).toLocaleDateString('ar-DZ')}</td><td>${a.reason || '—'}</td><td class="amount deduct">${fmt(Number(a.amount || 0))}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="empty">لا توجد سلف</td></tr>';

  const statusLabel = salary.status === 'paid' ? '✅ مدفوع' : salary.status === 'postponed' ? '⏸ مؤجل' : '⏳ معلق';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>كشف راتب – ${empName} – ${periodLabel}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#f5f5f5;color:#222;direction:rtl}
  .page{max-width:800px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12)}
  header{background:linear-gradient(135deg,#1a3c6e,#2563eb);color:#fff;padding:28px 32px;display:flex;justify-content:space-between;align-items:center}
  header h1{font-size:22px;font-weight:700}
  header .period{font-size:14px;opacity:.85;margin-top:4px}
  .badge{background:rgba(255,255,255,.2);border-radius:20px;padding:6px 14px;font-size:13px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #e5e7eb}
  .info-box{padding:18px 24px;border-left:1px solid #e5e7eb}
  .info-box:nth-child(2){border-left:none}
  .info-box label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px}
  .info-box span{font-size:14px;font-weight:600;color:#111}
  table{width:100%;border-collapse:collapse}
  thead th{background:#f9fafb;padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb}
  tbody td{padding:10px 16px;font-size:13px;border-bottom:1px solid #f3f4f6}
  .amount{font-weight:700;white-space:nowrap}
  .deduct{color:#dc2626}
  .plus{color:#16a34a}
  .empty{color:#9ca3af;text-align:center;padding:14px;font-style:italic}
  .section-title{padding:14px 24px 8px;font-size:13px;font-weight:700;color:#374151;background:#f9fafb;border-bottom:1px solid #e5e7eb;border-top:1px solid #e5e7eb}
  .summary-box{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#e5e7eb;border-top:1px solid #e5e7eb}
  .sum-cell{background:#fff;padding:16px 20px;text-align:center}
  .sum-cell label{font-size:11px;color:#6b7280;display:block;margin-bottom:4px}
  .sum-cell span{font-size:16px;font-weight:700;color:#111}
  .final-box{background:linear-gradient(135deg,#1a3c6e,#2563eb);color:#fff;padding:20px 32px;display:flex;justify-content:space-between;align-items:center}
  .final-box .label{font-size:15px;font-weight:600}
  .final-box .amount{font-size:26px;font-weight:800}
  .footer{padding:14px 24px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6}
  .print-btn{display:block;margin:16px auto;padding:10px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-family:inherit}
  @media print{.print-btn{display:none}.page{box-shadow:none;border-radius:0;margin:0}}
</style>
</head>
<body>
<div class="page">
  <header>
    <div>
      <h1>🏢 DHD Livraison – كشف الراتب</h1>
      <div class="period">الفترة: ${periodLabel}</div>
    </div>
    <div class="badge">${statusLabel}</div>
  </header>

  <div class="info-grid">
    <div class="info-box"><label>اسم الموظف</label><span>${empName}</span></div>
    <div class="info-box"><label>الرقم التسلسلي</label><span>${empSerial}</span></div>
    <div class="info-box"><label>المنصب</label><span>${position}</span></div>
    <div class="info-box"><label>المكتب</label><span>${officeName}</span></div>
  </div>

  <div class="summary-box">
    <div class="sum-cell"><label>أيام الحضور</label><span>${summary.presentDays}</span></div>
    <div class="sum-cell"><label>أيام الغياب</label><span>${summary.absentDays}</span></div>
    <div class="sum-cell"><label>الراتب الأساسي</label><span>${fmt(summary.baseSalary)}</span></div>
  </div>

  <div class="section-title">المخالفات والخصومات</div>
  <table>
    <thead><tr><th>النوع</th><th>السبب</th><th>المبلغ</th></tr></thead>
    <tbody>${violRows}</tbody>
  </table>

  <div class="section-title">السلف المعتمدة</div>
  <table>
    <thead><tr><th>التاريخ</th><th>السبب</th><th>المبلغ</th></tr></thead>
    <tbody>${advRows}</tbody>
  </table>

  <div class="section-title">ملخص الراتب</div>
  <table>
    <tbody>
      <tr><td>الراتب الأساسي</td><td class="amount plus">${fmt(summary.baseSalary)}</td></tr>
      <tr><td>إجمالي الخصومات (مخالفات)</td><td class="amount deduct">- ${fmt(summary.violationTotal)}</td></tr>
      <tr><td>إجمالي السلف المستقطعة</td><td class="amount deduct">- ${fmt(summary.advanceTotal)}</td></tr>
    </tbody>
  </table>

  <div class="final-box">
    <span class="label">صافي الراتب النهائي</span>
    <span class="amount">${fmt(summary.finalSalary)}</span>
  </div>

  <div class="footer">
    تاريخ الإصدار: ${new Date().toLocaleDateString('ar-DZ')} &nbsp;|&nbsp; رقم الكشف: #${salary.id}
    ${salary.paidAt ? `&nbsp;|&nbsp; تاريخ الدفع: ${new Date(salary.paidAt).toLocaleDateString('ar-DZ')}` : ''}
  </div>
</div>
<button class="print-btn" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
</body>
</html>`;
}

// Static frontend serving if available
const publicDir = path.resolve(process.cwd(), 'public');
const importedFrontendDir = path.resolve(process.cwd(), 'artifacts/dhd-livraison/public');
const artifactsDir = path.resolve(process.cwd(), 'artifacts/dhd-livraison/dist/public');
const frontendDist = [publicDir, importedFrontendDir, artifactsDir]
  .find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) || artifactsDir;

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not Found', path: req.path });
    }
    const indexPath = path.join(frontendDist, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    return res.status(404).json({ error: 'Not Found', path: req.path });
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      name: 'DHD Livraison API Server',
      status: 'online',
      endpoints: {
        health: '/healthz',
        apiStatus: '/api/status'
      }
    });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
  });
}

// ─── Auto-absence scheduler ────────────────────────────────────────────────
// Marks employees absent for every past workday they missed (no check-in),
// respecting each employee's individual restDays list. Runs once at startup
// and then every hour so short server restarts don't miss a day.
async function autoMarkAbsentees() {
  try {
    await markAutoAbsences();
  } catch (err) {
    console.warn('[autoMarkAbsentees] error:', err instanceof Error ? err.message : err);
  }
}

// ─── Startup initialisation ───────────────────────────────────────────────
// Seed offices with real coordinates and create a default admin if none exists.
(async () => {
  try {
    await seedOfficialOffices();
  } catch (e) {
    console.warn('[startup] seedOfficialOffices error:', e);
  }

  // Run auto-absence immediately on startup, then every hour
  try {
    await autoMarkAbsentees();
  } catch (e) {
    console.warn('[startup] autoMarkAbsentees error:', e);
  }

})();

// Schedule auto-absence every hour (3600 seconds)
setInterval(() => { autoMarkAbsentees().catch(() => {}); }, 3600 * 1000);

// Haversine distance in metres between two GPS coordinates
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeQrValue(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      const nested = parsed.qrCodeData ?? parsed.value ?? parsed.secret ?? parsed.token;
      return typeof nested === 'string' ? nested.trim() : '';
    }
  } catch {
    // QR values are normally plain strings; JSON is accepted for native/WebView
    // scanners that serialize a small payload.
  }
  return value;
}
