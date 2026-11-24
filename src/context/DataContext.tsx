import React, { createContext, useContext, useEffect, useState } from 'react';
import { Unsubscribe, collection, onSnapshot, query, where } from 'firebase/firestore';
import { ORG_ID, db } from '../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import { useAuth } from './AuthContext.tsx';
import {
  AdminMemo,
  Appraisal,
  Apprentice,
  ApprenticeReport,
  Asset,
  AuditLogEntry,
  Book,
  BookReview,
  BookSale,
  Budget,
  Cohort,
  Department,
  DirectoryEntry,
  DocumentRecord,
  Employee,
  FinanceTransaction,
  ImprestReceipt,
  ImprestRecord,
  ImprestRetirement,
  IntegrationLogEntry,
  LeavePolicy,
  LeaveRequest,
  MonthlyPdReport,
  NotificationItem,
  ProcurementRequest,
  Project,
  ProjectMilestone,
  Supplier,
  UserAccount,
} from '../types/erp.ts';

interface DataContextValue {
  users: UserAccount[];
  directory: DirectoryEntry[];
  departments: Department[];
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  leavePolicy: LeavePolicy;
  appraisals: Appraisal[];
  cohorts: Cohort[];
  apprentices: Apprentice[];
  apprenticeReports: ApprenticeReport[];
  bookReviews: BookReview[];
  imprestRecords: ImprestRecord[];
  imprestRetirements: ImprestRetirement[];
  imprestReceipts: ImprestReceipt[];
  monthlyPdReports: MonthlyPdReport[];
  budgets: Budget[];
  financeTransactions: FinanceTransaction[];
  books: Book[];
  bookSales: BookSale[];
  projects: Project[];
  projectMilestones: ProjectMilestone[];
  procurementRequests: ProcurementRequest[];
  suppliers: Supplier[];
  assets: Asset[];
  documents: DocumentRecord[];
  adminMemos: AdminMemo[];
  notifications: NotificationItem[];
  auditLogs: AuditLogEntry[];
  integrationLogs: IntegrationLogEntry[];
  loading: boolean;
  dataError: string | null;
}

const DEFAULT_LEAVE_POLICY: LeavePolicy = {
  id: 'default',
  orgId: ORG_ID,
  leaveYear: String(new Date().getFullYear()),
  apprenticeAnnualEntitlementDays: 10,
  carryForwardEnabled: false,
  maxCarryForwardDays: 0,
  publicHolidays: [
    '2026-01-01',
    '2026-04-03',
    '2026-04-06',
    '2026-05-01',
    '2026-06-01',
    '2026-10-10',
    '2026-10-20',
    '2026-12-12',
    '2026-12-25',
    '2026-12-26',
  ],
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, isBootstrappedAdmin } = useAuth();

  const [users, setUsers] = useState<UserAccount[]>([]);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveSettingsRows, setLeaveSettingsRows] = useState<LeavePolicy[]>([]);
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [apprentices, setApprentices] = useState<Apprentice[]>([]);
  const [apprenticeReports, setApprenticeReports] = useState<ApprenticeReport[]>([]);
  const [bookReviews, setBookReviews] = useState<BookReview[]>([]);
  const [imprestRecords, setImprestRecords] = useState<ImprestRecord[]>([]);
  const [imprestRetirements, setImprestRetirements] = useState<ImprestRetirement[]>([]);
  const [imprestReceipts, setImprestReceipts] = useState<ImprestReceipt[]>([]);
  const [monthlyPdReports, setMonthlyPdReports] = useState<MonthlyPdReport[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [financeTransactions, setFinanceTransactions] = useState<FinanceTransaction[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [bookSales, setBookSales] = useState<BookSale[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectMilestones, setProjectMilestones] = useState<ProjectMilestone[]>([]);
  const [procurementRequests, setProcurementRequests] = useState<ProcurementRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [adminMemos, setAdminMemos] = useState<AdminMemo[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [integrationLogs, setIntegrationLogs] = useState<IntegrationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser || !profile || profile.status !== 'active') {
      setLoading(false);
      return;
    }

    setLoading(true);
    setDataError(null);
    const uid = firebaseUser.uid;
    const isAdminOrExec = ['super_admin', 'executive_director', 'senior_management'].includes(profile.role);
    const isHRRole = isAdminOrExec || profile.role === 'hr_officer';
    const isFinanceRole = isAdminOrExec || profile.role === 'finance_officer';
    const isSupOnly = ['apprentice_supervisor', 'department_head'].includes(profile.role);

    const unsubs: Unsubscribe[] = [];

    const subscribe = <T,>(
      colName: string,
      q: ReturnType<typeof query>,
      setter: React.Dispatch<React.SetStateAction<T[]>>
    ) => {
      const unsub = onSnapshot(
        q,
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as T[];
          setter(rows);
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, colName);
          } catch (formattedErr) {
            setDataError(formattedErr instanceof Error ? formattedErr.message : String(formattedErr));
          }
        }
      );
      unsubs.push(unsub);
    };

    const orgWhere = where('orgId', '==', ORG_ID);

    // Org-wide shared collections
    subscribe('directory', query(collection(db, 'directory'), orgWhere), setDirectory);
    subscribe('departments', query(collection(db, 'departments'), orgWhere), setDepartments);
    subscribe('leaveSettings', query(collection(db, 'leaveSettings'), orgWhere), setLeaveSettingsRows);
    subscribe('cohorts', query(collection(db, 'cohorts'), orgWhere), setCohorts);
    subscribe('budgets', query(collection(db, 'budgets'), orgWhere), setBudgets);
    subscribe('books', query(collection(db, 'books'), orgWhere), setBooks);
    subscribe('projects', query(collection(db, 'projects'), orgWhere), setProjects);
    subscribe('projectMilestones', query(collection(db, 'projectMilestones'), orgWhere), setProjectMilestones);
    subscribe('suppliers', query(collection(db, 'suppliers'), orgWhere), setSuppliers);
    subscribe('assets', query(collection(db, 'assets'), orgWhere), setAssets);
    subscribe('adminMemos', query(collection(db, 'adminMemos'), orgWhere), setAdminMemos);

    // User-scoped notifications
    subscribe('notifications', query(collection(db, 'notifications'), where('recipientUid', '==', uid)), setNotifications);

    // Role/Owner-scoped collections (aligned 1:1 with firestore.rules allow list)
    subscribe(
      'users',
      isBootstrappedAdmin ? query(collection(db, 'users')) : query(collection(db, 'users'), where('uid', '==', uid)),
      setUsers
    );

    subscribe(
      'employees',
      isBootstrappedAdmin ? query(collection(db, 'employees'), orgWhere) : query(collection(db, 'employees'), where('userId', '==', uid)),
      setEmployees
    );

    subscribe(
      'leaveRequests',
      isBootstrappedAdmin || isHRRole
        ? query(collection(db, 'leaveRequests'), orgWhere)
        : isSupOnly
          ? query(collection(db, 'leaveRequests'), where('supervisorId', '==', uid))
          : query(collection(db, 'leaveRequests'), where('userId', '==', uid)),
      setLeaveRequests
    );

    subscribe(
      'appraisals',
      isBootstrappedAdmin ? query(collection(db, 'appraisals'), orgWhere) : query(collection(db, 'appraisals'), where('employeeUserId', '==', uid)),
      setAppraisals
    );

    subscribe(
      'apprentices',
      isBootstrappedAdmin || isHRRole || isFinanceRole
        ? query(collection(db, 'apprentices'), orgWhere)
        : isSupOnly
          ? query(collection(db, 'apprentices'), where('supervisorId', '==', uid))
          : query(collection(db, 'apprentices'), where('userId', '==', uid)),
      setApprentices
    );

    subscribe(
      'apprenticeReports',
      isBootstrappedAdmin || isHRRole
        ? query(collection(db, 'apprenticeReports'), orgWhere)
        : isSupOnly
          ? query(collection(db, 'apprenticeReports'), where('supervisorId', '==', uid))
          : query(collection(db, 'apprenticeReports'), where('apprenticeUserId', '==', uid)),
      setApprenticeReports
    );

    subscribe(
      'bookReviews',
      isBootstrappedAdmin || isHRRole
        ? query(collection(db, 'bookReviews'), orgWhere)
        : isSupOnly
          ? query(collection(db, 'bookReviews'), where('supervisorId', '==', uid))
          : query(collection(db, 'bookReviews'), where('apprenticeUserId', '==', uid)),
      setBookReviews
    );

    subscribe(
      'imprestRecords',
      isBootstrappedAdmin || isFinanceRole
        ? query(collection(db, 'imprestRecords'), orgWhere)
        : profile.role === 'hr_officer'
          ? query(collection(db, 'imprestRecords'), where('category', '==', 'medical'))
          : query(collection(db, 'imprestRecords'), where('apprenticeUserId', '==', uid)),
      setImprestRecords
    );

    subscribe(
      'imprestRetirements',
      isBootstrappedAdmin || isFinanceRole
        ? query(collection(db, 'imprestRetirements'), orgWhere)
        : profile.role === 'hr_officer'
          ? query(collection(db, 'imprestRetirements'), where('category', '==', 'medical'))
          : query(collection(db, 'imprestRetirements'), where('apprenticeUserId', '==', uid)),
      setImprestRetirements
    );

    subscribe(
      'imprestReceipts',
      isBootstrappedAdmin || isFinanceRole
        ? query(collection(db, 'imprestReceipts'), orgWhere)
        : profile.role === 'hr_officer'
          ? query(collection(db, 'imprestReceipts'), where('category', '==', 'medical'))
          : query(collection(db, 'imprestReceipts'), where('apprenticeUserId', '==', uid)),
      setImprestReceipts
    );

    subscribe(
      'monthlyPdReports',
      isBootstrappedAdmin || isFinanceRole
        ? query(collection(db, 'monthlyPdReports'), orgWhere)
        : query(collection(db, 'monthlyPdReports'), where('apprenticeUserId', '==', uid)),
      setMonthlyPdReports
    );

    subscribe(
      'financeTransactions',
      isBootstrappedAdmin
        ? query(collection(db, 'financeTransactions'), orgWhere)
        : query(collection(db, 'financeTransactions'), where('requestedBy', '==', uid)),
      setFinanceTransactions
    );

    subscribe(
      'bookSales',
      isBootstrappedAdmin
        ? query(collection(db, 'bookSales'), orgWhere)
        : query(collection(db, 'bookSales'), where('cashierId', '==', uid)),
      setBookSales
    );

    subscribe(
      'procurementRequests',
      isBootstrappedAdmin
        ? query(collection(db, 'procurementRequests'), orgWhere)
        : query(collection(db, 'procurementRequests'), where('requestedBy', '==', uid)),
      setProcurementRequests
    );

    subscribe(
      'documents',
      isBootstrappedAdmin
        ? query(collection(db, 'documents'), orgWhere)
        : query(collection(db, 'documents'), where('accessScope', '==', 'all_staff')),
      setDocuments
    );

    subscribe(
      'auditLogs',
      isBootstrappedAdmin
        ? query(collection(db, 'auditLogs'), orgWhere)
        : query(collection(db, 'auditLogs'), where('actorUid', '==', uid)),
      setAuditLogs
    );

    subscribe(
      'integrationLogs',
      isBootstrappedAdmin
        ? query(collection(db, 'integrationLogs'), orgWhere)
        : query(collection(db, 'integrationLogs'), where('actorUid', '==', uid)),
      setIntegrationLogs
    );

    setLoading(false);

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [firebaseUser, profile, isBootstrappedAdmin]);

  const leavePolicy = leaveSettingsRows.find((r) => r.id === 'default') || leaveSettingsRows[0] || DEFAULT_LEAVE_POLICY;

  return (
    <DataContext.Provider
      value={{
        users,
        directory,
        departments,
        employees,
        leaveRequests,
        leavePolicy,
        appraisals,
        cohorts,
        apprentices,
        apprenticeReports,
        bookReviews,
        imprestRecords,
        imprestRetirements,
        imprestReceipts,
        monthlyPdReports,
        budgets,
        financeTransactions,
        books,
        bookSales,
        projects,
        projectMilestones,
        procurementRequests,
        suppliers,
        assets,
        documents,
        adminMemos,
        notifications,
        auditLogs,
        integrationLogs,
        loading,
        dataError,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
