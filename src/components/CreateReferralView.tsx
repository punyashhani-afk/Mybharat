import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CloudOff,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import {
  PRIMARY_CATEGORIES_MAP,
  PrimaryReferralCategory,
  Referral,
  REFERRAL_CATEGORIES,
  REFERRAL_PRIORITIES,
  ReferralPriority,
} from '../types/referral';
import {
  RECEIVING_FACILITIES,
  REFERRING_FACILITIES,
  SYNTHETIC_PATIENT_CODES,
} from '../data/syntheticData';
import {
  formatReferralCategoryLabel,
  generateReferralQrSvg,
  getSubCategoriesForPrimary,
  validateSyntheticPatientCode,
} from '../core/referralEngine';
import { formatShortTimestamp } from './ReferralTimelineCard';

interface CreateReferralViewProps {
  existingReferrals: Referral[];
  defaultReferringFacility: string;
  activeQrReferral: Referral | null;
  onClearActiveQrReferral: () => void;
  onCreateReferral: (input: {
    patient_code: string;
    referring_facility: string;
    receiving_facility: string;
    primary_category: string;
    sub_category?: string;
    priority: ReferralPriority;
  }) => Referral;
  onOpenInReceiving: (referralId: string) => void;
  onBackToDashboard: () => void;
}

export const CreateReferralView: React.FC<CreateReferralViewProps> = ({
  existingReferrals,
  defaultReferringFacility,
  activeQrReferral,
  onClearActiveQrReferral,
  onCreateReferral,
  onOpenInReceiving,
  onBackToDashboard,
}) => {
  // Pick next unused synthetic code by default
  const usedCodes = new Set(
    existingReferrals.map((r) => r.patient_code.toUpperCase())
  );
  const nextSuggestedCode =
    SYNTHETIC_PATIENT_CODES.find((c) => !usedCodes.has(c)) || 'SYN-007';

  const [patientCode, setPatientCode] = useState<string>(nextSuggestedCode);
  const [referringFacility, setReferringFacility] = useState<string>(
    REFERRING_FACILITIES.includes(
      defaultReferringFacility as (typeof REFERRING_FACILITIES)[number]
    )
      ? defaultReferringFacility
      : REFERRING_FACILITIES[0]
  );
  const [receivingFacility, setReceivingFacility] = useState<string>(
    RECEIVING_FACILITIES[0]
  );
  const [primaryCategory, setPrimaryCategory] =
    useState<PrimaryReferralCategory>('Obstetrics');
  const [subCategory, setSubCategory] = useState<string>(
    PRIMARY_CATEGORIES_MAP['Obstetrics'][0]
  );
  const [priority, setPriority] = useState<ReferralPriority>('Urgent');
  const [formError, setFormError] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string>('');

  const availableSubCategories = getSubCategoriesForPrimary(primaryCategory);

  const handlePrimaryCategoryChange = (newPrimary: PrimaryReferralCategory) => {
    setPrimaryCategory(newPrimary);
    const subs = getSubCategoriesForPrimary(newPrimary);
    setSubCategory(subs[0] || '');
  };

  useEffect(() => {
    let mounted = true;
    if (activeQrReferral) {
      generateReferralQrSvg(activeQrReferral)
        .then((svg) => {
          if (mounted) setQrSvg(svg);
        })
        .catch(() => {
          if (mounted) setQrSvg('');
        });
    } else {
      setQrSvg('');
    }
    return () => {
      mounted = false;
    };
  }, [activeQrReferral]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validation = validateSyntheticPatientCode(patientCode);
    if (!validation.valid) {
      setFormError(validation.error || 'Invalid synthetic patient code.');
      return;
    }

    try {
      onCreateReferral({
        patient_code: patientCode.trim().toUpperCase(),
        referring_facility: referringFacility,
        receiving_facility: receivingFacility,
        primary_category: primaryCategory,
        sub_category: subCategory || undefined,
        priority,
      });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not create referral.'
      );
    }
  };

  // Screen 3: Referral QR & Short ID Handover View
  if (activeQrReferral) {
    const isOffline = activeQrReferral.sync_status === 'Saved offline';
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Referring Dashboard</span>
          </button>

          <button
            type="button"
            onClick={onClearActiveQrReferral}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px]"
          >
            + Create Another Referral
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <QrCode className="w-4 h-4 text-teal-700" />
                <span className="font-semibold text-teal-800">
                  Referral Handover Slip & QR Code
                </span>
                <span aria-hidden="true">·</span>
                {isOffline ? (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                    <CloudOff className="w-3.5 h-3.5" />
                    Saved offline
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Synced
                  </span>
                )}
              </div>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">
                Short Referral ID:{' '}
                <span
                  data-testid="generated-referral-id"
                  className="font-mono text-teal-800 tabular-nums"
                >
                  {activeQrReferral.referral_id}
                </span>
              </h1>
            </div>

            <div className="text-right font-mono text-xs text-slate-500 tabular-nums">
              <div>Created {formatShortTimestamp(activeQrReferral.created_at)}</div>
              <div>Patient Code: {activeQrReferral.patient_code}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* QR Code Display Box */}
            <div className="md:col-span-5 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-5">
              {qrSvg ? (
                <div
                  data-testid="referral-qr-svg"
                  className="w-52 h-52 bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <div className="w-52 h-52 bg-white p-4 rounded-lg border border-slate-200 flex items-center justify-center text-xs text-slate-500">
                  Generating QR...
                </div>
              )}
              <div className="mt-3 text-center">
                <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {activeQrReferral.referral_id}
                </div>
                <p className="text-xs text-slate-500">
                  Scan at receiving facility or enter short ID
                </p>
              </div>
            </div>

            {/* Referral Details & Next Step Action */}
            <div className="md:col-span-7 space-y-4">
              <dl className="divide-y divide-slate-100 text-sm">
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Synthetic Patient Code</dt>
                  <dd className="font-mono font-bold text-slate-900">
                    {activeQrReferral.patient_code}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Referring Facility</dt>
                  <dd className="font-semibold text-slate-900">
                    {activeQrReferral.referring_facility}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Receiving Facility</dt>
                  <dd className="font-semibold text-slate-900">
                    {activeQrReferral.receiving_facility}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Clinical Category</dt>
                  <dd className="font-semibold text-slate-900 text-right">
                    {activeQrReferral.referral_category}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Priority Level</dt>
                  <dd
                    className={`font-semibold ${
                      activeQrReferral.priority === 'Emergency'
                        ? 'text-red-700'
                        : activeQrReferral.priority === 'Urgent'
                          ? 'text-amber-700'
                          : 'text-slate-800'
                    }`}
                  >
                    {activeQrReferral.priority}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Current Status</dt>
                  <dd className="font-bold text-teal-800">
                    {activeQrReferral.current_status}
                  </dd>
                </div>
              </dl>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    onOpenInReceiving(activeQrReferral.referral_id)
                  }
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 transition-colors min-h-[48px]"
                >
                  <span>Open in Receiving Facility</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Screen 2: Create Referral Form
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Create Outbound Referral (PHC / CHC)
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Generate a unique short referral ID and scannable QR code using
          synthetic patient codes only.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
      >
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-800"
          >
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {/* Synthetic Patient Code Selection & Input */}
        <div>
          <label
            htmlFor="patient-code-input"
            className="block text-xs font-bold text-slate-800"
          >
            Synthetic Patient Code (Strictly SYN-XXX format)
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            Never enter real names, phone numbers, ABHA numbers, or addresses.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="patient-code-input"
              type="text"
              value={patientCode}
              onChange={(e) => setPatientCode(e.target.value.toUpperCase())}
              placeholder="e.g. SYN-007"
              required
              className="flex-1 min-w-[160px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm font-semibold text-slate-900 focus:border-teal-700 focus:outline-none min-h-[44px]"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {['SYN-007', 'SYN-008', 'SYN-009', 'SYN-010'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPatientCode(preset)}
                  className={`rounded-lg border px-3 py-2 font-mono text-xs font-semibold transition-colors min-h-[44px] ${
                    patientCode === preset
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Referring & Receiving Facilities */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="referring-facility-field"
              className="block text-xs font-bold text-slate-800"
            >
              Referring PHC / CHC Facility
            </label>
            <select
              id="referring-facility-field"
              value={referringFacility}
              onChange={(e) => setReferringFacility(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none min-h-[44px]"
            >
              {REFERRING_FACILITIES.map((fac) => (
                <option key={fac} value={fac}>
                  {fac}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="receiving-facility-field"
              className="block text-xs font-bold text-slate-800"
            >
              Receiving Higher-Level Facility
            </label>
            <select
              id="receiving-facility-field"
              value={receivingFacility}
              onChange={(e) => setReceivingFacility(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none min-h-[44px]"
            >
              {RECEIVING_FACILITIES.map((fac) => (
                <option key={fac} value={fac}>
                  {fac}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Hierarchical Referral Categories: Primary Category + Optional Sub-Category */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div>
            <label
              htmlFor="primary-category-select"
              className="block text-xs font-bold text-slate-800"
            >
              Primary Referral Category
            </label>
            <select
              id="primary-category-select"
              value={primaryCategory}
              onChange={(e) =>
                handlePrimaryCategoryChange(
                  e.target.value as PrimaryReferralCategory
                )
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-teal-700 focus:outline-none min-h-[44px]"
            >
              {REFERRAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="sub-category-select"
              className="block text-xs font-bold text-slate-800"
            >
              Detailed Sub-Category (Optional Context for Receiving Facility)
            </label>
            <select
              id="sub-category-select"
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none min-h-[44px]"
            >
              <option value="">None (Primary category only)</option>
              {availableSubCategories.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              Recorded referral classification:{' '}
              <strong className="text-slate-800">
                {formatReferralCategoryLabel(primaryCategory, subCategory)}
              </strong>
            </p>
          </div>
        </div>

        {/* Priority Selection */}
        <div>
          <span className="block text-xs font-bold text-slate-800 mb-2">
            Referral Priority
          </span>
          <div className="grid grid-cols-3 gap-3">
            {REFERRAL_PRIORITIES.map((p) => {
              const isSelected = priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`rounded-lg border px-4 py-3 text-xs font-bold transition-colors min-h-[48px] ${
                    isSelected
                      ? p === 'Emergency'
                        ? 'border-red-700 bg-red-50 text-red-900'
                        : p === 'Urgent'
                          ? 'border-amber-700 bg-amber-50 text-amber-900'
                          : 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit CTA */}
        <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
            <span>Synthetic patient validation active</span>
          </div>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors min-h-[48px]"
          >
            <QrCode className="w-4 h-4" />
            <span>Generate Referral & QR Code</span>
          </button>
        </div>
      </form>
    </div>
  );
};
