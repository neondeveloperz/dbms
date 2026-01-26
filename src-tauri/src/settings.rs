use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub appearance: AppearanceSettings,
    pub query: QuerySettings,
    pub connection: ConnectionSettings,
    pub export: ExportSettings,
    pub advanced: AdvancedSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceSettings {
    pub theme: String, // "light", "dark", "auto"
    pub font_size: String, // "small", "medium", "large"
    pub editor_font: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuerySettings {
    pub auto_limit: i32, // 0 = no limit
    pub timeout_seconds: i32,
    pub auto_format: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionSettings {
    pub auto_connect_on_startup: bool,
    pub connection_timeout_seconds: i32,
    pub keep_alive_interval_seconds: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSettings {
    pub default_format: String, // "csv", "json", "excel"
    pub csv_delimiter: String, // ",", ";", "\t"
    pub include_headers: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdvancedSettings {
    pub enable_debug_logs: bool,
    pub cache_table_list: bool,
    pub max_cached_connections: i32,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            appearance: AppearanceSettings {
                theme: "dark".to_string(),
                font_size: "medium".to_string(),
                editor_font: "JetBrains Mono, Consolas, monospace".to_string(),
            },
            query: QuerySettings {
                auto_limit: 100,
                timeout_seconds: 30,
                auto_format: false,
            },
            connection: ConnectionSettings {
                auto_connect_on_startup: false,
                connection_timeout_seconds: 10,
                keep_alive_interval_seconds: 60,
            },
            export: ExportSettings {
                default_format: "csv".to_string(),
                csv_delimiter: ",".to_string(),
                include_headers: true,
            },
            advanced: AdvancedSettings {
                enable_debug_logs: false,
                cache_table_list: true,
                max_cached_connections: 5,
            },
        }
    }
}
