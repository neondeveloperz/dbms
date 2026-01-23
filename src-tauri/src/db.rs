use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::Mutex as AsyncMutex;
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};
use tiberius::{Client, Config};
use serde::{Serialize};
use serde_json::{json, Value};
use url::Url;

// Enum to hold different client types
#[derive(Clone)]
pub enum DbClient {
    Mssql(Arc<AsyncMutex<Client<Compat<TcpStream>>>>),
    Mysql(sqlx::MySqlPool),
    Postgres(sqlx::PgPool),
    Mongo(mongodb::Client),
    Redis(redis::Client),
}

pub struct DatabaseState {
    pub connections: StdMutex<HashMap<String, DbClient>>,
}

impl Default for DatabaseState {
    fn default() -> Self {
        Self {
            connections: StdMutex::new(HashMap::new()),
        }
    }
}

#[derive(Serialize)]
pub struct QueryResponse {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Value>>,
}

pub async fn create_client(conn_str: &str) -> Result<DbClient, String> {
    let url = Url::parse(conn_str).map_err(|e| format!("Invalid URL: {}", e))?;
    let scheme = url.scheme();

    match scheme {
        "sqlserver" => {
            let host = url.host_str().ok_or("Missing host")?;
            let port = url.port().unwrap_or(1433);
            let username = url.username();
            let password = url.password().unwrap_or("");
            let database = url.path().trim_start_matches('/');

            let mut config = Config::new();
            config.host(host);
            config.port(port);
            if !username.is_empty() {
                config.authentication(tiberius::AuthMethod::sql_server(username, password));
            }
            config.trust_cert();
            
            if !database.is_empty() {
                config.database(database);
            }

            let tcp = TcpStream::connect((host, port)).await.map_err(|e| e.to_string())?;
            tcp.set_nodelay(true).map_err(|e| e.to_string())?;

            let client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
            Ok(DbClient::Mssql(Arc::new(AsyncMutex::new(client))))
        },
        "mysql" | "mariadb" => {
             let pool = sqlx::MySqlPool::connect(conn_str).await.map_err(|e| e.to_string())?;
             Ok(DbClient::Mysql(pool))
        },
        "postgres" | "postgresql" => {
             let pool = sqlx::PgPool::connect(conn_str).await.map_err(|e| e.to_string())?;
             Ok(DbClient::Postgres(pool))
        },
        "mongodb" => {
            let client_options = mongodb::options::ClientOptions::parse(conn_str).await.map_err(|e| e.to_string())?;
            let client = mongodb::Client::with_options(client_options).map_err(|e| e.to_string())?;
            Ok(DbClient::Mongo(client))
        },
        "redis" => {
            let client = redis::Client::open(conn_str).map_err(|e| e.to_string())?;
            Ok(DbClient::Redis(client))
        },
        _ => Err(format!("Unsupported scheme: {}", scheme)),
    }
}

pub async fn execute_query(client: &DbClient, query: String) -> Result<QueryResponse, String> {
    match client {
        DbClient::Mssql(client_arc) => {
             let mut client = client_arc.lock().await;
             let stream = client.simple_query(&query).await.map_err(|e| e.to_string())?;
             let rows: Vec<tiberius::Row> = stream.into_first_result().await.map_err(|e| e.to_string())?;
             
             if rows.is_empty() {
                 return Ok(QueryResponse { columns: vec![], rows: vec![] });
             }

             let columns: Vec<String> = rows[0].columns().iter().map(|c| c.name().to_string()).collect();
             let result_rows: Vec<Vec<Value>> = rows.iter().map(|r| serialize_mssql_row(r)).collect();
             
             Ok(QueryResponse { columns, rows: result_rows })
        },
        DbClient::Mysql(pool) => {
            use sqlx::{Column, Row};
            let rows = sqlx::query(&query).fetch_all(pool).await.map_err(|e| e.to_string())?;
            
            if rows.is_empty() {
                return Ok(QueryResponse { columns: vec![], rows: vec![] });
            }
            
            let columns: Vec<String> = rows[0].columns().iter().map(|c| c.name().to_string()).collect();
            let mut result_rows = Vec::new();
            
            for row in rows {
                let mut values = Vec::new();
                for (i, _) in row.columns().iter().enumerate() {
                   let val = if let Ok(v) = row.try_get::<String, _>(i) { json!(v) }
                   else if let Ok(v) = row.try_get::<i64, _>(i) { json!(v) }
                   else if let Ok(v) = row.try_get::<f64, _>(i) { json!(v) }
                   else if let Ok(v) = row.try_get::<bool, _>(i) { json!(v) }
                   else { json!(null) };
                   values.push(val);
                }
                result_rows.push(values);
            }
            Ok(QueryResponse { columns, rows: result_rows })
        },
        DbClient::Postgres(pool) => {
            use sqlx::{Column, Row};
            let rows = sqlx::query(&query).fetch_all(pool).await.map_err(|e| e.to_string())?;
            
            if rows.is_empty() {
                return Ok(QueryResponse { columns: vec![], rows: vec![] });
            }
            
            let columns: Vec<String> = rows[0].columns().iter().map(|c| c.name().to_string()).collect();
            let mut result_rows = Vec::new();
            
            for row in rows {
                let mut values = Vec::new();
                for (i, _) in row.columns().iter().enumerate() {
                   let val = if let Ok(v) = row.try_get::<String, _>(i) { json!(v) }
                   else if let Ok(v) = row.try_get::<i64, _>(i) { json!(v) }
                   else if let Ok(v) = row.try_get::<i32, _>(i) { json!(v) }
                   else if let Ok(v) = row.try_get::<f64, _>(i) { json!(v) }
                   else if let Ok(v) = row.try_get::<bool, _>(i) { json!(v) }
                   else { json!(null) };
                   values.push(val);
                }
                result_rows.push(values);
            }
            Ok(QueryResponse { columns, rows: result_rows })
        },
        DbClient::Mongo(client) => {
             let db_name = client.default_database().ok_or("No default database in connection string")?.name().to_string();
             let db = client.database(&db_name);

             let doc: mongodb::bson::Document = if query.trim().starts_with('{') {
                 serde_json::from_str(&query).map_err(|e| format!("Invalid JSON command: {}", e))?
             } else {
                 let collection_name = query.trim();
                 return fetch_mongo_collection(db, collection_name).await;
             };
             
             let result = db.run_command(doc).await.map_err(|e| e.to_string())?;
             let json_res: Value = serde_json::to_value(&result).unwrap_or(json!(null));
             
             Ok(QueryResponse { 
                 columns: vec!["Result".to_string()],
                 rows: vec![vec![json_res]] 
             })
        },
        DbClient::Redis(client) => {
             let mut con = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;
             let parts: Vec<&str> = query.split_whitespace().collect();
             if parts.is_empty() {
                 return Err("Empty command".to_string());
             }
             
             let mut cmd = redis::cmd(parts[0]);
             for part in &parts[1..] {
                 cmd.arg(*part);
             }
             
             let result: Option<String> = cmd.query_async(&mut con).await.map_err(|e| e.to_string())?;
             
             Ok(QueryResponse {
                 columns: vec!["Output".to_string()],
                 rows: vec![vec![json!(result)]]
             })
        }
    }
}

async fn fetch_mongo_collection(db: mongodb::Database, col_name: &str) -> Result<QueryResponse, String> {
    use futures::stream::StreamExt;
    let collection = db.collection::<mongodb::bson::Document>(col_name);
    let mut cursor = collection.find(mongodb::bson::doc! {}).await.map_err(|e| e.to_string())?;
    
    let mut rows = Vec::new();
    let mut count = 0;
    while let Some(doc) = cursor.next().await {
        if count > 100 { break; }
        if let Ok(d) = doc {
             let v: Value = serde_json::to_value(d).unwrap_or(json!(null));
             rows.push(vec![v]);
        }
        count += 1;
    }
    
    Ok(QueryResponse{
        columns: vec!["Document".to_string()],
        rows
    })
}

fn serialize_mssql_row(row: &tiberius::Row) -> Vec<Value> {
    let mut values = Vec::new();
    for col in row.columns() {
        let col_name = col.name();
        let val = if let Ok(Some(s)) = row.try_get::<&str, _>(col_name) { json!(s) }
        else if let Ok(Some(i)) = row.try_get::<i32, _>(col_name) { json!(i) }
        else if let Ok(Some(i)) = row.try_get::<i64, _>(col_name) { json!(i) }
        else if let Ok(Some(f)) = row.try_get::<f64, _>(col_name) { json!(f) }
        else if let Ok(Some(b)) = row.try_get::<bool, _>(col_name) { json!(b) }
        else if let Ok(Some(u)) = row.try_get::<uuid::Uuid, _>(col_name) { json!(u.to_string()) }
        else { json!(null) };
        values.push(val);
    }
    values
}

pub async fn test_connection(conn_str: &str) -> Result<String, String> {
    let client = create_client(conn_str).await?;
    
    // Run a lightweight query to verify connectivity
    match client {
        DbClient::Mssql(_) => {
            execute_query(&client, "SELECT 1".into()).await.map(|_| "Connection successful".into())
        },
        DbClient::Mysql(_) => {
            execute_query(&client, "SELECT 1".into()).await.map(|_| "Connection successful".into())
        },
        DbClient::Postgres(_) => {
            execute_query(&client, "SELECT 1".into()).await.map(|_| "Connection successful".into())
        },
        DbClient::Mongo(_) => {
            // execute_query for Mongo already handles a "ping"-like check if we pass a JSON command
            execute_query(&client, "{ \"ping\": 1 }".into()).await.map(|_| "Connection successful".into())
        },
        DbClient::Redis(_) => {
            execute_query(&client, "PING".into()).await.map(|_| "Connection successful".into())
        }
    }
}

pub async fn get_tables(client: &DbClient) -> Result<Vec<String>, String> {
    match client {
        DbClient::Mssql(client_arc) => {
             println!("Fetching tables for MSSQL");
             let mut client = client_arc.lock().await;
             let query = "SELECT table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE'";
             let stream = client.simple_query(query).await.map_err(|e| e.to_string())?;
             let rows: Vec<tiberius::Row> = stream.into_first_result().await.map_err(|e| e.to_string())?;
             let mut tables = Vec::new();
             for row in rows {
                 if let Ok(Some(name)) = row.try_get::<&str, _>(0) {
                     tables.push(name.to_string());
                 }
             }
             println!("Found {} tables", tables.len());
             Ok(tables)
        },
        DbClient::Mysql(pool) => {
             println!("Fetching tables for MySQL");
             use sqlx::Row;
             let rows = sqlx::query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()")
                .fetch_all(pool).await.map_err(|e| e.to_string())?;
             let tables: Vec<String> = rows.iter().map(|r| r.get(0)).collect();
             println!("Found {} tables", tables.len());
             Ok(tables)
        },
        DbClient::Postgres(pool) => {
             println!("Fetching tables for Postgres");
             use sqlx::Row;
             let rows = sqlx::query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
                .fetch_all(pool).await.map_err(|e| e.to_string())?;
             let tables: Vec<String> = rows.iter().map(|r| r.get(0)).collect();
             println!("Found {} tables", tables.len());
             Ok(tables)
        },
        DbClient::Mongo(client) => {
             println!("Fetching collections for MongoDB");
             let db_name = client.default_database().ok_or("No default database")?.name().to_string();
             let db = client.database(&db_name);
             let collections = db.list_collection_names().await.map_err(|e| e.to_string())?;
             println!("Found {} collections", collections.len());
             Ok(collections)
        },
        DbClient::Redis(_) => {
            Ok(vec!["Keys (Use 'SCAN' in query)".to_string()])
        }
    }
}
