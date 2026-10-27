import React from 'react';
import { CheckCircle2, CloudOff } from 'lucide-react';

interface OfflineSyncBarProps {
  isEffectiveOffline: boolean;
  onToggleSimulatedOffline: () => void;
}

export const OfflineSyncBar: React.FC<OfflineSyncBarProps> = ({
  isEffectiveOffline,
  onToggleSimulatedOffline,
}) => {
  return (
    <button
      type="button"
      onClick={onToggleSimulatedOffline}
      aria-pressed={isEffectiveOffline}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
        isEffectiveOffline
          ? 'border-amber-600 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-slate-50 text-emerald-800 hover:bg-slate-100'
      }`}
    >
      {isEffectiveOffline ? (
        <>
          <CloudOff className="w-3.5 h-3.5 text-amber-700" />
          <span>Saved offline</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
          <span>Synced</span>
        </>
      )}
    </button>
  );
};
