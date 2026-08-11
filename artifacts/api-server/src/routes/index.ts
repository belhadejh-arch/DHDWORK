import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import officesRouter from "./offices";
import employeesRouter from "./employees";
import adminsRouter from "./admins";
import attendanceRouter from "./attendance";
import salariesRouter from "./salaries";
import advancesRouter from "./advances";
import leaveRequestsRouter from "./leave_requests";
import vacationRequestsRouter from "./vacation_requests";
import notificationsRouter from "./notifications";
import settingsRouter from "./settings";
import statsRouter from "./stats";
import employeeAppRouter from "./employee-app";
import violationsRouter from "./violations";
import bonusesRouter from "./bonuses";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(officesRouter);
router.use(employeesRouter);
router.use(adminsRouter);
router.use(attendanceRouter);
router.use(salariesRouter);
router.use(advancesRouter);
router.use(leaveRequestsRouter);
router.use(vacationRequestsRouter);
router.use(notificationsRouter);
router.use(settingsRouter);
router.use(statsRouter);
router.use(employeeAppRouter);
router.use(violationsRouter);
router.use(bonusesRouter);

export default router;
