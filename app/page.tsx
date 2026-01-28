"use client";

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Pencil, Trash2, Copy, PowerOff } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { Connection, SavedConnection, Settings, QueryTab, DbType } from "./types";
// import { SETTINGS_DEFAULTS } from "./types"; // Wait, I didn't export defaults there. Constants? No, Defaults were in page.tsx 
// I need to verify where SETTINGS_DEFAULTS went. I missed moving it!
// I will define it here for now or fix types.ts?
// Let's check types.ts content... I didn't verify if I put defaults there. I likely didn't.
// I will define defaults here.

import { ActivityBar } from "./components/ActivityBar";
import { StatusBar } from "./components/StatusBar";
import { Sidebar } from "./components/Sidebar";
// Unused ConfirmDialog removed
import { DebugTerminal, LogEntry } from "./components/DebugTerminal";
import { SettingsView } from "./components/SettingsView";
import { ConnectionModal } from "./components/ConnectionModal";
import { QueryEditor } from "./components/QueryEditor";

const SETTINGS_DEFAULTS: Settings = {
  appearance: {
    theme: 'dark',
    font_size: 'medium',
    editor_font: 'JetBrains Mono, Consolas, monospace',
  },
  query: {
    auto_limit: 100,
    timeout_seconds: 30,
    auto_format: false,
  },
  connection: {
    auto_connect_on_startup: false,
    connection_timeout_seconds: 10,
    keep_alive_interval_seconds: 60,
  },
  export: {
    default_format: 'csv',
    csv_delimiter: ',',
    include_headers: true,
  },
  advanced: {
    enable_debug_logs: false,
    cache_table_list: true,
    max_cached_connections: 5,
  },
};

export default function Home() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConnName, setActiveConnName] = useState<string | null>(null);

  // Tab State
  const [tabs, setTabs] = useState<QueryTab[]>([
    {
      id: '1',
      title: 'Query 1',
      query: 'SELECT * FROM sys.tables',
      results: null,
      error: null,
      connName: null,
      isExecuting: false,
      viewType: 'query'
    }
  ]);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const [activeTabId, setActiveTabId] = useState<string>('1');

  // Global Error State
  // const [globalError, setGlobalError] = useState<string | null>(null); // Removed since unused

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConnName, setEditingConnName] = useState<string | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, name: string, type: 'connection' | 'table' } | null>(null);

  // Activity Bar State
  const [activeView, setActiveView] = useState('database');
  const [expandedPanes, setExpandedPanes] = useState({ connections: true, explorer: true });

  // Table List State
  const [tables, setTables] = useState<Record<string, string[]>>({});
  const [views, setViews] = useState<Record<string, string[]>>({});
  const [functions, setFunctions] = useState<Record<string, string[]>>({});
  const [schemas, setSchemas] = useState<Record<string, string[]>>({});
  const [selectedSchema, setSelectedSchema] = useState<Record<string, string>>({}); // connName -> schema
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  // Console Capture
  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const formatArgs = (args: unknown[]) => {
      return args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
    };

    const addLog = (type: 'log' | 'warn' | 'error', args: unknown[]) => {
      const message = formatArgs(args);
      const timestamp = new Date().toLocaleTimeString();
      setLogs(prev => [...prev.slice(-100), { type, message, timestamp }]); // Keep last 100
    };

    console.log = (...args) => {
      originalLog(...args);
      addLog('log', args);
    };

    console.warn = (...args) => {
      originalWarn(...args);
      addLog('warn', args);
    };

    console.error = (...args) => {
      originalError(...args);
      addLog('error', args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);
  // Settings State
  const [settings, setSettings] = useState<Settings>(SETTINGS_DEFAULTS);

  // Sidebar Resize State
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);

  // Resize Handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX - 48; // Subtract activity bar width
      if (newWidth >= 150 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };
  }, [isResizing]);

  // Close context menu on click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // Load connections on startup
  useEffect(() => {
    invoke<SavedConnection[]>("load_connections")
      .then(saved => {
        const mapped = saved.map(s => ({
          name: s.name,
          url: s.url,
          type: s.conn_type as DbType,
          color: s.color,
          status: 'disconnected' as const
        }));
        setConnections(mapped);

        // Auto-connect if enabled
        invoke<Settings>("load_settings").then(s => {
          if (s.connection.auto_connect_on_startup && mapped.length > 0) {
            const firstConn = mapped[0];
            invoke("connect_db", { name: firstConn.name, url: firstConn.url })
              .then(() => {
                setConnections(prev => prev.map(c =>
                  c.name === firstConn.name ? { ...c, status: 'connected' } : c
                ));
                setActiveConnName(firstConn.name);
              })
              .catch(err => console.error("Auto-connect failed:", err));
          }
        });
      })
      .catch(e => {
        console.error("Failed to load connections:", e);
        console.error("Failed to load connections:", e);
        // setGlobalError(`Load error: ${e}`); // Removed unused variable
      });
  }, []);

  // Load settings on startup
  useEffect(() => {
    invoke<Settings>("load_settings")
      .then(s => setSettings(s))
      .catch(e => console.error("Failed to load settings:", e));
  }, []);

  // Fetch schemas and tables logic
  const refreshTables = async () => {
    if (!activeConnName) return;
    const conn = connections.find(c => c.name === activeConnName);
    if (conn?.status !== 'connected') return;

    const currentSchema = selectedSchema[activeConnName];
    console.log("Refreshing tables for", activeConnName, "schema:", currentSchema);

    try {
      const fetchedTables = await invoke<string[]>("get_tables", { name: activeConnName, schema: currentSchema || null });
      setTables(prev => ({ ...prev, [activeConnName]: fetchedTables }));

      const fetchedViews = await invoke<string[]>("get_views", { name: activeConnName, schema: currentSchema || null });
      setViews(prev => ({ ...prev, [activeConnName]: fetchedViews }));

      const fetchedFunctions = await invoke<string[]>("get_functions", { name: activeConnName, schema: currentSchema || null });
      setFunctions(prev => ({ ...prev, [activeConnName]: fetchedFunctions }));

      if (!schemas[activeConnName]) {
        const fetchedSchemas = await invoke<string[]>("get_schemas", { name: activeConnName });
        setSchemas(prev => ({ ...prev, [activeConnName]: fetchedSchemas }));

        // Auto-select schema logic
        if (!currentSchema && fetchedSchemas.length > 0) {
          let defaultSchema = 'public';
          if (fetchedSchemas.includes('dbo')) defaultSchema = 'dbo'; // MSSQL default
          else if (!fetchedSchemas.includes('public')) defaultSchema = fetchedSchemas[0];

          setSelectedSchema(prev => ({ ...prev, [activeConnName]: defaultSchema }));
        }
      }
    } catch (e) {
      console.error("Failed to refresh tables:", e);
    }
  };

  useEffect(() => {
    refreshTables();
  }, [activeConnName, selectedSchema, connections]); // Added connections to dependency to retry if status changes

  async function saveConnectionsToBackend(newConnections: Connection[]) {
    const saved: SavedConnection[] = newConnections.map(c => ({
      name: c.name,
      url: c.url,
      conn_type: c.type,
      color: c.color
    }));
    await invoke("save_connections", { connections: saved });
  }

  async function handleConnectionSaved(newConn: Connection) {
    const updatedConns = editingConnName
      ? connections.map(c => c.name === editingConnName ? { ...newConn, status: c.status } : c)
      : [...connections, newConn];

    setConnections(updatedConns);
    await saveConnectionsToBackend(updatedConns);

    // If connected, update status (assuming modal handles connectivity check separately, 
    // but here we just blindly trust it's disconnected until we connect).
    // Actually previous logic: handleConnect did both.
    // ConnectionModal returns a connection object.
    // If logic requires immediate connect, we should do it.
    // The old handleConnect did: invoke connect_db -> update state -> save.
    // Now ConnectionModal handleSave calls `onSave`.
    // Let's assume we maintain the behavior: check isModalOpen logic. 
    // ConnectionModal calls onSave then onClose.

    // Wait, ConnectionModal's handleSave just emits the object! It doesn't connect!
    // But the previous `handleConnect` DID connect.
    // I should invoke connect_db here if desired, OR let the user click "Connect" in sidebar.
    // The previous UX: "Connect" button in modal -> Connects AND Saves.
    // So I should connect here.

    try {
      await invoke("connect_db", { name: newConn.name, url: newConn.url });
      // Update status to connected
      const connectedConns = updatedConns.map(c => c.name === newConn.name ? { ...c, status: 'connected' as const } : c);
      setConnections(connectedConns);
      setActiveConnName(newConn.name);
    } catch (e) {
      console.error("Failed to connect after save:", e);
      // Just save as disconnected
      console.error("Failed to connect after save:", e);
      // setGlobalError(`Saved but failed to connect: ${e}`); // Removed unused variable
    }
  }

  async function handleDisconnect(name: string) {
    try {
      await invoke("disconnect_db", { name });
      const updated = connections.map(c =>
        c.name === name ? { ...c, status: 'disconnected' } as Connection : c
      );
      setConnections(updated);
      await saveConnectionsToBackend(updated);
    } catch (e) {
      console.error("Failed to disconnect:", e);
    }
  }

  async function handleDeleteConnection(name: string) {
    const updated = connections.filter(c => c.name !== name);
    setConnections(updated);
    if (activeConnName === name) setActiveConnName(null);
    await saveConnectionsToBackend(updated);
  }

  function handleEditConnection(name: string) {
    setEditingConnName(name);
    setIsModalOpen(true);
  }

  function handleContextMenu(e: React.MouseEvent, name: string, type: 'connection' | 'table') {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, name, type });
  }

  function handleNewQueryFromContext(tableName: string) {
    createNewTab(`Query: ${tableName}`, `SELECT * FROM ${tableName}`, activeConnName, false, 'query');
    setContextMenu(null);
  }

  async function handleDuplicate(name: string) {
    const conn = connections.find(c => c.name === name);
    if (!conn) return;
    let newName = `${conn.name} (Copy)`;
    let counter = 1;
    while (connections.some(c => c.name === newName)) {
      counter++;
      newName = `${conn.name} (Copy ${counter})`;
    }
    const newConn: Connection = { ...conn, name: newName, status: 'disconnected' };
    const updated = [...connections, newConn];
    setConnections(updated);
    await saveConnectionsToBackend(updated);
  }

  async function connectConnection(name?: string) {
    const targetName = name || activeConnName;
    if (!targetName) return;

    // ... (rest of logic same but using targetName)
    try {
      const conn = connections.find(c => c.name === targetName);
      if (!conn) return;

      // Optimistic update
      setConnections(prev => prev.map(c => c.name === targetName ? { ...c, status: 'connected' } : c));

      await invoke("connect_db", { url: conn.url, name: targetName });
      console.log(`Connected to ${targetName} successfully.`);
      // Make sure it's active if we clicked connect on a non-active one
      if (name && name !== activeConnName) {
        setActiveConnName(name);
      }
    } catch (e: unknown) {
      setConnections(prev => prev.map(c => c.name === targetName ? { ...c, status: 'error', error: String(e) } : c));
      console.error(`Failed to connect to ${targetName}:`, e);
    }
  }

  async function runQuery(tabIdToRun?: string) {
    const targetTabId = tabIdToRun || activeTabId;
    const tab = tabsRef.current.find(t => t.id === targetTabId);
    if (!tab) return;

    const targetConnName = tab.connName || activeConnName;
    if (!targetConnName) return;

    setTabs(prev => prev.map(t => t.id === targetTabId ? { ...t, isExecuting: true, error: null } : t));

    let finalSql = tab.query;
    if (settings.query.auto_limit > 0 && tab.query.trim().toUpperCase().startsWith('SELECT')) {
      if (!tab.query.toUpperCase().includes('LIMIT') && !tab.query.toUpperCase().includes('TOP')) {
        const conn = connections.find(c => c.name === targetConnName);
        if (conn?.type === 'mssql') {
          finalSql = `SELECT TOP ${settings.query.auto_limit} * FROM (${tab.query}) AS subqb`;
        } else {
          finalSql = `${tab.query.trim()} LIMIT ${settings.query.auto_limit}`;
        }
      }
    }

    try {
      const res = await invoke<{ columns: string[]; rows: unknown[][] }>("execute_query", {
        name: targetConnName,
        sql: finalSql,
      });
      console.log(`Query executed successfully: ${finalSql}\nRows affected: ${res.rows.length}`);
      setTabs(prev => prev.map(t => t.id === targetTabId ? { ...t, results: res, isExecuting: false } : t));
    } catch (e: unknown) {
      console.error(`Query failed: ${finalSql}\nError: ${String(e)}`);
      setTabs(prev => prev.map(t => t.id === targetTabId ? { ...t, error: String(e), isExecuting: false } : t));
    }
  }

  async function executeUpdate(connName: string, sql: string, tabId: string) {
    console.log("Executing Update SQL:", sql);
    try {
      await invoke("execute_query", {
        name: connName,
        sql: sql
      });
      console.log(`Update executed successfully.`);
      // Refresh the data
      await runQuery(tabId);
    } catch (e: unknown) {
      // setGlobalError(`Update/Delete failed: ${e.toString()}`); // Removed unused variable
      console.error(`Update failed SQL: ${sql}\nError: ${String(e)}`);
    }
  }

  function formatSqlValue(val: unknown, dbType: string): string {
    if (val === null) return "NULL";
    if (typeof val === 'boolean') {
      if (dbType === 'mssql') return val ? '1' : '0';
      return val ? 'TRUE' : 'FALSE';
    }
    if (typeof val === 'number') return `${val}`;
    if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
    if (typeof val === 'object') {
      // Simple serialization for now, unlikely to match perfectly for complex types
      return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    }
    return `'${String(val).replace(/'/g, "''")}'`;
  }

  function constructWhereClause(row: unknown[], columns: string[], dbType: string) {
    return columns.map((col, i) => {
      const val = row[i];
      if (val === null) return `${col} IS NULL`;
      const formatted = formatSqlValue(val, dbType);
      return `${col} = ${formatted}`;
    }).join(' AND ');
  }

  function deleteRow(tabId: string, row: unknown[], columns: string[]) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.tableName || !tab.connName) return;

    const conn = connections.find(c => c.name === tab.connName);
    const dbType = conn?.type || 'postgres';

    const schemaPrefix = tab.schema ? `${tab.schema}.` : '';
    const tableRef = `${schemaPrefix}${tab.tableName}`;
    const whereClause = constructWhereClause(row, columns, dbType);

    const sql = `DELETE FROM ${tableRef} WHERE ${whereClause}`;
    executeUpdate(tab.connName, sql, tabId);
  }

  function updateCell(tabId: string, row: unknown[], columns: string[], colIndex: number, newValue: unknown) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.tableName || !tab.connName) return;

    const conn = connections.find(c => c.name === tab.connName);
    const dbType = conn?.type || 'postgres';

    const schemaPrefix = tab.schema ? `${tab.schema}.` : '';
    const tableRef = `${schemaPrefix}${tab.tableName}`;
    const whereClause = constructWhereClause(row, columns, dbType);

    const colName = columns[colIndex];
    // Try to determine best format for newValue based on original value type if possible, or just quote string
    // If original was number, and newValue is string that looks like number?
    // But input always returns string.
    // Heuristic: If old value was number, and new value is number-like, treat as number.
    // If old value was boolean, literal true/false/1/0.

    const originalValue = row[colIndex];
    let finalValue = newValue;

    if (typeof originalValue === 'number' && typeof newValue === 'string' && !isNaN(Number(newValue))) {
      if (newValue.trim() === '') finalValue = null;
      else finalValue = Number(newValue);
    } else if (typeof originalValue === 'boolean') {
      // Convert string "true"/"false" to boolean
      if (String(newValue).toLowerCase() === 'true') finalValue = true;
      else if (String(newValue).toLowerCase() === 'false') finalValue = false;
      else if (newValue === '1') finalValue = true;
      else if (newValue === '0') finalValue = false;
    }

    const valStr = formatSqlValue(finalValue, dbType);

    const sql = `UPDATE ${tableRef} SET ${colName} = ${valStr} WHERE ${whereClause}`;
    executeUpdate(tab.connName, sql, tabId);
  }

  function createNewTab(title: string = "New Query", query: string = "", connName: string | null = null, autoRun: boolean = false, viewType: 'data' | 'query' = 'query', tableName?: string, schema?: string) {
    const newId = crypto.randomUUID();
    const newTab: QueryTab = {
      id: newId,
      title,
      query,
      results: null,
      error: null,
      connName: connName || activeConnName,
      isExecuting: false,
      viewType,
      tableName,
      schema
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);

    if (autoRun && (connName || activeConnName)) {
      setTimeout(() => runQuery(newId), 50);
    }
  }

  function closeTab(e: React.MouseEvent, id: string) {
    if (e) e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) {
      setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : "");
    }
  }

  function closeAllTabs() {
    setTabs([]);
    setActiveTabId("");
  }

  function closeTabsToRight(id: string) {
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    const newTabs = tabs.slice(0, index + 1);
    setTabs(newTabs);

    // If active tab was closed (i.e., its index was > index), set active to the current tab (id)
    const activeIndex = tabs.findIndex(t => t.id === activeTabId);
    if (activeIndex > index) {
      setActiveTabId(id);
    }
  }

  function updateActiveTabQuery(newQuery: string) {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, query: newQuery } : t));
  }

  function handleSort(colName: string) {
    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId) return t;
      const currentSort = t.sortState;
      let newSort: { col: string; dir: 'asc' | 'desc' } = { col: colName, dir: 'asc' };
      if (currentSort && currentSort.col === colName && currentSort.dir === 'asc') {
        newSort.dir = 'desc';
      }
      return { ...t, sortState: newSort };
    }));
  }

  function handleTableClick(tableName: string) {
    const currentSchema = activeConnName ? selectedSchema[activeConnName] : null;
    const tableRef = currentSchema ? `${currentSchema}.${tableName}` : tableName;
    createNewTab(tableName, `SELECT * FROM ${tableRef}`, activeConnName, true, 'data', tableName, currentSchema || undefined);
  }

  return (
    <div className={cn(
      "h-screen overflow-hidden flex flex-col bg-page-bg text-text-main transition-colors duration-200",
      settings.appearance.theme === 'dark' ? "dark" : (settings.appearance.theme === 'light' ? "light" : ""),
      `font-size-${settings.appearance.font_size}`
    )}>
      <div className="flex-1 flex overflow-hidden">
        <ActivityBar activeView={activeView} setActiveView={setActiveView} />

        {activeView === 'database' && (
          <Sidebar
            sidebarWidth={sidebarWidth}
            connections={connections}
            activeConnName={activeConnName}
            expandedPanes={expandedPanes}
            setExpandedPanes={setExpandedPanes}
            setActiveConnName={setActiveConnName}
            setEditingConnName={setEditingConnName}
            setIsModalOpen={setIsModalOpen}
            handleContextMenu={handleContextMenu}
            schemas={schemas}
            selectedSchema={selectedSchema}
            setSelectedSchema={setSelectedSchema}
            tables={tables}
            views={views}
            functions={functions}
            handleTableClick={handleTableClick}
            createNewTab={createNewTab}
            setIsResizing={setIsResizing}
            onConnect={connectConnection}
            onRefreshTables={refreshTables}
          />
        )}

        {activeView === 'settings' && (
          <SettingsView
            sidebarWidth={sidebarWidth}
            settings={settings}
            setSettings={async (newSettings) => {
              setSettings(newSettings);
              // Auto-save logic was in component, but saving to backend:
              await invoke("save_settings", { settings: newSettings });
            }}
            setIsResizing={setIsResizing}
          />
        )}

        {activeView === 'info' && (
          <div style={{ width: sidebarWidth }} className="bg-panel-bg border-r border-border-main p-4 text-text-muted text-sm space-y-4 relative flex-shrink-0">
            <h2 className="font-bold text-text-main flex items-center gap-2">INFO</h2>
            <div className="space-y-1">
              <p>Database Manager</p>
              <p className="text-xs opacity-70">v0.1.1-alpha</p>
            </div>
            {/* Resize Handle */}
            <div
              onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-10"
            />
          </div>
        )}

        <QueryEditor
          tabs={tabs}
          activeTabId={activeTabId}
          setActiveTabId={setActiveTabId}
          closeTab={closeTab}
          createNewTab={createNewTab}
          activeConnName={activeConnName}
          connections={connections}
          runQuery={runQuery}
          updateActiveTabQuery={updateActiveTabQuery}
          handleSort={handleSort}
          settings={settings}
          onCloseAll={closeAllTabs}
          onCloseToRight={closeTabsToRight}
          onDeleteRow={deleteRow}
          onUpdateCell={updateCell}
        />
      </div>

      <DebugTerminal
        isOpen={isTerminalOpen}
        logs={logs}
        onClose={() => setIsTerminalOpen(false)}
        onClear={() => setLogs([])}
      />

      <StatusBar
        activeConnName={activeConnName}
        connections={connections}
        setActiveView={setActiveView}
        isTerminalOpen={isTerminalOpen}
        onToggleTerminal={() => setIsTerminalOpen(prev => !prev)}
      />

      {/* Context Menu - Floating, can stay here or move to Sidebar */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-panel-bg border border-border-main rounded shadow-xl py-1 w-32 flex flex-col"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.type === 'connection' && (
            <>
              <button onClick={() => handleEditConnection(contextMenu.name)} className="text-left px-3 py-1.5 text-xs text-text-muted hover:bg-item-bg hover:text-text-main flex items-center gap-2">
                <Pencil className="w-3 h-3" /> Edit
              </button>
              <button onClick={() => handleDuplicate(contextMenu.name)} className="text-left px-3 py-1.5 text-xs text-text-muted hover:bg-item-bg hover:text-text-main flex items-center gap-2">
                <Copy className="w-3 h-3" /> Duplicate
              </button>
              <div className="h-px bg-border-main my-1" />
              <button onClick={() => handleDisconnect(contextMenu.name)} className="text-left px-3 py-1.5 text-xs text-orange-400 hover:bg-orange-500/10 flex items-center gap-2">
                <PowerOff className="w-3 h-3" /> Disconnect
              </button>
              <button onClick={() => handleDeleteConnection(contextMenu.name)} className="text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 flex items-center gap-2">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </>
          )}
          {contextMenu.type === 'table' && (
            <button onClick={() => handleNewQueryFromContext(contextMenu.name)} className="text-left px-3 py-1.5 text-xs text-text-muted hover:bg-item-bg hover:text-text-main flex items-center gap-2">
              <Pencil className="w-3 h-3" /> New Query
            </button>
          )}
        </div>
      )}

      {/* Connection Modal */}
      <ConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleConnectionSaved}
        editingConnection={editingConnName ? connections.find(c => c.name === editingConnName) || null : null}
        existingConnections={connections}
      />
    </div>
  );
}
