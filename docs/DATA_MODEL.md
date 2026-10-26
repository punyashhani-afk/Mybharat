# Xareloop — Data Model & Schema Documentation

All schemas are defined in [`src/types/referral.ts`](../src/types/referral.ts) and designed for both local IndexedDB document storage and relational SQL/PostgreSQL deployment with real-time state synchronization across connected nodes.

## 1. `Referral`
Represents a patient referral created at a referring PHC/CHC.

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `referral_id` | `string` (PK) | Unique short referral identifier | `"XL-1001"` |
| `patient_code` | `string` | Strictly synthetic patient identifier (`/^SYN-[0-9]{3,6}$/`) | `"SYN-001"` |
| `referring_facility` | `string` | Originating PHC or CHC facility name | `"PHC Demo North"` |
| `receiving_facility` | `string` | Target higher-level hospital name | `"District Hospital Demo"` |
| `primary_category` | `string` | Primary clinical specialty/category | `"Obstetrics"` |
| `sub_category` | `string` (optional) | Optional detailed clinical sub-category | `"High-Risk Pregnancy"` |
| `referral_category` | `string` | Combined display label (`Primary — Sub-Category`) | `"Obstetrics — High-Risk Pregnancy"` |
| `priority` | `'Routine' \| 'Urgent' \| 'Emergency'` | Triage urgency indicator | `"Urgent"` |
| `created_at` | `string` (ISO-8601) | Referral creation timestamp | `"2026-10-25T08:00:00.000Z"` |
| `current_status` | `ReferralStatus` | Latest status in the referral feedback loop | `"Follow-up"` |
| `last_updated_at` | `string` (ISO-8601) | Timestamp of latest status event | `"2026-10-25T11:30:00.000Z"` |
| `sync_status` | `'Synced' \| 'Saved offline'` | Current synchronization state | `"Synced"` |

## 2. `StatusEvent`
Represents an immutable chronological status transition in a referral's timeline.

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `event_id` | `string` (PK) | Unique event identifier | `"EVT-1001-2"` |
| `referral_id` | `string` (FK) | Associated referral short ID | `"XL-1001"` |
| `facility_id` | `string` | Facility that recorded this status update | `"District Hospital Demo"` |
| `status` | `ReferralStatus` | One of: `Referred`, `Arrived`, `Seen`, `Treated`, `Follow-up`, `Back-referred` | `"Arrived"` |
| `timestamp` | `string` (ISO-8601) | Event recording timestamp | `"2026-10-25T08:40:00.000Z"` |
| `sync_status` | `'Synced' \| 'Saved offline'` | Synchronization state of the event | `"Synced"` |

## 3. `InAppNotification`
Generated automatically for the referring facility when a receiving hospital updates a referral's status.

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `notification_id` | `string` (PK) | Unique notification identifier | `"NOTIF-1001-5"` |
| `referral_id` | `string` (FK) | Associated referral short ID | `"XL-1001"` |
| `patient_code` | `string` | Synthetic patient code | `"SYN-001"` |
| `target_facility` | `string` | Referring facility receiving the alert | `"PHC Demo North"` |
| `actor_facility` | `string` | Receiving facility that triggered the update | `"District Hospital Demo"` |
| `status` | `ReferralStatus` | Updated status value | `"Follow-up"` |
| `title` | `string` | Short alert headline | `"Referral XL-1001 marked Follow-up"` |
| `message` | `string` | Full contextual notification message | `"District Hospital Demo updated SYN-001..."` |
| `timestamp` | `string` (ISO-8601) | Alert creation timestamp | `"2026-10-25T11:30:00.000Z"` |
| `read` | `boolean` | Whether the referring team has acknowledged the alert | `false` |

## 4. `SmsFallbackMessage`
Represents a simulated low-bandwidth SMS notification entry.

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `sms_id` | `string` (PK) | Unique simulated SMS identifier | `"SMS-1001-2"` |
| `referral_id` | `string` (FK) | Associated referral ID | `"XL-1001"` |
| `facility_id` | `string` | Facility where the update occurred | `"District Hospital Demo"` |
| `status` | `ReferralStatus` | Status that triggered the SMS | `"Arrived"` |
| `message` | `string` | Formatted SMS text | `"Xareloop: Referral XL-1001 has been marked ARRIVED at District Hospital Demo."` |
| `timestamp` | `string` (ISO-8601) | Timestamp | `"2026-10-25T08:40:00.000Z"` |
| `delivery_state` | `'Queued offline' \| 'Simulated sent'` | Delivery simulation state | `"Simulated sent"` |

## 5. `UserAccount` (Prototype Facility Authentication)
| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `user_id` | `string` (PK) | Unique user account ID | `"USR-001"` |
| `username` | `string` | Login handle | `"anm.north"` |
| `display_name` | `string` | Role-based synthetic display label | `"Duty ANM — North Sector"` |
| `facility_type` | `'referring' \| 'receiving'` | Facility tier role | `"referring"` |
| `facility_name` | `string` | Assigned facility name | `"PHC Demo North"` |
