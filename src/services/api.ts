import type {
  CloudSyncLogEntry,
  InAppNotification,
  Referral,
  ReferralStatus,
  SmsFallbackMessage,
  StatusEvent,
  SyncQueueItem,
  UserAccount,
} from '../types/referral';

export interface ServerStateResponse {
  referrals: Referral[];
  events: StatusEvent[];
  sms_logs: SmsFallbackMessage[];
  notifications: InAppNotification[];
  users: UserAccount[];
  cloud_revision: number;
  cloud_logs: CloudSyncLogEntry[];
  server_time: string;
}

export async function fetchServerState(): Promise<ServerStateResponse> {
  const response = await fetch('/api/state', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch state: ${response.status}`);
  }
  return response.json();
}

export async function postSyncBatchToServer(
  queue: SyncQueueItem[],
  localReferrals: Referral[],
  localEvents: StatusEvent[],
  localSms: SmsFallbackMessage[],
  localNotifications: InAppNotification[],
  localUsers: UserAccount[]
): Promise<
  ServerStateResponse & { syncedCount: number; skippedDuplicates: number }
> {
  const response = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queue,
      referrals: localReferrals,
      events: localEvents,
      sms_logs: localSms,
      notifications: localNotifications,
      users: localUsers,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to synchronize with server: ${response.status}`);
  }
  return response.json();
}

export async function postSimulateRemoteCloudUpdate(options?: {
  referral_id?: string;
  status?: ReferralStatus;
}): Promise<
  ServerStateResponse & {
    updatedReferral: Referral;
    cloudLog: CloudSyncLogEntry;
  }
> {
  const response = await fetch('/api/cloud/simulate-remote-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  if (!response.ok) {
    throw new Error(`Cloud remote update failed: ${response.status}`);
  }
  return response.json();
}

export async function postResetServerState(): Promise<ServerStateResponse> {
  const response = await fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to reset server state: ${response.status}`);
  }
  return response.json();
}
