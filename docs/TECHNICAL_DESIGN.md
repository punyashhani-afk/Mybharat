# Xareloop — Technical Design Document (TDD)

> **Status**: Prototype Under Development — Not for Clinical Use. All data is synthetic.

## 1. System Overview
Xareloop is an offline-first Progressive Web Application (PWA) and modular Node/Express backend designed for frontline healthcare workers at referring Primary/Community Health Centres (PHC/CHC) and receiving secondary/tertiary hospitals.

## 2. Core Functional Modules

### 2.1 Synthetic-Only Data Guard (`validateSyntheticPatientCode`)
To guarantee zero PII leakage during prototype evaluation, every referral creation request passes through `validateSyntheticPatientCode()`, which enforces the regular expression `/^SYN-[0-9]{3,6}$/`. Any input resembling a human name, 10-digit phone number, or 14-digit ABHA identifier is rejected both client-side and server-side.

### 2.2 Hierarchical Clinical Categories
Referrals capture both a **Primary Category** (`Obstetrics`, `Cardiology`, `Maternal & Child Health`, `Acute Medical / Fever`, `Trauma & Surgical`, `Pediatrics`) and an optional **Detailed Sub-Category** (e.g., `High-Risk Pregnancy`, `Acute Chest Pain`, `Severe Dehydration`) to provide structured triage context to the receiving facility without free-text clinical notes.

### 2.3 Unique Short Referral ID & QR Code Generation
- **Short ID (`generateUniqueReferralId`)**: Generates human-readable, low-error short codes (`XL-1001`, `XL-1002`, etc.) suitable for verbal confirmation or SMS fallback.
- **QR Payload (`buildReferralQrPayload`)**: Encodes a compact JSON payload (`{"protocol":"XARELOOP_V1","referral_id":"XL-1001","patient_code":"SYN-001",...}`) rendered as a high-contrast vector SVG via the `qrcode` library so it works completely offline.

### 2.4 Offline-First Persistence & Idempotent Synchronization
- **Local Store**: `src/services/indexedDb.ts` persists the complete state snapshot (`referrals`, `events`, `sms_logs`, `notifications`, `sync_queue`, `users`) in IndexedDB (`xareloop_offline_db_v1`) with automatic `localStorage` fallback.
- **Idempotency & Deduplication**: Every status event computes a deterministic key via `buildEventIdempotencyKey()`:
  ```
  <REFERRAL_ID>::<FACILITY_ID>::<STATUS>::<ISO_TIMESTAMP>
  ```
  When connectivity is restored, `synchronizeOfflineQueue()` merges queued events both locally and via `POST /api/sync`, skipping any event whose idempotency key or `event_id` has already been recorded.

### 2.5 In-App Notification System & Simulated SMS Fallback
- **In-App Notifications**: Whenever a receiving facility records a status update (`Arrived`, `Seen`, `Treated`, `Follow-up`, `Back-referred`), `createReferringNotification()` generates an `InAppNotification` targeted at the referring PHC/CHC facility. Unread notifications surface in the top toolbar badge and in the Referring Dashboard alert banner.
- **Simulated SMS Queue**: Generates deterministic low-bandwidth text messages (`"Xareloop: Referral XL-1001 has been marked ARRIVED at District Hospital Demo."`) marked `Queued offline` when offline and `Simulated sent` once synchronized.

### 2.6 Prototype User Authentication
Supports registration and sign-in with facility role assignment (`referring` vs. `receiving` facility types) and pre-seeded demo credentials (`anm.north`, `mo.east`, `triage.dh`, `desk.sdh`) so evaluators can test multi-facility handoffs cleanly.
