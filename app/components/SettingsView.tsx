import { useState } from "react";
import { Settings, Save } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { Settings as SettingsType } from "../types";

interface SettingsViewProps {
    sidebarWidth: number;
    settings: SettingsType;
    setSettings: (settings: SettingsType) => void;
    setIsResizing: (isResizing: boolean) => void;
}

export function SettingsView({ sidebarWidth, settings, setSettings, setIsResizing }: SettingsViewProps) {
    const [activeSettingsTab, setActiveSettingsTab] = useState<'appearance' | 'query' | 'connection' | 'export' | 'advanced'>('appearance');
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const handleSave = () => {
        setIsSavingSettings(true);
        // Simulate save
        setTimeout(() => {
            setIsSavingSettings(false);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
        }, 800);
    };

    return (
        <div style={{ width: sidebarWidth }} className="bg-panel-bg border-r border-border-main flex flex-col relative flex-shrink-0">
            <div className="p-4 border-b border-border-main text-sm font-bold flex items-center gap-2">
                <Settings className="w-4 h-4" /> SETTINGS
            </div>
            <div className="flex border-b border-border-main px-2 pt-2 gap-1 overflow-x-auto">
                {(['appearance', 'query', 'connection', 'export', 'advanced'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveSettingsTab(tab)}
                        className={cn(
                            "px-3 py-2 text-xs font-medium rounded-t transition-colors capitalize",
                            activeSettingsTab === tab ? "bg-item-bg text-text-main border-b-2 border-blue-500" : "text-text-muted hover:text-text-main"
                        )}
                    >
                        {tab}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeSettingsTab === 'appearance' && (
                    <>
                        <div>
                            <label className="text-xs font-semibold text-text-muted block mb-2">Theme</label>
                            <div className="flex gap-2">
                                {['light', 'dark', 'auto'].map(theme => (
                                    <button
                                        key={theme}
                                        onClick={() => setSettings({ ...settings, appearance: { ...settings.appearance, theme } })}
                                        className={cn(
                                            "flex-1 px-3 py-2 text-xs rounded border transition-colors capitalize",
                                            settings.appearance.theme === theme ? "bg-blue-600 border-blue-500 text-white" : "bg-item-bg border-border-main text-text-muted"
                                        )}
                                    >
                                        {theme}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-text-muted block mb-2">Font Size</label>
                            <select
                                value={settings.appearance.font_size}
                                onChange={(e) => setSettings({ ...settings, appearance: { ...settings.appearance, font_size: e.target.value } })}
                                className="w-full bg-item-bg border border-border-main text-text-main rounded px-3 py-2 text-sm"
                            >
                                <option value="small">Small</option>
                                <option value="medium">Medium</option>
                                <option value="large">Large</option>
                            </select>
                        </div>
                    </>
                )}
                {activeSettingsTab === 'query' && (
                    <>
                        <div>
                            <label className="text-xs font-semibold text-text-muted block mb-2">Auto Limit</label>
                            <input
                                type="number"
                                value={settings.query.auto_limit}
                                onChange={(e) => setSettings({ ...settings, query: { ...settings.query, auto_limit: parseInt(e.target.value) } })}
                                className="w-full bg-item-bg border border-border-main text-text-main rounded px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={settings.query.auto_format}
                                onChange={(e) => setSettings({ ...settings, query: { ...settings.query, auto_format: e.target.checked } })}
                                className="rounded bg-item-bg border-border-main"
                            />
                            <label className="text-xs font-semibold text-text-muted">Auto Format SQL</label>
                        </div>
                    </>
                )}
                {/* Other settings tabs placeholder */}
                {activeSettingsTab === 'connection' && <div className="text-xs text-text-muted italic">Connection settings coming soon...</div>}
                {activeSettingsTab === 'export' && <div className="text-xs text-text-muted italic">Export settings coming soon...</div>}
                {activeSettingsTab === 'advanced' && <div className="text-xs text-text-muted italic">Advanced settings coming soon...</div>}
            </div>
            <div className="p-4 border-t border-border-main bg-item-bg/50">
                <button
                    onClick={handleSave}
                    className={cn("w-full py-2 text-xs rounded transition-colors flex items-center justify-center gap-2 text-white font-bold", saveSuccess ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700")}
                    disabled={isSavingSettings}
                >
                    {isSavingSettings ? <div className="w-3 h-3 border-2 border-white/50 border-t-white animate-spin rounded-full" /> : <Save className="w-3 h-3" />}
                    {isSavingSettings ? "Saving..." : (saveSuccess ? "Saved Successfully" : "Save Settings")}
                </button>
            </div>

            {/* Resize Handle */}
            <div
                onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
                className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-10"
            />
        </div>
    );
}
