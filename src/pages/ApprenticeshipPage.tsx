import React, { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { Plus, Download, Check, RotateCcw, WifiOff, Pencil, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ORG_ID, db } from '../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import { recordAuditLog, sendNotification } from '../lib/audit.ts';
import { exportToCsv, exportToExcel, exportToPdf } from '../lib/exports.ts';
import { enqueueOfflineItem } from '../lib/offlineQueue.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../components/ui/DataTable.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { StatusText } from '../components/ui/StatusText.tsx';
import { Apprentice, ApprenticeReport, Cohort, formatKes } from '../types/erp.ts';

type ApprTab = 'reports' | 'profiles' | 'supervisor' | 'cohorts';

interface ParsedApprenticeImportRow {
  rowNumber: number;
  apprenticeCode: string;
  fullName: string;
  email: string;
  phone: string;
  cohortId: string;
  cohortName: string;
  cohortMatched: boolean;
  supervisorId: string;
  supervisorName: string;
  region: string;
  trainingLocation: string;
  startDate: string;
  expectedCompletionDate: string;
  attendanceRate: number;
  status: Apprentice['status'];
  learningObjectives: string;
  errors: string[];
}

function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function ApprenticeshipPage() {
  const { profile, effectiveRole } = useAuth();
  const { apprentices, apprenticeReports, cohorts, directory } = useData();

  const [tab, setTab] = useState<ApprTab>('reports');
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reviewReport, setReviewReport] = useState<ApprenticeReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [profileSearch, setProfileSearch] = useState('');

  // Apprentice profile form
  const [appCode, setAppCode] = useState('');
  const [appName, setAppName] = useState('');
  const [appEmail, setAppEmail] = useState('');
  const [appPhone, setAppPhone] = useState('');
  const [appCohortId, setAppCohortId] = useState('');
  const [appSupervisorId, setAppSupervisorId] = useState('');
  const [appSupervisorName, setAppSupervisorName] = useState('');
  const [appRegion, setAppRegion] = useState('');
  const [appLocation, setAppLocation] = useState('');
  const [appObjectives, setAppObjectives] = useState('');
  const [appFormErrors, setAppFormErrors] = useState<
    Partial<Record<'appCode' | 'appName' | 'appEmail' | 'appPhone' | 'appRegion' | 'appSupervisor' | 'appLocation' | 'appObjectives', string>>
  >({});
  const [appFormErrorSummary, setAppFormErrorSummary] = useState<string | null>(null);

  // Report form
  const [repType, setRepType] = useState<ApprenticeReport['reportType']>('weekly');
  const [repStart, setRepStart] = useState(new Date().toISOString().slice(0, 10));
  const [repEnd, setRepEnd] = useState(new Date().toISOString().slice(0, 10));
  const [repMonthlyTarget, setRepMonthlyTarget] = useState('');
  const [repAmountRaised, setRepAmountRaised] = useState('');
  const [repDeficit, setRepDeficit] = useState('0');
  const [repCallsMade, setRepCallsMade] = useState('');
  const [repNewPartners, setRepNewPartners] = useState('');
  const [repTotalActivePartners, setRepTotalActivePartners] = useState('');
  const [repThingsWorked, setRepThingsWorked] = useState('');
  const [repThingsDidNotWork, setRepThingsDidNotWork] = useState('');
  const [repNextWeekTarget, setRepNextWeekTarget] = useState('');
  const [repNextWeekPartners, setRepNextWeekPartners] = useState('');
  const [repNextWeekCalls, setRepNextWeekCalls] = useState('');
  const [repNextWeekAppointments, setRepNextWeekAppointments] = useState('');
  const [repWorkProgress, setRepWorkProgress] = useState('');
  const [repPersonalDevotion, setRepPersonalDevotion] = useState('');
  const [repMentorship, setRepMentorship] = useState('');
  const [repStatus, setRepStatus] = useState<'draft' | 'submitted'>('submitted');
  const [repFormError, setRepFormError] = useState<string | null>(null);

  // Supervisor review
  const [supComment, setSupComment] = useState('');
  const [supScore, setSupScore] = useState('4');

  // Cohort creation form
  const [cohortName, setCohortName] = useState('');
  const [cohortProgramme, setCohortProgramme] = useState('2-Year Ministry & Bible Handling Apprenticeship');
  const [cohortCoordinator, setCohortCoordinator] = useState('');
  const [cohortStartDate, setCohortStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [cohortEndDate, setCohortEndDate] = useState(`${new Date().getFullYear() + 2}-11-30`);
  const [cohortStatus, setCohortStatus] = useState<'upcoming' | 'active' | 'completed'>('upcoming');
  const [cohortFormError, setCohortFormError] = useState<string | null>(null);

  // Cohort edit modal
  const [editingCohort, setEditingCohort] = useState<Cohort | null>(null);
  const [editCohortName, setEditCohortName] = useState('');
  const [editCohortProgramme, setEditCohortProgramme] = useState('');
  const [editCohortCoordinator, setEditCohortCoordinator] = useState('');
  const [editCohortStartDate, setEditCohortStartDate] = useState('');
  const [editCohortEndDate, setEditCohortEndDate] = useState('');
  const [editCohortStatus, setEditCohortStatus] = useState<'upcoming' | 'active' | 'completed'>('upcoming');
  const [editCohortError, setEditCohortError] = useState<string | null>(null);

  // Bulk CSV upload modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkFileName, setBulkFileName] = useState('');
  const [bulkParseError, setBulkParseError] = useState<string | null>(null);
  const [bulkRows, setBulkRows] = useState<ParsedApprenticeImportRow[]>([]);
  const [importingBulk, setImportingBulk] = useState(false);

  const isSupervisorRole = [
    'super_admin',
    'executive_director',
    'senior_management',
    'hr_officer',
    'apprentice_supervisor',
    'department_head',
  ].includes(effectiveRole);

  const canBulkUploadApprentices = [
    'hr_officer',
    'super_admin',
    'executive_director',
    'senior_management',
  ].includes(effectiveRole);

  const complianceStats = useMemo(() => {
    const active = apprentices.filter((a) => a.status === 'active').length;
    const supportNeeded = apprentices.filter((a) => a.status === 'needs_support').length;
    const pendingReview = apprenticeReports.filter((r) => r.status === 'submitted').length;
    const avgAttendance =
      apprentices.length > 0
        ? Math.round(apprentices.reduce((s, a) => s + (a.attendanceRate ?? 90), 0) / apprentices.length)
        : 0;
    return { active, supportNeeded, pendingReview, avgAttendance };
  }, [apprentices, apprenticeReports]);

  const clearAppFieldError = (
    field: 'appCode' | 'appName' | 'appEmail' | 'appPhone' | 'appRegion' | 'appSupervisor' | 'appLocation' | 'appObjectives'
  ) => {
    setAppFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setAppFormErrorSummary(null);
  };

  const resetAppForm = () => {
    setAppCode('');
    setAppName('');
    setAppEmail('');
    setAppPhone('');
    setAppCohortId('');
    setAppSupervisorId('');
    setAppSupervisorName('');
    setAppRegion('');
    setAppLocation('');
    setAppObjectives('');
    setAppFormErrors({});
    setAppFormErrorSummary(null);
  };

  const validateApprenticeForm = () => {
    const errors: Partial<
      Record<'appCode' | 'appName' | 'appEmail' | 'appPhone' | 'appRegion' | 'appSupervisor' | 'appLocation' | 'appObjectives', string>
    > = {};

    const code = appCode.trim();
    const name = appName.trim();
    const email = appEmail.trim();
    const phone = appPhone.trim();
    const region = appRegion.trim();
    const selectedSup = directory.find((d) => d.uid === appSupervisorId);
    const supervisorName = (appSupervisorName || selectedSup?.displayName || '').trim();
    const location = appLocation.trim();
    const objectives = appObjectives.trim();

    if (!code) {
      errors.appCode = 'Apprentice ID is required.';
    } else if (!/^[A-Za-z0-9_-]{2,32}$/.test(code)) {
      errors.appCode = 'Use 2–32 characters (letters, numbers, hyphens, or underscores).';
    } else if (apprentices.some((a) => a.apprenticeCode.trim().toLowerCase() === code.toLowerCase())) {
      errors.appCode = `Apprentice ID "${code}" already exists.`;
    }

    if (!name) {
      errors.appName = 'Apprentice full name is required.';
    } else if (name.length < 2 || name.length > 160) {
      errors.appName = 'Full name must be between 2 and 160 characters.';
    } else if (!/\p{L}.*\p{L}/u.test(name)) {
      errors.appName = 'Enter a valid full name containing letters.';
    }

    if (email) {
      if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.appEmail = 'Enter a valid email address (max 200 characters).';
      }
    }

    if (phone) {
      if (phone.length > 40 || !/^[+\d][\d\s()-]{6,39}$/.test(phone)) {
        errors.appPhone = 'Enter a valid phone number (e.g. +254 712 345 678).';
      }
    }

    if (!region) {
      errors.appRegion = 'Region is required.';
    } else if (region.length < 2 || region.length > 120) {
      errors.appRegion = 'Region must be between 2 and 120 characters.';
    }

    if (!supervisorName) {
      errors.appSupervisor = 'Select an RMS / Supervisor account or enter the supervisor name.';
    } else if (supervisorName.length < 2 || supervisorName.length > 160) {
      errors.appSupervisor = 'Supervisor name must be between 2 and 160 characters.';
    } else if (!/\p{L}.*\p{L}/u.test(supervisorName)) {
      errors.appSupervisor = 'Enter a valid RMS / Supervisor name.';
    }

    if (!location) {
      errors.appLocation = 'Training placement location is required.';
    } else if (location.length < 2 || location.length > 160) {
      errors.appLocation = 'Training placement location must be between 2 and 160 characters.';
    }

    if (objectives.length > 1500) {
      errors.appObjectives = 'Learning objectives must not exceed 1,500 characters.';
    }

    return {
      errors,
      isValid: Object.keys(errors).length === 0,
      cleaned: {
        code,
        name,
        email,
        phone,
        region,
        selectedSup,
        supervisorName,
        location,
        objectives,
      },
    };
  };

  const handleCreateApprentice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setNotice(null);

    const validation = validateApprenticeForm();
    if (!validation.isValid) {
      setAppFormErrors(validation.errors);
      setAppFormErrorSummary('Please fix the highlighted required fields before registering the apprentice.');
      return;
    }

    setAppFormErrors({});
    setAppFormErrorSummary(null);
    setSaving(true);

    const { code, name, email, phone, region, selectedSup, supervisorName, location, objectives } = validation.cleaned;
    const cohort = cohorts.find((c) => c.id === appCohortId) || cohorts[0];
    const matchedDirectorySup =
      selectedSup || directory.find((d) => d.displayName.trim().toLowerCase() === supervisorName.toLowerCase());
    const resolvedSupId = matchedDirectorySup?.uid || profile.uid;
    const ref = doc(collection(db, 'apprentices'));
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        apprenticeCode: code,
        userId: profile.uid,
        fullName: name,
        email,
        phone,
        cohortId: cohort?.id || 'cohort_default',
        cohortName: cohort?.name || 'Cohort 2026',
        startDate: new Date().toISOString().slice(0, 10),
        expectedCompletionDate: cohort?.endDate || '2027-11-30',
        supervisorId: resolvedSupId,
        supervisorName,
        region,
        trainingLocation: location,
        learningObjectives: objectives,
        attendanceRate: 95,
        status: 'active',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'REGISTER_APPRENTICE',
        targetCollection: 'apprentices',
        targetId: ref.id,
        summary: `Registered apprentice ${code} — ${name} (${region}, RMS: ${supervisorName})`,
      });
      setAppModalOpen(false);
      resetAppForm();
      setNotice(`Apprentice "${name}" (${code}) registered.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `apprentices/${ref.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCohort = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setCohortFormError(null);
    setNotice(null);

    const trimmedName = cohortName.trim();
    const trimmedProgramme = cohortProgramme.trim();
    const trimmedCoordinator = cohortCoordinator.trim();

    if (trimmedName.length < 2) {
      setCohortFormError('Cohort name must be at least 2 characters.');
      return;
    }
    if (trimmedProgramme.length < 2) {
      setCohortFormError('Programme name must be at least 2 characters.');
      return;
    }
    if (!cohortStartDate || !cohortEndDate) {
      setCohortFormError('Start date and end date are required.');
      return;
    }
    if (cohortEndDate < cohortStartDate) {
      setCohortFormError('End date must be on or after the start date.');
      return;
    }

    setSaving(true);
    const ref = doc(collection(db, 'cohorts'));
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        name: trimmedName,
        programme: trimmedProgramme,
        startDate: cohortStartDate,
        endDate: cohortEndDate,
        coordinatorName: trimmedCoordinator || profile.displayName,
        status: cohortStatus,
        isDemo: false,
        createdAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'CREATE_COHORT',
        targetCollection: 'cohorts',
        targetId: ref.id,
        summary: `Created cohort ${trimmedName} (${cohortStartDate} to ${cohortEndDate})`,
      });
      setCohortName('');
      setCohortCoordinator('');
      setCohortStatus('upcoming');
      setNotice(`Cohort "${trimmedName}" created.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `cohorts/${ref.id}`);
    } finally {
      setSaving(false);
    }
  };

  const openEditCohort = (cohort: Cohort) => {
    setEditingCohort(cohort);
    setEditCohortName(cohort.name);
    setEditCohortProgramme(cohort.programme);
    setEditCohortCoordinator(cohort.coordinatorName || '');
    setEditCohortStartDate(cohort.startDate);
    setEditCohortEndDate(cohort.endDate);
    setEditCohortStatus(cohort.status);
    setEditCohortError(null);
  };

  const handleUpdateCohort = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingCohort) return;
    setEditCohortError(null);
    setNotice(null);

    const trimmedName = editCohortName.trim();
    const trimmedProgramme = editCohortProgramme.trim();
    const trimmedCoordinator = editCohortCoordinator.trim();

    if (trimmedName.length < 2) {
      setEditCohortError('Cohort name must be at least 2 characters.');
      return;
    }
    if (trimmedProgramme.length < 2) {
      setEditCohortError('Programme name must be at least 2 characters.');
      return;
    }
    if (!editCohortStartDate || !editCohortEndDate) {
      setEditCohortError('Start date and end date are required.');
      return;
    }
    if (editCohortEndDate < editCohortStartDate) {
      setEditCohortError('End date must be on or after the start date.');
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, 'cohorts', editingCohort.id), {
        name: trimmedName,
        programme: trimmedProgramme,
        coordinatorName: trimmedCoordinator,
        startDate: editCohortStartDate,
        endDate: editCohortEndDate,
        status: editCohortStatus,
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'UPDATE_COHORT',
        targetCollection: 'cohorts',
        targetId: editingCohort.id,
        summary: `Updated cohort ${trimmedName} (${editCohortStartDate} to ${editCohortEndDate}, status: ${editCohortStatus})`,
      });
      setEditingCohort(null);
      setNotice(`Cohort "${trimmedName}" updated.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `cohorts/${editingCohort.id}`);
    } finally {
      setSaving(false);
    }
  };

  const updateTargetAndRaised = (nextTarget: string, nextRaised: string) => {
    setRepMonthlyTarget(nextTarget);
    setRepAmountRaised(nextRaised);
    const targetNum = Number(nextTarget);
    const raisedNum = Number(nextRaised);
    if (nextTarget !== '' && nextRaised !== '' && Number.isFinite(targetNum) && Number.isFinite(raisedNum)) {
      setRepDeficit(String(Math.max(0, Number((targetNum - raisedNum).toFixed(2)))));
    } else if (nextTarget !== '' && Number.isFinite(targetNum)) {
      setRepDeficit(String(Math.max(0, targetNum)));
    } else {
      setRepDeficit('0');
    }
  };

  const resetReportForm = () => {
    setRepType('weekly');
    setRepStart(new Date().toISOString().slice(0, 10));
    setRepEnd(new Date().toISOString().slice(0, 10));
    setRepMonthlyTarget('');
    setRepAmountRaised('');
    setRepDeficit('0');
    setRepCallsMade('');
    setRepNewPartners('');
    setRepTotalActivePartners('');
    setRepThingsWorked('');
    setRepThingsDidNotWork('');
    setRepNextWeekTarget('');
    setRepNextWeekPartners('');
    setRepNextWeekCalls('');
    setRepNextWeekAppointments('');
    setRepWorkProgress('');
    setRepPersonalDevotion('');
    setRepMentorship('');
    setRepStatus('submitted');
    setRepFormError(null);
  };

  const handleSaveReport = async (e: React.FormEvent, queueOffline = false) => {
    e.preventDefault();
    if (!profile) return;
    setNotice(null);
    setRepFormError(null);

    const monthlyTargetKes = Number(repMonthlyTarget);
    const amountRaisedKes = Number(repAmountRaised);
    const deficitKes = Number(repDeficit);
    const callsMadeThisWeek = Number(repCallsMade);
    const newPartnersApproached = Number(repNewPartners);
    const totalActivePartners = Number(repTotalActivePartners);
    const worked = repThingsWorked.trim();
    const didNotWork = repThingsDidNotWork.trim();
    const nextWeekTargetAmountKes = Number(repNextWeekTarget);
    const nextWeekPartnersToReachOut = Number(repNextWeekPartners);
    const nextWeekCallsToMake = Number(repNextWeekCalls);
    const nextWeekNewAppointments = Number(repNextWeekAppointments);
    const workProgress = repWorkProgress.trim();
    const personalDevotion = repPersonalDevotion.trim();
    const mentorshipUpdate = repMentorship.trim();

    if (!repStart || !repEnd) {
      setRepFormError('Period start and period end dates are required.');
      return;
    }
    if (repEnd < repStart) {
      setRepFormError('Period end date cannot be earlier than period start date.');
      return;
    }
    if (repMonthlyTarget === '' || !Number.isFinite(monthlyTargetKes) || monthlyTargetKes < 0) {
      setRepFormError('Enter a valid non-negative Monthly Target in KSh.');
      return;
    }
    if (repAmountRaised === '' || !Number.isFinite(amountRaisedKes) || amountRaisedKes < 0) {
      setRepFormError('Enter a valid non-negative Amount Raised so far in KSh.');
      return;
    }
    if (repDeficit === '' || !Number.isFinite(deficitKes) || deficitKes < 0) {
      setRepFormError('Enter a valid non-negative Deficit amount in KSh.');
      return;
    }
    if (repCallsMade === '' || !Number.isInteger(callsMadeThisWeek) || callsMadeThisWeek < 0) {
      setRepFormError('Number of calls made this week must be a whole number (0 or more).');
      return;
    }
    if (repNewPartners === '' || !Number.isInteger(newPartnersApproached) || newPartnersApproached < 0) {
      setRepFormError('Number of new partners approached this week must be a whole number (0 or more).');
      return;
    }
    if (repTotalActivePartners === '' || !Number.isInteger(totalActivePartners) || totalActivePartners < 0) {
      setRepFormError('Total number of active partners must be a whole number (0 or more).');
      return;
    }
    if (worked.length < 3 || worked.length > 3000) {
      setRepFormError('Please enter three things that worked this week (3–3,000 characters).');
      return;
    }
    if (didNotWork.length < 3 || didNotWork.length > 3000) {
      setRepFormError('Please enter three things that did not work this week (3–3,000 characters).');
      return;
    }
    if (repNextWeekTarget === '' || !Number.isFinite(nextWeekTargetAmountKes) || nextWeekTargetAmountKes < 0) {
      setRepFormError("Enter a valid non-negative Next Week's Target Amount in KSh.");
      return;
    }
    if (
      repNextWeekPartners === '' ||
      !Number.isInteger(nextWeekPartnersToReachOut) ||
      nextWeekPartnersToReachOut < 0 ||
      nextWeekPartnersToReachOut > 100000
    ) {
      setRepFormError('Number of partners to reach out to next week must be a whole number (0–100,000).');
      return;
    }
    if (
      repNextWeekCalls === '' ||
      !Number.isInteger(nextWeekCallsToMake) ||
      nextWeekCallsToMake < 0 ||
      nextWeekCallsToMake > 100000
    ) {
      setRepFormError('Number of calls to make next week must be a whole number (0–100,000).');
      return;
    }
    if (
      repNextWeekAppointments === '' ||
      !Number.isInteger(nextWeekNewAppointments) ||
      nextWeekNewAppointments < 0 ||
      nextWeekNewAppointments > 100000
    ) {
      setRepFormError('Number of new appointments to make next week must be a whole number (0–100,000).');
      return;
    }
    if (workProgress.length < 3 || workProgress.length > 3000) {
      setRepFormError('Please complete the Work Progress section (3–3,000 characters).');
      return;
    }
    if (personalDevotion.length < 3 || personalDevotion.length > 3000) {
      setRepFormError('Please complete the Personal Devotion section (3–3,000 characters).');
      return;
    }
    if (mentorshipUpdate.length < 3 || mentorshipUpdate.length > 3000) {
      setRepFormError('Please complete the Mentorship section (3–3,000 characters).');
      return;
    }

    const myApprentice = apprentices.find((a) => a.userId === profile.uid) || apprentices[0];
    const sup = directory.find((d) => d.role === 'apprentice_supervisor');
    const clientRequestId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const activitiesSummary = [
      `Target: ${formatKes(monthlyTargetKes)} | Raised: ${formatKes(amountRaisedKes)} | Deficit: ${formatKes(deficitKes)}`,
      `Calls: ${callsMadeThisWeek} | New Partners: ${newPartnersApproached} | Active Partners: ${totalActivePartners}`,
      `Worked: ${worked}`,
    ]
      .join(' — ')
      .slice(0, 3000);

    const payload = {
      orgId: ORG_ID,
      apprenticeId: myApprentice?.id || profile.uid,
      apprenticeUserId: profile.uid,
      apprenticeName: profile.displayName,
      supervisorId: myApprentice?.supervisorId || sup?.uid || profile.uid,
      reportType: repType,
      periodStart: repStart,
      periodEnd: repEnd,
      monthlyTargetKes,
      amountRaisedKes,
      deficitKes,
      callsMadeThisWeek,
      newPartnersApproached,
      totalActivePartners,
      thingsWorked: worked,
      thingsDidNotWork: didNotWork,
      nextWeekTargetAmountKes,
      nextWeekPartnersToReachOut,
      nextWeekCallsToMake,
      nextWeekNewAppointments,
      workProgress,
      personalDevotion,
      mentorshipUpdate,
      activities: activitiesSummary,
      lessonsLearned: worked.slice(0, 2000),
      challenges: didNotWork.slice(0, 2000),
      status: repStatus,
      clientRequestId,
      isDemo: false,
    };

    if (queueOffline || !navigator.onLine) {
      enqueueOfflineItem({
        clientRequestId,
        type: 'apprentice_report',
        userId: profile.uid,
        userName: profile.displayName,
        userRole: profile.role,
        payload,
      });
      setReportModalOpen(false);
      resetReportForm();
      setNotice('Report saved to Offline Sync Queue. It will synchronise automatically when online.');
      return;
    }

    setSaving(true);
    const ref = doc(collection(db, 'apprenticeReports'));
    try {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: repStatus === 'draft' ? 'SAVE_APPRENTICE_DRAFT' : 'SUBMIT_APPRENTICE_REPORT',
        targetCollection: 'apprenticeReports',
        targetId: ref.id,
        summary: `${repStatus === 'draft' ? 'Saved draft' : 'Submitted'} ${repType} report (${repStart} to ${repEnd})`,
      });
      setReportModalOpen(false);
      resetReportForm();
      setNotice(repStatus === 'draft' ? 'Report draft saved.' : 'Report submitted for supervisor review.');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `apprenticeReports/${ref.id}`);
      } catch (e2) {
        setRepFormError(e2 instanceof Error ? e2.message : 'Unable to submit report.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSupervisorDecision = async (decision: 'approved' | 'returned') => {
    if (!reviewReport || !profile) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'apprenticeReports', reviewReport.id), {
        status: decision,
        supervisorComment: supComment.trim() || (decision === 'approved' ? 'Approved.' : 'Please revise.'),
        evaluationScore: Number(supScore) || 4,
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: `SUPERVISOR_${decision.toUpperCase()}`,
        targetCollection: 'apprenticeReports',
        targetId: reviewReport.id,
        summary: `${decision.toUpperCase()} ${reviewReport.apprenticeName}'s ${reviewReport.reportType} report`,
      });
      if (!reviewReport.apprenticeUserId.startsWith('demo_')) {
        await sendNotification({
          recipientUid: reviewReport.apprenticeUserId,
          title: `Apprentice Report ${decision === 'approved' ? 'Approved' : 'Returned'}`,
          message: `${profile.displayName} reviewed your ${reviewReport.reportType} report (${reviewReport.periodStart}).`,
          category: 'report',
          linkModule: 'apprenticeship',
        });
      }
      setReviewReport(null);
      setSupComment('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `apprenticeReports/${reviewReport.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportApprenticeship = (format: 'pdf' | 'xlsx') => {
    const cols = [
      { header: 'Code', key: 'code' },
      { header: 'Apprentice Name', key: 'name' },
      { header: 'Cohort', key: 'cohort' },
      { header: 'Region', key: 'region' },
      { header: 'Location', key: 'location' },
      { header: 'RMS / Supervisor', key: 'supervisor' },
      { header: 'Attendance %', key: 'attendance' },
      { header: 'Status', key: 'status' },
    ];
    const rows = apprentices.map((a) => ({
      code: a.apprenticeCode,
      name: a.fullName,
      cohort: a.cohortName || '',
      region: a.region || '',
      location: a.trainingLocation || '',
      supervisor: a.supervisorName || '',
      attendance: a.attendanceRate ?? 0,
      status: a.status,
    }));
    if (format === 'pdf') {
      exportToPdf({
        fileName: 'iServe_Apprenticeship_Report',
        title: 'Apprenticeship Compliance & Attendance Report',
        columns: cols,
        rows,
      });
    } else {
      exportToExcel({
        fileName: 'iServe_Apprenticeship_Report',
        sheetName: 'Apprentices',
        title: 'iServe Africa Apprenticeship Report',
        columns: cols,
        rows,
      });
    }
  };

  const matchesProfileSearch = (r: Apprentice, q: string) =>
    r.apprenticeCode.toLowerCase().includes(q) ||
    r.fullName.toLowerCase().includes(q) ||
    (r.email || '').toLowerCase().includes(q) ||
    (r.cohortName || '').toLowerCase().includes(q) ||
    (r.region || '').toLowerCase().includes(q) ||
    (r.supervisorName || '').toLowerCase().includes(q) ||
    (r.trainingLocation || '').toLowerCase().includes(q) ||
    r.status.toLowerCase().includes(q);

  const filteredApprentices = useMemo(() => {
    const q = profileSearch.trim().toLowerCase();
    if (!q) return apprentices;
    return apprentices.filter((r) => matchesProfileSearch(r, q));
  }, [apprentices, profileSearch]);

  const handleExportApprenticesCsv = () => {
    if (filteredApprentices.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    exportToCsv({
      fileName: `iServe_Apprentices_HR_Report_${today}`,
      columns: [
        { header: 'Apprentice ID', key: 'apprenticeCode' },
        { header: 'Full Name', key: 'fullName' },
        { header: 'Email', key: 'email' },
        { header: 'Phone', key: 'phone' },
        { header: 'Cohort ID', key: 'cohortId' },
        { header: 'Cohort', key: 'cohortName' },
        { header: 'Region', key: 'region' },
        { header: 'Training Placement Location', key: 'trainingLocation' },
        { header: 'RMS / Supervisor ID', key: 'supervisorId' },
        { header: 'RMS / Supervisor Name', key: 'supervisorName' },
        { header: 'Start Date', key: 'startDate' },
        { header: 'Expected Completion Date', key: 'expectedCompletionDate' },
        { header: 'Attendance Rate (%)', key: 'attendanceRate' },
        { header: 'Status', key: 'status' },
        { header: 'Learning Objectives', key: 'learningObjectives' },
        { header: 'Emergency Contact', key: 'emergencyContact' },
        { header: 'Record Source', key: 'recordSource' },
      ],
      rows: filteredApprentices.map((a) => ({
        apprenticeCode: a.apprenticeCode,
        fullName: a.fullName,
        email: a.email || '',
        phone: a.phone || '',
        cohortId: a.cohortId,
        cohortName: a.cohortName || '',
        region: a.region || '',
        trainingLocation: a.trainingLocation || '',
        supervisorId: a.supervisorId,
        supervisorName: a.supervisorName || '',
        startDate: a.startDate || '',
        expectedCompletionDate: a.expectedCompletionDate || '',
        attendanceRate: a.attendanceRate ?? 95,
        status: a.status,
        learningObjectives: a.learningObjectives || '',
        emergencyContact: a.emergencyContact || '',
        recordSource: a.isDemo ? 'Demo' : 'Live',
      })),
    });
    setNotice(`Exported ${filteredApprentices.length} apprentice record${filteredApprentices.length === 1 ? '' : 's'} to CSV for HR reporting.`);
  };

  const openBulkUploadModal = () => {
    setBulkFileName('');
    setBulkParseError(null);
    setBulkRows([]);
    setBulkModalOpen(true);
  };

  const handleDownloadBulkTemplate = () => {
    const defaultCohortName = cohorts[0]?.name || 'Cohort 2026 (Nairobi & Rift)';
    exportToCsv({
      fileName: 'iServe_Apprentice_Bulk_Upload_Template',
      columns: [
        { header: 'Apprentice ID', key: 'apprenticeCode' },
        { header: 'Full Name', key: 'fullName' },
        { header: 'Supervisor', key: 'supervisor' },
        { header: 'Region', key: 'region' },
        { header: 'Cohort', key: 'cohort' },
        { header: 'Training Placement Location', key: 'trainingLocation' },
        { header: 'Email', key: 'email' },
        { header: 'Phone', key: 'phone' },
        { header: 'Start Date', key: 'startDate' },
        { header: 'Expected Completion Date', key: 'expectedCompletionDate' },
        { header: 'Attendance Rate (%)', key: 'attendanceRate' },
        { header: 'Status', key: 'status' },
        { header: 'Learning Objectives', key: 'learningObjectives' },
      ],
      rows: [
        {
          apprenticeCode: 'APP-2610',
          fullName: 'Grace Wanjiku Kamau',
          supervisor: 'David Ochieng',
          region: 'Rift Valley',
          cohort: defaultCohortName,
          trainingLocation: 'Trinity Fellowship, Eldoret',
          email: 'grace.wanjiku@iserveafrica.org',
          phone: '+254 712 345 678',
          startDate: new Date().toISOString().slice(0, 10),
          expectedCompletionDate: cohorts[0]?.endDate || '2027-11-30',
          attendanceRate: 95,
          status: 'active',
          learningObjectives: 'Expository Bible handling, youth ministry, and church leadership',
        },
      ],
    });
  };

  const handleBulkCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBulkFileName(file.name);
    setBulkParseError(null);
    setBulkRows([]);

    if (file.size > 2 * 1024 * 1024) {
      setBulkParseError('CSV file exceeds the 2 MB upload limit. Split into smaller batches and retry.');
      return;
    }

    const text = await file.text();
    const rawRows = parseCsvRows(text);
    if (rawRows.length < 2) {
      setBulkParseError('CSV must include a header row and at least one apprentice data row.');
      return;
    }
    if (rawRows.length - 1 > 500) {
      setBulkParseError('Maximum 500 apprentice rows are allowed per CSV upload.');
      return;
    }

    const headers = rawRows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '));
    const findCol = (aliases: string[]) => headers.findIndex((h) => aliases.includes(h));

    const colName = findCol(['full name', 'name', 'apprentice name', 'fullname']);
    const colSupervisor = findCol([
      'supervisor',
      'rms',
      'rms in charge',
      'rms / supervisor',
      'rms / supervisor name',
      'rms in charge / supervisor',
      'supervisor name',
      'supervisorname',
    ]);
    const colRegion = findCol(['region', 'kenya region']);
    const colCohort = findCol(['cohort', 'cohort name', 'cohortname', 'cohort id', 'cohortid']);
    const colCode = findCol(['apprentice id', 'code', 'apprentice code', 'apprenticecode', 'id']);
    const colEmail = findCol(['email', 'work email', 'email address']);
    const colPhone = findCol(['phone', 'phone number', 'mobile']);
    const colLocation = findCol(['training placement location', 'training location', 'location', 'placement', 'traininglocation']);
    const colStartDate = findCol(['start date', 'startdate']);
    const colEndDate = findCol(['expected completion date', 'completion date', 'end date', 'expectedcompletiondate']);
    const colAttendance = findCol(['attendance rate (%)', 'attendance rate', 'attendance', 'attendancerate']);
    const colStatus = findCol(['status', 'standing']);
    const colObjectives = findCol(['learning objectives', 'objectives', 'learningobjectives']);

    const missingHeaders: string[] = [];
    if (colName === -1) missingHeaders.push('Name (Full Name)');
    if (colSupervisor === -1) missingHeaders.push('Supervisor (RMS / Supervisor)');
    if (colRegion === -1) missingHeaders.push('Region');
    if (colCohort === -1) missingHeaders.push('Cohort');

    if (missingHeaders.length > 0) {
      setBulkParseError(`Missing required CSV column header(s): ${missingHeaders.join(', ')}. Download the template to verify column names.`);
      return;
    }

    const existingCodes = new Set(apprentices.map((a) => a.apprenticeCode.trim().toLowerCase()));
    const seenCsvCodes = new Set<string>();
    const today = new Date().toISOString().slice(0, 10);
    const validStatuses: Apprentice['status'][] = ['active', 'needs_support', 'completed', 'deferred'];
    const parsed: ParsedApprenticeImportRow[] = [];

    for (let i = 1; i < rawRows.length; i += 1) {
      const cols = rawRows[i];
      const getVal = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : '');
      const rowErrors: string[] = [];

      const fullName = getVal(colName);
      const supervisorInput = getVal(colSupervisor);
      const region = getVal(colRegion);
      const cohortInput = getVal(colCohort);
      let apprenticeCode = getVal(colCode);
      const email = getVal(colEmail);
      const phone = getVal(colPhone);
      const rawLocation = getVal(colLocation);
      const startDate = getVal(colStartDate) || today;
      const rawEndDate = getVal(colEndDate);
      const rawAttendance = getVal(colAttendance);
      const rawStatus = (getVal(colStatus) || 'active').toLowerCase() as Apprentice['status'];
      const learningObjectives = getVal(colObjectives);

      // Required: Name
      if (!fullName) {
        rowErrors.push('Name is required.');
      } else if (fullName.length < 2 || fullName.length > 160 || !/\p{L}.*\p{L}/u.test(fullName)) {
        rowErrors.push('Name must be 2–160 characters containing letters.');
      }

      // Required: Supervisor
      if (!supervisorInput) {
        rowErrors.push('Supervisor is required.');
      } else if (supervisorInput.length < 2 || supervisorInput.length > 160 || !/\p{L}.*\p{L}/u.test(supervisorInput)) {
        rowErrors.push('Supervisor must be 2–160 characters containing letters.');
      }
      const matchedSup = directory.find(
        (d) => d.displayName.trim().toLowerCase() === supervisorInput.toLowerCase()
      );
      const supervisorId = matchedSup?.uid || profile?.uid || 'unassigned';

      // Required: Region
      if (!region) {
        rowErrors.push('Region is required.');
      } else if (region.length < 2 || region.length > 120) {
        rowErrors.push('Region must be 2–120 characters.');
      }

      // Required: Cohort
      let matchedCohort: Cohort | undefined;
      if (!cohortInput) {
        rowErrors.push('Cohort is required.');
      } else if (cohortInput.length < 2 || cohortInput.length > 120) {
        rowErrors.push('Cohort must be 2–120 characters.');
      } else {
        matchedCohort = cohorts.find(
          (c) =>
            c.name.trim().toLowerCase() === cohortInput.toLowerCase() ||
            c.id.trim().toLowerCase() === cohortInput.toLowerCase()
        );
      }
      const cohortId =
        matchedCohort?.id ||
        `cohort_${cohortInput
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 60) || 'default'}`;
      const cohortName = matchedCohort?.name || cohortInput;

      // Apprentice ID (auto-generate if omitted, validate if provided)
      if (!apprenticeCode) {
        let seq = apprentices.length + i;
        let candidate = `APP-${new Date().getFullYear().toString().slice(-2)}${String(seq).padStart(2, '0')}`;
        while (existingCodes.has(candidate.toLowerCase()) || seenCsvCodes.has(candidate.toLowerCase())) {
          seq += 1;
          candidate = `APP-${new Date().getFullYear().toString().slice(-2)}${String(seq).padStart(2, '0')}`;
        }
        apprenticeCode = candidate;
      } else {
        if (!/^[A-Za-z0-9_-]{2,32}$/.test(apprenticeCode)) {
          rowErrors.push('Apprentice ID must be 2–32 chars (letters, numbers, -, _).');
        } else if (existingCodes.has(apprenticeCode.toLowerCase())) {
          rowErrors.push(`Apprentice ID "${apprenticeCode}" already exists in database.`);
        } else if (seenCsvCodes.has(apprenticeCode.toLowerCase())) {
          rowErrors.push(`Duplicate Apprentice ID "${apprenticeCode}" in CSV.`);
        }
      }
      if (apprenticeCode) {
        seenCsvCodes.add(apprenticeCode.toLowerCase());
      }

      // Optional Email
      if (email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        rowErrors.push('Invalid Email format.');
      }

      // Optional Phone
      if (phone && (phone.length > 40 || !/^[+\d][\d\s()-]{6,39}$/.test(phone))) {
        rowErrors.push('Invalid Phone format.');
      }

      // Optional Location
      const trainingLocation = rawLocation || (region ? `${region} Placement` : '');
      if (trainingLocation.length > 160) {
        rowErrors.push('Training Placement Location exceeds 160 characters.');
      }

      // Optional Attendance
      let attendanceRate = 95;
      if (rawAttendance) {
        const num = Number(rawAttendance);
        if (Number.isNaN(num) || num < 0 || num > 100) {
          rowErrors.push('Attendance Rate must be between 0 and 100.');
        } else {
          attendanceRate = Math.round(num);
        }
      }

      // Optional Status
      const status: Apprentice['status'] = validStatuses.includes(rawStatus) ? rawStatus : 'active';
      if (getVal(colStatus) && !validStatuses.includes(rawStatus)) {
        rowErrors.push(`Status must be one of: ${validStatuses.join(', ')}.`);
      }

      // Optional Dates & Objectives
      if (startDate.length > 32) {
        rowErrors.push('Start Date exceeds 32 characters.');
      }
      const expectedCompletionDate = rawEndDate || matchedCohort?.endDate || '2027-11-30';
      if (expectedCompletionDate.length > 32) {
        rowErrors.push('Expected Completion Date exceeds 32 characters.');
      }
      if (learningObjectives.length > 1500) {
        rowErrors.push('Learning Objectives exceeds 1,500 characters.');
      }

      parsed.push({
        rowNumber: i + 1,
        apprenticeCode,
        fullName,
        email,
        phone,
        cohortId,
        cohortName,
        cohortMatched: Boolean(matchedCohort),
        supervisorId,
        supervisorName: matchedSup?.displayName || supervisorInput,
        region,
        trainingLocation,
        startDate,
        expectedCompletionDate,
        attendanceRate,
        status,
        learningObjectives,
        errors: rowErrors,
      });
    }

    setBulkRows(parsed);
  };

  const bulkValidationSummary = useMemo(() => {
    const valid = bulkRows.filter((r) => r.errors.length === 0).length;
    const invalid = bulkRows.length - valid;
    return { total: bulkRows.length, valid, invalid };
  }, [bulkRows]);

  const handleCommitBulkImport = async () => {
    if (!profile || !canBulkUploadApprentices) return;
    if (bulkRows.length === 0 || bulkValidationSummary.invalid > 0) return;

    setImportingBulk(true);
    setNotice(null);

    try {
      const CHUNK_SIZE = 400;
      for (let start = 0; start < bulkRows.length; start += CHUNK_SIZE) {
        const chunk = bulkRows.slice(start, start + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const item of chunk) {
          const ref = doc(collection(db, 'apprentices'));
          batch.set(ref, {
            orgId: ORG_ID,
            apprenticeCode: item.apprenticeCode,
            userId: profile.uid,
            fullName: item.fullName,
            email: item.email,
            phone: item.phone,
            cohortId: item.cohortId,
            cohortName: item.cohortName,
            startDate: item.startDate,
            expectedCompletionDate: item.expectedCompletionDate,
            supervisorId: item.supervisorId,
            supervisorName: item.supervisorName,
            region: item.region,
            trainingLocation: item.trainingLocation,
            learningObjectives: item.learningObjectives,
            attendanceRate: item.attendanceRate,
            status: item.status,
            isDemo: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'BULK_IMPORT_APPRENTICES',
        targetCollection: 'apprentices',
        targetId: 'bulk_csv',
        summary: `Bulk imported ${bulkRows.length} apprentice profile(s) from ${bulkFileName || 'CSV file'}`,
      });

      const importedCount = bulkRows.length;
      setBulkModalOpen(false);
      setBulkRows([]);
      setBulkFileName('');
      setTab('profiles');
      setNotice(`Successfully imported ${importedCount} apprentice record${importedCount === 1 ? '' : 's'} from CSV.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'apprentices/bulkImport');
    } finally {
      setImportingBulk(false);
    }
  };

  const reportCols: ColumnDef<ApprenticeReport>[] = [
    {
      key: 'apprentice',
      header: 'Apprentice & Type',
      sortable: true,
      sortValue: (r) => r.apprenticeName,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.apprenticeName}</div>
          <div className="text-xs text-slate-500 capitalize">
            {r.reportType} report · {r.periodStart}
            {r.periodEnd ? ` to ${r.periodEnd}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'activities',
      header: 'Targets, Outreach & Reflections',
      render: (r) => (
        <div className="max-w-md space-y-0.5">
          {typeof r.monthlyTargetKes === 'number' ? (
            <>
              <div className="text-xs font-mono text-slate-800">
                Raised {formatKes(r.amountRaisedKes ?? 0)} / {formatKes(r.monthlyTargetKes)} · Deficit{' '}
                <span className={(r.deficitKes ?? 0) > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-700'}>
                  {formatKes(r.deficitKes ?? 0)}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Calls: {r.callsMadeThisWeek ?? 0} · New partners: {r.newPartnersApproached ?? 0} · Active:{' '}
                {r.totalActivePartners ?? 0}
              </div>
              {typeof r.nextWeekTargetAmountKes === 'number' && (
                <div className="text-[11px] text-slate-500 font-mono">
                  Next wk: {formatKes(r.nextWeekTargetAmountKes)} · {r.nextWeekPartnersToReachOut ?? 0} partners ·{' '}
                  {r.nextWeekCallsToMake ?? 0} calls · {r.nextWeekNewAppointments ?? 0} appts
                </div>
              )}
              {r.thingsWorked && (
                <div className="text-[11px] text-slate-600 line-clamp-1">Worked: {r.thingsWorked}</div>
              )}
            </>
          ) : (
            <>
              <div className="text-xs text-slate-700 line-clamp-2">{r.activities}</div>
              {r.lessonsLearned && (
                <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">Lesson: {r.lessonsLearned}</div>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Evaluation',
      align: 'right',
      render: (r) =>
        r.evaluationScore ? <span className="font-mono font-semibold">{r.evaluationScore}/5</span> : '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'action',
      header: 'Review',
      align: 'right',
      render: (r) =>
        isSupervisorRole && r.status === 'submitted' ? (
          <button
            type="button"
            onClick={() => {
              setReviewReport(r);
              setSupComment('');
            }}
            className="text-xs font-semibold text-emerald-800 hover:underline"
          >
            Evaluate
          </button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ];

  const profileCols: ColumnDef<Apprentice>[] = [
    {
      key: 'code',
      header: 'Apprentice ID',
      sortable: true,
      sortValue: (r) => r.apprenticeCode,
      render: (r) => <span className="font-mono text-xs font-semibold text-slate-900">{r.apprenticeCode}</span>,
    },
    {
      key: 'name',
      header: 'Name & Placement',
      sortable: true,
      sortValue: (r) => r.fullName,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.fullName}</div>
          <div className="text-xs text-slate-500">
            {r.trainingLocation || 'Nairobi'}
            {r.region ? ` · ${r.region}` : ''} · {r.cohortName}
          </div>
        </div>
      ),
    },
    {
      key: 'supervisor',
      header: 'RMS / Supervisor',
      render: (r) => <span className="text-xs text-slate-700">{r.supervisorName || 'Assigned'}</span>,
    },
    {
      key: 'attendance',
      header: 'Attendance',
      align: 'right',
      render: (r) => <span className="font-mono font-semibold">{r.attendanceRate ?? 95}%</span>,
    },
    {
      key: 'status',
      header: 'Standing',
      render: (r) => <StatusText status={r.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Apprenticeship Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cohort profiles, daily/weekly/monthly reflections, supervisor evaluations, and compliance tracking
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExportApprenticeship('pdf')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => handleExportApprenticeship('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          {canBulkUploadApprentices && (
            <button
              type="button"
              onClick={openBulkUploadModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Bulk Upload CSV
            </button>
          )}
          {isSupervisorRole && (
            <button
              type="button"
              onClick={() => {
                setAppFormErrors({});
                setAppFormErrorSummary(null);
                setAppModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Register Apprentice
            </button>
          )}
          <button
            type="button"
            onClick={() => setReportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            Submit Report
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">{notice}</div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Active Apprentices</div>
          <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">{complianceStats.active}</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Needs Support Flag</div>
          <div className="text-xl font-bold font-mono text-red-700 tabular-nums">
            {complianceStats.supportNeeded}
          </div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Reports Pending Review</div>
          <div className="text-xl font-bold font-mono text-amber-700 tabular-nums">
            {complianceStats.pendingReview}
          </div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Average Attendance</div>
          <div className="text-xl font-bold font-mono text-emerald-800 tabular-nums">
            {complianceStats.avgAttendance}%
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg w-fit overflow-x-auto">
        {(
          [
            { key: 'reports', label: 'Apprentice Reports' },
            { key: 'profiles', label: 'Apprentice Profiles' },
            ...(isSupervisorRole ? [{ key: 'supervisor' as ApprTab, label: 'Supervisor Review Queue' }] : []),
            { key: 'cohorts', label: 'Cohorts' },
          ] as { key: ApprTab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'reports' && (
        <DataTable
          rows={apprenticeReports}
          columns={reportCols}
          rowKey={(r) => r.id}
          searchPlaceholder="Search reports by apprentice, type, or reflection..."
          searchFilter={(r, q) =>
            r.apprenticeName.toLowerCase().includes(q) ||
            r.reportType.toLowerCase().includes(q) ||
            r.activities.toLowerCase().includes(q) ||
            (r.thingsWorked || '').toLowerCase().includes(q) ||
            (r.thingsDidNotWork || '').toLowerCase().includes(q) ||
            (r.workProgress || '').toLowerCase().includes(q) ||
            (r.personalDevotion || '').toLowerCase().includes(q) ||
            (r.mentorshipUpdate || '').toLowerCase().includes(q)
          }
        />
      )}

      {tab === 'profiles' && (
        <DataTable
          rows={apprentices}
          columns={profileCols}
          rowKey={(r) => r.id}
          searchPlaceholder="Search apprentice ID, name, cohort, region, RMS, or location..."
          searchQuery={profileSearch}
          onSearchChange={setProfileSearch}
          searchFilter={matchesProfileSearch}
          toolbarExtra={
            <button
              type="button"
              disabled={filteredApprentices.length === 0}
              onClick={handleExportApprenticesCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 whitespace-nowrap disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV ({filteredApprentices.length})
            </button>
          }
        />
      )}

      {tab === 'supervisor' && isSupervisorRole && (
        <DataTable
          rows={apprenticeReports.filter((r) => r.status === 'submitted')}
          columns={reportCols}
          rowKey={(r) => r.id}
          emptyTitle="No reports awaiting review"
          emptyDescription="All submitted apprentice reports have been evaluated."
        />
      )}

      {tab === 'cohorts' && (
        <div className="space-y-5">
          {isSupervisorRole && (
            <form
              onSubmit={(e) => void handleCreateCohort(e)}
              className="bg-white border border-stone-200 rounded-xl p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Create Cohort</h2>
                  <p className="text-xs text-slate-500">
                    Define a new apprenticeship intake cohort for apprentice registration and tracking
                  </p>
                </div>
              </div>

              {cohortFormError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {cohortFormError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cohort Name</label>
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={cohortName}
                    onChange={(e) => setCohortName(e.target.value)}
                    placeholder="e.g. Cohort 2027-A (Nairobi & Coast)"
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Programme</label>
                  <input
                    required
                    minLength={2}
                    maxLength={160}
                    value={cohortProgramme}
                    onChange={(e) => setCohortProgramme(e.target.value)}
                    placeholder="e.g. 2-Year Ministry Apprenticeship"
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Coordinator / RMS</label>
                  <input
                    maxLength={160}
                    value={cohortCoordinator}
                    onChange={(e) => setCohortCoordinator(e.target.value)}
                    list="cohort-coordinator-options"
                    placeholder={profile?.displayName || 'e.g. David Ochieng'}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                  <datalist id="cohort-coordinator-options">
                    {directory.map((d) => (
                      <option key={d.uid} value={d.displayName} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={cohortStartDate}
                    onChange={(e) => setCohortStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={cohortEndDate}
                    onChange={(e) => setCohortEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={cohortStatus}
                    onChange={(e) => setCohortStatus(e.target.value as 'upcoming' | 'active' | 'completed')}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg whitespace-nowrap disabled:opacity-60"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {saving ? 'Creating...' : 'Create Cohort'}
                </button>
              </div>
            </form>
          )}

          {cohorts.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-sm text-slate-500">
              No cohorts recorded yet. Use the form above to create the first cohort.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cohorts.map((c) => {
                const enrolledCount = apprentices.filter((a) => a.cohortId === c.id).length;
                return (
                  <div key={c.id} className="bg-white border border-stone-200 rounded-xl p-5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{c.name}</h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusText status={c.status} />
                        {isSupervisorRole && (
                          <button
                            type="button"
                            onClick={() => openEditCohort(c)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 whitespace-nowrap"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-slate-600">{c.programme}</div>
                    <div className="text-xs font-mono text-slate-500">
                      {c.startDate} → {c.endDate} · Coordinator: {c.coordinatorName || 'Assigned'} · {enrolledCount}{' '}
                      {enrolledCount === 1 ? 'apprentice' : 'apprentices'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Submit Report Modal */}
      <Modal
        open={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setRepFormError(null);
        }}
        title="Submit Apprentice Report"
        subtitle="Weekly targets, partner outreach metrics, and ministry reflections"
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={(e) => void handleSaveReport(e, false)} className="space-y-4">
          {repFormError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700" role="alert">
              {repFormError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="rep-type" className="block text-xs font-medium text-slate-700 mb-1">
                Report Type *
              </label>
              <select
                id="rep-type"
                value={repType}
                onChange={(e) => setRepType(e.target.value as ApprenticeReport['reportType'])}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="daily">Daily Report</option>
                <option value="weekly">Weekly Report</option>
                <option value="monthly">Monthly Report</option>
                <option value="activity">Activity Report</option>
                <option value="reflection">Reflection Report</option>
              </select>
            </div>
            <div>
              <label htmlFor="rep-start" className="block text-xs font-medium text-slate-700 mb-1">
                Period Start *
              </label>
              <input
                id="rep-start"
                type="date"
                required
                value={repStart}
                onChange={(e) => setRepStart(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="rep-end" className="block text-xs font-medium text-slate-700 mb-1">
                Period End *
              </label>
              <input
                id="rep-end"
                type="date"
                required
                value={repEnd}
                onChange={(e) => setRepEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="rep-monthly-target" className="block text-xs font-medium text-slate-700 mb-1">
                Monthly Target (KSh) *
              </label>
              <input
                id="rep-monthly-target"
                type="number"
                min="0"
                step="0.01"
                required
                value={repMonthlyTarget}
                onChange={(e) => updateTargetAndRaised(e.target.value, repAmountRaised)}
                placeholder="e.g. 50000"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="rep-amount-raised" className="block text-xs font-medium text-slate-700 mb-1">
                Amount Raised Since 1st of Month (KSh) *
              </label>
              <input
                id="rep-amount-raised"
                type="number"
                min="0"
                step="0.01"
                required
                value={repAmountRaised}
                onChange={(e) => updateTargetAndRaised(repMonthlyTarget, e.target.value)}
                placeholder="e.g. 32000"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="rep-deficit" className="block text-xs font-medium text-slate-700 mb-1">
                Deficit (KSh) *
              </label>
              <input
                id="rep-deficit"
                type="number"
                min="0"
                step="0.01"
                required
                value={repDeficit}
                onChange={(e) => setRepDeficit(e.target.value)}
                placeholder="Auto-calculated"
                className="w-full px-3 py-2 text-sm font-mono bg-stone-50 border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="rep-calls-made" className="block text-xs font-medium text-slate-700 mb-1">
                Number of Calls Made This Week *
              </label>
              <input
                id="rep-calls-made"
                type="number"
                min="0"
                step="1"
                required
                value={repCallsMade}
                onChange={(e) => setRepCallsMade(e.target.value)}
                placeholder="e.g. 15"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="rep-new-partners" className="block text-xs font-medium text-slate-700 mb-1">
                New Partners Approached This Week *
              </label>
              <input
                id="rep-new-partners"
                type="number"
                min="0"
                step="1"
                required
                value={repNewPartners}
                onChange={(e) => setRepNewPartners(e.target.value)}
                placeholder="e.g. 4"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="rep-active-partners" className="block text-xs font-medium text-slate-700 mb-1">
                Total Number of Active Partners *
              </label>
              <input
                id="rep-active-partners"
                type="number"
                min="0"
                step="1"
                required
                value={repTotalActivePartners}
                onChange={(e) => setRepTotalActivePartners(e.target.value)}
                placeholder="e.g. 22"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rep-worked" className="block text-xs font-medium text-slate-700 mb-1">
              Three Things That Worked This Week *
            </label>
            <textarea
              id="rep-worked"
              rows={3}
              required
              minLength={3}
              maxLength={3000}
              value={repThingsWorked}
              onChange={(e) => setRepThingsWorked(e.target.value)}
              placeholder="Describe three things that worked well this week..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="rep-did-not-work" className="block text-xs font-medium text-slate-700 mb-1">
              Three Things That Did Not Work This Week *
            </label>
            <textarea
              id="rep-did-not-work"
              rows={3}
              required
              minLength={3}
              maxLength={3000}
              value={repThingsDidNotWork}
              onChange={(e) => setRepThingsDidNotWork(e.target.value)}
              placeholder="Describe three things that did not work or faced setbacks this week..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-700">Next Week Targets &amp; Outreach Plan *</div>
            <div className="overflow-x-auto border border-stone-200 rounded-lg">
              <table className="w-full border-collapse text-left">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">
                      Next Week Plan
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Next Week&apos;s Target Amount (KSh) *
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Partners to Reach Out To *
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Calls to Make Next Week *
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      New Appointments Next Week *
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="px-3 py-2.5 text-xs font-semibold text-slate-700 bg-stone-50/70 border-r border-stone-200 whitespace-nowrap">
                      Weekly Targets
                    </td>
                    <td className="px-2.5 py-2 border-r border-stone-200 min-w-[140px]">
                      <input
                        id="rep-next-target"
                        aria-label="Next week's target amount in KSh"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={repNextWeekTarget}
                        onChange={(e) => setRepNextWeekTarget(e.target.value)}
                        placeholder="e.g. 25000"
                        className="w-full px-2.5 py-1.5 text-sm font-mono border border-stone-300 rounded-md"
                      />
                    </td>
                    <td className="px-2.5 py-2 border-r border-stone-200 min-w-[120px]">
                      <input
                        id="rep-next-partners"
                        aria-label="Number of partners to reach out to"
                        type="number"
                        min="0"
                        max="100000"
                        step="1"
                        required
                        value={repNextWeekPartners}
                        onChange={(e) => setRepNextWeekPartners(e.target.value)}
                        placeholder="e.g. 8"
                        className="w-full px-2.5 py-1.5 text-sm font-mono border border-stone-300 rounded-md"
                      />
                    </td>
                    <td className="px-2.5 py-2 border-r border-stone-200 min-w-[120px]">
                      <input
                        id="rep-next-calls"
                        aria-label="Number of calls to make next week"
                        type="number"
                        min="0"
                        max="100000"
                        step="1"
                        required
                        value={repNextWeekCalls}
                        onChange={(e) => setRepNextWeekCalls(e.target.value)}
                        placeholder="e.g. 20"
                        className="w-full px-2.5 py-1.5 text-sm font-mono border border-stone-300 rounded-md"
                      />
                    </td>
                    <td className="px-2.5 py-2 min-w-[120px]">
                      <input
                        id="rep-next-appointments"
                        aria-label="Number of new appointments to make next week"
                        type="number"
                        min="0"
                        max="100000"
                        step="1"
                        required
                        value={repNextWeekAppointments}
                        onChange={(e) => setRepNextWeekAppointments(e.target.value)}
                        placeholder="e.g. 5"
                        className="w-full px-2.5 py-1.5 text-sm font-mono border border-stone-300 rounded-md"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label htmlFor="rep-work-progress" className="block text-xs font-medium text-slate-700 mb-1">
              Work Progress *
            </label>
            <textarea
              id="rep-work-progress"
              rows={3}
              required
              minLength={3}
              maxLength={3000}
              value={repWorkProgress}
              onChange={(e) => setRepWorkProgress(e.target.value)}
              placeholder="Any challenges, any praises, anything I should help with"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="rep-personal-devotion" className="block text-xs font-medium text-slate-700 mb-1">
              Personal Devotion *
            </label>
            <textarea
              id="rep-personal-devotion"
              rows={3}
              required
              minLength={3}
              maxLength={3000}
              value={repPersonalDevotion}
              onChange={(e) => setRepPersonalDevotion(e.target.value)}
              placeholder="Any highlight from what you are reading"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="rep-mentorship" className="block text-xs font-medium text-slate-700 mb-1">
              Mentorship *
            </label>
            <textarea
              id="rep-mentorship"
              rows={3}
              required
              minLength={3}
              maxLength={3000}
              value={repMentorship}
              onChange={(e) => setRepMentorship(e.target.value)}
              placeholder="How is your mentorship going?"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="max-w-xs">
            <label htmlFor="rep-status" className="block text-xs font-medium text-slate-700 mb-1">
              Submission Mode
            </label>
            <select
              id="rep-status"
              value={repStatus}
              onChange={(e) => setRepStatus(e.target.value as 'draft' | 'submitted')}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            >
              <option value="submitted">Submit for Supervisor Review</option>
              <option value="draft">Save as Draft</option>
            </select>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={(e) => void handleSaveReport(e, true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
            >
              <WifiOff className="w-3.5 h-3.5" />
              Save to Offline Queue
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setReportModalOpen(false);
                  setRepFormError(null);
                }}
                className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
              >
                {saving ? 'Saving...' : repStatus === 'draft' ? 'Save Draft' : 'Submit Report'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Register Apprentice Modal */}
      <Modal
        open={appModalOpen}
        onClose={() => {
          setAppModalOpen(false);
          setAppFormErrors({});
          setAppFormErrorSummary(null);
        }}
        title="Register Apprentice Profile"
        subtitle="Fields marked with * are mandatory"
      >
        <form onSubmit={(e) => void handleCreateApprentice(e)} noValidate className="space-y-4">
          {appFormErrorSummary && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700" role="alert">
              {appFormErrorSummary}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Apprentice ID <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={32}
                value={appCode}
                onChange={(e) => {
                  setAppCode(e.target.value);
                  clearAppFieldError('appCode');
                }}
                aria-invalid={Boolean(appFormErrors.appCode)}
                placeholder="APP-2609"
                className={`w-full px-3 py-2 text-sm font-mono border rounded-lg ${
                  appFormErrors.appCode ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                }`}
              />
              {appFormErrors.appCode && <p className="text-xs text-red-600 mt-1">{appFormErrors.appCode}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Full Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={160}
                value={appName}
                onChange={(e) => {
                  setAppName(e.target.value);
                  clearAppFieldError('appName');
                }}
                aria-invalid={Boolean(appFormErrors.appName)}
                placeholder="e.g. Grace Wanjiku Kamau"
                className={`w-full px-3 py-2 text-sm border rounded-lg ${
                  appFormErrors.appName ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                }`}
              />
              {appFormErrors.appName && <p className="text-xs text-red-600 mt-1">{appFormErrors.appName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                maxLength={200}
                value={appEmail}
                onChange={(e) => {
                  setAppEmail(e.target.value);
                  clearAppFieldError('appEmail');
                }}
                aria-invalid={Boolean(appFormErrors.appEmail)}
                placeholder="apprentice@iserveafrica.org"
                className={`w-full px-3 py-2 text-sm border rounded-lg ${
                  appFormErrors.appEmail ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                }`}
              />
              {appFormErrors.appEmail && <p className="text-xs text-red-600 mt-1">{appFormErrors.appEmail}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                maxLength={40}
                value={appPhone}
                onChange={(e) => {
                  setAppPhone(e.target.value);
                  clearAppFieldError('appPhone');
                }}
                aria-invalid={Boolean(appFormErrors.appPhone)}
                placeholder="+254 712 345 678"
                className={`w-full px-3 py-2 text-sm border rounded-lg ${
                  appFormErrors.appPhone ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                }`}
              />
              {appFormErrors.appPhone && <p className="text-xs text-red-600 mt-1">{appFormErrors.appPhone}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cohort</label>
              <select
                value={appCohortId}
                onChange={(e) => setAppCohortId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="">Default Cohort</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Region <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                list="iserve-kenya-regions"
                required
                maxLength={120}
                value={appRegion}
                onChange={(e) => {
                  setAppRegion(e.target.value);
                  clearAppFieldError('appRegion');
                }}
                aria-invalid={Boolean(appFormErrors.appRegion)}
                placeholder="e.g. Rift Valley, Nairobi, Nyanza"
                className={`w-full px-3 py-2 text-sm border rounded-lg ${
                  appFormErrors.appRegion ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                }`}
              />
              {appFormErrors.appRegion && <p className="text-xs text-red-600 mt-1">{appFormErrors.appRegion}</p>}
              <datalist id="iserve-kenya-regions">
                <option value="Nairobi" />
                <option value="Central" />
                <option value="Rift Valley" />
                <option value="Western" />
                <option value="Nyanza" />
                <option value="Coast" />
                <option value="Eastern" />
                <option value="North Eastern" />
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                RMS / Supervisor Account (Directory)
              </label>
              <select
                value={appSupervisorId}
                onChange={(e) => {
                  const uid = e.target.value;
                  setAppSupervisorId(uid);
                  const found = directory.find((d) => d.uid === uid);
                  if (found) {
                    setAppSupervisorName(found.displayName);
                    clearAppFieldError('appSupervisor');
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="">Select staff account or enter name →</option>
                {directory
                  .filter((d) => d.status === 'active')
                  .map((d) => (
                    <option key={d.uid} value={d.uid}>
                      {d.displayName} ({d.role.replace(/_/g, ' ')})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                RMS in Charge / Supervisor Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={160}
                value={appSupervisorName}
                onChange={(e) => {
                  setAppSupervisorName(e.target.value);
                  clearAppFieldError('appSupervisor');
                }}
                aria-invalid={Boolean(appFormErrors.appSupervisor)}
                placeholder="e.g. David Ochieng"
                className={`w-full px-3 py-2 text-sm border rounded-lg ${
                  appFormErrors.appSupervisor ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                }`}
              />
              {appFormErrors.appSupervisor && (
                <p className="text-xs text-red-600 mt-1">{appFormErrors.appSupervisor}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Training Placement Location <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={160}
              value={appLocation}
              onChange={(e) => {
                setAppLocation(e.target.value);
                clearAppFieldError('appLocation');
              }}
              aria-invalid={Boolean(appFormErrors.appLocation)}
              placeholder="e.g. Trinity Fellowship, Eldoret"
              className={`w-full px-3 py-2 text-sm border rounded-lg ${
                appFormErrors.appLocation ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
              }`}
            />
            {appFormErrors.appLocation && <p className="text-xs text-red-600 mt-1">{appFormErrors.appLocation}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Learning Objectives</label>
            <textarea
              rows={2}
              maxLength={1500}
              value={appObjectives}
              onChange={(e) => {
                setAppObjectives(e.target.value);
                clearAppFieldError('appObjectives');
              }}
              aria-invalid={Boolean(appFormErrors.appObjectives)}
              className={`w-full px-3 py-2 text-sm border rounded-lg ${
                appFormErrors.appObjectives ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
              }`}
            />
            {appFormErrors.appObjectives && <p className="text-xs text-red-600 mt-1">{appFormErrors.appObjectives}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => {
                setAppModalOpen(false);
                setAppFormErrors({});
                setAppFormErrorSummary(null);
              }}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg whitespace-nowrap disabled:opacity-60"
            >
              {saving ? 'Registering...' : 'Register Apprentice'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Supervisor Review Modal */}
      <Modal
        open={Boolean(reviewReport)}
        onClose={() => setReviewReport(null)}
        title={reviewReport ? `Evaluate ${reviewReport.apprenticeName}` : 'Evaluate Report'}
        subtitle={reviewReport ? `${reviewReport.reportType} report · ${reviewReport.periodStart}` : ''}
        maxWidthClass="max-w-xl"
      >
        {reviewReport && (
          <div className="space-y-4">
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3.5 text-xs space-y-2.5">
              {typeof reviewReport.monthlyTargetKes === 'number' ? (
                <>
                  <div className="grid grid-cols-3 gap-2 pb-2 border-b border-stone-200 font-mono">
                    <div>
                      <span className="text-slate-500 block">Target</span>
                      <strong className="text-slate-900">{formatKes(reviewReport.monthlyTargetKes)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Raised</span>
                      <strong className="text-slate-900">{formatKes(reviewReport.amountRaisedKes ?? 0)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Deficit</span>
                      <strong className={(reviewReport.deficitKes ?? 0) > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                        {formatKes(reviewReport.deficitKes ?? 0)}
                      </strong>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pb-2 border-b border-stone-200 font-mono">
                    <div>
                      <span className="text-slate-500 block">Calls Made</span>
                      <strong className="text-slate-900">{reviewReport.callsMadeThisWeek ?? 0}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">New Partners</span>
                      <strong className="text-slate-900">{reviewReport.newPartnersApproached ?? 0}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Active Partners</span>
                      <strong className="text-slate-900">{reviewReport.totalActivePartners ?? 0}</strong>
                    </div>
                  </div>
                  <div>
                    <strong className="text-slate-800">Three Things That Worked This Week:</strong>
                    <p className="text-slate-700 mt-0.5 whitespace-pre-line">{reviewReport.thingsWorked || '—'}</p>
                  </div>
                  <div>
                    <strong className="text-slate-800">Three Things That Did Not Work This Week:</strong>
                    <p className="text-slate-700 mt-0.5 whitespace-pre-line">{reviewReport.thingsDidNotWork || '—'}</p>
                  </div>
                  {typeof reviewReport.nextWeekTargetAmountKes === 'number' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-stone-200 font-mono">
                      <div>
                        <span className="text-slate-500 block">Next Week Target</span>
                        <strong className="text-slate-900">{formatKes(reviewReport.nextWeekTargetAmountKes)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Partners to Reach</span>
                        <strong className="text-slate-900">{reviewReport.nextWeekPartnersToReachOut ?? 0}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Calls Next Week</span>
                        <strong className="text-slate-900">{reviewReport.nextWeekCallsToMake ?? 0}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">New Appointments</span>
                        <strong className="text-slate-900">{reviewReport.nextWeekNewAppointments ?? 0}</strong>
                      </div>
                    </div>
                  )}
                  {reviewReport.workProgress && (
                    <div>
                      <strong className="text-slate-800">Work Progress:</strong>
                      <p className="text-slate-700 mt-0.5 whitespace-pre-line">{reviewReport.workProgress}</p>
                    </div>
                  )}
                  {reviewReport.personalDevotion && (
                    <div>
                      <strong className="text-slate-800">Personal Devotion:</strong>
                      <p className="text-slate-700 mt-0.5 whitespace-pre-line">{reviewReport.personalDevotion}</p>
                    </div>
                  )}
                  {reviewReport.mentorshipUpdate && (
                    <div>
                      <strong className="text-slate-800">Mentorship:</strong>
                      <p className="text-slate-700 mt-0.5 whitespace-pre-line">{reviewReport.mentorshipUpdate}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <strong className="text-slate-800">Activities:</strong> {reviewReport.activities}
                  </div>
                  {reviewReport.lessonsLearned && (
                    <div>
                      <strong className="text-slate-800">Lessons Learned:</strong> {reviewReport.lessonsLearned}
                    </div>
                  )}
                  {reviewReport.challenges && (
                    <div>
                      <strong className="text-slate-800">Challenges:</strong> {reviewReport.challenges}
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Evaluation Score (1–5)</label>
              <select
                value={supScore}
                onChange={(e) => setSupScore(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="5">5 — Exemplary</option>
                <option value="4">4 — Strong</option>
                <option value="3">3 — Satisfactory</option>
                <option value="2">2 — Needs Guidance</option>
                <option value="1">1 — Support Required</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Supervisor Feedback</label>
              <textarea
                rows={3}
                value={supComment}
                onChange={(e) => setSupComment(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSupervisorDecision('returned')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Return for Revision
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSupervisorDecision('approved')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
              >
                <Check className="w-3.5 h-3.5" />
                Approve Report
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Cohort Modal */}
      <Modal
        open={Boolean(editingCohort)}
        onClose={() => setEditingCohort(null)}
        title="Edit Cohort"
        subtitle={editingCohort ? `Updating details for ${editingCohort.name}` : ''}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={(e) => void handleUpdateCohort(e)} className="space-y-4">
          {editCohortError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {editCohortError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Cohort Name</label>
            <input
              required
              minLength={2}
              maxLength={120}
              value={editCohortName}
              onChange={(e) => setEditCohortName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Programme</label>
            <input
              required
              minLength={2}
              maxLength={160}
              value={editCohortProgramme}
              onChange={(e) => setEditCohortProgramme(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Coordinator / RMS</label>
            <input
              maxLength={160}
              value={editCohortCoordinator}
              onChange={(e) => setEditCohortCoordinator(e.target.value)}
              list="cohort-coordinator-options"
              placeholder={profile?.displayName || 'Assigned coordinator'}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={editCohortStartDate}
                onChange={(e) => setEditCohortStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                required
                value={editCohortEndDate}
                onChange={(e) => setEditCohortEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={editCohortStatus}
                onChange={(e) => setEditCohortStatus(e.target.value as 'upcoming' | 'active' | 'completed')}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="upcoming">Upcoming</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setEditingCohort(null)}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg whitespace-nowrap disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk CSV Upload Modal */}
      <Modal
        open={bulkModalOpen}
        onClose={() => {
          if (!importingBulk) setBulkModalOpen(false);
        }}
        title="Bulk Upload Apprentices (CSV)"
        subtitle="Import multiple apprentice profiles with validation for Name, Supervisor, Region, and Cohort"
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-slate-700 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-semibold text-slate-900">Required CSV Columns</div>
              <div className="text-slate-600">
                <span className="font-mono font-medium">Full Name</span>,{' '}
                <span className="font-mono font-medium">Supervisor</span>,{' '}
                <span className="font-mono font-medium">Region</span>, and{' '}
                <span className="font-mono font-medium">Cohort</span>. Optional columns: Apprentice ID (auto-generated if blank), Email, Phone, Training Placement Location, Start Date, Expected Completion Date, Attendance Rate (%), Status, Learning Objectives.
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadBulkTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-100 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV Template
            </button>
          </div>

          <div>
            <label htmlFor="bulk-csv-input" className="block text-xs font-medium text-slate-700 mb-1.5">
              Select CSV File
            </label>
            <input
              id="bulk-csv-input"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void handleBulkCsvFileChange(e)}
              disabled={importingBulk}
              className="block w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border file:border-stone-300 file:text-xs file:font-medium file:bg-white file:text-slate-800 hover:file:bg-stone-50 border border-stone-300 rounded-lg p-1.5 bg-white"
            />
            {bulkFileName && (
              <div className="text-xs text-slate-500 mt-1">
                Loaded file: <span className="font-mono text-slate-800">{bulkFileName}</span>
              </div>
            )}
          </div>

          {bulkParseError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{bulkParseError}</span>
            </div>
          )}

          {bulkRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-800">
                    {bulkValidationSummary.total} row{bulkValidationSummary.total === 1 ? '' : 's'} parsed
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-800 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {bulkValidationSummary.valid} valid
                  </span>
                  {bulkValidationSummary.invalid > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {bulkValidationSummary.invalid} with validation errors
                    </span>
                  )}
                </div>
                {bulkValidationSummary.invalid > 0 && (
                  <span className="text-red-700 font-medium">
                    Fix errors in the CSV file and re-upload before importing.
                  </span>
                )}
              </div>

              <div className="border border-stone-200 rounded-lg overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200 sticky top-0 text-slate-600 font-semibold">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">ID</th>
                      <th className="px-3 py-2">Full Name</th>
                      <th className="px-3 py-2">Supervisor</th>
                      <th className="px-3 py-2">Region</th>
                      <th className="px-3 py-2">Cohort</th>
                      <th className="px-3 py-2">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {bulkRows.map((row) => (
                      <tr key={`${row.rowNumber}_${row.apprenticeCode}`} className={row.errors.length > 0 ? 'bg-red-50/50' : ''}>
                        <td className="px-3 py-2 font-mono text-slate-500">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-mono text-slate-800 whitespace-nowrap">{row.apprenticeCode || '—'}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{row.fullName || '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{row.supervisorName || '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{row.region || '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{row.cohortName || '—'}</td>
                        <td className="px-3 py-2">
                          {row.errors.length === 0 ? (
                            <span className="text-emerald-800 font-medium">Valid</span>
                          ) : (
                            <span className="text-red-700">{row.errors.join(' ')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              disabled={importingBulk}
              onClick={() => setBulkModalOpen(false)}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={importingBulk || bulkRows.length === 0 || bulkValidationSummary.invalid > 0}
              onClick={() => void handleCommitBulkImport()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg whitespace-nowrap disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {importingBulk
                ? 'Importing...'
                : `Import ${bulkValidationSummary.valid} Apprentice${bulkValidationSummary.valid === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
