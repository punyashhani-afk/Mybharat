import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CloudOff,
  MessageSquare,
  QrCode,
  Search,
} from 'lucide-react';
import {
  Referral,
  REFERRAL_STATUSES,
  ReferralStatus,
  SmsFallbackMessage,
  StatusEvent,
} from '../types/referral';
import { RECEIVING_FACILITIES } from '../data/syntheticData';
import {
  buildReferralQrPayload,
  getReferralTimeline,
  lookupReferralById,
} from '../core/referralEngine';
import {
  formatShortTimestamp,
  ReferralTimelineCard,
} from './ReferralTimelineCard';

interface ReceivingFacilityViewProps {
  referrals: Referral[];
  events: StatusEvent[];
  initialLookupId: string;
  defaultReceivingFacility: string;
  onUpdateStatus: (
    referralId: string,
    facilityId: string,
    status: ReferralStatus
  ) => {
    referral: Referral;
    event: StatusEvent;
    sms: SmsFallbackMessage;
  };
  onViewQr: (referral: Referral) => void;
}

export const ReceivingFacilityView: React.FC<ReceivingFacilityViewProps> = ({
  referrals,
  events,
  initialLookupId,
  defaultReceivingFacility,
  onUpdateStatus,
  onViewQr,
}) => {
  const [lookupInput, setLookupInput] = useState(initialLookupId || 'XL-1001');
  const [searchedQuery, setSearchedQuery] = useState(
    initialLookupId || 'XL-1001'
  );
  const [activeFacility, setActiveFacility] = useState<string>(
    RECEIVING_FACILITIES.includes(
      defaultReceivingFacility as (typeof RECEIVING_FACILITIES)[number]
    )
      ? defaultReceivingFacility
      : RECEIVING_FACILITIES[0]
  );
  const [showQrScannerModal, setShowQrScannerModal] = useState(false);
  const [qrRawPayloadInput, setQrRawPayloadInput] = useState('');
  const [lastUpdateFeedback, setLastUpdateFeedback] = useState<{
    status: ReferralStatus;
    facility: string;
    timestamp: string;
    smsText: string;
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

  // Keep activeFacility aligned with the matched referral's receiving facility when a new referral is opened
  useEffect(() => {
    if (matchedReferral?.receiving_facility) {
      setActiveFacility(matchedReferral.receiving_facility);
    }
  }, [matchedReferral?.referral_id]);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLastUpdateFeedback(null);
    setSearchedQuery(lookupInput);
  };

  const handleOneTapStatus = (status: ReferralStatus) => {
    if (!matchedReferral) return;
    const res = onUpdateStatus(
      matchedReferral.referral_id,
      activeFacility,
      status
    );
    setLastUpdateFeedback({
      status: res.event.status,
      facility: res.event.facility_id,
      timestamp: res.event.timestamp,
      smsText: res.sms.message,
      syncStatus: res.event.sync_status,
    });
  };

  const timelineEvents = matchedReferral
    ? getReferralTimeline(events, matchedReferral.referral_id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Receiving Facility Lookup & One-Tap Status Update
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Scan a referral QR code or enter the short referral ID to view
            referring PHC/CHC details and update status with one tap.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="active-receiving-facility"
            className="text-xs font-semibold text-slate-700"
          >
            Acting Facility:
          </label>
          <select
            id="active-receiving-facility"
            value={activeFacility}
            onChange={(e) => setActiveFacility(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-teal-700 focus:outline-none min-h-[40px]"
          >
            {RECEIVING_FACILITIES.map((fac) => (
              <option key={fac} value={fac}>
                {fac}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Search / QR Lookup Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <form
          onSubmit={handleLookupSubmit}
          className="flex flex-wrap items-center gap-3"
        >
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="referral-lookup-input"
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="Enter short referral ID (e.g. XL-1001, XL-1005)..."
              aria-label="Short referral ID lookup"
              className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2.5 font-mono text-sm font-semibold text-slate-900 focus:border-teal-700 focus:outline-none min-h-[48px]"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors min-h-[48px] whitespace-nowrap shrink-0"
          >
            <span>Lookup Referral</span>
          </button>

          <button
            type="button"
            onClick={() => setShowQrScannerModal((prev) => !prev)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors min-h-[48px] whitespace-nowrap shrink-0"
          >
            <QrCode className="w-4 h-4 text-teal-700" />
            <span>Scan QR Code</span>
          </button>
        </form>

        {/* Quick Preset IDs for fast testing */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Quick lookup IDs:</span>
          {referrals.slice(0, 6).map((r) => (
            <button
              key={r.referral_id}
              type="button"
              aria-label={`Lookup referral ${r.referral_id}`}
              onClick={() => {
                setLookupInput(r.referral_id);
                setSearchedQuery(r.referral_id);
                setLastUpdateFeedback(null);
              }}
              className={`font-mono px-2.5 py-1 rounded-md border transition-colors min-h-[32px] ${
                searchedQuery.toUpperCase() === r.referral_id
                  ? 'border-teal-700 bg-teal-50 text-teal-900 font-bold'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {r.referral_id}
            </button>
          ))}
        </div>

        {/* Simulated / Payload QR Scanner Drawer */}
        {showQrScannerModal && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">
                QR Code Scanner & Payload Decoder
              </h3>
              <button
                type="button"
                onClick={() => setShowQrScannerModal(false)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Close Scanner
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Simulate scanning a patient referral slip QR code or paste raw
              Xareloop QR JSON payload:
            </p>
            <div className="flex flex-wrap gap-2">
              {referrals.slice(0, 4).map((r) => (
                <button
                  key={r.referral_id}
                  type="button"
                  onClick={() => {
                    const payload = buildReferralQrPayload(r);
                    setLookupInput(r.referral_id);
                    setSearchedQuery(payload);
                    setShowQrScannerModal(false);
                    setLastUpdateFeedback(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-700 bg-white px-3 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-50 min-h-[40px]"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Scan {r.referral_id} Slip</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={qrRawPayloadInput}
                onChange={(e) => setQrRawPayloadInput(e.target.value)}
                placeholder='{"protocol":"XARELOOP_V1","referral_id":"XL-1001",...}'
                aria-label="Paste QR JSON payload"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 min-h-[40px]"
              />
              <button
                type="button"
                onClick={() => {
                  if (qrRawPayloadInput.trim()) {
                    setSearchedQuery(qrRawPayloadInput.trim());
                    setShowQrScannerModal(false);
                    setLastUpdateFeedback(null);
                  }
                }}
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 min-h-[40px]"
              >
                Decode QR
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invalid ID / Referral Not Found State */}
      {!lookupResult.found || !matchedReferral ? (
        <div
          role="alert"
          data-testid="referral-not-found-alert"
          className="rounded-xl border border-red-200 bg-red-50 p-6 text-center"
        >
          <AlertCircle className="w-8 h-8 text-red-700 mx-auto" />
          <h2 className="mt-2 text-lg font-bold text-red-900">
            Referral not found
          </h2>
          <p className="mt-1 text-xs text-red-800">
            No synthetic referral record matches{' '}
            <span className="font-mono font-bold">
              “{searchedQuery || lookupInput}”
            </span>
            . Verify the short ID (e.g., XL-1001) or scan the patient referral
            QR slip.
          </p>
        </div>
      ) : (
        /* Valid Referral Found: One-Tap Status Update + Timeline */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Columns: Referral Info & Large One-Tap Status Buttons */}
          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono text-base font-bold text-slate-900">
                      {matchedReferral.referral_id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-semibold text-slate-800">
                      Patient {matchedReferral.patient_code}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        matchedReferral.priority === 'Emergency'
                          ? 'font-bold text-red-700'
                          : matchedReferral.priority === 'Urgent'
                            ? 'font-bold text-amber-700'
                            : 'font-medium text-slate-700'
                      }
                    >
                      {matchedReferral.priority} Priority
                    </span>
                  </div>
                  <h2 className="mt-1.5 text-lg font-bold text-slate-900">
                    {matchedReferral.referral_category}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                    <span>Referred from:</span>
                    <strong className="text-slate-900">
                      {matchedReferral.referring_facility}
                    </strong>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span>To:</span>
                    <strong className="text-slate-900">
                      {matchedReferral.receiving_facility}
                    </strong>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">Current Status</div>
                  <div
                    data-testid="receiving-current-status"
                    className="text-base font-bold text-teal-800"
                  >
                    {matchedReferral.current_status}
                  </div>
                  <div className="mt-0.5 text-xs">
                    {matchedReferral.sync_status === 'Saved offline' ? (
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
                </div>
              </div>

              {/* One-Tap Status Update Grid (Large Frontline Healthcare Buttons) */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    One-Tap Referral Status Update
                  </h3>
                  <span className="text-xs text-slate-500">
                    Recording as: <strong>{activeFacility}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {REFERRAL_STATUSES.map((status) => {
                    const isCurrent = matchedReferral.current_status === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        data-testid={`status-btn-${status.toLowerCase()}`}
                        aria-label={`Mark status ${status}`}
                        onClick={() => handleOneTapStatus(status)}
                        aria-pressed={isCurrent}
                        className={`flex flex-col items-start justify-between rounded-xl border p-4 text-left transition-colors min-h-[72px] ${
                          isCurrent
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-300 bg-white text-slate-900 hover:border-teal-700 hover:bg-teal-50/40'
                        }`}
                      >
                        <span
                          className={`text-sm font-bold ${
                            isCurrent ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {status}
                        </span>
                        <span
                          className={`text-[11px] mt-1 ${
                            isCurrent ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          {isCurrent ? 'Current active state' : 'Tap to record'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Immediate Confirmation & Simulated SMS Feedback */}
              {lastUpdateFeedback && (
                <div
                  role="status"
                  className="mt-5 rounded-xl border border-teal-200 bg-teal-50/70 p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-teal-950">
                    <span>
                      Status updated to “{lastUpdateFeedback.status}” at{' '}
                      {lastUpdateFeedback.facility}
                    </span>
                    <span className="font-mono tabular-nums">
                      {lastUpdateFeedback.syncStatus} ·{' '}
                      {formatShortTimestamp(lastUpdateFeedback.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-slate-700 font-mono bg-white rounded-lg border border-teal-200/80 p-2.5">
                    <MessageSquare className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                    <span>{lastUpdateFeedback.smsText}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right 5 Columns: Live Chronological Timeline */}
          <div className="lg:col-span-5">
            <ReferralTimelineCard
              referral={matchedReferral}
              events={timelineEvents}
              onViewQr={onViewQr}
              hideReceivingAction
            />
          </div>
        </div>
      )}
    </div>
  );
};
