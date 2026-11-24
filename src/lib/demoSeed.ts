import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, ORG_ID } from './firebase.ts';
import { OperationType, handleFirestoreError } from './firestoreError.ts';
import { recordAuditLog } from './audit.ts';

const DEMO_COLLECTIONS = [
  'departments',
  'employees',
  'leaveRequests',
  'appraisals',
  'cohorts',
  'apprentices',
  'apprenticeReports',
  'budgets',
  'financeTransactions',
  'books',
  'bookSales',
  'projects',
  'projectMilestones',
  'procurementRequests',
  'suppliers',
  'assets',
  'documents',
  'adminMemos',
] as const;

export async function seedDemoEnvironment(actor: { uid: string; name: string; role: string }): Promise<void> {
  // Remove any previously seeded demo records so re-seeding is idempotent and never triggers immutable createdAt update conflicts
  for (const colName of DEMO_COLLECTIONS) {
    try {
      const existingDemo = await getDocs(
        query(collection(db, colName), where('orgId', '==', ORG_ID), where('isDemo', '==', true))
      );
      for (const d of existingDemo.docs) {
        await deleteDoc(d.ref);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, colName);
    }
  }

  const batch = writeBatch(db);
  const now = serverTimestamp();

  // Settings (if not customized)
  batch.set(
    doc(db, 'settings', 'org'),
    {
      orgId: ORG_ID,
      orgName: 'iServe Africa',
      tagline: 'Gospel Training & Servant Leadership Across Africa',
      address: 'Ngong Road, Nairobi, Kenya',
      currency: 'KES',
      timezone: 'Africa/Nairobi',
      primaryColor: '#0d4f3c',
      accentColor: '#b45309',
      fiscalYear: 'FY 2026',
      reportingPeriod: 'Q4 2026',
      quickbooksStatus: 'credentials_required',
      mpesaStatus: 'credentials_required',
      fcmStatus: 'web_push_ready',
      updatedBy: actor.uid,
      updatedAt: now,
    },
    { merge: true }
  );

  // Departments
  const depts = [
    { id: 'demo_dept_exec', code: 'EXEC', name: 'Executive & Governance', headName: 'Wambui Kamau', description: 'Strategic leadership, board governance, and donor partnerships.', annualBudgetKes: 4200000 },
    { id: 'demo_dept_appr', code: 'APPR', name: 'Apprenticeship Programme', headName: 'David Ochieng', description: 'Ministry apprenticeship training, cohorts, and church placements.', annualBudgetKes: 8500000 },
    { id: 'demo_dept_fin', code: 'FIN', name: 'Finance & Administration', headName: 'Grace Muthoni', description: 'Financial stewardship, statutory compliance, procurement, and facilities.', annualBudgetKes: 3600000 },
    { id: 'demo_dept_book', code: 'BOOK', name: 'iServe Christian Bookstore', headName: 'Peter Kariuki', description: 'Reformed Christian literature publishing, distribution, and Nairobi retail.', annualBudgetKes: 5400000 },
    { id: 'demo_dept_proj', code: 'PROJ', name: 'Conferences & Projects', headName: 'Faith Njeri', description: 'Gospel conferences, regional training hubs, and donor initiatives.', annualBudgetKes: 6200000 },
  ];

  for (const d of depts) {
    batch.set(doc(db, 'departments', d.id), {
      orgId: ORG_ID,
      code: d.code,
      name: d.name,
      headUserId: actor.uid,
      headName: d.headName,
      description: d.description,
      annualBudgetKes: d.annualBudgetKes,
      status: 'active',
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Employees
  const emps = [
    { id: 'demo_emp_01', empNo: 'ISA-001', fullName: 'Wambui Kamau', workEmail: 'wambui@iserveafrica.org', phone: '+254 712 340 110', departmentId: 'demo_dept_exec', departmentName: 'Executive & Governance', jobTitle: 'Executive Director', employmentDate: '2019-02-01', employmentStatus: 'permanent', contractEndDate: '', qualifications: 'MDiv, BA Leadership & Management', emergencyContactName: 'Joseph Kamau', emergencyContactPhone: '+254 722 108 900', nextOfKinName: 'Joseph Kamau', nextOfKinRelation: 'Spouse', salaryKes: 285000, allowancesKes: 45000, annualLeaveBalance: 18 },
    { id: 'demo_emp_02', empNo: 'ISA-004', fullName: 'Grace Muthoni', workEmail: 'grace.m@iserveafrica.org', phone: '+254 721 445 820', departmentId: 'demo_dept_fin', departmentName: 'Finance & Administration', jobTitle: 'Senior Finance Officer', employmentDate: '2021-04-15', employmentStatus: 'permanent', contractEndDate: '', qualifications: 'CPA(K), BCom Accounting (UoN)', emergencyContactName: 'Mary Wanjiku', emergencyContactPhone: '+254 733 551 200', nextOfKinName: 'Mary Wanjiku', nextOfKinRelation: 'Mother', salaryKes: 175000, allowancesKes: 25000, annualLeaveBalance: 14 },
    { id: 'demo_emp_03', empNo: 'ISA-008', fullName: 'David Ochieng', workEmail: 'david.o@iserveafrica.org', phone: '+254 710 882 419', departmentId: 'demo_dept_appr', departmentName: 'Apprenticeship Programme', jobTitle: 'Lead Apprentice Supervisor', employmentDate: '2020-09-01', employmentStatus: 'permanent', contractEndDate: '', qualifications: 'MA Biblical Studies, Dip Theology', emergencyContactName: 'Beatrice Achieng', emergencyContactPhone: '+254 720 331 090', nextOfKinName: 'Beatrice Achieng', nextOfKinRelation: 'Spouse', salaryKes: 165000, allowancesKes: 20000, annualLeaveBalance: 21 },
    { id: 'demo_emp_04', empNo: 'ISA-012', fullName: 'Peter Kariuki', workEmail: 'peter.k@iserveafrica.org', phone: '+254 724 918 302', departmentId: 'demo_dept_book', departmentName: 'iServe Christian Bookstore', jobTitle: 'Bookstore Manager', employmentDate: '2022-01-10', employmentStatus: 'contract', contractEndDate: '2027-01-09', qualifications: 'BSc Supply Chain & Retail Operations', emergencyContactName: 'Samuel Kariuki', emergencyContactPhone: '+254 711 223 445', nextOfKinName: 'Samuel Kariuki', nextOfKinRelation: 'Brother', salaryKes: 120000, allowancesKes: 15000, annualLeaveBalance: 16 },
    { id: 'demo_emp_05', empNo: 'ISA-015', fullName: 'Faith Njeri', workEmail: 'faith.n@iserveafrica.org', phone: '+254 790 612 770', departmentId: 'demo_dept_proj', departmentName: 'Conferences & Projects', jobTitle: 'Programmes & Projects Officer', employmentDate: '2023-06-01', employmentStatus: 'contract', contractEndDate: '2026-12-31', qualifications: 'BA Project Planning & Management', emergencyContactName: 'Esther Wambui', emergencyContactPhone: '+254 725 991 340', nextOfKinName: 'Esther Wambui', nextOfKinRelation: 'Sister', salaryKes: 135000, allowancesKes: 18000, annualLeaveBalance: 12 },
  ];

  for (const e of emps) {
    const { id, ...empData } = e;
    batch.set(doc(db, 'employees', id), {
      orgId: ORG_ID,
      ...empData,
      userId: actor.uid,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Leave requests
  batch.set(doc(db, 'leaveRequests', 'demo_leave_01'), {
    orgId: ORG_ID,
    userId: 'demo_staff_faith',
    employeeName: 'Faith Njeri',
    departmentId: 'demo_dept_proj',
    leaveType: 'annual',
    startDate: '2026-12-14',
    endDate: '2026-12-23',
    daysRequested: 8,
    reason: 'Annual year-end family leave in Nyeri.',
    status: 'submitted',
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'leaveRequests', 'demo_leave_02'), {
    orgId: ORG_ID,
    userId: 'demo_staff_peter',
    employeeName: 'Peter Kariuki',
    departmentId: 'demo_dept_book',
    leaveType: 'study',
    startDate: '2026-11-30',
    endDate: '2026-12-03',
    daysRequested: 4,
    reason: 'Seminary modular intensive examinations.',
    status: 'approved',
    approverId: actor.uid,
    approverComment: 'Approved; bookstore assistant assigned counter coverage.',
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  });

  // Appraisals
  batch.set(doc(db, 'appraisals', 'demo_appr_01'), {
    orgId: ORG_ID,
    employeeUserId: actor.uid,
    employeeName: 'Peter Kariuki',
    reviewerId: actor.uid,
    reviewerName: 'Wambui Kamau',
    period: 'H2 2026',
    objectives: 'Grow church bookstall partnerships across 12 counties and maintain inventory shrinkage under 0.5%.',
    feedback: 'Exceeded Kisumu & Eldoret conference sales targets with accurate stock reconciliation.',
    developmentPlan: 'Complete QuickBooks Inventory Sync training in Q1 2027.',
    rating: 4.5,
    status: 'completed',
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  });

  // Cohorts & Apprentices
  batch.set(doc(db, 'cohorts', 'demo_cohort_2026'), {
    orgId: ORG_ID,
    name: 'Cohort 2026-A (Nairobi & Rift)',
    programme: '2-Year Ministry & Bible Handling Apprenticeship',
    startDate: '2026-01-12',
    endDate: '2027-11-30',
    coordinatorName: 'David Ochieng',
    status: 'active',
    isDemo: true,
    createdAt: now,
  });

  const apprentices = [
    { id: 'demo_app_01', apprenticeCode: 'APP-2601', fullName: 'Caleb Kiprop', email: 'caleb.k@iserveafrica.org', phone: '+254 714 220 811', region: 'Nairobi', trainingLocation: 'Trinity Fellowship, Westlands', learningObjectives: 'Expository preaching preparation, youth Bible study leadership, and pastoral visitation.', attendanceRate: 96, status: 'active' },
    { id: 'demo_app_02', apprenticeCode: 'APP-2602', fullName: 'Mercy Akinyi', email: 'mercy.a@iserveafrica.org', phone: '+254 729 501 944', region: 'Nyanza', trainingLocation: 'Grace Church, Kisumu', learningObjectives: 'Women ministry mentorship, Sunday school curriculum development, and community outreach.', attendanceRate: 92, status: 'active' },
    { id: 'demo_app_03', apprenticeCode: 'APP-2603', fullName: 'Samuel Mwangi', email: 'samuel.m@iserveafrica.org', phone: '+254 708 119 630', region: 'Rift Valley', trainingLocation: 'St. Luke Parish, Nakuru', learningObjectives: 'Campus outreach coordination, small group facilitation, and Christian apologetics.', attendanceRate: 78, status: 'needs_support' },
  ];

  for (const a of apprentices) {
    const { id, ...appData } = a;
    batch.set(doc(db, 'apprentices', id), {
      orgId: ORG_ID,
      ...appData,
      userId: actor.uid,
      cohortId: 'demo_cohort_2026',
      cohortName: 'Cohort 2026-A (Nairobi & Rift)',
      startDate: '2026-01-12',
      expectedCompletionDate: '2027-11-30',
      supervisorId: actor.uid,
      supervisorName: 'David Ochieng',
      emergencyContact: 'Parent / Next of Kin (+254 722 000 111)',
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Apprentice Reports
  batch.set(doc(db, 'apprenticeReports', 'demo_rep_01'), {
    orgId: ORG_ID,
    apprenticeId: 'demo_app_01',
    apprenticeUserId: 'demo_app_user_caleb',
    apprenticeName: 'Caleb Kiprop',
    supervisorId: actor.uid,
    reportType: 'weekly',
    periodStart: '2026-11-16',
    periodEnd: '2026-11-22',
    activities: 'Led three campus small-group studies in Ephesians 2; shadowed senior pastor during hospital visitation and prepared sermon outline for Sunday evening service.',
    lessonsLearned: 'Observed how careful passage structure clarifies gospel application without rushing to moralism.',
    challenges: 'Balancing mid-week Greek reading assignments with outreach travel across Westlands.',
    reflections: 'Grateful for candid feedback from mentor during Friday review session.',
    attachmentName: 'ephesians2_study_notes.pdf',
    status: 'submitted',
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'apprenticeReports', 'demo_rep_02'), {
    orgId: ORG_ID,
    apprenticeId: 'demo_app_02',
    apprenticeUserId: 'demo_app_user_mercy',
    apprenticeName: 'Mercy Akinyi',
    supervisorId: actor.uid,
    reportType: 'monthly',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    activities: 'Trained 14 Sunday school teachers in Kisumu; completed two book summaries and organised regional youth conference logistics.',
    lessonsLearned: 'Team delegation significantly improved attendance consistency among volunteer teachers.',
    challenges: 'Delayed printing of Luganda/Swahili worksheets.',
    reflections: 'Strong growth in confidence leading mixed-age workshops.',
    status: 'approved',
    supervisorComment: 'Thorough monthly reflection and clear pedagogical progress.',
    evaluationScore: 5,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  });

  // Budgets
  const budgets = [
    { id: 'demo_bud_01', title: 'Apprenticeship Stipends & Mentorship FY26', scope: 'departmental', departmentId: 'demo_dept_appr', departmentName: 'Apprenticeship Programme', category: 'Training & Stipends', allocatedKes: 8500000, spentKes: 6120000 },
    { id: 'demo_bud_02', title: 'Bookstore Stock Procurement & Logistics', scope: 'departmental', departmentId: 'demo_dept_book', departmentName: 'iServe Christian Bookstore', category: 'Inventory & Publishing', allocatedKes: 5400000, spentKes: 3890000 },
    { id: 'demo_bud_03', title: 'Regional Gospel Conferences 2026', scope: 'project', departmentId: 'demo_dept_proj', departmentName: 'Conferences & Projects', projectId: 'demo_proj_01', category: 'Events & Venues', allocatedKes: 6200000, spentKes: 4450000 },
    { id: 'demo_bud_04', title: 'Nairobi Hub Operations & Utilities', scope: 'organisational', departmentId: 'demo_dept_fin', departmentName: 'Finance & Administration', category: 'Facilities & Admin', allocatedKes: 3600000, spentKes: 2580000 },
  ];

  for (const b of budgets) {
    const { id, ...budData } = b;
    batch.set(doc(db, 'budgets', id), {
      orgId: ORG_ID,
      fiscalYear: 'FY 2026',
      status: 'active',
      createdBy: actor.uid,
      ...budData,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Finance Transactions
  const txs = [
    { id: 'demo_tx_01', txNumber: 'PAY-2026-104', txType: 'payment_request', title: 'Cohort 2026 Training Venue Catering (November)', category: 'Events & Venues', departmentId: 'demo_dept_appr', departmentName: 'Apprenticeship Programme', projectId: 'demo_proj_01', projectName: 'East Africa Expository Conference', amountKes: 184500, payee: 'Karen Hospitality Services Ltd', description: '5-day residential workshop catering for 42 apprentices and trainers.', receiptRef: 'INV-KHS-882', requestedBy: 'demo_staff_david', requestedByName: 'David Ochieng', status: 'pending_approval', qbSyncStatus: 'credentials_required' },
    { id: 'demo_tx_02', txNumber: 'EXP-2026-219', txType: 'expense', title: 'Kisumu Conference Travel & Fuel Reimbursement', category: 'Travel & Transport', departmentId: 'demo_dept_proj', departmentName: 'Conferences & Projects', projectId: 'demo_proj_01', projectName: 'East Africa Expository Conference', amountKes: 42800, payee: 'Faith Njeri', description: 'Return mileage and accommodation for regional conference site inspection.', receiptRef: 'RCP-44019', requestedBy: 'demo_staff_faith', requestedByName: 'Faith Njeri', status: 'approved', approverId: actor.uid, approverName: 'Grace Muthoni', approvalComment: 'Receipts verified against travel policy.', qbSyncStatus: 'credentials_required' },
    { id: 'demo_tx_03', txNumber: 'IMP-2026-038', txType: 'petty_cash', title: 'Nairobi Office Petty Cash Float Replenishment', category: 'Office Supplies', departmentId: 'demo_dept_fin', departmentName: 'Finance & Administration', amountKes: 35000, payee: 'Nairobi Front Desk Imprest', description: 'Courier postage, stationery, and hospitality tea supplies.', receiptRef: 'PC-2026-038', requestedBy: 'demo_staff_grace', requestedByName: 'Grace Muthoni', status: 'paid', approverId: actor.uid, approverName: 'Wambui Kamau', qbSyncStatus: 'credentials_required' },
    { id: 'demo_tx_04', txNumber: 'INC-2026-091', txType: 'income', title: 'Q4 Donor Grant Tranche — Gospel Partnerships UK', category: 'Donor Grants', departmentId: 'demo_dept_exec', departmentName: 'Executive & Governance', projectId: 'demo_proj_02', projectName: 'Rural Pastors Library Fund', amountKes: 3250000, payee: 'iServe Africa Main Account', description: 'Restricted project disbursement for rural pastors library distribution.', receiptRef: 'SWIFT-GP-2026Q4', requestedBy: actor.uid, requestedByName: actor.name, status: 'paid', qbSyncStatus: 'credentials_required' },
  ];

  for (const t of txs) {
    const { id, ...txData } = t;
    batch.set(doc(db, 'financeTransactions', id), {
      orgId: ORG_ID,
      ...txData,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Books & Sales
  const books = [
    { id: 'demo_book_01', isbn: '978-1-84474-901-2', title: 'Dig Deeper: Tools for Understanding God’s Word', author: 'Nigel Beynon & Andrew Sach', publisher: 'IVP / iServe Press', category: 'Biblical Studies', description: 'Practical Bible reading tools widely used across iServe Africa apprenticeship cohorts.', costKes: 680, priceKes: 1200, stockQty: 84, reorderLevel: 20 },
    { id: 'demo_book_02', isbn: '978-1-91051-112-4', title: 'The Gospel-Driven Church in East Africa', author: 'Conrad Mbewe & Local Contributors', publisher: 'African Christian Press', category: 'Pastoral Ministry', description: 'Biblical ecclesiology and pastoral leadership grounded in African church realities.', costKes: 850, priceKes: 1550, stockQty: 42, reorderLevel: 15 },
    { id: 'demo_book_03', isbn: '978-0-85111-442-0', title: 'The Cross of Christ (Study Edition)', author: 'John Stott', publisher: 'IVP', category: 'Theology', description: 'Classic theological exposition of the atonement with group study guide.', costKes: 1100, priceKes: 1950, stockQty: 11, reorderLevel: 15 },
    { id: 'demo_book_04', isbn: '978-1-78498-204-1', title: 'Servant Leadership in Ministry', author: 'iServe Africa Training Team', publisher: 'iServe Publishing', category: 'Apprenticeship Core', description: 'Foundational handbook for first-year gospel ministry apprentices in Kenya.', costKes: 450, priceKes: 900, stockQty: 126, reorderLevel: 25 },
  ];

  for (const bk of books) {
    const { id, ...bookData } = bk;
    batch.set(doc(db, 'books', id), {
      orgId: ORG_ID,
      ...bookData,
      imageUrl: '/src/assets/images/book_cover_theology_1795437880255.jpg',
      status: 'active',
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  batch.set(doc(db, 'bookSales', 'demo_sale_01'), {
    orgId: ORG_ID,
    receiptNo: 'POS-2026-0812',
    cashierId: actor.uid,
    cashierName: 'Peter Kariuki',
    customerName: 'Nairobi Baptist Youth Fellowship',
    paymentMethod: 'mpesa',
    paymentRef: 'UJK84M219P',
    subtotalKes: 12000,
    discountKes: 600,
    totalKes: 11400,
    itemCount: 10,
    itemsSummary: '10x Dig Deeper: Tools for Understanding God’s Word',
    qbSyncStatus: 'credentials_required',
    isDemo: true,
    createdAt: now,
  });

  // Projects
  batch.set(doc(db, 'projects', 'demo_proj_01'), {
    orgId: ORG_ID,
    code: 'PRJ-CONF-26',
    title: 'East Africa Expository Preaching Conference',
    description: 'Annual flagship training gathering equipping 450 pastors and apprentices across Kenya, Uganda, and Tanzania.',
    donorFunded: true,
    donorName: 'Langham & Gospel Partnerships Trust',
    departmentId: 'demo_dept_proj',
    departmentName: 'Conferences & Projects',
    officerId: actor.uid,
    officerName: 'Faith Njeri',
    objectives: 'Train 450 church leaders in expository Bible handling; distribute 1,200 foundational commentaries.',
    budgetKes: 6200000,
    spentKes: 4450000,
    progressPct: 78,
    startDate: '2026-03-01',
    endDate: '2026-12-15',
    status: 'active',
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'projects', 'demo_proj_02'), {
    orgId: ORG_ID,
    code: 'PRJ-LIB-26',
    title: 'Rural Pastors Library Fund',
    description: 'Subsidised theological book packs delivered to 180 rural congregations across Rift Valley and Western Kenya.',
    donorFunded: true,
    donorName: 'Gospel Partnerships UK',
    departmentId: 'demo_dept_book',
    departmentName: 'iServe Christian Bookstore',
    officerId: actor.uid,
    officerName: 'Peter Kariuki',
    objectives: 'Deliver 180 starter pastoral libraries of 12 titles each and conduct follow-up reading workshops.',
    budgetKes: 3250000,
    spentKes: 1940000,
    progressPct: 62,
    startDate: '2026-05-01',
    endDate: '2027-02-28',
    status: 'active',
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  });

  // Project Milestones & Deliverables (for Gantt visualization)
  const milestones = [
    {
      id: 'demo_ms_01',
      projectId: 'demo_proj_01',
      projectCode: 'PRJ-CONF-26',
      projectTitle: 'East Africa Expository Preaching Conference',
      title: 'Keynote Speakers & Venue Contract Signed',
      kind: 'milestone',
      ownerName: 'Faith Njeri',
      startDate: '2026-03-15',
      endDate: '2026-03-15',
      progressPct: 100,
      status: 'completed',
      notes: 'Brackenhurst Conference Centre reserved and speaker invitations confirmed.',
    },
    {
      id: 'demo_ms_02',
      projectId: 'demo_proj_01',
      projectCode: 'PRJ-CONF-26',
      projectTitle: 'East Africa Expository Preaching Conference',
      title: 'Regional Pastor Registration & Travel Subsidies',
      kind: 'deliverable',
      ownerName: 'Faith Njeri',
      startDate: '2026-04-01',
      endDate: '2026-08-31',
      progressPct: 100,
      status: 'completed',
      notes: '450 delegates registered across Kenya, Uganda, and Tanzania dioceses.',
    },
    {
      id: 'demo_ms_03',
      projectId: 'demo_proj_01',
      projectCode: 'PRJ-CONF-26',
      projectTitle: 'East Africa Expository Preaching Conference',
      title: 'Commentary Pack Printing & Study Guides',
      kind: 'deliverable',
      ownerName: 'Peter Kariuki',
      startDate: '2026-08-15',
      endDate: '2026-11-15',
      progressPct: 82,
      status: 'delayed',
      notes: '1,000 of 1,200 commentary packs bound; final Swahili syllabus batch awaiting press delivery.',
    },
    {
      id: 'demo_ms_04',
      projectId: 'demo_proj_01',
      projectCode: 'PRJ-CONF-26',
      projectTitle: 'East Africa Expository Preaching Conference',
      title: 'Main Conference Week & Donor Impact Report',
      kind: 'deliverable',
      ownerName: 'Wambui Kamau',
      startDate: '2026-11-18',
      endDate: '2026-12-15',
      progressPct: 45,
      status: 'in_progress',
      notes: 'Logistics team deployed; post-conference financial & impact evaluation due mid-December.',
    },
    {
      id: 'demo_ms_05',
      projectId: 'demo_proj_02',
      projectCode: 'PRJ-LIB-26',
      projectTitle: 'Rural Pastors Library Fund',
      title: 'Curriculum Selection & UK Grant Tranche Release',
      kind: 'milestone',
      ownerName: 'Peter Kariuki',
      startDate: '2026-05-10',
      endDate: '2026-05-10',
      progressPct: 100,
      status: 'completed',
      notes: '12-title core pastoral library list approved by advisory board.',
    },
    {
      id: 'demo_ms_06',
      projectId: 'demo_proj_02',
      projectCode: 'PRJ-LIB-26',
      projectTitle: 'Rural Pastors Library Fund',
      title: 'Phase 1 Book Procurement & Rift Valley Dispatch',
      kind: 'deliverable',
      ownerName: 'Peter Kariuki',
      startDate: '2026-06-01',
      endDate: '2026-10-15',
      progressPct: 100,
      status: 'completed',
      notes: '105 starter libraries delivered across Nakuru, Eldoret, and Kitale.',
    },
    {
      id: 'demo_ms_07',
      projectId: 'demo_proj_02',
      projectCode: 'PRJ-LIB-26',
      projectTitle: 'Rural Pastors Library Fund',
      title: 'Phase 2 Western Kenya Hub Distribution',
      kind: 'deliverable',
      ownerName: 'David Ochieng',
      startDate: '2026-10-16',
      endDate: '2027-01-20',
      progressPct: 40,
      status: 'in_progress',
      notes: '75 libraries packed at Nairobi warehouse for Kisumu, Kakamega, and Bungoma.',
    },
    {
      id: 'demo_ms_08',
      projectId: 'demo_proj_02',
      projectCode: 'PRJ-LIB-26',
      projectTitle: 'Rural Pastors Library Fund',
      title: 'Follow-Up Reading Workshops & Audit Closeout',
      kind: 'deliverable',
      ownerName: 'David Ochieng',
      startDate: '2027-01-15',
      endDate: '2027-02-28',
      progressPct: 0,
      status: 'planned',
      notes: 'Regional mentor workshops scheduled for February 2027.',
    },
  ];

  for (const ms of milestones) {
    const { id, ...msData } = ms;
    batch.set(doc(db, 'projectMilestones', id), {
      orgId: ORG_ID,
      ...msData,
      createdBy: actor.uid,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Procurement, Suppliers, Assets, Documents, Memos
  batch.set(doc(db, 'procurementRequests', 'demo_proc_01'), {
    orgId: ORG_ID,
    reqNo: 'PR-2026-047',
    title: 'Apprentice Study Tablets (12 Units) for Field Reporting',
    departmentId: 'demo_dept_appr',
    departmentName: 'Apprenticeship Programme',
    supplierName: 'Sarit Digital Solutions Ltd',
    category: 'ICT Equipment',
    estimatedKes: 348000,
    justification: 'Enable field apprentices in remote placements to capture offline reports and sync cleanly.',
    requestedBy: 'demo_staff_david',
    requestedByName: 'David Ochieng',
    status: 'submitted',
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'suppliers', 'demo_sup_01'), {
    orgId: ORG_ID,
    name: 'African Christian Press (ACP)',
    contactPerson: 'Daniel Mensah',
    email: 'orders@acp-books.org',
    phone: '+254 733 410 220',
    category: 'Book Publisher',
    kraPin: 'P051884210K',
    outstandingKes: 245000,
    status: 'active',
    isDemo: true,
    createdAt: now,
  });

  batch.set(doc(db, 'suppliers', 'demo_sup_02'), {
    orgId: ORG_ID,
    name: 'Sarit Digital Solutions Ltd',
    contactPerson: 'Brian Mwenda',
    email: 'sales@saritdigital.co.ke',
    phone: '+254 720 662 108',
    category: 'ICT & Office Equipment',
    kraPin: 'P051992341M',
    outstandingKes: 0,
    status: 'active',
    isDemo: true,
    createdAt: now,
  });

  batch.set(doc(db, 'assets', 'demo_ast_01'), {
    orgId: ORG_ID,
    assetTag: 'ISA-AST-019',
    name: 'Toyota Land Cruiser Prado (Ministry Field Vehicle)',
    category: 'Motor Vehicles',
    purchaseDate: '2023-08-14',
    purchaseCostKes: 6400000,
    assignedToName: 'Apprenticeship Supervision Team',
    departmentId: 'demo_dept_appr',
    location: 'Nairobi Head Office',
    condition: 'good',
    status: 'active',
    checkoutStatus: 'checked_out',
    checkedOutTo: 'David Ochieng',
    checkedOutAt: '2026-11-22T08:30:00Z',
    isDemo: true,
    createdAt: now,
  });

  batch.set(doc(db, 'assets', 'demo_ast_02'), {
    orgId: ORG_ID,
    assetTag: 'ISA-AST-042',
    name: 'Bookstore Thermal POS Terminal & Barcode Scanner',
    category: 'Retail Hardware',
    purchaseDate: '2025-02-10',
    purchaseCostKes: 68500,
    assignedToName: 'Peter Kariuki',
    departmentId: 'demo_dept_book',
    location: 'Ngong Road Bookstore',
    condition: 'excellent',
    status: 'active',
    checkoutStatus: 'available',
    isDemo: true,
    createdAt: now,
  });

  batch.set(doc(db, 'documents', 'demo_doc_01'), {
    orgId: ORG_ID,
    title: 'iServe Africa Staff & Safeguarding Policy Handbook (2026)',
    category: 'Governance & HR Policy',
    departmentId: 'demo_dept_exec',
    departmentName: 'Executive & Governance',
    accessScope: 'all_staff',
    version: 'v3.2',
    fileName: 'iServe_Staff_Safeguarding_Policy_2026.pdf',
    fileSizeKb: 1420,
    summary: 'Comprehensive employment policies, Kenya Data Protection Act compliance guidelines, leave entitlements, and child/vulnerable adult safeguarding standards.',
    uploadedBy: actor.uid,
    uploadedByName: actor.name,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'documents', 'demo_doc_02'), {
    orgId: ORG_ID,
    title: 'Apprenticeship Field Reporting & Evaluation Guide',
    category: 'Apprenticeship Manual',
    departmentId: 'demo_dept_appr',
    departmentName: 'Apprenticeship Programme',
    accessScope: 'all_staff',
    version: 'v2.0',
    fileName: 'Apprenticeship_Reporting_Guide.pdf',
    fileSizeKb: 840,
    summary: 'Guidelines for weekly ministry logs, monthly theological reflections, and supervisor 5-point rubric evaluations.',
    uploadedBy: actor.uid,
    uploadedByName: actor.name,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'adminMemos', 'demo_memo_01'), {
    orgId: ORG_ID,
    recordType: 'event',
    title: 'Annual General Ministry Review & Prayer Day',
    body: 'All Nairobi staff, regional supervisors, and Cohort 2026 apprentices are invited to the Ngong Road centre for annual review, thanksgiving, and Q1 2027 planning.',
    eventDate: '2026-12-04',
    location: 'iServe Africa Main Hall, Nairobi',
    departmentId: 'demo_dept_exec',
    authorId: actor.uid,
    authorName: actor.name,
    isDemo: true,
    createdAt: now,
  });

  batch.set(doc(db, 'adminMemos', 'demo_memo_02'), {
    orgId: ORG_ID,
    recordType: 'memo',
    title: 'Year-End Financial Cutoff & Imprest Retirement Notice',
    body: 'Please submit all pending payment requests and retire outstanding petty cash imprests before 18th December 2026 for FY 2026 audit preparation.',
    eventDate: '2026-12-18',
    location: 'Finance Department',
    departmentId: 'demo_dept_fin',
    authorId: actor.uid,
    authorName: actor.name,
    isDemo: true,
    createdAt: now,
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'demoSeed/batch');
  }

  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: 'SEED_DEMO_DATA',
    targetCollection: 'system',
    targetId: 'demo_environment',
    summary: 'Initialised clearly tagged Demonstration Dataset (isDemo=true) for iServe Africa IMS evaluation.',
  });
}

export async function clearDemoEnvironment(actor: { uid: string; name: string; role: string }): Promise<number> {
  let deletedCount = 0;
  for (const colName of DEMO_COLLECTIONS) {
    try {
      const snap = await getDocs(
        query(collection(db, colName), where('orgId', '==', ORG_ID), where('isDemo', '==', true))
      );
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
        deletedCount += 1;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, colName);
    }
  }
  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: 'CLEAR_DEMO_DATA',
    targetCollection: 'system',
    targetId: 'demo_environment',
    summary: `Removed ${deletedCount} demonstration records (isDemo=true) leaving production data untouched.`,
  });
  return deletedCount;
}
