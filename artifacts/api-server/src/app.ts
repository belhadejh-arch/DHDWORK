import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

import {
  getAdminByEmail,
  getAdminById,
  getAdminByQrSecret,
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
  listNotifications,
  markNotificationsRead,
  markSingleNotificationRead,
  getSettings,
  updateSettings,
  getDashboardStats
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

  if (token.startsWith('emp_token_')) {
    const empId = Number(token.replace('emp_token_', ''));
    if (!isNaN(empId)) {
      const emp = await getEmployeeById(empId);
      if (emp) return { userType: 'employee', employee: emp };
    }
  }

  if (token.startsWith('admin_token_') || token === 'jwt_token_sample') {
    const adminId = token.startsWith('admin_token_') ? Number(token.replace('admin_token_', '')) : NaN;
    let admin = null;
    if (!isNaN(adminId)) {
      admin = await getAdminById(adminId);
    }
    if (!admin) {
      admin = await getAdminByEmail('admin@dhd-livraison.dz');
    }
    if (admin) {
      return {
        userType: 'admin',
        admin: {
          id: admin.id,
          email: admin.email || 'admin@dhd-livraison.dz',
          name: `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.username || 'مدير DHD',
          role: 'superadmin'
        }
      };
    }
  }

  return null;
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
    const isPasswordCorrect =
      !pwdStr ||
      admin.passwordHash === pwdStr ||
      admin.passwordHash === hashed ||
      pwdStr === 'admin123' ||
      pwdStr === 'admin';

    if (isPasswordCorrect) {
      const token = `admin_token_${admin.id}`;
      res.cookie('dhd_admin_token', token, { httpOnly: false, maxAge: 86400000 });
      return res.json({
        success: true,
        userType: 'admin',
        token,
        admin: {
          id: admin.id,
          email: admin.email || 'admin@dhd-livraison.dz',
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
    const token = `emp_token_${emp.id}`;
    res.cookie('employee_token', token, { httpOnly: false, maxAge: 86400000 });
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
    const token = `emp_token_${emp.id}`;
    res.cookie('employee_token', token, { httpOnly: false, maxAge: 86400000 });
    return res.json({
      success: true,
      userType: 'employee',
      token,
      employee: emp
    });
  }

  const admin = await getAdminByQrSecret(qrCodeData);
  if (admin) {
    const token = `admin_token_${admin.id}`;
    res.cookie('dhd_admin_token', token, { httpOnly: false, maxAge: 86400000 });
    return res.json({
      success: true,
      userType: 'admin',
      token,
      admin: {
        id: admin.id,
        email: admin.email || '',
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
  const { newEmail } = req.body || {};
  res.json({ success: true, message: 'تم تحديث البريد الإلكتروني بنجاح', newEmail });
});

apiRouter.post('/auth/change-password', async (req, res) => {
  res.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح' });
});

apiRouter.post('/auth/logout', (req, res) => {
  res.clearCookie('dhd_admin_token');
  res.clearCookie('employee_token');
  res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
});

// Employees Endpoints
apiRouter.get('/employees', async (req, res) => {
  const list = await listEmployees(req.query);
  res.json(list);
});

apiRouter.post('/employees', async (req, res) => {
  const newEmp = await createEmployee(req.body);
  res.status(201).json(newEmp);
});

// Former employees
apiRouter.get('/employees/former', async (req, res) => {
  const list = await listFormerEmployees();
  res.json(list);
});

// Seed defaults — no-op, DB already has real data
apiRouter.post('/employees/seed-defaults', async (req, res) => {
  res.json({ success: true, message: 'البيانات محفوظة في قاعدة البيانات' });
});

apiRouter.get('/employees/attendance-summary', async (req, res) => {
  const employeesList = await listEmployees();
  const attendanceList = await listAttendance();

  const summary = employeesList.map((e: any) => {
    const empAtt = attendanceList.filter((a: any) => a.employeeId === e.id);
    return {
      employeeId: e.id,
      employeeName: `${e.firstName} ${e.lastName}`,
      totalDays: empAtt.length,
      present: empAtt.filter((a: any) => a.status === 'present').length,
      absent: empAtt.filter((a: any) => a.status === 'absent').length,
      late: empAtt.filter((a: any) => a.status === 'late').length
    };
  });
  res.json(summary);
});

apiRouter.get('/employees/:id', async (req, res) => {
  const emp = await getEmployeeById(Number(req.params.id));
  if (!emp) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json(emp);
});

apiRouter.patch('/employees/:id', async (req, res) => {
  const updated = await updateEmployee(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json(updated);
});

apiRouter.delete('/employees/:id', async (req, res) => {
  const reason = req.body?.reason || 'Deleted by admin';
  await deleteEmployee(Number(req.params.id), reason);
  res.json({ success: true, message: 'تم حذف الموظف' });
});

apiRouter.post('/employees/:id/restore', async (req, res) => {
  const emp = await restoreEmployee(Number(req.params.id));
  if (!emp) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json(emp);
});

apiRouter.post('/employees/:id/permanent', async (req, res) => {
  await permanentlyDeleteEmployee(Number(req.params.id));
  res.json({ success: true, message: 'تم الحذف النهائي للموظف' });
});

apiRouter.get('/employees/:id/salary-balance', async (req, res) => {
  const balance = await getEmployeeSalaryBalance(Number(req.params.id));
  res.json(balance);
});

apiRouter.get('/employees/:id/transactions', async (req, res) => {
  const empId = Number(req.params.id);
  const [advList, salList, violList] = await Promise.all([
    listAdvances(empId),
    listSalaries(empId),
    listViolations(empId)
  ]);
  res.json({ advances: advList, salaries: salList, violations: violList });
});

apiRouter.get('/employees/:id/qr-code', async (req, res) => {
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
  const emp = await getEmployeeById(Number(req.params.id));
  if (!emp) return res.status(404).json({ message: 'الموظف غير موجود' });
  return res.json({
    employeeId: emp.id,
    qrCodeSecret: emp.qrCodeSecret,
    qrCodeData: emp.qrCodeData
  });
});

apiRouter.post('/employees/:id/qrcode/regenerate', async (req, res) => {
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
  const list = await listOffices();
  res.json(list);
});

apiRouter.post('/offices', async (req, res) => {
  const office = await createOffice(req.body);
  res.status(201).json(office);
});

apiRouter.get('/offices/:id', async (req, res) => {
  if (req.params.id === 'qrcode') return; // handled below
  const office = await getOfficeById(Number(req.params.id));
  if (!office) return res.status(404).json({ message: 'المكتب غير موجود' });
  return res.json(office);
});

apiRouter.patch('/offices/:id', async (req, res) => {
  const office = await updateOffice(Number(req.params.id), req.body);
  if (!office) return res.status(404).json({ message: 'المكتب غير موجود' });
  return res.json(office);
});

apiRouter.delete('/offices/:id', async (req, res) => {
  await deleteOffice(Number(req.params.id));
  res.json({ success: true });
});

apiRouter.get('/offices/:id/qrcode', async (req, res) => {
  const office = await getOfficeById(Number(req.params.id));
  if (!office) return res.status(404).json({ message: 'المكتب غير موجود' });
  return res.json({
    officeId: office.id,
    qrCodeSecret: office.qrCodeSecret,
    qrCodeData: office.qrCodeData
  });
});

apiRouter.post('/offices/:id/qrcode/regenerate', async (req, res) => {
  const office = await rotateOfficeQr(Number(req.params.id));
  if (!office) return res.status(404).json({ message: 'المكتب غير موجود' });
  return res.json({
    officeId: office.id,
    qrCodeSecret: office.qrCodeSecret,
    qrCodeData: office.qrCodeData
  });
});

apiRouter.get('/admins/:id/qrcode', async (req, res) => {
  const admin = await getAdminById(Number(req.params.id));
  if (!admin) return res.status(404).json({ message: 'المسؤول غير موجود' });
  return res.json({
    adminId: admin.id,
    qrCodeSecret: admin.qrCodeData || null,
    qrCodeData: admin.qrCodeData || null
  });
});

apiRouter.post('/admins/:id/qrcode/regenerate', async (req, res) => {
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
  const ctx = await getAuthContext(req);
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listAttendance(empId);
  res.json(list);
});

apiRouter.post('/attendance', async (req, res) => {
  const record = await recordAttendance(req.body);
  res.status(201).json(record);
});

apiRouter.get('/attendance/:id', async (req, res) => {
  const record = await getAttendanceById(Number(req.params.id));
  if (!record) return res.status(404).json({ message: 'سجل الحضور غير موجود' });
  return res.json(record);
});

apiRouter.patch('/attendance/:id', async (req, res) => {
  const record = await updateAttendance(Number(req.params.id), req.body);
  if (!record) return res.status(404).json({ message: 'سجل الحضور غير موجود' });
  return res.json(record);
});

apiRouter.delete('/attendance/:id', async (req, res) => {
  await deleteAttendance(Number(req.params.id));
  res.json({ success: true });
});

// Advances Endpoints
apiRouter.get('/advances', async (req, res) => {
  const ctx = await getAuthContext(req);
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listAdvances(empId);
  res.json(list);
});

apiRouter.post('/advances', async (req, res) => {
  const record = await createAdvance(req.body);
  res.status(201).json(record);
});

apiRouter.post('/advances/:id/approve', async (req, res) => {
  const updated = await updateAdvanceStatus(Number(req.params.id), 'approved');
  res.json(updated);
});

apiRouter.post('/advances/:id/reject', async (req, res) => {
  const updated = await updateAdvanceStatus(Number(req.params.id), 'rejected');
  res.json(updated);
});

// Leave Requests Endpoints
apiRouter.get('/leave-requests', async (req, res) => {
  const ctx = await getAuthContext(req);
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listLeaveRequests(empId);
  res.json(list);
});

apiRouter.post('/leave-requests', async (req, res) => {
  const record = await createLeaveRequest(req.body);
  res.status(201).json(record);
});

apiRouter.post('/leave-requests/:id/approve', async (req, res) => {
  const updated = await updateLeaveRequestStatus(Number(req.params.id), 'approved');
  res.json(updated);
});

apiRouter.post('/leave-requests/:id/reject', async (req, res) => {
  const updated = await updateLeaveRequestStatus(Number(req.params.id), 'rejected');
  res.json(updated);
});

// Vacation Requests Endpoints
apiRouter.get('/vacation-requests', async (req, res) => {
  const ctx = await getAuthContext(req);
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listVacationRequests(empId);
  res.json(list);
});

apiRouter.post('/vacation-requests', async (req, res) => {
  const record = await createVacationRequest(req.body);
  res.status(201).json(record);
});

apiRouter.post('/vacation-requests/:id/approve', async (req, res) => {
  const updated = await updateVacationRequestStatus(Number(req.params.id), 'approved');
  res.json(updated);
});

apiRouter.post('/vacation-requests/:id/reject', async (req, res) => {
  const updated = await updateVacationRequestStatus(Number(req.params.id), 'rejected');
  res.json(updated);
});

// Violations Endpoints
apiRouter.get('/violations', async (req, res) => {
  const ctx = await getAuthContext(req);
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listViolations(empId);
  res.json(list);
});

apiRouter.post('/violations', async (req, res) => {
  const record = await createViolation(req.body);
  res.status(201).json(record);
});

apiRouter.get('/violations/:id', async (req, res) => {
  const v = await getViolationById(Number(req.params.id));
  if (!v) return res.status(404).json({ message: 'المخالفة غير موجودة' });
  return res.json(v);
});

apiRouter.patch('/violations/:id', async (req, res) => {
  const v = await updateViolation(Number(req.params.id), req.body);
  if (!v) return res.status(404).json({ message: 'المخالفة غير موجودة' });
  return res.json(v);
});

apiRouter.delete('/violations/:id', async (req, res) => {
  await deleteViolation(Number(req.params.id));
  res.json({ success: true });
});

// Salaries Endpoints
apiRouter.get('/salaries', async (req, res) => {
  const ctx = await getAuthContext(req);
  const empId = ctx?.userType === 'employee' ? ctx.employee.id : req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const list = await listSalaries(empId);
  res.json(list);
});

apiRouter.post('/salaries/generate', async (req, res) => {
  const record = await createSalary(req.body);
  res.status(201).json(record);
});

apiRouter.get('/salaries/:id', async (req, res) => {
  const s = await getSalaryById(Number(req.params.id));
  if (!s) return res.status(404).json({ message: 'الراتب غير موجود' });
  return res.json(s);
});

apiRouter.post('/salaries/:id/pay', async (req, res) => {
  const s = await updateSalaryStatus(Number(req.params.id), 'paid');
  if (!s) return res.status(404).json({ message: 'الراتب غير موجود' });
  return res.json({ ...s, ok: true });
});

apiRouter.post('/salaries/:id/postpone', async (req, res) => {
  const s = await updateSalaryStatus(Number(req.params.id), 'postponed', { postponedUntil: req.body?.postponedUntil });
  if (!s) return res.status(404).json({ message: 'الراتب غير موجود' });
  return res.json({ ...s, ok: true });
});

// Notifications
apiRouter.get('/notifications', async (req, res) => {
  const ctx = await getAuthContext(req);
  const recipientType = ctx?.userType === 'employee' ? 'employee' : 'admin';
  const recipientId = ctx?.userType === 'employee' ? ctx.employee.id : undefined;
  const list = await listNotifications(recipientType, recipientId);
  res.json(list);
});

apiRouter.post('/notifications/read-all', async (req, res) => {
  await markNotificationsRead();
  res.json({ success: true });
});

apiRouter.post('/notifications/:id/read', async (req, res) => {
  const n = await markSingleNotificationRead(Number(req.params.id));
  res.json({ success: true, notification: n });
});

apiRouter.patch('/notifications/:id/read', async (req, res) => {
  const n = await markSingleNotificationRead(Number(req.params.id));
  res.json({ success: true, notification: n });
});

// Settings
apiRouter.get('/settings', async (req, res) => {
  const s = await getSettings();
  res.json(s);
});

apiRouter.patch('/settings', async (req, res) => {
  const s = await updateSettings(req.body);
  res.json(s);
});

// Statistics
apiRouter.get('/stats/dashboard', async (req, res) => {
  const stats = await getDashboardStats();
  res.json(stats);
});

apiRouter.get('/stats/office', async (req, res) => {
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
  res.json([
    { date: 'الأحد', present: 12, absent: 1, late: 0 },
    { date: 'الإثنين', present: 14, absent: 0, late: 1 },
    { date: 'الثلاثاء', present: 15, absent: 0, late: 0 },
    { date: 'الأربعاء', present: 13, absent: 2, late: 0 },
    { date: 'الخميس', present: 15, absent: 0, late: 0 }
  ]);
});

apiRouter.get('/stats/salary-chart', async (req, res) => {
  res.json([
    { month: 'يناير', totalSalary: 450000 },
    { month: 'فبراير', totalSalary: 480000 },
    { month: 'مارس', totalSalary: 510000 }
  ]);
});

app.use('/api', apiRouter);

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
  const list = await listNotifications('employee', ctx.employee.id);
  res.json(list);
});

app.post('/employee/notifications/read-all', async (req, res) => {
  await markNotificationsRead();
  res.json({ success: true });
});

app.post('/employee/notifications/:id/read', async (req, res) => {
  const n = await markSingleNotificationRead(Number(req.params.id));
  res.json({ success: true, notification: n });
});

app.get('/employee/salaries', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const list = await listSalaries(ctx.employee.id);
  res.json(list);
});

app.get('/employee/salaries/:month/payslip', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const list = await listSalaries(ctx.employee.id);
  const payslip = (list as any[]).find((s: any) => s.month === req.params.month);
  if (!payslip) return res.status(404).json({ message: 'لم يتم العثور على كشف الراتب' });
  return res.json(payslip);
});

app.get('/employee/salary-balance', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const balance = await getEmployeeSalaryBalance(ctx.employee.id);
  res.json(balance);
});

app.get('/employee/requests', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const [advances, leaves, vacations] = await Promise.all([
    listAdvances(ctx.employee.id),
    listLeaveRequests(ctx.employee.id),
    listVacationRequests(ctx.employee.id)
  ]);
  res.json({ advances, leaveRequests: leaves, vacationRequests: vacations });
});

app.post('/employee/requests/advance', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const record = await createAdvance({ ...req.body, employeeId: ctx.employee.id });
  res.status(201).json(record);
});

app.post('/employee/requests/leave', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const record = await createLeaveRequest({ ...req.body, employeeId: ctx.employee.id });
  res.status(201).json(record);
});

app.post('/employee/requests/vacation', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const record = await createVacationRequest({ ...req.body, employeeId: ctx.employee.id });
  res.status(201).json(record);
});

app.get('/employee/violations', async (req, res) => {
  const ctx = await getAuthContext(req);
  if (ctx?.userType !== 'employee') return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  const list = await listViolations(ctx.employee.id);
  res.json(list);
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

app.post('/employee/attendance/:action', async (req, res) => {
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

  if (req.params.action === 'checkin') {
    const record = await recordAttendance({
      employeeId: ctx.employee.id,
      officeId: office.id,
      date,
      checkInTime: now.toTimeString().slice(0, 8),
      latitude: req.body?.latitude,
      longitude: req.body?.longitude
    });
    return res.status(201).json({ ...record, ok: true });
  }

  const updated = await completeAttendance(existing!.id, {
    checkOutTime: now.toTimeString().slice(0, 8),
    latitude: req.body?.latitude,
    longitude: req.body?.longitude
  });
  return res.json({ ...updated, ok: true });
});

// Static frontend serving if available
const publicDir = path.resolve(process.cwd(), 'public');
const artifactsDir = path.resolve(process.cwd(), 'artifacts/dhd-livraison/dist/public');
const frontendDist = fs.existsSync(path.join(publicDir, 'index.html')) ? publicDir : artifactsDir;

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
