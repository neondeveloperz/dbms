import { X, Trash2, Terminal, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/app/lib/utils";

export type LogEntry = {
    type: 'log' | 'error' | 'warn';
    message: string;
    timestamp: string;
    count?: number;
};

interface DebugTerminalProps {
    logs: LogEntry[];
    isOpen: boolean;
    onClose: () => void;
    onClear: () => void;
}

export function DebugTerminal({ logs, isOpen, onClose, onClear }: DebugTerminalProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(250);
    const [isResizing, setIsResizing] = useState(false);

    // Auto-scroll to bottom on new logs
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, isOpen]);

    // Resizing Logic
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newHeight = window.innerHeight - e.clientY;
            // Clamp height
            if (newHeight >= 100 && newHeight <= 600) {
                setHeight(newHeight);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = 'default';
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'row-resize';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
    }, [isResizing]);

    if (!isOpen) return null;

    return (
        <div
            className="bg-[#0d1117] border-t border-border-main flex flex-col font-mono text-xs z-40 shrink-0 relative shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
            style={{ height }}
        >
            {/* Resize Handle */}
            <div
                className="absolute top-0 left-0 w-full h-1 cursor-row-resize hover:bg-blue-500/50 transition-colors z-50"
                onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
            />

            {/* Toolbar */}
            <div className="h-8 bg-panel-bg flex items-center justify-between px-3 border-b border-border-main select-none">
                <div className="flex items-center gap-2 text-text-muted">
                    <Terminal className="w-3.5 h-3.5" />
                    <span className="font-bold uppercase tracking-wider text-[10px]">Output</span>
                    <span className="bg-white/10 px-1.5 rounded text-[10px] min-w-[20px] text-center">{logs.length}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onClear}
                        className="p-1 hover:bg-white/10 rounded text-text-muted hover:text-text-main transition-colors"
                        title="Clear Console"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/10 rounded text-text-muted hover:text-text-main transition-colors"
                        title="Close Panel"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Log Output */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {logs.length === 0 ? (
                    <div className="text-text-muted opacity-30 italic px-2 mt-2 select-none">No logs yet...</div>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} className="flex gap-2 group hover:bg-white/5 px-2 py-0.5 rounded leading-tight items-start font-mono">
                            <span className="text-[10px] opacity-30 shrink-0 select-none w-14 text-right">{log.timestamp}</span>
                            <span
                                className={cn(
                                    "break-all whitespace-pre-wrap flex-1",
                                    log.type === 'error' ? "text-red-400" :
                                        log.type === 'warn' ? "text-yellow-400" :
                                            "text-text-muted group-hover:text-text-main"
                                )}
                            >
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
