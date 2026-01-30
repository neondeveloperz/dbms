"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Pencil, Trash2, Copy, PowerOff, Database, Plus, RefreshCw } from "lucide-react";
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
import { ConfirmDialog } from "./components/ConfirmDialog";
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
  const [databases, setDatabases] = useState<Record<string, string[]>>({});
  const [selectedDatabase, setSelectedDatabase] = useState<Record<string, string>>({}); // connName -> dbName
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

  // Update Checker State
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateDialog, setUpdateDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, title: "", message: "" });

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
    const handleClick = () => {
      setContextMenu(null);
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // Load connections function
  const loadConnections = useCallback(() => {
    invoke<SavedConnection[]>("load_connections")
      .then(saved => {
        const mapped = saved.map(s => ({
          name: s.name,
          url: s.url,
          type: s.conn_type as DbType,
          color: s.color,
          status: 'disconnected' as const
        }));

        // Preserve status of currently connected/connecting items if they exist in new list
        setConnections(prev => {
          return mapped.map(newConn => {
            const existing = prev.find(p => p.name === newConn.name);
            if (existing && (existing.status === 'connected' || existing.status === 'connecting')) {
              return { ...newConn, status: existing.status };
            }
            return newConn;
          });
        });

        // Auto-connect if enabled (only on initial load effectively, but logic here runs every time)
        // We probably only want auto-connect once.
        // Let's keep auto-connect separate or check if we have no connections yet?
        // Actually, if we refresh, we don't want to re-trigger auto-connect if already connected.
        // But for simplicity, existing logic was fine for startup.
        // Refactored to just set state. Auto-connect logic should be separate useEffect or handled differently.
        // For now, I'll keep the mapping simple and handled start-up separately if needed.
        // But wait, the original effect handled auto-connect too.
      })
      .catch(e => {
        console.error("Failed to load connections:", e);
      });
  }, []);

  // Initial load
  useEffect(() => {
    // We duplicate logic here for startup to include auto-connect which we don't want on manual refresh
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
            setConnections(prev => prev.map(c => c.name === firstConn.name ? { ...c, status: 'connecting' } : c));
            invoke("connect_db", { name: firstConn.name, url: firstConn.url })
              .then(() => {
                setConnections(prev => prev.map(c =>
                  c.name === firstConn.name ? { ...c, status: 'connected' } : c
                ));
                setActiveConnName(firstConn.name);
              })
              .catch(err => {
                console.error("Auto-connect failed:", err);
                setConnections(prev => prev.map(c => c.name === firstConn.name ? { ...c, status: 'error', error: String(err) } : c));
              });
          }
        });
      });
  }, []);

  const handleDatabaseChange = async (connName: string, dbName: string) => {
    const conn = connections.find(c => c.name === connName);
    if (!conn) return;

    console.log(`Switching database for ${connName} to ${dbName}`);

    try {
      // Construct new URL with selected database
      let newUrl = conn.url;
      try {
        // Basic URL parsing to replace database path
        // This works for standard connection strings like postgres://u:p@h:p/db
        const urlObj = new URL(conn.url);

        // Handle MSSQL specially if it uses searchParams for database, though our backend parser uses path
        if (conn.url.startsWith('sqlserver://')) {
          if (urlObj.searchParams.has('database')) {
            urlObj.searchParams.set('database', dbName);
          } else {
            urlObj.pathname = `/${dbName}`;
          }
        } else {
          urlObj.pathname = `/${dbName}`;
        }
        newUrl = urlObj.toString();
      } catch (e) {
        console.error("Failed to parse URL for database switch:", e);
        // Fallback? If we can't parse, we can't reliably switch.
        return;
      }

      // Connect with new URL (Backend will replace existing connection for this name)
      await invoke("connect_db", { name: connName, url: newUrl });

      // Update local state
      setConnections(prev => prev.map(c => c.name === connName ? { ...c, url: newUrl } : c));
      setSelectedDatabase(prev => ({ ...prev, [connName]: dbName }));

      // Clear caches for this connection as we are in a new DB
      setSchemas(prev => { const n = { ...prev }; delete n[connName]; return n; });
      setTables(prev => { const n = { ...prev }; delete n[connName]; return n; });
      setViews(prev => { const n = { ...prev }; delete n[connName]; return n; });
      setFunctions(prev => { const n = { ...prev }; delete n[connName]; return n; });

      // Refresh to get new tables
      // We need to wait a bit or just call refreshTables?
      // We set selectedDatabase, logic in refreshTables needs to know.
      // But refreshTables reads state. State update is async.
      // We can force refresh with the new DB set in a timeout or pass it explicitly?
      // Better: trigger a refresh effect or just call a modified refresh.
      // Simplest: Just call refreshTables, but state might not be ready.
      // Actually, we cleared cache, so Sidebar might trigger refresh?
      // Sidebar "Refresh" button calls onRefreshTables.
      // Let's just manually trigger data fetch sequence here.

      // Re-fetch everything
      setTimeout(() => {
        // We use a small timeout to let React flush state (like selectedDatabase if we used it, but here we passed dbName)
        // actually refreshTables uses `selectedSchema`. It relies on `activeConnName`.
        // If we are switching DB, we probably want to reset schema to default '*' or public.
        setSelectedSchema(prev => { const n = { ...prev }; delete n[connName]; return n; });
        refreshTables();
      }, 100);

    } catch (e) {
      console.error("Failed to switch database:", e);
    }
  };

  // Load settings on startup
  useEffect(() => {
    invoke<Settings>("load_settings")
      .then(s => setSettings(s))
      .catch(e => console.error("Failed to load settings:", e));
  }, []);

  // Fetch schemas and tables logic
  const refreshTables = useCallback(async () => {
    if (!activeConnName) return;
    const conn = connections.find(c => c.name === activeConnName);
    if (conn?.status !== 'connected') return;

    // Fetch Databases if not present
    if (!databases[activeConnName]) {
      try {
        const fetchedDbs = await invoke<string[]>("get_databases", { name: activeConnName });
        setDatabases(prev => ({ ...prev, [activeConnName]: fetchedDbs }));

        // Try to deduce current DB from URL if selectedDatabase not set
        if (!selectedDatabase[activeConnName]) {
          try {
            const urlObj = new URL(conn.url);
            const pathDb = urlObj.pathname.replace('/', '');
            if (pathDb) setSelectedDatabase(prev => ({ ...prev, [activeConnName]: pathDb }));
            // If no pathDb (e.g. root), maybe don't set or set to first?
          } catch { }
        }
      } catch (e) {
        console.error("Failed to fetch databases:", e);
      }
    }

    const currentSchema = selectedSchema[activeConnName] || '*';
    console.log("refreshTables called. Active Conn:", activeConnName, "Status:", conn?.status, "Schema:", currentSchema);
    try {
      const fetchedTables = await invoke<string[]>("get_tables", { name: activeConnName, schema: currentSchema });
      setTables(prev => ({ ...prev, [activeConnName]: fetchedTables }));

      const fetchedViews = await invoke<string[]>("get_views", { name: activeConnName, schema: currentSchema });
      setViews(prev => ({ ...prev, [activeConnName]: fetchedViews }));

      const fetchedFunctions = await invoke<string[]>("get_functions", { name: activeConnName, schema: currentSchema });
      setFunctions(prev => ({ ...prev, [activeConnName]: fetchedFunctions }));

      if (!schemas[activeConnName]) {
        const fetchedSchemas = await invoke<string[]>("get_schemas", { name: activeConnName });
        setSchemas(prev => ({ ...prev, [activeConnName]: fetchedSchemas }));

        // Auto-select schema logic
        if (!selectedSchema[activeConnName]) {
          // Default to All Schemas (*)
          setSelectedSchema(prev => ({ ...prev, [activeConnName]: '*' }));
        }
      }
    } catch (e) {
      console.error("Failed to refresh tables:", e);
    }
  }, [activeConnName, connections, databases, selectedDatabase, schemas, selectedSchema]);

  useEffect(() => {
    refreshTables();
  }, [activeConnName, selectedSchema, connections, refreshTables]);

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



  function handleAddRow(tabId: string) {
    setTabs(prev => prev.map(t => t.id === tabId ? {
      ...t,
      isAddingRow: true,
      newRowData: {} // Initialize empty
    } : t));
  }

  function handleCancelAddRow(tabId: string) {
    setTabs(prev => prev.map(t => t.id === tabId ? {
      ...t,
      isAddingRow: false,
      newRowData: undefined
    } : t));
  }

  function handleUpdateNewRowData(tabId: string, colName: string, value: unknown) {
    setTabs(prev => prev.map(t => t.id === tabId ? {
      ...t,
      newRowData: { ...(t.newRowData || {}), [colName]: value }
    } : t));
  }

  async function handleSaveNewRow(tabId: string) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.tableName || !tab.connName || !tab.newRowData) return;

    const conn = connections.find(c => c.name === tab.connName);
    const dbType = conn?.type || 'postgres';

    const schemaPrefix = tab.schema ? `${tab.schema}.` : '';
    const tableRef = `${schemaPrefix}${tab.tableName}`;

    const columns = Object.keys(tab.newRowData);
    if (columns.length === 0) {
      handleCancelAddRow(tabId);
      return;
    }

    const colsStr = columns.join(', ');
    const valsStr = columns.map(col => formatSqlValue(tab.newRowData![col], dbType)).join(', ');

    const sql = `INSERT INTO ${tableRef} (${colsStr}) VALUES (${valsStr})`;

    await executeUpdate(tab.connName, sql, tabId);

    // Reset state after save
    setTabs(prev => prev.map(t => t.id === tabId ? {
      ...t,
      isAddingRow: false,
      newRowData: undefined
    } : t));
  }

  function handleAddRowFromSidebar(tableName: string) {
    const currentSchema = activeConnName ? selectedSchema[activeConnName] : null;
    const schemaArg = (currentSchema && currentSchema !== '*') ? currentSchema : undefined;

    // 1. Find or create the data tab
    const existingTab = tabs.find(t =>
      t.viewType === 'data' &&
      t.tableName === tableName &&
      t.connName === activeConnName &&
      (schemaArg ? t.schema === schemaArg : true)
    );

    if (existingTab) {
      setActiveTabId(existingTab.id);
      handleAddRow(existingTab.id);
    } else {
      // Open the tab, but we can't easily trigger handleAddRow until it's loaded.
      // For now, just opening the tab is a good first step, user can click Add Row in the results pane.
      handleTableClick(tableName);
    }
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

      // Set to connecting state
      setConnections(prev => prev.map(c => c.name === targetName ? { ...c, status: 'connecting' } : c));

      await invoke("connect_db", { url: conn.url, name: targetName });
      console.log(`Connected to ${targetName} successfully.`);

      // Update to connected
      setConnections(prev => prev.map(c => c.name === targetName ? { ...c, status: 'connected', error: undefined } : c));

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
    // If original was number, and new value is number-like, treat as number.
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
      const newDir = (t.sortState && t.sortState.col === colName && t.sortState.dir === 'asc') ? 'desc' : 'asc';
      return { ...t, sortState: { col: colName, dir: newDir } };
    }));
  }

  const constructSelectQuery = (tableName: string, dbType: DbType, limit: number, offset: number, schema?: string) => {
    const tableRef = (schema && schema !== '*') ? `${schema}.${tableName}` : tableName;

    switch (dbType) {
      case 'mssql':
        return `SELECT * FROM ${tableRef} ORDER BY (SELECT NULL) OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
      case 'mysql':
      case 'postgres':
      default:
        return `SELECT * FROM ${tableRef} LIMIT ${limit} OFFSET ${offset}`;
    }
  };

  const handleLoadMore = async (tabId: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id === tabId && t.pagination && !t.pagination.isLoading && t.pagination.hasMore) {
        return { ...t, pagination: { ...t.pagination, isLoading: true } };
      }
      return t;
    }));

    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.pagination || !tab.connName || !tab.tableName) return;

    try {
      const conn = connections.find(c => c.name === tab.connName);
      if (!conn) throw new Error("Connection not found");

      const newOffset = tab.pagination.offset + tab.pagination.limit;
      const query = constructSelectQuery(tab.tableName, conn.type, tab.pagination.limit, newOffset, tab.schema);

      const res = await invoke<{ columns: string[]; rows: unknown[][] }>("execute_query", {
        name: tab.connName,
        sql: query
      });

      setTabs(prev => prev.map(t => {
        if (t.id === tabId) {
          return {
            ...t,
            results: {
              columns: t.results?.columns || res.columns,
              rows: [...(t.results?.rows || []), ...res.rows]
            },
            pagination: {
              limit: tab.pagination!.limit,
              offset: newOffset,
              hasMore: res.rows.length === tab.pagination!.limit,
              isLoading: false
            }
          };
        }
        return t;
      }));
    } catch (e) {
      console.error("Failed to load more:", e);
      setTabs(prev => prev.map(t => {
        if (t.id === tabId) {
          return { ...t, pagination: { ...t.pagination!, isLoading: false } };
        }
        return t;
      }));
    }
  };

  async function handleTableClick(tableName: string) {
    const currentSchema = activeConnName ? selectedSchema[activeConnName] : null;

    // Check for existing tab
    const existingTab = tabs.find(t =>
      t.viewType === 'data' &&
      t.tableName === tableName &&
      t.connName === activeConnName &&
      (currentSchema && currentSchema !== '*' ? t.schema === currentSchema : true)
    );

    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    const tableRef = (currentSchema && currentSchema !== '*') ? `${currentSchema}.${tableName}` : tableName;
    const schemaArg = (currentSchema && currentSchema !== '*') ? currentSchema : undefined;

    const limit = 50;
    const offset = 0;
    const conn = connections.find(c => c.name === activeConnName);
    if (!conn) return;

    const initialQuery = constructSelectQuery(tableName, conn.type, limit, offset, schemaArg);

    // Create new tab with loading state immediately
    const newId = crypto.randomUUID();
    const newTab: QueryTab = {
      id: newId,
      title: tableName,
      query: initialQuery,
      results: null,
      error: null,
      connName: activeConnName,
      isExecuting: true,
      viewType: 'data',
      tableName: tableName,
      schema: schemaArg,
      pagination: {
        limit,
        offset,
        hasMore: true,
        isLoading: true
      }
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);

    try {
      // 1. Get Total Count
      const countQuery = `SELECT COUNT(*) as count FROM ${tableRef}`;
      const countRes = await invoke<{ rows: any[][] }>("execute_query", {
        name: activeConnName,
        sql: countQuery
      });
      const totalRows = Number(countRes.rows[0][0]);

      // 2. Get Initial Data
      const dataRes = await invoke<{ columns: string[], rows: unknown[][] }>("execute_query", {
        name: activeConnName,
        sql: initialQuery
      });

      setTabs(prev => prev.map(t => {
        if (t.id === newId) {
          return {
            ...t,
            isExecuting: false,
            results: dataRes,
            totalRows: totalRows,
            pagination: {
              limit,
              offset,
              hasMore: dataRes.rows.length === limit,
              isLoading: false
            }
          };
        }
        return t;
      }));

    } catch (e) {
      console.error("Failed to load table data:", e);
      setTabs(prev => prev.map(t => {
        if (t.id === newId) {
          return {
            ...t,
            isExecuting: false,
            error: e instanceof Error ? e.message : String(e),
            pagination: { ...t.pagination!, isLoading: false }
          };
        }
        return t;
      }));
    }
  }

  async function handleExport(tabId: string, format: string) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.connName) return;

    let filterName = 'Export File';
    let extensions = ['txt'];

    switch (format) {
      case 'json': extensions = ['json']; filterName = 'JSON File'; break;
      case 'jsonl': extensions = ['jsonl', 'ndjson']; filterName = 'JSONL File'; break;
      case 'sql': extensions = ['sql']; filterName = 'SQL File'; break;
      case 'csv': extensions = ['csv']; filterName = 'CSV File'; break;
      case 'csv_semicolon': extensions = ['csv']; filterName = 'CSV File (Semicolon)'; break;
      case 'tsv': extensions = ['tsv']; filterName = 'TSV File'; break;
      case 'excel': extensions = ['xlsx']; filterName = 'Excel File'; break;
      case 'xml': extensions = ['xml']; filterName = 'XML File'; break;
    }

    try {
      const filePath = await save({
        filters: [{
          name: filterName,
          extensions: extensions
        }]
      });

      if (!filePath) return;

      let query = tab.query;
      if (tab.viewType === 'data' && tab.tableName) {
        const schema = tab.schema;
        const fullTableName = schema ? `${schema}.${tab.tableName}` : tab.tableName;
        query = `SELECT * FROM ${fullTableName}`;
      }

      await invoke("export_data", {
        name: tab.connName,
        sql: query,
        format: format,
        path: filePath
      });

      alert("Export successful!");
    } catch (e) {
      console.error("Export failed:", e);
      alert(`Export failed: ${e}`);
    }
  }

  async function handleCheckUpdates() {
    setIsCheckingUpdates(true);
    const CURRENT_VERSION = "0.1.0";
    const GITHUB_REPO = "neondeveloperz/dbms";

    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
      if (!response.ok) throw new Error("Failed to fetch latest release");

      const data = await response.json();
      const latestVersion = data.tag_name.replace(/^v/, "");

      if (latestVersion === CURRENT_VERSION) {
        setUpdateDialog({
          isOpen: true,
          title: "Up to Date",
          message: `You are currently using the latest version (v${CURRENT_VERSION}).`
        });
      } else {
        setUpdateDialog({
          isOpen: true,
          title: "Update Available",
          message: `A new version (v${latestVersion}) is available! Would you like to go to the download page?`,
          confirmText: "Go to Download",
          onConfirm: () => {
            window.open(data.html_url, '_blank', 'noreferrer');
          }
        });
      }
    } catch (e) {
      console.error("Update check failed:", e);
      setUpdateDialog({
        isOpen: true,
        title: "Check Failed",
        message: "Failed to check for updates. Please check your internet connection and try again."
      });
    } finally {
      setIsCheckingUpdates(false);
    }
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
            databases={databases}
            selectedDatabase={selectedDatabase}
            onDatabaseChange={handleDatabaseChange}
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
            onCheckUpdates={handleCheckUpdates}
            isCheckingUpdates={isCheckingUpdates}
            onRefreshConnections={loadConnections}
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
          <div style={{ width: sidebarWidth }} className="bg-panel-bg border-r border-border-main p-4 text-text-muted text-sm space-y-6 relative flex-shrink-0">
            <h2 className="font-bold text-text-main flex items-center gap-2 uppercase tracking-wider">Info</h2>

            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-text-main font-medium">Database Manager</p>
                <p className="text-xs opacity-70">v0.1.0</p>
              </div>

              <div className="pt-4 border-t border-border-main/50 space-y-4">
                <button
                  onClick={handleCheckUpdates}
                  disabled={isCheckingUpdates}
                  className="w-full flex items-center justify-center gap-2 bg-item-bg hover:bg-item-bg-hover text-text-main px-3 py-2 rounded-md text-xs font-medium transition-all group disabled:opacity-50"
                >
                  {isCheckingUpdates ? (
                    <div className="w-3 h-3 border-2 border-text-muted/30 border-t-text-main animate-spin rounded-full" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-text-muted group-hover:text-blue-400 transition-colors" />
                  )}
                  {isCheckingUpdates ? "Checking..." : "Check for Updates"}
                </button>

              </div>
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
          onAddRow={handleAddRow}
          onSaveNewRow={handleSaveNewRow}
          onCancelAddRow={handleCancelAddRow}
          onUpdateNewRowData={handleUpdateNewRowData}
          onLoadMore={handleLoadMore}
          sidebarWidth={sidebarWidth}
          onExport={handleExport}
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
        rowCount={activeTabId ? tabs.find(t => t.id === activeTabId)?.results?.rows.length : undefined}
        totalRows={activeTabId ? tabs.find(t => t.id === activeTabId)?.totalRows : undefined}
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
            <>
              <button onClick={() => handleTableClick(contextMenu.name)} className="text-left px-3 py-1.5 text-xs text-text-muted hover:bg-item-bg hover:text-text-main flex items-center gap-2">
                <Database className="w-3 h-3" /> Open Table
              </button>
              <button onClick={() => handleAddRowFromSidebar(contextMenu.name)} className="text-left px-3 py-1.5 text-xs text-text-muted hover:bg-item-bg hover:text-text-main flex items-center gap-2">
                <Plus className="w-3 h-3" /> Add Row
              </button>
              <div className="h-px bg-border-main my-1" />
              <button onClick={() => handleNewQueryFromContext(contextMenu.name)} className="text-left px-3 py-1.5 text-xs text-text-muted hover:bg-item-bg hover:text-text-main flex items-center gap-2">
                <Pencil className="w-3 h-3" /> New Query
              </button>
            </>
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

      <ConfirmDialog
        isOpen={updateDialog.isOpen}
        title={updateDialog.title}
        message={updateDialog.message}
        confirmText={updateDialog.confirmText}
        onConfirm={() => {
          updateDialog.onConfirm?.();
          setUpdateDialog(prev => ({ ...prev, isOpen: false }));
        }}
        onClose={() => setUpdateDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
