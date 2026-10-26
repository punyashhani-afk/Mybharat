import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  CloudOff,
  Plus,
  QrCode,
  Search,
} from 'lucide-react';
import {
  InAppNotification,
  Referral,
  REFERRAL_STATUSES,
  ReferralStatus,
  StatusEvent,
} from '../types/referral';
import { REFERRING_FACILITIES } from '../data/syntheticData';
import { getReferralTimeline } from '../core/referralEngine';
import {
  formatShortTimestamp,
  ReferralTimelineCard,
} from './ReferralTimelineCard';

interface ReferringDashboardProps {
  referrals: Referral[];
  events: StatusEvent[];
  notifications: InAppNotification[];
  selectedReferralId: string;
  onSelectReferral: (referralId: string) => void;
  onCreateNewClick: () => void;
  onViewQr: (referral: Referral) => void;
  onOpenInReceiving: (referralId: string) => void;
  onMarkNotificationRead: (notificationId: string) => void;
  defaultFacilityFilter?: string;
}

export const ReferringDashboard: React.FC<ReferringDashboardProps> = ({
  referrals,
  events,
  notifications,
  selectedReferralId,
  onSelectReferral,
  onCreateNewClick,
  onViewQr,
  onOpenInReceiving,
  onMarkNotificationRead,
  defaultFacilityFilter = 'ALL',
}) => {
  const [facilityFilter, setFacilityFilter] = useState<string>(
    defaultFacilityFilter
  );
  const [statusFilter, setStatusFilter] = useState<ReferralStatus | 'ALL'>(
    'ALL'
  );
  const [searchQuery, setSearchQuery] = useState('');

  const filteredReferrals = useMemo(() => {
    return referrals.filter((r) => {
      if (
        facilityFilter !== 'ALL' &&
        r.referring_facility !== facilityFilter
      ) {
        return false;
      }
      if (statusFilter !== 'ALL' && r.current_status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesId = r.referral_id.toLowerCase().includes(q);
        const matchesPatient = r.patient_code.toLowerCase().includes(q);
        const matchesCategory = r.referral_category.toLowerCase().includes(q);
        const matchesReceiving = r.receiving_facility.toLowerCase().includes(q);
        if (
          !matchesId &&
          !matchesPatient &&
          !matchesCategory &&
          !matchesReceiving
        ) {
          return false;
        }
      }
      return true;
    });
  }, [referrals, facilityFilter, statusFilter, searchQuery]);

  const activeReferral = useMemo(() => {
    const found = filteredReferrals.find(
      (r) => r.referral_id === selectedReferralId
    );
    if (found) return found;
    return filteredReferrals[0] || referrals[0] || null;
  }, [filteredReferrals, referrals, selectedReferralId]);

  const activeTimeline = useMemo(() => {
    if (!activeReferral) return [];
    return getReferralTimeline(events, activeReferral.referral_id);
  }, [events, activeReferral]);

  const unreadAlerts = useMemo(() => {
    return notifications
      .filter(
        (n) =>
          !n.read &&
          (facilityFilter === 'ALL' || n.target_facility === facilityFilter)
      )
      .slice(0, 3);
  }, [notifications, facilityFilter]);

  return (
    <div className="space-y-6">
      {/* Header & Controls Row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Referring Facility Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Track outbound PHC/CHC referrals, receiving-hospital status updates,
            and complete chronological referral loops.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="referring-facility-select" className="sr-only">
              Filter by Referring Facility
            </label>
            <select
              id="referring-facility-select"
              value={facilityFilter}
              onChange={(e) => setFacilityFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 focus:border-teal-700 focus:outline-none min-h-[40px]"
            >
              <option value="ALL">All Referring Facilities</option>
              {REFERRING_FACILITIES.map((fac) => (
                <option key={fac} value={fac}>
                  {fac}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onCreateNewClick}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>Create Referral</span>
          </button>
        </div>
      </div>

      {/* In-App Notification Visual Indicator Strip for Referring Facility */}
      {unreadAlerts.length > 0 && (
        <div
          className="rounded-xl border border-teal-200 bg-teal-50/60 p-4"
          role="region"
          aria-label="Recent Receiving Facility Updates"
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
              <BellRing className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                New Receiving Facility Feedback ({unreadAlerts.length} unread)
              </span>
            </div>
            <span className="text-xs text-teal-800">
              In-app notification feed
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {unreadAlerts.map((alert) => (
              <div
                key={alert.notification_id}
                className="rounded-lg border border-teal-200/80 bg-white p-3 flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-bold text-slate-900">
                      {alert.referral_id}
                    </span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {formatShortTimestamp(alert.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-teal-900">
                    Marked {alert.status} at {alert.actor_facility}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">
                    {alert.message}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectReferral(alert.referral_id);
                      onMarkNotificationRead(alert.notification_id);
                    }}
                    className="text-xs font-semibold text-teal-800 hover:underline"
                  >
                    Inspect Timeline
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onMarkNotificationRead(alert.notification_id)
                    }
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Mark read
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Segmented Status Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by ID (XL-1001), synthetic code (SYN-001), or category..."
            aria-label="Filter referrals"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:bg-white focus:outline-none min-h-[38px]"
          />
        </div>

        {/* Interactive Filter Controls */}
        <div
          className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
          role="group"
          aria-label="Filter by referral status"
        >
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[32px] ${
              statusFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({referrals.length})
          </button>
          {REFERRAL_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[32px] ${
                statusFilter === status
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Main 2-Column Split: Left Referrals Table/List + Right Selected Referral Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Referral List */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-slate-800">
              Outbound Referrals ({filteredReferrals.length})
            </span>
            <span>Select a referral to view full timeline</span>
          </div>

          {filteredReferrals.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-slate-800">
                No referrals match your current filter.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Try clearing the search query or create a new synthetic
                referral.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFacilityFilter('ALL');
                  setStatusFilter('ALL');
                  setSearchQuery('');
                }}
                className="mt-4 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px]"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredReferrals.map((ref) => {
                const isSelected =
                  activeReferral?.referral_id === ref.referral_id;
                const refEvents = getReferralTimeline(events, ref.referral_id);
                const isOffline = ref.sync_status === 'Saved offline';

                return (
                  <div
                    key={ref.referral_id}
                    className={`p-4 transition-colors ${
                      isSelected ? 'bg-teal-50/40' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectReferral(ref.referral_id)}
                        className="flex-1 text-left min-w-[200px] focus:outline-none"
                      >
                        {/* Clean unboxed metadata row */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span className="font-mono font-bold text-slate-900 text-sm">
                            {ref.referral_id}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-medium text-slate-700">
                            {ref.patient_code}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              ref.priority === 'Emergency'
                                ? 'font-semibold text-red-700'
                                : ref.priority === 'Urgent'
                                  ? 'font-semibold text-amber-700'
                                  : 'text-slate-600'
                            }
                          >
                            {ref.priority}
                          </span>
                          <span aria-hidden="true">·</span>
                          {isOffline ? (
                            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                              <CloudOff className="w-3 h-3" />
                              Saved offline
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                              <CheckCircle2 className="w-3 h-3" />
                              Synced
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {ref.referral_category}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                          <span>{ref.referring_facility}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-800">
                            {ref.receiving_facility}
                          </span>
                        </div>

                        {/* Inline Timeline Trail: Referred → Arrived → Seen → ... */}
                        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                          {refEvents.map((e, i) => (
                            <React.Fragment key={e.event_id}>
                              {i > 0 && (
                                <span
                                  className="text-slate-300"
                                  aria-hidden="true"
                                >
                                  →
                                </span>
                              )}
                              <span
                                className={
                                  i === refEvents.length - 1
                                    ? 'font-semibold text-teal-800'
                                    : 'text-slate-600'
                                }
                              >
                                {e.status}
                              </span>
                            </React.Fragment>
                          ))}
                        </div>
                      </button>

                      {/* Right Status & Quick Actions */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-900">
                            Status: {ref.current_status}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                            Updated {formatShortTimestamp(ref.last_updated_at)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewQr(ref)}
                            aria-label={`Show QR for ${ref.referral_id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 min-h-[36px]"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>QR</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenInReceiving(ref.referral_id)}
                            aria-label={`Update status for ${ref.referral_id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-teal-700 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-900 hover:bg-teal-100 min-h-[36px]"
                          >
                            <span>Receiving View</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 5 Columns: Selected Referral Chronological Timeline */}
        <div className="lg:col-span-5">
          {activeReferral ? (
            <ReferralTimelineCard
              referral={activeReferral}
              events={activeTimeline}
              onViewQr={onViewQr}
              onOpenInReceiving={onOpenInReceiving}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              Select a referral from the list to inspect its timeline.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
