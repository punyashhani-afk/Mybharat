import React from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

interface OfflineSyncBarProps {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  justSyncedCount?: number | null;
  syncError?: string | null;
  onToggleOffline: () => void;
  onSyncNow: () => void;
  onDismissSyncError?: () => void;
}

export const OfflineSyncBar: React.FC<OfflineSyncBarProps> = ({
  isOnline,
  pendingCount,
  isSyncing,
  justSyncedCount,
  syncError,
  onToggleOffline,
  onSyncNow,
  onDismissSyncError,
}) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Manual Sync button when updates are waiting and device is online */}
        {pendingCount > 0 && isOnline && (
          <button
            type="button"
            onClick={onSyncNow}
            disabled={isSyncing}
            data-testid="sync-now-button"
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-[#DDF7F4] text-[#031B4E] border-2 border-[#10B9A8] text-xs font-extrabold hover:bg-[#c5f0eb] disabled:opacity-60 transition-colors cursor-pointer"
            aria-label={`Synchronize ${pendingCount} waiting offline updates now`}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[#062B78] ${isSyncing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>
              {isSyncing
                ? 'Syncing updates…'
                : `◷ Sync ${pendingCount} update${pendingCount === 1 ? '' : 's'}`}
            </span>
          </button>
        )}

        {/* Just-synced confirmation pill */}
        {justSyncedCount !== null && justSyncedCount !== undefined && justSyncedCount > 0 && isOnline && !isSyncing && (
          <span
            data-testid="just-synced-pill"
            role="status"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#DDF7F4] text-[#031B4E] border border-[#10B9A8] text-xs font-extrabold"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#085E56]" aria-hidden="true" />
            <span>
              ✓ {justSyncedCount} update{justSyncedCount === 1 ? '' : 's'} synced
            </span>
          </span>
        )}

        {/* Primary Connection & Offline-First Status Toggle */}
        <button
          type="button"
          onClick={onToggleOffline}
          data-testid="connection-status-toggle"
          aria-pressed={!isOnline}
          title={
            isOnline
              ? 'Currently Online. Tap to simulate Offline field mode.'
              : 'Currently Offline. Tap to restore connectivity and auto-sync.'
          }
          className={`inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-extrabold border transition-colors cursor-pointer ${
            !isOnline
              ? 'bg-[#FEF3C7] text-[#78350F] border-[#F59E0B] hover:bg-[#FDE68A]'
              : pendingCount > 0
                ? 'bg-[#EFF6FF] text-[#031B4E] border-[#0878F9] hover:bg-[#DBEAFE]'
                : 'bg-[#DDF7F4] text-[#031B4E] border-[#10B9A8] hover:bg-[#c8f1ec]'
          }`}
        >
          {isSyncing ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-[#062B78] animate-spin" aria-hidden="true" />
              <span>Syncing updates…</span>
            </>
          ) : isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-[#085E56]" aria-hidden="true" />
              <span>
                {pendingCount > 0
                  ? `● Online — ${pendingCount} waiting to sync`
                  : '● Online — Synced'}
              </span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-[#92400E]" aria-hidden="true" />
              <span>
                {pendingCount > 0
                  ? `● Offline — ${pendingCount} update${pendingCount === 1 ? '' : 's'} waiting to sync`
                  : '● Offline — Local Queue Ready'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Human-readable Sync Error Banner */}
      {syncError && (
        <div
          data-testid="sync-error-banner"
          role="alert"
          className="rounded-xl bg-[#FEF2F2] border-2 border-[#DC2626] p-3 text-[#7F1D1D] flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="font-extrabold block">⚠ Couldn't synchronize updates</strong>
              <span className="font-medium">
                Your update is safely stored on this device and will retry automatically when connectivity returns.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSyncNow}
              className="px-3 py-1.5 min-h-[36px] rounded-lg bg-[#991B1B] text-[#FFFFFF] font-extrabold hover:bg-[#7F1D1D] cursor-pointer"
            >
              Retry
            </button>
            {onDismissSyncError && (
              <button
                type="button"
                onClick={onDismissSyncError}
                className="px-3 py-1.5 min-h-[36px] rounded-lg bg-[#FFFFFF] text-[#7F1D1D] border border-[#DC2626] font-bold hover:bg-[#FEE2E2] cursor-pointer"
              >
                Continue Offline
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
