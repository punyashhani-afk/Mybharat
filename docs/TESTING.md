# Xareloop — Test Documentation

## 1. Running the Test Suite

Xareloop uses Node's built-in test runner (`node:test` and `node:assert/strict`) executed via `tsx` so TypeScript modules and QR SVG generation are verified directly without mocks:

```bash
npm test
# or directly:
npx --yes tsx --test src/core/referralEngine.test.ts
```

## 2. Test Coverage Matrix (`src/core/referralEngine.test.ts`)

| Test Case | Requirement Verified |
| :--- | :--- |
| **1. Referral creation** | Verifies creation of `Referral`, hierarchical `primary_category` + `sub_category`, initial `Referred` event, and simulated SMS message. |
| **2. Unique referral ID generation** | Verifies `generateUniqueReferralId()` produces non-colliding `XL-XXXX` short codes across 25+ consecutive allocations. |
| **3. QR generation** | Verifies `generateReferralQrSvg()` outputs valid `<svg>` markup and round-trips `buildReferralQrPayload()` through `lookupReferralById()`. |
| **4. Valid referral lookup** | Verifies case-insensitive lookup of existing short referral IDs (`xl-1002` -> `SYN-002`). |
| **5. Invalid referral lookup** | Verifies non-existent IDs (`XL-9999`) and blank queries return `found: false` and `"Referral not found"`. |
| **6. Each status update & Notification** | Iterates through all 6 statuses (`Referred`, `Arrived`, `Seen`, `Treated`, `Follow-up`, `Back-referred`), verifying facility, timestamp, referral ID, simulated SMS log, and `InAppNotification` for the referring facility. |
| **7. Referral timeline** | Verifies `getReferralTimeline()` returns chronologically ordered events with facility, timestamp, and synchronization state. |
| **8. Dashboard calculations** | Verifies `calculateDashboardMetrics()` computes total referrals (`6`), confirmed arrivals (`5`), first status updates (`5`), follow-ups (`1`), and average minutes to first update (`36m`). |
| **9. Offline status update** | Verifies updates recorded while offline are marked `Saved offline` and SMS logs are marked `Queued offline`. |
| **10 & 11. Synchronization & Duplicate prevention** | Verifies `enqueueOfflineItem()` and `synchronizeOfflineQueue()` transition queued events to `Synced` and strictly prevent duplicate events via idempotency keys. |
| **12. Synthetic-data validation** | Verifies `validateSyntheticPatientCode()` and `validateSyntheticDataset()` accept `SYN-001`..`SYN-099` and reject human names, phone numbers, and ABHA numbers. |
| **13. User registration & authentication** | Verifies `registerUserAccount()` and `authenticateUser()` for referring and receiving facility roles. |
