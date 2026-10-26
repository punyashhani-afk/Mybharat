import React, { useState } from 'react';
import { Building2, Check, LogIn, UserPlus, X } from 'lucide-react';
import { FacilityType, UserAccount } from '../types/referral';
import {
  RECEIVING_FACILITIES,
  REFERRING_FACILITIES,
} from '../data/syntheticData';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  users: UserAccount[];
  onLogin: (username: string, password_mock: string) => {
    authenticated: boolean;
    error?: string;
  };
  onRegister: (input: {
    username: string;
    password_mock: string;
    display_name: string;
    role_label: string;
    facility_type: FacilityType;
    facility_name: string;
  }) => { ok: boolean; error?: string };
  onSelectDemoUser: (user: UserAccount) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  users,
  onLogin,
  onRegister,
  onSelectDemoUser,
}) => {
  const [mode, setMode] = useState<'switch' | 'login' | 'register'>('switch');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regRoleLabel, setRegRoleLabel] = useState('');
  const [regFacilityType, setRegFacilityType] =
    useState<FacilityType>('referring');
  const [regFacilityName, setRegFacilityName] = useState<string>(
    REFERRING_FACILITIES[0]
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFacilityTypeChange = (type: FacilityType) => {
    setRegFacilityType(type);
    setRegFacilityName(
      type === 'referring' ? REFERRING_FACILITIES[0] : RECEIVING_FACILITIES[0]
    );
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const res = onLogin(loginUsername, loginPassword);
    if (!res.authenticated) {
      setErrorMsg(res.error || 'Login failed.');
    } else {
      setSuccessMsg('Signed in successfully.');
      setTimeout(() => {
        onClose();
      }, 300);
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const res = onRegister({
      username: regUsername,
      password_mock: regPassword,
      display_name: regDisplayName,
      role_label:
        regRoleLabel ||
        (regFacilityType === 'referring'
          ? 'Referring PHC Clinician'
          : 'Receiving Triage Nurse'),
      facility_type: regFacilityType,
      facility_name: regFacilityName,
    });
    if (!res.ok) {
      setErrorMsg(res.error || 'Registration failed.');
    } else {
      setSuccessMsg('Account registered and active.');
      setTimeout(() => {
        onClose();
      }, 300);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2
              id="auth-modal-title"
              className="text-lg font-bold text-slate-900"
            >
              Facility Authentication & Role Session
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Prototype authentication for Referring PHC/CHC and Receiving
              Hospital workflows.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode selector tabs */}
        <div className="mt-4 flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('switch');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 rounded-md py-2 px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
              mode === 'switch'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Demo Accounts
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 rounded-md py-2 px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
              mode === 'login'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 rounded-md py-2 px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
              mode === 'register'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Register Facility User
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
          >
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs font-medium text-teal-900"
          >
            {successMsg}
          </div>
        )}

        {mode === 'switch' && (
          <div className="mt-4 space-y-2.5">
            <p className="text-xs text-slate-600">
              Select a pre-configured synthetic staff session to test Referring
              or Receiving workflows (default password:{' '}
              <span className="font-mono">demo1234</span>):
            </p>
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {users.map((u) => {
                const isActive = u.username === currentUser.username;
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => {
                      onSelectDemoUser(u);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors min-h-[56px] ${
                      isActive ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Building2 className="w-4 h-4 text-teal-700 shrink-0" />
                        <span className="truncate">{u.display_name}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="font-mono">{u.username}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700">
                          {u.facility_name}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            u.facility_type === 'referring'
                              ? 'text-teal-700 font-medium'
                              : 'text-amber-700 font-medium'
                          }
                        >
                          {u.facility_type === 'referring'
                            ? 'Referring Facility'
                            : 'Receiving Facility'}
                        </span>
                      </div>
                    </div>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 shrink-0">
                        <Check className="w-4 h-4" />
                        Active
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-600 shrink-0">
                        Switch
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-semibold text-slate-700"
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="e.g. anm.north or triage.dh"
                required
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none min-h-[44px]"
              />
            </div>
            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700"
              >
                Password (Prototype Credential)
              </label>
              <input
                id="login-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="demo1234"
                required
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none min-h-[44px]"
              />
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors min-h-[44px]"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In to Facility Session</span>
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="mt-4 space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="reg-username"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Username
                </label>
                <input
                  id="reg-username"
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="e.g. anm.valley"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none min-h-[42px]"
                />
              </div>
              <div>
                <label
                  htmlFor="reg-password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Password
                </label>
                <input
                  id="reg-password"
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Min 4 chars"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none min-h-[42px]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="reg-display-name"
                className="block text-xs font-semibold text-slate-700"
              >
                Staff Display Label (Synthetic Role Only — No Real Names)
              </label>
              <input
                id="reg-display-name"
                type="text"
                value={regDisplayName}
                onChange={(e) => setRegDisplayName(e.target.value)}
                placeholder="e.g. Duty Nurse — Valley PHC"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none min-h-[42px]"
              />
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700">
                Facility Role Type
              </span>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleFacilityTypeChange('referring')}
                  className={`rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                    regFacilityType === 'referring'
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Referring PHC / CHC
                </button>
                <button
                  type="button"
                  onClick={() => handleFacilityTypeChange('receiving')}
                  className={`rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                    regFacilityType === 'receiving'
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Receiving Facility
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="reg-facility-name"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Assigned Facility
                </label>
                <select
                  id="reg-facility-name"
                  value={regFacilityName}
                  onChange={(e) => setRegFacilityName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none min-h-[42px]"
                >
                  {(regFacilityType === 'referring'
                    ? REFERRING_FACILITIES
                    : RECEIVING_FACILITIES
                  ).map((fac) => (
                    <option key={fac} value={fac}>
                      {fac}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="reg-role-label"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Role Title (Optional)
                </label>
                <input
                  id="reg-role-label"
                  type="text"
                  value={regRoleLabel}
                  onChange={(e) => setRegRoleLabel(e.target.value)}
                  placeholder={
                    regFacilityType === 'referring'
                      ? 'Referring Clinician / ANM'
                      : 'Receiving Triage Nurse'
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none min-h-[42px]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors min-h-[44px]"
            >
              <UserPlus className="w-4 h-4" />
              <span>Register & Sign In</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
