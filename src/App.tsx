import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { DataProvider, useData } from './context/DataContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { Layout } from './components/Layout.tsx';
import { canAccessModule } from './lib/rbac.ts';
import { ApprenticePortalTab, ModuleKey } from './types/erp.ts';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { ApprovalsPage } from './pages/ApprovalsPage.tsx';
import { FinancePage } from './pages/FinancePage.tsx';
import { HRPage } from './pages/HRPage.tsx';
import { ApprenticeshipPage } from './pages/ApprenticeshipPage.tsx';
import { BookstorePage } from './pages/BookstorePage.tsx';
import { ProjectsPage } from './pages/ProjectsPage.tsx';
import { ProcurementAdminPage } from './pages/ProcurementAdminPage.tsx';
import { DocumentsPage } from './pages/DocumentsPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { GovernancePage } from './pages/GovernancePage.tsx';
import { MobileSyncPage } from './pages/MobileSyncPage.tsx';
import { ApprenticePortalPage } from './pages/ApprenticePortalPage.tsx';

function WorkspaceShell() {
  const { firebaseUser, profile, effectiveRole, authLoading, mfaVerified } = useAuth();
  const { dataError } = useData();

  const [deepLinkAsset, setDeepLinkAsset] = useState<{ assetId?: string; assetTag?: string } | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const assetId = params.get('assetId')?.trim() || undefined;
    const assetTag = params.get('assetTag')?.trim() || undefined;
    return assetId || assetTag ? { assetId, assetTag } : null;
  });

  const [deepLinkAdminTab, setDeepLinkAdminTab] = useState<'assets' | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const hasAsset = Boolean(params.get('assetId') || params.get('assetTag'));
    return tabParam === 'assets' || hasAsset ? 'assets' : undefined;
  });

  const [activeModule, setActiveModule] = useState<ModuleKey>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const params = new URLSearchParams(window.location.search);
    const mod = params.get('module') as ModuleKey | null;
    if (mod) return mod;
    if (params.get('assetId') || params.get('assetTag')) return 'procurement';
    return 'dashboard';
  });

  const [apprenticeTab, setApprenticeTab] = useState<ApprenticePortalTab>('dashboard');

  useEffect(() => {
    if (!canAccessModule(effectiveRole, activeModule)) {
      setActiveModule('dashboard');
    }
  }, [effectiveRole, activeModule]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-600">Loading iServe Africa IMS...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !profile || profile.status !== 'active' || (profile.mfaEnforced && !mfaVerified)) {
    return <LoginPage />;
  }

  const clearDeepLink = () => {
    setDeepLinkAsset(null);
    setDeepLinkAdminTab(undefined);
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const renderModule = () => {
    if (effectiveRole === 'apprentice') {
      return <ApprenticePortalPage activeTab={apprenticeTab} onSelectTab={setApprenticeTab} />;
    }

    switch (activeModule) {
      case 'dashboard':
        return <DashboardPage onNavigate={setActiveModule} />;
      case 'approvals':
        return <ApprovalsPage />;
      case 'finance':
        return <FinancePage />;
      case 'hr':
        return <HRPage />;
      case 'apprenticeship':
        return <ApprenticeshipPage />;
      case 'bookstore':
        return <BookstorePage />;
      case 'projects':
        return <ProjectsPage />;
      case 'procurement':
        return (
          <ProcurementAdminPage
            initialTab={deepLinkAdminTab}
            deepLinkAsset={deepLinkAsset}
            onClearDeepLink={clearDeepLink}
          />
        );
      case 'documents':
        return <DocumentsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'governance':
        return <GovernancePage />;
      case 'mobile_sync':
        return <MobileSyncPage />;
      default:
        return <DashboardPage onNavigate={setActiveModule} />;
    }
  };

  return (
    <Layout
      activeModule={activeModule}
      onSelectModule={setActiveModule}
      activeApprenticeTab={apprenticeTab}
      onSelectApprenticeTab={setApprenticeTab}
    >
      {dataError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {dataError}
        </div>
      )}
      {renderModule()}
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DataProvider>
          <WorkspaceShell />
        </DataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
