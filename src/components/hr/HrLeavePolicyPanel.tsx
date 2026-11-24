import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CalendarDays, Plus, Save, Trash2 } from 'lucide-react';
import { ORG_ID, db } from '../../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../../lib/firestoreError.ts';
import { recordAuditLog } from '../../lib/audit.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';

export function HrLeavePolicyPanel() {
  const { profile, effectiveRole } = useAuth();
  const { leavePolicy } = useData();

  const [leaveYear, setLeaveYear] = useState(leavePolicy?.leaveYear || String(new Date().getFullYear()));
  const [entitlement, setEntitlement] = useState(String(leavePolicy?.apprenticeAnnualEntitlementDays ?? 10));
  const [carryForwardEnabled, setCarryForwardEnabled] = useState(Boolean(leavePolicy?.carryForwardEnabled));
  const [maxCarryForward, setMaxCarryForward] = useState(String(leavePolicy?.maxCarryForwardDays ?? 0));
  const [holidays, setHolidays] = useState<string[]>(leavePolicy?.publicHolidays || []);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leavePolicy) return;
    setLeaveYear(leavePolicy.leaveYear);
    setEntitlement(String(leavePolicy.apprenticeAnnualEntitlementDays));
    setCarryForwardEnabled(leavePolicy.carryForwardEnabled);
    setMaxCarryForward(String(leavePolicy.maxCarryForwardDays));
    setHolidays(leavePolicy.publicHolidays || []);
  }, [leavePolicy]);

  const isHRManager = ['super_admin', 'executive_director', 'senior_management', 'hr_officer'].includes(
    effectiveRole
  );

  const addHoliday = () => {
    if (!newHolidayDate) return;
    if (holidays.includes(newHolidayDate)) return;
    if (holidays.length >= 40) {
      setError('Maximum 40 public holidays can be configured.');
      return;
    }
    setError(null);
    setHolidays((prev) => [...prev, newHolidayDate].sort());
    setNewHolidayDate('');
  };

  const removeHoliday = (date: string) => {
    setHolidays((prev) => prev.filter((d) => d !== date));
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !isHRManager) return;
    setError(null);
    setNotice(null);

    const entNum = Number(entitlement);
    const maxCfNum = Number(maxCarryForward || 0);

    if (!leaveYear.trim() || leaveYear.trim().length < 4) {
      setError('Enter a valid leave year (e.g. 2026).');
      return;
    }
    if (!Number.isFinite(entNum) || entNum < 1 || entNum > 60) {
      setError('Apprentice annual leave entitlement must be between 1 and 60 days.');
      return;
    }
    if (!Number.isFinite(maxCfNum) || maxCfNum < 0 || maxCfNum > 30) {
      setError('Max carry-forward days must be between 0 and 30.');
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'leaveSettings', 'default'), {
        orgId: ORG_ID,
        leaveYear: leaveYear.trim(),
        apprenticeAnnualEntitlementDays: entNum,
        carryForwardEnabled,
        maxCarryForwardDays: carryForwardEnabled ? maxCfNum : 0,
        publicHolidays: holidays,
        updatedBy: profile.displayName,
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: effectiveRole,
        action: 'UPDATE_LEAVE_POLICY',
        targetCollection: 'leaveSettings',
        targetId: 'default',
        summary: `Updated Apprentice Leave Policy (Year: ${leaveYear.trim()}, Entitlement: ${entNum} d, Holidays: ${holidays.length})`,
      });

      setNotice('Leave year, carry-forward policy, and public holiday calendar saved.');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, 'leaveSettings/default');
      } catch (e2) {
        setError(e2 instanceof Error ? e2.message : 'Unable to save leave policy.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isHRManager) return null;

  return (
    <form onSubmit={(e) => void handleSavePolicy(e)} className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-emerald-800" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 font-display">
              Apprentice Leave Policy &amp; Working-Day Holiday Calendar
            </h2>
            <p className="text-xs text-slate-500">
              Weekends and configured public holidays are excluded automatically when apprentices apply for leave
            </p>
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-60"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving...' : 'Save Leave Policy'}
        </button>
      </div>

      {notice && <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">{notice}</div>}
      {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Active Leave Year</label>
          <input
            type="text"
            required
            maxLength={16}
            value={leaveYear}
            onChange={(e) => setLeaveYear(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono border border-stone-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Apprentice Annual Days</label>
          <input
            type="number"
            min={1}
            max={60}
            required
            value={entitlement}
            onChange={(e) => setEntitlement(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono border border-stone-300 rounded-lg"
          />
        </div>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={carryForwardEnabled}
              onChange={(e) => setCarryForwardEnabled(e.target.checked)}
            />
            Allow Annual Leave Carry-Forward
          </label>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Max Carry-Forward Days</label>
          <input
            type="number"
            min={0}
            max={30}
            disabled={!carryForwardEnabled}
            value={carryForwardEnabled ? maxCarryForward : '0'}
            onChange={(e) => setMaxCarryForward(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono border border-stone-300 rounded-lg disabled:bg-stone-50"
          />
        </div>
      </div>

      {/* Public Holiday Dates */}
      <div className="space-y-2 pt-2 border-t border-stone-100">
        <label className="block text-xs font-medium text-slate-700">
          Configured Public Holidays ({holidays.length})
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={newHolidayDate}
            onChange={(e) => setNewHolidayDate(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono border border-stone-300 rounded-lg"
          />
          <button
            type="button"
            onClick={addHoliday}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-800 bg-stone-50 hover:bg-stone-100 border border-stone-300 rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Public Holiday
          </button>
        </div>

        {holidays.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {holidays.map((d) => (
              <div
                key={d}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-stone-50 border border-stone-200 rounded-md text-slate-700"
              >
                <span>{d}</span>
                <button
                  type="button"
                  onClick={() => removeHoliday(d)}
                  className="text-slate-400 hover:text-red-700"
                  aria-label={`Remove holiday ${d}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}
