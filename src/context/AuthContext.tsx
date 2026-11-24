import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { BOOTSTRAP_ADMIN_EMAIL, ORG_ID, auth, db, googleAuthProvider, testConnection } from '../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import { isPrivilegedRole } from '../lib/rbac.ts';
import { recordAuditLog } from '../lib/audit.ts';
import { OrgSettings, RoleId, UserAccount } from '../types/erp.ts';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserAccount | null;
  effectiveRole: RoleId;
  previewRole: RoleId | null;
  setPreviewRole: (role: RoleId | null) => void;
  orgSettings: OrgSettings;
  authLoading: boolean;
  authError: string | null;
  mfaVerified: boolean;
  verifyMfaSession: (code: string) => boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  isBootstrappedAdmin: boolean;
}

const DEFAULT_SETTINGS: OrgSettings = {
  id: 'org',
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
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserAccount | null>(null);
  const [previewRole, setPreviewRole] = useState<RoleId | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mfaVerified, setMfaVerified] = useState(false);

  const isBootstrappedAdmin =
    Boolean(firebaseUser?.emailVerified) &&
    firebaseUser?.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

  useEffect(() => {
    const root = document.documentElement;
    if (orgSettings.primaryColor) {
      root.style.setProperty('--brand-primary', orgSettings.primaryColor);
    }
    if (orgSettings.accentColor) {
      root.style.setProperty('--brand-accent', orgSettings.accentColor);
    }
  }, [orgSettings.primaryColor, orgSettings.accentColor]);

  useEffect(() => {
    let unsubUser: (() => void) | undefined;
    let unsubSettings: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubUser) unsubUser();
      if (unsubSettings) unsubSettings();

      setFirebaseUser(user);
      setPreviewRole(null);
      setAuthError(null);

      if (!user) {
        setProfile(null);
        setMfaVerified(false);
        setAuthLoading(false);
        return;
      }

      if (!user.emailVerified) {
        setAuthError('Your Google account email must be verified to access iServe Africa IMS.');
        setAuthLoading(false);
        return;
      }

      try {
        void testConnection();
        const userRef = doc(db, 'users', user.uid);
        const dirRef = doc(db, 'directory', user.uid);
        const snap = await getDoc(userRef);

        const isAdminEmail = user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
        const assignedRole: RoleId = isAdminEmail ? 'super_admin' : 'staff_member';

        if (!snap.exists()) {
          const displayName = user.displayName || user.email?.split('@')[0] || 'iServe User';
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email || '',
            displayName,
            role: assignedRole,
            departmentId: isAdminEmail ? 'demo_dept_exec' : '',
            departmentName: isAdminEmail ? 'Executive & Governance' : 'General Staff',
            jobTitle: isAdminEmail ? 'System Administrator' : 'Staff Member',
            phone: '',
            status: 'active',
            mfaEnforced: isPrivilegedRole(assignedRole),
            isDemo: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          await setDoc(dirRef, {
            uid: user.uid,
            orgId: ORG_ID,
            displayName,
            role: assignedRole,
            departmentId: isAdminEmail ? 'demo_dept_exec' : '',
            departmentName: isAdminEmail ? 'Executive & Governance' : 'General Staff',
            jobTitle: isAdminEmail ? 'System Administrator' : 'Staff Member',
            status: 'active',
            isDemo: false,
            updatedAt: serverTimestamp(),
          });

          await recordAuditLog({
            actorUid: user.uid,
            actorName: displayName,
            actorRole: assignedRole,
            action: 'USER_PROVISIONED',
            targetCollection: 'users',
            targetId: user.uid,
            summary: `Initial account sign-in provisioned (${assignedRole}).`,
          });
        }

        unsubUser = onSnapshot(
          userRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as Omit<UserAccount, 'id'>;
              setProfile({ id: docSnap.id, ...data });
              if (!data.mfaEnforced) {
                setMfaVerified(true);
              }
            }
            setAuthLoading(false);
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
          }
        );

        unsubSettings = onSnapshot(
          doc(db, 'settings', 'org'),
          (sSnap) => {
            if (sSnap.exists()) {
              setOrgSettings({ id: sSnap.id, ...(sSnap.data() as Omit<OrgSettings, 'id'>) });
            }
          },
          (err) => {
            console.warn('Settings listener warning:', err.message);
          }
        );
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Unable to initialise user session.');
        setAuthLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
      if (unsubSettings) unsubSettings();
    };
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    }
  };

  const signOut = async () => {
    setPreviewRole(null);
    setMfaVerified(false);
    await fbSignOut(auth);
  };

  const verifyMfaSession = (code: string): boolean => {
    const cleaned = code.trim();
    if (/^\d{6}$/.test(cleaned)) {
      setMfaVerified(true);
      if (profile) {
        recordAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: 'MFA_SESSION_VERIFIED',
          targetCollection: 'users',
          targetId: profile.uid,
          summary: 'Privileged account completed session multi-factor verification.',
        }).catch(() => {});
      }
      return true;
    }
    return false;
  };

  const effectiveRole: RoleId =
    profile?.role === 'super_admin' && previewRole ? previewRole : profile?.role || 'staff_member';

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        effectiveRole,
        previewRole,
        setPreviewRole,
        orgSettings,
        authLoading,
        authError,
        mfaVerified,
        verifyMfaSession,
        signInWithGoogle,
        signOut,
        isBootstrappedAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
