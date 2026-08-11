// All business time is computed in the company's timezone (Algeria, UTC+1, no DST).
const TZ = "Africa/Algiers";

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** YYYY-MM-DD in Algeria time */
export function todayStr(): string {
  return dateFmt.format(new Date());
}

/** HH:MM:SS in Algeria time */
export function nowTimeStr(): string {
  return timeFmt.format(new Date()).replace(/^24/, "00");
}

/** Minutes since midnight, Algeria time */
export function nowMinutes(): number {
  const [h, m] = nowTimeStr().split(":").map(Number);
  return h * 60 + m;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Start of today's Algeria-time day, as a UTC Date (for createdAt comparisons). Algeria is UTC+1. */
export function startOfTodayAlgiers(): Date {
  return new Date(`${todayStr()}T00:00:00+01:00`);
}

export const ALL_WORK_DAYS = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت"
];

export const DEFAULT_WORK_DAYS = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس"
];

/**
  * Returns true if the given date is a work day for the employee based on workDays array.
  * If workDays is null/undefined/empty, defaults to DEFAULT_WORK_DAYS (Sunday to Thursday).
  */
export function isEmployeeWorkDay(workDays: string[] | null | undefined, dateInput: Date | string): boolean {
  const days = (workDays && Array.isArray(workDays) && workDays.length > 0)
    ? workDays
    : DEFAULT_WORK_DAYS;

  let dayNum: number;
  if (typeof dateInput === "string") {
    // "YYYY-MM-DD" or similar string
    const parts = dateInput.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      dayNum = new Date(year, month, day).getDay();
    } else {
      dayNum = new Date(dateInput).getDay();
    }
  } else {
    dayNum = dateInput.getDay();
  }

  const dayArabic = ALL_WORK_DAYS[dayNum]; // 0: الأحد, 1: الإثنين, etc.
  const dayNumStr = String(dayNum);
  const dayEng = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayNum];

  return days.some(d => {
    if (typeof d !== "string") return false;
    const trimmed = d.trim();
    return (
      trimmed === dayArabic ||
      trimmed === dayNumStr ||
      trimmed.toLowerCase() === dayEng.toLowerCase()
    );
  });
}
