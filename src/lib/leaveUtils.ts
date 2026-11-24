import { Apprentice, LeavePolicy, LeaveRequest } from '../types/erp.ts';

function parseIsoDateUtc(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function formatUtcIso(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface WorkingDaysBreakdown {
  workingDays: number;
  calendarDays: number;
  weekendDays: number;
  holidayDays: number;
  matchedHolidays: string[];
}

/**
 * Calculates working days between two YYYY-MM-DD dates (inclusive),
 * excluding Saturdays, Sundays, and HR-configured public holidays.
 */
export function calculateWorkingDays(
  startDateStr: string,
  endDateStr: string,
  publicHolidays: string[] = []
): WorkingDaysBreakdown {
  const start = parseIsoDateUtc(startDateStr);
  const end = parseIsoDateUtc(endDateStr);
  if (!start || !end || end.getTime() < start.getTime()) {
    return { workingDays: 0, calendarDays: 0, weekendDays: 0, holidayDays: 0, matchedHolidays: [] };
  }

  const holidaySet = new Set(publicHolidays.map((h) => h.trim()));
  let workingDays = 0;
  let calendarDays = 0;
  let weekendDays = 0;
  let holidayDays = 0;
  const matchedHolidays: string[] = [];

  const cursor = new Date(start.getTime());
  // Guard loop against unrealistic spans (> 400 days)
  while (cursor.getTime() <= end.getTime() && calendarDays < 400) {
    calendarDays += 1;
    const dow = cursor.getUTCDay();
    const iso = formatUtcIso(cursor);
    if (dow === 0 || dow === 6) {
      weekendDays += 1;
    } else if (holidaySet.has(iso)) {
      holidayDays += 1;
      matchedHolidays.push(iso);
    } else {
      workingDays += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { workingDays, calendarDays, weekendDays, holidayDays, matchedHolidays };
}

export interface ApprenticeLeaveSummary {
  leaveYear: string;
  baseEntitlement: number;
  carryForwardDays: number;
  totalEntitlement: number;
  approvedDaysUsed: number;
  pendingApprovalDays: number;
  remainingLeaveDays: number;
}

export function computeApprenticeLeaveSummary(params: {
  leaveRequests: LeaveRequest[];
  leavePolicy: LeavePolicy;
  userId: string;
  apprentice?: Apprentice | null;
}): ApprenticeLeaveSummary {
  const { leaveRequests, leavePolicy, userId, apprentice } = params;
  const leaveYear = leavePolicy.leaveYear || String(new Date().getFullYear());
  const baseEntitlement =
    apprentice?.annualLeaveEntitlement && apprentice.annualLeaveEntitlement > 0
      ? apprentice.annualLeaveEntitlement
      : leavePolicy.apprenticeAnnualEntitlementDays || 10;

  const carryForwardDays = leavePolicy.carryForwardEnabled
    ? Math.min(Math.max(0, apprentice?.carryForwardDays ?? 0), Math.max(0, leavePolicy.maxCarryForwardDays ?? 0))
    : 0;

  const totalEntitlement = baseEntitlement + carryForwardDays;

  const userAnnualLeaves = leaveRequests.filter((r) => {
    if (r.userId !== userId || r.leaveType !== 'annual') return false;
    const reqYear = r.leaveYear || (r.startDate ? r.startDate.slice(0, 4) : leaveYear);
    return reqYear === leaveYear;
  });

  const approvedDaysUsed = userAnnualLeaves
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + (Number(r.daysRequested) || 0), 0);

  const pendingApprovalDays = userAnnualLeaves
    .filter((r) => r.status === 'submitted' || r.status === 'pending_hr')
    .reduce((sum, r) => sum + (Number(r.daysRequested) || 0), 0);

  const remainingLeaveDays = Math.max(0, totalEntitlement - approvedDaysUsed);

  return {
    leaveYear,
    baseEntitlement,
    carryForwardDays,
    totalEntitlement,
    approvedDaysUsed,
    pendingApprovalDays,
    remainingLeaveDays,
  };
}
