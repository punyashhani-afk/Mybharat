import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  CloudOff,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import {
  Referral,
  REFERRAL_STATUSES,
  StatusEvent,
} from '../types/referral';

interface ReferralTimelineCardProps {
  referral: Referral;
  events: StatusEvent[];
  onViewQr: (referral: Referral) => void;
  onOpenInReceiving?: (referralId: string) => void;
  hideReceivingAction?: boolean;
}

export function formatShortTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export const ReferralTimelineCard: React.FC<ReferralTimelineCardProps> = ({
  referral,
  events,
  onViewQr,
  onOpenInReceiving,
  hideReceivingAction = false,
}) => {
  const completedStatuses = new Set(events.map((e) => e.status));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-900">
              {referral.referral_id}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-700">
              {referral.patient_code}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={
                referral.priority === 'Emergency'
                  ? 'font-semibold text-red-700'
                  : referral.priority === 'Urgent'
                    ? 'font-semibold text-amber-700'
                    : 'text-slate-600'
              }
            >
              {referral.priority} Priority
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-slate-900">
            {referral.referral_category}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            <span>{referral.referring_facility}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-medium text-slate-900">
              {referral.receiving_facility}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onViewQr(referral)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <QrCode className="w-3.5 h-3.5 text-slate-700" />
            <span>Show QR / ID</span>
          </button>
          {!hideReceivingAction && onOpenInReceiving && (
            <button
              type="button"
              onClick={() => onOpenInReceiving(referral.referral_id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <span>Update Status</span>
            </button>
          )}
        </div>
      </div>

      {/* Journey Progression Summary Bar: Referred → Arrived → Seen → Treated → Follow-up */}
      <div className="mt-4 border-b border-slate-100 pb-4">
        <div className="text-xs font-medium text-slate-500 mb-2">
          Referral Loop Journey
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {REFERRAL_STATUSES.map((step, index) => {
            const isReached =
              completedStatuses.has(step) || referral.current_status === step;
            const isCurrent = referral.current_status === step;
            return (
              <React.Fragment key={step}>
                {index > 0 && (
                  <span className="text-slate-300 select-none" aria-hidden="true">
                    →
                  </span>
                )}
                <span
                  className={
                    isCurrent
                      ? 'font-bold text-teal-800 underline decoration-teal-600 decoration-2 underline-offset-4'
                      : isReached
                        ? 'font-medium text-slate-800'
                        : 'text-slate-400'
                  }
                >
                  {step}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Chronological Event Timeline */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
          <span className="font-semibold text-slate-700">
            Chronological Referral Timeline ({events.length}{' '}
            {events.length === 1 ? 'event' : 'events'})
          </span>
          <span className="font-mono tabular-nums">
            Current: {referral.current_status}
          </span>
        </div>

        {events.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">
            No timeline events recorded yet.
          </p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {events.map((evt, idx) => {
              const isOfflineEvt = evt.sync_status === 'Saved offline';
              return (
                <li
                  key={evt.event_id}
                  className="py-3 first:pt-1 last:pb-1 flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="mt-0.5 font-mono text-xs text-slate-400 tabular-nums shrink-0">
                      {String(idx + 1).padStart(2, '0')}.
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="font-semibold text-slate-900">
                          {evt.status}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-slate-700">
                          {evt.facility_id}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{formatShortTimestamp(evt.timestamp)}</span>
                        <span aria-hidden="true">·</span>
                        <span>ID: {evt.referral_id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    {isOfflineEvt ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                        <CloudOff className="w-3.5 h-3.5" />
                        <span>Saved offline</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Synced</span>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};
