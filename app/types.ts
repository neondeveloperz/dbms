export type DbType = 'mssql' | 'mysql' | 'postgres' | 'mongodb' | 'redis';

export type Connection = {
    name: string;
    url: string;
    type: DbType;
    color: string;
    status: 'connected' | 'disconnected' | 'error';
    error?: string;
};

export type SavedConnection = {
    name: string;
    url: string;
    conn_type: string;
    color: string;
};

export type Settings = {
    appearance: {
        theme: string;
        font_size: string;
        editor_font: string;
    };
    query: {
        auto_limit: number;
        timeout_seconds: number;
        auto_format: boolean;
    };
    connection: {
        auto_connect_on_startup: boolean;
        connection_timeout_seconds: number;
        keep_alive_interval_seconds: number;
    };
    export: {
        default_format: string;
        csv_delimiter: string;
        include_headers: boolean;
    };
    advanced: {
        enable_debug_logs: boolean;
        cache_table_list: boolean;
        max_cached_connections: number;
    };
};

export type QueryTab = {
    id: string;
    title: string;
    query: string;
    results: { columns: string[]; rows: any[][] } | null;
    error: string | null;
    connName: string | null;
    isExecuting: boolean;
    sortState?: { col: string; dir: 'asc' | 'desc' };
    viewType: 'data' | 'query';
    tableName?: string;
    schema?: string;
};
