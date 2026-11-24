export type RoleId =
  | 'super_admin'
  | 'executive_director'
  | 'senior_management'
  | 'finance_officer'
  | 'hr_officer'
  | 'department_head'
  | 'project_officer'
  | 'bookstore_manager'
  | 'bookstore_assistant'
  | 'apprentice_supervisor'
  | 'staff_member'
  | 'apprentice';

export type ModuleKey =
  | 'dashboard'
  | 'approvals'
  | 'finance'
  | 'hr'
  | 'apprenticeship'
  | 'bookstore'
  | 'projects'
  | 'procurement'
  | 'documents'
  | 'reports'
  | 'governance'
  | 'mobile_sync';

export type ApprenticePortalTab =
  | 'dashboard'
  | 'reports'
  | 'book_reviews'
  | 'leave'
  | 'imprest'
  | 'pd_reports'
  | 'notifications'
  | 'profile';

export interface OrgSettings {
  id: string;
  orgId: string;
  orgName: string;
  tagline?: string;
  address?: string;
  currency: string;
  timezone: string;
  primaryColor?: string;
  accentColor?: string;
  fiscalYear: string;
  reportingPeriod?: string;
  quickbooksStatus?: 'not_configured' | 'credentials_required' | 'connected';
  mpesaStatus?: 'not_configured' | 'credentials_required' | 'connected';
  fcmStatus?: 'not_configured' | 'web_push_ready' | 'connected';
  updatedBy?: string;
  updatedAt?: unknown;
}

export interface UserAccount {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: RoleId;
  departmentId?: string;
  departmentName?: string;
  jobTitle?: string;
  phone?: string;
  status: 'active' | 'inactive' | 'pending';
  mfaEnforced: boolean;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DirectoryEntry {
  id: string;
  uid: string;
  orgId: string;
  displayName: string;
  role: RoleId;
  departmentId?: string;
  departmentName?: string;
  jobTitle?: string;
  status: 'active' | 'inactive' | 'pending';
  isDemo?: boolean;
  updatedAt?: unknown;
}

export interface Department {
  id: string;
  orgId: string;
  code: string;
  name: string;
  headUserId?: string;
  headName?: string;
  description?: string;
  annualBudgetKes: number;
  status: 'active' | 'inactive';
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Employee {
  id: string;
  orgId: string;
  empNo: string;
  userId: string;
  fullName: string;
  workEmail?: string;
  phone?: string;
  departmentId: string;
  departmentName?: string;
  jobTitle: string;
  employmentDate?: string;
  employmentStatus: 'permanent' | 'contract' | 'probation' | 'exited';
  contractEndDate?: string;
  qualifications?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  nextOfKinName?: string;
  nextOfKinRelation?: string;
  salaryKes?: number;
  allowancesKes?: number;
  annualLeaveBalance?: number;
  viewerUids?: string[];
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LeaveRequest {
  id: string;
  orgId: string;
  userId: string;
  employeeName: string;
  departmentId?: string;
  supervisorId?: string;
  applicantRole?: string;
  leaveYear?: string;
  leaveType: 'annual' | 'sick' | 'compassionate' | 'study' | 'maternity_paternity' | 'unpaid';
  startDate: string;
  endDate: string;
  daysRequested: number;
  reason?: string;
  emergencyContact?: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  status: 'submitted' | 'pending_hr' | 'approved' | 'rejected' | 'returned' | 'cancelled';
  approverId?: string;
  approverComment?: string;
  supervisorComment?: string;
  supervisorApprovedBy?: string;
  hrComment?: string;
  hrApprovedBy?: string;
  viewerUids?: string[];
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LeavePolicy {
  id: string;
  orgId: string;
  leaveYear: string;
  apprenticeAnnualEntitlementDays: number;
  carryForwardEnabled: boolean;
  maxCarryForwardDays: number;
  publicHolidays: string[];
  updatedBy?: string;
  updatedAt?: unknown;
}

export interface Appraisal {
  id: string;
  orgId: string;
  employeeUserId: string;
  employeeName: string;
  reviewerId?: string;
  reviewerName?: string;
  period: string;
  objectives: string;
  feedback?: string;
  developmentPlan?: string;
  rating?: number;
  status: 'draft' | 'submitted' | 'completed';
  viewerUids?: string[];
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Cohort {
  id: string;
  orgId: string;
  name: string;
  programme: string;
  startDate: string;
  endDate: string;
  coordinatorName?: string;
  status: 'upcoming' | 'active' | 'completed';
  isDemo?: boolean;
  createdAt?: unknown;
}

export interface Apprentice {
  id: string;
  orgId: string;
  apprenticeCode: string;
  userId: string;
  fullName: string;
  email?: string;
  phone?: string;
  photoDataUrl?: string;
  cohortId: string;
  cohortName?: string;
  startDate?: string;
  expectedCompletionDate?: string;
  supervisorId: string;
  supervisorName?: string;
  region?: string;
  trainingLocation?: string;
  learningObjectives?: string;
  emergencyContact?: string;
  annualLeaveEntitlement?: number;
  carryForwardDays?: number;
  attendanceRate?: number;
  status: 'active' | 'needs_support' | 'completed' | 'deferred';
  viewerUids?: string[];
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ApprenticeReport {
  id: string;
  orgId: string;
  apprenticeId: string;
  apprenticeUserId: string;
  apprenticeName: string;
  supervisorId: string;
  reportType: 'daily' | 'weekly' | 'monthly' | 'activity' | 'reflection';
  periodStart: string;
  periodEnd?: string;
  activities: string;
  lessonsLearned?: string;
  challenges?: string;
  reflections?: string;
  monthlyTargetKes?: number;
  amountRaisedKes?: number;
  deficitKes?: number;
  callsMadeThisWeek?: number;
  newPartnersApproached?: number;
  totalActivePartners?: number;
  thingsWorked?: string;
  thingsDidNotWork?: string;
  nextWeekTargetAmountKes?: number;
  nextWeekPartnersToReachOut?: number;
  nextWeekCallsToMake?: number;
  nextWeekNewAppointments?: number;
  workProgress?: string;
  personalDevotion?: string;
  mentorshipUpdate?: string;
  attachmentName?: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'returned';
  supervisorComment?: string;
  evaluationScore?: number;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  revisionCount?: number;
  revisionHistoryJson?: string;
  clientRequestId?: string;
  viewerUids?: string[];
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BookReview {
  id: string;
  orgId: string;
  apprenticeId: string;
  apprenticeUserId: string;
  apprenticeName: string;
  supervisorId: string;
  bookTitle: string;
  author: string;
  dateCompleted: string;
  summary: string;
  lessonsLearned: string;
  overallReview: string;
  rating: number;
  coverOrSupportName?: string;
  coverOrSupportMime?: string;
  coverOrSupportDataUrl?: string;
  pdfAttachmentName?: string;
  pdfAttachmentDataUrl?: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'returned';
  supervisorComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  submittedAt?: string;
  viewerUids?: string[];
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ImprestCategory = 'transport' | 'pd' | 'medical';

export interface ImprestRecord {
  id: string;
  orgId: string;
  referenceNo: string;
  apprenticeId: string;
  apprenticeUserId: string;
  apprenticeName: string;
  category: ImprestCategory;
  amountReceivedKes: number;
  dateReceived: string;
  purpose: string;
  issuedBy: string;
  issuedByName?: string;
  status: 'issued' | 'retired' | 'settled';
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ImprestRetirement {
  id: string;
  orgId: string;
  imprestRecordId?: string;
  referenceNo: string;
  apprenticeId: string;
  apprenticeUserId: string;
  apprenticeName: string;
  category: ImprestCategory;
  amountReceivedKes: number;
  originalAmountReceivedKes: number;
  dateReceived: string;
  purpose?: string;
  destination?: string;
  travelDate?: string;
  pdActivity?: string;
  medicalPurpose?: string;
  expenditureDate?: string;
  expenditureDescription?: string;
  expenditureBreakdown?: string;
  actualSpentKes: number;
  unspentBalanceKes: number;
  additionalRequiredKes: number;
  comments?: string;
  accountingSheetName?: string;
  accountingSheetDataUrl?: string;
  receiptCount?: number;
  status: 'draft' | 'submitted' | 'under_review' | 'returned' | 'approved' | 'settled';
  financeComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  settledBy?: string;
  settledAt?: string;
  submittedAt?: string;
  revisionHistoryJson?: string;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ImprestReceipt {
  id: string;
  orgId: string;
  retirementId: string;
  apprenticeUserId: string;
  category: ImprestCategory;
  docKind: 'receipt' | 'supporting';
  fileName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  fileSizeKb: number;
  dataUrl: string;
  createdAt?: unknown;
}

export interface MonthlyPdReport {
  id: string;
  orgId: string;
  apprenticeId: string;
  apprenticeUserId: string;
  apprenticeName: string;
  apprenticeCode?: string;
  reportMonth: number;
  reportYear: number;
  periodKey: string;
  title: string;
  description?: string;
  publishedDate: string;
  fileName: string;
  fileSizeKb?: number;
  pdfDataUrl: string;
  version: number;
  versionHistoryJson?: string;
  uploadedBy: string;
  uploadedByName: string;
  status: 'published';
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Budget {
  id: string;
  orgId: string;
  title: string;
  fiscalYear: string;
  scope: 'organisational' | 'departmental' | 'project';
  departmentId?: string;
  departmentName?: string;
  projectId?: string;
  category: string;
  allocatedKes: number;
  spentKes: number;
  status: 'active' | 'closed';
  createdBy: string;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FinanceTransaction {
  id: string;
  orgId: string;
  txNumber: string;
  txType: 'payment_request' | 'expense' | 'petty_cash' | 'income';
  title: string;
  category: string;
  departmentId?: string;
  departmentName?: string;
  projectId?: string;
  projectName?: string;
  amountKes: number;
  payee?: string;
  description?: string;
  receiptRef?: string;
  requestedBy: string;
  requestedByName?: string;
  status: 'draft' | 'submitted' | 'pending_approval' | 'approved' | 'rejected' | 'returned' | 'paid' | 'retired' | 'cancelled';
  approverId?: string;
  approverName?: string;
  approvalComment?: string;
  qbSyncStatus: 'not_configured' | 'credentials_required' | 'pending' | 'synced' | 'error';
  qbSyncError?: string;
  viewerUids?: string[];
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Book {
  id: string;
  orgId: string;
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  category: string;
  description?: string;
  costKes: number;
  priceKes: number;
  stockQty: number;
  reorderLevel: number;
  imageUrl?: string;
  status: 'active' | 'discontinued';
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BookSale {
  id: string;
  orgId: string;
  receiptNo: string;
  cashierId: string;
  cashierName?: string;
  customerName?: string;
  paymentMethod: 'cash' | 'mpesa' | 'bank_transfer' | 'card';
  paymentRef?: string;
  subtotalKes: number;
  discountKes: number;
  totalKes: number;
  itemCount: number;
  itemsSummary?: string;
  qbSyncStatus?: 'not_configured' | 'credentials_required' | 'pending' | 'synced' | 'error';
  viewerUids?: string[];
  isDemo?: boolean;
  createdAt?: unknown;
}

export interface Project {
  id: string;
  orgId: string;
  code: string;
  title: string;
  description?: string;
  donorFunded: boolean;
  donorName?: string;
  departmentId: string;
  departmentName?: string;
  officerId: string;
  officerName?: string;
  objectives?: string;
  budgetKes: number;
  spentKes: number;
  progressPct: number;
  startDate?: string;
  endDate?: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed';
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProjectMilestone {
  id: string;
  orgId: string;
  projectId: string;
  projectCode?: string;
  projectTitle?: string;
  title: string;
  kind: 'milestone' | 'deliverable';
  ownerName?: string;
  startDate: string;
  endDate: string;
  progressPct: number;
  status: 'planned' | 'in_progress' | 'completed' | 'delayed';
  notes?: string;
  createdBy: string;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProcurementRequest {
  id: string;
  orgId: string;
  reqNo: string;
  title: string;
  departmentId: string;
  departmentName?: string;
  supplierName?: string;
  category?: string;
  estimatedKes: number;
  justification?: string;
  requestedBy: string;
  requestedByName?: string;
  status: 'draft' | 'submitted' | 'approved' | 'po_issued' | 'received' | 'rejected';
  approverId?: string;
  approvalComment?: string;
  viewerUids?: string[];
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Supplier {
  id: string;
  orgId: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  category: string;
  kraPin?: string;
  outstandingKes: number;
  status: 'active' | 'inactive';
  isDemo?: boolean;
  createdAt?: unknown;
}

export interface Asset {
  id: string;
  orgId: string;
  assetTag: string;
  name: string;
  category: string;
  purchaseDate?: string;
  purchaseCostKes: number;
  assignedToName?: string;
  departmentId?: string;
  location?: string;
  condition?: 'excellent' | 'good' | 'fair' | 'needs_repair';
  status: 'active' | 'maintenance' | 'disposed';
  qrCodeValue?: string;
  checkoutStatus?: 'available' | 'checked_out';
  checkedOutTo?: string;
  checkedOutByUid?: string;
  checkedOutAt?: string;
  lastScannedAt?: string;
  lastScannedBy?: string;
  scanNotes?: string;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DocumentRecord {
  id: string;
  orgId: string;
  title: string;
  category: string;
  departmentId?: string;
  departmentName?: string;
  accessScope: 'all_staff' | 'department' | 'management' | 'finance' | 'hr';
  version: string;
  fileName: string;
  fileSizeKb?: number;
  summary?: string;
  contentText?: string;
  uploadedBy: string;
  uploadedByName?: string;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminMemo {
  id: string;
  orgId: string;
  recordType: 'memo' | 'event' | 'meeting' | 'announcement';
  title: string;
  body: string;
  eventDate?: string;
  location?: string;
  departmentId?: string;
  authorId: string;
  authorName?: string;
  isDemo?: boolean;
  createdAt?: unknown;
}

export interface NotificationItem {
  id: string;
  recipientUid: string;
  title: string;
  message: string;
  category: 'approval' | 'report' | 'leave' | 'finance' | 'project' | 'document' | 'system';
  linkModule?: string;
  read: boolean;
  createdAt?: unknown;
}

export interface AuditLogEntry {
  id: string;
  orgId: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  createdAt?: unknown;
}

export interface IntegrationLogEntry {
  id: string;
  orgId: string;
  provider: 'quickbooks' | 'mpesa' | 'fcm' | 'payroll';
  event: string;
  status: 'credentials_required' | 'queued' | 'error' | 'synced';
  details: string;
  actorUid: string;
  createdAt?: unknown;
}

export function formatKes(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `KES ${safe.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNairobiDate(input: unknown): string {
  if (!input) return '—';
  let d: Date | null = null;
  if (input instanceof Date) {
    d = input;
  } else if (typeof input === 'string') {
    d = new Date(input);
  } else if (typeof input === 'object' && input !== null && 'toDate' in input && typeof (input as { toDate: () => Date }).toDate === 'function') {
    d = (input as { toDate: () => Date }).toDate();
  } else if (typeof input === 'object' && input !== null && 'seconds' in input) {
    d = new Date(((input as { seconds: number }).seconds) * 1000);
  }
  if (!d || Number.isNaN(d.getTime())) return String(input);
  return d.toLocaleDateString('en-KE', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatNairobiDateTime(input: unknown): string {
  if (!input) return '—';
  let d: Date | null = null;
  if (input instanceof Date) {
    d = input;
  } else if (typeof input === 'string') {
    d = new Date(input);
  } else if (typeof input === 'object' && input !== null && 'toDate' in input && typeof (input as { toDate: () => Date }).toDate === 'function') {
    d = (input as { toDate: () => Date }).toDate();
  } else if (typeof input === 'object' && input !== null && 'seconds' in input) {
    d = new Date(((input as { seconds: number }).seconds) * 1000);
  }
  if (!d || Number.isNaN(d.getTime())) return String(input);
  return d.toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
