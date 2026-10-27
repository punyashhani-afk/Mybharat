import React, { useEffect, useState } from 'react';
import { X, Share2, Printer, Check, ArrowRight, QrCode } from 'lucide-react';
import type { Referral } from '../types/referral';
import { generateReferralQrSvg } from '../core/referralEngine';
import { PriorityBadge, StatusBadge, SyncStateBadge } from './ReferralTimelineCard';

interface QrHandoffModalProps {
  referral: Referral;
  onClose: () => void;
  onSimulateReceiveScan: (referral: Referral) => void;
}

export const QrHandoffModal: React.FC<QrHandoffModalProps> = ({
  referral,
  onClose,
  onSimulateReceiveScan,
}) => {
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    generateReferralQrSvg(referral)
      .then((svg) => {
        if (active) setSvgMarkup(svg);
      })
      .catch(() => {
        if (active) setSvgMarkup('');
      });
    return () => {
      active = false;
    };
  }, [referral]);

  const handleShare = async () => {
    const shareText = `Xareloop Referral ${referral.referral_id} | Synthetic Patient: ${referral.patient_code} | ${referral.referring_facility} → ${referral.receiving_facility} | Priority: ${referral.priority}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Xareloop Referral ${referral.referral_id}`,
          text: shareText,
        });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareText).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      data-testid="qr-handoff-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#031B4E]/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-handoff-title"
      onClick={onClose}
    >
      <div
        className="bg-[#FFFFFF] border-2 border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 space-y-5 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-3.5 text-left">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#062B78]">
              <QrCode className="w-4 h-4 text-[#0878F9]" aria-hidden="true" />
              <span id="qr-handoff-title">Xareloop Referral QR Slip</span>
            </div>
            <p
              data-testid="modal-referral-id"
              className="text-2xl font-mono font-extrabold text-[#031B4E] mt-0.5"
            >
              {referral.referral_id}
            </p>
            <p className="text-xs font-bold text-[#475569]">
              Synthetic Patient: <span className="text-[#10213F] font-mono">{referral.patient_code}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            data-testid="close-qr-modal-button"
            className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl text-[#10213F] hover:bg-[#F7F9FC] border border-[#CBD5E1] flex items-center justify-center cursor-pointer"
            aria-label="Close QR slip modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 flex-wrap">
          <PriorityBadge priority={referral.priority} />
          <StatusBadge status={referral.current_status} />
          <SyncStateBadge syncStatus={referral.sync_status} />
        </div>

        {/* High-contrast QR container on pure white surface */}
        <div className="flex justify-center">
          <div
            data-testid="qr-svg-container"
            className="p-4 bg-[#FFFFFF] border-2 border-[#062B78] rounded-2xl inline-flex items-center justify-center min-w-[230px] min-h-[230px] shadow-xs"
          >
            {svgMarkup ? (
              <div
                className="w-52 h-52 [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : (
              <div className="text-xs font-bold text-[#475569]">Generating QR…</div>
            )}
          </div>
        </div>

        <div className="text-xs font-bold text-[#10213F] bg-[#DDF7F4] py-3 px-4 rounded-xl border border-[#085E56] text-left space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[#475569]">Pathway:</span>
            <span className="font-extrabold text-[#031B4E]">
              {referral.referring_facility} → {referral.receiving_facility}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#475569]">Category:</span>
            <span className="font-bold text-[#10213F]">{referral.referral_category}</span>
          </div>
        </div>

        {/* Action Buttons: Share, Print, Open in Scanner */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleShare}
            data-testid="share-qr-button"
            className="py-3 px-4 min-h-[44px] rounded-xl border-2 border-[#062B78] bg-[#FFFFFF] text-[#062B78] font-extrabold text-xs flex items-center justify-center gap-2 hover:bg-[#EFF6FF] transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#085E56]" aria-hidden="true" />
                <span>✓ Copied Details</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-[#062B78]" aria-hidden="true" />
                <span>Share</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            data-testid="print-qr-button"
            className="py-3 px-4 min-h-[44px] rounded-xl border-2 border-[#062B78] bg-[#FFFFFF] text-[#062B78] font-extrabold text-xs flex items-center justify-center gap-2 hover:bg-[#EFF6FF] transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#062B78]" aria-hidden="true" />
            <span>Print Slip</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSimulateReceiveScan(referral)}
          data-testid="open-in-scan-button"
          className="w-full py-3.5 px-4 min-h-[48px] rounded-xl bg-[#062B78] hover:bg-[#031B4E] text-[#FFFFFF] text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <span>Open Referral Detail & Update Status</span>
          <ArrowRight className="w-4 h-4 text-[#10B9A8]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
