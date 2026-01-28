use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    #[serde(default)]
    pub appearance: AppearanceSettings,
    #[serde(default)]
    pub query: QuerySettings,
    #[serde(default)]
    pub connection: ConnectionSettings,
    #[serde(default)]
    pub export: ExportSettings,
    #[serde(default)]
    pub advanced: AdvancedSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceSettings {
    pub theme: String,     // "light", "dark", "auto"
    pub font_size: String, // "small", "medium", "large"
    pub editor_font: String,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            font_size: "medium".to_string(),
            editor_font: "JetBrains Mono, Consolas, monospace".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuerySettings {
    pub auto_limit: i32, // 0 = no limit
    pub timeout_seconds: i32,
    pub auto_format: bool,
}

impl Default for QuerySettings {
    fn default() -> Self {
        Self {
            auto_limit: 100,
            timeout_seconds: 30,
            auto_format: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionSettings {
    pub auto_connect_on_startup: bool,
    pub connection_timeout_seconds: i32,
    pub keep_alive_interval_seconds: i32,
}

impl Default for ConnectionSettings {
    fn default() -> Self {
        Self {
            auto_connect_on_startup: false,
            connection_timeout_seconds: 10,
            keep_alive_interval_seconds: 60,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSettings {
    pub default_format: String, // "csv", "json", "excel"
    pub csv_delimiter: String,  // ",", ";", "\t"
    pub include_headers: bool,
}

impl Default for ExportSettings {
    fn default() -> Self {
        Self {
            default_format: "csv".to_string(),
            csv_delimiter: ",".to_string(),
            include_headers: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdvancedSettings {
    pub enable_debug_logs: bool,
    pub cache_table_list: bool,
    pub max_cached_connections: i32,
}

impl Default for AdvancedSettings {
    fn default() -> Self {
        Self {
            enable_debug_logs: false,
            cache_table_list: true,
            max_cached_connections: 5,
        }
    }
}

