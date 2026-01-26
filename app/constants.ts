import { DbType } from "./types";

export const DB_DEFAULTS: Record<DbType, { port: number, user: string }> = {
    mssql: { port: 1433, user: 'sa' },
    mysql: { port: 3306, user: 'root' },
    postgres: { port: 5432, user: 'postgres' },
    mongodb: { port: 27017, user: '' },
    redis: { port: 6379, user: '' }
};

export const COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981",
    "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef", "#f43f5e", "#64748b"
];
