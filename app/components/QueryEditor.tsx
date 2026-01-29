import { Play, AlertCircle, ArrowUp, ArrowDown, X, Plus, Trash2, Check, Database } from "lucide-react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { cn } from "@/app/lib/utils";
import { QueryTab, Connection, Settings } from "../types";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

interface QueryEditorProps {
    tabs: QueryTab[];
    activeTabId: string;
    setActiveTabId: (id: string) => void;
    closeTab: (e: React.MouseEvent, id: string) => void;
    createNewTab: () => void;
    activeConnName: string | null;
    connections: Connection[];
    runQuery: () => void;
    updateActiveTabQuery: (query: string) => void;
    handleSort: (col: string) => void;
    settings: Settings;
    onAddRow?: (tabId: string) => void;
    onSaveNewRow?: (tabId: string) => void;
    onCancelAddRow?: (tabId: string) => void;
    onUpdateNewRowData?: (tabId: string, colName: string, value: unknown) => void;
    onCloseAll: () => void;
    onCloseToRight: (id: string) => void;
    sidebarWidth: number;
    onDeleteRow?: (tabId: string, row: unknown[], columns: string[]) => void;
    onUpdateCell?: (tabId: string, row: unknown[], columns: string[], colIndex: number, newValue: unknown) => void;
}

export function QueryEditor({
    tabs,
    activeTabId,
    setActiveTabId,
    closeTab,
    createNewTab,
    activeConnName,
    connections,
    runQuery,
    updateActiveTabQuery,
    handleSort,
    settings,
    onCloseAll,
    onCloseToRight,
    onDeleteRow,
    onUpdateCell,
    onAddRow,
    onSaveNewRow,
    onCancelAddRow,
    onUpdateNewRowData,
    sidebarWidth
}: QueryEditorProps) {

    const activeTab = tabs.find(t => t.id === activeTabId);
    const monaco = useMonaco();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorRef = useRef<any>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null);
    const [rowContextMenu, setRowContextMenu] = useState<{ x: number, y: number, row: unknown[] } | null>(null);
    const [editingCell, setEditingCell] = useState<{ rowIdx: number, colIdx: number, value: unknown } | null>(null);
    const [colWidths, setColWidths] = useState<Record<string, number>>({});
    const resizingRef = useRef<{ col: string, startX: number, startWidth: number } | null>(null);

    // Initialize column widths when results change
    useEffect(() => {
        if (!activeTab?.results?.columns) return;

        // eslint-disable-next-line
        setColWidths(prev => {
            const newWidths = { ...prev };
            let changed = false;
            activeTab.results!.columns.forEach(col => {
                if (newWidths[col] === undefined) {
                    newWidths[col] = 150; // Default width
                    changed = true;
                }
            });
            // Only update if changes were made
            return changed ? newWidths : prev;
        });
    }, [activeTab?.results]);

    // Handle Resize
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!resizingRef.current) return;
            const { col, startX, startWidth } = resizingRef.current;
            const diff = e.clientX - startX;
            const newWidth = Math.max(50, startWidth + diff); // Min width 50px

            setColWidths(prev => ({ ...prev, [col]: newWidth }));
        };

        const handleMouseUp = () => {
            if (resizingRef.current) {
                resizingRef.current = null;
                document.body.style.cursor = 'default';
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const startResize = (e: React.MouseEvent, col: string) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = {
            col,
            startX: e.clientX,
            startWidth: colWidths[col] || 150
        };
        document.body.style.cursor = 'col-resize';
    };

    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        isDestructive?: boolean;
    }>({ isOpen: false, title: "", message: "", onConfirm: () => { } });

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => {
            setContextMenu(null);
            setRowContextMenu(null);
            if (editingCell) setEditingCell(null);
        };
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, [editingCell]);
    // ...

    // Focus input when editing starts
    const editInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (editingCell && editInputRef.current) {
            editInputRef.current.focus();
        }
    }, [editingCell]);

    // Sync theme
    useEffect(() => {
        if (monaco) {
            monaco.editor.setTheme(settings.appearance.theme === 'light' ? 'vs' : 'vs-dark');
        }
    }, [monaco, settings.appearance.theme]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleEditorDidMount = (editor: any) => {
        editorRef.current = editor;
    };

    const getFontSize = () => {
        switch (settings.appearance.font_size) {
            case 'small': return 12;
            case 'large': return 16;
            default: return 14;
        }
    };

    const formatValue = (val: unknown) => {
        if (val === null) return <span className="text-neutral-600 italic">null</span>;
        if (typeof val === 'boolean') return <span className={val ? "text-green-500" : "text-red-500"}>{val.toString()}</span>;
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    };

    const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, tabId });
    };

    const handleRowContextMenu = (e: React.MouseEvent, row: unknown[]) => {
        if (activeTab?.viewType !== 'data' || !onDeleteRow) return;
        e.preventDefault();
        e.stopPropagation(); // Prevent grid click?
        setRowContextMenu({ x: e.clientX, y: e.clientY, row });
    };

    const handleCellDoubleClick = (e: React.MouseEvent, rowIdx: number, colIdx: number, value: unknown) => {
        if (activeTab?.viewType !== 'data' || !onUpdateCell) return;
        e.stopPropagation();
        setEditingCell({ rowIdx, colIdx, value });
    };

    // Simplified: handleEditKeyDown calls onUpdateCell directly

    const handleEditKeyDown = (e: React.KeyboardEvent, row: unknown[], columns: string[]) => {
        if (e.key === 'Enter') {
            if (onUpdateCell && editingCell) {
                // Trigger Confirmation
                setConfirmState({
                    isOpen: true,
                    title: "Confirm Update",
                    message: "Are you sure you want to update this cell?",
                    onConfirm: () => {
                        onUpdateCell(activeTabId, row, columns, editingCell.colIdx, editingCell.value);
                        setEditingCell(null);
                    },
                    isDestructive: false
                });
            } else {
                setEditingCell(null);
            }
        } else if (e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-page-bg min-w-0">

            {/* Tab Bar */}
            <div className="h-9 flex items-center bg-panel-bg border-b border-border-main overflow-x-auto no-scrollbar">
                {tabs.map(tab => (
                    <div
                        key={tab.id}
                        onClick={() => setActiveTabId(tab.id)}
                        onContextMenu={(e) => handleContextMenu(e, tab.id)}
                        className={cn(
                            "h-full px-3 flex items-center gap-2 border-r border-border-main text-xs min-w-[120px] max-w-[200px] cursor-pointer group select-none relative",
                            activeTabId === tab.id ? "bg-page-bg text-text-main border-t-2 border-t-blue-500" : "bg-panel-bg text-text-muted hover:bg-item-bg"
                        )}
                    >
                        <span className="truncate flex-1">{tab.title}</span>
                        <button
                            onClick={(e) => closeTab(e, tab.id)}
                            className="opacity-0 group-hover:opacity-100 hover:bg-white/10 p-0.5 rounded"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ))}
                <button onClick={() => createNewTab()} className="px-3 h-full hover:bg-item-bg text-text-muted transition-colors">
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {/* Tab Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-50 bg-panel-bg border border-border-main rounded shadow-xl py-1 w-40 flex flex-col text-xs text-text-main"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button
                        onClick={() => {
                            // Mock event for closeTab
                            closeTab({ stopPropagation: () => { } } as React.MouseEvent, contextMenu.tabId);
                        }}
                        className="text-left px-3 py-1.5 hover:bg-item-bg flex items-center gap-2"
                    >
                        Close
                    </button>
                    <button
                        onClick={() => onCloseToRight(contextMenu.tabId)}
                        className="text-left px-3 py-1.5 hover:bg-item-bg flex items-center gap-2"
                    >
                        Close to Right
                    </button>
                    <div className="h-px bg-border-main my-1" />
                    <button
                        onClick={() => onCloseAll()}
                        className="text-left px-3 py-1.5 hover:bg-item-bg flex items-center gap-2 text-red-400"
                    >
                        Close All
                    </button>
                </div>
            )}

            {/* Row Context Menu */}
            {rowContextMenu && (
                <div
                    className="fixed z-50 bg-panel-bg border border-border-main rounded shadow-xl py-1 w-32 flex flex-col text-xs text-text-main"
                    style={{ top: rowContextMenu.y, left: rowContextMenu.x }}
                >
                    <button
                        onClick={() => {
                            setRowContextMenu(null);
                            if (onAddRow) {
                                onAddRow(activeTabId);
                            }
                        }}
                        className="text-left px-3 py-1.5 hover:bg-item-bg flex items-center gap-2 text-text-main"
                    >
                        <Plus className="w-3 h-3" /> Add Row
                    </button>
                    <div className="h-px bg-border-main my-1" />
                    <button
                        onClick={() => {
                            setRowContextMenu(null);
                            if (onDeleteRow) {
                                setConfirmState({
                                    isOpen: true,
                                    title: "Delete Row",
                                    message: "Are you sure you want to delete this row? This action cannot be undone.",
                                    onConfirm: () => onDeleteRow(activeTabId, rowContextMenu.row as unknown[], activeTab?.results?.columns || []),
                                    isDestructive: true
                                });
                            }
                        }}
                        className="text-left px-3 py-1.5 hover:bg-item-bg flex items-center gap-2 text-red-400 hover:bg-red-500/10"
                    >
                        <Trash2 className="w-3 h-3" /> Delete Row
                    </button>
                </div>
            )}

            {/* Toolbar */}
            {activeTab?.viewType === 'query' && (
                <div className="h-10 border-b border-border-main flex items-center px-4 gap-4 bg-page-bg">
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                        <span className="font-semibold">Active:</span>
                        {(() => {
                            const displayConn = activeTab?.connName || activeConnName;

                            return displayConn ? (
                                <span className="text-text-main font-medium flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: connections.find(c => c.name === displayConn)?.color }}></span>
                                    {displayConn}
                                </span>
                            ) : <span className="italic opacity-50 text-xs">None</span>
                        })()}
                    </div>
                    <div className="h-4 w-px bg-border-main mx-2" />
                    <div className="h-4 w-px bg-border-main mx-2" />
                    <button
                        onClick={() => runQuery()}
                        disabled={!activeTab?.connName && (!activeConnName || connections.find(c => c.name === activeConnName)?.status !== 'connected')}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-1.5 rounded text-xs font-medium transition-all ml-auto"
                    >
                        {activeTab?.isExecuting ? (
                            <> <div className="w-3 h-3 border-2 border-white/50 border-t-white animate-spin rounded-full" /> Running... </>
                        ) : (
                            <> <Play className="w-3 h-3 fill-current" /> Run </>
                        )}
                    </button>
                </div>
            )}

            {/* Editor */}
            {activeTab?.viewType === 'query' && (
                <div className="h-1/3 border-b border-border-main relative bg-item-bg">
                    {tabs.length > 0 ? (
                        <Editor
                            height="100%"
                            language="sql"
                            value={activeTab?.query || ''}
                            onChange={(value) => updateActiveTabQuery(value || '')}
                            onMount={handleEditorDidMount}
                            theme={settings.appearance.theme === 'light' ? 'vs' : 'vs-dark'}
                            options={{
                                minimap: { enabled: false },
                                fontSize: getFontSize(),
                                fontFamily: settings.appearance.editor_font,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 10, bottom: 10 },
                            }}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-muted text-sm italic opacity-50 select-none">
                            No open tabs. Click + or select a table to start querying.
                        </div>
                    )}
                </div>
            )}

            {/* Results */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {activeTab?.error && (
                    <div className="bg-red-500/10 border-b border-red-500/20 p-2 text-red-500 text-xs font-mono flex gap-2 items-center">
                        <AlertCircle className="w-3 h-3" /> {activeTab.error}
                    </div>
                )}
                {activeTab?.viewType === 'data' && activeTab?.results && activeTab.results.rows.length > 0 && (
                    <div className="h-8 border-b border-border-main flex items-center px-4 bg-page-bg/50">
                        <button
                            onClick={() => onAddRow?.(activeTabId)}
                            className="flex items-center gap-1.5 text-blue-500 hover:text-blue-400 text-xs font-medium transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" /> Add Row
                        </button>
                    </div>
                )}
                <div className="flex-1 overflow-y-scroll custom-scrollbar">
                    {(() => {
                        const results = activeTab?.results;
                        if (!results) return <div className="h-full flex items-center justify-center text-text-muted text-xs italic opacity-50">Execute a query to see results</div>;

                        // Sorting logic is handled by parent, but we display the sorted rows (assuming results rows ARE sorted if sorted in state, wait. 
                        // The `results` prop passed down should be sorted.
                        // In page.tsx current logic, sorting is done dynamically inside the render loop! 
                        // I need to duplicate that sorting logic here or move it to a helper.
                        // For now, I'll copy the sorting logic here.

                        const displayRows = [...results.rows];
                        if (activeTab.sortState) {
                            const { col, dir } = activeTab.sortState;
                            const colIdx = results.columns.indexOf(col);
                            if (colIdx >= 0) {
                                displayRows.sort((a, b) => {
                                    const valA = a[colIdx];
                                    const valB = b[colIdx];
                                    if (valA === valB) return 0;
                                    if (valA === null) return 1;
                                    if (valB === null) return -1;

                                    if (typeof valA === 'number' && typeof valB === 'number') {
                                        return dir === 'asc' ? valA - valB : valB - valA;
                                    }
                                    const strA = String(valA).toLowerCase();
                                    const strB = String(valB).toLowerCase();
                                    if (strA < strB) return dir === 'asc' ? -1 : 1;
                                    if (strA > strB) return dir === 'asc' ? 1 : -1;
                                    return 0;
                                });
                            }
                        }

                        return (
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className="bg-panel-bg sticky top-0 z-10 text-xs uppercase tracking-wider text-text-muted select-none">
                                    <tr>
                                        <th className="px-2 py-1 font-semibold border-b border-r border-border-main whitespace-nowrap bg-panel-bg w-8 text-center text-text-muted/50 select-none text-[10px]">
                                            #
                                        </th>
                                        {results.columns.map((col, i) => (
                                            <th
                                                key={i}
                                                className="px-2 py-1 font-semibold border-b border-r border-border-main whitespace-nowrap cursor-pointer hover:bg-item-bg hover:text-text-main transition-colors group relative"
                                                style={{ width: colWidths[col] || 150, minWidth: colWidths[col] || 150, maxWidth: colWidths[col] || 150 }}
                                                onClick={() => handleSort(col)}
                                            >
                                                <div className="flex items-center gap-1 overflow-hidden">
                                                    <span className="truncate">{col}</span>
                                                    {activeTab.sortState?.col === col && (
                                                        activeTab.sortState.dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500 flex-shrink-0" /> : <ArrowDown className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                                    )}
                                                </div>
                                                {/* Resizer Handle */}
                                                <div
                                                    className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-10"
                                                    onMouseDown={(e) => startResize(e, col)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="font-mono text-xs">
                                    {activeTab.isAddingRow && (
                                        <tr className="bg-blue-500/10 border-b border-blue-500/30 group">
                                            <td className="px-2 py-0.5 text-blue-500 text-center select-none bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors border-r border-border-main text-[10px] flex items-center justify-center gap-1">
                                                <button onClick={() => onSaveNewRow?.(activeTabId)} className="hover:text-green-500" title="Save">
                                                    <Check className="w-3 h-3" />
                                                </button>
                                                <button onClick={() => onCancelAddRow?.(activeTabId)} className="hover:text-red-500" title="Cancel">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </td>
                                            {results.columns.map((col, c_idx) => (
                                                <td
                                                    key={c_idx}
                                                    className="px-2 py-0.5 border-r border-border-main/50"
                                                    style={{ maxWidth: colWidths[col] || 150 }}
                                                >
                                                    <input
                                                        autoFocus={c_idx === 0}
                                                        className="w-full bg-page-bg/50 text-text-main border border-blue-500/30 rounded px-1 py-0.5 outline-none focus:border-blue-500"
                                                        value={String(activeTab.newRowData?.[col] ?? '')}
                                                        onChange={(e) => onUpdateNewRowData?.(activeTabId, col, e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') onSaveNewRow?.(activeTabId);
                                                            if (e.key === 'Escape') onCancelAddRow?.(activeTabId);
                                                        }}
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    )}
                                    {displayRows.length === 0 && !activeTab.isAddingRow && (
                                        <tr>
                                            <td colSpan={results.columns.length + 1} className="py-20 text-center p-0 border-none">
                                                <div
                                                    className="sticky left-0 flex flex-col items-center justify-center space-y-4 pointer-events-none mb-10"
                                                    style={{ width: `calc(100vw - ${sidebarWidth + 48}px)` }}
                                                >
                                                    <div className="pointer-events-auto flex flex-col items-center space-y-4">
                                                        <div className="flex flex-col items-center opacity-30">
                                                            <Database className="w-12 h-12 mb-2" />
                                                            <span className="text-sm italic">No data found in this table</span>
                                                        </div>
                                                        <button
                                                            onClick={() => onAddRow?.(activeTabId)}
                                                            className="flex items-center gap-2 bg-blue-600/80 hover:bg-blue-600 text-white px-4 py-2 rounded text-xs font-medium transition-all border border-blue-500/50"
                                                        >
                                                            <Plus className="w-4 h-4" /> Create Data
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    {displayRows.map((row, r_idx) => (
                                        <tr
                                            key={r_idx}
                                            className="hover:bg-item-bg border-b border-border-main/30 group"
                                            onContextMenu={(e) => handleRowContextMenu(e, row)}
                                        >
                                            <td className="px-2 py-0.5 text-text-muted/50 text-center select-none bg-panel-bg/50 group-hover:bg-item-bg transition-colors border-r border-border-main text-[10px]">
                                                {r_idx + 1}
                                            </td>
                                            {row.map((val, c_idx) => {
                                                const isEditing = editingCell?.rowIdx === r_idx && editingCell?.colIdx === c_idx;
                                                return (
                                                    <td
                                                        key={c_idx}
                                                        className="px-2 py-0.5 text-text-muted group-hover:text-text-main transition-colors cursor-text border-r border-border-main/50 overflow-hidden truncate"
                                                        style={{ maxWidth: colWidths[results.columns[c_idx]] || 150 }}
                                                        onDoubleClick={(e) => handleCellDoubleClick(e, r_idx, c_idx, val)}
                                                    >
                                                        {isEditing ? (
                                                            <input
                                                                ref={editInputRef}
                                                                className="w-full bg-page-bg text-text-main border border-blue-500 rounded px-1 py-0.5 outline-none -ml-1"
                                                                value={editingCell.value === null ? '' : String(editingCell.value)}
                                                                onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onKeyDown={(e) => handleEditKeyDown(e, row, results.columns)}
                                                                onBlur={() => setEditingCell(null)}
                                                            />
                                                        ) : (
                                                            formatValue(val)
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    })()}
                </div>
            </div>
            {/* Confirmation Dialog */}
            <ConfirmDialog
                isOpen={confirmState.isOpen}
                onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
                title={confirmState.title}
                message={confirmState.message}
                onConfirm={confirmState.onConfirm}
                isDestructive={confirmState.isDestructive}
            />
        </div>
    );
}
