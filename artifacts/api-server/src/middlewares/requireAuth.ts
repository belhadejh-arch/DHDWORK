import { Request, Response, NextFunction } from "express";
import { getTokenFromRequest, getSession } from "../lib/auth";
import { db, adminsTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      adminId?: number;
      employeeId?: number;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const session = await getSession(token);
  if (!session || session.userType !== "admin") {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, session.userId));
  if (!admin) {
    res.status(401).json({ error: "Admin not found" });
    return;
  }
  req.adminId = admin.id;
  next();
}

export async function requireEmployeeAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const session = await getSession(token);
  if (!session || session.userType !== "employee") {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, session.userId));
  if (!emp || !emp.isActive) {
    res.status(401).json({ error: "Employee not found or suspended" });
    return;
  }
  req.employeeId = emp.id;
  next();
}
