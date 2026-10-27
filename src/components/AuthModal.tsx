import React, { useState } from 'react';
import { ShieldCheck, Lock, X, Building2, CheckCircle2 } from 'lucide-react';
import type { FacilityType, UserAccount } from '../types/referral';
import { getStaffRole } from '../core/referralEngine';
import {
  RECEIVING_FACILITIES,
  REFERRING_FACILITIES,
} from '../data/syntheticData';

interface AuthModalProps {
  users: UserAccount[];
  currentUser: UserAccount;
  onSelectUser: (user: UserAccount) => Promise<void>;
  onRegisterUser: (input: {
    username: string;
    password_mock: string;
    display_name: string;
    facility_type: FacilityType;
    facility_name: string;
  }) => Promise<void>;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  users,
  currentUser,
  onSelectUser,
  onRegisterUser,
  onClose,
}) => {
  const [tab, setTab] = useState<'switch' | 'register'>('switch');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('demo1234');
  const [displayName, setDisplayName] = useState('');
  const [facilityType, setFacilityType] = useState<FacilityType>('referring');
  const [facilityName, setFacilityName] = useState<string>(
    REFERRING_FACILITIES[0]
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleQuickSwitch = async (user: UserAccount) => {
    setLoading(true);
    setError(null);
    try {
      await onSelectUser(user);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not switch facility role.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onRegisterUser({
        username,
        password_mock: password,
        display_name: displayName,
        facility_type: facilityType,
        facility_name: facilityName,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not register account.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="auth-modal"
      className="fixed inset-0 z-50 bg-[#031B4E]/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-[#FFFFFF] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl border-2 border-[#E2E8F0]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#062B78]" aria-hidden="true" />
            <div>
              <h3
                id="auth-modal-title"
                className="text-base font-extrabold text-[#031B4E]"
              >
                Facility Role & Staff Login
              </h3>
              <p className="text-xs font-semibold text-[#475569]">
                Switch between Referring Facility and Receiving Facility roles
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[40px] min-w-[40px] rounded-xl text-[#10213F] hover:bg-[#F7F9FC] border border-[#CBD5E1] flex items-center justify-center cursor-pointer"
            aria-label="Close role and authentication modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#F7F9FC] border border-[#E2E8F0]">
          <button
            type="button"
            onClick={() => {
              setTab('switch');
              setError(null);
            }}
            className={`py-2 px-3 min-h-[40px] rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
              tab === 'switch'
                ? 'bg-[#062B78] text-[#FFFFFF]'
                : 'text-[#10213F] hover:bg-[#E2E8F0]'
            }`}
          >
            Demo Facility Accounts
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setError(null);
            }}
            className={`py-2 px-3 min-h-[40px] rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
              tab === 'register'
                ? 'bg-[#062B78] text-[#FFFFFF]'
                : 'text-[#10213F] hover:bg-[#E2E8F0]'
            }`}
          >
            Register New Staff
          </button>
        </div>

        {tab === 'switch' ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[#475569]">
              Select a facility account to test role-based permissions:
            </p>
            <div className="space-y-2.5">
              {users.map((u) => {
                const isCurrent = u.user_id === currentUser.user_id;
                const role = getStaffRole(u);
                const isReferring = u.facility_type === 'referring';
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    disabled={loading}
                    data-testid={`switch-user-${u.username}`}
                    onClick={() => handleQuickSwitch(u)}
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-center justify-between gap-3 cursor-pointer ${
                      isCurrent
                        ? 'bg-[#DDF7F4] border-[#085E56]'
                        : 'bg-[#FFFFFF] border-[#CBD5E1] hover:border-[#062B78] hover:bg-[#F7F9FC]'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-[#031B4E]">
                          {u.facility_name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${
                            isReferring
                              ? 'bg-[#062B78] text-[#FFFFFF]'
                              : 'bg-[#085E56] text-[#FFFFFF]'
                          }`}
                        >
                          {isReferring
                            ? 'Referring Facility'
                            : 'Receiving Facility'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-[#10213F]">
                        {u.display_name} ({role})
                      </p>
                      <p className="text-[11px] font-medium text-[#475569]">
                        {isReferring
                          ? 'Can create referrals & view dashboards'
                          : 'Can scan QR codes & update referral statuses'}
                      </p>
                    </div>

                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[#085E56] shrink-0">
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        Active
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 rounded-lg bg-[#062B78] text-[#FFFFFF] text-xs font-extrabold shrink-0">
                        Sign In
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="reg-role-select"
                className="block text-xs font-extrabold text-[#10213F] mb-1"
              >
                Facility Role
              </label>
              <select
                id="reg-role-select"
                value={facilityType}
                onChange={(e) => {
                  const nextType = e.target.value as FacilityType;
                  setFacilityType(nextType);
                  setFacilityName(
                    nextType === 'referring'
                      ? REFERRING_FACILITIES[0]
                      : RECEIVING_FACILITIES[0]
                  );
                }}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#94A3B8] text-xs font-bold text-[#10213F] bg-[#FFFFFF]"
              >
                <option value="referring">
                  Referring Facility (Create Referrals)
                </option>
                <option value="receiving">
                  Receiving Facility (Update Referral Statuses)
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="reg-facility-input"
                className="block text-xs font-extrabold text-[#10213F] mb-1"
              >
                Facility Name
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-[#475569] absolute left-3.5 top-3" aria-hidden="true" />
                <input
                  id="reg-facility-input"
                  type="text"
                  required
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#94A3B8] text-xs font-bold text-[#10213F]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="reg-username-input"
                  className="block text-xs font-extrabold text-[#10213F] mb-1"
                >
                  Username
                </label>
                <input
                  id="reg-username-input"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. nurse.west"
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[#94A3B8] text-xs font-bold text-[#10213F]"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-password-input"
                  className="block text-xs font-extrabold text-[#10213F] mb-1"
                >
                  Staff PIN / Password
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-[#475569] absolute left-3 top-3.5" aria-hidden="true" />
                  <input
                    id="reg-password-input"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 min-h-[44px] rounded-xl border border-[#94A3B8] text-xs font-mono font-bold text-[#10213F]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="reg-displayname-input"
                className="block text-xs font-extrabold text-[#10213F] mb-1"
              >
                Staff Display Name
              </label>
              <input
                id="reg-displayname-input"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Duty Medical Officer"
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#94A3B8] text-xs font-bold text-[#10213F]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 min-h-[48px] rounded-xl bg-[#062B78] hover:bg-[#031B4E] text-[#FFFFFF] text-xs font-extrabold transition-colors cursor-pointer"
            >
              {loading ? 'Registering…' : 'Register & Sign In'}
            </button>
          </form>
        )}

        {error && (
          <p
            role="alert"
            className="text-xs font-bold text-[#991B1B] bg-[#FEF2F2] px-3.5 py-2.5 rounded-xl border border-[#DC2626]"
          >
            ! {error}
          </p>
        )}
      </div>
    </div>
  );
};
