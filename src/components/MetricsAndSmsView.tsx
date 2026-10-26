import React from 'react';
import {
  AlertTriangle,
  Clock,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import {
  DashboardMetrics,
  Referral,
  SmsFallbackMessage,
  StatusEvent,
} from '../types/referral';
import { calculateDashboardMetrics } from '../core/referralEngine';
import { formatShortTimestamp } from './ReferralTimelineCard';

interface MetricsAndSmsViewProps {
  referrals: Referral[];
  events: StatusEvent[];
  smsLogs: SmsFallbackMessage[];
  onResetDemoData: () => void;
  onSelectReferralFromSms: (referralId: string) => void;
}

export const MetricsAndSmsView: React.FC<MetricsAndSmsViewProps> = ({
  referrals,
  events,
  smsLogs,
  onResetDemoData,
  onSelectReferralFromSms,
}) => {
  const metrics: DashboardMetrics = calculateDashboardMetrics(
    referrals,
    events
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Dashboard Metrics & Simulated SMS Fallback
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Live referral-feedback loop calculations and low-bandwidth SMS
            fallback queue.
          </p>
        </div>

        <button
          type="button"
          onClick={onResetDemoData}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors min-h-[40px]"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Synthetic Dataset</span>
        </button>
      </div>

      {/* Prominent Mandatory DEMO / SYNTHETIC DATA Disclaimer Banner */}
      <div
        data-testid="demo-synthetic-metrics-banner"
        className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3"
      >
        <AlertTriangle className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-950 leading-relaxed">
          <strong className="font-bold">
            DEMO / SYNTHETIC DATA — NOT CLINICAL OUTCOMES OR PILOT RESULTS:
          </strong>{' '}
          All figures below are computed dynamically from the synthetic
          prototype dataset (SYN-001, SYN-002, etc.). Xareloop is a prototype
          under development and has not been clinically deployed or piloted.
        </div>
      </div>

      {/* 5 Required Dashboard Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">
            Total Referrals
          </div>
          <div
            data-testid="metric-total-referrals"
            className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums"
          >
            {metrics.total_referrals}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Synthetic records (DEMO)
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">
            Confirmed Arrival
          </div>
          <div
            data-testid="metric-confirmed-arrivals"
            className="mt-2 font-mono text-3xl font-bold text-teal-800 tabular-nums"
          >
            {metrics.confirmed_arrivals}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Reached receiving facility
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">
            With First Status Update
          </div>
          <div
            data-testid="metric-first-status-update"
            className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums"
          >
            {metrics.with_first_status_update}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Feedback loop initiated
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">
            Follow-up Recorded
          </div>
          <div
            data-testid="metric-follow-up-recorded"
            className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums"
          >
            {metrics.with_follow_up}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Marked Follow-up in loop
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">
            Avg Time to First Update
          </div>
          <div
            data-testid="metric-avg-time"
            className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums"
          >
            {metrics.avg_minutes_to_first_update !== null
              ? `${metrics.avg_minutes_to_first_update}m`
              : 'N/A'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Creation to 1st hospital tap
          </div>
        </div>
      </div>

      {/* Simulated SMS Fallback Queue & Log */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Simulated SMS Fallback Queue ({smsLogs.length})
            </h2>
            <p className="text-xs text-slate-500">
              Low-bandwidth text dispatches generated on referral status updates
              (Prototype simulation — no external SMS gateway required).
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            Format: “Xareloop: Referral XL-XXXX has been marked STATUS at
            FACILITY.”
          </span>
        </div>

        {smsLogs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No simulated SMS messages recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {smsLogs.map((sms) => (
              <div
                key={sms.sms_id}
                className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <MessageSquare className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-slate-900">
                      {sms.message}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{formatShortTimestamp(sms.timestamp)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Facility: {sms.facility_id}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-xs font-medium ${
                      sms.delivery_state === 'Queued offline'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {sms.delivery_state}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectReferralFromSms(sms.referral_id)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 min-h-[32px]"
                  >
                    Open {sms.referral_id}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
