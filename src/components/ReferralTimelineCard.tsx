import React from 'react';
import {
  Check,
  ArrowDown,
  CircleDot,
  Clock,
  Building2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type {
  Referral,
  ReferralPriority,
  ReferralStatus,
  StatusEvent,
  SyncStatus,
} from '../types/referral';

/**
 * Formats an ISO timestamp into a clear clinical display string:
 * Example: "25 Oct 2026 • 10:42 AM"
 */
export function formatShortTimestamp(isoString?: string): string {
  if (!isoString) return 'Pending';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const day = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${day} • ${time}`;
}

/**
 * Accessible Priority Badge (WCAG 2.2 AA — uses Icon + Symbol + Text + High-Contrast Color):
 * - ✓ Routine
 * - ⚠ Urgent
 * - ! Emergency
 */
export const PriorityBadge: React.FC<{
  priority: ReferralPriority;
  size?: 'sm' | 'md';
}> = ({ priority, size = 'sm' }) => {
  const sizeClasses =
    size === 'md'
      ? 'px-3 py-1 text-xs font-extrabold rounded-lg'
      : 'px-2.5 py-0.5 text-xs font-extrabold rounded-md';

  if (priority === 'Emergency') {
    return (
      <span
        data-testid={`priority-badge-${priority}`}
        className={`inline-flex items-center gap-1 border-2 bg-[#FEF2F2] text-[#991B1B] border-[#DC2626] ${sizeClasses}`}
      >
        <AlertCircle className="w-3.5 h-3.5 text-[#B91C1C] shrink-0" aria-hidden="true" />
        <span>! Emergency</span>
      </span>
    );
  }

  if (priority === 'Urgent') {
    return (
      <span
        data-testid={`priority-badge-${priority}`}
        className={`inline-flex items-center gap-1 border bg-[#FEF3C7] text-[#78350F] border-[#D97706] ${sizeClasses}`}
      >
        <AlertTriangle className="w-3.5 h-3.5 text-[#92400E] shrink-0" aria-hidden="true" />
        <span>⚠ Urgent</span>
      </span>
    );
  }

  return (
    <span
      data-testid={`priority-badge-${priority}`}
      className={`inline-flex items-center gap-1 border bg-[#DDF7F4] text-[#031B4E] border-[#085E56] ${sizeClasses}`}
    >
      <CheckCircle2 className="w-3.5 h-3.5 text-[#085E56] shrink-0" aria-hidden="true" />
      <span>✓ Routine</span>
    </span>
  );
};

/**
 * Accessible Status Badge (WCAG 2.2 AA — uses Symbol + Text + Color):
 */
export const StatusBadge: React.FC<{
  status: ReferralStatus;
  size?: 'sm' | 'md';
}> = ({ status, size = 'sm' }) => {
  const sizeClasses =
    size === 'md'
      ? 'px-3.5 py-1.5 text-xs font-extrabold rounded-lg'
      : 'px-2.5 py-1 text-xs font-extrabold rounded-lg';

  const config: Record<
    ReferralStatus,
    { classes: string; prefix: string }
  > = {
    Referred: {
      classes: 'bg-[#F7F9FC] text-[#10213F] border-[#64748B]',
      prefix: '●',
    },
    Arrived: {
      classes: 'bg-[#EFF6FF] text-[#062B78] border-[#0878F9]',
      prefix: '✓',
    },
    Seen: {
      classes: 'bg-[#EFF6FF] text-[#031B4E] border-[#062B78]',
      prefix: '✓',
    },
    Treated: {
      classes: 'bg-[#DDF7F4] text-[#031B4E] border-[#085E56]',
      prefix: '✓',
    },
    'Follow-up': {
      classes: 'bg-[#FEF3C7] text-[#78350F] border-[#D97706]',
      prefix: '⚠',
    },
    'Back-referred': {
      classes: 'bg-[#DDF7F4] text-[#031B4E] border-[#085E56]',
      prefix: '✓',
    },
  };

  const item = config[status] || config.Referred;

  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex items-center gap-1 border ${item.classes} ${sizeClasses}`}
    >
      <span>{item.prefix}</span>
      <span>{status}</span>
    </span>
  );
};

/**
 * Accessible Sync State Badge:
 * - ✓ Synced
 * - ◷ Pending sync
 * - ⚠ Sync failed
 */
export const SyncStateBadge: React.FC<{
  syncStatus?: SyncStatus;
  hasFailed?: boolean;
}> = ({ syncStatus = 'Synced', hasFailed = false }) => {
  if (hasFailed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#FEF2F2] text-[#991B1B] border border-[#DC2626]">
        ⚠ Sync failed
      </span>
    );
  }
  if (syncStatus === 'Saved offline') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#FEF3C7] text-[#78350F] border border-[#D97706]">
        ◷ Pending sync
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#DDF7F4] text-[#031B4E] border border-[#085E56]">
      ✓ Synced
    </span>
  );
};

interface ReferralTimelineCardProps {
  referral: Referral;
  events: StatusEvent[];
}

const PATHWAY_STEPS: {
  key: string;
  label: string;
  matchStatuses: ReferralStatus[];
  description: string;
}[] = [
  {
    key: 'Referred',
    label: 'Referred',
    matchStatuses: ['Referred'],
    description: 'Referral initiated by referring facility',
  },
  {
    key: 'Arrived',
    label: 'Arrived',
    matchStatuses: ['Arrived'],
    description: 'Patient arrival confirmed at receiving facility',
  },
  {
    key: 'Seen',
    label: 'Seen',
    matchStatuses: ['Seen'],
    description: 'Clinical evaluation by receiving medical officer',
  },
  {
    key: 'Treated',
    label: 'Treated',
    matchStatuses: ['Treated'],
    description: 'Definitive clinical management completed',
  },
  {
    key: 'Follow-up',
    label: 'Follow-up / Back-referred',
    matchStatuses: ['Follow-up', 'Back-referred'],
    description: 'Closed-loop feedback & follow-up plan sent to PHC',
  },
];

export const ReferralTimelineCard: React.FC<ReferralTimelineCardProps> = ({
  referral,
  events,
}) => {
  const referralEvents = events
    .filter(
      (e) => e.referral_id.toUpperCase() === referral.referral_id.toUpperCase()
    )
    .slice()
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const getStepEvent = (matchStatuses: ReferralStatus[]): StatusEvent | undefined => {
    for (let i = referralEvents.length - 1; i >= 0; i--) {
      if (matchStatuses.includes(referralEvents[i].status)) {
        return referralEvents[i];
      }
    }
    return undefined;
  };

  return (
    <div
      data-testid={`timeline-card-${referral.referral_id}`}
      className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4"
      aria-label={`Referral pathway timeline for ${referral.referral_id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#062B78]">
            Referral Pathway
          </h3>
          <p className="text-xs font-semibold text-[#475569] mt-0.5">
            Create → Refer → Arrive → Seen → Treated → Follow-up
          </p>
        </div>
        <SyncStateBadge syncStatus={referral.sync_status} />
      </div>

      {/* Origin Facility Header in Pathway */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#F7F9FC] border border-[#CBD5E1] text-xs font-bold text-[#10213F]">
        <Building2 className="w-4 h-4 text-[#062B78] shrink-0" aria-hidden="true" />
        <span>Origin:</span>
        <span className="font-extrabold text-[#031B4E]">{referral.referring_facility}</span>
        <span className="text-[#475569]">→</span>
        <span className="font-extrabold text-[#062B78]">{referral.receiving_facility}</span>
      </div>

      {/* Vertical Clinical Pathway */}
      <div className="flex flex-col">
        {PATHWAY_STEPS.map((step, index) => {
          const event = getStepEvent(step.matchStatuses);
          const isCompleted = Boolean(event);
          const isCurrent = step.matchStatuses.includes(referral.current_status);
          const displayStatus =
            event && step.matchStatuses.length > 1
              ? event.status.toUpperCase()
              : step.label.toUpperCase();

          return (
            <React.Fragment key={step.key}>
              <div
                data-testid={`pathway-step-${step.key}`}
                className={`p-3.5 rounded-xl border transition-all ${
                  isCurrent
                    ? 'bg-[#DDF7F4] border-2 border-[#062B78] shadow-xs'
                    : isCompleted
                      ? 'bg-[#F7F9FC] border-[#CBD5E1]'
                      : 'bg-[#FFFFFF] border-[#E2E8F0]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 mt-0.5 ${
                        isCurrent
                          ? 'bg-[#062B78] text-[#FFFFFF] ring-2 ring-[#0878F9]/30'
                          : isCompleted
                            ? 'bg-[#085E56] text-[#FFFFFF]'
                            : 'bg-[#F7F9FC] text-[#475569] border border-[#94A3B8]'
                      }`}
                      aria-hidden="true"
                    >
                      {isCompleted ? (
                        <Check className="w-4 h-4 stroke-[2.75]" />
                      ) : isCurrent ? (
                        <CircleDot className="w-4 h-4" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm font-extrabold tracking-tight ${
                            isCurrent
                              ? 'text-[#031B4E]'
                              : isCompleted
                                ? 'text-[#10213F]'
                                : 'text-[#475569]'
                          }`}
                        >
                          {isCompleted ? `✓ ${displayStatus}` : `${step.label} — Pending`}
                        </span>

                        {isCurrent && (
                          <span className="px-2 py-0.5 text-[11px] font-extrabold uppercase rounded-md bg-[#062B78] text-[#FFFFFF]">
                            Current State
                          </span>
                        )}
                      </div>

                      {event ? (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-xs font-bold text-[#062B78]">
                            {event.facility_id}
                          </p>
                          <p className="text-xs font-mono font-semibold text-[#475569]">
                            {formatShortTimestamp(event.timestamp)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-[#475569] font-medium mt-0.5">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {event && (
                    <div className="shrink-0">
                      <SyncStateBadge syncStatus={event.sync_status} />
                    </div>
                  )}
                </div>
              </div>

              {index < PATHWAY_STEPS.length - 1 && (
                <div
                  className="flex items-center pl-6 py-1 text-[#062B78] font-bold text-xs"
                  aria-hidden="true"
                >
                  <ArrowDown className="w-4 h-4" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
