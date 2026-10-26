import QRCode from 'qrcode';
import {
  PRIMARY_CATEGORIES_MAP,
  REFERRAL_STATUSES,
} from '../types/referral.ts';
import type {
  DashboardMetrics,
  FacilityType,
  InAppNotification,
  PrimaryReferralCategory,
  Referral,
  ReferralCategory,
  ReferralPriority,
  ReferralStatus,
  SmsFallbackMessage,
  StatusEvent,
  SyncQueueItem,
  SyncStatus,
  UserAccount,
} from '../types/referral.ts';

/**
 * Formats primary category and optional sub-category into a unified display label.
 */
export function formatReferralCategoryLabel(
  primaryCategory: string,
  subCategory?: string
): string {
  const primary = (primaryCategory || '').trim();
  const sub = (subCategory || '').trim();
  if (!sub) return primary;
  return `${primary} — ${sub}`;
}

/**
 * Returns the available sub-categories for a given primary category.
 */
export function getSubCategoriesForPrimary(primaryCategory: string): string[] {
  return (
    PRIMARY_CATEGORIES_MAP[primaryCategory as PrimaryReferralCategory] || []
  );
}

/**
 * Validates that a patient code strictly conforms to the synthetic format (e.g., SYN-001).
 * Rejects real names, phone numbers, ABHA numbers (14 digits), or addresses.
 */
export function validateSyntheticPatientCode(code: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = (code || '').trim().toUpperCase();
  if (!trimmed) {
    return { valid: false, error: 'Patient code is required.' };
  }
  const syntheticRegex = /^SYN-[0-9]{3,6}$/;
  if (!syntheticRegex.test(trimmed)) {
    return {
      valid: false,
      error:
        'Only synthetic patient codes (format SYN-001, SYN-002, etc.) are permitted. Never enter real names, phone numbers, or ABHA IDs.',
    };
  }
  return { valid: true };
}

/**
 * Validates an entire dataset of referrals to ensure no PII / non-synthetic patient codes exist.
 */
export function validateSyntheticDataset(referrals: Referral[]): {
  valid: boolean;
  invalidIds: string[];
} {
  const invalidIds: string[] = [];
  for (const r of referrals) {
    const check = validateSyntheticPatientCode(r.patient_code);
    if (!check.valid) {
      invalidIds.push(r.referral_id);
    }
  }
  return {
    valid: invalidIds.length === 0,
    invalidIds,
  };
}

/**
 * Generates a unique short referral ID (e.g., XL-1007 or XL-4829) that does not collide with existing IDs.
 */
export function generateUniqueReferralId(existingIds: Iterable<string>): string {
  const idSet = new Set(
    Array.from(existingIds).map((id) => id.trim().toUpperCase())
  );

  let maxSequential = 1000;
  for (const id of idSet) {
    const match = /^XL-(\d{4})$/.exec(id);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxSequential && num < 9000) {
        maxSequential = num;
      }
    }
  }

  const candidateSeq = `XL-${String(maxSequential + 1).padStart(4, '0')}`;
  if (!idSet.has(candidateSeq)) {
    return candidateSeq;
  }

  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 1000; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    const candidate = `XL-${suffix}`;
    if (!idSet.has(candidate)) {
      return candidate;
    }
  }

  throw new Error('Unable to generate unique referral ID');
}

/**
 * Encodes referral payload for QR code generation and scanning.
 */
export function buildReferralQrPayload(
  referral: Pick<
    Referral,
    'referral_id' | 'patient_code' | 'referring_facility' | 'receiving_facility'
  >
): string {
  return JSON.stringify({
    protocol: 'XARELOOP_V1',
    referral_id: referral.referral_id,
    patient_code: referral.patient_code,
    from: referral.referring_facility,
    to: referral.receiving_facility,
  });
}

/**
 * Parses either a raw short referral ID ("XL-1001"), a URL containing ?ref=XL-1001, or a JSON QR payload.
 */
export function parseReferralLookupInput(rawInput: string): string {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.referral_id === 'string') {
        return parsed.referral_id.trim().toUpperCase();
      }
    } catch {
      // Fall through to regex/plain parsing
    }
  }

  const idMatch = /\b(XL-[A-Z0-9]{3,8})\b/i.exec(trimmed);
  if (idMatch) {
    return idMatch[1].toUpperCase();
  }

  return trimmed.toUpperCase();
}

/**
 * Generates an SVG string QR code linked to a referral.
 */
export async function generateReferralQrSvg(
  referral: Pick<
    Referral,
    'referral_id' | 'patient_code' | 'referring_facility' | 'receiving_facility'
  >
): Promise<string> {
  const payload = buildReferralQrPayload(referral);
  return QRCode.toString(payload, {
    type: 'svg',
    margin: 1,
    width: 240,
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
}

export interface CreateReferralInput {
  patient_code: string;
  referring_facility: string;
  receiving_facility: string;
  primary_category?: ReferralCategory;
  sub_category?: string;
  referral_category?: ReferralCategory;
  priority: ReferralPriority;
  existingReferralIds?: Iterable<string>;
  nowIso?: string;
  isOffline?: boolean;
}

export interface CreateReferralResult {
  referral: Referral;
  initialEvent: StatusEvent;
  smsMessage: SmsFallbackMessage;
}

/**
 * Creates a new Referral along with its initial 'Referred' StatusEvent and simulated SMS notification.
 * Supports primary_category + optional sub_category as well as direct referral_category.
 */
export function createReferralRecord(
  input: CreateReferralInput
): CreateReferralResult {
  const validation = validateSyntheticPatientCode(input.patient_code);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  if (!input.referring_facility?.trim()) {
    throw new Error('Referring facility is required.');
  }
  if (!input.receiving_facility?.trim()) {
    throw new Error('Receiving facility is required.');
  }
  if (input.referring_facility.trim() === input.receiving_facility.trim()) {
    throw new Error(
      'Receiving facility must be different from referring facility.'
    );
  }

  const primaryCat = (
    input.primary_category ||
    input.referral_category ||
    ''
  ).trim();
  if (!primaryCat) {
    throw new Error('Primary referral category is required.');
  }
  const subCat = input.sub_category?.trim() || undefined;
  const fullCategoryLabel = formatReferralCategoryLabel(primaryCat, subCat);

  const timestamp = input.nowIso || new Date().toISOString();
  const syncStatus: SyncStatus = input.isOffline ? 'Saved offline' : 'Synced';
  const referralId = generateUniqueReferralId(input.existingReferralIds || []);
  const normalizedPatientCode = input.patient_code.trim().toUpperCase();

  const referral: Referral = {
    referral_id: referralId,
    patient_code: normalizedPatientCode,
    referring_facility: input.referring_facility.trim(),
    receiving_facility: input.receiving_facility.trim(),
    primary_category: primaryCat,
    sub_category: subCat,
    referral_category: fullCategoryLabel,
    priority: input.priority,
    created_at: timestamp,
    current_status: 'Referred',
    last_updated_at: timestamp,
    sync_status: syncStatus,
  };

  const initialEvent: StatusEvent = {
    event_id: `EVT-${referralId}-1-${Date.now()}`,
    referral_id: referralId,
    facility_id: referral.referring_facility,
    status: 'Referred',
    timestamp,
    sync_status: syncStatus,
  };

  const smsMessage = createSimulatedSmsMessage(
    referralId,
    referral.referring_facility,
    'Referred',
    timestamp,
    input.isOffline
  );

  return { referral, initialEvent, smsMessage };
}

/**
 * Looks up a referral by short referral ID or QR payload.
 */
export function lookupReferralById(
  referrals: Referral[],
  queryOrPayload: string
): { found: boolean; referral: Referral | null; message: string } {
  const normalizedId = parseReferralLookupInput(queryOrPayload);
  if (!normalizedId) {
    return {
      found: false,
      referral: null,
      message: 'Referral not found',
    };
  }

  const match = referrals.find(
    (r) => r.referral_id.toUpperCase() === normalizedId
  );

  if (!match) {
    return {
      found: false,
      referral: null,
      message: 'Referral not found',
    };
  }

  return {
    found: true,
    referral: match,
    message: `Referral ${match.referral_id} loaded.`,
  };
}

/**
 * Generates a simulated SMS fallback message per specification:
 * Example: “Xareloop: Referral XL-1234 has been marked ARRIVED at CHC Demo.”
 */
export function createSimulatedSmsMessage(
  referralId: string,
  facilityId: string,
  status: ReferralStatus,
  timestamp: string = new Date().toISOString(),
  isOffline: boolean = false
): SmsFallbackMessage {
  const upperStatus = status.toUpperCase();
  return {
    sms_id: `SMS-${referralId}-${upperStatus}-${Date.parse(timestamp) || Date.now()}`,
    referral_id: referralId,
    facility_id: facilityId,
    status,
    message: `Xareloop: Referral ${referralId} has been marked ${upperStatus} at ${facilityId}.`,
    timestamp,
    delivery_state: isOffline ? 'Queued offline' : 'Simulated sent',
  };
}

/**
 * Creates an in-app notification for the referring facility when a referral status is updated.
 */
export function createReferringNotification(
  referral: Referral,
  actorFacility: string,
  status: ReferralStatus,
  timestamp: string = new Date().toISOString()
): InAppNotification {
  return {
    notification_id: `NOTIF-${referral.referral_id}-${status.toUpperCase()}-${Date.parse(timestamp) || Date.now()}`,
    referral_id: referral.referral_id,
    patient_code: referral.patient_code,
    target_facility: referral.referring_facility,
    actor_facility: actorFacility,
    status,
    title: `Referral ${referral.referral_id} marked ${status}`,
    message: `${actorFacility} updated ${referral.patient_code} (${referral.referral_category}) to ${status}.`,
    timestamp,
    read: false,
  };
}

export interface ApplyStatusUpdateInput {
  referrals: Referral[];
  events: StatusEvent[];
  referral_id: string;
  facility_id: string;
  status: ReferralStatus;
  timestamp?: string;
  isOffline?: boolean;
}

export interface ApplyStatusUpdateResult {
  updatedReferral: Referral;
  newEvent: StatusEvent;
  smsMessage: SmsFallbackMessage;
  notification: InAppNotification;
  referrals: Referral[];
  events: StatusEvent[];
}

/**
 * Records a status update for a referral, updating current_status, last_updated_at,
 * appending a StatusEvent, generating a simulated SMS fallback log entry,
 * and generating an in-app notification for the referring facility.
 */
export function applyReferralStatusUpdate(
  input: ApplyStatusUpdateInput
): ApplyStatusUpdateResult {
  if (!REFERRAL_STATUSES.includes(input.status)) {
    throw new Error(`Invalid status: ${input.status}`);
  }
  if (!input.facility_id?.trim()) {
    throw new Error('Facility name is required for status update.');
  }

  const lookup = lookupReferralById(input.referrals, input.referral_id);
  if (!lookup.found || !lookup.referral) {
    throw new Error('Referral not found');
  }

  const timestamp = input.timestamp || new Date().toISOString();
  const syncStatus: SyncStatus = input.isOffline ? 'Saved offline' : 'Synced';
  const facilityId = input.facility_id.trim();

  const updatedReferral: Referral = {
    ...lookup.referral,
    current_status: input.status,
    last_updated_at: timestamp,
    sync_status: syncStatus,
  };

  const newEvent: StatusEvent = {
    event_id: `EVT-${updatedReferral.referral_id}-${input.status.toUpperCase()}-${Date.parse(timestamp) || Date.now()}`,
    referral_id: updatedReferral.referral_id,
    facility_id: facilityId,
    status: input.status,
    timestamp,
    sync_status: syncStatus,
  };

  const smsMessage = createSimulatedSmsMessage(
    updatedReferral.referral_id,
    facilityId,
    input.status,
    timestamp,
    Boolean(input.isOffline)
  );

  const notification = createReferringNotification(
    updatedReferral,
    facilityId,
    input.status,
    timestamp
  );

  const nextReferrals = input.referrals.map((r) =>
    r.referral_id === updatedReferral.referral_id ? updatedReferral : r
  );
  const nextEvents = [...input.events, newEvent];

  return {
    updatedReferral,
    newEvent,
    smsMessage,
    notification,
    referrals: nextReferrals,
    events: nextEvents,
  };
}

/**
 * Returns the chronological timeline of status events for a given referral_id.
 */
export function getReferralTimeline(
  events: StatusEvent[],
  referralId: string
): StatusEvent[] {
  const normalized = referralId.trim().toUpperCase();
  return events
    .filter((e) => e.referral_id.toUpperCase() === normalized)
    .slice()
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/**
 * Calculates the 5 required dashboard metrics from a referral & event dataset:
 * 1. Total referrals
 * 2. Referrals with confirmed arrival
 * 3. Referrals with first status update
 * 4. Referrals with follow-up recorded
 * 5. Average time (in minutes) from referral creation to first receiving-facility update
 */
export function calculateDashboardMetrics(
  referrals: Referral[],
  events: StatusEvent[]
): DashboardMetrics {
  const total_referrals = referrals.length;
  let confirmed_arrivals = 0;
  let with_first_status_update = 0;
  let with_follow_up = 0;

  const firstUpdateDiffsMinutes: number[] = [];

  const postReferralStatuses = new Set<ReferralStatus>([
    'Arrived',
    'Seen',
    'Treated',
    'Follow-up',
    'Back-referred',
  ]);

  for (const ref of referrals) {
    const timeline = getReferralTimeline(events, ref.referral_id);

    const hasArrival =
      postReferralStatuses.has(ref.current_status) ||
      timeline.some((e) => postReferralStatuses.has(e.status));
    if (hasArrival) {
      confirmed_arrivals += 1;
    }

    const hasFollowUp =
      ref.current_status === 'Follow-up' ||
      timeline.some((e) => e.status === 'Follow-up');
    if (hasFollowUp) {
      with_follow_up += 1;
    }

    const firstUpdateEvent = timeline.find(
      (e) => e.status !== 'Referred' || e.facility_id !== ref.referring_facility
    );

    if (firstUpdateEvent) {
      with_first_status_update += 1;
      const createdMs = Date.parse(ref.created_at);
      const updateMs = Date.parse(firstUpdateEvent.timestamp);
      if (
        !Number.isNaN(createdMs) &&
        !Number.isNaN(updateMs) &&
        updateMs >= createdMs
      ) {
        firstUpdateDiffsMinutes.push((updateMs - createdMs) / (1000 * 60));
      }
    }
  }

  const avg_minutes_to_first_update =
    firstUpdateDiffsMinutes.length > 0
      ? Math.round(
          firstUpdateDiffsMinutes.reduce((acc, v) => acc + v, 0) /
            firstUpdateDiffsMinutes.length
        )
      : null;

  return {
    total_referrals,
    confirmed_arrivals,
    with_first_status_update,
    with_follow_up,
    avg_minutes_to_first_update,
    is_synthetic_demo_data: true,
  };
}

/**
 * Generates an idempotency key for an event so offline synchronization prevents duplicate events.
 */
export function buildEventIdempotencyKey(
  event: Pick<
    StatusEvent,
    'referral_id' | 'facility_id' | 'status' | 'timestamp'
  >
): string {
  return `${event.referral_id.toUpperCase()}::${event.facility_id.toUpperCase()}::${event.status.toUpperCase()}::${event.timestamp}`;
}

/**
 * Enqueues an offline operation while preventing duplicate queue items.
 */
export function enqueueOfflineItem(
  queue: SyncQueueItem[],
  item: Omit<SyncQueueItem, 'idempotency_key'>
): SyncQueueItem[] {
  const idempotency_key = buildEventIdempotencyKey(item.event);
  const exists = queue.some((q) => q.idempotency_key === idempotency_key);
  if (exists) {
    return queue;
  }
  return [...queue, { ...item, idempotency_key }];
}

/**
 * Synchronizes queued offline items into the target state (referrals, events, sms_logs, notifications),
 * marking all synced items as 'Synced' / 'Simulated sent' and strictly preventing duplicate events.
 */
export function synchronizeOfflineQueue(
  currentState: {
    referrals: Referral[];
    events: StatusEvent[];
    sms_logs: SmsFallbackMessage[];
    notifications?: InAppNotification[];
  },
  queue: SyncQueueItem[]
): {
  referrals: Referral[];
  events: StatusEvent[];
  sms_logs: SmsFallbackMessage[];
  notifications: InAppNotification[];
  syncedCount: number;
  skippedDuplicates: number;
  remainingQueue: SyncQueueItem[];
} {
  const referralMap = new Map<string, Referral>();
  for (const r of currentState.referrals) {
    referralMap.set(r.referral_id.toUpperCase(), { ...r });
  }

  const existingEventKeys = new Set<string>();
  const existingEventIds = new Set<string>();
  const mergedEvents: StatusEvent[] = currentState.events.map((e) => {
    const syncedEvent: StatusEvent = { ...e, sync_status: 'Synced' };
    existingEventKeys.add(buildEventIdempotencyKey(syncedEvent));
    existingEventIds.add(syncedEvent.event_id);
    return syncedEvent;
  });

  const existingSmsIds = new Set<string>(
    currentState.sms_logs.map((s) => s.sms_id)
  );
  const mergedSms: SmsFallbackMessage[] = currentState.sms_logs.map((s) => ({
    ...s,
    delivery_state: 'Simulated sent',
  }));

  const currentNotifs = currentState.notifications || [];
  const existingNotifIds = new Set<string>(
    currentNotifs.map((n) => n.notification_id)
  );
  const mergedNotifications: InAppNotification[] = [...currentNotifs];

  let syncedCount = 0;
  let skippedDuplicates = 0;

  const sortedQueue = [...queue].sort(
    (a, b) => Date.parse(a.queued_at) - Date.parse(b.queued_at)
  );

  for (const item of sortedQueue) {
    if (item.referral) {
      const refKey = item.referral.referral_id.toUpperCase();
      const existingRef = referralMap.get(refKey);
      if (!existingRef) {
        referralMap.set(refKey, {
          ...item.referral,
          sync_status: 'Synced',
        });
      }
    }

    const eventKey = buildEventIdempotencyKey(item.event);
    if (
      existingEventKeys.has(eventKey) ||
      existingEventIds.has(item.event.event_id)
    ) {
      skippedDuplicates += 1;
    } else {
      const syncedEvent: StatusEvent = {
        ...item.event,
        sync_status: 'Synced',
      };
      mergedEvents.push(syncedEvent);
      existingEventKeys.add(eventKey);
      existingEventIds.add(syncedEvent.event_id);
      syncedCount += 1;
    }

    const targetRef = referralMap.get(item.event.referral_id.toUpperCase());
    if (targetRef) {
      if (
        Date.parse(item.event.timestamp) >=
        Date.parse(targetRef.last_updated_at)
      ) {
        targetRef.current_status = item.event.status;
        targetRef.last_updated_at = item.event.timestamp;
      }
      targetRef.sync_status = 'Synced';
    }

    if (item.sms && !existingSmsIds.has(item.sms.sms_id)) {
      mergedSms.unshift({
        ...item.sms,
        delivery_state: 'Simulated sent',
      });
      existingSmsIds.add(item.sms.sms_id);
    }

    if (
      item.notification &&
      !existingNotifIds.has(item.notification.notification_id)
    ) {
      mergedNotifications.unshift(item.notification);
      existingNotifIds.add(item.notification.notification_id);
    }
  }

  const finalReferrals = Array.from(referralMap.values()).map((r) => ({
    ...r,
    sync_status: 'Synced' as SyncStatus,
  }));

  return {
    referrals: finalReferrals,
    events: mergedEvents,
    sms_logs: mergedSms,
    notifications: mergedNotifications,
    syncedCount,
    skippedDuplicates,
    remainingQueue: [],
  };
}

/**
 * Registers a new user account with facility type ('referring' | 'receiving') and facility name.
 */
export function registerUserAccount(
  existingUsers: UserAccount[],
  input: {
    username: string;
    password_mock: string;
    display_name: string;
    role_label?: string;
    facility_type: FacilityType;
    facility_name: string;
  }
): { user: UserAccount; users: UserAccount[] } {
  const username = (input.username || '').trim().toLowerCase();
  if (!username || username.length < 3) {
    throw new Error('Username must be at least 3 characters.');
  }
  if (!input.password_mock || input.password_mock.length < 4) {
    throw new Error('Password must be at least 4 characters.');
  }
  if (!input.display_name?.trim()) {
    throw new Error('Display name is required.');
  }
  if (
    input.facility_type !== 'referring' &&
    input.facility_type !== 'receiving'
  ) {
    throw new Error('Facility type must be referring or receiving.');
  }
  if (!input.facility_name?.trim()) {
    throw new Error('Facility name is required.');
  }
  if (existingUsers.some((u) => u.username.toLowerCase() === username)) {
    throw new Error(`Username "${username}" is already registered.`);
  }

  const newUser: UserAccount = {
    user_id: `USR-${String(existingUsers.length + 1).padStart(3, '0')}-${Date.now()}`,
    username,
    password_mock: input.password_mock,
    display_name: input.display_name.trim(),
    role_label:
      input.role_label?.trim() ||
      (input.facility_type === 'referring'
        ? 'Referring Clinician / ANM'
        : 'Receiving Triage Coordinator'),
    facility_type: input.facility_type,
    facility_name: input.facility_name.trim(),
    created_at: new Date().toISOString(),
  };

  return {
    user: newUser,
    users: [...existingUsers, newUser],
  };
}

/**
 * Authenticates a user with mock credentials.
 */
export function authenticateUser(
  users: UserAccount[],
  username: string,
  password_mock: string
): { authenticated: boolean; user: UserAccount | null; error?: string } {
  const normalizedUsername = (username || '').trim().toLowerCase();
  if (!normalizedUsername || !password_mock) {
    return {
      authenticated: false,
      user: null,
      error: 'Username and password are required.',
    };
  }

  const found = users.find(
    (u) =>
      u.username.toLowerCase() === normalizedUsername &&
      u.password_mock === password_mock
  );

  if (!found) {
    return {
      authenticated: false,
      user: null,
      error: 'Invalid credentials. Try one of the demo accounts or register a new facility account.',
    };
  }

  return {
    authenticated: true,
    user: found,
  };
}
