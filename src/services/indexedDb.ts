import type {
  CloudSyncLogEntry,
  InAppNotification,
  Referral,
  SmsFallbackMessage,
  StatusEvent,
  SyncQueueItem,
  UserAccount,
} from '../types/referral';
import {
  INITIAL_CLOUD_SYNC_LOGS,
  INITIAL_DEMO_USERS,
  INITIAL_SYNTHETIC_EVENTS,
  INITIAL_SYNTHETIC_NOTIFICATIONS,
  INITIAL_SYNTHETIC_REFERRALS,
  INITIAL_SYNTHETIC_SMS_LOGS,
} from '../data/syntheticData';

const DB_NAME = 'xareloop_offline_db_v1';
const DB_VERSION = 1;
const STORE_NAME = 'kv_store';

export interface LocalDbSnapshot {
  referrals: Referral[];
  events: StatusEvent[];
  sms_logs: SmsFallbackMessage[];
  notifications: InAppNotification[];
  sync_queue: SyncQueueItem[];
  users: UserAccount[];
  cloud_revision?: number;
  cloud_logs?: CloudSyncLogEntry[];
  last_synced_at: string;
}

function getDefaultSnapshot(): LocalDbSnapshot {
  return {
    referrals: [...INITIAL_SYNTHETIC_REFERRALS],
    events: [...INITIAL_SYNTHETIC_EVENTS],
    sms_logs: [...INITIAL_SYNTHETIC_SMS_LOGS],
    notifications: [...INITIAL_SYNTHETIC_NOTIFICATIONS],
    sync_queue: [],
    users: [...INITIAL_DEMO_USERS],
    cloud_revision: 1,
    cloud_logs: [...INITIAL_CLOUD_SYNC_LOGS],
    last_synced_at: new Date().toISOString(),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLocalSnapshot(): Promise<LocalDbSnapshot> {
  try {
    const db = await openDatabase();
    return await new Promise<LocalDbSnapshot>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('snapshot');
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result as LocalDbSnapshot);
        } else {
          const initial = getDefaultSnapshot();
          saveLocalSnapshot(initial).then(() => resolve(initial));
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(DB_NAME);
      if (raw) {
        return JSON.parse(raw) as LocalDbSnapshot;
      }
    } catch {
      // Ignore storage errors
    }
    return getDefaultSnapshot();
  }
}

export async function saveLocalSnapshot(
  snapshot: LocalDbSnapshot
): Promise<void> {
  try {
    localStorage.setItem(DB_NAME, JSON.stringify(snapshot));
  } catch {
    // Ignore localStorage quota/availability errors
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(snapshot, 'snapshot');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback to localStorage already saved above
  }
}

export async function clearAndResetLocalSnapshot(): Promise<LocalDbSnapshot> {
  const fresh = getDefaultSnapshot();
  await saveLocalSnapshot(fresh);
  return fresh;
}
