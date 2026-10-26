# Xareloop — REST API Documentation

Base URL: `http://localhost:3000/api`

## 1. `GET /api/health`
Returns server health status and prototype synthetic-data disclaimer.

**Response (`200 OK`)**:
```json
{
  "status": "ok",
  "service": "xareloop-referral-feedback-mvp",
  "disclaimer": "Prototype — Not for Clinical Use. All patient information shown is synthetic.",
  "timestamp": "2026-10-26T08:00:00.000Z"
}
```

## 2. `GET /api/state`
Returns the complete current state across all connected nodes (`referrals`, `events`, `sms_logs`, `notifications`, `users`).

## 3. `POST /api/referrals`
Creates a new synthetic referral, its initial `Referred` timeline event, and simulated SMS entry.

**Request Body**:
```json
{
  "patient_code": "SYN-007",
  "referring_facility": "PHC Demo North",
  "receiving_facility": "District Hospital Demo",
  "primary_category": "Obstetrics",
  "sub_category": "High-Risk Pregnancy",
  "priority": "Urgent"
}
```

## 4. `POST /api/referrals/:id/status`
Applies a one-tap status update (`Referred`, `Arrived`, `Seen`, `Treated`, `Follow-up`, `Back-referred`), appends a `StatusEvent`, generates an `InAppNotification` for the referring facility, and logs a simulated SMS message.

**Request Body**:
```json
{
  "facility_id": "District Hospital Demo",
  "status": "Arrived"
}
```

## 5. `POST /api/sync`
Idempotently synchronizes an array of offline `SyncQueueItem` records and merges multi-node state while preventing duplicate status events via composite idempotency keys (`referral_id::facility_id::status::timestamp`).

## 6. `POST /api/auth/register` & `POST /api/auth/login`
Prototype authentication endpoints supporting facility user registration (`facility_type: 'referring' | 'receiving'`) and credential login.

## 7. `POST /api/reset`
Resets the server state back to the initial deterministic synthetic dataset (`XL-1001` through `XL-1006`).
