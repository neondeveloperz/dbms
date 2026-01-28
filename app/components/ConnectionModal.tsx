import { useState, useEffect } from "react";
import { X, FlaskConical, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/app/lib/utils";
import { Connection, DbType } from "../types";
import { DB_DEFAULTS, COLORS } from "../constants";

interface ConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (connection: Connection) => void;
    editingConnection: Connection | null;
    existingConnections: Connection[];
}

export function ConnectionModal({ isOpen, onClose, onSave, editingConnection, existingConnections }: ConnectionModalProps) {
    const [connMethod, setConnMethod] = useState<'details' | 'url'>('details');
    const [type, setType] = useState<DbType>('postgres');

    // Form Fields
    const [host, setHost] = useState("localhost");
    const [port, setPort] = useState(5432);
    const [user, setUser] = useState("postgres");
    const [password, setPassword] = useState("");
    const [database, setDatabase] = useState("");
    const [displayName, setDisplayName] = useState("Local Postgres");
    const [selectedColor, setSelectedColor] = useState(COLORS[6]); // Blue default
    const [showPassword, setShowPassword] = useState(false);

    // Raw URL mode
    const [rawUrl, setRawUrl] = useState("");

    // Test/Save State
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);

    // Initialize form when editing or opening
    useEffect(() => {
        if (editingConnection) {
            setType(editingConnection.type);
            setDisplayName(editingConnection.name);
            setSelectedColor(editingConnection.color);
            // We'd ideally parse the URL here to fill fields, but for now we'll just set Raw URL if strict parsing fails
            // For simplicity/robustness in this refactor, let's just stick to defaults or what we can
            // Real app would need URL parsing logic.
            // Assuming for now we just reset to defaults if new, or keep existing logic.
            // Since we don't store separate fields, we might need to parse `editingConnection.url`

            // Simple heuristic: if it starts with type, try to put it in rawUrl
            setRawUrl(editingConnection.url);
            setConnMethod('url');
        } else {
            // Defaults for new connection
            setDisplayName("Local Postgres");
            setType('postgres');
            setHost("localhost");
            setPort(5432);
            setUser("postgres");
            setConnMethod('details');
            setSelectedColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
        }
        setTestResult(null);
    }, [editingConnection, isOpen]);

    const handleTypeChange = (newType: DbType) => {
        setType(newType);
        const def = DB_DEFAULTS[newType];
        setPort(def.port);
        setUser(def.user);
        if (!editingConnection) {
            setDisplayName(`Local ${newType.charAt(0).toUpperCase() + newType.slice(1)}`);
        }
    };

    const getConnectionString = () => {
        if (connMethod === 'url') return rawUrl;
        // Basic construction
        const protocol = type === 'mssql' ? 'sqlserver' : type;
        return `${protocol}://${user}:${password}@${host}:${port}/${database}`;
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const url = getConnectionString();
            await invoke("test_connection", { url });
            setTestResult({ success: true, msg: "Connection successful!" });
        } catch (e: unknown) {
            setTestResult({ success: false, msg: String(e) });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = () => {
        setIsConnecting(true);
        const url = getConnectionString();

        // Check if name exists (deny duplicate if not editing same)
        if (!editingConnection && existingConnections.some(c => c.name === displayName)) {
            setTestResult({ success: false, msg: "A connection with this name already exists." });
            setIsConnecting(false);
            return;
        }

        const newConn: Connection = {
            name: displayName,
            url,
            type,
            color: selectedColor,
            status: 'disconnected' // Page will handle connection logic if needed, but usually we just save
        };

        onSave(newConn);
        setIsConnecting(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-panel-bg border border-border-main rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-border-main flex items-center justify-between">
                    <h2 className="font-bold text-lg text-text-main">{editingConnection ? 'Edit Connection' : 'New Connection'}</h2>
                    <button onClick={onClose} className="text-text-muted hover:text-text-main"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    {testResult && (
                        <div className={cn("p-3 rounded-lg text-xs flex items-center gap-2", testResult.success ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500")}>
                            {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            {testResult.msg}
                        </div>
                    )}

                    <div className="space-y-3">
                        <label className="text-xs font-bold text-text-muted uppercase tracking-wider block">Database Type</label>
                        <div className="grid grid-cols-5 gap-2">
                            {(['postgres', 'mysql', 'mssql', 'mongodb', 'redis'] as DbType[]).map(t => (
                                <button
                                    key={t}
                                    onClick={() => handleTypeChange(t)}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
                                        type === t ? "bg-blue-600/10 border-blue-600 text-blue-500 ring-1 ring-blue-600" : "bg-item-bg border-border-main text-text-muted hover:border-text-muted hover:bg-item-bg-hover"
                                    )}
                                >
                                    <div className="w-8 h-8 rounded bg-current opacity-20" />
                                    <span className="text-[10px] font-medium capitalize">{t}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-2">Color Label</label>
                        <div className="flex flex-wrap gap-2">
                            {COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setSelectedColor(c)}
                                    className={cn(
                                        "w-6 h-6 rounded-full transition-transform hover:scale-110",
                                        selectedColor === c ? "ring-2 ring-offset-2 ring-offset-panel-bg ring-white" : ""
                                    )}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="bg-item-bg/50 p-1 rounded-lg flex text-xs font-medium text-text-muted mb-4">
                        <button
                            onClick={() => setConnMethod('details')}
                            className={cn("flex-1 py-1.5 rounded-md transition-all", connMethod === 'details' ? "bg-panel-bg text-text-main shadow-sm" : "hover:text-text-main")}
                        >
                            Connection Details
                        </button>
                        <button
                            onClick={() => setConnMethod('url')}
                            className={cn("flex-1 py-1.5 rounded-md transition-all", connMethod === 'url' ? "bg-panel-bg text-text-main shadow-sm" : "hover:text-text-main")}
                        >
                            Connection URL
                        </button>
                    </div>

                    {connMethod === 'details' ? (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 sm:col-span-1">
                                <label className="text-[10px] font-bold text-text-muted uppercase mb-1.5 block">Host</label>
                                <input type="text" value={host} onChange={(e) => setHost(e.target.value)} className="w-full bg-item-bg border border-border-main rounded-lg px-3 py-2 text-sm text-text-main" />
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <label className="text-[10px] font-bold text-text-muted uppercase mb-1.5 block">Port</label>
                                <input type="number" value={port} onChange={(e) => setPort(parseInt(e.target.value) || 0)} className="w-full bg-item-bg border border-border-main rounded-lg px-3 py-2 text-sm text-text-main" />
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <label className="text-[10px] font-bold text-text-muted uppercase mb-1.5 block">User</label>
                                <input type="text" value={user} onChange={(e) => setUser(e.target.value)} className="w-full bg-item-bg border border-border-main rounded-lg px-3 py-2 text-sm text-text-main" />
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <label className="text-[10px] font-bold text-text-muted uppercase mb-1.5 block">Password</label>
                                <div className="relative">
                                    <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-item-bg border border-border-main rounded-lg px-3 py-2 text-sm text-text-main pr-8" />
                                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-2.5 text-text-muted hover:text-text-main">
                                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>
                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-text-muted uppercase mb-1.5 block">Database (Optional)</label>
                                <input type="text" value={database} onChange={(e) => setDatabase(e.target.value)} className="w-full bg-item-bg border border-border-main rounded-lg px-3 py-2 text-sm text-text-main" />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-text-muted uppercase mb-1.5 block">Connection URL</label>
                                <textarea value={rawUrl} onChange={(e) => setRawUrl(e.target.value)} className="w-full bg-item-bg border border-border-main rounded-lg px-3 py-2 text-sm text-text-main font-mono h-24" placeholder="postgres://user:pass@host:port/db" />
                            </div>
                        </div>
                    )}
                    <div className="pt-2 border-t border-border-main">
                        <label className="text-[10px] font-bold text-text-muted uppercase mb-1.5 block">Display Name</label>
                        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-item-bg border border-border-main rounded-lg px-3 py-2 text-sm text-text-main" />
                    </div>
                </div>
                <div className="p-4 bg-item-bg/50 border-t border-border-main flex gap-3">
                    <button disabled={isTesting} onClick={handleTestConnection} className="mr-auto px-4 py-2 text-xs font-medium text-text-muted hover:text-text-main transition-colors flex items-center gap-2">
                        {isTesting ? <div className="w-3 h-3 border-2 border-text-muted border-t-transparent animate-spin rounded-full" /> : <FlaskConical className="w-3 h-3" />}
                        Test
                    </button>
                    <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-text-muted hover:text-text-main">Cancel</button>
                    <button onClick={handleSave} disabled={isConnecting} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-blue-900/20">
                        {isConnecting ? "Connecting..." : (editingConnection ? "Save Changes" : "Connect")}
                    </button>
                </div>
            </div>
        </div>
    );
}
