import React from 'react';
import { QrCode } from 'lucide-react';
import { Referral, ReferralStatus, StatusEvent } from '../types/referral';

interface ReferralTimelineCardProps {
  referral: Referral;
  events: StatusEvent[];
  onViewQr?: (referral: Referral) => void;
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

interface TimelineStepConfig {
  key: string;
  label: string;
  matchStatuses: ReferralStatus[];
}

const TIMELINE_STEPS: TimelineStepConfig[] = [
  { key: 'Referred', label: 'Referred', matchStatuses: ['Referred'] },
  { key: 'Arrived', label: 'Arrived', matchStatuses: ['Arrived'] },
  { key: 'Seen', label: 'Seen', matchStatuses: ['Seen'] },
  { key: 'Treated', label: 'Treated', matchStatuses: ['Treated'] },
  {
    key: 'FollowUpOrBack',
    label: 'Follow-up / Back-referred',
    matchStatuses: ['Follow-up', 'Back-referred'],
  },
];

export const ReferralTimelineCard: React.FC<ReferralTimelineCardProps> = ({
  referral,
  events,
  onViewQr,
}) => {
  // Find the latest event matching each step
  const getStepEvent = (matchStatuses: ReferralStatus[]): StatusEvent | undefined => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (matchStatuses.includes(events[i].status)) {
        return events[i];
      }
    }
    return undefined;
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
        <div>
          <div className="text-xs text-slate-500">Timeline</div>
          <div className="font-mono text-base font-bold text-slate-900">
            {referral.referral_id} · {referral.patient_code}
          </div>
        </div>
        {onViewQr && (
          <button
            type="button"
            onClick={() => onViewQr(referral)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 min-h-[40px]"
          >
            <QrCode className="w-4 h-4 text-teal-700" />
            <span>Show QR</span>
          </button>
        )}
      </div>

      <div className="flex flex-col">
        {TIMELINE_STEPS.map((step, index) => {
          const matchedEvent = getStepEvent(step.matchStatuses);
          const isCompleted = Boolean(matchedEvent);
          const isCurrent = step.matchStatuses.includes(referral.current_status);
          const displayLabel = matchedEvent ? matchedEvent.status : step.label;

          return (
            <React.Fragment key={step.key}>
              {index > 0 && (
                <div
                  className="pl-3 py-1 text-slate-400 font-bold text-sm select-none"
                  aria-hidden="true"
                >
                  ↓
                </div>
              )}
              <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 ${
                  isCurrent
                    ? 'bg-teal-50 border border-teal-600'
                    : isCompleted
                      ? 'bg-slate-50 border border-slate-200'
                      : 'border border-transparent text-slate-400'
                }`}
              >
                <span
                  className={`text-sm ${
                    isCurrent
                      ? 'font-bold text-teal-900'
                      : isCompleted
                        ? 'font-semibold text-slate-900'
                        : 'font-medium text-slate-400'
                  }`}
                >
                  {displayLabel}
                </span>

                {matchedEvent && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-800">
                      {matchedEvent.facility_id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatShortTimestamp(matchedEvent.timestamp)}
                    </span>
                    {matchedEvent.sync_status === 'Saved offline' && (
                      <span className="font-semibold text-amber-700">
                        (Saved offline)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
