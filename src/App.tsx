import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck } from 'lucide-react';
import type {
  FacilityType,
  InAppNotification,
  Referral,
  ReferralCategory,
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
  createReferralRecord,
  createSessionToken,
  enqueueOfflineItem,
  getRolePermissions,
  getStaffRole,
  markReferralTimelineViewed,
  registerUserAccount,
  syncScannedQrPatientDetail,
  synchronizeOfflineQueue,
} from './core/referralEngine';
import { fetchServerState, postSyncBatchToServer } from './services/api';
import { loadLocalSnapshot, saveLocalSnapshot } from './services/indexedDb';
import { OfflineSyncBar } from './components/OfflineSyncBar';
import { ReferringDashboard } from './components/ReferringDashboard';
import { CreateReferralView } from './components/CreateReferralView';
import { ReceivingFacilityView } from './components/ReceivingFacilityView';
import { QrHandoffModal } from './components/QrHandoffModal';
import { AuthModal } from './components/AuthModal';

const STORAGE_KEYS = {
  IS_ONLINE: 'xareloop_is_online_v2',
  CURRENT_USER: 'xareloop_current_user_v2',
  AUTH_TOKEN: 'xareloop_auth_token_v2',
};

type PrimaryNavTab = 'referrals' | 'scan' | 'search';

export function App() {
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
  const [users, setUsers] = useState<UserAccount[]>(INITIAL_DEMO_USERS);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);

  const [currentUser, setCurrentUser] = useState<UserAccount>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (saved) {
        const parsed = JSON.parse(saved) as UserAccount;
        if (parsed && parsed.username && parsed.facility_name) {
          return parsed;
        }
      }
    } catch {
      // Fallback to default referring facility demo user
    }
    return INITIAL_DEMO_USERS[0];
  });

  const [authToken, setAuthToken] = useState<string>(() => {
    try {
      return (
        localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) ||
        createSessionToken(INITIAL_DEMO_USERS[0])
      );
    } catch {
      return createSessionToken(INITIAL_DEMO_USERS[0]);
    }
  });

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.IS_ONLINE);
      if (saved !== null) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return true;
  });

  const [activeTab, setActiveTab] = useState<PrimaryNavTab>('referrals');
  const [isCreatingReferral, setIsCreatingReferral] = useState<boolean>(false);
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(
    () => INITIAL_SYNTHETIC_REFERRALS[0] || null
  );
  const [qrModalReferral, setQrModalReferral] = useState<Referral | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [justSyncedCount, setJustSyncedCount] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [hasLoadedLocal, setHasLoadedLocal] = useState<boolean>(false);

  const rolePermissions = getRolePermissions(currentUser);
  const staffRole = getStaffRole(currentUser);

  // Load initial snapshot from IndexedDB / localStorage
  useEffect(() => {
    let active = true;
    loadLocalSnapshot()
      .then((snap) => {
        if (!active) return;
        if (Array.isArray(snap.referrals) && snap.referrals.length > 0) {
          setReferrals(snap.referrals);
          setSelectedReferral((prev) =>
            prev
              ? snap.referrals.find((r) => r.referral_id === prev.referral_id) ||
                snap.referrals[0]
              : snap.referrals[0]
          );
        }
        if (Array.isArray(snap.events) && snap.events.length > 0) {
          setEvents(snap.events);
        }
        if (Array.isArray(snap.sms_logs)) {
          setSmsLogs(snap.sms_logs);
        }
        if (Array.isArray(snap.notifications)) {
          setNotifications(snap.notifications);
        }
        if (Array.isArray(snap.users) && snap.users.length > 0) {
          setUsers(snap.users);
        }
        if (Array.isArray(snap.sync_queue)) {
          setSyncQueue(snap.sync_queue);
        }
        setHasLoadedLocal(true);
      })
      .catch(() => {
        if (active) setHasLoadedLocal(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Persist snapshot to IndexedDB & localStorage whenever state updates
  useEffect(() => {
    if (!hasLoadedLocal) return;
    saveLocalSnapshot({
      referrals,
      events,
      sms_logs: smsLogs,
      notifications,
      sync_queue: syncQueue,
      users,
      last_synced_at: new Date().toISOString(),
    }).catch(() => {});
  }, [hasLoadedLocal, referrals, events, smsLogs, notifications, syncQueue, users]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.IS_ONLINE, JSON.stringify(isOnline));
    } catch {
      // Ignore
    }
  }, [isOnline]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.CURRENT_USER,
        JSON.stringify(currentUser)
      );
      const token = createSessionToken(currentUser);
      setAuthToken(token);
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    } catch {
      // Ignore
    }
  }, [currentUser]);

  // Keep selectedReferral synchronized with referrals array
  useEffect(() => {
    if (selectedReferral) {
      const updated = referrals.find(
        (r) =>
          r.referral_id.toUpperCase() ===
          selectedReferral.referral_id.toUpperCase()
      );
      if (updated) {
        setSelectedReferral(updated);
      }
    }
  }, [referrals, selectedReferral]);

  // Synchronize offline queue & state with backend server
  const handleSyncOfflineQueue = useCallback(async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    setSyncError(null);

    const pendingToSync = syncQueue.length;

    try {
      const localMerged = synchronizeOfflineQueue(
        {
          referrals,
          events,
          sms_logs: smsLogs,
          notifications,
        },
        syncQueue
      );

      setReferrals(localMerged.referrals);
      setEvents(localMerged.events);
      setSmsLogs(localMerged.sms_logs);
      setNotifications(localMerged.notifications);
      setSyncQueue([]);

      const serverMerged = await postSyncBatchToServer(
        syncQueue,
        localMerged.referrals,
        localMerged.events,
        localMerged.sms_logs,
        localMerged.notifications,
        users
      );

      if (Array.isArray(serverMerged.referrals)) {
        setReferrals(serverMerged.referrals);
      }
      if (Array.isArray(serverMerged.events)) {
        setEvents(serverMerged.events);
      }
      if (Array.isArray(serverMerged.sms_logs)) {
        setSmsLogs(serverMerged.sms_logs);
      }
      if (Array.isArray(serverMerged.notifications)) {
        setNotifications(serverMerged.notifications);
      }

      if (pendingToSync > 0) {
        setJustSyncedCount(pendingToSync);
        setTimeout(() => setJustSyncedCount(null), 5000);
      }
    } catch {
      if (pendingToSync > 0) {
        setSyncError(
          "Couldn't synchronize updates. Your update is safely stored on this device and will retry automatically when connectivity returns."
        );
      }
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
      }, 220);
    }
  }, [isOnline, syncQueue, referrals, events, smsLogs, notifications, users]);

  // Pull state when online & no queued offline items
  useEffect(() => {
    if (!hasLoadedLocal || !isOnline) return;
    if (syncQueue.length > 0) {
      handleSyncOfflineQueue();
      return;
    }
    fetchServerState()
      .then((state) => {
        if (Array.isArray(state.referrals) && state.referrals.length > 0) {
          setReferrals((prev) => (prev.length > state.referrals.length ? prev : state.referrals));
        }
      })
      .catch(() => {});
  }, [hasLoadedLocal, isOnline, syncQueue.length, handleSyncOfflineQueue]);

  // Create Referral Handler
  const handleCreateReferral = (input: {
    patient_code: string;
    referring_facility: string;
    receiving_facility: string;
    primary_category: ReferralCategory;
    sub_category?: string;
    custom_note?: string;
    priority: ReferralPriority;
  }): Referral => {
    const result = createReferralRecord({
      ...input,
      existingReferralIds: referrals.map((r) => r.referral_id),
      isOffline: !isOnline,
      actorUser: currentUser,
    });

    setReferrals((prev) => [result.referral, ...prev]);
    setEvents((prev) => [...prev, result.initialEvent]);
    setSmsLogs((prev) => [result.smsMessage, ...prev]);
    setSelectedReferral(result.referral);

    if (!isOnline) {
      setSyncQueue((prev) =>
        enqueueOfflineItem(prev, {
          queue_id: `Q-CREATE-${result.referral.referral_id}-${Date.now()}`,
          type: 'CREATE_REFERRAL',
          referral: result.referral,
          event: result.initialEvent,
          sms: result.smsMessage,
          queued_at: result.referral.created_at,
        })
      );
    } else {
      fetch('/api/referrals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          patient_code: result.referral.patient_code,
          referring_facility: result.referral.referring_facility,
          receiving_facility: result.referral.receiving_facility,
          primary_category: result.referral.primary_category,
          sub_category: result.referral.sub_category,
          referral_category: result.referral.referral_category,
          custom_note: result.referral.custom_note,
          custom_referral_id: result.referral.referral_id,
          priority: result.referral.priority,
        }),
      }).catch(() => {});
    }

    return result.referral;
  };

  // Status Update Handler
  const handleUpdateStatus = (params: {
    referral_id: string;
    facility_id: string;
    status: ReferralStatus;
  }) => {
    const result = applyReferralStatusUpdate({
      referrals,
      events,
      referral_id: params.referral_id,
      facility_id: params.facility_id,
      status: params.status,
      isOffline: !isOnline,
      actorUser: currentUser,
    });

    setReferrals(result.referrals);
    setEvents(result.events);
    setSmsLogs((prev) => [result.smsMessage, ...prev]);
    setNotifications((prev) => [result.notification, ...prev]);
    setSelectedReferral(result.updatedReferral);

    if (!isOnline) {
      setSyncQueue((prev) =>
        enqueueOfflineItem(prev, {
          queue_id: `Q-STATUS-${params.referral_id}-${params.status}-${Date.now()}`,
          type: 'STATUS_UPDATE',
          referral: result.updatedReferral,
          event: result.newEvent,
          sms: result.smsMessage,
          notification: result.notification,
          queued_at: result.newEvent.timestamp,
        })
      );
    } else {
      fetch(`/api/referrals/${encodeURIComponent(params.referral_id)}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          facility_id: params.facility_id,
          status: params.status,
          timestamp: result.newEvent.timestamp,
        }),
      }).catch(() => {});
    }
  };

  // Scan QR Payload or Short ID & Synchronize Patient Detail
  const handleScanQrPayload = (rawPayload: string): Referral | null => {
    const synced = syncScannedQrPatientDetail(
      referrals,
      events,
      rawPayload,
      !isOnline
    );

    if (synced.referral) {
      if (synced.importedNewRecord) {
        setReferrals(synced.referrals);
        setEvents(synced.events);
      }
      return synced.referral;
    }

    return null;
  };

  // Open referral detail and mark timeline as viewed if user is Referring Staff
  const handleOpenReferralDetail = (referral: Referral) => {
    if (currentUser.facility_type === 'referring') {
      const updatedList = markReferralTimelineViewed(
        referrals,
        referral.referral_id
      );
      setReferrals(updatedList);
      const updatedTarget =
        updatedList.find((r) => r.referral_id === referral.referral_id) ||
        referral;
      setSelectedReferral(updatedTarget);
    } else {
      setSelectedReferral(referral);
    }
    setActiveTab('scan');
  };

  const handleSelectUser = async (user: UserAccount) => {
    setCurrentUser(user);
    const token = createSessionToken(user);
    setAuthToken(token);
    if (user.facility_type === 'receiving') {
      setIsCreatingReferral(false);
    }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          password_mock: user.password_mock,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          setAuthToken(data.token);
        }
      }
    } catch {
      // Offline session token already set above
    }
  };

  const handleRegisterUser = async (input: {
    username: string;
    password_mock: string;
    display_name: string;
    facility_type: FacilityType;
    facility_name: string;
  }) => {
    const reg = registerUserAccount(users, input);
    setUsers(reg.users);
    setCurrentUser(reg.user);
    setAuthToken(reg.token);
    if (reg.user.facility_type === 'receiving') {
      setIsCreatingReferral(false);
    }
    if (isOnline) {
      fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).catch(() => {});
    }
  };

  const handleDismissNotification = (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.notification_id === notificationId ? { ...n, read: true } : n
      )
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9FC] text-[#10213F]">
      {/* Xareloop Brand Identity Header: Deep Navy (#031B4E -> #062B78) */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-[#031B4E] to-[#062B78] text-[#FFFFFF] border-b border-[#031B4E] shadow-xs">
        <div className="max-w-2xl mx-auto px-4 pt-3.5 pb-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Brand Logo & Prototype Boundary Label */}
            <div className="flex items-center gap-2.5">
              <img
                src="/icon.svg"
                alt="Xareloop Logo"
                className="w-9 h-9 rounded-xl border border-[#10B9A8]/70 shrink-0"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-lg tracking-tight text-[#FFFFFF] leading-none">
                    Xareloop
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-[#062B78] text-[#DDF7F4] border border-[#10B9A8]/60">
                    Synthetic Demo
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[#DDF7F4] block mt-0.5">
                  Clinical Referral-Feedback Platform
                </span>
              </div>
            </div>

            {/* Active Role Switcher & Offline-First Connection Indicator */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                data-testid="role-switch-button"
                onClick={() => setIsAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-extrabold border bg-[#062B78] text-[#FFFFFF] border-[#10B9A8] hover:bg-[#0878F9] transition-colors cursor-pointer"
                title="Switch Facility & Role"
              >
                <ShieldCheck className="w-4 h-4 text-[#10B9A8]" aria-hidden="true" />
                <span>
                  {currentUser.facility_type === 'referring'
                    ? 'Referring'
                    : 'Receiving'}
                  : {currentUser.facility_name} ({staffRole})
                </span>
              </button>

              <OfflineSyncBar
                isOnline={isOnline}
                pendingCount={syncQueue.length}
                isSyncing={isSyncing}
                justSyncedCount={justSyncedCount}
                syncError={syncError}
                onToggleOffline={() => setIsOnline((prev) => !prev)}
                onSyncNow={handleSyncOfflineQueue}
                onDismissSyncError={() => setSyncError(null)}
              />
            </div>
          </div>

          {/* 3 Primary Navigation Sections */}
          <nav
            aria-label="Primary Navigation"
            className="grid grid-cols-3 gap-1.5 bg-[#031B4E] p-1 rounded-xl border border-[#0878F9]/35"
          >
            <button
              type="button"
              data-testid="nav-tab-referrals"
              onClick={() => {
                setActiveTab('referrals');
                setIsCreatingReferral(false);
              }}
              className={`py-2.5 px-3 min-h-[42px] rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'referrals'
                  ? 'bg-[#FFFFFF] text-[#031B4E] shadow-xs'
                  : 'text-[#DDF7F4] hover:text-[#FFFFFF] hover:bg-[#062B78]'
              }`}
            >
              1. Referrals
            </button>

            <button
              type="button"
              data-testid="nav-tab-scan"
              onClick={() => {
                setActiveTab('scan');
                setIsCreatingReferral(false);
              }}
              className={`py-2.5 px-3 min-h-[42px] rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'scan'
                  ? 'bg-[#FFFFFF] text-[#031B4E] shadow-xs'
                  : 'text-[#DDF7F4] hover:text-[#FFFFFF] hover:bg-[#062B78]'
              }`}
            >
              2. Scan / Update
            </button>

            <button
              type="button"
              data-testid="nav-tab-search"
              onClick={() => {
                setActiveTab('search');
                setIsCreatingReferral(false);
              }}
              className={`py-2.5 px-3 min-h-[42px] rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'search'
                  ? 'bg-[#FFFFFF] text-[#031B4E] shadow-xs'
                  : 'text-[#DDF7F4] hover:text-[#FFFFFF] hover:bg-[#062B78]'
              }`}
            >
              3. Search
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-5">
        {activeTab === 'referrals' && !isCreatingReferral && (
          <ReferringDashboard
            currentUser={currentUser}
            referrals={referrals}
            events={events}
            pendingSyncCount={syncQueue.length}
            canCreateReferrals={rolePermissions.canCreateReferrals}
            canUpdateStatus={rolePermissions.canUpdateReferralStatus}
            notifications={notifications}
            onCreateNewClick={() => {
              if (rolePermissions.canCreateReferrals) {
                setIsCreatingReferral(true);
              } else {
                setIsAuthModalOpen(true);
              }
            }}
            onOpenScannerClick={() => setActiveTab('scan')}
            onViewReferral={handleOpenReferralDetail}
            onShowQrModal={(referral) => setQrModalReferral(referral)}
            onDismissNotification={handleDismissNotification}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        )}

        {activeTab === 'referrals' && isCreatingReferral && (
          <CreateReferralView
            referringFacility={currentUser.facility_name}
            existingReferrals={referrals}
            isOffline={!isOnline}
            onCreateReferral={handleCreateReferral}
            onDone={() => setIsCreatingReferral(false)}
            onShowQrModal={(referral) => setQrModalReferral(referral)}
            onViewReferralDetail={(referral) => {
              setIsCreatingReferral(false);
              handleOpenReferralDetail(referral);
            }}
          />
        )}

        {activeTab === 'scan' && (
          <ReceivingFacilityView
            mode="scan"
            currentUser={currentUser}
            referrals={referrals}
            events={events}
            selectedReferral={selectedReferral}
            canUpdateStatus={rolePermissions.canUpdateReferralStatus}
            onSelectReferral={setSelectedReferral}
            onUpdateStatus={handleUpdateStatus}
            onScanQrPayload={handleScanQrPayload}
            onShowQrModal={(referral) => setQrModalReferral(referral)}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onBackToDashboard={() => setActiveTab('referrals')}
          />
        )}

        {activeTab === 'search' && (
          <ReceivingFacilityView
            mode="search"
            currentUser={currentUser}
            referrals={referrals}
            events={events}
            selectedReferral={selectedReferral}
            canUpdateStatus={rolePermissions.canUpdateReferralStatus}
            onSelectReferral={setSelectedReferral}
            onUpdateStatus={handleUpdateStatus}
            onScanQrPayload={handleScanQrPayload}
            onShowQrModal={(referral) => setQrModalReferral(referral)}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onBackToDashboard={() => setActiveTab('referrals')}
          />
        )}
      </main>

      {/* Prototype Footer */}
      <footer className="border-t border-[#E2E8F0] bg-[#FFFFFF] py-3.5 px-4 text-center text-xs font-semibold text-[#475569]">
        Xareloop Clinical Referral-Feedback Prototype • Synthetic Patient Data Only (SYN-001 – SYN-999) • No Real Patient PII
      </footer>

      {/* QR Code Slip Modal */}
      {qrModalReferral && (
        <QrHandoffModal
          referral={qrModalReferral}
          onClose={() => setQrModalReferral(null)}
          onSimulateReceiveScan={(referral) => {
            setQrModalReferral(null);
            handleOpenReferralDetail(referral);
          }}
        />
      )}

      {/* Facility Role & Staff Authentication Modal */}
      {isAuthModalOpen && (
        <AuthModal
          users={users}
          currentUser={currentUser}
          onSelectUser={handleSelectUser}
          onRegisterUser={handleRegisterUser}
          onClose={() => setIsAuthModalOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
