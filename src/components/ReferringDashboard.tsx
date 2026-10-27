import React, { useState } from 'react';
import {
  Plus,
  QrCode,
  Bell,
  X,
  ArrowRight,
  Building2,
  Clock,
  Inbox,
  ShieldCheck,
  ScanLine,
} from 'lucide-react';
import type {
  InAppNotification,
  Referral,
  StatusEvent,
  UserAccount,
} from '../types/referral';
import { hasUnseenStatusUpdate, getStaffRole } from '../core/referralEngine';
import {
  formatShortTimestamp,
  PriorityBadge,
  StatusBadge,
  SyncStateBadge,
} from './ReferralTimelineCard';

interface ReferringDashboardProps {
  currentUser: UserAccount;
  referrals: Referral[];
  events: StatusEvent[];
  pendingSyncCount: number;
  canCreateReferrals: boolean;
  canUpdateStatus: boolean;
  notifications: InAppNotification[];
  onCreateNewClick: () => void;
  onOpenScannerClick: () => void;
  onViewReferral: (referral: Referral) => void;
  onShowQrModal: (referral: Referral) => void;
  onDismissNotification: (notificationId: string) => void;
  onOpenAuthModal: () => void;
}

type FilterOption = 'ALL' | 'UNSEEN' | 'EMERGENCY' | 'AWAITING_ARRIVAL' | 'FOLLOW_UP';

export const ReferringDashboard: React.FC<ReferringDashboardProps> = ({
  currentUser,
  referrals,
  pendingSyncCount,
  canCreateReferrals,
  notifications,
  onCreateNewClick,
  onOpenScannerClick,
  onViewReferral,
  onShowQrModal,
  onDismissNotification,
  onOpenAuthModal,
}) => {
  const [filter, setFilter] = useState<FilterOption>('ALL');

  const role = getStaffRole(currentUser);
  const isReferringRole = currentUser.facility_type === 'referring';

  // Summary card counts
  const activeCount = referrals.length;
  const awaitingArrivalCount = referrals.filter(
    (r) => r.current_status === 'Referred'
  ).length;
  const seenCount = referrals.filter(
    (r) => r.current_status === 'Seen' || r.current_status === 'Treated'
  ).length;
  const followUpDueCount = referrals.filter(
    (r) => r.current_status === 'Follow-up'
  ).length;

  const unreadNotifications = notifications.filter((n) => !n.read);

  const filteredReferrals = referrals.filter((r) => {
    if (filter === 'UNSEEN') return hasUnseenStatusUpdate(r);
    if (filter === 'EMERGENCY') return r.priority === 'Emergency';
    if (filter === 'AWAITING_ARRIVAL') return r.current_status === 'Referred';
    if (filter === 'FOLLOW_UP')
      return (
        r.current_status === 'Follow-up' || r.current_status === 'Back-referred'
      );
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Top Facility Greeting & Role Identification Card */}
      <section
        data-testid="dashboard-greeting-card"
        className="bg-[#FFFFFF] rounded-2xl border border-[#E2E8F0] p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#DDF7F4] border border-[#085E56] text-[#031B4E] text-xs font-extrabold">
              <ShieldCheck className="w-3.5 h-3.5 text-[#085E56]" aria-hidden="true" />
              <span data-testid="current-role-badge">
                {isReferringRole ? 'Referring Facility' : 'Receiving Facility'} •{' '}
                {role}
              </span>
            </div>
            <h1
              data-testid="dashboard-facility-greeting"
              className="text-xl sm:text-2xl font-extrabold text-[#031B4E] tracking-tight pt-1"
            >
              Good morning, {currentUser.facility_name}
            </h1>
            <p className="text-xs font-semibold text-[#475569]">
              Create → Refer → Arrive → Seen → Treated → Follow-up
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenAuthModal}
            data-testid="dashboard-switch-role-btn"
            className="px-3.5 py-2 min-h-[40px] rounded-xl border border-[#062B78] bg-[#F7F9FC] hover:bg-[#EFF6FF] text-[#062B78] text-xs font-extrabold transition-colors cursor-pointer"
          >
            Switch Role / Facility
          </button>
        </div>

        {/* Role-aware Primary Action Button */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {canCreateReferrals ? (
            <button
              type="button"
              onClick={onCreateNewClick}
              data-testid="new-referral-button"
              className="w-full py-3.5 px-5 min-h-[48px] rounded-xl bg-[#062B78] hover:bg-[#031B4E] text-[#FFFFFF] font-extrabold text-sm shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-5 h-5 text-[#10B9A8]" strokeWidth={2.75} aria-hidden="true" />
              <span>New Referral</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              data-testid="role-create-restricted-banner"
              className="w-full py-3 px-4 min-h-[48px] rounded-xl bg-[#F7F9FC] border border-[#94A3B8] text-[#10213F] text-xs font-extrabold flex items-center justify-center gap-2 hover:bg-[#E2E8F0] transition-colors cursor-pointer"
            >
              <span>Receiving Role Active — Switch to Referring Facility to Create</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenScannerClick}
            data-testid="dashboard-scan-qr-cta"
            className="w-full py-3.5 px-5 min-h-[48px] rounded-xl border-2 border-[#062B78] bg-[#FFFFFF] hover:bg-[#EFF6FF] text-[#062B78] font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ScanLine className="w-5 h-5 text-[#0878F9]" aria-hidden="true" />
            <span>Scan QR / Lookup Referral</span>
          </button>
        </div>
      </section>

      {/* 5 Useful Summary Cards */}
      <section aria-label="Referral Summary Metrics">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            data-testid="summary-active-referrals"
            className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
              filter === 'ALL'
                ? 'bg-[#FFFFFF] border-2 border-[#062B78] shadow-xs'
                : 'bg-[#FFFFFF] border-[#E2E8F0] hover:border-[#94A3B8]'
            }`}
          >
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#475569]">
              Active Referrals
            </span>
            <span className="mt-1 block text-2xl font-mono font-extrabold text-[#031B4E] tabular-nums">
              {activeCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('AWAITING_ARRIVAL')}
            data-testid="summary-awaiting-arrival"
            className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
              filter === 'AWAITING_ARRIVAL'
                ? 'bg-[#FFFFFF] border-2 border-[#062B78] shadow-xs'
                : 'bg-[#FFFFFF] border-[#E2E8F0] hover:border-[#94A3B8]'
            }`}
          >
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#475569]">
              Awaiting Arrival
            </span>
            <span className="mt-1 block text-2xl font-mono font-extrabold text-[#062B78] tabular-nums">
              {awaitingArrivalCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('ALL')}
            data-testid="summary-seen"
            className="text-left p-3.5 rounded-xl bg-[#FFFFFF] border border-[#E2E8F0] hover:border-[#94A3B8] transition-all cursor-pointer"
          >
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#475569]">
              Seen / Treated
            </span>
            <span className="mt-1 block text-2xl font-mono font-extrabold text-[#085E56] tabular-nums">
              {seenCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('FOLLOW_UP')}
            data-testid="summary-followup-due"
            className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
              filter === 'FOLLOW_UP'
                ? 'bg-[#FFFFFF] border-2 border-[#062B78] shadow-xs'
                : 'bg-[#FFFFFF] border-[#E2E8F0] hover:border-[#94A3B8]'
            }`}
          >
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#475569]">
              Follow-up Due
            </span>
            <span className="mt-1 block text-2xl font-mono font-extrabold text-[#78350F] tabular-nums">
              {followUpDueCount}
            </span>
          </button>

          <div
            data-testid="summary-pending-sync"
            className={`col-span-2 sm:col-span-1 p-3.5 rounded-xl border ${
              pendingSyncCount > 0
                ? 'bg-[#FEF3C7] border-[#D97706]'
                : 'bg-[#DDF7F4]/70 border-[#085E56]'
            }`}
          >
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#031B4E]">
              Pending Sync
            </span>
            <span className="mt-1 block text-2xl font-mono font-extrabold text-[#031B4E] tabular-nums">
              {pendingSyncCount}
            </span>
          </div>
        </div>
      </section>

      {/* In-App Notifications Section */}
      {unreadNotifications.length > 0 && (
        <section
          aria-label="Referral Status Update Notifications"
          className="space-y-2"
        >
          {unreadNotifications.slice(0, 3).map((notif) => {
            const matchedReferral = referrals.find(
              (r) =>
                r.referral_id.toUpperCase() === notif.referral_id.toUpperCase()
            );
            return (
              <div
                key={notif.notification_id}
                data-testid={`notification-alert-${notif.referral_id}`}
                className="p-4 rounded-2xl bg-[#DDF7F4] border-2 border-[#085E56] text-[#031B4E] shadow-xs flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-xl bg-[#062B78] text-[#FFFFFF] flex items-center justify-center shrink-0 mt-0.5">
                    <Bell className="w-4 h-4 text-[#10B9A8]" aria-hidden="true" />
                  </span>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#062B78]">
                        Referral update
                      </span>
                      <SyncStateBadge
                        syncStatus={matchedReferral?.sync_status || 'Synced'}
                      />
                    </div>
                    <p className="text-sm font-extrabold text-[#031B4E]">
                      {notif.referral_id} was marked{' '}
                      <span className="underline decoration-[#085E56]">
                        {notif.status.toUpperCase()}
                      </span>
                      .
                    </p>
                    <p className="text-xs font-bold text-[#10213F]">
                      {notif.actor_facility} •{' '}
                      <span className="font-mono text-[#475569]">
                        {formatShortTimestamp(notif.timestamp)}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {matchedReferral && (
                    <button
                      type="button"
                      onClick={() => onViewReferral(matchedReferral)}
                      className="px-3 py-1.5 min-h-[38px] rounded-xl bg-[#062B78] text-[#FFFFFF] text-xs font-extrabold hover:bg-[#031B4E] cursor-pointer"
                    >
                      View {notif.referral_id}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDismissNotification(notif.notification_id)}
                    className="p-2 min-h-[38px] min-w-[38px] rounded-xl text-[#031B4E] hover:bg-[#c5f0eb] flex items-center justify-center cursor-pointer"
                    aria-label={`Dismiss notification for ${notif.referral_id}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Recent Referrals Header & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#031B4E]">
          Recent Referrals ({filteredReferrals.length})
        </h2>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'ALL', label: 'All' },
              { id: 'UNSEEN', label: '! New Updates' },
              { id: 'EMERGENCY', label: '! Emergency' },
              { id: 'AWAITING_ARRIVAL', label: 'Awaiting Arrival' },
              { id: 'FOLLOW_UP', label: 'Follow-up' },
            ] as { id: FilterOption; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-extrabold border transition-colors cursor-pointer ${
                filter === tab.id
                  ? 'bg-[#062B78] text-[#FFFFFF] border-[#031B4E]'
                  : 'bg-[#FFFFFF] text-[#10213F] border-[#CBD5E1] hover:bg-[#F7F9FC]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {filteredReferrals.length === 0 ? (
        <div
          data-testid="empty-referrals-state"
          className="bg-[#FFFFFF] rounded-2xl border border-[#E2E8F0] p-8 text-center space-y-3"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#F7F9FC] border border-[#CBD5E1] flex items-center justify-center mx-auto">
            <Inbox className="w-6 h-6 text-[#062B78]" aria-hidden="true" />
          </div>
          <h3 className="text-base font-extrabold text-[#031B4E]">
            No active referrals
          </h3>
          <p className="text-xs font-medium text-[#475569] max-w-sm mx-auto">
            New referrals created by this facility will appear here.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            {filter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#062B78] text-[#062B78] text-xs font-extrabold hover:bg-[#EFF6FF] cursor-pointer"
              >
                Show All Referrals
              </button>
            )}
            {canCreateReferrals && (
              <button
                type="button"
                onClick={onCreateNewClick}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#062B78] text-[#FFFFFF] text-xs font-extrabold hover:bg-[#031B4E] cursor-pointer"
              >
                + Create Referral
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Recent Referrals Card List */
        <div className="space-y-3">
          {filteredReferrals.map((referral) => {
            const isUnseen = hasUnseenStatusUpdate(referral);

            return (
              <article
                key={referral.referral_id}
                data-testid={`referral-row-${referral.referral_id}`}
                className={`bg-[#FFFFFF] rounded-2xl border p-4 sm:p-5 transition-all space-y-3.5 shadow-xs ${
                  isUnseen
                    ? 'border-2 border-[#0878F9] ring-2 ring-[#0878F9]/15'
                    : 'border-[#E2E8F0] hover:border-[#94A3B8]'
                }`}
              >
                {/* Top Row: Referral ID, Synthetic Patient ID, Priority, Current Status */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-mono font-extrabold text-[#062B78] bg-[#F7F9FC] px-3 py-1 rounded-lg border border-[#CBD5E1]">
                      {referral.referral_id}
                    </span>

                    <span className="text-sm font-mono font-extrabold text-[#10213F]">
                      Patient: {referral.patient_code}
                    </span>

                    <PriorityBadge priority={referral.priority} />

                    {isUnseen && (
                      <span
                        data-testid={`unseen-badge-${referral.referral_id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-[#062B78] text-[#FFFFFF]"
                      >
                        ! NEW UPDATE
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge status={referral.current_status} />
                    <SyncStateBadge syncStatus={referral.sync_status} />
                  </div>
                </div>

                {/* Middle Row: Referring Facility → Receiving Facility & Category */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[#F7F9FC] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0]">
                  <div className="flex items-center gap-1.5 font-bold text-[#10213F] flex-wrap">
                    <Building2 className="w-3.5 h-3.5 text-[#062B78] shrink-0" aria-hidden="true" />
                    <span>{referral.referring_facility}</span>
                    <span className="text-[#0878F9] font-extrabold">→</span>
                    <span className="font-extrabold text-[#031B4E]">
                      {referral.receiving_facility}
                    </span>
                  </div>

                  <span className="font-bold text-[#475569]">
                    {referral.referral_category}
                  </span>
                </div>

                {/* Bottom Row: Last Updated Time & Clear "View Referral" Action */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#475569]">
                    <Clock className="w-3.5 h-3.5 text-[#062B78] shrink-0" aria-hidden="true" />
                    <span>
                      Last updated:{' '}
                      <strong className="font-mono text-[#10213F]">
                        {formatShortTimestamp(referral.last_updated_at)}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onShowQrModal(referral)}
                      data-testid={`show-qr-${referral.referral_id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-[#062B78] bg-[#FFFFFF] text-xs font-extrabold text-[#062B78] hover:bg-[#EFF6FF] transition-colors cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5 text-[#0878F9]" aria-hidden="true" />
                      <span>Show QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onViewReferral(referral)}
                      data-testid={`view-referral-${referral.referral_id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-[#062B78] hover:bg-[#031B4E] text-[#FFFFFF] text-xs font-extrabold transition-colors cursor-pointer"
                    >
                      <span>View Referral</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#10B9A8]" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
