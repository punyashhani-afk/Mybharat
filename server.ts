import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  INITIAL_DEMO_USERS,
  INITIAL_SYNTHETIC_EVENTS,
  INITIAL_SYNTHETIC_NOTIFICATIONS,
  INITIAL_SYNTHETIC_REFERRALS,
  INITIAL_SYNTHETIC_SMS_LOGS,
} from './src/data/syntheticData.ts';
import {
  applyReferralStatusUpdate,
  authenticateUser,
  buildEventIdempotencyKey,
  createReferralRecord,
  registerUserAccount,
  synchronizeOfflineQueue,
} from './src/core/referralEngine.ts';
import {
  InAppNotification,
  Referral,
  SmsFallbackMessage,
  StatusEvent,
  SyncQueueItem,
  UserAccount,
} from './src/types/referral.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ServerStore {
  referrals: Referral[];
  events: StatusEvent[];
  sms_logs: SmsFallbackMessage[];
  notifications: InAppNotification[];
  users: UserAccount[];
}

let store: ServerStore = {
  referrals: [...INITIAL_SYNTHETIC_REFERRALS],
  events: [...INITIAL_SYNTHETIC_EVENTS],
  sms_logs: [...INITIAL_SYNTHETIC_SMS_LOGS],
  notifications: [...INITIAL_SYNTHETIC_NOTIFICATIONS],
  users: [...INITIAL_DEMO_USERS],
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'xareloop-referral-feedback-mvp',
      disclaimer:
        'Prototype — Not for Clinical Use. All patient information shown is synthetic.',
      timestamp: new Date().toISOString(),
    });
  });

  // Get full synchronized state
  app.get('/api/state', (_req, res) => {
    res.json({
      ...store,
      server_time: new Date().toISOString(),
    });
  });

  // Create referral endpoint
  app.post('/api/referrals', (req, res) => {
    try {
      const {
        patient_code,
        referring_facility,
        receiving_facility,
        primary_category,
        sub_category,
        referral_category,
        priority,
      } = req.body;

      const result = createReferralRecord({
        patient_code,
        referring_facility,
        receiving_facility,
        primary_category,
        sub_category,
        referral_category,
        priority,
        existingReferralIds: store.referrals.map((r) => r.referral_id),
        isOffline: false,
      });

      store.referrals = [result.referral, ...store.referrals];
      store.events = [...store.events, result.initialEvent];
      store.sms_logs = [result.smsMessage, ...store.sms_logs];

      res.status(201).json({
        referral: result.referral,
        event: result.initialEvent,
        sms: result.smsMessage,
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
      });

      store.referrals = result.referrals;
      store.events = result.events;
      store.sms_logs = [result.smsMessage, ...store.sms_logs];
      store.notifications = [result.notification, ...store.notifications];

      res.json({
        referral: result.updatedReferral,
        event: result.newEvent,
        sms: result.smsMessage,
        notification: result.notification,
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

      // Merge any client referrals not yet on server
      const refMap = new Map<string, Referral>();
      for (const r of store.referrals) {
        refMap.set(r.referral_id.toUpperCase(), { ...r, sync_status: 'Synced' });
      }
      for (const r of referrals) {
        const key = r.referral_id.toUpperCase();
        const existing = refMap.get(key);
        if (
          !existing ||
          Date.parse(r.last_updated_at) >= Date.parse(existing.last_updated_at)
        ) {
          refMap.set(key, { ...r, sync_status: 'Synced' });
        }
      }

      // Merge client events idempotently
      const eventKeys = new Set<string>();
      const mergedEvents: StatusEvent[] = [];
      for (const e of [...store.events, ...events]) {
        const key = buildEventIdempotencyKey(e);
        if (!eventKeys.has(key)) {
          eventKeys.add(key);
          mergedEvents.push({ ...e, sync_status: 'Synced' });
        }
      }

      // Merge SMS logs
      const smsIds = new Set<string>();
      const mergedSms: SmsFallbackMessage[] = [];
      for (const s of [...sms_logs, ...store.sms_logs]) {
        if (!smsIds.has(s.sms_id)) {
          smsIds.add(s.sms_id);
          mergedSms.push({ ...s, delivery_state: 'Simulated sent' });
        }
      }

      // Merge notifications (preserving read state if marked read on client)
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

      // Merge users
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
        referrals: syncResult.referrals,
        events: syncResult.events,
        sms_logs: syncResult.sms_logs,
        notifications: syncResult.notifications,
        users: Array.from(userMap.values()),
      };

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
      res.status(201).json({ user: result.user });
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
    res.json({ user: result.user });
  });

  // Reset to initial synthetic dataset
  app.post('/api/reset', (_req, res) => {
    store = {
      referrals: [...INITIAL_SYNTHETIC_REFERRALS],
      events: [...INITIAL_SYNTHETIC_EVENTS],
      sms_logs: [...INITIAL_SYNTHETIC_SMS_LOGS],
      notifications: [...INITIAL_SYNTHETIC_NOTIFICATIONS],
      users: [...INITIAL_DEMO_USERS],
    };
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
