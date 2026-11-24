import { ModuleKey, RoleId } from '../types/erp.ts';

export interface RoleDefinition {
  id: RoleId;
  label: string;
  tier: 'Privileged' | 'Management' | 'Operations' | 'Participant';
  mfaRequired: boolean;
  description: string;
  modules: ModuleKey[];
  capabilities: string[];
}

export const ROLE_DEFINITIONS: Record<RoleId, RoleDefinition> = {
  super_admin: {
    id: 'super_admin',
    label: 'Super Administrator',
    tier: 'Privileged',
    mfaRequired: true,
    description: 'Full system configuration, user & role provisioning, permissions, audit trails, and cross-module oversight.',
    modules: ['dashboard', 'approvals', 'finance', 'hr', 'apprenticeship', 'bookstore', 'projects', 'procurement', 'documents', 'reports', 'governance', 'mobile_sync'],
    capabilities: ['Manage Users & Roles', 'Configure Settings & Branding', 'View Audit Logs', 'Approve All Workflows', 'Seed/Clear Demo Data'],
  },
  executive_director: {
    id: 'executive_director',
    label: 'Executive Director',
    tier: 'Privileged',
    mfaRequired: true,
    description: 'Executive oversight, strategic analytics, senior approvals, HR & financial governance, and donor reporting.',
    modules: ['dashboard', 'approvals', 'finance', 'hr', 'apprenticeship', 'bookstore', 'projects', 'procurement', 'documents', 'reports', 'governance', 'mobile_sync'],
    capabilities: ['Executive Dashboard', 'Manage Users & Roles', 'Final Financial & Leave Approvals', 'Donor & Board Reporting', 'View Audit Logs'],
  },
  senior_management: {
    id: 'senior_management',
    label: 'Senior Management',
    tier: 'Privileged',
    mfaRequired: true,
    description: 'Cross-departmental leadership, budget performance monitoring, procurement approvals, and HR reviews.',
    modules: ['dashboard', 'approvals', 'finance', 'hr', 'apprenticeship', 'bookstore', 'projects', 'procurement', 'documents', 'reports', 'governance'],
    capabilities: ['Departmental Oversight', 'Manage Users & Roles', 'Budget & Expenditure Review', 'Approve Requisitions & Leave', 'Management Reports'],
  },
  finance_officer: {
    id: 'finance_officer',
    label: 'Finance Officer',
    tier: 'Privileged',
    mfaRequired: true,
    description: 'Budgets, payment processing, expense tracking, petty cash imprest, QuickBooks sync, and financial reporting.',
    modules: ['dashboard', 'approvals', 'finance', 'bookstore', 'projects', 'procurement', 'documents', 'reports'],
    capabilities: ['Manage Budgets', 'Process Payments & Petty Cash', 'QuickBooks Integration Sync', 'Financial PDF/Excel Exports'],
  },
  hr_officer: {
    id: 'hr_officer',
    label: 'HR Officer',
    tier: 'Privileged',
    mfaRequired: true,
    description: 'User account provisioning, employee records, contracts, leave verification, appraisals, payroll metadata, and apprentice HR compliance.',
    modules: ['dashboard', 'approvals', 'hr', 'apprenticeship', 'documents', 'reports', 'governance'],
    capabilities: ['Manage Users & Roles', 'Manage Employee Records', 'Verify Leave & Contracts', 'Performance Appraisals', 'HR & Apprentice Compliance Reports'],
  },
  department_head: {
    id: 'department_head',
    label: 'Department Head',
    tier: 'Management',
    mfaRequired: false,
    description: 'Departmental leadership, staff leave endorsement, departmental project oversight, and requisitions.',
    modules: ['dashboard', 'approvals', 'hr', 'apprenticeship', 'projects', 'procurement', 'documents', 'reports'],
    capabilities: ['Approve Department Leave', 'Review Departmental Requests', 'Manage Department Projects'],
  },
  project_officer: {
    id: 'project_officer',
    label: 'Project Officer',
    tier: 'Operations',
    mfaRequired: false,
    description: 'Manage registered projects, donor-funded budgets, milestones, deliverables, and progress reports.',
    modules: ['dashboard', 'projects', 'finance', 'procurement', 'documents', 'reports'],
    capabilities: ['Register & Update Projects', 'Track Milestones & Deliverables', 'Submit Project Expenses', 'Donor Progress Reports'],
  },
  bookstore_manager: {
    id: 'bookstore_manager',
    label: 'Bookstore Manager',
    tier: 'Operations',
    mfaRequired: false,
    description: 'Bookstore catalogue pricing, stock valuation, POS operations, suppliers, purchase orders, and sales analytics.',
    modules: ['dashboard', 'bookstore', 'procurement', 'finance', 'documents', 'reports'],
    capabilities: ['Manage Book Catalogue & Pricing', 'POS Terminal & Discounts', 'Stock Adjustments & Suppliers', 'Bookstore Profit Reports'],
  },
  bookstore_assistant: {
    id: 'bookstore_assistant',
    label: 'Bookstore Assistant',
    tier: 'Operations',
    mfaRequired: false,
    description: 'Point-of-sale checkout, receipt generation, and live stock lookup.',
    modules: ['dashboard', 'bookstore', 'documents'],
    capabilities: ['POS Checkout & Receipts', 'Book Catalogue Lookup', 'Stock Level Monitoring'],
  },
  apprentice_supervisor: {
    id: 'apprentice_supervisor',
    label: 'Apprentice Supervisor',
    tier: 'Management',
    mfaRequired: false,
    description: 'Review and evaluate apprentice reports, monitor attendance, and flag apprentices needing support.',
    modules: ['dashboard', 'approvals', 'apprenticeship', 'hr', 'documents', 'reports', 'mobile_sync'],
    capabilities: ['Review & Score Apprentice Reports', 'Monitor Attendance & Objectives', 'Approve Leave Requests'],
  },
  staff_member: {
    id: 'staff_member',
    label: 'Staff Member',
    tier: 'Participant',
    mfaRequired: false,
    description: 'Submit leave applications, payment/expense requests, access staff directory, and view shared documents.',
    modules: ['dashboard', 'finance', 'hr', 'procurement', 'documents', 'mobile_sync'],
    capabilities: ['Apply for Leave', 'Submit Expense & Payment Requests', 'View Staff Directory & Memos', 'Offline Draft Capture'],
  },
  apprentice: {
    id: 'apprentice',
    label: 'Apprentice',
    tier: 'Participant',
    mfaRequired: false,
    description: 'Apprentice Portal for reports, book reviews, annual leave management, imprest accountability, and monthly PD reports.',
    modules: ['dashboard', 'apprenticeship', 'hr', 'documents', 'mobile_sync'],
    capabilities: [
      'Apprentice Reports & Drafts',
      'Book Reviews',
      'Annual Leave Management (10 Days)',
      'Imprest Retirement & Receipts',
      'Monthly Personal Development Reports',
    ],
  },
};

export const ALL_ROLES: RoleDefinition[] = Object.values(ROLE_DEFINITIONS);

export function canAccessModule(role: RoleId, moduleKey: ModuleKey): boolean {
  return ROLE_DEFINITIONS[role]?.modules.includes(moduleKey) ?? false;
}

export function isPrivilegedRole(role: RoleId): boolean {
  return ROLE_DEFINITIONS[role]?.mfaRequired ?? false;
}
