import React from 'react';
import { BellRing, Lock, Plus, QrCode, X } from 'lucide-react';
import {
  InAppNotification,
  Referral,
  RolePermissions,
  StatusEvent,
} from '../types/referral';
import {
  getReferralTimeline,
  hasUnseenStatusUpdate,
} from '../core/referralEngine';
import {
  formatShortTimestamp,
  ReferralTimelineCard,
} from './ReferralTimelineCard';

interface ReferringDashboardProps {
  referrals: Referral[];
  events: StatusEvent[];
  notifications: InAppNotification[];
  permissions: RolePermissions;
  selectedReferralId: string;
  onSelectReferral: (referralId: string, markViewed?: boolean) => void;
  onCreateNewClick: () => void;
  onViewQr: (referral: Referral) => void;
  onMarkNotificationRead: (notificationId: string) => void;
  onSwitchToReferringStaff: () => void;
  onGoToScanUpdate: () => void;
}

export const ReferringDashboard: React.FC<ReferringDashboardProps> = ({
  referrals,
  events,
  notifications,
  permissions,
  selectedReferralId,
  onSelectReferral,
  onCreateNewClick,
  onViewQr,
  onMarkNotificationRead,
  onSwitchToReferringStaff,
  onGoToScanUpdate,
}) => {
  // Enforce RBAC: Only Referring Staff can view dashboards and create referrals
  if (!permissions.canViewDashboard) {
    return (
      <div
        role="region"
        aria-label="Referring Staff Permission Required"
        data-testid="referring-dashboard-role-guard"
        className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-xs space-y-4"
      >
        <div className="mx-auto w-11 h-11 rounded-xl bg-teal-50 border border-teal-200/80 flex items-center justify-center">
          <Lock className="w-5 h-5 text-teal-800" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-slate-900">
            Referring Staff Access Only
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            You are signed in as <strong>Receiving Staff</strong>, who can scan
            QR codes and update referral statuses. Switch to{' '}
            <strong>Referring Staff</strong> to view the referring dashboard or
            create referrals.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            data-testid="go-to-scan-update-btn"
            onClick={onGoToScanUpdate}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B5E5E] to-[#0F766E] px-4 py-3 text-xs font-bold text-white shadow-xs hover:from-[#094D4D] hover:to-[#0D655E] transition-all min-h-[44px]"
          >
            <QrCode className="w-4 h-4" />
            <span>Open Scan / Update</span>
          </button>
          <button
            type="button"
            data-testid="switch-to-referring-staff-btn"
            onClick={onSwitchToReferringStaff}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors min-h-[44px]"
          >
            Switch to Referring Staff
          </button>
        </div>
      </div>
    );
  }

  const selectedReferral =
    referrals.find((r) => r.referral_id === selectedReferralId) ||
    referrals[0] ||
    null;

  const selectedTimeline = selectedReferral
    ? getReferralTimeline(events, selectedReferral.referral_id)
    : [];

  const unreadAlerts = notifications.filter((n) => !n.read);
  const latestAlert = unreadAlerts[0] || null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Top Action Row: Heading + Primary New Referral Action */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Active Referrals
          </h1>
          <p className="text-xs text-slate-500">
            Tap any referral card to view its timeline or QR code
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateNewClick}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0B5E5E] to-[#0F766E] px-5 py-3 text-sm font-bold text-white shadow-xs hover:from-[#094D4D] hover:to-[#0D655E] transition-all min-h-[48px]"
        >
          <Plus className="w-4 h-4" />
          <span>New Referral</span>
        </button>
      </div>

      {/* In-App Notification Visual Alert when a referral status is updated by a receiving facility */}
      {latestAlert && (
        <div
          role="status"
          data-testid="dashboard-notification-alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-300/90 bg-teal-50/90 px-4 py-3 text-xs text-teal-950 shadow-2xs"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white">
              <BellRing className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <div className="font-bold text-teal-950">
                Status Update Alert: {latestAlert.referral_id} (
                {latestAlert.patient_code}) marked {latestAlert.status}
              </div>
              <div className="text-teal-800 truncate">
                Updated by {latestAlert.actor_facility} ·{' '}
                {formatShortTimestamp(latestAlert.timestamp)}
                {unreadAlerts.length > 1
                  ? ` (+${unreadAlerts.length - 1} more unread)`
                  : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onSelectReferral(latestAlert.referral_id, true);
                onMarkNotificationRead(latestAlert.notification_id);
              }}
              className="rounded-lg bg-teal-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-900 transition-colors min-h-[34px]"
            >
              View
            </button>
            <button
              type="button"
              aria-label="Dismiss notification alert"
              onClick={() => onMarkNotificationRead(latestAlert.notification_id)}
              className="rounded-lg p-1.5 text-teal-800 hover:bg-teal-100 transition-colors min-h-[34px] min-w-[34px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Simple Active Referral Cards */}
      <div className="space-y-3">
        {referrals.map((ref) => {
          const isSelected = selectedReferral?.referral_id === ref.referral_id;
          const isUnseen = hasUnseenStatusUpdate(ref);

          return (
            <div key={ref.referral_id} className="space-y-2.5">
              <button
                type="button"
                data-testid={`referral-row-${ref.referral_id}`}
                data-unseen-update={isUnseen ? 'true' : 'false'}
                onClick={() => onSelectReferral(ref.referral_id, true)}
                className={`w-full text-left rounded-xl border p-4 transition-all ${
                  isSelected
                    ? 'border-teal-700 bg-teal-50/35 shadow-xs'
                    : isUnseen
                      ? 'border-amber-300 bg-amber-50/40 hover:bg-amber-50/70'
                      : 'border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-center">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Patient Code
                    </div>
                    <div className="mt-0.5 font-mono text-base font-bold text-slate-900">
                      {ref.patient_code}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Referral ID
                    </div>
                    <div className="mt-0.5 font-mono text-base font-bold text-teal-800">
                      {ref.referral_id}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Current Status
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-900">
                        {ref.current_status}
                      </span>
                      {isUnseen && (
                        <span
                          className="inline-block w-2 h-2 rounded-full bg-amber-500"
                          title="Updated since last viewed"
                        />
                      )}
                    </div>
                  </div>

                  <div className="sm:text-right">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Last Updated
                    </div>
                    <div className="mt-0.5 font-mono text-xs font-medium text-slate-700 tabular-nums">
                      {formatShortTimestamp(ref.last_updated_at)}
                    </div>
                    {ref.sync_status === 'Saved offline' && (
                      <div className="text-xs font-semibold text-amber-700">
                        Saved offline
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {isSelected && (
                <ReferralTimelineCard
                  referral={ref}
                  events={selectedTimeline}
                  onViewQr={onViewQr}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
