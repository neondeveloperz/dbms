import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onClose: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
}

export function ConfirmDialog({
    isOpen,
    title,
    message,
    onConfirm,
    onClose,
    confirmText = "Confirm",
    cancelText = "Cancel",
    isDestructive = false
}: ConfirmDialogProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-panel-bg border border-border-main rounded-xl shadow-2xl w-full max-w-sm flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b border-border-main flex items-center justify-between">
                    <h2 className="font-bold text-sm text-text-main flex items-center gap-2">
                        {isDestructive && <AlertTriangle className="w-4 h-4 text-red-500" />}
                        {title}
                    </h2>
                    <button onClick={onClose} className="text-text-muted hover:text-text-main">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-4 text-sm text-text-muted">
                    {message}
                </div>

                <div className="p-4 bg-item-bg/50 border-t border-border-main flex justify-end gap-3 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-medium text-text-muted hover:text-text-main transition-colors border border-transparent hover:border-border-main rounded-lg"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition-all shadow-lg ${isDestructive
                                ? "bg-red-600 hover:bg-red-500 shadow-red-900/20"
                                : "bg-blue-600 hover:bg-blue-500 shadow-blue-900/20"
                            }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
