import { Database, Settings, Info } from "lucide-react";
import { cn } from "@/app/lib/utils";

interface ActivityBarProps {
    activeView: string;
    setActiveView: (view: string) => void;
}

export function ActivityBar({ activeView, setActiveView }: ActivityBarProps) {
    return (
        <div className="w-12 flex flex-col items-center py-4 gap-4 bg-panel-bg border-r border-border-main">
            <button
                onClick={() => setActiveView('database')}
                className={cn("p-2 rounded-lg transition-colors", activeView === 'database' ? "bg-item-bg text-white" : "text-text-muted hover:text-text-main")}
                title="Database"
            >
                <Database className="w-5 h-5" />
            </button>
            <button
                onClick={() => setActiveView('settings')}
                className={cn("p-2 rounded-lg transition-colors", activeView === 'settings' ? "bg-item-bg text-white" : "text-text-muted hover:text-text-main")}
                title="Settings"
            >
                <Settings className="w-5 h-5" />
            </button>
            <div className="mt-auto">
                <button
                    onClick={() => setActiveView('info')}
                    className={cn("p-2 rounded-lg transition-colors", activeView === 'info' ? "bg-item-bg text-white" : "text-text-muted hover:text-text-main")}
                    title="Info"
                >
                    <Info className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
