import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Users,
  Settings,
  ScrollText,
  Plus,
  Edit3,
  Database,
  Trash2,
  FileDown,
  FileSpreadsheet,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
} from 'lucide-react';
import { collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { ORG_ID, db } from '../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import { recordAuditLog } from '../lib/audit.ts';
import { ALL_ROLES, ROLE_DEFINITIONS } from '../lib/rbac.ts';
import { clearDemoEnvironment, seedDemoEnvironment } from '../lib/demoSeed.ts';
import { exportToExcel, exportToPdf } from '../lib/exports.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../components/ui/DataTable.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx';
import { StatusText } from '../components/ui/StatusText.tsx';
import {
  AuditLogEntry,
  Department,
  DirectoryEntry,
  RoleId,
  UserAccount,
  formatKes,
  formatNairobiDateTime,
} from '../types/erp.ts';

type GovTab = 'users' | 'departments' | 'settings' | 'audit';

interface MergedUserRow {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  role: RoleId;
  departmentId: string;
  departmentName: string;
  jobTitle: string;
  status: 'active' | 'inactive' | 'pending';
  mfaEnforced: boolean;
  hasFullAccountDoc: boolean;
}

export function GovernancePage() {
  const { profile, effectiveRole, orgSettings } = useAuth();
  const { users, directory, departments, auditLogs, integrationLogs } = useData();

  const [tab, setTab] = useState<GovTab>('users');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Department Modal State
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptCode, setDeptCode] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptHeadName, setDeptHeadName] = useState('');
  const [deptBudget, setDeptBudget] = useState('0');
  const [deptDesc, setDeptDesc] = useState('');
  const [deptStatus, setDeptStatus] = useState<'active' | 'inactive'>('active');

  // User Add / Edit Modal State
  const [userModalMode, setUserModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingUser, setEditingUser] = useState<MergedUserRow | null>(null);
  const [uDisplayName, setUDisplayName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPhone, setUPhone] = useState('');
  const [uRole, setURole] = useState<RoleId>('staff_member');
  const [uDeptId, setUDeptId] = useState('');
  const [uJobTitle, setUJobTitle] = useState('');
  const [uStatus, setUStatus] = useState<'active' | 'inactive' | 'pending'>('active');
  const [uMfa, setUMfa] = useState(false);
  const [uFormErrors, setUFormErrors] = useState<
    Partial<Record<'displayName' | 'email' | 'phone' | 'jobTitle' | 'role', string>>
  >({});
  const [uFormSummaryError, setUFormSummaryError] = useState<string | null>(null);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<MergedUserRow | null>(null);

  // Settings Form State
  const [sOrgName, setSOrgName] = useState(orgSettings.orgName || 'iServe Africa');
  const [sTagline, setSTagline] = useState(orgSettings.tagline || '');
  const [sAddress, setSAddress] = useState(orgSettings.address || 'Ngong Road, Nairobi, Kenya');
  const [sPrimaryColor, setSPrimaryColor] = useState(orgSettings.primaryColor || '#0d4f3c');
  const [sAccentColor, setSAccentColor] = useState(orgSettings.accentColor || '#b45309');
  const [sFiscalYear, setSFiscalYear] = useState(orgSettings.fiscalYear || 'FY 2026');
  const [sPeriod, setSPeriod] = useState(orgSettings.reportingPeriod || 'Q4 2026');
  const [sCurrency, setSCurrency] = useState(orgSettings.currency || 'KES');
  const [sTimezone, setSTimezone] = useState(orgSettings.timezone || 'Africa/Nairobi');

  useEffect(() => {
    setSOrgName(orgSettings.orgName || 'iServe Africa');
    setSTagline(orgSettings.tagline || '');
    setSAddress(orgSettings.address || 'Ngong Road, Nairobi, Kenya');
    setSPrimaryColor(orgSettings.primaryColor || '#0d4f3c');
    setSAccentColor(orgSettings.accentColor || '#b45309');
    setSFiscalYear(orgSettings.fiscalYear || 'FY 2026');
    setSPeriod(orgSettings.reportingPeriod || 'Q4 2026');
    setSCurrency(orgSettings.currency || 'KES');
    setSTimezone(orgSettings.timezone || 'Africa/Nairobi');
  }, [orgSettings]);

  // Confirm Dialogs
  const [confirmSeedOpen, setConfirmSeedOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmUserSaveOpen, setConfirmUserSaveOpen] = useState(false);

  const isAdmin = effectiveRole === 'super_admin';
  const isExecutive = ['super_admin', 'executive_director', 'senior_management'].includes(effectiveRole);
  const canManageUsers = ['super_admin', 'hr_officer', 'executive_director', 'senior_management'].includes(
    effectiveRole
  );

  const mergedUsers = useMemo<MergedUserRow[]>(() => {
    const map = new Map<string, MergedUserRow>();
    directory.forEach((d: DirectoryEntry) => {
      map.set(d.uid, {
        uid: d.uid,
        displayName: d.displayName,
        email: '',
        phone: '',
        role: d.role,
        departmentId: d.departmentId || '',
        departmentName: d.departmentName || '',
        jobTitle: d.jobTitle || '',
        status: d.status,
        mfaEnforced: ROLE_DEFINITIONS[d.role]?.mfaRequired ?? false,
        hasFullAccountDoc: false,
      });
    });
    users.forEach((u: UserAccount) => {
      const existing = map.get(u.uid);
      map.set(u.uid, {
        uid: u.uid,
        displayName: u.displayName || existing?.displayName || 'User',
        email: u.email,
        phone: u.phone || '',
        role: u.role,
        departmentId: u.departmentId || existing?.departmentId || '',
        departmentName: u.departmentName || existing?.departmentName || '',
        jobTitle: u.jobTitle || existing?.jobTitle || '',
        status: u.status,
        mfaEnforced: u.mfaEnforced,
        hasFullAccountDoc: true,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users, directory]);

  const showToast = (tone: 'success' | 'error', text: string) => {
    setNotice({ tone, text });
    setTimeout(() => setNotice(null), 5000);
  };

  const openNewDept = () => {
    setEditingDept(null);
    setDeptCode('');
    setDeptName('');
    setDeptHeadName('');
    setDeptBudget('1000000');
    setDeptDesc('');
    setDeptStatus('active');
    setDeptModalOpen(true);
  };

  const openEditDept = (dept: Department) => {
    setEditingDept(dept);
    setDeptCode(dept.code);
    setDeptName(dept.name);
    setDeptHeadName(dept.headName || '');
    setDeptBudget(String(dept.annualBudgetKes));
    setDeptDesc(dept.description || '');
    setDeptStatus(dept.status);
    setDeptModalOpen(true);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const budgetNum = Math.max(0, Number(deptBudget) || 0);
    const id = editingDept ? editingDept.id : doc(collection(db, 'departments')).id;
    const ref = doc(db, 'departments', id);

    try {
      if (editingDept) {
        await updateDoc(ref, {
          orgId: ORG_ID,
          code: deptCode.trim().toUpperCase(),
          name: deptName.trim(),
          headUserId: editingDept.headUserId || profile.uid,
          headName: deptHeadName.trim(),
          description: deptDesc.trim(),
          annualBudgetKes: budgetNum,
          status: deptStatus,
          isDemo: editingDept.isDemo ?? false,
          createdAt: editingDept.createdAt,
          updatedAt: serverTimestamp(),
        });
        await recordAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: 'UPDATE_DEPARTMENT',
          targetCollection: 'departments',
          targetId: id,
          summary: `Updated department ${deptCode.trim().toUpperCase()} — ${deptName.trim()}`,
        });
      } else {
        await setDoc(ref, {
          orgId: ORG_ID,
          code: deptCode.trim().toUpperCase(),
          name: deptName.trim(),
          headUserId: profile.uid,
          headName: deptHeadName.trim(),
          description: deptDesc.trim(),
          annualBudgetKes: budgetNum,
          status: deptStatus,
          isDemo: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: 'CREATE_DEPARTMENT',
          targetCollection: 'departments',
          targetId: id,
          summary: `Created department ${deptCode.trim().toUpperCase()} — ${deptName.trim()} (${formatKes(budgetNum)})`,
        });
      }
      setDeptModalOpen(false);
      showToast('success', `Department ${deptName.trim()} saved.`);
    } catch (err) {
      handleFirestoreError(err, editingDept ? OperationType.UPDATE : OperationType.CREATE, `departments/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const clearUserFieldError = (field: 'displayName' | 'email' | 'phone' | 'jobTitle' | 'role') => {
    setUFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setUFormSummaryError(null);
  };

  const closeUserModal = () => {
    setUserModalMode(null);
    setEditingUser(null);
    setUFormErrors({});
    setUFormSummaryError(null);
    setLoadingUserDetail(false);
  };

  const openAddUser = () => {
    setEditingUser(null);
    setUDisplayName('');
    setUEmail('');
    setUPhone('');
    setURole('staff_member');
    setUDeptId('');
    setUJobTitle('');
    setUStatus('active');
    setUMfa(false);
    setUFormErrors({});
    setUFormSummaryError(null);
    setLoadingUserDetail(false);
    setUserModalMode('create');
  };

  const openEditUser = (row: MergedUserRow) => {
    if (!isAdmin && row.role === 'super_admin') {
      showToast('error', 'Super Administrator accounts can only be modified by a Super Administrator.');
      return;
    }
    setEditingUser(row);
    setUDisplayName(row.displayName);
    setUEmail(row.email);
    setUPhone(row.phone || '');
    setURole(row.role);
    setUDeptId(row.departmentId);
    setUJobTitle(row.jobTitle);
    setUStatus(row.status);
    setUMfa(row.mfaEnforced);
    setUFormErrors({});
    setUFormSummaryError(null);
    setUserModalMode('edit');

    if (canManageUsers) {
      setLoadingUserDetail(true);
      void getDoc(doc(db, 'users', row.uid))
        .then((snap) => {
          if (snap.exists()) {
            const full = snap.data() as UserAccount;
            setUDisplayName(full.displayName || row.displayName);
            setUEmail(full.email || row.email);
            setUPhone(full.phone || '');
            setURole(full.role || row.role);
            setUDeptId(full.departmentId || row.departmentId);
            setUJobTitle(full.jobTitle || row.jobTitle);
            setUStatus(full.status || row.status);
            setUMfa(Boolean(full.mfaEnforced));
          }
        })
        .catch(() => {
          // Directory-only record or fallback to merged row
        })
        .finally(() => {
          setLoadingUserDetail(false);
        });
    }
  };

  const validateUserForm = () => {
    const errors: Partial<Record<'displayName' | 'email' | 'phone' | 'jobTitle' | 'role', string>> = {};
    const displayName = uDisplayName.trim();
    const email = uEmail.trim().toLowerCase();
    const phone = uPhone.trim();
    const jobTitle = uJobTitle.trim();

    if (!displayName) {
      errors.displayName = 'Full name is required.';
    } else if (displayName.length < 2 || displayName.length > 160) {
      errors.displayName = 'Full name must be between 2 and 160 characters.';
    }

    if (!email) {
      errors.email = 'Work email address is required.';
    } else if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Enter a valid email address (max 200 characters).';
    } else if (
      mergedUsers.some(
        (u) => u.uid !== editingUser?.uid && u.email && u.email.trim().toLowerCase() === email
      )
    ) {
      errors.email = `A user with email "${email}" already exists.`;
    }

    if (phone && (phone.length > 40 || !/^[+\d][\d\s()-]{6,39}$/.test(phone))) {
      errors.phone = 'Enter a valid phone number (e.g. +254 712 345 678).';
    }

    if (jobTitle.length > 120) {
      errors.jobTitle = 'Job title must not exceed 120 characters.';
    }

    if (!isAdmin && uRole === 'super_admin') {
      errors.role = 'Only a Super Administrator can assign the Super Administrator role.';
    }

    return {
      errors,
      isValid: Object.keys(errors).length === 0,
      cleaned: { displayName, email, phone, jobTitle },
    };
  };

  const handleUserModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canManageUsers) return;

    const validation = validateUserForm();
    if (!validation.isValid) {
      setUFormErrors(validation.errors);
      setUFormSummaryError('Please correct the highlighted fields before continuing.');
      return;
    }

    setUFormErrors({});
    setUFormSummaryError(null);

    if (userModalMode === 'edit') {
      setConfirmUserSaveOpen(true);
      return;
    }

    setSaving(true);
    const { displayName, email, phone, jobTitle } = validation.cleaned;
    const dept = departments.find((d) => d.id === uDeptId);
    const deptName = dept?.name || 'General Staff';
    const newUid = doc(collection(db, 'users')).id;
    const userRef = doc(db, 'users', newUid);
    const dirRef = doc(db, 'directory', newUid);

    try {
      await setDoc(userRef, {
        uid: newUid,
        email,
        displayName,
        role: uRole,
        departmentId: uDeptId,
        departmentName: deptName,
        jobTitle,
        phone,
        status: uStatus,
        mfaEnforced: uMfa,
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(dirRef, {
        uid: newUid,
        orgId: ORG_ID,
        displayName,
        role: uRole,
        departmentId: uDeptId,
        departmentName: deptName,
        jobTitle,
        status: uStatus,
        isDemo: false,
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'CREATE_USER',
        targetCollection: 'users',
        targetId: newUid,
        summary: `Added user ${displayName} (${email}) with role=${uRole}, dept=${deptName}, status=${uStatus}`,
      });

      closeUserModal();
      showToast('success', `Added user ${displayName} as ${ROLE_DEFINITIONS[uRole]?.label || uRole}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${newUid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmUserUpdate = async () => {
    if (!profile || !editingUser || !canManageUsers) return;
    const validation = validateUserForm();
    if (!validation.isValid) {
      setConfirmUserSaveOpen(false);
      setUFormErrors(validation.errors);
      setUFormSummaryError('Please correct the highlighted fields before saving.');
      return;
    }

    setSaving(true);
    const { displayName, email, phone, jobTitle } = validation.cleaned;
    const dept = departments.find((d) => d.id === uDeptId);
    const deptName = dept?.name || (uDeptId ? editingUser.departmentName : 'General Staff');
    const userRef = doc(db, 'users', editingUser.uid);
    const dirRef = doc(db, 'directory', editingUser.uid);

    try {
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const existing = userSnap.data() as UserAccount;
        await updateDoc(userRef, {
          uid: existing.uid,
          email,
          displayName,
          role: uRole,
          departmentId: uDeptId,
          departmentName: deptName,
          jobTitle,
          phone,
          status: uStatus,
          mfaEnforced: uMfa,
          isDemo: existing.isDemo ?? false,
          createdAt: existing.createdAt,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(userRef, {
          uid: editingUser.uid,
          email,
          displayName,
          role: uRole,
          departmentId: uDeptId,
          departmentName: deptName,
          jobTitle,
          phone,
          status: uStatus,
          mfaEnforced: uMfa,
          isDemo: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const dirSnap = await getDoc(dirRef);
      if (dirSnap.exists()) {
        await updateDoc(dirRef, {
          uid: editingUser.uid,
          orgId: ORG_ID,
          displayName,
          role: uRole,
          departmentId: uDeptId,
          departmentName: deptName,
          jobTitle,
          status: uStatus,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(dirRef, {
          uid: editingUser.uid,
          orgId: ORG_ID,
          displayName,
          role: uRole,
          departmentId: uDeptId,
          departmentName: deptName,
          jobTitle,
          status: uStatus,
          isDemo: false,
          updatedAt: serverTimestamp(),
        });
      }

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'UPDATE_USER_PROFILE',
        targetCollection: 'users',
        targetId: editingUser.uid,
        summary: `Updated ${displayName} (${email}): role=${uRole}, dept=${deptName}, status=${uStatus}, mfa=${String(uMfa)}`,
      });

      setConfirmUserSaveOpen(false);
      closeUserModal();
      showToast('success', `Updated profile and access permissions for ${displayName}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${editingUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!profile || !deleteTargetUser || !canManageUsers) return;
    if (deleteTargetUser.uid === profile.uid) {
      showToast('error', 'You cannot delete your own active account.');
      setDeleteTargetUser(null);
      return;
    }
    if (!isAdmin && deleteTargetUser.role === 'super_admin') {
      showToast('error', 'Only a Super Administrator can delete a Super Administrator account.');
      setDeleteTargetUser(null);
      return;
    }

    setSaving(true);
    const userRef = doc(db, 'users', deleteTargetUser.uid);
    const dirRef = doc(db, 'directory', deleteTargetUser.uid);

    try {
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        await deleteDoc(userRef);
      }

      const dirSnap = await getDoc(dirRef);
      if (dirSnap.exists()) {
        await deleteDoc(dirRef);
      }

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'DELETE_USER',
        targetCollection: 'users',
        targetId: deleteTargetUser.uid,
        summary: `Deleted user ${deleteTargetUser.displayName} (${deleteTargetUser.email || deleteTargetUser.uid}, role=${deleteTargetUser.role})`,
      });

      const deletedName = deleteTargetUser.displayName;
      setDeleteTargetUser(null);
      showToast('success', `Deleted user profile for ${deletedName}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${deleteTargetUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !isAdmin) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'org'), {
        orgId: ORG_ID,
        orgName: sOrgName.trim(),
        tagline: sTagline.trim(),
        address: sAddress.trim(),
        currency: sCurrency.trim() || 'KES',
        timezone: sTimezone.trim() || 'Africa/Nairobi',
        primaryColor: sPrimaryColor,
        accentColor: sAccentColor,
        fiscalYear: sFiscalYear.trim() || 'FY 2026',
        reportingPeriod: sPeriod.trim() || 'Q4 2026',
        quickbooksStatus: orgSettings.quickbooksStatus || 'credentials_required',
        mpesaStatus: orgSettings.mpesaStatus || 'credentials_required',
        fcmStatus: orgSettings.fcmStatus || 'web_push_ready',
        updatedBy: profile.uid,
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'UPDATE_ORG_SETTINGS',
        targetCollection: 'settings',
        targetId: 'org',
        summary: `Updated system branding, theme colours, and ${sFiscalYear.trim()} configuration.`,
      });
      showToast('success', 'Organisational branding and system configuration updated.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/org');
    } finally {
      setSaving(false);
    }
  };

  const handleSeedDemo = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await seedDemoEnvironment({ uid: profile.uid, name: profile.displayName, role: profile.role });
      setConfirmSeedOpen(false);
      showToast('success', 'Demonstration dataset populated (tagged isDemo=true).');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to seed demo dataset.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearDemo = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const removed = await clearDemoEnvironment({ uid: profile.uid, name: profile.displayName, role: profile.role });
      setConfirmClearOpen(false);
      showToast('success', `Cleared ${removed} demonstration record(s). Production records preserved.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to clear demo dataset.');
    } finally {
      setSaving(false);
    }
  };

  const userColumns: ColumnDef<MergedUserRow>[] = [
    {
      key: 'name',
      header: 'Account Holder',
      sortable: true,
      sortValue: (r) => r.displayName,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.displayName}</div>
          <div className="text-xs text-slate-500">{r.email || `UID: ${r.uid.slice(0, 10)}…`}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Assigned Role',
      sortable: true,
      sortValue: (r) => ROLE_DEFINITIONS[r.role]?.label || r.role,
      render: (r) => (
        <div>
          <div className="text-xs font-semibold text-slate-900">{ROLE_DEFINITIONS[r.role]?.label || r.role}</div>
          <div className="text-[11px] text-slate-500">{ROLE_DEFINITIONS[r.role]?.tier || 'Staff'}</div>
        </div>
      ),
    },
    {
      key: 'dept',
      header: 'Department & Title',
      render: (r) => (
        <div className="text-xs">
          <div className="text-slate-800">{r.departmentName || 'General Staff'}</div>
          <div className="text-slate-500">{r.jobTitle || '—'}</div>
        </div>
      ),
    },
    {
      key: 'mfa',
      header: 'MFA Policy',
      render: (r) => (
        <span className="text-xs text-slate-700">
          {r.mfaEnforced ? 'Required (6-digit)' : 'Optional'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Manage',
      align: 'right',
      render: (r) => {
        if (!canManageUsers) {
          return <span className="text-xs text-slate-400">Read-only</span>;
        }
        const isProtectedSuperAdmin = !isAdmin && r.role === 'super_admin';
        const isSelf = r.uid === profile?.uid;
        if (isProtectedSuperAdmin) {
          return <span className="text-xs text-slate-400">Super Admin only</span>;
        }
        return (
          <div className="inline-flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => openEditUser(r)}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline whitespace-nowrap"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              type="button"
              disabled={isSelf}
              onClick={() => setDeleteTargetUser(r)}
              title={isSelf ? 'You cannot delete your own active account' : `Delete ${r.displayName}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline whitespace-nowrap disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        );
      },
    },
  ];

  const deptColumns: ColumnDef<Department>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      sortValue: (d) => d.code,
      render: (d) => <span className="font-mono text-xs font-semibold text-slate-800">{d.code}</span>,
    },
    {
      key: 'name',
      header: 'Department',
      sortable: true,
      sortValue: (d) => d.name,
      render: (d) => (
        <div>
          <div className="font-medium text-slate-900">
            {d.name} {d.isDemo ? <span className="text-[11px] text-amber-700 font-normal">· Demo</span> : null}
          </div>
          {d.description && <div className="text-xs text-slate-500 max-w-md truncate">{d.description}</div>}
        </div>
      ),
    },
    {
      key: 'head',
      header: 'Department Head',
      render: (d) => <span className="text-xs text-slate-700">{d.headName || 'Unassigned'}</span>,
    },
    {
      key: 'budget',
      header: 'Annual Budget',
      align: 'right',
      sortable: true,
      sortValue: (d) => d.annualBudgetKes,
      render: (d) => <span className="font-mono text-xs">{formatKes(d.annualBudgetKes)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => <StatusText status={d.status} />,
    },
    {
      key: 'actions',
      header: 'Edit',
      align: 'right',
      render: (d) =>
        isExecutive ? (
          <button
            type="button"
            onClick={() => openEditDept(d)}
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit
          </button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ];

  const auditColumns: ColumnDef<AuditLogEntry>[] = [
    {
      key: 'time',
      header: 'Timestamp (EAT)',
      sortable: true,
      sortValue: (a) => {
        const val = a.createdAt as { seconds?: number } | undefined;
        return val?.seconds || 0;
      },
      render: (a) => <span className="font-mono text-xs text-slate-600 whitespace-nowrap">{formatNairobiDateTime(a.createdAt)}</span>,
    },
    {
      key: 'actor',
      header: 'Actor',
      sortable: true,
      sortValue: (a) => a.actorName,
      render: (a) => (
        <div className="text-xs">
          <div className="font-medium text-slate-900">{a.actorName}</div>
          <div className="text-slate-500">{ROLE_DEFINITIONS[a.actorRole as RoleId]?.label || a.actorRole}</div>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      sortable: true,
      sortValue: (a) => a.action,
      render: (a) => <span className="font-mono text-xs font-medium text-emerald-900">{a.action}</span>,
    },
    {
      key: 'target',
      header: 'Target',
      render: (a) => <span className="font-mono text-xs text-slate-500">{a.targetCollection}/{a.targetId.slice(0, 10)}</span>,
    },
    {
      key: 'summary',
      header: 'Event Summary',
      render: (a) => <span className="text-xs text-slate-700">{a.summary}</span>,
    },
  ];

  const exportAudit = (fmt: 'pdf' | 'xlsx') => {
    const cols = [
      { header: 'Timestamp (EAT)', key: 'time' },
      { header: 'Actor', key: 'actor' },
      { header: 'Role', key: 'role' },
      { header: 'Action', key: 'action' },
      { header: 'Target', key: 'target' },
      { header: 'Summary', key: 'summary' },
    ];
    const rows = auditLogs.map((a) => ({
      time: formatNairobiDateTime(a.createdAt),
      actor: a.actorName,
      role: a.actorRole,
      action: a.action,
      target: `${a.targetCollection}/${a.targetId}`,
      summary: a.summary,
    }));
    if (fmt === 'pdf') {
      exportToPdf({ fileName: 'iServe_Audit_Trail', title: 'Immutable System Audit Log', columns: cols, rows });
    } else {
      exportToExcel({ fileName: 'iServe_Audit_Trail', sheetName: 'AuditLog', title: 'Immutable System Audit Log', columns: cols, rows });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Settings, RBAC & Audit Governance</h1>
          <p className="text-sm text-slate-600 mt-1">
            Manage organisational branding, 12-role access permissions, departments, demonstration sandbox, and immutable audit logs.
          </p>
        </div>
        {tab === 'users' && canManageUsers && (
          <button
            type="button"
            onClick={openAddUser}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
        )}
        {tab === 'departments' && isExecutive && (
          <button
            type="button"
            onClick={openNewDept}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Department
          </button>
        )}
      </div>

      {notice && (
        <div
          className={`px-4 py-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${
            notice.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {notice.tone === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        {[
          { key: 'users' as GovTab, label: 'Users & 12-Role RBAC', Icon: Users },
          { key: 'departments' as GovTab, label: 'Departments', Icon: Building2 },
          { key: 'settings' as GovTab, label: 'Branding, Settings & Integrations', Icon: Settings },
          { key: 'audit' as GovTab, label: 'Immutable Audit Trail', Icon: ScrollText },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              tab === key
                ? 'bg-[var(--brand-primary)] text-white'
                : 'bg-white text-slate-700 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Users & 12-Role Permissions */}
      {tab === 'users' && (
        <div className="space-y-6">
          <div className="bg-white border border-stone-200 rounded-xl p-4 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-3">
            <div>
              Super Administrators, HR Officers, and Executives can add users, edit profile details, delete accounts, and assign roles within the 12-role access permissions matrix.
            </div>
            <span className="font-mono font-semibold text-slate-800 whitespace-nowrap">
              {mergedUsers.length} Directory Account(s)
            </span>
          </div>

          <DataTable
            rows={mergedUsers}
            columns={userColumns}
            rowKey={(r) => r.uid}
            searchPlaceholder="Search accounts by name, email, role, or department..."
            searchFilter={(r, q) =>
              r.displayName.toLowerCase().includes(q) ||
              r.email.toLowerCase().includes(q) ||
              r.role.toLowerCase().includes(q) ||
              r.departmentName.toLowerCase().includes(q)
            }
          />

          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-200">
              <h2 className="text-sm font-semibold text-slate-900 font-display">
                iServe Africa 12-Role Permissions Matrix
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Authorised modules, capability boundaries, and MFA policy enforced across client and Firestore security rules.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-slate-600 font-semibold">
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5">Tier</th>
                    <th className="px-4 py-2.5">MFA</th>
                    <th className="px-4 py-2.5">Permitted Capabilities</th>
                    <th className="px-4 py-2.5">Module Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {ALL_ROLES.map((r) => (
                    <tr key={r.id} className="hover:bg-stone-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">{r.label}</td>
                      <td className="px-4 py-3 text-slate-600">{r.tier}</td>
                      <td className="px-4 py-3 font-mono">{r.mfaRequired ? 'Required' : 'Standard'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.capabilities.join(' · ')}</td>
                      <td className="px-4 py-3 font-mono text-slate-800">{r.modules.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Departments */}
      {tab === 'departments' && (
        <DataTable
          rows={departments}
          columns={deptColumns}
          rowKey={(d) => d.id}
          searchPlaceholder="Search departments by code, name, or head..."
          searchFilter={(d, q) =>
            d.code.toLowerCase().includes(q) ||
            d.name.toLowerCase().includes(q) ||
            (d.headName || '').toLowerCase().includes(q)
          }
          emptyTitle="No departments configured"
          emptyDescription="Create organisational departments to allocate budgets, assign staff, and track approvals."
        />
      )}

      {/* Tab 3: System Settings, Branding, Integrations & Demo Data */}
      {tab === 'settings' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-6 space-y-5"
          >
            <div>
              <h2 className="text-base font-semibold text-slate-900 font-display">
                Organisational Branding & Locale Configuration
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Customise institutional identity, brand palette, fiscal year, and reporting period.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="s-org" className="block text-xs font-medium text-slate-700 mb-1">
                  Organisation Name
                </label>
                <input
                  id="s-org"
                  type="text"
                  required
                  value={sOrgName}
                  onChange={(e) => setSOrgName(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg disabled:bg-stone-50"
                />
              </div>
              <div>
                <label htmlFor="s-fiscal" className="block text-xs font-medium text-slate-700 mb-1">
                  Active Fiscal Year
                </label>
                <input
                  id="s-fiscal"
                  type="text"
                  required
                  value={sFiscalYear}
                  onChange={(e) => setSFiscalYear(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg disabled:bg-stone-50"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="s-tag" className="block text-xs font-medium text-slate-700 mb-1">
                  Tagline / Mission Motto
                </label>
                <input
                  id="s-tag"
                  type="text"
                  value={sTagline}
                  onChange={(e) => setSTagline(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg disabled:bg-stone-50"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="s-addr" className="block text-xs font-medium text-slate-700 mb-1">
                  Head Office Address
                </label>
                <input
                  id="s-addr"
                  type="text"
                  value={sAddress}
                  onChange={(e) => setSAddress(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg disabled:bg-stone-50"
                />
              </div>
              <div>
                <label htmlFor="s-period" className="block text-xs font-medium text-slate-700 mb-1">
                  Current Reporting Period
                </label>
                <input
                  id="s-period"
                  type="text"
                  value={sPeriod}
                  onChange={(e) => setSPeriod(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg disabled:bg-stone-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="s-curr" className="block text-xs font-medium text-slate-700 mb-1">
                    Currency
                  </label>
                  <input
                    id="s-curr"
                    type="text"
                    required
                    value={sCurrency}
                    onChange={(e) => setSCurrency(e.target.value)}
                    disabled={!isAdmin}
                    className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg disabled:bg-stone-50"
                  />
                </div>
                <div>
                  <label htmlFor="s-tz" className="block text-xs font-medium text-slate-700 mb-1">
                    Timezone
                  </label>
                  <input
                    id="s-tz"
                    type="text"
                    required
                    value={sTimezone}
                    onChange={(e) => setSTimezone(e.target.value)}
                    disabled={!isAdmin}
                    className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg disabled:bg-stone-50"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="s-prim" className="block text-xs font-medium text-slate-700 mb-1">
                  Primary Brand Colour
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="s-prim"
                    type="color"
                    value={sPrimaryColor}
                    onChange={(e) => setSPrimaryColor(e.target.value)}
                    disabled={!isAdmin}
                    className="h-9 w-12 rounded border border-stone-300 cursor-pointer"
                  />
                  <span className="font-mono text-xs text-slate-600">{sPrimaryColor}</span>
                </div>
              </div>
              <div>
                <label htmlFor="s-acc" className="block text-xs font-medium text-slate-700 mb-1">
                  Accent Highlight Colour
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="s-acc"
                    type="color"
                    value={sAccentColor}
                    onChange={(e) => setSAccentColor(e.target.value)}
                    disabled={!isAdmin}
                    className="h-9 w-12 rounded border border-stone-300 cursor-pointer"
                  />
                  <span className="font-mono text-xs text-slate-600">{sAccentColor}</span>
                </div>
              </div>
            </div>

            {isAdmin && (
              <div className="pt-2 border-t border-stone-100 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  {saving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            )}
          </form>

          <div className="lg:col-span-5 space-y-6">
            {/* External Integration Status */}
            <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 font-display">
                  External Integrations & Gateway Readiness
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live credential state for accounting, Kenyan mobile payments, and push messaging.
                </p>
              </div>

              <div className="divide-y divide-stone-100 text-xs">
                <div className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">QuickBooks Online API</div>
                    <div className="text-slate-500 mt-0.5">
                      OAuth 2.0 Client ID/Secret & Realm ID required in server environment before live journal sync.
                    </div>
                  </div>
                  <StatusText status={orgSettings.quickbooksStatus || 'credentials_required'} />
                </div>
                <div className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">Safaricom M-Pesa Daraja STK</div>
                    <div className="text-slate-500 mt-0.5">
                      Consumer Key, Secret & Till/Paybill shortcode credentials required for automated STK push; manual M-Pesa reference logging active in POS.
                    </div>
                  </div>
                  <StatusText status={orgSettings.mpesaStatus || 'credentials_required'} />
                </div>
                <div className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">Firebase Cloud Messaging (FCM)</div>
                    <div className="text-slate-500 mt-0.5">
                      In-app notification centre active; VAPID web push and Flutter Android FCM token registration ready.
                    </div>
                  </div>
                  <StatusText status="active" />
                </div>
              </div>

              {integrationLogs.length > 0 && (
                <div className="pt-2 border-t border-stone-100 text-[11px] text-slate-500">
                  Latest integration event: <strong className="text-slate-800">{integrationLogs[0].event}</strong> ({integrationLogs[0].status})
                </div>
              )}
            </div>

            {/* Demonstration Dataset Sandbox */}
            <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900 font-display">
                    Demonstration Dataset Sandbox
                  </h2>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Populate realistic iServe Africa evaluation records (Kenyan departments, staff, Cohort 2026 apprentices, budgets in KES, bookstore inventory, and donor projects). Every seeded record is flagged <span className="font-mono">isDemo=true</span> and can be removed cleanly without affecting production records.
                  </p>
                </div>
              </div>

              {isAdmin ? (
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmSeedOpen(true)}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Database className="w-3.5 h-3.5" />
                    Populate Demo Data
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearOpen(true)}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-red-700 bg-white border border-red-300 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Demo Records
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Super Administrator privileges required to manage sandbox data.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Audit Log */}
      {tab === 'audit' && (
        <div className="space-y-4">
          <DataTable
            rows={auditLogs}
            columns={auditColumns}
            rowKey={(a) => a.id}
            searchPlaceholder="Search audit events by actor, action, target, or summary..."
            searchFilter={(a, q) =>
              a.actorName.toLowerCase().includes(q) ||
              a.action.toLowerCase().includes(q) ||
              a.targetCollection.toLowerCase().includes(q) ||
              a.summary.toLowerCase().includes(q)
            }
            pageSize={12}
            toolbarExtra={
              <>
                <button
                  type="button"
                  onClick={() => exportAudit('pdf')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 whitespace-nowrap"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => exportAudit('xlsx')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export Excel
                </button>
              </>
            }
            emptyTitle="No audit events logged yet"
            emptyDescription="Sensitive operations, approvals, role updates, and system configuration changes are logged here automatically."
          />
        </div>
      )}

      {/* Department Create/Edit Modal */}
      <Modal
        open={deptModalOpen}
        onClose={() => setDeptModalOpen(false)}
        title={editingDept ? `Edit Department · ${editingDept.code}` : 'Create Department'}
        subtitle="Departments structure budgets, approvals, HR records, and project ownership."
      >
        <form onSubmit={handleSaveDepartment} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="d-code" className="block text-xs font-medium text-slate-700 mb-1">
                Department Code
              </label>
              <input
                id="d-code"
                type="text"
                required
                minLength={2}
                maxLength={24}
                placeholder="e.g. APPR"
                value={deptCode}
                onChange={(e) => setDeptCode(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="d-name" className="block text-xs font-medium text-slate-700 mb-1">
                Department Name
              </label>
              <input
                id="d-name"
                type="text"
                required
                minLength={2}
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="d-head" className="block text-xs font-medium text-slate-700 mb-1">
                Department Head Name
              </label>
              <input
                id="d-head"
                type="text"
                value={deptHeadName}
                onChange={(e) => setDeptHeadName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="d-bud" className="block text-xs font-medium text-slate-700 mb-1">
                Annual Budget Allocation (KES)
              </label>
              <input
                id="d-bud"
                type="number"
                min={0}
                step="100"
                required
                value={deptBudget}
                onChange={(e) => setDeptBudget(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="d-desc" className="block text-xs font-medium text-slate-700 mb-1">
                Mandate & Description
              </label>
              <textarea
                id="d-desc"
                rows={3}
                value={deptDesc}
                onChange={(e) => setDeptDesc(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="d-status" className="block text-xs font-medium text-slate-700 mb-1">
                Status
              </label>
              <select
                id="d-status"
                value={deptStatus}
                onChange={(e) => setDeptStatus(e.target.value as 'active' | 'inactive')}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setDeptModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
            >
              {saving ? 'Saving...' : editingDept ? 'Save Changes' : 'Create Department'}
            </button>
          </div>
        </form>
      </Modal>

      {/* User Add / Edit Profile & 12-Role Modal */}
      <Modal
        open={Boolean(userModalMode)}
        onClose={closeUserModal}
        title={userModalMode === 'create' ? 'Add User & Assign Role' : `Edit User Profile · ${editingUser?.displayName || ''}`}
        subtitle="Manage user profile details, department membership, MFA policy, and 12-role access permissions."
      >
        {userModalMode && (
          <form onSubmit={(e) => void handleUserModalSubmit(e)} noValidate className="space-y-4">
            {uFormSummaryError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700" role="alert">
                {uFormSummaryError}
              </div>
            )}

            {loadingUserDetail && (
              <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-slate-600">
                Loading full profile details...
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="u-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="u-name"
                  type="text"
                  required
                  maxLength={160}
                  value={uDisplayName}
                  onChange={(e) => {
                    setUDisplayName(e.target.value);
                    clearUserFieldError('displayName');
                  }}
                  aria-invalid={Boolean(uFormErrors.displayName)}
                  placeholder="e.g. Grace Wanjiku Kamau"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    uFormErrors.displayName ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                  }`}
                />
                {uFormErrors.displayName && <p className="text-xs text-red-600 mt-1">{uFormErrors.displayName}</p>}
              </div>

              <div>
                <label htmlFor="u-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Work Email <span className="text-red-600">*</span>
                </label>
                <input
                  id="u-email"
                  type="email"
                  required
                  maxLength={200}
                  value={uEmail}
                  onChange={(e) => {
                    setUEmail(e.target.value);
                    clearUserFieldError('email');
                  }}
                  aria-invalid={Boolean(uFormErrors.email)}
                  placeholder="name@iserveafrica.org"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    uFormErrors.email ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                  }`}
                />
                {uFormErrors.email && <p className="text-xs text-red-600 mt-1">{uFormErrors.email}</p>}
              </div>

              <div>
                <label htmlFor="u-role" className="block text-xs font-medium text-slate-700 mb-1">
                  Organisational Role (12-Role Matrix) <span className="text-red-600">*</span>
                </label>
                <select
                  id="u-role"
                  value={uRole}
                  onChange={(e) => {
                    const next = e.target.value as RoleId;
                    setURole(next);
                    clearUserFieldError('role');
                    setUMfa(Boolean(ROLE_DEFINITIONS[next]?.mfaRequired));
                  }}
                  aria-invalid={Boolean(uFormErrors.role)}
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    uFormErrors.role ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                  }`}
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r.id} value={r.id} disabled={!isAdmin && r.id === 'super_admin'}>
                      {r.label} ({r.tier}){!isAdmin && r.id === 'super_admin' ? ' — Super Admin only' : ''}
                    </option>
                  ))}
                </select>
                {uFormErrors.role && <p className="text-xs text-red-600 mt-1">{uFormErrors.role}</p>}
              </div>

              <div>
                <label htmlFor="u-dept" className="block text-xs font-medium text-slate-700 mb-1">
                  Department
                </label>
                <select
                  id="u-dept"
                  value={uDeptId}
                  onChange={(e) => setUDeptId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                >
                  <option value="">General Staff</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="u-title" className="block text-xs font-medium text-slate-700 mb-1">
                  Job Title
                </label>
                <input
                  id="u-title"
                  type="text"
                  maxLength={120}
                  value={uJobTitle}
                  onChange={(e) => {
                    setUJobTitle(e.target.value);
                    clearUserFieldError('jobTitle');
                  }}
                  aria-invalid={Boolean(uFormErrors.jobTitle)}
                  placeholder="e.g. Programmes Coordinator"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    uFormErrors.jobTitle ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                  }`}
                />
                {uFormErrors.jobTitle && <p className="text-xs text-red-600 mt-1">{uFormErrors.jobTitle}</p>}
              </div>

              <div>
                <label htmlFor="u-phone" className="block text-xs font-medium text-slate-700 mb-1">
                  Phone Number
                </label>
                <input
                  id="u-phone"
                  type="text"
                  maxLength={40}
                  value={uPhone}
                  onChange={(e) => {
                    setUPhone(e.target.value);
                    clearUserFieldError('phone');
                  }}
                  aria-invalid={Boolean(uFormErrors.phone)}
                  placeholder="+254 712 345 678"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    uFormErrors.phone ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                  }`}
                />
                {uFormErrors.phone && <p className="text-xs text-red-600 mt-1">{uFormErrors.phone}</p>}
              </div>

              <div>
                <label htmlFor="u-status" className="block text-xs font-medium text-slate-700 mb-1">
                  Account Status
                </label>
                <select
                  id="u-status"
                  value={uStatus}
                  onChange={(e) => setUStatus(e.target.value as 'active' | 'inactive' | 'pending')}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="inactive">Inactive (Suspended)</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-xs text-slate-700 pt-1">
              <input
                type="checkbox"
                checked={uMfa}
                onChange={(e) => setUMfa(e.target.checked)}
                className="rounded border-stone-300"
              />
              <span>
                Enforce 6-digit Multi-Factor Session Verification (recommended for all privileged accounts)
              </span>
            </label>

            <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-xs text-slate-600 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div>{ROLE_DEFINITIONS[uRole]?.description}</div>
                <div className="text-[11px] text-slate-500">
                  Permitted modules ({ROLE_DEFINITIONS[uRole]?.modules.length || 0}):{' '}
                  {ROLE_DEFINITIONS[uRole]?.capabilities.join(' · ')}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={closeUserModal}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-stone-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg whitespace-nowrap disabled:opacity-60"
              >
                {saving
                  ? 'Saving...'
                  : userModalMode === 'create'
                    ? 'Add User & Assign Role'
                    : 'Review & Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Confirm User Role & Profile Update */}
      <ConfirmDialog
        open={confirmUserSaveOpen}
        onClose={() => setConfirmUserSaveOpen(false)}
        onConfirm={handleConfirmUserUpdate}
        loading={saving}
        title="Confirm User Profile & Access Update"
        description={`Save profile changes for ${uDisplayName.trim() || editingUser?.displayName || 'this user'} with role "${ROLE_DEFINITIONS[uRole]?.label}" and status "${uStatus}"? This change is recorded in the immutable audit log.`}
        confirmLabel="Save Profile & Role"
      />

      {/* Confirm Delete User */}
      <ConfirmDialog
        open={Boolean(deleteTargetUser)}
        onClose={() => setDeleteTargetUser(null)}
        onConfirm={handleConfirmDeleteUser}
        loading={saving}
        tone="danger"
        title="Delete User Account"
        description={`Remove ${deleteTargetUser?.displayName || 'this user'} (${ROLE_DEFINITIONS[deleteTargetUser?.role || 'staff_member']?.label}) from the directory and user accounts? This action cannot be undone and is recorded in the immutable audit log.`}
        confirmLabel="Delete User"
      />

      {/* Confirm Seed Demo */}
      <ConfirmDialog
        open={confirmSeedOpen}
        onClose={() => setConfirmSeedOpen(false)}
        onConfirm={handleSeedDemo}
        loading={saving}
        title="Populate Demonstration Dataset"
        description="This will write realistic iServe Africa evaluation records (tagged isDemo=true) across departments, staff, apprentices, budgets, bookstore inventory, and projects."
        confirmLabel="Populate Demo Data"
      />

      {/* Confirm Clear Demo */}
      <ConfirmDialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={handleClearDemo}
        loading={saving}
        tone="danger"
        title="Clear Demonstration Records"
        description="Remove all records flagged isDemo=true from the database? Production records created by staff will remain untouched."
        confirmLabel="Clear Demo Records"
      />
    </div>
  );
}
