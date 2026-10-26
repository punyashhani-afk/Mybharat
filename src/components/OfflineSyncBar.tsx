import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CloudOff,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  InAppNotification,
  SyncQueueItem,
  UserAccount,
} from '../types/referral';
import { PWAInstallButton } from './PWAInstallButton';
import { formatShortTimestamp } from './ReferralTimelineCard';

interface OfflineSyncBarProps {
  isEffectiveOffline: boolean;
  simulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
  syncQueue: SyncQueueItem[];
  isSyncing: boolean;
  lastSyncMessage: string | null;
  onSyncNow: () => void;
  currentUser: UserAccount;
  onOpenAuthModal: () => void;
  notifications: InAppNotification[];
  onMarkNotificationRead: (notificationId: string) => void;
  onMarkAllNotificationsRead: () => void;
  onOpenReferralFromNotification: (referralId: string) => void;
}

export const OfflineSyncBar: React.FC<OfflineSyncBarProps> = ({
  isEffectiveOffline,
  simulatedOffline,
  onToggleSimulatedOffline,
  syncQueue,
  isSyncing,
  lastSyncMessage,
  onSyncNow,
  currentUser,
  onOpenAuthModal,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onOpenReferralFromNotification,
}) => {
  const [showQueueDrawer, setShowQueueDrawer] = useState(false);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);

  const facilityNotifications = notifications;
  const unreadCount = facilityNotifications.filter((n) => !n.read).length;

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Mandatory Prototype Disclaimer */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
          <span className="font-semibold text-slate-900">
            Prototype — Not for Clinical Use
          </span>
          <span className="text-slate-400" aria-hidden="true">
            ·
          </span>
          <span>All patient information shown is synthetic.</span>
        </div>

        {/* Right Controls: User Facility Session, In-App Notifications, Connectivity & Offline Sync Queue */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Facility User Button */}
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
          >
            <UserCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" />
            <span>{currentUser.facility_name}</span>
            <span className="text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="text-slate-600">
              {currentUser.facility_type === 'referring'
                ? 'Referring'
                : 'Receiving'}
            </span>
          </button>

          {/* Referring Facility Notification Trigger */}
          <button
            type="button"
            onClick={() => {
              setShowNotificationsDrawer((prev) => !prev);
              setShowQueueDrawer(false);
            }}
            aria-label={`Notifications (${unreadCount} unread)`}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
              unreadCount > 0
                ? 'border-teal-700 bg-teal-50 text-teal-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-teal-700" />
            <span>Alerts</span>
            <span className="font-mono tabular-nums">({unreadCount})</span>
          </button>

          {/* Connectivity Status & Simulation Switch */}
          <button
            type="button"
            onClick={onToggleSimulatedOffline}
            aria-pressed={simulatedOffline}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
              isEffectiveOffline
                ? 'border-amber-600 bg-amber-50 text-amber-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {isEffectiveOffline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-700" />
                <span>Offline Mode (Saved offline)</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-700" />
                <span>Online · Synced</span>
              </>
            )}
          </button>

          {/* Sync Queue Button */}
          <button
            type="button"
            onClick={() => {
              setShowQueueDrawer((prev) => !prev);
              setShowNotificationsDrawer(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
              syncQueue.length > 0
                ? 'border-amber-600 bg-amber-50 text-amber-900 font-semibold'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CloudOff className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums">
              Queue: {syncQueue.length}
            </span>
          </button>

          {syncQueue.length > 0 && (
            <button
              type="button"
              onClick={onSyncNow}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
              />
              <span>Synchronize Now</span>
            </button>
          )}

          <PWAInstallButton />
        </div>
      </div>

      {/* Sync status toast / banner feedback */}
      {(isEffectiveOffline || lastSyncMessage) && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 sm:px-6 py-2">
          <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-2 text-xs">
            {isEffectiveOffline ? (
              <div className="flex items-center gap-2 text-amber-900 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>
                  Offline mode active — referrals and status updates are saved
                  locally in IndexedDB as “Saved offline” and queued for
                  synchronization.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-800 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>{lastSyncMessage}</span>
              </div>
            )}

            {isEffectiveOffline && (
              <button
                type="button"
                onClick={onToggleSimulatedOffline}
                className="font-semibold text-teal-800 underline hover:text-teal-900 whitespace-nowrap"
              >
                Reconnect & Synchronize Queue
              </button>
            )}
          </div>
        </div>
      )}

      {/* Expandable In-App Notifications Panel */}
      {showNotificationsDrawer && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 sm:px-6 py-4">
          <div className="mx-auto max-w-7xl">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Referring Facility In-App Notifications
                </h3>
                <p className="text-xs text-slate-500">
                  Real-time status feedback triggered when a receiving hospital
                  updates a referral.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllNotificationsRead}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 min-h-[36px]"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotificationsDrawer(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 min-h-[36px]"
                >
                  Close
                </button>
              </div>
            </div>

            {facilityNotifications.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No notifications for {currentUser.facility_name} yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white max-h-64 overflow-y-auto">
                {facilityNotifications.map((n) => (
                  <div
                    key={n.notification_id}
                    className={`p-3 flex flex-wrap items-center justify-between gap-3 ${
                      !n.read ? 'bg-teal-50/40' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-slate-900">
                          {n.title}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {formatShortTimestamp(n.timestamp)}
                        </span>
                        {!n.read && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-teal-800">
                              Unread
                            </span>
                          </>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {n.message}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onMarkNotificationRead(n.notification_id);
                          onOpenReferralFromNotification(n.referral_id);
                          setShowNotificationsDrawer(false);
                        }}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 min-h-[36px]"
                      >
                        View Timeline
                      </button>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() =>
                            onMarkNotificationRead(n.notification_id)
                          }
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[36px]"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expandable Offline Sync Queue Drawer */}
      {showQueueDrawer && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 sm:px-6 py-4">
          <div className="mx-auto max-w-7xl">
            <div className="flex items-center justify-between gap-4 mb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Offline Synchronization Queue ({syncQueue.length} pending)
                </h3>
                <p className="text-xs text-slate-500">
                  Events stored in IndexedDB while offline. Duplicate events are
                  automatically prevented via idempotency keys during sync.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQueueDrawer(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 min-h-[36px]"
              >
                Close
              </button>
            </div>

            {syncQueue.length === 0 ? (
              <p className="text-xs text-slate-600 py-2">
                All local referrals and status updates are synchronized
                (“Synced”).
              </p>
            ) : (
              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {syncQueue.map((item) => (
                  <div
                    key={item.queue_id}
                    className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900">
                        {item.event.referral_id}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-800">
                        {item.event.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-600">
                        {item.event.facility_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-amber-800 tabular-nums">
                      <span>Saved offline</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatShortTimestamp(item.queued_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
