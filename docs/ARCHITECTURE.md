# Xareloop — Architecture Diagram & Synchronization Topology

## 1. High-Level System Architecture

```
+-----------------------------------------------------------------------------------+
|                        CLIENT NODE (Mobile / Desktop PWA)                         |
|                                                                                   |
|  +-----------------------+   +------------------------+   +--------------------+  |
|  | Referring PHC/CHC UI  |   | Receiving Facility UI  |   | Dashboard Metrics  |  |
|  | - Create Referral     |   | - QR / Short ID Lookup |   | - 5 Core KPIs      |  |
|  | - Primary/Sub Cat     |   | - 1-Tap Status Buttons |   | - Simulated SMS    |  |
|  | - QR / Handover Slip  |   | - Timeline View        |   | - Auth Switcher    |  |
|  | - In-App Alerts       |   +-----------+------------+   +---------+----------+  |
|  +-----------+-----------+               |                          |             |
|              |                           |                          |             |
|              +---------------------------+--------------------------+             |
|                                          |                                        |
|                                          v                                        |
|                     +-----------------------------------------+                   |
|                     | Pure Domain Engine (referralEngine.ts)  |                   |
|                     | - Synthetic Code Validation (SYN-XXX)   |                   |
|                     | - Short ID & SVG QR Generator           |                   |
|                     | - Idempotent Offline Sync Deduplicator  |                   |
|                     +--------------------+--------------------+                   |
|                                          |                                        |
|                    +---------------------+---------------------+                  |
|                    |                                           |                  |
|                    v (Always Available)                        v (When Online)    |
|     +------------------------------+            +------------------------------+  |
|     | IndexedDB (indexedDb.ts)     |            | REST Sync Client (api.ts)    |  |
|     | - Store: referrals, events   |            | - GET /api/state             |  |
|     | - Store: sync_queue, notifs  |            | - POST /api/sync             |  |
|     | - Service Worker Asset Cache |            | - BroadcastChannel Multi-Tab |  |
|     +------------------------------+            +--------------+---------------+  |
+----------------------------------------------------------------|------------------+
                                                                 |
                                                                 | HTTP / JSON
                                                                 v
+-----------------------------------------------------------------------------------+
|                     BACKEND NODE (server.ts — Express + Vite)                     |
|                                                                                   |
|  - Idempotent State Merge (/api/sync)                                             |
|  - Real-Time Multi-Node State Store (referrals, events, notifications, sms_logs)  |
|  - Prototype Facility Authentication (/api/auth/login, /api/auth/register)        |
+-----------------------------------------------------------------------------------+
```

## 2. End-to-End Referral Lifecycle Diagram (Mermaid)

```mermaid
sequenceDiagram
    participant PHC as Referring PHC/CHC
    participant IDB as Local IndexedDB & Sync Queue
    participant API as Xareloop Sync Server (/api/sync)
    participant DH as Receiving Hospital

    PHC->>IDB: 1. Create Referral (SYN-007, Obstetrics — High-Risk Pregnancy)
    IDB-->>PHC: 2. Generate Short ID (XL-1007) & SVG QR Code
    IDB->>API: 3. Sync Referral & Initial 'Referred' Event
    DH->>API: 4. Scan QR or Lookup 'XL-1007'
    DH->>IDB: 5. One-Tap Status Update ('Arrived' -> 'Seen' -> 'Treated')
    Note over DH,IDB: Works offline ("Saved offline") or online ("Synced")
    IDB->>API: 6. Idempotent Queue Sync (Deduplicated by Idempotency Key)
    API-->>PHC: 7. Referring Dashboard Timeline + In-App Notification + Simulated SMS
```
