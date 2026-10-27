import React, { useEffect, useState } from 'react';
import {
  QrCode,
  Share2,
  Printer,
  Plus,
  Check,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  REFERRAL_CATEGORIES,
  REFERRAL_PRIORITIES,
} from '../types/referral';
import type {
  Referral,
  ReferralCategory,
  ReferralPriority,
} from '../types/referral';
import {
  RECEIVING_FACILITIES,
  SYNTHETIC_PATIENT_CODES,
} from '../data/syntheticData';
import {
  generateNextSyntheticPatientCode,
  generateReferralQrSvg,
  getSubCategoriesForPrimary,
  validateSyntheticPatientCode,
} from '../core/referralEngine';
import { PriorityBadge, SyncStateBadge } from './ReferralTimelineCard';

interface CreateReferralViewProps {
  referringFacility: string;
  existingReferrals: Referral[];
  isOffline: boolean;
  onCreateReferral: (input: {
    patient_code: string;
    referring_facility: string;
    receiving_facility: string;
    primary_category: ReferralCategory;
    sub_category?: string;
    custom_note?: string;
    priority: ReferralPriority;
  }) => Referral;
  onDone: () => void;
  onShowQrModal: (referral: Referral) => void;
  onViewReferralDetail: (referral: Referral) => void;
}

export const CreateReferralView: React.FC<CreateReferralViewProps> = ({
  referringFacility,
  existingReferrals,
  isOffline,
  onCreateReferral,
  onDone,
  onShowQrModal,
  onViewReferralDetail,
}) => {
  const availableReceivingFacilities = RECEIVING_FACILITIES.filter(
    (f) => f.toLowerCase() !== referringFacility.toLowerCase()
  );

  const [patientCode, setPatientCode] = useState<string>(() =>
    generateNextSyntheticPatientCode(existingReferrals)
  );
  const [receivingFacility, setReceivingFacility] = useState<string>(
    availableReceivingFacilities[0] || RECEIVING_FACILITIES[0]
  );
  const [primaryCategory, setPrimaryCategory] = useState<string>(
    REFERRAL_CATEGORIES[0]
  );
  const [subCategory, setSubCategory] = useState<string>(
    getSubCategoriesForPrimary(REFERRAL_CATEGORIES[0])[0] || ''
  );
  const [priority, setPriority] = useState<ReferralPriority>('Urgent');
  const [customNote, setCustomNote] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [createdReferral, setCreatedReferral] = useState<Referral | null>(null);
  const [qrSvg, setQrSvg] = useState<string>('');
  const [copiedShare, setCopiedShare] = useState<boolean>(false);

  const subCategories = getSubCategoriesForPrimary(primaryCategory);

  useEffect(() => {
    const subs = getSubCategoriesForPrimary(primaryCategory);
    setSubCategory(subs[0] || '');
  }, [primaryCategory]);

  useEffect(() => {
    if (!createdReferral) {
      setQrSvg('');
      return;
    }
    let active = true;
    generateReferralQrSvg(createdReferral)
      .then((svg) => {
        if (active) setQrSvg(svg);
      })
      .catch(() => {
        if (active) setQrSvg('');
      });
    return () => {
      active = false;
    };
  }, [createdReferral]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;
    setValidationError(null);

    const check = validateSyntheticPatientCode(patientCode);
    if (!check.valid) {
      setValidationError(
        check.error ||
          'Invalid synthetic patient ID. Use format SYN-001 through SYN-999.'
      );
      return;
    }

    setIsGenerating(true);
    try {
      const record = onCreateReferral({
        patient_code: patientCode.trim().toUpperCase(),
        referring_facility: referringFacility,
        receiving_facility: receivingFacility,
        primary_category: primaryCategory,
        sub_category: subCategory || undefined,
        custom_note: customNote.trim() || undefined,
        priority,
      });
      setCreatedReferral(record);
    } catch (err) {
      setValidationError(
        err instanceof Error
          ? err.message
          : 'Could not generate referral. Please verify all fields.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!createdReferral) return;
    const text = `Xareloop Referral ${createdReferral.referral_id} | Synthetic Patient: ${createdReferral.patient_code} | ${createdReferral.referring_facility} → ${createdReferral.receiving_facility} | Priority: ${createdReferral.priority}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Xareloop Referral ${createdReferral.referral_id}`,
          text,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const handleCreateAnother = () => {
    const nextCode = generateNextSyntheticPatientCode([
      ...(createdReferral ? [createdReferral] : []),
      ...existingReferrals,
    ]);
    setPatientCode(nextCode);
    setCustomNote('');
    setValidationError(null);
    setCreatedReferral(null);
  };

  // Generated Referral Slip Screen (Step 3 Result)
  if (createdReferral) {
    return (
      <div
        data-testid="created-referral-slip"
        className="bg-[#FFFFFF] rounded-2xl border-2 border-[#E2E8F0] p-6 space-y-6 text-center shadow-xs"
      >
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DDF7F4] border border-[#085E56] text-[#031B4E] text-xs font-extrabold">
            <CheckCircle2 className="w-4 h-4 text-[#085E56]" aria-hidden="true" />
            <span>✓ Xareloop Referral Generated</span>
          </span>
          <SyncStateBadge syncStatus={createdReferral.sync_status} />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-extrabold uppercase tracking-wider text-[#475569]">
            Referral ID
          </p>
          <p
            data-testid="created-referral-id"
            className="text-3xl font-mono font-extrabold text-[#062B78] tracking-tight"
          >
            {createdReferral.referral_id}
          </p>
          <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
            <span className="text-xs font-bold text-[#10213F] bg-[#F7F9FC] px-2.5 py-1 rounded-lg border border-[#CBD5E1] font-mono">
              Synthetic Patient: {createdReferral.patient_code}
            </span>
            <PriorityBadge priority={createdReferral.priority} />
          </div>
          <p className="text-xs font-bold text-[#475569] pt-1">
            {createdReferral.referring_facility} →{' '}
            <span className="text-[#031B4E] font-extrabold">
              {createdReferral.receiving_facility}
            </span>
          </p>
        </div>

        {/* High-contrast QR Code */}
        <div className="flex justify-center">
          <div
            data-testid="created-qr-box"
            className="p-5 bg-[#FFFFFF] border-2 border-[#062B78] rounded-2xl inline-flex items-center justify-center min-w-[230px] min-h-[230px] shadow-xs"
          >
            {qrSvg ? (
              <div
                className="w-52 h-52 [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="text-xs font-bold text-[#475569]">
                Generating QR…
              </div>
            )}
          </div>
        </div>

        {/* Required Actions: Show QR, Share, Print, Create Another */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => onShowQrModal(createdReferral)}
            data-testid="slip-show-qr-button"
            className="py-3 px-3 min-h-[44px] rounded-xl bg-[#062B78] hover:bg-[#031B4E] text-[#FFFFFF] font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-[#10B9A8]" aria-hidden="true" />
            <span>Show QR</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            data-testid="slip-share-button"
            className="py-3 px-3 min-h-[44px] rounded-xl border-2 border-[#062B78] bg-[#FFFFFF] text-[#062B78] font-extrabold text-xs flex items-center justify-center gap-1.5 hover:bg-[#EFF6FF] transition-colors cursor-pointer"
          >
            {copiedShare ? (
              <>
                <Check className="w-4 h-4 text-[#085E56]" aria-hidden="true" />
                <span>✓ Copied</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-[#062B78]" aria-hidden="true" />
                <span>Share</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            data-testid="slip-print-button"
            className="py-3 px-3 min-h-[44px] rounded-xl border-2 border-[#062B78] bg-[#FFFFFF] text-[#062B78] font-extrabold text-xs flex items-center justify-center gap-1.5 hover:bg-[#EFF6FF] transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#062B78]" aria-hidden="true" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={handleCreateAnother}
            data-testid="slip-create-another-button"
            className="py-3 px-3 min-h-[44px] rounded-xl bg-[#DDF7F4] hover:bg-[#c5f0eb] text-[#031B4E] border border-[#085E56] font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#085E56]" aria-hidden="true" />
            <span>Create Another</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E2E8F0]">
          <button
            type="button"
            onClick={onDone}
            className="py-2.5 px-4 min-h-[44px] rounded-xl text-xs font-extrabold text-[#475569] hover:text-[#10213F] hover:bg-[#F7F9FC] cursor-pointer"
          >
            ← Back to Dashboard
          </button>

          <button
            type="button"
            onClick={() => onViewReferralDetail(createdReferral)}
            data-testid="slip-view-detail-button"
            className="py-2.5 px-4 min-h-[44px] rounded-xl bg-[#F7F9FC] hover:bg-[#E2E8F0] text-[#062B78] border border-[#CBD5E1] text-xs font-extrabold cursor-pointer"
          >
            View Referral Detail →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFFFF] rounded-2xl border border-[#E2E8F0] p-5 sm:p-6 space-y-6 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
        <div>
          <span className="text-xs font-extrabold uppercase tracking-wider text-[#062B78]">
            Referring Facility: {referringFacility}
          </span>
          <h2 className="text-lg font-extrabold text-[#031B4E] mt-0.5">
            Create Clinical Referral
          </h2>
        </div>

        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-[#94A3B8] text-xs font-extrabold text-[#10213F] hover:bg-[#F7F9FC] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#062B78]" aria-hidden="true" />
          <span>Back</span>
        </button>
      </div>

      {/* Stepper Indicator */}
      <div
        aria-label="Referral Creation Steps"
        className="grid grid-cols-3 gap-2 p-2 rounded-xl bg-[#F7F9FC] border border-[#E2E8F0] text-xs font-extrabold text-center"
      >
        <div className="py-2 px-2 rounded-lg bg-[#062B78] text-[#FFFFFF]">
          Step 1 — Patient
        </div>
        <div className="py-2 px-2 rounded-lg bg-[#DDF7F4] text-[#031B4E] border border-[#085E56]">
          Step 2 — Referral
        </div>
        <div className="py-2 px-2 rounded-lg bg-[#FFFFFF] text-[#10213F] border border-[#CBD5E1]">
          Step 3 — Generate
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* STEP 1 — PATIENT */}
        <section
          aria-labelledby="step-1-heading"
          className="p-4 rounded-xl bg-[#F7F9FC] border border-[#CBD5E1] space-y-3"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3
              id="step-1-heading"
              className="text-xs font-extrabold uppercase tracking-wider text-[#062B78]"
            >
              Step 1 — Synthetic Patient ID
            </h3>
            <span className="text-[11px] font-bold text-[#085E56] bg-[#DDF7F4] px-2 py-0.5 rounded border border-[#085E56]">
              Synthetic Only • No PII
            </span>
          </div>

          <div className="flex gap-2">
            <input
              id="patient-code-input"
              data-testid="patient-code-input"
              type="text"
              required
              value={patientCode}
              onChange={(e) => {
                setPatientCode(e.target.value.toUpperCase());
                setValidationError(null);
              }}
              placeholder="e.g. SYN-007"
              className="flex-1 px-3.5 py-3 min-h-[46px] rounded-xl border border-[#94A3B8] text-sm font-mono font-extrabold text-[#10213F] bg-[#FFFFFF] uppercase focus:outline-none focus:border-[#0878F9]"
            />
            <button
              type="button"
              onClick={() => {
                setPatientCode(
                  generateNextSyntheticPatientCode(existingReferrals)
                );
                setValidationError(null);
              }}
              className="px-3.5 py-2.5 min-h-[46px] rounded-xl bg-[#FFFFFF] border border-[#062B78] text-[#062B78] text-xs font-extrabold hover:bg-[#EFF6FF] inline-flex items-center gap-1.5 cursor-pointer"
              title="Auto-assign next available synthetic patient ID"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#0878F9]" aria-hidden="true" />
              <span>Next ID</span>
            </button>
          </div>

          {/* Quick-tap synthetic patient IDs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-[#475569] mr-1">
              Quick Select:
            </span>
            {SYNTHETIC_PATIENT_CODES.slice(0, 6).map((code) => {
              const isSelected = patientCode.trim().toUpperCase() === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setPatientCode(code);
                    setValidationError(null);
                  }}
                  className={`px-2.5 py-1 min-h-[32px] rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#062B78] text-[#FFFFFF] border-[#031B4E]'
                      : 'bg-[#FFFFFF] text-[#10213F] border-[#94A3B8] hover:border-[#062B78]'
                  }`}
                >
                  {isSelected ? `✓ ${code}` : code}
                </button>
              );
            })}
          </div>
        </section>

        {/* STEP 2 — REFERRAL */}
        <section
          aria-labelledby="step-2-heading"
          className="p-4 rounded-xl bg-[#F7F9FC] border border-[#CBD5E1] space-y-4"
        >
          <h3
            id="step-2-heading"
            className="text-xs font-extrabold uppercase tracking-wider text-[#062B78]"
          >
            Step 2 — Referral Details
          </h3>

          {/* Receiving Facility */}
          <div>
            <label
              htmlFor="receiving-facility-select"
              className="block text-xs font-extrabold text-[#10213F] mb-1.5"
            >
              Receiving Facility
            </label>
            <select
              id="receiving-facility-select"
              data-testid="receiving-facility-select"
              value={receivingFacility}
              onChange={(e) => setReceivingFacility(e.target.value)}
              className="w-full px-3.5 py-3 min-h-[46px] rounded-xl border border-[#94A3B8] text-sm font-bold text-[#10213F] bg-[#FFFFFF] focus:outline-none focus:border-[#0878F9]"
            >
              {availableReceivingFacilities.map((fac) => (
                <option key={fac} value={fac}>
                  {fac}
                </option>
              ))}
            </select>
          </div>

          {/* Clinical Category & Sub-category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="clinical-category-select"
                className="block text-xs font-extrabold text-[#10213F] mb-1.5"
              >
                Clinical Category
              </label>
              <select
                id="clinical-category-select"
                data-testid="clinical-category-select"
                value={primaryCategory}
                onChange={(e) => setPrimaryCategory(e.target.value)}
                className="w-full px-3.5 py-3 min-h-[46px] rounded-xl border border-[#94A3B8] text-sm font-bold text-[#10213F] bg-[#FFFFFF] focus:outline-none focus:border-[#0878F9]"
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
                htmlFor="clinical-subcategory-select"
                className="block text-xs font-extrabold text-[#10213F] mb-1.5"
              >
                Clinical Indication
              </label>
              <select
                id="clinical-subcategory-select"
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                className="w-full px-3.5 py-3 min-h-[46px] rounded-xl border border-[#94A3B8] text-sm font-bold text-[#10213F] bg-[#FFFFFF] focus:outline-none focus:border-[#0878F9]"
              >
                {subCategories.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority Selection (Icon + Symbol + Text + Accessible Color) */}
          <div>
            <span className="block text-xs font-extrabold text-[#10213F] mb-1.5">
              Priority (Text + Icon + Color)
            </span>
            <div
              className="grid grid-cols-3 gap-2.5"
              role="radiogroup"
              aria-label="Referral Priority"
            >
              {REFERRAL_PRIORITIES.map((level) => {
                const selected = priority === level;
                const prefix =
                  level === 'Emergency'
                    ? '! '
                    : level === 'Urgent'
                      ? '⚠ '
                      : '✓ ';
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`priority-option-${level}`}
                    onClick={() => setPriority(level)}
                    className={`py-3 px-3 min-h-[46px] rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer ${
                      selected
                        ? level === 'Emergency'
                          ? 'bg-[#991B1B] text-[#FFFFFF] border-[#7F1D1D]'
                          : level === 'Urgent'
                            ? 'bg-[#92400E] text-[#FFFFFF] border-[#78350F]'
                            : 'bg-[#062B78] text-[#FFFFFF] border-[#031B4E]'
                        : 'bg-[#FFFFFF] text-[#10213F] border-[#94A3B8] hover:bg-[#F7F9FC]'
                    }`}
                  >
                    {prefix}
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Synthetic Handover Note */}
          <div>
            <label
              htmlFor="handover-note-input"
              className="block text-xs font-extrabold text-[#10213F] mb-1.5"
            >
              Clinical Handover Note (Optional — No PII)
            </label>
            <input
              id="handover-note-input"
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Initial stabilization completed at PHC"
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#94A3B8] text-xs font-medium text-[#10213F] bg-[#FFFFFF] focus:outline-none focus:border-[#0878F9]"
            />
          </div>
        </section>

        {validationError && (
          <div
            data-testid="create-referral-error"
            role="alert"
            className="p-3.5 rounded-xl bg-[#FEF2F2] border-2 border-[#DC2626] text-[#991B1B] text-xs font-bold flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" aria-hidden="true" />
            <span>! {validationError}</span>
          </div>
        )}

        {/* STEP 3 — GENERATE */}
        <section className="space-y-2.5">
          <button
            type="submit"
            disabled={isGenerating}
            data-testid="submit-create-referral"
            className="w-full py-4 px-5 min-h-[52px] rounded-xl bg-[#062B78] hover:bg-[#031B4E] disabled:opacity-60 text-[#FFFFFF] font-extrabold text-base shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-[#10B9A8]" aria-hidden="true" />
                <span>Generating referral…</span>
              </>
            ) : (
              <>
                <QrCode className="w-5 h-5 text-[#10B9A8]" aria-hidden="true" />
                <span>
                  Step 3 — Generate Referral {isOffline ? '(Save Offline)' : ''}
                </span>
              </>
            )}
          </button>
        </section>
      </form>
    </div>
  );
};
