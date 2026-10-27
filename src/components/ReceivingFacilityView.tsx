import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import {
  QrCode,
  Check,
  Lock,
  Vibrate,
  Upload,
  Search,
  AlertCircle,
  ArrowLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import type {
  Referral,
  ReferralStatus,
  StatusEvent,
  UserAccount,
} from '../types/referral';
import {
  buildReferralQrPayload,
  getValidNextStatuses,
  triggerHapticFeedback,
  validateXareloopQrPayload,
} from '../core/referralEngine';
import {
  formatShortTimestamp,
  PriorityBadge,
  ReferralTimelineCard,
  StatusBadge,
  SyncStateBadge,
} from './ReferralTimelineCard';
import { QrCameraScannerModal } from './QrCameraScannerModal';

interface ReceivingFacilityViewProps {
  mode: 'scan' | 'search';
  currentUser: UserAccount;
  referrals: Referral[];
  events: StatusEvent[];
  selectedReferral: Referral | null;
  canUpdateStatus: boolean;
  onSelectReferral: (referral: Referral | null) => void;
  onUpdateStatus: (params: {
    referral_id: string;
    facility_id: string;
    status: ReferralStatus;
  }) => void;
  onScanQrPayload: (rawPayload: string) => Referral | null;
  onShowQrModal: (referral: Referral) => void;
  onOpenAuthModal: () => void;
  onBackToDashboard?: () => void;
}

const STATUS_BUTTON_LABELS: Record<ReferralStatus, string> = {
  Referred: 'REFERRED',
  Arrived: 'ARRIVED',
  Seen: 'SEEN',
  Treated: 'TREATED',
  'Follow-up': 'FOLLOW-UP',
  'Back-referred': 'BACK-REFERRED',
};

export const ReceivingFacilityView: React.FC<ReceivingFacilityViewProps> = ({
  mode,
  currentUser,
  referrals,
  events,
  selectedReferral,
  canUpdateStatus,
  onSelectReferral,
  onUpdateStatus,
  onScanQrPayload,
  onShowQrModal,
  onOpenAuthModal,
  onBackToDashboard,
}) => {
  const [referralIdInput, setReferralIdInput] = useState<string>('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState<boolean>(false);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState<boolean>(false);
  const [isSavingStatus, setIsSavingStatus] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectedReferral) {
      setReferralIdInput(selectedReferral.referral_id);
      setLookupError(null);
    }
  }, [selectedReferral]);

  const handleFindReferral = (e: React.FormEvent) => {
    e.preventDefault();
    const query = referralIdInput.trim();
    if (!query || isLookingUp) return;

    setIsLookingUp(true);
    setLookupError(null);

    const validation = validateXareloopQrPayload(query);
    if (!validation.valid) {
      setIsLookingUp(false);
      setLookupError(
        validation.errorMessage ||
          ` Referral "${query.toUpperCase()}" is not a valid Xareloop Referral ID (format XL-1001).`
      );
      return;
    }

    const found = onScanQrPayload(query);
    setIsLookingUp(false);

    if (found) {
      onSelectReferral(found);
      setLookupError(null);
      setFeedbackNotice(
        `✓ Referral ${found.referral_id} (Patient ${found.patient_code}) loaded & synced`
      );
    } else {
      setLookupError(
        `No referral found matching "${query.toUpperCase()}". Please verify the Referral ID (e.g. XL-1001) or scan the patient's QR slip.`
      );
    }
  };

  const handleCameraScanSuccess = (decodedValue: string) => {
    setIsCameraScannerOpen(false);
    const validation = validateXareloopQrPayload(decodedValue);
    if (!validation.valid) {
      setLookupError(
        validation.errorMessage ||
          'Invalid QR code scanned. Please scan a valid Xareloop referral slip.'
      );
      return;
    }

    const found = onScanQrPayload(decodedValue);
    if (found) {
      onSelectReferral(found);
      setReferralIdInput(found.referral_id);
      setLookupError(null);
      setFeedbackNotice(
        `✓ QR Scanned & Synced: Referral ${found.referral_id} (${found.patient_code})`
      );
    } else {
      setLookupError(
        `Scanned QR code "${validation.referralId || decodedValue}" was not found in active referrals.`
      );
    }
  };

  const handleUploadQrFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLookupError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const width = Math.max(1, img.width);
        const height = Math.max(1, img.height);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          handleCameraScanSuccess(code.data);
        } else {
          setLookupError(
            'Could not detect a valid Xareloop QR code in the uploaded image. Try scanning with the camera or entering the Referral ID manually.'
          );
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleStatusTransitionTap = (newStatus: ReferralStatus) => {
    if (!selectedReferral || isSavingStatus) return;

    // Prevent duplicate status updates
    if (selectedReferral.current_status === newStatus) {
      return;
    }

    setIsSavingStatus(true);
    triggerHapticFeedback('status_tap');

    const receivingFacilityName =
      currentUser.facility_type === 'receiving'
        ? currentUser.facility_name
        : selectedReferral.receiving_facility;

    try {
      onUpdateStatus({
        referral_id: selectedReferral.referral_id,
        facility_id: receivingFacilityName,
        status: newStatus,
      });
      setFeedbackNotice(
        `✓ ${selectedReferral.referral_id} marked ${newStatus.toUpperCase()} at ${receivingFacilityName}`
      );
    } finally {
      setTimeout(() => {
        setIsSavingStatus(false);
      }, 200);
    }
  };

  const demoPayloads = referrals.slice(0, 3).map((r) => ({
    label: r.referral_id,
    value: buildReferralQrPayload(r),
  }));

  const validNextStatuses = selectedReferral
    ? getValidNextStatuses(selectedReferral.current_status)
    : [];

  return (
    <div className="space-y-5">
      <QrCameraScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScanSuccess={handleCameraScanSuccess}
        onSwitchToManualEntry={() => {
          setTimeout(() => manualInputRef.current?.focus(), 100);
        }}
        demoPayloads={demoPayloads}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadQrFile}
        className="hidden"
        aria-label="Upload QR code image"
      />

      {/* Top Scan & Fallback Methods Card */}
      <section
        aria-label="Scan QR or Enter Referral ID"
        className="bg-[#FFFFFF] rounded-2xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#062B78]">
              {mode === 'scan'
                ? 'Receiving Facility Scanner & Status Update'
                : 'Referral Lookup & Clinical Pathway'}
            </span>
            <h2 className="text-lg font-extrabold text-[#031B4E]">
              {mode === 'scan'
                ? 'Scan QR or Enter Referral ID'
                : 'Search Xareloop Referral'}
            </h2>
          </div>

          {onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-[#CBD5E1] text-xs font-extrabold text-[#10213F] hover:bg-[#F7F9FC] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#062B78]" aria-hidden="true" />
              <span>Dashboard</span>
            </button>
          )}
        </div>

        {/* 3 Clear Scan / Lookup Methods: Scan with Camera, Upload QR Image, Enter Referral ID Manually */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              setLookupError(null);
              setIsCameraScannerOpen(true);
            }}
            data-testid="scan-qr-button"
            className="w-full py-4 px-5 min-h-[52px] rounded-xl bg-[#062B78] hover:bg-[#031B4E] text-[#FFFFFF] font-extrabold text-sm shadow-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer"
          >
            <QrCode className="w-5 h-5 text-[#10B9A8]" aria-hidden="true" />
            <span>Scan with Camera (SCAN QR)</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            data-testid="upload-qr-fallback-btn"
            className="w-full py-4 px-5 min-h-[52px] rounded-xl border-2 border-[#062B78] bg-[#FFFFFF] hover:bg-[#EFF6FF] text-[#062B78] font-extrabold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#0878F9]" aria-hidden="true" />
            <span>Upload QR Image</span>
          </button>
        </div>

        {/* Manual Referral ID Form */}
        <form onSubmit={handleFindReferral} className="space-y-2.5 pt-1">
          <label
            htmlFor="referral-id-input"
            className="block text-xs font-extrabold uppercase tracking-wider text-[#10213F]"
          >
            Enter Referral ID Manually
          </label>
          <div className="flex gap-2">
            <input
              ref={manualInputRef}
              id="referral-id-input"
              data-testid="referral-id-input"
              type="text"
              value={referralIdInput}
              onChange={(e) => {
                setReferralIdInput(e.target.value);
                setLookupError(null);
              }}
              placeholder="e.g. XL-1001 or SYN-001"
              className="flex-1 px-3.5 py-3 min-h-[46px] rounded-xl border border-[#94A3B8] text-sm font-mono font-extrabold text-[#10213F] uppercase bg-[#FFFFFF] focus:outline-none focus:border-[#0878F9]"
            />
            <button
              type="submit"
              disabled={isLookingUp}
              data-testid="find-referral-button"
              className="px-5 py-3 min-h-[46px] rounded-xl bg-[#062B78] text-[#FFFFFF] text-xs font-extrabold hover:bg-[#031B4E] disabled:opacity-60 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {isLookingUp ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Loading referral…</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 text-[#10B9A8]" aria-hidden="true" />
                  <span>Open Referral</span>
                </>
              )}
            </button>
          </div>

          {/* Quick-select Active Referral IDs */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[11px] font-bold text-[#475569] mr-1">
              Active Referrals:
            </span>
            {referrals.map((r) => {
              const isSelected =
                selectedReferral?.referral_id === r.referral_id;
              return (
                <button
                  key={r.referral_id}
                  type="button"
                  data-testid={`quick-select-${r.referral_id}`}
                  onClick={() => {
                    onSelectReferral(r);
                    setReferralIdInput(r.referral_id);
                    setLookupError(null);
                    setFeedbackNotice(
                      `✓ Synced patient detail for ${r.patient_code} (${r.referral_id})`
                    );
                  }}
                  className={`px-2.5 py-1 min-h-[32px] rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#062B78] text-[#FFFFFF] border-[#031B4E]'
                      : 'bg-[#F7F9FC] text-[#10213F] border-[#94A3B8] hover:border-[#062B78]'
                  }`}
                >
                  {isSelected ? `✓ ${r.referral_id}` : r.referral_id}
                </button>
              );
            })}
          </div>
        </form>

        {lookupError && (
          <div
            data-testid="referral-lookup-error"
            role="alert"
            className="p-3.5 rounded-xl bg-[#FEF2F2] border-2 border-[#DC2626] text-[#991B1B] text-xs font-bold flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" aria-hidden="true" />
            <span>! {lookupError}</span>
          </div>
        )}
      </section>

      {/* REDESIGNED REFERRAL DETAIL SCREEN */}
      {selectedReferral && (
        <div
          data-testid="referral-detail-screen"
          className="space-y-5"
        >
          {/* Haptic & Sync Feedback Notice */}
          {feedbackNotice && (
            <div
              data-testid="haptic-sync-notice"
              role="status"
              className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-[#DDF7F4] border-2 border-[#085E56] text-[#031B4E] text-xs font-extrabold"
            >
              <div className="flex items-center gap-2">
                <Vibrate className="w-4 h-4 text-[#062B78] shrink-0" aria-hidden="true" />
                <span>{feedbackNotice}</span>
              </div>
              <SyncStateBadge syncStatus={selectedReferral.sync_status} />
            </div>
          )}

          {/* 1. Referral Header Card */}
          <section className="bg-[#FFFFFF] rounded-2xl border-2 border-[#E2E8F0] p-5 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E8F0] pb-4">
              <div className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#062B78]">
                  Xareloop Clinical Referral
                </span>
                <h3
                  data-testid="selected-referral-id"
                  className="text-2xl sm:text-3xl font-mono font-extrabold text-[#031B4E]"
                >
                  Referral {selectedReferral.referral_id}
                </h3>
                <p
                  data-testid="synced-patient-code"
                  className="text-sm font-mono font-extrabold text-[#10213F]"
                >
                  Synthetic Patient: {selectedReferral.patient_code}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <PriorityBadge priority={selectedReferral.priority} size="md" />
                  <StatusBadge status={selectedReferral.current_status} size="md" />
                </div>
                <button
                  type="button"
                  onClick={() => onShowQrModal(selectedReferral)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg border border-[#062B78] text-[#062B78] text-xs font-extrabold hover:bg-[#EFF6FF] cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#0878F9]" aria-hidden="true" />
                  <span>Show QR Slip</span>
                </button>
              </div>
            </div>

            {/* 2. Update Status Section — Only Valid Next Actions for Current State */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#062B78]">
                  Update Status (Valid Next Actions for {selectedReferral.current_status})
                </h4>
                {isSavingStatus && (
                  <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[#062B78]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    Saving status…
                  </span>
                )}
              </div>

              {canUpdateStatus ? (
                validNextStatuses.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {validNextStatuses.map((nextStatus) => {
                      const label = STATUS_BUTTON_LABELS[nextStatus];
                      return (
                        <button
                          key={nextStatus}
                          type="button"
                          disabled={isSavingStatus}
                          data-testid={`status-btn-${label}`}
                          onClick={() => handleStatusTransitionTap(nextStatus)}
                          className="py-4 px-5 min-h-[54px] rounded-xl bg-[#062B78] hover:bg-[#031B4E] disabled:opacity-60 text-[#FFFFFF] font-extrabold text-sm flex items-center justify-between border-2 border-[#031B4E] shadow-xs transition-all cursor-pointer"
                        >
                          <span>Mark {label}</span>
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold px-2.5 py-1 rounded-lg bg-[#10B9A8] text-[#031B4E]">
                            Tap to Update →
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    data-testid="referral-loop-complete-banner"
                    className="p-4 rounded-xl bg-[#DDF7F4] border border-[#085E56] text-[#031B4E] text-xs font-extrabold flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#085E56] shrink-0" aria-hidden="true" />
                    <span>
                      ✓ Referral Loop Completed ({selectedReferral.current_status}). All clinical feedback events have been recorded.
                    </span>
                  </div>
                )
              ) : (
                <div
                  data-testid="role-update-restricted-banner"
                  className="p-4 rounded-xl bg-[#F7F9FC] border border-[#94A3B8] text-[#10213F] text-xs font-bold flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#062B78] shrink-0" aria-hidden="true" />
                    <span>
                      Referring Facility Role Active: Only Receiving Facility staff can update referral statuses ({validNextStatuses.join(' / ') || 'Completed'}).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenAuthModal}
                    data-testid="switch-to-receiving-role-btn"
                    className="px-3.5 py-2 min-h-[38px] rounded-lg bg-[#062B78] text-[#FFFFFF] text-xs font-extrabold hover:bg-[#031B4E] cursor-pointer"
                  >
                    Switch to Receiving Facility
                  </button>
                </div>
              )}

              {/* Clinical State Progression Bar showing completed vs current vs valid next */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {(
                  [
                    'Referred',
                    'Arrived',
                    'Seen',
                    'Treated',
                    'Follow-up',
                    'Back-referred',
                  ] as ReferralStatus[]
                ).map((st) => {
                  const isCurrent = selectedReferral.current_status === st;
                  const isValidNext = validNextStatuses.includes(st);
                  return (
                    <span
                      key={st}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${
                        isCurrent
                          ? 'bg-[#062B78] text-[#FFFFFF] border-[#031B4E]'
                          : isValidNext
                            ? 'bg-[#DDF7F4] text-[#031B4E] border-[#085E56]'
                            : 'bg-[#F7F9FC] text-[#475569] border-[#CBD5E1]'
                      }`}
                    >
                      {isCurrent ? (
                        <>
                          <Check className="w-3 h-3 inline mr-1" aria-hidden="true" />
                          {st} (Current)
                        </>
                      ) : isValidNext ? (
                        `→ ${st} (Next)`
                      ) : (
                        st
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 3. Referral Pathway Timeline */}
          <ReferralTimelineCard referral={selectedReferral} events={events} />

          {/* 4. Structured Referral Information Card */}
          <section
            aria-label="Referral Information"
            data-testid="synced-patient-detail-card"
            className="bg-[#FFFFFF] rounded-2xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#062B78]">
                Referral Information
              </h3>
              <SyncStateBadge syncStatus={selectedReferral.sync_status} />
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#CBD5E1]">
                <dt className="font-bold uppercase text-[#475569]">
                  Referring Facility
                </dt>
                <dd className="mt-1 font-extrabold text-sm text-[#10213F]">
                  {selectedReferral.referring_facility}
                </dd>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#CBD5E1]">
                <dt className="font-bold uppercase text-[#475569]">
                  Receiving Facility
                </dt>
                <dd className="mt-1 font-extrabold text-sm text-[#031B4E]">
                  {selectedReferral.receiving_facility}
                </dd>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#CBD5E1]">
                <dt className="font-bold uppercase text-[#475569]">
                  Referral ID
                </dt>
                <dd className="mt-1 font-mono font-extrabold text-sm text-[#062B78]">
                  {selectedReferral.referral_id}
                </dd>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#CBD5E1]">
                <dt className="font-bold uppercase text-[#475569]">
                  Synthetic Patient ID
                </dt>
                <dd className="mt-1 font-mono font-extrabold text-sm text-[#10213F]">
                  {selectedReferral.patient_code}
                </dd>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#CBD5E1]">
                <dt className="font-bold uppercase text-[#475569]">
                  Clinical Category
                </dt>
                <dd className="mt-1 font-extrabold text-sm text-[#10213F]">
                  {selectedReferral.referral_category}
                </dd>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#CBD5E1]">
                <dt className="font-bold uppercase text-[#475569]">
                  Priority & Current Status
                </dt>
                <dd className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <PriorityBadge priority={selectedReferral.priority} />
                  <StatusBadge status={selectedReferral.current_status} />
                </dd>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#CBD5E1]">
                <dt className="font-bold uppercase text-[#475569]">
                  Created Time
                </dt>
                <dd className="mt-1 font-mono font-bold text-[#10213F]">
                  {formatShortTimestamp(selectedReferral.created_at)}
                </dd>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F7F9FC] border border-[#CBD5E1]">
                <dt className="font-bold uppercase text-[#475569]">
                  Last Updated Time
                </dt>
                <dd className="mt-1 font-mono font-bold text-[#10213F]">
                  {formatShortTimestamp(selectedReferral.last_updated_at)}
                </dd>
              </div>
            </dl>

            {selectedReferral.custom_note && (
              <div className="p-3.5 rounded-xl bg-[#DDF7F4]/60 border border-[#085E56] text-xs text-[#10213F]">
                <strong className="font-extrabold text-[#031B4E] block mb-0.5">
                  Clinical Handover Note:
                </strong>
                <span>{selectedReferral.custom_note}</span>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
