/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  ClipboardList,
  PlusCircle,
  QrCode,
} from 'lucide-react';
import {
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
  registerUserAccount,
  synchronizeOfflineQueue,
} from './core/referralEngine';
import {
  clearAndResetLocalSnapshot,
  loadLocalSnapshot,
  saveLocalSnapshot,
} from './services/indexedDb';
import {
  fetchServerState,
  postResetServerState,
  postSyncBatchToServer,
} from './services/api';
import { OfflineSyncBar } from './components/OfflineSyncBar';
import { ReferringDashboard } from './components/ReferringDashboard';
import { CreateReferralView } from './components/CreateReferralView';
import { ReceivingFacilityView } from './components/ReceivingFacilityView';
import { MetricsAndSmsView } from './components/MetricsAndSmsView';
import { AuthModal } from './components/AuthModal';

export type ActiveTab = 'dashboard' | 'create' | 'receiving' | 'metrics';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

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
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(
    'All referral events synced'
  );
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const isEffectiveOffline = !browserOnline || simulatedOffline;

  // Persist helper to IndexedDB + BroadcastChannel
  const persistState = useCallback(
    async (next: {
      referrals: Referral[];
      events: StatusEvent[];
      sms_logs: SmsFallbackMessage[];
      notifications: InAppNotification[];
      sync_queue: SyncQueueItem[];
      users: UserAccount[];
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
          setSyncQueue([]);
          await saveLocalSnapshot({
            referrals: synced.referrals,
            events: synced.events,
            sms_logs: synced.sms_logs,
            notifications: synced.notifications,
            sync_queue: [],
            users: synced.users,
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

  // Listen for browser online/offline events & BroadcastChannel updates across tabs
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
          }
        };
      }
    } catch {
      // Ignore
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (channel) channel.close();
    };
  }, []);

  // Synchronize queued offline items when connectivity returns or manual sync triggered
  const handleSynchronizeNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      // First run pure idempotent synchronization locally
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

      // Also sync with backend API if reachable
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
      } catch {
        // Local IndexedDB sync completed even if backend is unreachable
      }

      setReferrals(finalReferrals);
      setEvents(finalEvents);
      setSmsLogs(finalSms);
      setNotifications(finalNotifs);
      setUsers(finalUsers);
      setSyncQueue([]);
      setSimulatedOffline(false);

      // Update activeQrReferral if open
      if (activeQrReferral) {
        const updatedQrRef = finalReferrals.find(
          (r) => r.referral_id === activeQrReferral.referral_id
        );
        if (updatedQrRef) setActiveQrReferral(updatedQrRef);
      }

      setLastSyncMessage(
        `Synced (${localSynced.syncedCount} queued ${
          localSynced.syncedCount === 1 ? 'event' : 'events'
        } synchronized, ${localSynced.skippedDuplicates} duplicates prevented)`
      );

      await persistState({
        referrals: finalReferrals,
        events: finalEvents,
        sms_logs: finalSms,
        notifications: finalNotifs,
        sync_queue: [],
        users: finalUsers,
      });
    } finally {
      setIsSyncing(false);
    }
  }, [
    referrals,
    events,
    smsLogs,
    notifications,
    syncQueue,
    users,
    activeQrReferral,
    persistState,
  ]);

  // Toggle offline simulation mode; if transitioning from offline -> online, auto-sync queue!
  const handleToggleSimulatedOffline = useCallback(() => {
    if (simulatedOffline) {
      setSimulatedOffline(false);
      if (syncQueue.length > 0) {
        handleSynchronizeNow();
      } else {
        setLastSyncMessage('Online · All referral events synced');
      }
    } else {
      setSimulatedOffline(true);
      setLastSyncMessage('Saved offline — queueing updates in IndexedDB');
    }
  }, [simulatedOffline, syncQueue.length, handleSynchronizeNow]);

  // Handler: Create a new referral
  const handleCreateReferral = useCallback(
    (input: {
      patient_code: string;
      referring_facility: string;
      receiving_facility: string;
      primary_category: string;
      sub_category?: string;
      priority: ReferralPriority;
    }): Referral => {
      const created = createReferralRecord({
        ...input,
        existingReferralIds: referrals.map((r) => r.referral_id),
        isOffline: isEffectiveOffline,
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
        setLastSyncMessage(
          `Saved offline: Referral ${created.referral.referral_id} queued for sync`
        );
      } else {
        setLastSyncMessage(
          `Synced: Referral ${created.referral.referral_id} created`
        );
        postSyncBatchToServer(
          [],
          nextReferrals,
          nextEvents,
          nextSms,
          notifications,
          users
        ).catch(() => {});
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
      isEffectiveOffline,
      persistState,
    ]
  );

  // Handler: Update referral status from Receiving Facility
  const handleUpdateStatus = useCallback(
    (referralId: string, facilityId: string, status: ReferralStatus) => {
      const result = applyReferralStatusUpdate({
        referrals,
        events,
        referral_id: referralId,
        facility_id: facilityId,
        status,
        isOffline: isEffectiveOffline,
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
        setLastSyncMessage(
          `Saved offline: ${referralId} marked ${status} (queued for sync)`
        );
      } else {
        setLastSyncMessage(`Synced: ${referralId} marked ${status}`);
        postSyncBatchToServer(
          [],
          nextReferrals,
          nextEvents,
          nextSms,
          nextNotifs,
          users
        ).catch(() => {});
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
      isEffectiveOffline,
      persistState,
    ]
  );

  // Notification handlers
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
      });
    },
    [referrals, events, smsLogs, notifications, syncQueue, users, persistState]
  );

  const handleMarkAllNotificationsRead = useCallback(() => {
    const nextNotifs = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(nextNotifs);
    persistState({
      referrals,
      events,
      sms_logs: smsLogs,
      notifications: nextNotifs,
      sync_queue: syncQueue,
      users,
    });
  }, [referrals, events, smsLogs, notifications, syncQueue, users, persistState]);

  // Auth handlers
  const handleLogin = useCallback(
    (username: string, password_mock: string) => {
      const res = authenticateUser(users, username, password_mock);
      if (res.authenticated && res.user) {
        setCurrentUser(res.user);
        if (res.user.facility_type === 'receiving') {
          setActiveTab('receiving');
        } else {
          setActiveTab('dashboard');
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
        });
        if (res.user.facility_type === 'receiving') {
          setActiveTab('receiving');
        } else {
          setActiveTab('dashboard');
        }
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Registration failed',
        };
      }
    },
    [users, referrals, events, smsLogs, notifications, syncQueue, persistState]
  );

  const handleResetDemoData = useCallback(async () => {
    const fresh = await clearAndResetLocalSnapshot();
    try {
      await postResetServerState();
    } catch {
      // Ignore if offline
    }
    setReferrals(fresh.referrals);
    setEvents(fresh.events);
    setSmsLogs(fresh.sms_logs);
    setNotifications(fresh.notifications);
    setSyncQueue([]);
    setSelectedReferralId('XL-1001');
    setActiveQrReferral(null);
    setLastSyncMessage('Synthetic dataset reset to initial state');
  }, []);

  // Poll server state every 8 seconds when online & no offline queue so multi-tab / multi-node stays live
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
        }
      } catch {
        // Ignore network poll error
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [isEffectiveOffline, syncQueue.length]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-16 md:pb-0">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200 bg-white sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('dashboard');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Xareloop
        </a>

        {/* Zone 2: 4 clean single-line text navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <a
            href="#referrals"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('dashboard');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'dashboard'
                ? 'text-slate-900 font-bold underline decoration-teal-700 decoration-2 underline-offset-8'
                : 'hover:text-slate-900 hover:underline underline-offset-8'
            }`}
          >
            Referrals
          </a>
          <a
            href="#create"
            onClick={(e) => {
              e.preventDefault();
              setActiveQrReferral(null);
              setActiveTab('create');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'create'
                ? 'text-slate-900 font-bold underline decoration-teal-700 decoration-2 underline-offset-8'
                : 'hover:text-slate-900 hover:underline underline-offset-8'
            }`}
          >
            Create Referral
          </a>
          <a
            href="#receiving"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('receiving');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'receiving'
                ? 'text-slate-900 font-bold underline decoration-teal-700 decoration-2 underline-offset-8'
                : 'hover:text-slate-900 hover:underline underline-offset-8'
            }`}
          >
            Receiving Lookup
          </a>
          <a
            href="#metrics"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('metrics');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'metrics'
                ? 'text-slate-900 font-bold underline decoration-teal-700 decoration-2 underline-offset-8'
                : 'hover:text-slate-900 hover:underline underline-offset-8'
            }`}
          >
            Metrics & SMS
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveQrReferral(null);
              setActiveTab('create');
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
          >
            + New Referral
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {/* Contextual Workspace Toolbar: Prototype Disclaimer, Offline/Sync Bar, Notifications & Auth Session */}
        <OfflineSyncBar
          isEffectiveOffline={isEffectiveOffline}
          simulatedOffline={simulatedOffline}
          onToggleSimulatedOffline={handleToggleSimulatedOffline}
          syncQueue={syncQueue}
          isSyncing={isSyncing}
          lastSyncMessage={lastSyncMessage}
          onSyncNow={handleSynchronizeNow}
          currentUser={currentUser}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          notifications={notifications}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onOpenReferralFromNotification={(referralId) => {
            setSelectedReferralId(referralId);
            setActiveTab('dashboard');
          }}
        />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
          {activeTab === 'dashboard' && (
            <ReferringDashboard
              referrals={referrals}
              events={events}
              notifications={notifications}
              selectedReferralId={selectedReferralId}
              onSelectReferral={(id) => setSelectedReferralId(id)}
              onCreateNewClick={() => {
                setActiveQrReferral(null);
                setActiveTab('create');
              }}
              onViewQr={(ref) => {
                setActiveQrReferral(ref);
                setActiveTab('create');
              }}
              onOpenInReceiving={(id) => {
                setReceivingLookupId(id);
                setActiveTab('receiving');
              }}
              onMarkNotificationRead={handleMarkNotificationRead}
            />
          )}

          {activeTab === 'create' && (
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
              onOpenInReceiving={(id) => {
                setReceivingLookupId(id);
                setActiveTab('receiving');
              }}
              onBackToDashboard={() => {
                setActiveQrReferral(null);
                setActiveTab('dashboard');
              }}
            />
          )}

          {activeTab === 'receiving' && (
            <ReceivingFacilityView
              referrals={referrals}
              events={events}
              initialLookupId={receivingLookupId}
              defaultReceivingFacility={
                currentUser.facility_type === 'receiving'
                  ? currentUser.facility_name
                  : 'District Hospital Demo'
              }
              onUpdateStatus={handleUpdateStatus}
              onViewQr={(ref) => {
                setActiveQrReferral(ref);
                setActiveTab('create');
              }}
            />
          )}

          {activeTab === 'metrics' && (
            <MetricsAndSmsView
              referrals={referrals}
              events={events}
              smsLogs={smsLogs}
              onResetDemoData={handleResetDemoData}
              onSelectReferralFromSms={(id) => {
                setSelectedReferralId(id);
                setActiveTab('dashboard');
              }}
            />
          )}
        </div>
      </main>

      {/* Clean Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4">
          <div>
            Xareloop Prototype — Low-Bandwidth Clinical Referral-Feedback
            Workflow. Not for clinical use.
          </div>
          <div>
            All patient records shown (SYN-001 through SYN-012) are strictly
            synthetic.
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Tab Bar (Thumb-Zone Navigation on Mobile Viewports) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center h-14"
      >
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center h-full text-[11px] font-medium ${
            activeTab === 'dashboard' ? 'text-teal-800 font-bold' : 'text-slate-600'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span className="mt-0.5">Referrals</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveQrReferral(null);
            setActiveTab('create');
          }}
          className={`flex flex-col items-center justify-center h-full text-[11px] font-medium ${
            activeTab === 'create' ? 'text-teal-800 font-bold' : 'text-slate-600'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span className="mt-0.5">Create</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('receiving')}
          className={`flex flex-col items-center justify-center h-full text-[11px] font-medium ${
            activeTab === 'receiving' ? 'text-teal-800 font-bold' : 'text-slate-600'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span className="mt-0.5">Receiving</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('metrics')}
          className={`flex flex-col items-center justify-center h-full text-[11px] font-medium ${
            activeTab === 'metrics' ? 'text-teal-800 font-bold' : 'text-slate-600'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span className="mt-0.5">Metrics</span>
        </button>
      </nav>

      {/* Authentication & Facility Switcher Modal */}
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
            setActiveTab('receiving');
          } else {
            setActiveTab('dashboard');
          }
        }}
      />
    </div>
  );
}
