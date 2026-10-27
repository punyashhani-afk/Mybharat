import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  Lock,
  QrCode,
  Search,
} from 'lucide-react';
import {
  Referral,
  ReferralStatus,
  RolePermissions,
  SmsFallbackMessage,
  StatusEvent,
} from '../types/referral';
import {
  getReferralTimeline,
  lookupReferralById,
  parseReferralLookupInput,
} from '../core/referralEngine';
import { ReferralTimelineCard } from './ReferralTimelineCard';
import { QrCameraScannerModal } from './QrCameraScannerModal';

interface ReceivingFacilityViewProps {
  mode: 'scan_update' | 'search';
  referrals: Referral[];
  events: StatusEvent[];
  initialLookupId: string;
  permissions: RolePermissions;
  onSwitchToReceivingStaff?: () => void;
  onUpdateStatus: (
    referralId: string,
    facilityId: string,
    status: ReferralStatus
  ) => {
    referral: Referral;
    event: StatusEvent;
    sms: SmsFallbackMessage;
  };
  onViewQr?: (referral: Referral) => void;
}

const ONE_TAP_STATUSES: { label: string; value: ReferralStatus }[] = [
  { label: 'ARRIVED', value: 'Arrived' },
  { label: 'SEEN', value: 'Seen' },
  { label: 'TREATED', value: 'Treated' },
  { label: 'FOLLOW-UP', value: 'Follow-up' },
  { label: 'BACK-REFERRED', value: 'Back-referred' },
];

export const ReceivingFacilityView: React.FC<ReceivingFacilityViewProps> = ({
  mode,
  referrals,
  events,
  initialLookupId,
  permissions,
  onSwitchToReceivingStaff,
  onUpdateStatus,
  onViewQr,
}) => {
  const [lookupInput, setLookupInput] = useState(initialLookupId || 'XL-1001');
  const [searchedQuery, setSearchedQuery] = useState(
    initialLookupId || 'XL-1001'
  );
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [lastScannedBanner, setLastScannedBanner] = useState<string | null>(
    null
  );
  const [lastUpdatedStatus, setLastUpdatedStatus] = useState<{
    status: ReferralStatus;
    syncStatus: string;
  } | null>(null);

  useEffect(() => {
    if (initialLookupId) {
      setLookupInput(initialLookupId);
      setSearchedQuery(initialLookupId);
    }
  }, [initialLookupId]);

  const lookupResult = lookupReferralById(referrals, searchedQuery);
  const matchedReferral = lookupResult.referral;

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLastUpdatedStatus(null);
    setLastScannedBanner(null);
    setSearchedQuery(lookupInput);
  };

  // Handle decoded QR result from live camera scanner
  const handleQrScanSuccess = (decodedQrValue: string) => {
    setIsCameraScannerOpen(false);
    setLastUpdatedStatus(null);
    const parsedShortId = parseReferralLookupInput(decodedQrValue);
    setLookupInput(parsedShortId || decodedQrValue);
    setSearchedQuery(decodedQrValue);
    setLastScannedBanner(`Scanned QR: ${parsedShortId || decodedQrValue}`);
  };

  const handleOneTapStatus = (status: ReferralStatus) => {
    if (!matchedReferral || !permissions.canUpdateReferralStatus) return;
    const res = onUpdateStatus(
      matchedReferral.referral_id,
      matchedReferral.receiving_facility,
      status
    );
    setLastUpdatedStatus({
      status: res.event.status,
      syncStatus: res.event.sync_status,
    });
  };

  const timelineEvents = matchedReferral
    ? getReferralTimeline(events, matchedReferral.referral_id)
    : [];

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {/* Live Camera QR Code Scanner Screen */}
      <QrCameraScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScanSuccess={handleQrScanSuccess}
      />

      {mode === 'scan_update' ? (
        /* SCAN / UPDATE: Distinctive Primary SCAN QR Action and ENTER REFERRAL ID below it */
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
          <button
            type="button"
            data-testid="open-qr-scanner-btn"
            onClick={() => setIsCameraScannerOpen(true)}
            className="w-full flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#0B5E5E] via-[#0D6E6E] to-[#0F766E] px-6 py-4 text-lg font-bold tracking-wide text-white shadow-sm ring-1 ring-teal-950/15 hover:from-[#094D4D] hover:to-[#0D655E] transition-all min-h-[60px]"
          >
            <QrCode className="w-6 h-6" />
            <span>SCAN QR</span>
          </button>

          {lastScannedBanner && (
            <div
              role="status"
              data-testid="qr-scanned-result-banner"
              className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-900"
            >
              <span>{lastScannedBanner}</span>
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
            </div>
          )}

          <form onSubmit={handleLookupSubmit} className="space-y-2 pt-1">
            <label
              htmlFor="referral-lookup-input"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
            >
              ENTER REFERRAL ID
            </label>
            <div className="flex gap-2">
              <input
                id="referral-lookup-input"
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder="e.g. XL-1001"
                aria-label="Enter Referral ID"
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-base font-bold text-slate-900 focus:border-teal-700 focus:outline-none min-h-[48px]"
              />
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors min-h-[48px]"
              >
                Open
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* SEARCH: Short referral ID lookup */
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <form onSubmit={handleLookupSubmit} className="space-y-2">
            <label
              htmlFor="search-referral-id-input"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
            >
              Enter Referral ID
            </label>
            <div className="flex gap-2">
              <input
                id="search-referral-id-input"
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder="e.g. XL-1001"
                aria-label="Search by short referral ID"
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-base font-bold text-slate-900 focus:border-teal-700 focus:outline-none min-h-[48px]"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0B5E5E] to-[#0F766E] px-5 py-3 text-sm font-bold text-white shadow-xs hover:from-[#094D4D] hover:to-[#0D655E] transition-all min-h-[48px]"
              >
                <Search className="w-4 h-4" />
                <span>Search</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Not Found Message */}
      {!lookupResult.found || !matchedReferral ? (
        <div
          role="alert"
          data-testid="referral-not-found-alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center"
        >
          <AlertCircle className="w-7 h-7 text-red-700 mx-auto" />
          <div className="mt-2 text-base font-bold text-red-900">
            Referral not found
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Minimal Referral Information Card:
              - Patient Code
              - Referring Facility
              - Receiving Facility
              - Current Status */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-500">Patient Code</div>
                <div className="mt-0.5 font-mono text-lg font-bold text-slate-900">
                  {matchedReferral.patient_code}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Current Status</div>
                <div
                  data-testid="receiving-current-status"
                  className="mt-0.5 text-lg font-bold text-teal-800"
                >
                  {matchedReferral.current_status}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Referring Facility</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">
                  {matchedReferral.referring_facility}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Receiving Facility</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">
                  {matchedReferral.receiving_facility}
                </div>
              </div>
            </div>
          </div>

          {mode === 'scan_update' ? (
            permissions.canUpdateReferralStatus ? (
              /* Large One-Tap Status Buttons for Receiving Staff:
                 ARRIVED, SEEN, TREATED, FOLLOW-UP, BACK-REFERRED */
              <div className="space-y-3">
                {lastUpdatedStatus && (
                  <div
                    role="status"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-950"
                  >
                    <span>
                      Marked {lastUpdatedStatus.status} · Notification sent to
                      referring dashboard
                    </span>
                    {lastUpdatedStatus.syncStatus === 'Saved offline' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                        <CloudOff className="w-4 h-4" />
                        Saved offline
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="w-4 h-4" />
                        Synced
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2.5">
                  {ONE_TAP_STATUSES.map((btn) => {
                    const isCurrent =
                      matchedReferral.current_status === btn.value;
                    return (
                      <button
                        key={btn.value}
                        type="button"
                        data-testid={`status-btn-${btn.value.toLowerCase()}`}
                        onClick={() => handleOneTapStatus(btn.value)}
                        aria-pressed={isCurrent}
                        className={`w-full rounded-xl border px-5 py-4 text-base font-bold tracking-wide transition-colors min-h-[56px] ${
                          isCurrent
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-300 bg-white text-slate-900 hover:border-teal-700 hover:bg-teal-50'
                        }`}
                      >
                        {btn.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Role Permission Guard when signed in as Referring Staff */
              <div
                role="region"
                aria-label="Role Permission Notice"
                data-testid="update-status-role-guard"
                className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-center space-y-3"
              >
                <Lock className="w-6 h-6 text-amber-800 mx-auto" />
                <div className="text-sm font-bold text-amber-950">
                  Receiving Staff Role Required to Update Status
                </div>
                <p className="text-xs text-amber-900">
                  You are currently signed in as{' '}
                  <strong>Referring Staff</strong> (can create referrals and
                  view dashboards). Switch to <strong>Receiving Staff</strong>{' '}
                  to record status updates.
                </p>
                {onSwitchToReceivingStaff && (
                  <button
                    type="button"
                    data-testid="switch-to-receiving-staff-btn"
                    onClick={onSwitchToReceivingStaff}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition-colors min-h-[42px]"
                  >
                    Switch to Receiving Staff
                  </button>
                )}
              </div>
            )
          ) : (
            /* Search Mode: Show Simple Vertical Timeline */
            <ReferralTimelineCard
              referral={matchedReferral}
              events={timelineEvents}
              onViewQr={onViewQr}
            />
          )}
        </div>
      )}
    </div>
  );
};
