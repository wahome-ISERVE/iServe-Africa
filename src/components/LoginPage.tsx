import React, { useState } from 'react';
import { ShieldCheck, ArrowRight, Lock, Globe, BookOpen, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ROLE_DEFINITIONS } from '../lib/rbac.ts';

export function LoginPage() {
  const { firebaseUser, profile, authError, mfaVerified, verifyMfaSession, signInWithGoogle, signOut, orgSettings } =
    useAuth();
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');

  // MFA Gate for signed-in privileged accounts before revealing ERP workspace
  if (firebaseUser && profile && profile.mfaEnforced && !mfaVerified) {
    const roleLabel = ROLE_DEFINITIONS[profile.role]?.label || profile.role;
    const handleMfaSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setMfaError('');
      if (!verifyMfaSession(mfaCode)) {
        setMfaError('Enter a valid 6-digit authenticator verification code (e.g. 482910 for session verification).');
      }
    };

    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-stone-200 rounded-xl p-8 space-y-6">
          <div className="flex items-center gap-3">
            <img
              src="/src/assets/images/iserve_crest_emblem_1795437880165.jpg"
              alt="iServe Africa Crest"
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-lg object-cover border border-stone-200"
            />
            <div>
              <h1 className="text-lg font-bold text-slate-900 font-display">{orgSettings.orgName} IMS</h1>
              <p className="text-xs text-slate-500">Privileged Account Multi-Factor Verification</p>
            </div>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 space-y-1">
            <div className="text-xs text-slate-500">Signed in as</div>
            <div className="text-sm font-semibold text-slate-900">{profile.displayName}</div>
            <div className="text-xs text-slate-600">
              {profile.email} <span aria-hidden="true">·</span> {roleLabel}
            </div>
          </div>

          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div>
              <label htmlFor="mfa-code" className="block text-xs font-medium text-slate-700 mb-1.5">
                6-Digit Security Verification Code
              </label>
              <input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit code"
                className="w-full px-3.5 py-2.5 text-base font-mono tracking-widest border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20 focus:border-[var(--brand-primary)]"
              />
              {mfaError && <p className="text-xs text-red-700 mt-1.5">{mfaError}</p>}
              <p className="text-xs text-slate-500 mt-2">
                Privileged accounts require secondary verification per iServe Africa security policy. Enter your
                6-digit code to unlock administrative modules.
              </p>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              Verify & Enter Workspace
            </button>
          </form>

          <div className="pt-2 border-t border-stone-100 flex justify-between items-center text-xs">
            <button
              type="button"
              onClick={() => setMfaCode('482910')}
              className="text-emerald-800 hover:underline font-medium"
            >
              Use preview verification code (482910)
            </button>
            <button type="button" onClick={() => void signOut()} className="text-slate-500 hover:text-slate-800">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Inactive account notice
  if (firebaseUser && profile && profile.status !== 'active') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-stone-200 rounded-xl p-8 space-y-4">
          <h1 className="text-lg font-bold text-slate-900 font-display">Account Pending Activation</h1>
          <p className="text-sm text-slate-600">
            Your account ({profile.email}) is currently marked as <strong>{profile.status}</strong>. Contact the iServe
            Africa Super Administrator to activate your access.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 grid lg:grid-cols-12">
      {/* Left Institutional Panel */}
      <div className="lg:col-span-6 flex flex-col justify-between p-8 sm:p-12 lg:p-16 bg-white border-r border-stone-200">
        <div className="flex items-center gap-3.5">
          <img
            src="/src/assets/images/iserve_crest_emblem_1795437880165.jpg"
            alt="iServe Africa Institutional Crest"
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-lg object-cover border border-stone-200 shrink-0"
          />
          <div>
            <div className="text-lg font-bold text-slate-900 font-display leading-tight">
              {orgSettings.orgName}
            </div>
            <div className="text-xs text-slate-500">Integrated Management System · Nairobi, Kenya</div>
          </div>
        </div>

        <div className="max-w-md my-12 space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-display text-balance">
              Stewardship, Training, and Organisational Clarity.
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Sign in with your verified organisational Google account to access finance, human resources,
              apprenticeship reporting, bookstore operations, projects, and governance workflows.
            </p>
          </div>

          {authError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">{authError}</div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-xl transition-colors shadow-sm"
            >
              <span className="flex items-center gap-2.5">
                <Lock className="w-4 h-4" />
                Sign in with Google Workspace
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-xs text-slate-500">
              Protected by role-based database rules, verified identity checks, and immutable audit logging under
              Kenya’s Data Protection Act.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-stone-200 text-xs">
            <div className="space-y-1">
              <Users className="w-4 h-4 text-emerald-800" />
              <div className="font-semibold text-slate-900">12 RBAC Roles</div>
              <div className="text-slate-500">Separation of duties</div>
            </div>
            <div className="space-y-1">
              <BookOpen className="w-4 h-4 text-emerald-800" />
              <div className="font-semibold text-slate-900">Apprentices & POS</div>
              <div className="text-slate-500">Offline-ready capture</div>
            </div>
            <div className="space-y-1">
              <Globe className="w-4 h-4 text-emerald-800" />
              <div className="font-semibold text-slate-900">KES · EAT</div>
              <div className="text-slate-500">Africa/Nairobi time</div>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
          <span>iServe Africa</span>
          <span aria-hidden="true">·</span>
          <span>{orgSettings.address || 'Ngong Road, Nairobi, Kenya'}</span>
          <span aria-hidden="true">·</span>
          <span>{orgSettings.fiscalYear}</span>
        </div>
      </div>

      {/* Right Editorial Campus Photography Panel */}
      <div className="hidden lg:block lg:col-span-6 relative overflow-hidden bg-slate-900">
        <img
          src="/src/assets/images/iserve_login_campus_1795437880878.jpg"
          alt="iServe Africa training centre courtyard in Nairobi"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent flex flex-col justify-end p-12 text-white">
          <div className="max-w-lg space-y-2">
            <div className="text-xs font-medium text-emerald-300">
              iServe Africa · Gospel Ministry & Servant Leadership
            </div>
            <p className="text-xl font-semibold font-display leading-snug text-balance">
              Equipping faithful servant leaders across Kenya and East Africa through transparent stewardship and
              connected ministry operations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
