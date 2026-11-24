import React, { useMemo, useState } from 'react';
import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Plus, Download, Trash2 } from 'lucide-react';
import { ORG_ID, db } from '../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import { recordAuditLog } from '../lib/audit.ts';
import { exportToExcel, exportToPdf } from '../lib/exports.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { StatusText } from '../components/ui/StatusText.tsx';
import { ProjectGanttChart } from '../components/projects/ProjectGanttChart.tsx';
import { Project, ProjectMilestone, formatKes } from '../types/erp.ts';

type ProjectViewMode = 'overview' | 'gantt' | 'cards';

export function ProjectsPage() {
  const { profile, effectiveRole } = useAuth();
  const { projects, projectMilestones, departments } = useData();

  const [viewMode, setViewMode] = useState<ProjectViewMode>('overview');
  const [donorOnly, setDonorOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [donorFunded, setDonorFunded] = useState(true);
  const [donorName, setDonorName] = useState('');
  const [deptId, setDeptId] = useState('');
  const [objectives, setObjectives] = useState('');
  const [budgetKes, setBudgetKes] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Milestone / Deliverable modal state
  const [msModalOpen, setMsModalOpen] = useState(false);
  const [editingMs, setEditingMs] = useState<ProjectMilestone | null>(null);
  const [msProjectId, setMsProjectId] = useState('');
  const [msTitle, setMsTitle] = useState('');
  const [msKind, setMsKind] = useState<'milestone' | 'deliverable'>('deliverable');
  const [msOwner, setMsOwner] = useState('');
  const [msStartDate, setMsStartDate] = useState('');
  const [msEndDate, setMsEndDate] = useState('');
  const [msProgress, setMsProgress] = useState(0);
  const [msStatus, setMsStatus] = useState<ProjectMilestone['status']>('planned');
  const [msNotes, setMsNotes] = useState('');
  const [msError, setMsError] = useState<string | null>(null);
  const [confirmDeleteMs, setConfirmDeleteMs] = useState(false);

  const canEdit = [
    'super_admin',
    'executive_director',
    'senior_management',
    'project_officer',
    'department_head',
  ].includes(effectiveRole);

  const visibleProjects = useMemo(
    () => (donorOnly ? projects.filter((p) => p.donorFunded) : projects),
    [donorOnly, projects]
  );

  const visibleProjectIds = useMemo(() => new Set(visibleProjects.map((p) => p.id)), [visibleProjects]);

  const visibleMilestones = useMemo(
    () => projectMilestones.filter((m) => visibleProjectIds.has(m.projectId)),
    [projectMilestones, visibleProjectIds]
  );

  const openCreateMilestoneModal = (defaultProjectId?: string) => {
    const targetProject =
      projects.find((p) => p.id === defaultProjectId) || visibleProjects[0] || projects[0];
    const today = new Date().toISOString().slice(0, 10);
    setEditingMs(null);
    setMsProjectId(targetProject?.id || '');
    setMsTitle('');
    setMsKind('deliverable');
    setMsOwner(targetProject?.officerName || profile?.displayName || '');
    setMsStartDate(targetProject?.startDate || today);
    setMsEndDate(targetProject?.endDate || targetProject?.startDate || today);
    setMsProgress(0);
    setMsStatus('planned');
    setMsNotes('');
    setMsError(null);
    setConfirmDeleteMs(false);
    setMsModalOpen(true);
  };

  const openInspectOrEditMilestone = (ms: ProjectMilestone) => {
    setEditingMs(ms);
    setMsProjectId(ms.projectId);
    setMsTitle(ms.title);
    setMsKind(ms.kind);
    setMsOwner(ms.ownerName || '');
    setMsStartDate(ms.startDate);
    setMsEndDate(ms.endDate);
    setMsProgress(ms.progressPct);
    setMsStatus(ms.status);
    setMsNotes(ms.notes || '');
    setMsError(null);
    setConfirmDeleteMs(false);
    setMsModalOpen(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const dept = departments.find((d) => d.id === deptId);
    const ref = doc(collection(db, 'projects'));
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        code: code.trim(),
        title: title.trim(),
        description: desc.trim(),
        donorFunded,
        donorName: donorFunded ? donorName.trim() : '',
        departmentId: dept?.id || 'general',
        departmentName: dept?.name || 'General',
        officerId: profile.uid,
        officerName: profile.displayName,
        objectives: objectives.trim(),
        budgetKes: Number(budgetKes) || 0,
        spentKes: 0,
        progressPct: 0,
        startDate,
        endDate,
        status: 'active',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'CREATE_PROJECT',
        targetCollection: 'projects',
        targetId: ref.id,
        summary: `Registered project ${code.trim()} — ${title.trim()}`,
      });
      setModalOpen(false);
      setCode('');
      setTitle('');
      setDesc('');
      setDonorName('');
      setObjectives('');
      setBudgetKes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `projects/${ref.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !profile) return;
    if (editing.startDate && editing.endDate && editing.endDate < editing.startDate) {
      setNotice('Project end date cannot be earlier than start date.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'projects', editing.id), {
        progressPct: editing.progressPct,
        spentKes: editing.spentKes,
        startDate: editing.startDate || '',
        endDate: editing.endDate || '',
        status: editing.status,
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'UPDATE_PROJECT_PROGRESS',
        targetCollection: 'projects',
        targetId: editing.id,
        summary: `Updated ${editing.code} progress to ${editing.progressPct}%`,
      });
      setEditing(null);
      setNotice(`Project ${editing.code} updated.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${editing.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canEdit) return;
    setMsError(null);

    const project = projects.find((p) => p.id === msProjectId);
    if (!project) {
      setMsError('Please select a project.');
      return;
    }
    const trimmedTitle = msTitle.trim();
    if (trimmedTitle.length < 2 || trimmedTitle.length > 200) {
      setMsError('Title must be between 2 and 200 characters.');
      return;
    }
    const effectiveStart = msKind === 'milestone' ? msEndDate || msStartDate : msStartDate;
    const effectiveEnd = msEndDate || effectiveStart;
    if (!effectiveStart || !effectiveEnd) {
      setMsError('Start date and target/end date are required.');
      return;
    }
    if (effectiveEnd < effectiveStart) {
      setMsError('End date cannot be earlier than start date.');
      return;
    }

    const boundedProgress = Math.min(100, Math.max(0, Number(msProgress) || 0));
    const finalProgress = msStatus === 'completed' ? 100 : boundedProgress;

    setSaving(true);
    try {
      if (editingMs) {
        await updateDoc(doc(db, 'projectMilestones', editingMs.id), {
          projectId: project.id,
          projectCode: project.code,
          projectTitle: project.title,
          title: trimmedTitle,
          kind: msKind,
          ownerName: msOwner.trim(),
          startDate: effectiveStart,
          endDate: effectiveEnd,
          progressPct: finalProgress,
          status: msStatus,
          notes: msNotes.trim(),
          updatedAt: serverTimestamp(),
        });
        await recordAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: 'UPDATE_PROJECT_MILESTONE',
          targetCollection: 'projectMilestones',
          targetId: editingMs.id,
          summary: `Updated ${msKind} "${trimmedTitle}" for ${project.code} (${finalProgress}%, ${msStatus})`,
        });
        setNotice(`Updated ${msKind} "${trimmedTitle}".`);
      } else {
        const ref = doc(collection(db, 'projectMilestones'));
        await setDoc(ref, {
          orgId: ORG_ID,
          projectId: project.id,
          projectCode: project.code,
          projectTitle: project.title,
          title: trimmedTitle,
          kind: msKind,
          ownerName: msOwner.trim(),
          startDate: effectiveStart,
          endDate: effectiveEnd,
          progressPct: finalProgress,
          status: msStatus,
          notes: msNotes.trim(),
          createdBy: profile.uid,
          isDemo: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: 'CREATE_PROJECT_MILESTONE',
          targetCollection: 'projectMilestones',
          targetId: ref.id,
          summary: `Added ${msKind} "${trimmedTitle}" to ${project.code} (${effectiveStart} → ${effectiveEnd})`,
        });
        setNotice(`Added ${msKind} "${trimmedTitle}" to ${project.code}.`);
      }
      setMsModalOpen(false);
      setEditingMs(null);
    } catch (err) {
      try {
        handleFirestoreError(
          err,
          editingMs ? OperationType.UPDATE : OperationType.CREATE,
          editingMs ? `projectMilestones/${editingMs.id}` : 'projectMilestones'
        );
      } catch (formatted) {
        setMsError(formatted instanceof Error ? formatted.message : 'Unable to save timeline item.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMilestone = async () => {
    if (!profile || !canEdit || !editingMs) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'projectMilestones', editingMs.id));
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'DELETE_PROJECT_MILESTONE',
        targetCollection: 'projectMilestones',
        targetId: editingMs.id,
        summary: `Removed ${editingMs.kind} "${editingMs.title}" from ${editingMs.projectCode || editingMs.projectId}`,
      });
      setMsModalOpen(false);
      setEditingMs(null);
      setNotice(`Removed "${editingMs.title}" from project timeline.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `projectMilestones/${editingMs.id}`);
      } catch (formatted) {
        setMsError(formatted instanceof Error ? formatted.message : 'Unable to delete timeline item.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleExport = (format: 'pdf' | 'xlsx') => {
    const cols = [
      { header: 'Code', key: 'code' },
      { header: 'Project Title', key: 'title' },
      { header: 'Donor', key: 'donor' },
      { header: 'Budget (KES)', key: 'budget' },
      { header: 'Spent (KES)', key: 'spent' },
      { header: 'Progress %', key: 'progress' },
      { header: 'Status', key: 'status' },
    ];
    const rows = visibleProjects.map((p) => ({
      code: p.code,
      title: p.title,
      donor: p.donorFunded ? p.donorName || 'Donor Funded' : 'Internal',
      budget: p.budgetKes,
      spent: p.spentKes,
      progress: p.progressPct,
      status: p.status,
    }));
    if (format === 'pdf') {
      exportToPdf({ fileName: 'iServe_Projects_Report', title: 'Projects & Donor Programmes Report', columns: cols, rows });
    } else {
      exportToExcel({ fileName: 'iServe_Projects_Report', sheetName: 'Projects', title: 'Projects Report', columns: cols, rows });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Projects & Programmes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Project delivery, donor-funded budgets, milestones, and expenditure comparison
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDonorOnly((d) => !d)}
            className={`px-3 py-2 text-xs font-medium rounded-lg border ${
              donorOnly
                ? 'bg-emerald-50 border-emerald-700 text-emerald-900'
                : 'bg-white border-stone-300 text-slate-700'
            }`}
          >
            {donorOnly ? 'Showing Donor-Funded Only' : 'Filter: Donor-Funded'}
          </button>
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Register Project
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-amber-800 font-medium hover:underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* View Switcher */}
      <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg w-fit">
        {(
          [
            { key: 'overview', label: 'Gantt & Portfolio' },
            { key: 'gantt', label: 'Gantt Timeline' },
            { key: 'cards', label: 'Project Cards' },
          ] as { key: ProjectViewMode; label: string }[]
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setViewMode(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              viewMode === tab.key
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(viewMode === 'overview' || viewMode === 'gantt') && (
        <ProjectGanttChart
          projects={visibleProjects}
          milestones={visibleMilestones}
          canEdit={canEdit}
          onAddMilestone={openCreateMilestoneModal}
          onSelectMilestone={openInspectOrEditMilestone}
          onEditProjectDates={(project) => setEditing({ ...project })}
        />
      )}

      {(viewMode === 'overview' || viewMode === 'cards') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {visibleProjects.length === 0 ? (
            <div className="col-span-full bg-white border border-stone-200 rounded-xl p-10 text-center text-xs text-slate-500">
              No projects match the current filter.
            </div>
          ) : (
            visibleProjects.map((p) => {
              const util = p.budgetKes > 0 ? Math.round((p.spentKes / p.budgetKes) * 100) : 0;
              const pMilestones = visibleMilestones.filter((m) => m.projectId === p.id);
              const completedMs = pMilestones.filter((m) => m.status === 'completed').length;
              return (
                <div key={p.id} className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono text-slate-500">
                        {p.code} · {p.departmentName || 'General'}
                        {p.donorFunded ? ` · Donor: ${p.donorName || 'Restricted'}` : ''}
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 font-display mt-0.5">{p.title}</h3>
                    </div>
                    <StatusText status={p.status} />
                  </div>

                  {p.description && <p className="text-xs text-slate-600 leading-relaxed">{p.description}</p>}

                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-stone-100 text-xs">
                    <div>
                      <div className="text-slate-500">Approved Budget</div>
                      <div className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                        {formatKes(p.budgetKes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Spent ({util}%)</div>
                      <div className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                        {formatKes(p.spentKes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Completion</div>
                      <div className="font-mono font-semibold text-emerald-800 mt-0.5 tabular-nums">
                        {p.progressPct}% · {completedMs}/{pMilestones.length} items
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand-primary)] transition-all"
                      style={{ width: `${Math.min(100, p.progressPct)}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
                    <span>
                      Officer: {p.officerName || 'Assigned'} · {p.startDate || '—'} to {p.endDate || '—'}
                    </span>
                    {canEdit && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openCreateMilestoneModal(p.id)}
                          className="font-medium text-slate-700 hover:text-[#0d4f3c] hover:underline"
                        >
                          + Milestone
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing({ ...p })}
                          className="font-medium text-emerald-800 hover:underline"
                        >
                          Update Progress
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Register Project Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Register Project / Programme">
        <form onSubmit={handleSaveProject} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Project Code</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="PRJ-2026-04"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Project Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
              <select
                required
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Approved Budget (KES)</label>
              <input
                type="number"
                min="0"
                required
                value={budgetKes}
                onChange={(e) => setBudgetKes(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={donorFunded}
                onChange={(e) => setDonorFunded(e.target.checked)}
                className="rounded border-stone-300"
              />
              Donor-Funded / Restricted Grant
            </label>
            {donorFunded && (
              <input
                type="text"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                placeholder="Donor / Partner Name"
                className="flex-1 px-3 py-1.5 text-sm border border-stone-300 rounded-lg"
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Objectives & Deliverables</label>
            <textarea
              rows={2}
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
            >
              Save Project
            </button>
          </div>
        </form>
      </Modal>

      {/* Update Progress Modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Update ${editing.code}` : 'Update Project'}
        maxWidthClass="max-w-md"
      >
        {editing && (
          <form onSubmit={handleUpdateProgress} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Completion Progress ({editing.progressPct}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={editing.progressPct}
                onChange={(e) => setEditing({ ...editing, progressPct: Number(e.target.value) })}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Actual Spent (KES)</label>
              <input
                type="number"
                min={0}
                value={editing.spentKes}
                onChange={(e) => setEditing({ ...editing, spentKes: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={editing.startDate || ''}
                  onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={editing.endDate || ''}
                  onChange={(e) => setEditing({ ...editing, endDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as Project['status'] })}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Add / Edit / View Milestone or Deliverable Modal */}
      <Modal
        open={msModalOpen}
        onClose={() => {
          setMsModalOpen(false);
          setEditingMs(null);
          setMsError(null);
          setConfirmDeleteMs(false);
        }}
        title={
          editingMs
            ? canEdit
              ? `Edit ${editingMs.kind === 'milestone' ? 'Milestone' : 'Deliverable'}`
              : `${editingMs.kind === 'milestone' ? 'Milestone' : 'Deliverable'} Details`
            : 'Add Project Milestone / Deliverable'
        }
        subtitle="Timeline entries render dynamically on the project Gantt chart"
        maxWidthClass="max-w-lg"
      >
        {!canEdit && editingMs ? (
          <div className="space-y-3 text-xs">
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-slate-500">{editingMs.projectCode || editingMs.projectId}</span>
                <StatusText status={editingMs.status} />
              </div>
              <div className="text-sm font-semibold text-slate-900">{editingMs.title}</div>
              <div className="font-mono text-slate-600 tabular-nums">
                {editingMs.kind === 'milestone'
                  ? `Target Date: ${editingMs.endDate}`
                  : `${editingMs.startDate} → ${editingMs.endDate}`}
                {' · '}
                {editingMs.progressPct}% complete
              </div>
              {editingMs.ownerName && <div className="text-slate-600">Owner: {editingMs.ownerName}</div>}
              {editingMs.notes && <p className="text-slate-700 pt-1 whitespace-pre-line">{editingMs.notes}</p>}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setMsModalOpen(false)}
                className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSaveMilestone(e)} className="space-y-4">
            {msError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700" role="alert">
                {msError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ms-project" className="block text-xs font-medium text-slate-700 mb-1">
                  Project *
                </label>
                <select
                  id="ms-project"
                  required
                  value={msProjectId}
                  onChange={(e) => setMsProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                >
                  <option value="">Select Project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ms-kind" className="block text-xs font-medium text-slate-700 mb-1">
                  Timeline Type *
                </label>
                <select
                  id="ms-kind"
                  value={msKind}
                  onChange={(e) => setMsKind(e.target.value as 'milestone' | 'deliverable')}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                >
                  <option value="deliverable">Deliverable (Duration Bar)</option>
                  <option value="milestone">Milestone (Target Date)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="ms-title" className="block text-xs font-medium text-slate-700 mb-1">
                Title *
              </label>
              <input
                id="ms-title"
                type="text"
                required
                minLength={2}
                maxLength={200}
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                placeholder="e.g. Phase 2 Regional Book Dispatch"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ms-owner" className="block text-xs font-medium text-slate-700 mb-1">
                  Responsible Lead / Owner
                </label>
                <input
                  id="ms-owner"
                  type="text"
                  maxLength={160}
                  value={msOwner}
                  onChange={(e) => setMsOwner(e.target.value)}
                  placeholder="e.g. Faith Njeri"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ms-status" className="block text-xs font-medium text-slate-700 mb-1">
                  Status *
                </label>
                <select
                  id="ms-status"
                  value={msStatus}
                  onChange={(e) => {
                    const next = e.target.value as ProjectMilestone['status'];
                    setMsStatus(next);
                    if (next === 'completed') setMsProgress(100);
                  }}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                >
                  <option value="planned">Planned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="delayed">Delayed</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {msKind === 'deliverable' && (
                <div>
                  <label htmlFor="ms-start" className="block text-xs font-medium text-slate-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    id="ms-start"
                    type="date"
                    required
                    value={msStartDate}
                    onChange={(e) => setMsStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                  />
                </div>
              )}
              <div className={msKind === 'milestone' ? 'sm:col-span-2' : ''}>
                <label htmlFor="ms-end" className="block text-xs font-medium text-slate-700 mb-1">
                  {msKind === 'milestone' ? 'Target Milestone Date *' : 'Due / End Date *'}
                </label>
                <input
                  id="ms-end"
                  type="date"
                  required
                  value={msEndDate}
                  onChange={(e) => {
                    setMsEndDate(e.target.value);
                    if (msKind === 'milestone') setMsStartDate(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label htmlFor="ms-progress" className="block text-xs font-medium text-slate-700 mb-1">
                Completion Progress ({msProgress}%)
              </label>
              <input
                id="ms-progress"
                type="range"
                min={0}
                max={100}
                value={msProgress}
                onChange={(e) => setMsProgress(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="ms-notes" className="block text-xs font-medium text-slate-700 mb-1">
                Deliverable Notes
              </label>
              <textarea
                id="ms-notes"
                rows={2}
                maxLength={1000}
                value={msNotes}
                onChange={(e) => setMsNotes(e.target.value)}
                placeholder="Key outputs, dependencies, or verification notes..."
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100">
              {editingMs ? (
                confirmDeleteMs ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-700 font-medium">Confirm delete?</span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleDeleteMilestone()}
                      className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMs(false)}
                      className="px-2 py-1.5 text-xs border border-stone-300 rounded-lg"
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMs(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )
              ) : (
                <span />
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMsModalOpen(false)}
                  className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
                >
                  {saving ? 'Saving...' : editingMs ? 'Update Item' : 'Save Timeline Item'}
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
