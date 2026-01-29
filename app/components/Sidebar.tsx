import { ChevronRight, Plus, Database, ChevronDown, Table2, Eye, FlaskConical, RefreshCw } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { Connection } from "../types";

interface SidebarProps {
    sidebarWidth: number;
    connections: Connection[];
    activeConnName: string | null;
    expandedPanes: { connections: boolean; explorer: boolean };
    setExpandedPanes: React.Dispatch<React.SetStateAction<{ connections: boolean; explorer: boolean }>>;
    setActiveConnName: (name: string) => void;
    setEditingConnName: (name: string | null) => void;
    setIsModalOpen: (isOpen: boolean) => void;
    handleContextMenu: (e: React.MouseEvent, name: string, type: 'connection' | 'table') => void;
    schemas: Record<string, string[]>;
    selectedSchema: Record<string, string>;
    setSelectedSchema: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    tables: Record<string, string[]>;
    views: Record<string, string[]>;
    functions: Record<string, string[]>;
    handleTableClick: (name: string) => void;
    createNewTab: (title?: string, query?: string, connName?: string) => void;
    setIsResizing: (isResizing: boolean) => void;
    onConnect?: (name: string) => void;
    onRefreshTables?: () => void;
    onRefreshConnections?: () => void;
    onCheckUpdates?: () => void;
    isCheckingUpdates?: boolean;
    currentVersion?: string;
    databases: Record<string, string[]>;
    selectedDatabase: Record<string, string>;
    onDatabaseChange: (connName: string, dbName: string) => void;
}

export function Sidebar({
    sidebarWidth,
    connections,
    activeConnName,
    expandedPanes,
    setExpandedPanes,
    setActiveConnName,
    setEditingConnName,
    setIsModalOpen,
    handleContextMenu,
    schemas,
    selectedSchema,
    setSelectedSchema,
    tables,
    views,
    functions,
    handleTableClick,
    createNewTab,
    setIsResizing,
    onConnect,
    onRefreshTables,
    onCheckUpdates,
    isCheckingUpdates,
    currentVersion = "0.1.0",
    databases,
    selectedDatabase,
    onDatabaseChange
}: SidebarProps) {
    return (
        <div style={{ width: sidebarWidth }} className="bg-panel-bg border-r border-border-main flex flex-col relative flex-shrink-0">

            {/* Split Pane Sidebar */}
            <div className="flex-1 flex flex-col min-h-0">

                {/* CONNECTIONS PANE */}
                <div className="flex flex-col flex-shrink-0 max-h-[50%] min-h-[100px] border-b border-border-main">
                    <div
                        className="flex items-center px-4 py-3 bg-panel-bg hover:bg-item-bg cursor-pointer border-b border-border-main/50 select-none"
                        onClick={() => setExpandedPanes(prev => ({ ...prev, connections: !prev.connections }))}
                    >
                        <ChevronRight className={cn("w-4 h-4 transition-transform mr-1.5 text-text-muted", expandedPanes.connections ? "rotate-90" : "")} />
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Connections</span>
                        <div className="ml-auto flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button
                                onClick={() => {
                                    setEditingConnName(null);
                                    setIsModalOpen(true);
                                }}
                                className="p-1 hover:bg-item-bg-hover rounded text-text-muted hover:text-text-main transition-colors"
                                title="New Connection"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {expandedPanes.connections && (
                        <div className="flex-1 overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-border-main scrollbar-track-transparent">
                            {connections.map(conn => (
                                <div
                                    key={conn.name}
                                    onContextMenu={(e) => handleContextMenu(e, conn.name, 'connection')}
                                    className={cn(
                                        "w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors border-l-2 cursor-pointer group",
                                        activeConnName === conn.name ? "bg-item-bg border-blue-500 text-text-main" : "hover:bg-item-bg/50 text-text-muted border-transparent",
                                    )}
                                    style={{ borderLeftColor: activeConnName === conn.name ? undefined : conn.color }}
                                    onClick={() => setActiveConnName(conn.name)}
                                >
                                    <div className="flex items-center justify-center w-6 h-6 rounded bg-item-bg/50 border border-border-main/50 group-hover:border-blue-500/30 transition-colors">
                                        <Database className={cn("w-3.5 h-3.5", activeConnName === conn.name ? "text-blue-400" : "text-text-muted")} />
                                    </div>
                                    <div className="flex flex-col w-full overflow-hidden">
                                        <span className="truncate flex items-center justify-between font-medium">
                                            {conn.name}
                                            <div className="flex items-center gap-2">
                                                {conn.status !== 'connected' && conn.status !== 'connecting' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (onConnect) onConnect(conn.name);
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-500 hover:text-white rounded transition-all text-text-muted"
                                                        title="Connect"
                                                    >
                                                        <Database className="w-3 h-3" />
                                                    </button>
                                                )}
                                                <span className={cn("w-2 h-2 rounded-full flex-shrink-0 shadow-sm", conn.status === 'connected' ? "bg-green-500 shadow-green-500/20" : (conn.status === 'connecting' ? "bg-yellow-500 animate-pulse" : "bg-transparent border border-text-muted/50"))} />
                                            </div>
                                        </span>
                                        <span className="text-[10px] text-text-muted/70 uppercase tracking-tight">{conn.type}</span>
                                    </div>
                                </div>
                            ))}
                            {connections.length === 0 && (
                                <div className="text-xs text-text-muted p-6 text-center italic opacity-60">No connections</div>
                            )}
                        </div>
                    )}
                </div>

                {/* EXPLORER PANE */}
                <div className="flex flex-col flex-1 min-h-0 bg-panel-bg/20">
                    <div
                        className="flex items-center px-4 py-3 bg-panel-bg hover:bg-item-bg cursor-pointer border-b border-border-main/50 select-none"
                        onClick={() => setExpandedPanes(prev => ({ ...prev, explorer: !prev.explorer }))}
                    >
                        <ChevronRight className={cn("w-4 h-4 transition-transform mr-1.5 text-text-muted", expandedPanes.explorer ? "rotate-90" : "")} />
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Explorer</span>
                        <div className="ml-auto flex items-center gap-1">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRefreshTables?.();
                                }}
                                className="p-1 hover:bg-item-bg-hover rounded text-text-muted hover:text-text-main transition-colors"
                                title="Refresh Tables"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {expandedPanes.explorer && (
                        <div className="flex-1 overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-border-main scrollbar-track-transparent">
                            {activeConnName && connections.find(c => c.name === activeConnName)?.status === 'connected' ? (
                                <div className="py-2 pb-6 space-y-4 text-sm">
                                    {/* Database Selector */}
                                    {databases[activeConnName] && databases[activeConnName].length > 0 && (
                                        <div className="relative px-4 pt-1">
                                            <div className="text-[10px] text-text-muted/70 uppercase tracking-widest font-bold mb-1 pl-1 flex items-center gap-1.5">
                                                <Database className="w-3 h-3" /> Database
                                            </div>
                                            <div className="relative">
                                                <select
                                                    value={selectedDatabase[activeConnName] || ''}
                                                    onChange={(e) => onDatabaseChange(activeConnName, e.target.value)}
                                                    className="w-full bg-item-bg border border-border-main rounded-md px-2.5 py-1.5 text-xs text-text-main appearance-none outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all font-medium pl-2.5"
                                                >
                                                    {databases[activeConnName].map(db => <option key={db} value={db}>{db}</option>)}
                                                </select>
                                                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2 text-text-muted pointer-events-none" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Schema Selector */}
                                    {schemas[activeConnName] && schemas[activeConnName].length > 0 && (
                                        <div className="relative px-4 pt-1">
                                            <div className="text-[10px] text-text-muted/70 uppercase tracking-widest font-bold mb-1 pl-1 flex items-center gap-1.5">
                                                <Table2 className="w-3 h-3" /> Schema
                                            </div>
                                            <div className="relative">
                                                <select
                                                    value={selectedSchema[activeConnName] || ''}
                                                    onChange={(e) => setSelectedSchema(prev => ({ ...prev, [activeConnName]: e.target.value }))}
                                                    className="w-full bg-item-bg border border-border-main rounded-md px-2.5 py-1.5 text-xs text-text-main appearance-none outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all font-medium pl-2.5"
                                                >
                                                    <option value="*">All Schemas</option>
                                                    {schemas[activeConnName].map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                                <ChevronDown className="w-3.5 h-3.5 absolute right-6 top-2 text-text-muted pointer-events-none" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Tables */}
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2 px-4 py-1 text-text-muted text-[11px] font-bold uppercase tracking-wider opacity-80 sticky top-0 bg-panel-bg/95 backdrop-blur-sm z-10">
                                            <Table2 className="w-3.5 h-3.5" />
                                            <span>Tables {tables[activeConnName]?.length ? `(${tables[activeConnName].length})` : ''}</span>
                                        </div>
                                        {!tables[activeConnName] || tables[activeConnName].length === 0 ? (
                                            <div className="text-xs text-text-muted px-8 py-2 italic opacity-50">No tables found</div>
                                        ) : (
                                            tables[activeConnName].map((table, idx) => (
                                                <button
                                                    key={`table-${table}-${idx}`}
                                                    onClick={() => handleTableClick(table)}
                                                    className="w-full text-left px-4 py-1.5 text-sm text-text-muted hover:text-text-main hover:bg-item-bg flex items-center gap-3 truncate transition-colors group border-l-2 border-transparent hover:border-blue-500/50"
                                                    title={table}
                                                    onContextMenu={(e) => handleContextMenu(e, table, 'table')}
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted/30 group-hover:bg-blue-500 transition-colors ml-1"></span>
                                                    <span className="truncate">{table}</span>
                                                </button>
                                            ))
                                        )}
                                    </div>

                                    {/* Views */}
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2 px-4 py-1 text-text-muted text-[11px] font-bold uppercase tracking-wider opacity-80 sticky top-0 bg-panel-bg/95 backdrop-blur-sm z-10">
                                            <Eye className="w-3.5 h-3.5" />
                                            <span>Views {views[activeConnName]?.length ? `(${views[activeConnName].length})` : ''}</span>
                                        </div>
                                        {!views[activeConnName] || views[activeConnName].length === 0 ? (
                                            <div className="text-xs text-text-muted px-8 py-2 italic opacity-50">No views found</div>
                                        ) : (
                                            views[activeConnName].map((view, idx) => (
                                                <button
                                                    key={`view-${view}-${idx}`}
                                                    onClick={() => handleTableClick(view)}
                                                    className="w-full text-left px-4 py-1.5 text-sm text-text-muted hover:text-text-main hover:bg-item-bg flex items-center gap-3 truncate transition-colors group border-l-2 border-transparent hover:border-purple-500/50"
                                                    title={view}
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted/30 group-hover:bg-purple-500 transition-colors ml-1"></span>
                                                    <span className="truncate">{view}</span>
                                                </button>
                                            ))
                                        )}
                                    </div>

                                    {/* Functions */}
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2 px-4 py-1 text-text-muted text-[11px] font-bold uppercase tracking-wider opacity-80 sticky top-0 bg-panel-bg/95 backdrop-blur-sm z-10">
                                            <FlaskConical className="w-3.5 h-3.5" />
                                            <span>Functions {functions[activeConnName]?.length ? `(${functions[activeConnName].length})` : ''}</span>
                                        </div>
                                        {!functions[activeConnName] || functions[activeConnName].length === 0 ? (
                                            <div className="text-xs text-text-muted px-8 py-2 italic opacity-50">No functions found</div>
                                        ) : (
                                            functions[activeConnName].map((func, idx) => (
                                                <button
                                                    key={`func-${func}-${idx}`}
                                                    onClick={() => createNewTab(func, `SELECT * FROM ${func}`, activeConnName)}
                                                    className="w-full text-left px-4 py-1.5 text-sm text-text-muted hover:text-text-main hover:bg-item-bg flex items-center gap-3 truncate transition-colors group border-l-2 border-transparent hover:border-orange-500/50"
                                                    title={func}
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted/30 group-hover:bg-orange-500 transition-colors ml-1"></span>
                                                    <span className="truncate">{func}</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center p-12 text-text-muted gap-3 opacity-50 animate-pulse">
                                    <div className="bg-item-bg p-4 rounded-full">
                                        <Database className="w-8 h-8 opacity-50" strokeWidth={1.5} />
                                    </div>
                                    <span className="text-xs font-medium">Select a connection to explore</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Version Info Footer */}
            <div className="p-2 border-t border-border-main bg-panel-bg/50">
                <div className="flex items-center justify-between px-2">
                    <p className="text-[9px] text-text-muted opacity-50 uppercase tracking-widest font-bold">v{currentVersion}</p>
                    <button
                        onClick={onCheckUpdates}
                        disabled={isCheckingUpdates}
                        className="p-1 hover:bg-item-bg rounded text-text-muted hover:text-blue-400 transition-all disabled:opacity-30"
                        title="Check for Updates"
                    >
                        <RefreshCw className={cn("w-3 h-3", isCheckingUpdates && "animate-spin")} />
                    </button>
                </div>
            </div>
            {/* Resize Handle */}
            <div
                onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
                className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-10"
            />
        </div>
    );
}
