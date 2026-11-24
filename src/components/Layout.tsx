import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Wallet,
  Users,
  GraduationCap,
  BookOpen,
  FolderKanban,
  ShoppingBag,
  FileText,
  BarChart3,
  Shield,
  Smartphone,
  Menu,
  ChevronLeft,
  Search,
  Bell,
  LogOut,
  Wifi,
  WifiOff,
  Check,
  X,
  CalendarDays,
  User,
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { ALL_ROLES, ROLE_DEFINITIONS, canAccessModule } from '../lib/rbac.ts';
import { flushOfflineQueue, loadOfflineQueue } from '../lib/offlineQueue.ts';
import { ApprenticePortalTab, ModuleKey, RoleId, formatNairobiDateTime } from '../types/erp.ts';

interface NavItem {
  key: ModuleKey;
  label: string;
  section: string;
  Icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Executive Dashboard', section: 'Overview', Icon: LayoutDashboard },
  { key: 'approvals', label: 'Approval Queue', section: 'Overview', Icon: CheckSquare },
  { key: 'finance', label: 'Finance & Accounting', section: 'Operations', Icon: Wallet },
  { key: 'hr', label: 'Human Resources', section: 'People & Training', Icon: Users },
  { key: 'apprenticeship', label: 'Apprenticeships', section: 'People & Training', Icon: GraduationCap },
  { key: 'bookstore', label: 'Bookstore & POS', section: 'Operations', Icon: BookOpen },
  { key: 'projects', label: 'Projects & Programmes', section: 'Operations', Icon: FolderKanban },
  { key: 'procurement', label: 'Admin & Procurement', section: 'Operations', Icon: ShoppingBag },
  { key: 'documents', label: 'Document Control', section: 'Records & Reports', Icon: FileText },
  { key: 'reports', label: 'Reports & Exports', section: 'Records & Reports', Icon: BarChart3 },
  { key: 'mobile_sync', label: 'Mobile & Offline Sync', section: 'Records & Reports', Icon: Smartphone },
  { key: 'governance', label: 'Settings & Audit', section: 'Governance', Icon: Shield },
];

interface ApprenticeNavItem {
  key: ApprenticePortalTab;
  label: string;
  section: 'Apprentice Portal' | 'Account & Alerts';
  Icon: typeof LayoutDashboard;
}

const APPRENTICE_NAV_ITEMS: ApprenticeNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', section: 'Apprentice Portal', Icon: LayoutDashboard },
  { key: 'reports', label: 'My Reports', section: 'Apprentice Portal', Icon: FileText },
  { key: 'book_reviews', label: 'Book Reviews', section: 'Apprentice Portal', Icon: BookOpen },
  { key: 'leave', label: 'Leave Management', section: 'Apprentice Portal', Icon: CalendarDays },
  { key: 'imprest', label: 'Imprest Management', section: 'Apprentice Portal', Icon: Wallet },
  { key: 'pd_reports', label: 'My PD Reports', section: 'Apprentice Portal', Icon: GraduationCap },
  { key: 'notifications', label: 'Notifications', section: 'Account & Alerts', Icon: Bell },
  { key: 'profile', label: 'My Profile', section: 'Account & Alerts', Icon: User },
];

interface LayoutProps {
  activeModule: ModuleKey;
  onSelectModule: (key: ModuleKey) => void;
  activeApprenticeTab?: ApprenticePortalTab;
  onSelectApprenticeTab?: (tab: ApprenticePortalTab) => void;
  children: React.ReactNode;
}

export function Layout({
  activeModule,
  onSelectModule,
  activeApprenticeTab = 'dashboard',
  onSelectApprenticeTab,
  children,
}: LayoutProps) {
  const { profile, effectiveRole, previewRole, setPreviewRole, orgSettings, signOut } = useAuth();
  const {
    notifications,
    directory,
    projects,
    books,
    documents,
    financeTransactions,
    apprentices,
    leaveRequests,
    apprenticeReports,
    bookReviews,
    imprestRetirements,
    monthlyPdReports,
    procurementRequests,
  } = useData();
  const isApprenticeView = effectiveRole === 'apprentice';

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queueCount, setQueueCount] = useState<number>(() => loadOfflineQueue().length);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    const refreshQueue = () => {
      const q = loadOfflineQueue().filter((i) => !profile || i.userId === profile.uid);
      setQueueCount(q.length);
    };
    const handleOnline = async () => {
      setOnline(true);
      if (profile) {
        const res = await flushOfflineQueue(profile.uid);
        if (res.synced > 0) {
          setSyncNotice(`Synchronised ${res.synced} offline record(s).`);
          setTimeout(() => setSyncNotice(null), 4000);
        }
        refreshQueue();
      }
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('iserve-offline-queue-updated', refreshQueue);
    refreshQueue();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('iserve-offline-queue-updated', refreshQueue);
    };
  }, [profile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) => canAccessModule(effectiveRole, item.key)),
    [effectiveRole]
  );

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const pendingApprovalsCount = useMemo(() => {
    const fin = financeTransactions.filter((t) => ['submitted', 'pending_approval'].includes(t.status)).length;
    const lv = leaveRequests.filter((l) => ['submitted', 'pending_hr'].includes(l.status)).length;
    const rep = apprenticeReports.filter((r) => r.status === 'submitted').length;
    const proc = procurementRequests.filter((p) => p.status === 'submitted').length;
    return fin + lv + rep + proc;
  }, [financeTransactions, leaveRequests, apprenticeReports, procurementRequests]);

  const globalResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    const out: { title: string; subtitle: string; module: ModuleKey; apprenticeTab?: ApprenticePortalTab }[] = [];

    if (isApprenticeView) {
      const uid = profile?.uid || '';
      apprenticeReports
        .filter((r) => r.apprenticeUserId === uid)
        .forEach((r) => {
          if (r.reportType.toLowerCase().includes(q) || r.periodStart.toLowerCase().includes(q) || (r.workProgress || r.activities).toLowerCase().includes(q)) {
            out.push({ title: `${r.reportType.toUpperCase()} Report (${r.periodStart})`, subtitle: 'My Reports', module: 'dashboard', apprenticeTab: 'reports' });
          }
        });
      bookReviews
        .filter((b) => b.apprenticeUserId === uid)
        .forEach((b) => {
          if (b.bookTitle.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)) {
            out.push({ title: b.bookTitle, subtitle: `Book Review · ${b.author}`, module: 'dashboard', apprenticeTab: 'book_reviews' });
          }
        });
      imprestRetirements
        .filter((ret) => ret.apprenticeUserId === uid)
        .forEach((ret) => {
          if (ret.referenceNo.toLowerCase().includes(q) || ret.category.toLowerCase().includes(q) || (ret.purpose || '').toLowerCase().includes(q)) {
            out.push({ title: `${ret.category.toUpperCase()} Imprest ${ret.referenceNo}`, subtitle: 'Imprest Management', module: 'dashboard', apprenticeTab: 'imprest' });
          }
        });
      monthlyPdReports
        .filter((pd) => pd.apprenticeUserId === uid)
        .forEach((pd) => {
          if (pd.title.toLowerCase().includes(q) || pd.periodKey.toLowerCase().includes(q)) {
            out.push({ title: pd.title, subtitle: `My PD Reports · ${pd.periodKey}`, module: 'dashboard', apprenticeTab: 'pd_reports' });
          }
        });
      return out.slice(0, 12);
    }

    directory.forEach((d) => {
      if (d.displayName.toLowerCase().includes(q) || (d.jobTitle || '').toLowerCase().includes(q)) {
        out.push({ title: d.displayName, subtitle: `Staff · ${d.departmentName || 'General'}`, module: 'hr' });
      }
    });
    apprentices.forEach((a) => {
      if (a.fullName.toLowerCase().includes(q) || a.apprenticeCode.toLowerCase().includes(q)) {
        out.push({ title: a.fullName, subtitle: `Apprentice · ${a.apprenticeCode}`, module: 'apprenticeship' });
      }
    });
    projects.forEach((p) => {
      if (p.title.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) {
        out.push({ title: p.title, subtitle: `Project · ${p.code}`, module: 'projects' });
      }
    });
    books.forEach((b) => {
      if (b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.isbn.toLowerCase().includes(q)) {
        out.push({ title: b.title, subtitle: `Bookstore · ${b.author}`, module: 'bookstore' });
      }
    });
    documents.forEach((docItem) => {
      if (docItem.title.toLowerCase().includes(q) || docItem.category.toLowerCase().includes(q)) {
        out.push({ title: docItem.title, subtitle: `Document · ${docItem.category}`, module: 'documents' });
      }
    });
    financeTransactions.forEach((tx) => {
      if (tx.title.toLowerCase().includes(q) || tx.txNumber.toLowerCase().includes(q)) {
        out.push({ title: tx.title, subtitle: `Finance · ${tx.txNumber}`, module: 'finance' });
      }
    });
    return out.slice(0, 12);
  }, [
    searchTerm,
    isApprenticeView,
    profile,
    apprenticeReports,
    bookReviews,
    imprestRetirements,
    monthlyPdReports,
    directory,
    apprentices,
    projects,
    books,
    documents,
    financeTransactions,
  ]);

  const activeNav = NAV_ITEMS.find((n) => n.key === activeModule);
  const activeApprenticeNav = APPRENTICE_NAV_ITEMS.find((n) => n.key === activeApprenticeTab);
  const roleDef = ROLE_DEFINITIONS[effectiveRole];

  const markNotifRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch {
      // Ignore read toggle errors
    }
  };

  const renderSidebarContent = (isMobile = false) => {
    const sections = ['Overview', 'Operations', 'People & Training', 'Records & Reports', 'Governance'];
    return (
      <div className="flex flex-col h-full bg-white border-r border-stone-200">
        <div className="h-16 px-4 flex items-center justify-between border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/src/assets/images/iserve_crest_emblem_1795437880165.jpg"
              alt="iServe Africa"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-md object-cover border border-stone-200 shrink-0"
            />
            {(!collapsed || isMobile) && (
              <span className="font-bold text-sm text-slate-900 font-display truncate">
                {orgSettings.orgName} IMS
              </span>
            )}
          </div>
          {!isMobile && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-stone-100 rounded-md transition-colors"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {isApprenticeView ? (
            (['Apprentice Portal', 'Account & Alerts'] as const).map((section) => {
              const items = APPRENTICE_NAV_ITEMS.filter((i) => i.section === section);
              return (
                <div key={section} className="space-y-1">
                  {(!collapsed || isMobile) && (
                    <div className="px-2.5 pb-1 text-[11px] font-semibold text-slate-400 tracking-wide">
                      {section}
                    </div>
                  )}
                  {items.map((item) => {
                    const Icon = item.Icon;
                    const active = activeApprenticeTab === item.key;
                    const showUnread = item.key === 'notifications' && unreadCount > 0;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          onSelectApprenticeTab?.(item.key);
                          if (isMobile) setMobileOpen(false);
                        }}
                        title={collapsed && !isMobile ? item.label : undefined}
                        className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-[var(--brand-primary)] text-white'
                            : 'text-slate-700 hover:bg-stone-100 hover:text-slate-900'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon className="w-4 h-4 shrink-0" />
                          {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                        </span>
                        {showUnread && (!collapsed || isMobile) && (
                          <span
                            className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                              active ? 'bg-white/20 text-white' : 'bg-stone-100 text-slate-700'
                            }`}
                          >
                            {unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          ) : (
            sections.map((section) => {
              const items = visibleNav.filter((i) => i.section === section);
              if (items.length === 0) return null;
              return (
                <div key={section} className="space-y-1">
                  {(!collapsed || isMobile) && (
                    <div className="px-2.5 pb-1 text-[11px] font-semibold text-slate-400 tracking-wide">
                      {section}
                    </div>
                  )}
                  {items.map((item) => {
                    const Icon = item.Icon;
                    const active = activeModule === item.key;
                    const showCount = item.key === 'approvals' && pendingApprovalsCount > 0;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          onSelectModule(item.key);
                          if (isMobile) setMobileOpen(false);
                        }}
                        title={collapsed && !isMobile ? item.label : undefined}
                        className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-[var(--brand-primary)] text-white'
                            : 'text-slate-700 hover:bg-stone-100 hover:text-slate-900'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon className="w-4 h-4 shrink-0" />
                          {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                        </span>
                        {showCount && (!collapsed || isMobile) && (
                          <span
                            className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                              active ? 'bg-white/20 text-white' : 'bg-stone-100 text-slate-700'
                            }`}
                          >
                            {pendingApprovalsCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </nav>

        <div className="p-3 border-t border-stone-200 text-xs text-slate-500">
          {(!collapsed || isMobile) ? (
            <div className="space-y-0.5 px-1">
              <div className="font-medium text-slate-700 truncate">{roleDef.label}</div>
              <div className="truncate">{orgSettings.fiscalYear} · Africa/Nairobi</div>
            </div>
          ) : (
            <div className="text-center font-mono text-[10px]">KES</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:block shrink-0 transition-all duration-200 ${collapsed ? 'w-[72px]' : 'w-64'}`}>
        <div className="sticky top-0 h-screen">{renderSidebarContent(false)}</div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/40" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{renderSidebarContent(true)}</div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-stone-200 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-stone-100 rounded-lg"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (isApprenticeView) {
                    onSelectApprenticeTab?.('dashboard');
                  } else {
                    onSelectModule('dashboard');
                  }
                }}
                className="text-slate-500 hover:text-slate-900 whitespace-nowrap shrink-0"
              >
                iServe IMS
              </button>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 truncate">
                {isApprenticeView ? (activeApprenticeNav?.label || 'Dashboard') : (activeNav?.label || 'Dashboard')}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Global Search Trigger */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search</span>
              <span className="hidden md:inline font-mono text-[10px] text-slate-400">⌘K</span>
            </button>

            {/* Offline / Sync Status */}
            <button
              type="button"
              onClick={() => {
                if (isApprenticeView) {
                  onSelectApprenticeTab?.('reports');
                } else {
                  onSelectModule('mobile_sync');
                }
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                !online
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : queueCount > 0
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-white border-stone-200 text-slate-600 hover:bg-stone-50'
              }`}
              title="Connectivity & Offline Queue"
            >
              {online ? <Wifi className="w-3.5 h-3.5 text-emerald-700" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {!online ? 'Offline' : queueCount > 0 ? `${queueCount} Queued` : 'Synced'}
              </span>
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-stone-100 rounded-lg transition-colors"
              aria-label="Open notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-mono font-semibold text-white bg-red-600 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2.5 pl-2 pr-2.5 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-[var(--brand-primary)] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                  {(profile?.displayName || 'U').slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden md:block text-left leading-tight">
                  <div className="text-xs font-semibold text-slate-900 max-w-[130px] truncate">
                    {profile?.displayName}
                  </div>
                  <div className="text-[11px] text-slate-500 max-w-[130px] truncate">
                    {previewRole ? `Preview: ${roleDef.label}` : roleDef.label}
                  </div>
                </div>
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-72 bg-white border border-stone-200 rounded-xl shadow-lg z-50 p-3 space-y-3">
                    <div className="pb-2.5 border-b border-stone-100">
                      <div className="text-sm font-semibold text-slate-900">{profile?.displayName}</div>
                      <div className="text-xs text-slate-500 truncate">{profile?.email}</div>
                      <div className="text-xs text-emerald-800 font-medium mt-1">{roleDef.label}</div>
                    </div>

                    {profile?.role === 'super_admin' && (
                      <div className="space-y-1.5 pb-2.5 border-b border-stone-100">
                        <label htmlFor="role-preview" className="block text-[11px] font-semibold text-slate-500">
                          Super Admin Role Perspective Preview
                        </label>
                        <select
                          id="role-preview"
                          value={previewRole || 'super_admin'}
                          onChange={(e) => {
                            const val = e.target.value as RoleId;
                            setPreviewRole(val === 'super_admin' ? null : val);
                            setUserMenuOpen(false);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg text-slate-800"
                        >
                          {ALL_ROLES.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        void signOut();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Role Preview Banner */}
        {previewRole && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between gap-4 text-xs text-amber-900 no-print">
            <span>
              Viewing workspace perspective as <strong>{ROLE_DEFINITIONS[previewRole].label}</strong>.
            </span>
            <button
              type="button"
              onClick={() => setPreviewRole(null)}
              className="font-semibold underline hover:no-underline whitespace-nowrap"
            >
              Return to Super Administrator
            </button>
          </div>
        )}

        {syncNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-xs text-emerald-900">
            {syncNotice}
          </div>
        )}

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>

      {/* Global Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 pt-20 p-4">
          <div className="w-full max-w-xl bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="search"
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search staff, apprentices, projects, books, documents, or transactions..."
                className="w-full text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-stone-100">
              {!searchTerm.trim() ? (
                <div className="p-6 text-xs text-slate-500 text-center">
                  Type a keyword to search across all authorised modules.
                </div>
              ) : globalResults.length === 0 ? (
                <div className="p-6 text-xs text-slate-500 text-center">No matching records found.</div>
              ) : (
                globalResults.map((res, idx) => (
                  <button
                    key={`${res.module}-${idx}`}
                    type="button"
                    onClick={() => {
                      if (res.apprenticeTab && onSelectApprenticeTab) {
                        onSelectApprenticeTab(res.apprenticeTab);
                      } else {
                        onSelectModule(res.module);
                      }
                      setSearchOpen(false);
                      setSearchTerm('');
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-stone-50 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{res.title}</div>
                      <div className="text-xs text-slate-500">{res.subtitle}</div>
                    </div>
                    <span className="text-xs font-medium text-emerald-800">Open</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification Centre Drawer */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-slate-950/35" onClick={() => setNotifOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full border-l border-stone-200 z-10 flex flex-col">
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 font-display">Notification Centre</h2>
                <p className="text-xs text-slate-500">{unreadCount} unread alert(s)</p>
              </div>
              <button
                type="button"
                onClick={() => setNotifOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No notifications yet. Workflow approvals, report submissions, and system alerts appear here.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 space-y-1.5 ${n.read ? 'bg-white' : 'bg-emerald-50/40'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">{n.title}</span>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => void markNotifRead(n.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 hover:underline shrink-0"
                        >
                          <Check className="w-3 h-3" />
                          Mark read
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>{n.category} · {formatNairobiDateTime(n.createdAt)}</span>
                      {(n.linkModule || isApprenticeView) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isApprenticeView && onSelectApprenticeTab) {
                              const text = `${n.title} ${n.message}`.toLowerCase();
                              if (n.category === 'leave' || text.includes('leave')) {
                                onSelectApprenticeTab('leave');
                              } else if (text.includes('pd report') || text.includes('personal development') || n.category === 'document') {
                                onSelectApprenticeTab('pd_reports');
                              } else if (text.includes('imprest') || n.category === 'finance') {
                                onSelectApprenticeTab('imprest');
                              } else if (text.includes('book')) {
                                onSelectApprenticeTab('book_reviews');
                              } else if (n.category === 'report' || text.includes('report')) {
                                onSelectApprenticeTab('reports');
                              } else {
                                onSelectApprenticeTab('notifications');
                              }
                            } else if (n.linkModule) {
                              onSelectModule(n.linkModule as ModuleKey);
                            }
                            setNotifOpen(false);
                          }}
                          className="text-emerald-800 font-medium hover:underline"
                        >
                          {isApprenticeView ? 'Open section' : 'Open module'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
