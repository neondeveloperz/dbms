pub mod db;
pub mod settings;

use db::{DatabaseState, QueryResponse};
use serde::{Deserialize, Serialize};
use settings::Settings;
use std::fs;
use tauri::{Manager, State};

#[derive(Serialize, Deserialize, Clone)]
pub struct SavedConnection {
    pub name: String,
    pub url: String,
    pub conn_type: String,
    pub color: String,
}

#[tauri::command]
async fn connect_db(
    state: State<'_, DatabaseState>,
    name: String,
    url: String,
) -> Result<String, String> {
    let client = db::create_client(&url).await.map_err(|e| e.to_string())?;
    state
        .connections
        .lock()
        .unwrap()
        .insert(name.clone(), client);
    Ok(format!("Connected to {}", name))
}

#[tauri::command]
async fn disconnect_db(state: State<'_, DatabaseState>, name: String) -> Result<String, String> {
    state
        .connections
        .lock()
        .unwrap()
        .remove(&name)
        .ok_or("Connection not found")?;
    Ok(format!("Disconnected {}", name))
}

#[tauri::command]
async fn test_conn(url: String) -> Result<String, String> {
    db::test_connection(&url).await
}

#[tauri::command]
async fn execute_query(
    state: State<'_, DatabaseState>,
    name: String,
    sql: String,
) -> Result<QueryResponse, String> {
    let client = {
        let pools = state.connections.lock().unwrap();
        pools.get(&name).cloned().ok_or("Connection not found")?
    };

    db::execute_query(&client, sql).await
}

#[tauri::command]
async fn get_schemas(state: State<'_, DatabaseState>, name: String) -> Result<Vec<String>, String> {
    let client = {
        let pools = state.connections.lock().unwrap();
        pools.get(&name).cloned().ok_or("Connection not found")?
    };

    db::get_schemas(&client).await
}

#[tauri::command]
async fn get_databases(
    state: State<'_, DatabaseState>,
    name: String,
) -> Result<Vec<String>, String> {
    let client = {
        let pools = state.connections.lock().unwrap();
        pools.get(&name).cloned().ok_or("Connection not found")?
    };

    db::get_databases(&client).await
}
#[tauri::command]
async fn get_tables(
    state: State<'_, DatabaseState>,
    name: String,
    schema: Option<String>,
) -> Result<Vec<String>, String> {
    let client = {
        let pools = state.connections.lock().unwrap();
        pools.get(&name).cloned().ok_or("Connection not found")?
    };

    db::get_tables(&client, schema).await
}

#[tauri::command]
async fn get_views(
    state: State<'_, DatabaseState>,
    name: String,
    schema: Option<String>,
) -> Result<Vec<String>, String> {
    let client = {
        let pools = state.connections.lock().unwrap();
        pools.get(&name).cloned().ok_or("Connection not found")?
    };

    db::get_views(&client, schema).await
}

#[tauri::command]
async fn get_functions(
    state: State<'_, DatabaseState>,
    name: String,
    schema: Option<String>,
) -> Result<Vec<String>, String> {
    let client = {
        let pools = state.connections.lock().unwrap();
        pools.get(&name).cloned().ok_or("Connection not found")?
    };

    db::get_functions(&client, schema).await
}

#[tauri::command]
async fn save_connections(
    app: tauri::AppHandle,
    connections: Vec<SavedConnection>,
) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("connections.json");
    println!("Saving connections to: {:?}", path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&connections).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("Failed to write to {:?}: {}", path, e))?;
    println!("Successfully saved {} connections", connections.len());
    Ok(())
}

#[tauri::command]
async fn load_connections(app: tauri::AppHandle) -> Result<Vec<SavedConnection>, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("connections.json");
    println!("Loading connections from: {:?}", path);
    if !path.exists() {
        println!("File does not exist");
        return Ok(Vec::new());
    }
    let json =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read {:?}: {}", path, e))?;
    let connections: Vec<SavedConnection> =
        serde_json::from_str(&json).map_err(|e| e.to_string())?;
    println!("Loaded {} connections", connections.len());
    Ok(connections)
}

#[tauri::command]
async fn debug_path(app: tauri::AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("connections.json");
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn load_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("settings.json");

    if !path.exists() {
        return Ok(Settings::default());
    }

    let json = fs::read_to_string(&path).map_err(|e| format!("Failed to read settings: {}", e))?;
    let settings: Settings = serde_json::from_str(&json).unwrap_or_else(|_| Settings::default());
    Ok(settings)
}

#[tauri::command]
async fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("settings.json");

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DatabaseState::default())
        .invoke_handler(tauri::generate_handler![
            connect_db,
            disconnect_db,
            execute_query,
            get_tables,
            get_views,
            get_functions,
            get_schemas,
            get_databases,
            test_conn,
            save_connections,
            load_connections,
            debug_path,
            load_settings,
            save_settings
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
