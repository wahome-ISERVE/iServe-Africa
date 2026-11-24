import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { ApprenticeDashboardHome } from '../components/apprentice/ApprenticeDashboardHome.tsx';
import { ApprenticeReportsSection } from '../components/apprentice/ApprenticeReportsSection.tsx';
import { BookReviewsSection } from '../components/apprentice/BookReviewsSection.tsx';
import { ApprenticeLeaveSection } from '../components/apprentice/ApprenticeLeaveSection.tsx';
import { ImprestManagementSection } from '../components/apprentice/ImprestManagementSection.tsx';
import { MonthlyPdReportsSection } from '../components/apprentice/MonthlyPdReportsSection.tsx';
import { ApprenticeNotificationsSection } from '../components/apprentice/ApprenticeNotificationsSection.tsx';
import { ApprenticeProfileSection } from '../components/apprentice/ApprenticeProfileSection.tsx';
import { ApprenticeHistorySection } from '../components/apprentice/ApprenticeHistorySection.tsx';
import { ApprenticePortalTab } from '../types/erp.ts';

interface ApprenticePortalPageProps {
  activeTab: ApprenticePortalTab;
  onSelectTab: (tab: ApprenticePortalTab) => void;
}

type QuickActionIntent = 'new_report' | 'new_book' | 'new_leave' | 'new_imprest' | null;

export function ApprenticePortalPage({ activeTab, onSelectTab }: ApprenticePortalPageProps) {
  const { profile } = useAuth();
  const { apprentices } = useData();

  const [pendingAction, setPendingAction] = useState<QuickActionIntent>(null);
  const [reportsSubView, setReportsSubView] = useState<'submissions' | 'history'>('submissions');

  const apprenticeRecord = useMemo(() => {
    if (!profile) return null;
    return (
      apprentices.find((a) => a.userId === profile.uid) ||
      apprentices.find((a) => a.email && profile.email && a.email.toLowerCase() === profile.email.toLowerCase()) ||
      null
    );
  }, [apprentices, profile]);

  const handleNavigate = (tab: ApprenticePortalTab, action?: Exclude<QuickActionIntent, null>) => {
    if (tab === 'reports' && !action) {
      setReportsSubView('submissions');
    }
    setPendingAction(action || null);
    onSelectTab(tab);
  };

  const clearAction = () => setPendingAction(null);

  switch (activeTab) {
    case 'dashboard':
      return <ApprenticeDashboardHome apprenticeRecord={apprenticeRecord} onNavigateTab={handleNavigate} />;

    case 'reports':
      return (
        <div className="space-y-5">
          <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setReportsSubView('submissions')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                reportsSubView === 'submissions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Apprentice Reports
            </button>
            <button
              type="button"
              onClick={() => setReportsSubView('history')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                reportsSubView === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Central Submission History
            </button>
          </div>

          {reportsSubView === 'submissions' ? (
            <ApprenticeReportsSection
              apprenticeRecord={apprenticeRecord}
              autoOpenNew={pendingAction === 'new_report'}
              onConsumeAutoOpen={clearAction}
            />
          ) : (
            <ApprenticeHistorySection onNavigateTab={(tab) => handleNavigate(tab)} />
          )}
        </div>
      );

    case 'book_reviews':
      return (
        <BookReviewsSection
          apprenticeRecord={apprenticeRecord}
          autoOpenNew={pendingAction === 'new_book'}
          onConsumeAutoOpen={clearAction}
        />
      );

    case 'leave':
      return (
        <ApprenticeLeaveSection
          apprenticeRecord={apprenticeRecord}
          autoOpenNew={pendingAction === 'new_leave'}
          onConsumeAutoOpen={clearAction}
        />
      );

    case 'imprest':
      return (
        <ImprestManagementSection
          apprenticeRecord={apprenticeRecord}
          autoOpenNew={pendingAction === 'new_imprest'}
          onConsumeAutoOpen={clearAction}
        />
      );

    case 'pd_reports':
      return <MonthlyPdReportsSection />;

    case 'notifications':
      return <ApprenticeNotificationsSection apprenticeRecord={apprenticeRecord} onNavigateTab={handleNavigate} />;

    case 'profile':
      return <ApprenticeProfileSection apprenticeRecord={apprenticeRecord} />;

    default:
      return <ApprenticeDashboardHome apprenticeRecord={apprenticeRecord} onNavigateTab={handleNavigate} />;
  }
}
