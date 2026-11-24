import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Camera, Save, UserCheck, ShieldAlert } from 'lucide-react';
import { db } from '../../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../../lib/firestoreError.ts';
import { recordAuditLog } from '../../lib/audit.ts';
import { processDocumentUpload } from '../../lib/fileUpload.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { computeApprenticeLeaveSummary } from '../../lib/leaveUtils.ts';
import { StatusText } from '../ui/StatusText.tsx';
import { Apprentice, formatNairobiDate } from '../../types/erp.ts';

interface ApprenticeProfileSectionProps {
  apprenticeRecord: Apprentice | null;
}

export function ApprenticeProfileSection({ apprenticeRecord }: ApprenticeProfileSectionProps) {
  const { profile, effectiveRole, previewRole } = useAuth();
  const { leaveRequests, leavePolicy } = useData();

  const [email, setEmail] = useState(apprenticeRecord?.email || profile?.email || '');
  const [phone, setPhone] = useState(apprenticeRecord?.phone || profile?.phone || '');
  const [emergencyContact, setEmergencyContact] = useState(apprenticeRecord?.emergencyContact || '');
  const [photoDataUrl, setPhotoDataUrl] = useState(apprenticeRecord?.photoDataUrl || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(apprenticeRecord?.email || profile?.email || '');
    setPhone(apprenticeRecord?.phone || profile?.phone || '');
    setEmergencyContact(apprenticeRecord?.emergencyContact || '');
    setPhotoDataUrl(apprenticeRecord?.photoDataUrl || '');
  }, [apprenticeRecord, profile]);

  const uid = profile?.uid || '';
  const leaveSummary = computeApprenticeLeaveSummary({
    leaveRequests,
    leavePolicy,
    userId: uid,
    apprentice: apprenticeRecord,
  });

  const displayName = apprenticeRecord?.fullName || profile?.displayName || 'Apprentice';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'AP';

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setNotice(null);
    setUploadingPhoto(true);
    try {
      const processed = await processDocumentUpload(file, {
        allowPdf: false,
        allowImages: true,
        maxDataUrlLength: 330000,
        maxImageWidth: 640,
      });
      setPhotoDataUrl(processed.dataUrl);
      setNotice('Photo prepared. Click Save Profile Changes to update your profile.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process profile photograph.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setNotice(null);

    const cleanEmail = email.trim();
    const cleanPhone = phone.trim();
    const cleanEmergency = emergencyContact.trim();

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    if (!apprenticeRecord) {
      setError(
        previewRole
          ? 'No apprentice profile record is linked to your preview account yet.'
          : 'Your apprentice profile record has not been linked by HR yet. Please contact HR.'
      );
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, 'apprentices', apprenticeRecord.id), {
        email: cleanEmail,
        phone: cleanPhone,
        emergencyContact: cleanEmergency,
        photoDataUrl: photoDataUrl || '',
        updatedAt: serverTimestamp(),
      });

      if (apprenticeRecord.userId === profile.uid && cleanPhone !== (profile.phone || '')) {
        await updateDoc(doc(db, 'users', profile.uid), {
          phone: cleanPhone,
          updatedAt: serverTimestamp(),
        });
      }

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: effectiveRole,
        action: 'UPDATE_APPRENTICE_PROFILE',
        targetCollection: 'apprentices',
        targetId: apprenticeRecord.id,
        summary: `Updated apprentice contact profile (${apprenticeRecord.apprenticeCode})`,
      });

      setNotice('Profile contact details and photograph saved.');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, 'apprentices');
      } catch (e2) {
        setError(e2 instanceof Error ? e2.message : 'Unable to save profile changes.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 font-display">My Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          View your apprenticeship placement metadata and manage your contact details and profile photograph
        </p>
      </div>

      {!apprenticeRecord && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Apprentice Programme Record Not Linked</div>
            <p className="mt-0.5">
              {previewRole
                ? 'You are previewing the Apprentice Portal as Super Administrator. To test saving profile fields, link or open a user account with an Apprentice record.'
                : 'Your user account does not yet have a linked Apprentice profile record. Contact HR or your Supervisor to link your User ID in the Apprenticeships registry.'}
            </p>
          </div>
        </div>
      )}

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Identity & Programme Metadata (Read-only programme details) */}
        <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-5">
          <div className="flex flex-col items-center text-center space-y-3 pb-4 border-b border-stone-100">
            <div className="relative">
              {photoDataUrl ? (
                <img
                  src={photoDataUrl}
                  alt={displayName}
                  className="w-24 h-24 rounded-2xl object-cover border border-stone-200"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-[var(--brand-primary)] text-white text-2xl font-bold flex items-center justify-center">
                  {initials}
                </div>
              )}
              {apprenticeRecord && (
                <label className="absolute -bottom-2 -right-2 p-2 bg-white border border-stone-300 rounded-full shadow-sm cursor-pointer hover:bg-stone-50" title="Change profile photo">
                  <Camera className="w-4 h-4 text-slate-700" />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                    onChange={(e) => void handlePhotoUpload(e)}
                    className="sr-only"
                  />
                </label>
              )}
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900 font-display">{displayName}</h2>
              <div className="text-xs font-mono text-slate-500 mt-0.5">
                {apprenticeRecord?.apprenticeCode || 'Unassigned ID'}
              </div>
              <div className="mt-2 flex justify-center">
                <StatusText status={apprenticeRecord?.status || 'active'} />
              </div>
              {uploadingPhoto && <p className="text-[11px] text-emerald-800 mt-1">Compressing image...</p>}
            </div>
          </div>

          <dl className="space-y-2.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Cohort</dt>
              <dd className="font-medium text-slate-900 text-right">{apprenticeRecord?.cohortName || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Supervisor / RMS</dt>
              <dd className="font-medium text-slate-900 text-right">{apprenticeRecord?.supervisorName || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Region</dt>
              <dd className="font-medium text-slate-900 text-right">{apprenticeRecord?.region || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Training Location</dt>
              <dd className="font-medium text-slate-900 text-right">{apprenticeRecord?.trainingLocation || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Start Date</dt>
              <dd className="font-mono text-slate-900 text-right">
                {apprenticeRecord?.startDate ? formatNairobiDate(apprenticeRecord.startDate) : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Expected Completion</dt>
              <dd className="font-mono text-slate-900 text-right">
                {apprenticeRecord?.expectedCompletionDate
                  ? formatNairobiDate(apprenticeRecord.expectedCompletionDate)
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Annual Leave Remaining</dt>
              <dd className="font-mono font-semibold text-emerald-900 text-right tabular-nums">
                {leaveSummary.remainingLeaveDays} / {leaveSummary.totalEntitlement} days
              </dd>
            </div>
          </dl>

          {apprenticeRecord?.learningObjectives && (
            <div className="pt-3 border-t border-stone-100 space-y-1 text-xs">
              <div className="font-semibold text-slate-800">Learning Objectives</div>
              <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                {apprenticeRecord.learningObjectives}
              </p>
            </div>
          )}
        </section>

        {/* Right: Editable Contact Details */}
        <section className="lg:col-span-2 bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 font-display">
                Editable Contact &amp; Emergency Details
              </h2>
              <p className="text-xs text-slate-500">
                Cohort, supervisor, and enrolment dates are managed by HR and your Supervisor
              </p>
            </div>
            <UserCheck className="w-5 h-5 text-emerald-800 shrink-0" />
          </div>

          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  disabled
                  value={displayName}
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-slate-500 min-h-[42px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Apprentice ID</label>
                <input
                  type="text"
                  disabled
                  value={apprenticeRecord?.apprenticeCode || 'Pending Assignment'}
                  className="w-full px-3 py-2 text-sm font-mono bg-stone-50 border border-stone-200 rounded-lg text-slate-500 min-h-[42px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="apprentice@iserveafrica.org"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mobile Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +254 712 345 678"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Emergency Contact (Name, Relationship &amp; Phone)
              </label>
              <input
                type="text"
                maxLength={200}
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="e.g. Jane Kamau (Mother) · +254 722 000 111"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg min-h-[42px]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Profile Photograph (JPG or PNG)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-stone-50 hover:bg-stone-100 border border-stone-300 rounded-lg cursor-pointer min-h-[40px]">
                  <Camera className="w-4 h-4 text-emerald-800" />
                  {photoDataUrl ? 'Replace Photograph' : 'Upload Photograph'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                    onChange={(e) => void handlePhotoUpload(e)}
                    className="sr-only"
                  />
                </label>
                {photoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl('')}
                    className="text-xs text-red-700 hover:underline"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-stone-100 flex justify-end">
              <button
                type="submit"
                disabled={saving || uploadingPhoto || !apprenticeRecord}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-60 min-h-[44px]"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
