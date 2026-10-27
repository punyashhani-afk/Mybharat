/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, QrCode, Search, UserCheck } from 'lucide-react';
import {
  CloudSyncLogEntry,
  FacilityType,
  InAppNotification,
  Referral,
  ReferralPriority,
  ReferralStatus,
  SmsFallbackMessage,
  StatusEvent,
  SyncQueueItem,
  UserAccount,
} from './types/referral';
import {
  INITIAL_CLOUD_SYNC_LOGS,
  INITIAL_DEMO_USERS,
  INITIAL_SYNTHETIC_EVENTS,
  INITIAL_SYNTHETIC_NOTIFICATIONS,
  INITIAL_SYNTHETIC_REFERRALS,
  INITIAL_SYNTHETIC_SMS_LOGS,
} from './data/syntheticData';
import {
  applyReferralStatusUpdate,
  authenticateUser,
  createReferralRecord,
  enqueueOfflineItem,
  getRolePermissions,
  getStaffRole,
  markReferralTimelineViewed,
  registerUserAccount,
  synchronizeOfflineQueue,
} from './core/referralEngine';
import { loadLocalSnapshot, saveLocalSnapshot } from './services/indexedDb';
import { fetchServerState, postSyncBatchToServer } from './services/api';
import { OfflineSyncBar } from './components/OfflineSyncBar';
import { ReferringDashboard } from './components/ReferringDashboard';
import { CreateReferralView } from './components/CreateReferralView';
import { ReceivingFacilityView } from './components/ReceivingFacilityView';
import { AuthModal } from './components/AuthModal';

export type PrimarySection = 'referrals' | 'scan_update' | 'search';

export default function App() {
  const [activeSection, setActiveSection] =
    useState<PrimarySection>('referrals');
  const [isCreatingReferral, setIsCreatingReferral] = useState<boolean>(false);

  const [referrals, setReferrals] = useState<Referral[]>(
    INITIAL_SYNTHETIC_REFERRALS
  );
  const [events, setEvents] = useState<StatusEvent[]>(INITIAL_SYNTHETIC_EVENTS);
  const [smsLogs, setSmsLogs] = useState<SmsFallbackMessage[]>(
    INITIAL_SYNTHETIC_SMS_LOGS
  );
  const [notifications, setNotifications] = useState<InAppNotification[]>(
    INITIAL_SYNTHETIC_NOTIFICATIONS
  );
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const [users, setUsers] = useState<UserAccount[]>(INITIAL_DEMO_USERS);
  const [currentUser, setCurrentUser] = useState<UserAccount>(
    INITIAL_DEMO_USERS[0]
  );
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [cloudRevision, setCloudRevision] = useState<number>(1);
  const [cloudLogs, setCloudLogs] = useState<CloudSyncLogEntry[]>(
    INITIAL_CLOUD_SYNC_LOGS
  );

  const [selectedReferralId, setSelectedReferralId] =
    useState<string>('XL-1001');
  const [activeQrReferral, setActiveQrReferral] = useState<Referral | null>(
    null
  );
  const [receivingLookupId, setReceivingLookupId] = useState<string>('XL-1001');

  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(false);

  const isEffectiveOffline = !browserOnline || simulatedOffline;
  const permissions = getRolePermissions(currentUser);
  const staffRoleLabel = getStaffRole(currentUser);

  // Persist helper to IndexedDB + BroadcastChannel
  const persistState = useCallback(
    async (next: {
      referrals: Referral[];
      events: StatusEvent[];
      sms_logs: SmsFallbackMessage[];
      notifications: InAppNotification[];
      sync_queue: SyncQueueItem[];
      users: UserAccount[];
      cloud_revision?: number;
      cloud_logs?: CloudSyncLogEntry[];
    }) => {
      await saveLocalSnapshot({
        ...next,
        last_synced_at: new Date().toISOString(),
      });
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const ch = new BroadcastChannel('xareloop_realtime_channel');
          ch.postMessage({ type: 'STATE_UPDATED', payload: next });
          ch.close();
        }
      } catch {
        // Ignore BroadcastChannel errors
      }
    },
    []
  );

  // Initial load from IndexedDB + server sync
  useEffect(() => {
    let mounted = true;
    loadLocalSnapshot().then(async (local) => {
      if (!mounted) return;
      setReferrals(local.referrals);
      setEvents(local.events);
      setSmsLogs(local.sms_logs);
      setNotifications(local.notifications || INITIAL_SYNTHETIC_NOTIFICATIONS);
      setSyncQueue(local.sync_queue || []);
      if (local.users && local.users.length > 0) {
        setUsers(local.users);
      }
      if (local.cloud_revision) setCloudRevision(local.cloud_revision);
      if (local.cloud_logs) setCloudLogs(local.cloud_logs);

      if (navigator.onLine) {
        try {
          const synced = await postSyncBatchToServer(
            local.sync_queue || [],
            local.referrals,
            local.events,
            local.sms_logs,
            local.notifications || INITIAL_SYNTHETIC_NOTIFICATIONS,
            local.users || INITIAL_DEMO_USERS
          );
          if (!mounted) return;
          setReferrals(synced.referrals);
          setEvents(synced.events);
          setSmsLogs(synced.sms_logs);
          setNotifications(synced.notifications);
          setUsers(synced.users);
          setCloudRevision(synced.cloud_revision || 1);
          setCloudLogs(synced.cloud_logs || INITIAL_CLOUD_SYNC_LOGS);
          setSyncQueue([]);
          await saveLocalSnapshot({
            referrals: synced.referrals,
            events: synced.events,
            sms_logs: synced.sms_logs,
            notifications: synced.notifications,
            sync_queue: [],
            users: synced.users,
            cloud_revision: synced.cloud_revision,
            cloud_logs: synced.cloud_logs,
            last_synced_at: synced.server_time,
          });
        } catch {
          // Remain on local IndexedDB state if offline or server unreachable
        }
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Listen for browser online/offline events, BroadcastChannel updates, and Cloud SSE stream
  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('xareloop_realtime_channel');
        channel.onmessage = (msg) => {
          if (msg.data?.type === 'STATE_UPDATED' && msg.data.payload) {
            const p = msg.data.payload;
            setReferrals(p.referrals);
            setEvents(p.events);
            setSmsLogs(p.sms_logs);
            setNotifications(p.notifications);
            setSyncQueue(p.sync_queue);
            setUsers(p.users);
            if (p.cloud_revision) setCloudRevision(p.cloud_revision);
            if (p.cloud_logs) setCloudLogs(p.cloud_logs);
          }
        };
      }
    } catch {
      // Ignore
    }

    let eventSource: EventSource | null = null;
    if (!isEffectiveOffline && typeof EventSource !== 'undefined') {
      try {
        eventSource = new EventSource('/api/cloud/stream');
        eventSource.addEventListener('cloud_update', (evt) => {
          try {
            const data = JSON.parse((evt as MessageEvent).data);
            if (data && Array.isArray(data.referrals)) {
              setReferrals(data.referrals);
              setEvents(data.events);
              setSmsLogs(data.sms_logs);
              setNotifications(data.notifications);
              if (data.cloud_revision) setCloudRevision(data.cloud_revision);
              if (data.cloud_logs) setCloudLogs(data.cloud_logs);
            }
          } catch {
            // Ignore malformed SSE payload
          }
        });
      } catch {
        // Ignore EventSource error
      }
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (channel) channel.close();
      if (eventSource) eventSource.close();
    };
  }, [isEffectiveOffline]);

  // Synchronize queued offline items & cloud state
  const handleSynchronizeNow = useCallback(async () => {
    const localSynced = synchronizeOfflineQueue(
      {
        referrals,
        events,
        sms_logs: smsLogs,
        notifications,
      },
      syncQueue
    );

    let finalReferrals = localSynced.referrals;
    let finalEvents = localSynced.events;
    let finalSms = localSynced.sms_logs;
    let finalNotifs = localSynced.notifications;
    let finalUsers = users;
    let finalRev = cloudRevision;
    let finalCloudLogs = cloudLogs;

    try {
      const serverSynced = await postSyncBatchToServer(
        syncQueue,
        finalReferrals,
        finalEvents,
        finalSms,
        finalNotifs,
        users
      );
      finalReferrals = serverSynced.referrals;
      finalEvents = serverSynced.events;
      finalSms = serverSynced.sms_logs;
      finalNotifs = serverSynced.notifications;
      finalUsers = serverSynced.users;
      finalRev = serverSynced.cloud_revision || finalRev;
      finalCloudLogs = serverSynced.cloud_logs || finalCloudLogs;
    } catch {
      // Local IndexedDB sync completed even if backend is unreachable
    }

    setReferrals(finalReferrals);
    setEvents(finalEvents);
    setSmsLogs(finalSms);
    setNotifications(finalNotifs);
    setUsers(finalUsers);
    setCloudRevision(finalRev);
    setCloudLogs(finalCloudLogs);
    setSyncQueue([]);
    setSimulatedOffline(false);

    if (activeQrReferral) {
      const updatedQrRef = finalReferrals.find(
        (r) => r.referral_id === activeQrReferral.referral_id
      );
      if (updatedQrRef) setActiveQrReferral(updatedQrRef);
    }

    await persistState({
      referrals: finalReferrals,
      events: finalEvents,
      sms_logs: finalSms,
      notifications: finalNotifs,
      sync_queue: [],
      users: finalUsers,
      cloud_revision: finalRev,
      cloud_logs: finalCloudLogs,
    });
  }, [
    referrals,
    events,
    smsLogs,
    notifications,
    syncQueue,
    users,
    cloudRevision,
    cloudLogs,
    activeQrReferral,
    persistState,
  ]);

  // Toggle offline simulation mode
  const handleToggleSimulatedOffline = useCallback(() => {
    if (simulatedOffline) {
      setSimulatedOffline(false);
      if (syncQueue.length > 0) {
        handleSynchronizeNow();
      }
    } else {
      setSimulatedOffline(true);
    }
  }, [simulatedOffline, syncQueue.length, handleSynchronizeNow]);

  // Select referral & mark timeline viewed
  const handleSelectReferral = useCallback(
    (referralId: string, markViewed: boolean = false) => {
      setSelectedReferralId(referralId);
      setReceivingLookupId(referralId);
      if (markViewed) {
        const nextReferrals = markReferralTimelineViewed(referrals, referralId);
        setReferrals(nextReferrals);
        persistState({
          referrals: nextReferrals,
          events,
          sms_logs: smsLogs,
          notifications,
          sync_queue: syncQueue,
          users,
          cloud_revision: cloudRevision,
          cloud_logs: cloudLogs,
        });
        if (!isEffectiveOffline) {
          postSyncBatchToServer(
            [],
            nextReferrals,
            events,
            smsLogs,
            notifications,
            users
          ).catch(() => {});
        }
      }
    },
    [
      referrals,
      events,
      smsLogs,
      notifications,
      syncQueue,
      users,
      cloudRevision,
      cloudLogs,
      isEffectiveOffline,
      persistState,
    ]
  );

  // Mark an in-app notification as read
  const handleMarkNotificationRead = useCallback(
    (notificationId: string) => {
      const nextNotifs = notifications.map((n) =>
        n.notification_id === notificationId ? { ...n, read: true } : n
      );
      setNotifications(nextNotifs);
      persistState({
        referrals,
        events,
        sms_logs: smsLogs,
        notifications: nextNotifs,
        sync_queue: syncQueue,
        users,
        cloud_revision: cloudRevision,
        cloud_logs: cloudLogs,
      });
    },
    [
      referrals,
      events,
      smsLogs,
      notifications,
      syncQueue,
      users,
      cloudRevision,
      cloudLogs,
      persistState,
    ]
  );

  // Create a new referral (enforces Referring Staff role permission)
  const handleCreateReferral = useCallback(
    (input: {
      patient_code: string;
      referring_facility: string;
      receiving_facility: string;
      primary_category: string;
      priority: ReferralPriority;
    }): Referral => {
      const created = createReferralRecord({
        ...input,
        existingReferralIds: referrals.map((r) => r.referral_id),
        isOffline: isEffectiveOffline,
        actorUser: currentUser,
      });

      const nextReferrals = [created.referral, ...referrals];
      const nextEvents = [...events, created.initialEvent];
      const nextSms = [created.smsMessage, ...smsLogs];
      let nextQueue = syncQueue;

      if (isEffectiveOffline) {
        nextQueue = enqueueOfflineItem(syncQueue, {
          queue_id: `Q-${created.referral.referral_id}-${Date.now()}`,
          type: 'CREATE_REFERRAL',
          referral: created.referral,
          event: created.initialEvent,
          sms: created.smsMessage,
          queued_at: created.referral.created_at,
        });
      } else {
        const nextRev = cloudRevision + 1;
        setCloudRevision(nextRev);
        postSyncBatchToServer(
          [],
          nextReferrals,
          nextEvents,
          nextSms,
          notifications,
          users
        )
          .then((srv) => {
            if (srv.cloud_revision) setCloudRevision(srv.cloud_revision);
            if (srv.cloud_logs) setCloudLogs(srv.cloud_logs);
          })
          .catch(() => {});
      }

      setReferrals(nextReferrals);
      setEvents(nextEvents);
      setSmsLogs(nextSms);
      setSyncQueue(nextQueue);
      setSelectedReferralId(created.referral.referral_id);
      setActiveQrReferral(created.referral);
      setReceivingLookupId(created.referral.referral_id);

      persistState({
        referrals: nextReferrals,
        events: nextEvents,
        sms_logs: nextSms,
        notifications,
        sync_queue: nextQueue,
        users,
        cloud_revision: cloudRevision + 1,
        cloud_logs: cloudLogs,
      });

      return created.referral;
    },
    [
      referrals,
      events,
      smsLogs,
      notifications,
      syncQueue,
      users,
      currentUser,
      cloudRevision,
      cloudLogs,
      isEffectiveOffline,
      persistState,
    ]
  );

  // Update referral status from Scan / Update screen (enforces Receiving Staff role permission)
  const handleUpdateStatus = useCallback(
    (referralId: string, facilityId: string, status: ReferralStatus) => {
      const result = applyReferralStatusUpdate({
        referrals,
        events,
        referral_id: referralId,
        facility_id: facilityId,
        status,
        isOffline: isEffectiveOffline,
        actorUser: currentUser,
      });

      const nextReferrals = result.referrals;
      const nextEvents = result.events;
      const nextSms = [result.smsMessage, ...smsLogs];
      const nextNotifs = [result.notification, ...notifications];
      let nextQueue = syncQueue;

      if (isEffectiveOffline) {
        nextQueue = enqueueOfflineItem(syncQueue, {
          queue_id: `Q-${result.newEvent.event_id}`,
          type: 'STATUS_UPDATE',
          referral: result.updatedReferral,
          event: result.newEvent,
          sms: result.smsMessage,
          notification: result.notification,
          queued_at: result.newEvent.timestamp,
        });
      } else {
        const nextRev = cloudRevision + 1;
        setCloudRevision(nextRev);
        postSyncBatchToServer(
          [],
          nextReferrals,
          nextEvents,
          nextSms,
          nextNotifs,
          users
        )
          .then((srv) => {
            if (srv.cloud_revision) setCloudRevision(srv.cloud_revision);
            if (srv.cloud_logs) setCloudLogs(srv.cloud_logs);
          })
          .catch(() => {});
      }

      setReferrals(nextReferrals);
      setEvents(nextEvents);
      setSmsLogs(nextSms);
      setNotifications(nextNotifs);
      setSyncQueue(nextQueue);
      setSelectedReferralId(referralId);

      persistState({
        referrals: nextReferrals,
        events: nextEvents,
        sms_logs: nextSms,
        notifications: nextNotifs,
        sync_queue: nextQueue,
        users,
        cloud_revision: cloudRevision + 1,
        cloud_logs: cloudLogs,
      });

      return {
        referral: result.updatedReferral,
        event: result.newEvent,
        sms: result.smsMessage,
      };
    },
    [
      referrals,
      events,
      smsLogs,
      notifications,
      syncQueue,
      users,
      currentUser,
      cloudRevision,
      cloudLogs,
      isEffectiveOffline,
      persistState,
    ]
  );

  // Auth handlers
  const handleLogin = useCallback(
    (username: string, password_mock: string) => {
      const res = authenticateUser(users, username, password_mock);
      if (res.authenticated && res.user) {
        setCurrentUser(res.user);
        if (res.user.facility_type === 'receiving') {
          setIsCreatingReferral(false);
          setActiveSection('scan_update');
        } else {
          setActiveSection('referrals');
        }
      }
      return { authenticated: res.authenticated, error: res.error };
    },
    [users]
  );

  const handleRegister = useCallback(
    (input: {
      username: string;
      password_mock: string;
      display_name: string;
      role_label: string;
      facility_type: FacilityType;
      facility_name: string;
    }) => {
      try {
        const res = registerUserAccount(users, input);
        setUsers(res.users);
        setCurrentUser(res.user);
        persistState({
          referrals,
          events,
          sms_logs: smsLogs,
          notifications,
          sync_queue: syncQueue,
          users: res.users,
          cloud_revision: cloudRevision,
          cloud_logs: cloudLogs,
        });
        if (res.user.facility_type === 'receiving') {
          setIsCreatingReferral(false);
          setActiveSection('scan_update');
        } else {
          setActiveSection('referrals');
        }
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Registration failed',
        };
      }
    },
    [
      users,
      referrals,
      events,
      smsLogs,
      notifications,
      syncQueue,
      cloudRevision,
      cloudLogs,
      persistState,
    ]
  );

  const handleSwitchToReferringStaff = useCallback(() => {
    const referringUser =
      users.find((u) => u.facility_type === 'referring') ||
      INITIAL_DEMO_USERS[0];
    setCurrentUser(referringUser);
    setActiveSection('referrals');
  }, [users]);

  const handleSwitchToReceivingStaff = useCallback(() => {
    const receivingUser =
      users.find((u) => u.facility_type === 'receiving') ||
      INITIAL_DEMO_USERS[2];
    setCurrentUser(receivingUser);
    setIsCreatingReferral(false);
    setActiveSection('scan_update');
  }, [users]);

  // Poll server state every 8 seconds when online & no offline queue
  useEffect(() => {
    if (isEffectiveOffline || syncQueue.length > 0) return;
    const interval = setInterval(async () => {
      try {
        const srv = await fetchServerState();
        if (srv && srv.referrals) {
          setReferrals(srv.referrals);
          setEvents(srv.events);
          setSmsLogs(srv.sms_logs);
          setNotifications(srv.notifications);
          if (srv.cloud_revision) setCloudRevision(srv.cloud_revision);
          if (srv.cloud_logs) setCloudLogs(srv.cloud_logs);
        }
      } catch {
        // Ignore network poll error
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [isEffectiveOffline, syncQueue.length]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-16 md:pb-0">
      {/* Top Bar: Wordmark + 3 Primary Sections + Role Session & Offline Status */}
      <header className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200/90 bg-white sticky top-0 z-30 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <a
          href="#referrals"
          onClick={(e) => {
            e.preventDefault();
            setIsCreatingReferral(false);
            setActiveQrReferral(null);
            setActiveSection('referrals');
          }}
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-teal-700" />
          <span>Xareloop</span>
        </a>

        {/* Only 3 Primary Navigation Sections: 1. Referrals, 2. Scan / Update, 3. Search */}
        <nav
          aria-label="Main Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          <button
            type="button"
            onClick={() => {
              setIsCreatingReferral(false);
              setActiveQrReferral(null);
              setActiveSection('referrals');
            }}
            className={`py-1.5 transition-colors whitespace-nowrap ${
              activeSection === 'referrals'
                ? 'text-slate-900 font-bold underline decoration-teal-700 decoration-2 underline-offset-8'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Referrals
          </button>

          <button
            type="button"
            onClick={() => {
              setIsCreatingReferral(false);
              setActiveSection('scan_update');
            }}
            className={`px-4 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
              activeSection === 'scan_update'
                ? 'bg-gradient-to-r from-[#0B5E5E] to-[#0F766E] text-white shadow-xs'
                : 'bg-teal-50 text-teal-900 border border-teal-200/80 hover:bg-teal-100/80'
            }`}
          >
            Scan / Update
          </button>

          <button
            type="button"
            onClick={() => {
              setIsCreatingReferral(false);
              setActiveSection('search');
            }}
            className={`py-1.5 transition-colors whitespace-nowrap ${
              activeSection === 'search'
                ? 'text-slate-900 font-bold underline decoration-teal-700 decoration-2 underline-offset-8'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Search
          </button>
        </nav>

        {/* Right Controls: Active Staff Role Switcher + Minimal Offline Status */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="active-role-auth-btn"
            onClick={() => setIsAuthModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap min-h-[36px]"
          >
            <UserCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" />
            <span>{staffRoleLabel}</span>
          </button>

          <OfflineSyncBar
            isEffectiveOffline={isEffectiveOffline}
            onToggleSimulatedOffline={handleToggleSimulatedOffline}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-6 py-6">
        {activeSection === 'referrals' && !isCreatingReferral && (
          <ReferringDashboard
            referrals={referrals}
            events={events}
            notifications={notifications}
            permissions={permissions}
            selectedReferralId={selectedReferralId}
            onSelectReferral={handleSelectReferral}
            onCreateNewClick={() => {
              setActiveQrReferral(null);
              setIsCreatingReferral(true);
            }}
            onViewQr={(ref) => {
              setActiveQrReferral(ref);
              setIsCreatingReferral(true);
            }}
            onMarkNotificationRead={handleMarkNotificationRead}
            onSwitchToReferringStaff={handleSwitchToReferringStaff}
            onGoToScanUpdate={() => setActiveSection('scan_update')}
          />
        )}

        {activeSection === 'referrals' && isCreatingReferral && (
          <CreateReferralView
            existingReferrals={referrals}
            defaultReferringFacility={
              currentUser.facility_type === 'referring'
                ? currentUser.facility_name
                : 'PHC Demo North'
            }
            activeQrReferral={activeQrReferral}
            onClearActiveQrReferral={() => setActiveQrReferral(null)}
            onCreateReferral={handleCreateReferral}
            onBackToDashboard={() => {
              setActiveQrReferral(null);
              setIsCreatingReferral(false);
            }}
          />
        )}

        {activeSection === 'scan_update' && (
          <ReceivingFacilityView
            mode="scan_update"
            referrals={referrals}
            events={events}
            initialLookupId={receivingLookupId}
            permissions={permissions}
            onSwitchToReceivingStaff={handleSwitchToReceivingStaff}
            onUpdateStatus={handleUpdateStatus}
          />
        )}

        {activeSection === 'search' && (
          <ReceivingFacilityView
            mode="search"
            referrals={referrals}
            events={events}
            initialLookupId={receivingLookupId}
            permissions={permissions}
            onUpdateStatus={handleUpdateStatus}
            onViewQr={(ref) => {
              setActiveQrReferral(ref);
              setIsCreatingReferral(true);
              setActiveSection('referrals');
            }}
          />
        )}
      </main>

      {/* Mobile 3-Section Bottom Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 grid grid-cols-3 items-center h-14"
      >
        <button
          type="button"
          onClick={() => {
            setIsCreatingReferral(false);
            setActiveQrReferral(null);
            setActiveSection('referrals');
          }}
          className={`flex flex-col items-center justify-center h-full text-xs ${
            activeSection === 'referrals'
              ? 'text-teal-800 font-bold'
              : 'text-slate-600 font-medium'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span className="mt-0.5">Referrals</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsCreatingReferral(false);
            setActiveSection('scan_update');
          }}
          className={`flex flex-col items-center justify-center h-full text-xs ${
            activeSection === 'scan_update'
              ? 'bg-gradient-to-r from-[#0B5E5E] to-[#0F766E] text-white font-bold'
              : 'text-teal-800 font-bold'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span className="mt-0.5">Scan / Update</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsCreatingReferral(false);
            setActiveSection('search');
          }}
          className={`flex flex-col items-center justify-center h-full text-xs ${
            activeSection === 'search'
              ? 'text-teal-800 font-bold'
              : 'text-slate-600 font-medium'
          }`}
        >
          <Search className="w-4 h-4" />
          <span className="mt-0.5">Search</span>
        </button>
      </nav>

      {/* Role & User Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        users={users}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onSelectDemoUser={(user) => {
          setCurrentUser(user);
          if (user.facility_type === 'receiving') {
            setIsCreatingReferral(false);
            setActiveSection('scan_update');
          } else {
            setActiveSection('referrals');
          }
        }}
      />
    </div>
  );
}
