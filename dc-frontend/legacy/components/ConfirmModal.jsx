import React, { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export const ConfirmModal = ({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed with this operation?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
      <div
        className="bg-white rounded-[4px] border border-[#E0E0E0] shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E0E0E0] bg-[#F4F4F4]">
          <div className="flex items-center gap-2">
            {isDanger && <AlertTriangle className="w-5 h-5 text-[#DA1E28]" />}
            <h3 className="text-sm font-semibold text-[#161616]">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-[#525252] hover:text-[#161616] p-1 rounded hover:bg-[#E0E0E0] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm text-[#525252] leading-relaxed">{message}</p>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3 bg-[#F4F4F4] border-t border-[#E0E0E0]">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary text-xs px-4 py-2"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`text-xs px-4 py-2 font-medium rounded-[4px] transition-colors text-white ${
              isDanger
                ? 'bg-[#DA1E28] hover:bg-[#BA1B23]'
                : 'bg-[#0F62FE] hover:bg-[#0353E9]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
