import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, QrCode, Share2 } from 'lucide-react';
import {
  Referral,
  REFERRAL_PRIORITIES,
  ReferralPriority,
} from '../types/referral';
import { RECEIVING_FACILITIES } from '../data/syntheticData';
import {
  generateNextSyntheticPatientCode,
  generateReferralQrSvg,
  validateSyntheticPatientCode,
} from '../core/referralEngine';

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
    priority: ReferralPriority;
  }) => Referral;
  onBackToDashboard: () => void;
}

export const CreateReferralView: React.FC<CreateReferralViewProps> = ({
  existingReferrals,
  defaultReferringFacility,
  activeQrReferral,
  onCreateReferral,
  onBackToDashboard,
}) => {
  const nextSuggestedCode = generateNextSyntheticPatientCode(existingReferrals);

  const [patientCode, setPatientCode] = useState<string>(nextSuggestedCode);
  const [receivingFacility, setReceivingFacility] = useState<string>(
    RECEIVING_FACILITIES[0]
  );
  const [priority, setPriority] = useState<ReferralPriority>('Urgent');
  const [formError, setFormError] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string>('');
  const [sharedFeedback, setSharedFeedback] = useState<boolean>(false);
  const [fullScreenQr, setFullScreenQr] = useState<boolean>(false);

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
      setFullScreenQr(false);
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
      setFormError(validation.error || 'Enter a synthetic code (e.g. SYN-007).');
      return;
    }

    try {
      onCreateReferral({
        patient_code: patientCode.trim().toUpperCase(),
        referring_facility: defaultReferringFacility || 'PHC Demo North',
        receiving_facility: receivingFacility,
        primary_category: 'General Referral',
        priority,
      });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not create referral.'
      );
    }
  };

  const handleShareOrShowQr = async () => {
    if (!activeQrReferral) return;
    setFullScreenQr(true);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(activeQrReferral.referral_id);
      }
    } catch {
      // Ignore clipboard permission errors
    }
    setSharedFeedback(true);
    setTimeout(() => setSharedFeedback(false), 3000);
  };

  // Immediately after creation: Show Referral ID, Large QR code, and Share/Show QR button
  if (activeQrReferral) {
    return (
      <div className="mx-auto max-w-md space-y-5">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors min-h-[40px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Referrals</span>
        </button>

        <div
          className={`rounded-2xl border bg-white text-center transition-all ${
            fullScreenQr
              ? 'border-teal-700 p-8 shadow-md'
              : 'border-slate-200/90 p-6 shadow-xs'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Referral ID
          </div>
          <div
            data-testid="generated-referral-id"
            className="mt-1 font-mono text-3xl font-bold text-teal-800 tabular-nums"
          >
            {activeQrReferral.referral_id}
          </div>
          <div className="mt-1 text-xs font-mono text-slate-600">
            Patient: {activeQrReferral.patient_code} ·{' '}
            {activeQrReferral.receiving_facility}
          </div>

          {/* Large QR Code */}
          <div className="my-6 flex justify-center">
            {qrSvg ? (
              <div
                data-testid="referral-qr-svg"
                className={`${
                  fullScreenQr ? 'w-72 h-72' : 'w-64 h-64'
                } bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full transition-all`}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="w-64 h-64 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-sm text-slate-500">
                Generating QR...
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleShareOrShowQr}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B5E5E] to-[#0F766E] px-6 py-4 text-base font-bold text-white shadow-xs hover:from-[#094D4D] hover:to-[#0D655E] transition-all min-h-[52px]"
          >
            {sharedFeedback ? (
              <>
                <Check className="w-5 h-5" />
                <span>Showing QR · ID Copied</span>
              </>
            ) : (
              <>
                <Share2 className="w-5 h-5" />
                <span>Share / Show QR</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Short 3-Field Form: Patient Code, Receiving Facility, Priority -> CREATE REFERRAL
  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          New Referral
        </h1>
        <button
          type="button"
          onClick={onBackToDashboard}
          className="text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[40px]"
        >
          Cancel
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-5"
      >
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-800"
          >
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {/* 1. Patient Code */}
        <div>
          <label
            htmlFor="patient-code-input"
            className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
          >
            Patient Code
          </label>
          <input
            id="patient-code-input"
            type="text"
            value={patientCode}
            onChange={(e) => setPatientCode(e.target.value.toUpperCase())}
            placeholder="SYN-007"
            required
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-base font-bold text-slate-900 focus:border-teal-700 focus:outline-none min-h-[48px]"
          />
        </div>

        {/* 2. Receiving Facility */}
        <div>
          <label
            htmlFor="receiving-facility-field"
            className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
          >
            Receiving Facility
          </label>
          <select
            id="receiving-facility-field"
            value={receivingFacility}
            onChange={(e) => setReceivingFacility(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-900 focus:border-teal-700 focus:outline-none min-h-[48px]"
          >
            {RECEIVING_FACILITIES.map((fac) => (
              <option key={fac} value={fac}>
                {fac}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Priority */}
        <div>
          <span className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
            Priority
          </span>
          <div className="grid grid-cols-3 gap-2.5">
            {REFERRAL_PRIORITIES.map((p) => {
              const isSelected = priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`rounded-xl border px-3 py-3 text-sm font-bold transition-all min-h-[48px] ${
                    isSelected
                      ? 'border-teal-800 bg-teal-800 text-white shadow-2xs'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        {/* CREATE REFERRAL */}
        <button
          type="submit"
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B5E5E] to-[#0F766E] px-6 py-4 text-base font-bold text-white shadow-xs hover:from-[#094D4D] hover:to-[#0D655E] transition-all min-h-[54px]"
        >
          <QrCode className="w-5 h-5" />
          <span>CREATE REFERRAL</span>
        </button>
      </form>
    </div>
  );
};
