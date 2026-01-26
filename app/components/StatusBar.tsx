import { Server, GitBranch, Info } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { Connection } from "../types";

interface StatusBarProps {
    activeConnName: string | null;
    connections: Connection[];
    setActiveView: (view: string) => void;
    isTerminalOpen: boolean;
    onToggleTerminal: () => void;
}

export function StatusBar({ activeConnName, connections, setActiveView, isTerminalOpen, onToggleTerminal }: StatusBarProps) {
    const activeConnection = activeConnName ? connections.find(c => c.name === activeConnName) : null;

    return (
        <div className="h-6 bg-blue-600 text-white flex items-center px-3 text-xs select-none justify-between border-t border-blue-700 z-50">
            <div className="flex items-center gap-4">
                <div
                    className={cn(
                        "flex items-center gap-1.5 hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors",
                        isTerminalOpen ? "bg-white/20 shadow-inner" : ""
                    )}
                    onClick={onToggleTerminal}
                    title="Toggle Terminal"
                >
                    <Server className="w-3 h-3" /> {/* Reusing Server icon? No, let's use Terminal icon if imported, but earlier I only imported Server. I'll stick to Server icon for connection, wait. User wants Terminal toggle. Use generic icon or add Terminal icon. */}
                    <span className="font-bold">TERMINAL</span>
                </div>

                <div className="h-3 w-px bg-white/20" />

                <div className="flex items-center gap-1.5 hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer transition-colors" title="Active Connection">
                    <span className="font-medium">{activeConnName ? activeConnName : "No Connection"}</span>
                </div>
                {activeConnName && (
                    <div className="flex items-center gap-1.5">
                        <div className={cn("w-2 h-2 rounded-full", activeConnection?.status === 'connected' ? "bg-green-400" : "bg-red-400")} />
                        <span className="opacity-80">{activeConnection?.status || 'Disconnected'}</span>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-4 opacity-80">
                <span>UTF-8</span>
                <div className="flex items-center gap-1 hover:bg-white/10 px-2 py-0.5 rounded cursor-pointer pointer-events-auto" onClick={() => setActiveView('info')} title="Version Info">
                    <Info className="w-3 h-3" />
                    <span>v0.1.1</span>
                </div>
            </div>
        </div>
    );
}
