export type ReferralStatus =
  | 'Referred'
  | 'Arrived'
  | 'Seen'
  | 'Treated'
  | 'Follow-up'
  | 'Back-referred';

export const REFERRAL_STATUSES: ReferralStatus[] = [
  'Referred',
  'Arrived',
  'Seen',
  'Treated',
  'Follow-up',
  'Back-referred',
];

export type SyncStatus = 'Synced' | 'Saved offline';

export type ReferralPriority = 'Routine' | 'Urgent' | 'Emergency';

export const REFERRAL_PRIORITIES: ReferralPriority[] = [
  'Routine',
  'Urgent',
  'Emergency',
];

export type PrimaryReferralCategory =
  | 'Obstetrics'
  | 'Cardiology'
  | 'Maternal & Child Health'
  | 'Acute Medical / Fever'
  | 'Trauma & Surgical'
  | 'Pediatrics';

export type ReferralCategory = PrimaryReferralCategory | string;

export const PRIMARY_CATEGORIES_MAP: Record<PrimaryReferralCategory, string[]> = {
  Obstetrics: [
    'High-Risk Pregnancy',
    'Pre-eclampsia / Eclampsia',
    'Obstructed Labor',
    'Postpartum Care',
  ],
  Cardiology: [
    'Acute Chest Pain',
    'Hypertensive Crisis',
    'Arrhythmia Evaluation',
    'Heart Failure Follow-up',
  ],
  'Maternal & Child Health': [
    'Antenatal Complication',
    'Neonatal Jaundice',
    'Low Birth Weight',
    'Immunization Follow-up',
  ],
  'Acute Medical / Fever': [
    'Undifferentiated Fever',
    'Severe Dehydration',
    'Acute Respiratory Distress',
    'Suspected Vector-Borne Illness',
  ],
  'Trauma & Surgical': [
    'Fracture / Orthopedic Injury',
    'Acute Abdomen',
    'Wound / Laceration Management',
    'Head Injury Observation',
  ],
  Pediatrics: [
    'Severe Acute Malnutrition',
    'Febrile Seizures',
    'Pediatric Pneumonia',
    'Congenital Screening',
  ],
};

export const REFERRAL_CATEGORIES: PrimaryReferralCategory[] = Object.keys(
  PRIMARY_CATEGORIES_MAP
) as PrimaryReferralCategory[];

export interface Referral {
  referral_id: string;
  patient_code: string;
  referring_facility: string;
  receiving_facility: string;
  primary_category: string;
  sub_category?: string;
  referral_category: string;
  custom_note?: string;
  is_custom?: boolean;
  priority: ReferralPriority;
  created_at: string;
  current_status: ReferralStatus;
  last_updated_at: string;
  last_viewed_by_referring_at?: string;
  sync_status?: SyncStatus;
}

export interface StatusEvent {
  event_id: string;
  referral_id: string;
  facility_id: string;
  status: ReferralStatus;
  timestamp: string;
  sync_status: SyncStatus;
}

export interface SmsFallbackMessage {
  sms_id: string;
  referral_id: string;
  facility_id: string;
  status: ReferralStatus;
  message: string;
  timestamp: string;
  delivery_state: 'Queued offline' | 'Simulated sent';
}

export interface InAppNotification {
  notification_id: string;
  referral_id: string;
  patient_code: string;
  target_facility: string;
  actor_facility: string;
  status: ReferralStatus;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export type FacilityType = 'referring' | 'receiving';

export type StaffRole = 'Referring Staff' | 'Receiving Staff';

export interface RolePermissions {
  role: StaffRole;
  canCreateReferrals: boolean;
  canViewDashboard: boolean;
  canUpdateReferralStatus: boolean;
  canSearchReferrals: boolean;
}

export interface UserAccount {
  user_id: string;
  username: string;
  password_mock: string;
  display_name: string;
  role_label: string;
  facility_type: FacilityType;
  facility_name: string;
  created_at: string;
}

export interface SyncQueueItem {
  queue_id: string;
  idempotency_key: string;
  type: 'CREATE_REFERRAL' | 'STATUS_UPDATE';
  referral?: Referral;
  event: StatusEvent;
  sms?: SmsFallbackMessage;
  notification?: InAppNotification;
  queued_at: string;
}

export interface CloudSyncLogEntry {
  sync_id: string;
  revision: number;
  action: 'CLOUD_PUSH' | 'CLOUD_PULL' | 'REMOTE_UPDATE' | 'CUSTOM_REFERRAL';
  summary: string;
  timestamp: string;
}

export interface DashboardMetrics {
  total_referrals: number;
  confirmed_arrivals: number;
  with_first_status_update: number;
  with_follow_up: number;
  avg_minutes_to_first_update: number | null;
  is_synthetic_demo_data: true;
}

export interface XareloopStateSnapshot {
  referrals: Referral[];
  events: StatusEvent[];
  sms_logs: SmsFallbackMessage[];
  notifications: InAppNotification[];
  cloud_revision?: number;
  cloud_logs?: CloudSyncLogEntry[];
  last_synced_at: string;
}
