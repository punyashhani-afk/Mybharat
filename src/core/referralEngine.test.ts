import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyReferralStatusUpdate,
  authenticateUser,
  buildReferralQrPayload,
  calculateDashboardMetrics,
  createReferralRecord,
  enqueueOfflineItem,
  formatReferralCategoryLabel,
  generateReferralQrSvg,
  generateUniqueReferralId,
  getReferralTimeline,
  getSubCategoriesForPrimary,
  lookupReferralById,
  registerUserAccount,
  synchronizeOfflineQueue,
  validateSyntheticDataset,
  validateSyntheticPatientCode,
} from './referralEngine.ts';
import {
  INITIAL_DEMO_USERS,
  INITIAL_SYNTHETIC_EVENTS,
  INITIAL_SYNTHETIC_NOTIFICATIONS,
  INITIAL_SYNTHETIC_REFERRALS,
  INITIAL_SYNTHETIC_SMS_LOGS,
} from '../data/syntheticData.ts';
import { REFERRAL_STATUSES } from '../types/referral.ts';
import type { SyncQueueItem } from '../types/referral.ts';

test('1. Referral creation with primary and optional sub-category creates valid Referral, initial Referred event, and SMS', () => {
  const result = createReferralRecord({
    patient_code: 'SYN-007',
    referring_facility: 'PHC Demo North',
    receiving_facility: 'District Hospital Demo',
    primary_category: 'Obstetrics',
    sub_category: 'High-Risk Pregnancy',
    priority: 'Urgent',
    existingReferralIds: ['XL-1001', 'XL-1006'],
    nowIso: '2026-10-26T08:00:00.000Z',
    isOffline: false,
  });

  assert.equal(result.referral.referral_id, 'XL-1007');
  assert.equal(result.referral.patient_code, 'SYN-007');
  assert.equal(result.referral.primary_category, 'Obstetrics');
  assert.equal(result.referral.sub_category, 'High-Risk Pregnancy');
  assert.equal(
    result.referral.referral_category,
    'Obstetrics — High-Risk Pregnancy'
  );
  assert.equal(result.referral.current_status, 'Referred');
  assert.equal(result.referral.sync_status, 'Synced');
  assert.equal(result.initialEvent.status, 'Referred');
  assert.equal(result.initialEvent.facility_id, 'PHC Demo North');
  assert.match(result.smsMessage.message, /Xareloop: Referral XL-1007 has been marked REFERRED/);

  // Also test sub-category lookup helper
  const subs = getSubCategoriesForPrimary('Cardiology');
  assert.ok(subs.includes('Acute Chest Pain'));
  assert.equal(formatReferralCategoryLabel('Cardiology'), 'Cardiology');
});

test('2. Unique referral ID generation avoids collisions across sequential and existing IDs', () => {
  const existing = new Set<string>(['XL-1001', 'XL-1002', 'XL-1003']);
  for (let i = 0; i < 25; i++) {
    const nextId = generateUniqueReferralId(existing);
    assert.equal(existing.has(nextId), false, `Duplicate ID generated: ${nextId}`);
    assert.match(nextId, /^XL-[A-Z0-9]{4}$/);
    existing.add(nextId);
  }
});

test('3. QR generation produces valid SVG and round-trips referral lookup payload', async () => {
  const sampleRef = INITIAL_SYNTHETIC_REFERRALS[0];
  const payload = buildReferralQrPayload(sampleRef);
  const svg = await generateReferralQrSvg(sampleRef);

  assert.ok(svg.includes('<svg'), 'Generated QR must be valid SVG markup');
  const lookupFromQr = lookupReferralById(INITIAL_SYNTHETIC_REFERRALS, payload);
  assert.equal(lookupFromQr.found, true);
  assert.equal(lookupFromQr.referral?.referral_id, sampleRef.referral_id);
});

test('4. Valid referral lookup finds referral by case-insensitive short ID', () => {
  const res = lookupReferralById(INITIAL_SYNTHETIC_REFERRALS, 'xl-1002');
  assert.equal(res.found, true);
  assert.equal(res.referral?.patient_code, 'SYN-002');
  assert.equal(res.referral?.receiving_facility, 'Sub-District Hospital Demo');
});

test('5. Invalid referral lookup returns found=false and clear "Referral not found" message', () => {
  const res = lookupReferralById(INITIAL_SYNTHETIC_REFERRALS, 'XL-9999');
  assert.equal(res.found, false);
  assert.equal(res.referral, null);
  assert.equal(res.message, 'Referral not found');

  const emptyRes = lookupReferralById(INITIAL_SYNTHETIC_REFERRALS, '   ');
  assert.equal(emptyRes.found, false);
  assert.equal(emptyRes.message, 'Referral not found');
});

test('6. Each status update (Referred, Arrived, Seen, Treated, Follow-up, Back-referred) records facility, timestamp, referral ID, SMS, and in-app notification', () => {
  let referrals = [...INITIAL_SYNTHETIC_REFERRALS];
  let events = [...INITIAL_SYNTHETIC_EVENTS];

  let baseMinute = 10;
  for (const status of REFERRAL_STATUSES) {
    const ts = `2026-10-26T09:${String(baseMinute).padStart(2, '0')}:00.000Z`;
    baseMinute += 5;

    const update = applyReferralStatusUpdate({
      referrals,
      events,
      referral_id: 'XL-1005',
      facility_id: 'District Hospital Demo',
      status,
      timestamp: ts,
      isOffline: false,
    });

    referrals = update.referrals;
    events = update.events;

    assert.equal(update.updatedReferral.current_status, status);
    assert.equal(update.updatedReferral.last_updated_at, ts);
    assert.equal(update.newEvent.referral_id, 'XL-1005');
    assert.equal(update.newEvent.facility_id, 'District Hospital Demo');
    assert.equal(update.newEvent.status, status);
    assert.equal(update.newEvent.timestamp, ts);
    assert.equal(update.newEvent.sync_status, 'Synced');
    assert.equal(
      update.smsMessage.message,
      `Xareloop: Referral XL-1005 has been marked ${status.toUpperCase()} at District Hospital Demo.`
    );
    assert.equal(update.notification.target_facility, 'PHC Demo North');
    assert.equal(update.notification.actor_facility, 'District Hospital Demo');
    assert.equal(update.notification.status, status);
    assert.equal(update.notification.read, false);
  }
});

test('7. Referral timeline returns chronologically sorted events with facility, timestamp, and sync_status', () => {
  const timeline = getReferralTimeline(INITIAL_SYNTHETIC_EVENTS, 'XL-1001');
  assert.equal(timeline.length, 5);
  assert.deepEqual(
    timeline.map((e) => e.status),
    ['Referred', 'Arrived', 'Seen', 'Treated', 'Follow-up']
  );
  for (let i = 1; i < timeline.length; i++) {
    assert.ok(
      Date.parse(timeline[i].timestamp) >= Date.parse(timeline[i - 1].timestamp),
      'Timeline events must be in chronological order'
    );
  }
});

test('8. Dashboard calculations accurately compute totals, arrivals, first updates, follow-ups, and average time to first update', () => {
  const metrics = calculateDashboardMetrics(
    INITIAL_SYNTHETIC_REFERRALS,
    INITIAL_SYNTHETIC_EVENTS
  );

  // Total referrals: XL-1001..XL-1006 = 6
  assert.equal(metrics.total_referrals, 6);
  // Confirmed arrivals: XL-1001, XL-1002, XL-1003, XL-1004, XL-1006 = 5 (XL-1005 is still Referred)
  assert.equal(metrics.confirmed_arrivals, 5);
  // With first status update: 5
  assert.equal(metrics.with_first_status_update, 5);
  // With follow-up recorded: XL-1001 = 1
  assert.equal(metrics.with_follow_up, 1);
  // Average time to first update across the 5 updated referrals:
  // XL-1001: 40m, XL-1002: 35m, XL-1003: 25m, XL-1004: 50m, XL-1006: 30m -> (40+35+25+50+30)/5 = 36m
  assert.equal(metrics.avg_minutes_to_first_update, 36);
  assert.equal(metrics.is_synthetic_demo_data, true);
});

test('9. Offline status update marks event and referral as "Saved offline" and queues SMS', () => {
  const res = applyReferralStatusUpdate({
    referrals: INITIAL_SYNTHETIC_REFERRALS,
    events: INITIAL_SYNTHETIC_EVENTS,
    referral_id: 'XL-1005',
    facility_id: 'District Hospital Demo',
    status: 'Arrived',
    timestamp: '2026-10-25T14:00:00.000Z',
    isOffline: true,
  });

  assert.equal(res.updatedReferral.sync_status, 'Saved offline');
  assert.equal(res.newEvent.sync_status, 'Saved offline');
  assert.equal(res.smsMessage.delivery_state, 'Queued offline');
});

test('10 & 11. Synchronization transitions queued offline events to "Synced" and strictly prevents duplicate events', () => {
  const offlineUpdate = applyReferralStatusUpdate({
    referrals: INITIAL_SYNTHETIC_REFERRALS,
    events: INITIAL_SYNTHETIC_EVENTS,
    referral_id: 'XL-1005',
    facility_id: 'District Hospital Demo',
    status: 'Arrived',
    timestamp: '2026-10-25T14:00:00.000Z',
    isOffline: true,
  });

  let queue: SyncQueueItem[] = [];
  queue = enqueueOfflineItem(queue, {
    queue_id: 'Q-1',
    type: 'STATUS_UPDATE',
    referral: offlineUpdate.updatedReferral,
    event: offlineUpdate.newEvent,
    sms: offlineUpdate.smsMessage,
    notification: offlineUpdate.notification,
    queued_at: '2026-10-25T14:00:01.000Z',
  });

  // Attempting to enqueue the identical event again is deduplicated at queue level
  queue = enqueueOfflineItem(queue, {
    queue_id: 'Q-2-DUP',
    type: 'STATUS_UPDATE',
    referral: offlineUpdate.updatedReferral,
    event: offlineUpdate.newEvent,
    sms: offlineUpdate.smsMessage,
    notification: offlineUpdate.notification,
    queued_at: '2026-10-25T14:00:02.000Z',
  });
  assert.equal(queue.length, 1);

  // Also test synchronizeOfflineQueue when queue contains a duplicate event
  const forcedDuplicateQueue: SyncQueueItem[] = [
    queue[0],
    { ...queue[0], queue_id: 'Q-FORCED-DUP' },
  ];

  const syncedState = synchronizeOfflineQueue(
    {
      referrals: INITIAL_SYNTHETIC_REFERRALS,
      events: INITIAL_SYNTHETIC_EVENTS,
      sms_logs: INITIAL_SYNTHETIC_SMS_LOGS,
      notifications: INITIAL_SYNTHETIC_NOTIFICATIONS,
    },
    forcedDuplicateQueue
  );

  assert.equal(syncedState.syncedCount, 1);
  assert.equal(syncedState.skippedDuplicates, 1);
  assert.equal(syncedState.remainingQueue.length, 0);

  const xl1005Events = getReferralTimeline(syncedState.events, 'XL-1005');
  assert.equal(xl1005Events.length, 2); // Initial Referred + 1 Arrived (no duplicate)
  assert.equal(xl1005Events[1].sync_status, 'Synced');

  const xl1005Ref = syncedState.referrals.find((r) => r.referral_id === 'XL-1005');
  assert.equal(xl1005Ref?.current_status, 'Arrived');
  assert.equal(xl1005Ref?.sync_status, 'Synced');
});

test('12. Synthetic-data validation accepts SYN-xxx codes and rejects real names, phone numbers, or ABHA IDs', () => {
  assert.equal(validateSyntheticPatientCode('SYN-001').valid, true);
  assert.equal(validateSyntheticPatientCode('SYN-099').valid, true);

  assert.equal(validateSyntheticPatientCode('Ramesh Kumar').valid, false);
  assert.equal(validateSyntheticPatientCode('9876543210').valid, false);
  assert.equal(validateSyntheticPatientCode('12-3456-7890-1234').valid, false);
  assert.equal(validateSyntheticPatientCode('').valid, false);

  const datasetValidation = validateSyntheticDataset(INITIAL_SYNTHETIC_REFERRALS);
  assert.equal(datasetValidation.valid, true);
  assert.equal(datasetValidation.invalidIds.length, 0);
});

test('13. User registration and authentication supports referring and receiving facility accounts', () => {
  const regResult = registerUserAccount(INITIAL_DEMO_USERS, {
    username: 'nurse.south',
    password_mock: 'pass1234',
    display_name: 'ANM South Clinic',
    facility_type: 'referring',
    facility_name: 'PHC Demo South',
  });

  assert.equal(regResult.user.username, 'nurse.south');
  assert.equal(regResult.user.facility_type, 'referring');
  assert.equal(regResult.users.length, INITIAL_DEMO_USERS.length + 1);

  const authOk = authenticateUser(regResult.users, 'nurse.south', 'pass1234');
  assert.equal(authOk.authenticated, true);
  assert.equal(authOk.user?.facility_name, 'PHC Demo South');

  const authBad = authenticateUser(regResult.users, 'nurse.south', 'wrongpass');
  assert.equal(authBad.authenticated, false);
});
