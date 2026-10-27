import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  INITIAL_CLOUD_SYNC_LOGS,
  INITIAL_DEMO_USERS,
  INITIAL_SYNTHETIC_EVENTS,
  INITIAL_SYNTHETIC_NOTIFICATIONS,
  INITIAL_SYNTHETIC_REFERRALS,
  INITIAL_SYNTHETIC_SMS_LOGS,
} from './src/data/syntheticData.ts';
import {
  applyReferralStatusUpdate,
  assertRolePermission,
  authenticateUser,
  buildEventIdempotencyKey,
  createReferralRecord,
  registerUserAccount,
  synchronizeOfflineQueue,
  verifySessionToken,
} from './src/core/referralEngine.ts';
import type {
  CloudSyncLogEntry,
  InAppNotification,
  Referral,
  ReferralStatus,
  SmsFallbackMessage,
  StatusEvent,
  SyncQueueItem,
  UserAccount,
} from './src/types/referral.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLOUD_STATE_FILE = path.join(__dirname, 'data', 'cloud_state.json');

interface ServerStore {
  referrals: Referral[];
  events: StatusEvent[];
  sms_logs: SmsFallbackMessage[];
  notifications: InAppNotification[];
  users: UserAccount[];
  cloud_revision: number;
  cloud_logs: CloudSyncLogEntry[];
}

function getInitialStore(): ServerStore {
  return {
    referrals: [...INITIAL_SYNTHETIC_REFERRALS],
    events: [...INITIAL_SYNTHETIC_EVENTS],
    sms_logs: [...INITIAL_SYNTHETIC_SMS_LOGS],
    notifications: [...INITIAL_SYNTHETIC_NOTIFICATIONS],
    users: [...INITIAL_DEMO_USERS],
    cloud_revision: 1,
    cloud_logs: [...INITIAL_CLOUD_SYNC_LOGS],
  };
}

function loadStoreFromDisk(): ServerStore {
  try {
    if (fs.existsSync(CLOUD_STATE_FILE)) {
      const raw = fs.readFileSync(CLOUD_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ServerStore>;
      if (parsed && Array.isArray(parsed.referrals) && parsed.referrals.length > 0) {
        return {
          referrals: parsed.referrals,
          events: parsed.events || [...INITIAL_SYNTHETIC_EVENTS],
          sms_logs: parsed.sms_logs || [...INITIAL_SYNTHETIC_SMS_LOGS],
          notifications:
            parsed.notifications || [...INITIAL_SYNTHETIC_NOTIFICATIONS],
          users: parsed.users || [...INITIAL_DEMO_USERS],
          cloud_revision: parsed.cloud_revision || 1,
          cloud_logs: parsed.cloud_logs || [...INITIAL_CLOUD_SYNC_LOGS],
        };
      }
    }
  } catch {
    // Ignore disk read error and use default synthetic seed
  }
  return getInitialStore();
}

function saveStoreToDisk(current: ServerStore): void {
  try {
    fs.mkdirSync(path.dirname(CLOUD_STATE_FILE), { recursive: true });
    fs.writeFileSync(CLOUD_STATE_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch {
    // Ignore disk write error in read-only environments
  }
}

let store: ServerStore = loadStoreFromDisk();

// Connected SSE clients for real-time Cloud Update broadcast
const sseClients = new Set<express.Response>();

function appendCloudLog(
  action: CloudSyncLogEntry['action'],
  summary: string
): CloudSyncLogEntry {
  store.cloud_revision += 1;
  const entry: CloudSyncLogEntry = {
    sync_id: `CLD-${store.cloud_revision}-${Date.now()}`,
    revision: store.cloud_revision,
    action,
    summary,
    timestamp: new Date().toISOString(),
  };
  store.cloud_logs = [entry, ...store.cloud_logs].slice(0, 40);
  saveStoreToDisk(store);
  broadcastCloudUpdate();
  return entry;
}

function broadcastCloudUpdate(): void {
  const payload = JSON.stringify({
    ...store,
    server_time: new Date().toISOString(),
  });
  for (const client of sseClients) {
    try {
      client.write(`event: cloud_update\ndata: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'xareloop-referral-feedback-mvp',
      cloud_revision: store.cloud_revision,
      disclaimer:
        'Prototype — Not for Clinical Use. All patient information shown is synthetic.',
      timestamp: new Date().toISOString(),
    });
  });

  // Real-time Cloud Update SSE Stream
  app.get('/api/cloud/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Get full synchronized cloud state
  app.get('/api/state', (_req, res) => {
    res.json({
      ...store,
      server_time: new Date().toISOString(),
    });
  });

  // Simulate or trigger a live remote Cloud Update from a Receiving Hospital
  app.post('/api/cloud/simulate-remote-update', (req, res) => {
    try {
      const requestedId = req.body?.referral_id as string | undefined;
      const progressionOrder: ReferralStatus[] = [
        'Referred',
        'Arrived',
        'Seen',
        'Treated',
        'Follow-up',
      ];

      // Pick either requested referral or a referral that can advance in the loop
      let target = requestedId
        ? store.referrals.find(
            (r) => r.referral_id.toUpperCase() === requestedId.toUpperCase()
          )
        : store.referrals.find((r) => r.current_status === 'Referred') ||
          store.referrals.find((r) => r.current_status === 'Arrived') ||
          store.referrals.find((r) => r.current_status === 'Seen') ||
          store.referrals[0];

      if (!target) {
        res.status(404).json({ error: 'No referral available for cloud update' });
        return;
      }

      const currentIdx = progressionOrder.indexOf(target.current_status);
      const nextStatus: ReferralStatus =
        req.body?.status ||
        (currentIdx >= 0 && currentIdx < progressionOrder.length - 1
          ? progressionOrder[currentIdx + 1]
          : 'Follow-up');

      const result = applyReferralStatusUpdate({
        referrals: store.referrals,
        events: store.events,
        referral_id: target.referral_id,
        facility_id: target.receiving_facility,
        status: nextStatus,
        isOffline: false,
      });

      store.referrals = result.referrals;
      store.events = result.events;
      store.sms_logs = [result.smsMessage, ...store.sms_logs];
      store.notifications = [result.notification, ...store.notifications];

      const logEntry = appendCloudLog(
        'REMOTE_UPDATE',
        `Cloud Receiving Update: ${target.receiving_facility} marked ${target.referral_id} (${target.patient_code}) as ${nextStatus}.`
      );

      res.json({
        ...store,
        updatedReferral: result.updatedReferral,
        cloudLog: logEntry,
        server_time: new Date().toISOString(),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Cloud update failed',
      });
    }
  });

  // Create referral endpoint (standard or custom)
  app.post('/api/referrals', (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      let actorUser: UserAccount | undefined;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        const verified = verifySessionToken(token, store.users);
        if (!verified.valid || !verified.user) {
          res.status(401).json({ error: 'Invalid or expired staff session.' });
          return;
        }
        actorUser = verified.user;
        try {
          assertRolePermission(actorUser, 'CREATE_REFERRAL');
        } catch (permErr) {
          res.status(403).json({
            error:
              permErr instanceof Error ? permErr.message : 'Permission denied',
          });
          return;
        }
      }

      const {
        patient_code,
        referring_facility,
        receiving_facility,
        primary_category,
        sub_category,
        referral_category,
        custom_note,
        is_custom,
        custom_referral_id,
        priority,
      } = req.body;

      const result = createReferralRecord({
        patient_code,
        referring_facility,
        receiving_facility,
        primary_category,
        sub_category,
        referral_category,
        custom_note,
        is_custom,
        custom_referral_id,
        priority,
        existingReferralIds: store.referrals.map((r) => r.referral_id),
        isOffline: false,
        actorUser,
      });

      store.referrals = [result.referral, ...store.referrals];
      store.events = [...store.events, result.initialEvent];
      store.sms_logs = [result.smsMessage, ...store.sms_logs];

      appendCloudLog(
        result.referral.is_custom ? 'CUSTOM_REFERRAL' : 'CLOUD_PUSH',
        `${result.referral.is_custom ? 'Custom referral' : 'Referral'} ${result.referral.referral_id} (${result.referral.patient_code}) created by ${result.referral.referring_facility}.`
      );

      res.status(201).json({
        referral: result.referral,
        event: result.initialEvent,
        sms: result.smsMessage,
        cloud_revision: store.cloud_revision,
        cloud_logs: store.cloud_logs,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Invalid referral payload',
      });
    }
  });

  // Update referral status endpoint
  app.post('/api/referrals/:id/status', (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      let actorUser: UserAccount | undefined;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        const verified = verifySessionToken(token, store.users);
        if (!verified.valid || !verified.user) {
          res.status(401).json({ error: 'Invalid or expired staff session.' });
          return;
        }
        actorUser = verified.user;
        try {
          assertRolePermission(actorUser, 'UPDATE_STATUS');
        } catch (permErr) {
          res.status(403).json({
            error:
              permErr instanceof Error ? permErr.message : 'Permission denied',
          });
          return;
        }
      }

      const referral_id = req.params.id;
      const { facility_id, status, timestamp } = req.body;

      const result = applyReferralStatusUpdate({
        referrals: store.referrals,
        events: store.events,
        referral_id,
        facility_id,
        status,
        timestamp,
        isOffline: false,
        actorUser,
      });

      store.referrals = result.referrals;
      store.events = result.events;
      store.sms_logs = [result.smsMessage, ...store.sms_logs];
      store.notifications = [result.notification, ...store.notifications];

      appendCloudLog(
        'CLOUD_PUSH',
        `Status update synced to Cloud: ${referral_id} marked ${status} at ${facility_id}.`
      );

      res.json({
        referral: result.updatedReferral,
        event: result.newEvent,
        sms: result.smsMessage,
        notification: result.notification,
        cloud_revision: store.cloud_revision,
        cloud_logs: store.cloud_logs,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Status update failed',
      });
    }
  });

  // Idempotent synchronization endpoint for offline queue + multi-node state merge
  app.post('/api/sync', (req, res) => {
    try {
      const {
        queue = [],
        referrals = [],
        events = [],
        sms_logs = [],
        notifications = [],
        users = [],
      } = req.body as {
        queue?: SyncQueueItem[];
        referrals?: Referral[];
        events?: StatusEvent[];
        sms_logs?: SmsFallbackMessage[];
        notifications?: InAppNotification[];
        users?: UserAccount[];
      };

      const refMap = new Map<string, Referral>();
      for (const r of store.referrals) {
        refMap.set(r.referral_id.toUpperCase(), { ...r, sync_status: 'Synced' });
      }
      for (const r of referrals) {
        const key = r.referral_id.toUpperCase();
        const existing = refMap.get(key);
        if (!existing) {
          refMap.set(key, { ...r, sync_status: 'Synced' });
        } else {
          // Merge latest status update AND latest viewed timestamp
          const clientUpdatedNewer =
            Date.parse(r.last_updated_at) > Date.parse(existing.last_updated_at);
          const mergedViewedAt = (() => {
            const cView = r.last_viewed_by_referring_at
              ? Date.parse(r.last_viewed_by_referring_at)
              : 0;
            const sView = existing.last_viewed_by_referring_at
              ? Date.parse(existing.last_viewed_by_referring_at)
              : 0;
            const maxView = Math.max(cView, sView);
            return maxView > 0
              ? new Date(maxView).toISOString()
              : existing.last_viewed_by_referring_at ||
                  r.last_viewed_by_referring_at;
          })();

          refMap.set(key, {
            ...(clientUpdatedNewer ? r : existing),
            last_viewed_by_referring_at: mergedViewedAt,
            sync_status: 'Synced',
          });
        }
      }

      const eventKeys = new Set<string>();
      const mergedEvents: StatusEvent[] = [];
      for (const e of [...store.events, ...events]) {
        const key = buildEventIdempotencyKey(e);
        if (!eventKeys.has(key)) {
          eventKeys.add(key);
          mergedEvents.push({ ...e, sync_status: 'Synced' });
        }
      }

      const smsIds = new Set<string>();
      const mergedSms: SmsFallbackMessage[] = [];
      for (const s of [...sms_logs, ...store.sms_logs]) {
        if (!smsIds.has(s.sms_id)) {
          smsIds.add(s.sms_id);
          mergedSms.push({ ...s, delivery_state: 'Simulated sent' });
        }
      }

      const notifMap = new Map<string, InAppNotification>();
      for (const n of store.notifications) {
        notifMap.set(n.notification_id, { ...n });
      }
      for (const n of notifications) {
        const existing = notifMap.get(n.notification_id);
        if (!existing) {
          notifMap.set(n.notification_id, { ...n });
        } else if (n.read && !existing.read) {
          notifMap.set(n.notification_id, { ...existing, read: true });
        }
      }

      const userMap = new Map<string, UserAccount>();
      for (const u of [...store.users, ...users]) {
        userMap.set(u.username.toLowerCase(), u);
      }

      const syncResult = synchronizeOfflineQueue(
        {
          referrals: Array.from(refMap.values()),
          events: mergedEvents,
          sms_logs: mergedSms,
          notifications: Array.from(notifMap.values()),
        },
        queue
      );

      store = {
        ...store,
        referrals: syncResult.referrals,
        events: syncResult.events,
        sms_logs: syncResult.sms_logs,
        notifications: syncResult.notifications,
        users: Array.from(userMap.values()),
      };

      if (queue.length > 0 || syncResult.syncedCount > 0) {
        appendCloudLog(
          'CLOUD_PUSH',
          `Synchronized ${syncResult.syncedCount} offline event(s) with Cloud Hub (${syncResult.skippedDuplicates} duplicates prevented).`
        );
      } else {
        saveStoreToDisk(store);
      }

      res.json({
        ...store,
        syncedCount: syncResult.syncedCount,
        skippedDuplicates: syncResult.skippedDuplicates,
        server_time: new Date().toISOString(),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Sync failed',
      });
    }
  });

  // Prototype Auth endpoints
  app.post('/api/auth/register', (req, res) => {
    try {
      const result = registerUserAccount(store.users, req.body);
      store.users = result.users;
      saveStoreToDisk(store);
      res.status(201).json({
        user: result.user,
        token: result.token,
        permissions: result.permissions,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Registration failed',
      });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password_mock } = req.body || {};
    const result = authenticateUser(store.users, username, password_mock);
    if (!result.authenticated || !result.user) {
      res.status(401).json({ error: result.error || 'Authentication failed' });
      return;
    }
    res.json({
      user: result.user,
      token: result.token,
      permissions: result.permissions,
    });
  });

  // Reset to initial synthetic dataset
  app.post('/api/reset', (_req, res) => {
    store = getInitialStore();
    saveStoreToDisk(store);
    broadcastCloudUpdate();
    res.json({
      ...store,
      server_time: new Date().toISOString(),
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Xareloop server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
