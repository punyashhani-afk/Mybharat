# Xareloop — Low-Bandwidth Clinical Referral-Feedback System (MVP Prototype)

> **PROTOTYPE DISCLAIMER — NOT FOR CLINICAL USE**
> This repository contains a software prototype currently under development. It has **NOT** been clinically deployed, validated, or piloted. All patient records (`SYN-001` through `SYN-012`), facilities, and metrics shown in this application are strictly **synthetic**.

## 1. Problem Statement & Scope

When a patient is referred from a Primary Health Centre (PHC) or Community Health Centre (CHC) to a higher-level receiving hospital, the referring clinician or Auxiliary Nurse Midwife (ANM) frequently loses visibility into what happens next. Families and referring teams are often uncertain whether the patient arrived, was evaluated, received treatment, or requires local follow-up.

**Xareloop** closes this referral-feedback loop with an offline-first, low-bandwidth workflow:

1. **Referring PHC/CHC**: Creates a referral using a **synthetic patient code only** (`SYN-XXX`), selects the receiving facility, chooses a **primary clinical category** (e.g., `Obstetrics`, `Cardiology`) and optional **detailed sub-category** (e.g., `High-Risk Pregnancy`, `Acute Chest Pain`), selects priority (`Routine`, `Urgent`, `Emergency`), and generates a **unique short referral ID** (`XL-XXXX`) and **QR code**.
2. **Receiving Facility**: Scans the QR code or enters the short referral ID (`XL-XXXX`) to open the referral and updates status with **one tap**:
   - `Referred`
   - `Arrived`
   - `Seen`
   - `Treated`
   - `Follow-up`
   - `Back-referred`
3. **In-App Notifications & Simulated SMS Fallback**: Every receiving-facility status update records the acting facility, timestamp, and referral ID, triggers an **in-app notification** for the referring PHC/CHC dashboard, and logs a **simulated low-bandwidth SMS fallback** message (`"Xareloop: Referral XL-1001 has been marked ARRIVED at District Hospital Demo."`).
4. **Offline-First Synchronization**: Uses a PWA Service Worker and **IndexedDB** local storage (`xareloop_offline_db_v1`). When offline, referrals and status updates are saved locally as `Saved offline` and placed in an idempotent synchronization queue. When connectivity returns, queued events synchronize without duplicates and transition to `Synced`.

### Explicit Non-Goals (Scope Boundaries)
Xareloop is **strictly a referral-feedback status workflow**. It does **NOT**:
- Diagnose patients, recommend treatments, or make clinical decisions
- Replace doctors, hospital EMRs, Karnataka ORS, or ABDM
- Store real patient PII, real names, phone numbers, addresses, or ABHA IDs
- Claim clinical effectiveness, pilot results, or real-world deployment

---

## 2. Quick Start & Setup Instructions

### Prerequisites
- **Node.js** v20+ (with `npm`)

### Installation & Local Development
```bash
# 1. Install dependencies
npm install

# 2. Copy environment configuration
cp .env.example .env

# 3. Run unit test suite (13 tests covering core engine, offline sync, QR, auth, notifications)
npm test

# 4. Start full-stack Express + Vite development server on port 3000
npm run dev
```
Open `http://localhost:3000` in your browser.

### Production Build
```bash
npm run build
npm start
```

---

## 3. Environment Variables (`.env.example`)

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port on which the Express + Vite server listens. |
| `APP_URL` | `http://localhost:3000` | Base URL for self-referential links and API endpoints. |
| `VITE_APP_ENV` | `prototype` | Runtime environment indicator (`prototype` \| `development` \| `test`). |
| `VITE_DEFAULT_REFERRING_FACILITY` | `PHC Demo North` | Default referring PHC/CHC selected on launch. |
| `VITE_DEFAULT_RECEIVING_FACILITY` | `District Hospital Demo` | Default receiving facility selected in lookup view. |
| `VITE_SMS_GATEWAY_MODE` | `simulated` | SMS fallback mode (`simulated` only; no real SMS provider is called). |

---

## 4. Documentation Index

- [Technical Design Document](./docs/TECHNICAL_DESIGN.md)
- [Architecture Diagram & Sync Flow](./docs/ARCHITECTURE.md)
- [Data Model & Database Schema](./docs/DATA_MODEL.md)
- [REST API Documentation](./docs/API.md)
- [Testing Documentation](./docs/TESTING.md)
- [Synthetic Sample Data (JSON)](./data/synthetic_sample_data.json)
- [MIT License](./LICENSE)
