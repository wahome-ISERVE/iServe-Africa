import React, { useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Diamond,
  FolderKanban,
  ListChecks,
  Plus,
} from 'lucide-react';
import { Project, ProjectMilestone } from '../../types/erp.ts';
import { StatusText } from '../ui/StatusText.tsx';

type ZoomScale = 'week' | 'month' | 'quarter';
type KindFilter = 'all' | 'milestone' | 'deliverable';
type StatusFilter = 'all' | ProjectMilestone['status'];

interface ProjectGanttChartProps {
  projects: Project[];
  milestones: ProjectMilestone[];
  canEdit: boolean;
  onAddMilestone: (projectId?: string) => void;
  onSelectMilestone: (milestone: ProjectMilestone) => void;
  onEditProjectDates?: (project: Project) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDateUtc(iso?: string): number | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return Date.UTC(y, m - 1, d);
}

function formatShortDate(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(ms));
}

function getNairobiTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getEffectiveMilestoneStatus(item: ProjectMilestone, todayIso: string): ProjectMilestone['status'] {
  if (item.status === 'completed') return 'completed';
  if (item.status === 'delayed') return 'delayed';
  if (item.endDate && item.endDate < todayIso) return 'delayed';
  return item.status;
}

interface TimeColumn {
  key: string;
  label: string;
  groupLabel: string;
  startMs: number;
  endMs: number;
}

function buildTimeColumns(windowStartMs: number, windowEndMs: number, zoom: ZoomScale): TimeColumn[] {
  const cols: TimeColumn[] = [];
  let cursor = windowStartMs;

  if (zoom === 'week') {
    while (cursor < windowEndMs) {
      const next = Math.min(windowEndMs, cursor + 7 * DAY_MS);
      const dt = new Date(cursor);
      const monthYear = new Intl.DateTimeFormat('en-GB', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(dt);
      const dayLabel = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        timeZone: 'UTC',
      }).format(dt);
      cols.push({
        key: `w_${cursor}`,
        label: dayLabel,
        groupLabel: monthYear,
        startMs: cursor,
        endMs: next,
      });
      cursor = next;
    }
    return cols;
  }

  if (zoom === 'quarter') {
    const startDt = new Date(windowStartMs);
    let y = startDt.getUTCFullYear();
    let q = Math.floor(startDt.getUTCMonth() / 3);
    while (Date.UTC(y, q * 3, 1) < windowEndMs) {
      const qStart = Date.UTC(y, q * 3, 1);
      const nextQ = q + 1;
      const nextY = y + Math.floor(nextQ / 4);
      const nextQMod = nextQ % 4;
      const qEnd = Date.UTC(nextY, nextQMod * 3, 1);
      cols.push({
        key: `q_${y}_${q}`,
        label: `Q${q + 1}`,
        groupLabel: String(y),
        startMs: Math.max(windowStartMs, qStart),
        endMs: Math.min(windowEndMs, qEnd),
      });
      y = nextY;
      q = nextQMod;
    }
    return cols;
  }

  // Default: month
  const startDt = new Date(windowStartMs);
  let y = startDt.getUTCFullYear();
  let m = startDt.getUTCMonth();
  while (Date.UTC(y, m, 1) < windowEndMs) {
    const mStart = Date.UTC(y, m, 1);
    const nextM = (m + 1) % 12;
    const nextY = y + (m === 11 ? 1 : 0);
    const mEnd = Date.UTC(nextY, nextM, 1);
    const label = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(mStart));
    cols.push({
      key: `m_${y}_${m}`,
      label,
      groupLabel: String(y),
      startMs: Math.max(windowStartMs, mStart),
      endMs: Math.min(windowEndMs, mEnd),
    });
    y = nextY;
    m = nextM;
  }
  return cols;
}

const STATUS_BAR_STYLES: Record<
  ProjectMilestone['status'],
  { track: string; fill: string; diamond: string; label: string }
> = {
  completed: {
    track: 'bg-emerald-100 border-emerald-300',
    fill: 'bg-emerald-600',
    diamond: 'bg-emerald-600 border-emerald-800',
    label: 'Completed',
  },
  in_progress: {
    track: 'bg-teal-950/10 border-[#0d4f3c]/35',
    fill: 'bg-[#0d4f3c]',
    diamond: 'bg-[#0d4f3c] border-[#093b2d]',
    label: 'In Progress',
  },
  delayed: {
    track: 'bg-red-100 border-red-300',
    fill: 'bg-red-600',
    diamond: 'bg-red-600 border-red-800',
    label: 'Delayed',
  },
  planned: {
    track: 'bg-stone-200 border-stone-300',
    fill: 'bg-slate-500',
    diamond: 'bg-slate-500 border-slate-700',
    label: 'Planned',
  },
};

export function ProjectGanttChart({
  projects,
  milestones,
  canEdit,
  onAddMilestone,
  onSelectMilestone,
  onEditProjectDates,
}: ProjectGanttChartProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const todayIso = useMemo(() => getNairobiTodayIso(), []);
  const todayMs = useMemo(() => parseIsoDateUtc(todayIso) ?? Date.now(), [todayIso]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [zoom, setZoom] = useState<ZoomScale>('month');
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [hoveredItem, setHoveredItem] = useState<ProjectMilestone | null>(null);

  const filteredProjects = useMemo(() => {
    const base =
      selectedProjectId === 'all' ? projects : projects.filter((p) => p.id === selectedProjectId);
    return [...base].sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));
  }, [projects, selectedProjectId]);

  const milestonesByProject = useMemo(() => {
    const map = new Map<string, ProjectMilestone[]>();
    for (const ms of milestones) {
      if (selectedProjectId !== 'all' && ms.projectId !== selectedProjectId) continue;
      if (kindFilter !== 'all' && ms.kind !== kindFilter) continue;
      const effStatus = getEffectiveMilestoneStatus(ms, todayIso);
      if (statusFilter !== 'all' && effStatus !== statusFilter) continue;

      const list = map.get(ms.projectId) || [];
      list.push(ms);
      map.set(ms.projectId, list);
    }
    for (const [pid, list] of map.entries()) {
      list.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
      map.set(pid, list);
    }
    return map;
  }, [milestones, selectedProjectId, kindFilter, statusFilter, todayIso]);

  const visibleScopedMilestones = useMemo(() => {
    const visibleIds = new Set(filteredProjects.map((p) => p.id));
    return milestones.filter((m) => visibleIds.has(m.projectId));
  }, [filteredProjects, milestones]);

  const metrics = useMemo(() => {
    let milestoneCount = 0;
    let deliverableCount = 0;
    let completedCount = 0;
    let delayedCount = 0;
    for (const m of visibleScopedMilestones) {
      if (m.kind === 'milestone') milestoneCount += 1;
      else deliverableCount += 1;
      const eff = getEffectiveMilestoneStatus(m, todayIso);
      if (eff === 'completed') completedCount += 1;
      if (eff === 'delayed') delayedCount += 1;
    }
    return {
      totalItems: visibleScopedMilestones.length,
      milestoneCount,
      deliverableCount,
      completedCount,
      delayedCount,
    };
  }, [visibleScopedMilestones, todayIso]);

  const { windowStartMs, windowEndMs, windowSpanMs, columns, timelineWidthPx } = useMemo(() => {
    const timestamps: number[] = [];

    for (const p of filteredProjects) {
      const s = parseIsoDateUtc(p.startDate);
      const e = parseIsoDateUtc(p.endDate);
      if (s !== null) timestamps.push(s);
      if (e !== null) timestamps.push(e);
      const children = milestonesByProject.get(p.id) || [];
      for (const c of children) {
        const cs = parseIsoDateUtc(c.startDate);
        const ce = parseIsoDateUtc(c.endDate);
        if (cs !== null) timestamps.push(cs);
        if (ce !== null) timestamps.push(ce);
      }
    }

    // Fallback when no dated items exist yet
    if (timestamps.length === 0) {
      const nowDt = new Date(todayMs);
      const y = nowDt.getUTCFullYear();
      timestamps.push(Date.UTC(y, 0, 1), Date.UTC(y, 11, 31));
    }

    const minRaw = Math.min(...timestamps, todayMs);
    const maxRaw = Math.max(...timestamps, todayMs);

    let startMs: number;
    let endMs: number;

    if (zoom === 'week') {
      const d = new Date(minRaw - 7 * DAY_MS);
      const dayOfWeek = (d.getUTCDay() + 6) % 7; // Monday = 0
      startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayOfWeek);
      const e = new Date(maxRaw + 14 * DAY_MS);
      endMs = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate() + 1);
    } else if (zoom === 'quarter') {
      const d = new Date(minRaw);
      const startQ = Math.floor(d.getUTCMonth() / 3) * 3;
      startMs = Date.UTC(d.getUTCFullYear(), startQ, 1);
      const e = new Date(maxRaw + 14 * DAY_MS);
      const endQ = Math.floor(e.getUTCMonth() / 3) * 3 + 3;
      endMs = Date.UTC(e.getUTCFullYear(), endQ, 1);
    } else {
      const d = new Date(minRaw);
      startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      const e = new Date(maxRaw + 14 * DAY_MS);
      endMs = Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 1);
    }

    const spanMs = Math.max(DAY_MS * 14, endMs - startMs);
    const cols = buildTimeColumns(startMs, startMs + spanMs, zoom);
    const pxPerDay = zoom === 'week' ? 11 : zoom === 'quarter' ? 2.1 : 3.6;
    const widthPx = Math.max(760, Math.round((spanMs / DAY_MS) * pxPerDay));

    return {
      windowStartMs: startMs,
      windowEndMs: startMs + spanMs,
      windowSpanMs: spanMs,
      columns: cols,
      timelineWidthPx: widthPx,
    };
  }, [filteredProjects, milestonesByProject, todayMs, zoom]);

  // Group columns for top tier (year or month-year)
  const columnGroups = useMemo(() => {
    const groups: { key: string; label: string; spanMs: number }[] = [];
    for (const col of columns) {
      const last = groups[groups.length - 1];
      const dur = col.endMs - col.startMs;
      if (last && last.label === col.groupLabel) {
        last.spanMs += dur;
      } else {
        groups.push({ key: `${col.groupLabel}_${col.key}`, label: col.groupLabel, spanMs: dur });
      }
    }
    return groups;
  }, [columns]);

  const toPct = (ms: number): number => {
    return Math.max(0, Math.min(100, ((ms - windowStartMs) / windowSpanMs) * 100));
  };

  const todayPct = ((todayMs - windowStartMs) / windowSpanMs) * 100;
  const showTodayLine = todayPct >= 0 && todayPct <= 100;

  const handleJumpToToday = () => {
    const el = scrollRef.current;
    if (!el || !showTodayLine) return;
    const targetLeft = (todayPct / 100) * timelineWidthPx - el.clientWidth * 0.35;
    el.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  };

  const toggleProject = (pid: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [pid]: !prev[pid] }));
  };

  return (
    <section
      aria-label="Project milestones and deliverables Gantt chart"
      className="bg-white border border-stone-200 rounded-xl overflow-hidden"
    >
      {/* Header & Summary Strip */}
      <div className="px-5 py-4 border-b border-stone-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-[#0d4f3c]" />
            <h2 className="text-base font-semibold text-slate-900 font-display">
              Project Delivery &amp; Milestone Gantt Timeline
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
            <span>{filteredProjects.length} projects</span>
            <span aria-hidden="true">·</span>
            <span>{metrics.milestoneCount} milestones</span>
            <span aria-hidden="true">·</span>
            <span>{metrics.deliverableCount} deliverables</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700 font-medium">{metrics.completedCount} completed</span>
            {metrics.delayedCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-red-700 font-medium">{metrics.delayedCount} delayed</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showTodayLine && (
            <button
              type="button"
              onClick={handleJumpToToday}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0"
            >
              <Calendar className="w-3.5 h-3.5" />
              Today ({todayIso})
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => onAddMilestone(selectedProjectId !== 'all' ? selectedProjectId : undefined)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Milestone / Deliverable
            </button>
          )}
        </div>
      </div>

      {/* Interactive Controls Bar */}
      <div className="px-5 py-3 bg-stone-50/70 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter Gantt chart by project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-800 max-w-[240px]"
          >
            <option value="all">All Projects ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.title}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-0.5 p-0.5 bg-stone-200/70 rounded-lg" role="group" aria-label="Filter by timeline item kind">
            {(
              [
                { key: 'all', label: 'All Items' },
                { key: 'milestone', label: 'Milestones' },
                { key: 'deliverable', label: 'Deliverables' },
              ] as { key: KindFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setKindFilter(opt.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  kindFilter === opt.key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter timeline items by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-800"
          >
            <option value="all">All Statuses</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="delayed">Delayed</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-600 pr-2 border-r border-stone-200">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rotate-45 bg-[#0d4f3c] inline-block" />
              Milestone
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-2 rounded-xs bg-[#0d4f3c] inline-block" />
              In Progress
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-2 rounded-xs bg-emerald-600 inline-block" />
              Completed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-2 rounded-xs bg-red-600 inline-block" />
              Delayed
            </span>
          </div>

          {/* Zoom Scale */}
          <div className="flex items-center gap-0.5 p-0.5 bg-stone-200/70 rounded-lg" role="group" aria-label="Gantt timeline zoom level">
            {(
              [
                { key: 'week', label: 'Week' },
                { key: 'month', label: 'Month' },
                { key: 'quarter', label: 'Quarter' },
              ] as { key: ZoomScale; label: string }[]
            ).map((z) => (
              <button
                key={z.key}
                type="button"
                onClick={() => setZoom(z.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  zoom === z.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Gantt Split Grid */}
      {filteredProjects.length === 0 ? (
        <div className="px-6 py-12 text-center space-y-2">
          <ListChecks className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-700">No projects available for the timeline</p>
          <p className="text-xs text-slate-500">
            Register a project with start and end dates, then add milestones and deliverables to visualise progress.
          </p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row">
          {/* Left Hierarchy Panel */}
          <div className="w-full lg:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-stone-200 bg-white">
            {/* Header matching right 2-tier timeline header (56px total height) */}
            <div className="h-14 px-4 border-b border-stone-200 bg-stone-50/80 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <span>Project / Milestone &amp; Deliverable</span>
              <span className="font-mono">Progress</span>
            </div>

            <div>
              {filteredProjects.map((project) => {
                const isCollapsed = Boolean(collapsedProjects[project.id]);
                const items = milestonesByProject.get(project.id) || [];
                const totalForProject = milestones.filter((m) => m.projectId === project.id).length;

                return (
                  <React.Fragment key={project.id}>
                    {/* Project Group Row (48px) */}
                    <div className="h-12 px-3 border-b border-stone-200 bg-stone-50/50 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleProject(project.id)}
                          aria-label={isCollapsed ? `Expand ${project.title}` : `Collapse ${project.title}`}
                          className="p-1 text-slate-500 hover:text-slate-900 rounded"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 truncate">
                            <span>{project.code}</span>
                            <span aria-hidden="true">·</span>
                            <span>{totalForProject} items</span>
                          </div>
                          <div className="text-xs font-semibold text-slate-900 truncate" title={project.title}>
                            {project.title}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => onAddMilestone(project.id)}
                            title={`Add milestone or deliverable to ${project.code}`}
                            className="p-1 text-slate-500 hover:text-[#0d4f3c] rounded"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span className="text-xs font-mono font-semibold text-[#0d4f3c] tabular-nums w-9 text-right">
                          {project.progressPct}%
                        </span>
                      </div>
                    </div>

                    {/* Child Milestones & Deliverables (44px each) */}
                    {!isCollapsed &&
                      (items.length === 0 ? (
                        <div className="h-11 px-8 border-b border-stone-100 flex items-center justify-between text-[11px] text-slate-400">
                          <span>
                            {totalForProject === 0
                              ? 'No milestones logged yet'
                              : 'No items match active filters'}
                          </span>
                          {canEdit && totalForProject === 0 && (
                            <button
                              type="button"
                              onClick={() => onAddMilestone(project.id)}
                              className="font-medium text-[#0d4f3c] hover:underline"
                            >
                              + Add
                            </button>
                          )}
                        </div>
                      ) : (
                        items.map((item) => {
                          const effStatus = getEffectiveMilestoneStatus(item, todayIso);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => onSelectMilestone(item)}
                              onMouseEnter={() => setHoveredItem(item)}
                              onMouseLeave={() => setHoveredItem((cur) => (cur?.id === item.id ? null : cur))}
                              className="w-full h-11 px-4 pl-8 border-b border-stone-100 hover:bg-stone-50/90 transition-colors flex items-center justify-between gap-2 text-left"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {item.kind === 'milestone' ? (
                                  <Diamond className="w-3 h-3 text-amber-700 shrink-0" />
                                ) : (
                                  <span
                                    className={`w-2.5 h-2 rounded-xs shrink-0 ${STATUS_BAR_STYLES[effStatus].fill}`}
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-slate-800 truncate" title={item.title}>
                                    {item.title}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono truncate">
                                    {item.ownerName ? `${item.ownerName} · ` : ''}
                                    {item.kind === 'milestone'
                                      ? item.endDate
                                      : `${item.startDate} → ${item.endDate}`}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="hidden sm:inline-block">
                                  <StatusText status={effStatus} />
                                </span>
                                <span className="text-[11px] font-mono text-slate-700 tabular-nums w-8 text-right">
                                  {item.progressPct}%
                                </span>
                              </div>
                            </button>
                          );
                        })
                      ))}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Right Scrollable Timeline Canvas */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto bg-white relative">
            <div style={{ width: `${timelineWidthPx}px`, minWidth: '100%' }} className="relative">
              {/* Two-Tier Sticky Calendar Header (56px total) */}
              <div className="h-14 border-b border-stone-200 bg-stone-50/80 select-none">
                {/* Top Tier: Years / Month-Years */}
                <div className="h-7 flex border-b border-stone-200">
                  {columnGroups.map((g) => (
                    <div
                      key={g.key}
                      style={{ width: `${(g.spanMs / windowSpanMs) * 100}%` }}
                      className="px-2 flex items-center text-[11px] font-semibold text-slate-700 font-mono border-r border-stone-200 last:border-r-0 truncate"
                    >
                      {g.label}
                    </div>
                  ))}
                </div>
                {/* Bottom Tier: Weeks / Months / Quarters */}
                <div className="h-7 flex relative">
                  {columns.map((col) => {
                    const isCurrentPeriod = todayMs >= col.startMs && todayMs < col.endMs;
                    return (
                      <div
                        key={col.key}
                        style={{ width: `${((col.endMs - col.startMs) / windowSpanMs) * 100}%` }}
                        className={`px-1.5 flex items-center justify-center text-[11px] font-mono border-r border-stone-200 last:border-r-0 truncate ${
                          isCurrentPeriod ? 'bg-amber-50/80 text-amber-900 font-semibold' : 'text-slate-500'
                        }`}
                      >
                        {col.label}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Background Gridlines & Today Marker */}
              <div className="relative">
                <div className="absolute inset-0 flex pointer-events-none">
                  {columns.map((col) => {
                    const isCurrentPeriod = todayMs >= col.startMs && todayMs < col.endMs;
                    return (
                      <div
                        key={`grid_${col.key}`}
                        style={{ width: `${((col.endMs - col.startMs) / windowSpanMs) * 100}%` }}
                        className={`h-full border-r border-stone-100 last:border-r-0 ${
                          isCurrentPeriod ? 'bg-amber-50/25' : ''
                        }`}
                      />
                    );
                  })}
                </div>

                {showTodayLine && (
                  <div
                    style={{ left: `${todayPct}%` }}
                    className="absolute top-0 bottom-0 w-px border-l border-dashed border-amber-700 z-20 pointer-events-none"
                    aria-hidden="true"
                  >
                    <span className="absolute -top-5 -translate-x-1/2 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded-xs whitespace-nowrap">
                      Today
                    </span>
                  </div>
                )}

                {/* Rows Synchronized with Left Hierarchy */}
                <div className="relative z-10">
                  {filteredProjects.map((project) => {
                    const isCollapsed = Boolean(collapsedProjects[project.id]);
                    const items = milestonesByProject.get(project.id) || [];

                    // Compute project span from project startDate/endDate or child milestones
                    const allChildStarts = items
                      .map((m) => parseIsoDateUtc(m.startDate))
                      .filter((v): v is number => v !== null);
                    const allChildEnds = items
                      .map((m) => parseIsoDateUtc(m.endDate))
                      .filter((v): v is number => v !== null);

                    const pStartMs =
                      parseIsoDateUtc(project.startDate) ??
                      (allChildStarts.length > 0 ? Math.min(...allChildStarts) : null);
                    const pEndMs =
                      parseIsoDateUtc(project.endDate) ??
                      (allChildEnds.length > 0 ? Math.max(...allChildEnds) : null);

                    const hasValidSpan = pStartMs !== null && pEndMs !== null && pEndMs >= pStartMs;
                    const pLeftPct = hasValidSpan ? toPct(pStartMs) : 0;
                    const pRightPct = hasValidSpan ? toPct(pEndMs + DAY_MS) : 0;
                    const pWidthPct = Math.max(0.8, pRightPct - pLeftPct);

                    return (
                      <React.Fragment key={`track_${project.id}`}>
                        {/* Project Summary Track Row (48px) */}
                        <div className="h-12 border-b border-stone-200 bg-stone-50/35 relative flex items-center">
                          {hasValidSpan ? (
                            <div
                              style={{ left: `${pLeftPct}%`, width: `${pWidthPct}%` }}
                              title={`${project.code}: ${project.title} (${formatShortDate(pStartMs)} – ${formatShortDate(pEndMs)}) · ${project.progressPct}% complete`}
                              className="absolute h-4 rounded-sm bg-slate-200/90 border border-slate-300 overflow-hidden flex items-center"
                            >
                              <div
                                style={{ width: `${Math.min(100, Math.max(0, project.progressPct))}%` }}
                                className="h-full bg-[#0d4f3c]/80"
                              />
                            </div>
                          ) : (
                            <div className="px-4 flex items-center gap-2 text-[11px] text-slate-400">
                              <span>No project timeline dates set</span>
                              {canEdit && onEditProjectDates && (
                                <button
                                  type="button"
                                  onClick={() => onEditProjectDates(project)}
                                  className="text-[#0d4f3c] font-medium hover:underline"
                                >
                                  Set dates
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Child Milestone & Deliverable Tracks (44px each) */}
                        {!isCollapsed &&
                          (items.length === 0 ? (
                            <div className="h-11 border-b border-stone-100" />
                          ) : (
                            items.map((item) => {
                              const effStatus = getEffectiveMilestoneStatus(item, todayIso);
                              const palette = STATUS_BAR_STYLES[effStatus];
                              const sMs = parseIsoDateUtc(item.startDate) ?? todayMs;
                              const eMs = Math.max(sMs, parseIsoDateUtc(item.endDate) ?? sMs);

                              const leftPct = toPct(sMs);
                              const endPct = toPct(eMs + DAY_MS);
                              const widthPct = Math.max(0.9, endPct - leftPct);
                              const targetCenterPct = toPct(eMs + DAY_MS * 0.5);

                              if (item.kind === 'milestone') {
                                return (
                                  <div
                                    key={`track_${item.id}`}
                                    className="h-11 border-b border-stone-100 relative flex items-center"
                                  >
                                    {eMs > sMs && (
                                      <div
                                        style={{ left: `${leftPct}%`, width: `${Math.max(0.5, targetCenterPct - leftPct)}%` }}
                                        className="absolute h-0.5 bg-stone-300"
                                      />
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => onSelectMilestone(item)}
                                      onMouseEnter={() => setHoveredItem(item)}
                                      onMouseLeave={() =>
                                        setHoveredItem((cur) => (cur?.id === item.id ? null : cur))
                                      }
                                      onFocus={() => setHoveredItem(item)}
                                      style={{ left: `${targetCenterPct}%` }}
                                      title={`${item.title} (${formatShortDate(eMs)}) · ${palette.label}`}
                                      className="absolute -translate-x-1/2 flex items-center group focus:outline-none"
                                    >
                                      <span
                                        className={`w-3.5 h-3.5 rotate-45 border shadow-xs transition-transform group-hover:scale-110 ${palette.diamond}`}
                                      />
                                      <span className="ml-2.5 text-[11px] font-medium text-slate-700 whitespace-nowrap pointer-events-none">
                                        {item.title}
                                      </span>
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={`track_${item.id}`}
                                  className="h-11 border-b border-stone-100 relative flex items-center"
                                >
                                  <button
                                    type="button"
                                    onClick={() => onSelectMilestone(item)}
                                    onMouseEnter={() => setHoveredItem(item)}
                                    onMouseLeave={() =>
                                      setHoveredItem((cur) => (cur?.id === item.id ? null : cur))
                                    }
                                    onFocus={() => setHoveredItem(item)}
                                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                    title={`${item.title}: ${item.startDate} to ${item.endDate} (${item.progressPct}%) · ${palette.label}`}
                                    className={`absolute h-6 rounded-md border overflow-hidden flex items-center text-left transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#0d4f3c] ${palette.track}`}
                                  >
                                    <div
                                      style={{ width: `${Math.min(100, Math.max(0, item.progressPct))}%` }}
                                      className={`h-full transition-all ${palette.fill}`}
                                    />
                                    <span
                                      className={`px-2 text-[11px] font-medium truncate absolute inset-0 flex items-center z-10 ${
                                        item.progressPct >= 45 ? 'text-white' : 'text-slate-800'
                                      }`}
                                    >
                                      {item.title} ({item.progressPct}%)
                                    </span>
                                  </button>
                                </div>
                              );
                            })
                          ))}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Inspector Footer */}
      <div className="px-5 py-2.5 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        {hoveredItem ? (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-slate-700 min-w-0">
            <span className="font-semibold text-slate-900">{hoveredItem.title}</span>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="capitalize text-slate-600">{hoveredItem.kind}</span>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="font-mono text-slate-600 tabular-nums">
              {hoveredItem.kind === 'milestone'
                ? hoveredItem.endDate
                : `${hoveredItem.startDate} → ${hoveredItem.endDate}`}
            </span>
            {hoveredItem.ownerName && (
              <>
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
                <span>Owner: {hoveredItem.ownerName}</span>
              </>
            )}
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="font-mono font-semibold tabular-nums">{hoveredItem.progressPct}%</span>
            {hoveredItem.notes && (
              <>
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
                <span className="text-slate-500 truncate max-w-md">{hoveredItem.notes}</span>
              </>
            )}
          </div>
        ) : (
          <div className="text-slate-500">
            Hover any bar or milestone diamond to inspect schedule details. Click an item to{' '}
            {canEdit ? 'update progress, dates, or status' : 'view full details'}.
          </div>
        )}
        <div className="text-[11px] font-mono text-slate-500 tabular-nums shrink-0">
          Window: {formatShortDate(windowStartMs)} – {formatShortDate(windowEndMs - DAY_MS)}
        </div>
      </div>
    </section>
  );
}
