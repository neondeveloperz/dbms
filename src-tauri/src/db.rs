use futures::TryStreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::Executor;
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use tiberius::{Client, Config};
use tokio::net::TcpStream;
use tokio::sync::Mutex as AsyncMutex;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};
use url::Url; // For describe()

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

            let tcp = TcpStream::connect((host, port))
                .await
                .map_err(|e| e.to_string())?;
            tcp.set_nodelay(true).map_err(|e| e.to_string())?;

            let client = Client::connect(config, tcp.compat_write())
                .await
                .map_err(|e| e.to_string())?;
            Ok(DbClient::Mssql(Arc::new(AsyncMutex::new(client))))
        }
        "mysql" | "mariadb" => {
            let pool = sqlx::MySqlPool::connect(conn_str)
                .await
                .map_err(|e| e.to_string())?;
            Ok(DbClient::Mysql(pool))
        }
        "postgres" | "postgresql" => {
            let pool = sqlx::PgPool::connect(conn_str)
                .await
                .map_err(|e| e.to_string())?;
            Ok(DbClient::Postgres(pool))
        }
        "mongodb" => {
            let client_options = mongodb::options::ClientOptions::parse(conn_str)
                .await
                .map_err(|e| e.to_string())?;
            let client =
                mongodb::Client::with_options(client_options).map_err(|e| e.to_string())?;
            Ok(DbClient::Mongo(client))
        }
        "redis" => {
            let client = redis::Client::open(conn_str).map_err(|e| e.to_string())?;
            Ok(DbClient::Redis(client))
        }
        _ => Err(format!("Unsupported scheme: {}", scheme)),
    }
}

pub async fn execute_query(client: &DbClient, query: String) -> Result<QueryResponse, String> {
    match client {
        DbClient::Mssql(client_arc) => {
            let mut client = client_arc.lock().await;
            let mut stream = client
                .simple_query(&query)
                .await
                .map_err(|e| e.to_string())?;

            let mut columns: Vec<String> = Vec::new();
            let mut rows = Vec::new();

            // Iterate stream to capture metadata (columns) and rows
            while let Some(item) = stream.try_next().await.map_err(|e| e.to_string())? {
                match item {
                    tiberius::QueryItem::Metadata(meta) => {
                        columns = meta
                            .columns()
                            .iter()
                            .map(|c| c.name().to_string())
                            .collect();
                    }
                    tiberius::QueryItem::Row(row) => {
                        rows.push(serialize_mssql_row(&row));
                    }
                }
            }

            Ok(QueryResponse { columns, rows })
        }
        DbClient::Mysql(pool) => {
            use sqlx::{Column, Row};
            let rows = sqlx::query(&query)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;

            if rows.is_empty() {
                // If empty, try describe to get columns
                if let Ok(desc) = pool.describe(&query).await {
                    let columns: Vec<String> = desc
                        .columns()
                        .iter()
                        .map(|c| c.name().to_string())
                        .collect();
                    return Ok(QueryResponse {
                        columns,
                        rows: vec![],
                    });
                }
                return Ok(QueryResponse {
                    columns: vec![],
                    rows: vec![],
                });
            }

            let columns: Vec<String> = rows[0]
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect();
            let mut result_rows = Vec::new();

            for row in rows {
                let mut values = Vec::new();
                for (i, _) in row.columns().iter().enumerate() {
                    let val = if let Ok(v) = row.try_get::<String, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<i64, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<f64, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<bool, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<uuid::Uuid, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<serde_json::Value, _>(i) {
                        v
                    } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<i32, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<i16, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<i8, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<f32, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<bigdecimal::BigDecimal, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
                        json!(v)
                    } else {
                        json!(null)
                    };
                    values.push(val);
                }
                result_rows.push(values);
            }
            Ok(QueryResponse {
                columns,
                rows: result_rows,
            })
        }
        DbClient::Postgres(pool) => {
            use sqlx::{Column, Row};
            let rows = sqlx::query(&query)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;

            if rows.is_empty() {
                // If empty, try describe to get columns
                if let Ok(desc) = pool.describe(&query).await {
                    let columns: Vec<String> = desc
                        .columns()
                        .iter()
                        .map(|c| c.name().to_string())
                        .collect();
                    return Ok(QueryResponse {
                        columns,
                        rows: vec![],
                    });
                }
                return Ok(QueryResponse {
                    columns: vec![],
                    rows: vec![],
                });
            }

            let columns: Vec<String> = rows[0]
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect();
            let mut result_rows = Vec::new();

            for row in rows {
                let mut values = Vec::new();
                for (i, _) in row.columns().iter().enumerate() {
                    let val = if let Ok(v) = row.try_get::<String, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<i64, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<i32, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<f64, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<bool, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<uuid::Uuid, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<Vec<String>, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<serde_json::Value, _>(i) {
                        v
                    } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<i16, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<i8, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<f32, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<bigdecimal::BigDecimal, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::FixedOffset>, _>(i) {
                        json!(v.to_string())
                    } else {
                        json!(null)
                    };
                    values.push(val);
                }
                result_rows.push(values);
            }
            Ok(QueryResponse {
                columns,
                rows: result_rows,
            })
        }
        DbClient::Mongo(client) => {
            let db_name = client
                .default_database()
                .ok_or("No default database in connection string")?
                .name()
                .to_string();
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
                rows: vec![vec![json_res]],
            })
        }
        DbClient::Redis(client) => {
            let mut con = client
                .get_multiplexed_async_connection()
                .await
                .map_err(|e| e.to_string())?;
            let parts: Vec<&str> = query.split_whitespace().collect();
            if parts.is_empty() {
                return Err("Empty command".to_string());
            }

            let mut cmd = redis::cmd(parts[0]);
            for part in &parts[1..] {
                cmd.arg(*part);
            }

            let result: Option<String> =
                cmd.query_async(&mut con).await.map_err(|e| e.to_string())?;

            Ok(QueryResponse {
                columns: vec!["Output".to_string()],
                rows: vec![vec![json!(result)]],
            })
        }
    }
}

async fn fetch_mongo_collection(
    db: mongodb::Database,
    col_name: &str,
) -> Result<QueryResponse, String> {
    use futures::stream::StreamExt;
    let collection = db.collection::<mongodb::bson::Document>(col_name);
    let mut cursor = collection
        .find(mongodb::bson::doc! {})
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = Vec::new();
    let mut count = 0;
    while let Some(doc) = cursor.next().await {
        if count > 100 {
            break;
        }
        if let Ok(d) = doc {
            let v: Value = serde_json::to_value(d).unwrap_or(json!(null));
            rows.push(vec![v]);
        }
        count += 1;
    }

    Ok(QueryResponse {
        columns: vec!["Document".to_string()],
        rows,
    })
}

fn serialize_mssql_row(row: &tiberius::Row) -> Vec<Value> {
    let mut values = Vec::new();
    for col in row.columns() {
        let col_name = col.name();
        let val = if let Ok(Some(s)) = row.try_get::<&str, _>(col_name) {
            json!(s)
        } else if let Ok(Some(i)) = row.try_get::<i32, _>(col_name) {
            json!(i)
        } else if let Ok(Some(i)) = row.try_get::<i64, _>(col_name) {
            json!(i)
        } else if let Ok(Some(f)) = row.try_get::<f64, _>(col_name) {
            json!(f)
        } else if let Ok(Some(b)) = row.try_get::<bool, _>(col_name) {
            json!(b)
        } else if let Ok(Some(u)) = row.try_get::<uuid::Uuid, _>(col_name) {
            json!(u.to_string())
        } else {
            json!(null)
        };
        values.push(val);
    }
    values
}

pub async fn test_connection(conn_str: &str) -> Result<String, String> {
    let client = create_client(conn_str).await?;

    // Run a lightweight query to verify connectivity
    match client {
        DbClient::Mssql(_) => execute_query(&client, "SELECT 1".into())
            .await
            .map(|_| "Connection successful".into()),
        DbClient::Mysql(_) => execute_query(&client, "SELECT 1".into())
            .await
            .map(|_| "Connection successful".into()),
        DbClient::Postgres(_) => execute_query(&client, "SELECT 1".into())
            .await
            .map(|_| "Connection successful".into()),
        DbClient::Mongo(_) => {
            // execute_query for Mongo already handles a "ping"-like check if we pass a JSON command
            execute_query(&client, "{ \"ping\": 1 }".into())
                .await
                .map(|_| "Connection successful".into())
        }
        DbClient::Redis(_) => execute_query(&client, "PING".into())
            .await
            .map(|_| "Connection successful".into()),
    }
}

pub async fn get_schemas(client: &DbClient) -> Result<Vec<String>, String> {
    match client {
        DbClient::Mssql(client_arc) => {
            let mut client = client_arc.lock().await;
            let query = "SELECT name FROM sys.schemas";
            let stream = client
                .simple_query(query)
                .await
                .map_err(|e| e.to_string())?;
            let rows: Vec<tiberius::Row> = stream
                .into_first_result()
                .await
                .map_err(|e| e.to_string())?;
            let schemas: Vec<String> = rows
                .iter()
                .filter_map(|r| {
                    r.try_get::<&str, _>(0)
                        .ok()
                        .flatten()
                        .map(|s| s.to_string())
                })
                .collect();
            Ok(schemas)
        }
        DbClient::Mysql(pool) => {
            // In MySQL, schemas are databases.
            use sqlx::Row;
            let rows = sqlx::query("SHOW DATABASES")
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            let schemas: Vec<String> = rows.iter().map(|r| r.get(0)).collect();
            Ok(schemas)
        }
        DbClient::Postgres(pool) => {
            use sqlx::Row;
            let rows = sqlx::query("SELECT schema_name FROM information_schema.schemata")
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            let schemas: Vec<String> = rows.iter().map(|r| r.get(0)).collect();
            Ok(schemas)
        }
        DbClient::Mongo(client) => {
            // MongoDB has databases
            let dbs = client
                .list_database_names()
                .await
                .map_err(|e| e.to_string())?;
            Ok(dbs)
        }
        DbClient::Redis(_) => {
            Ok(vec!["0".to_string()]) // Redis has numbered databases, detailed enumeration is complex, assume 0 for now or just return single "default"
        }
    }
}

pub async fn get_tables(client: &DbClient, schema: Option<String>) -> Result<Vec<String>, String> {
    match client {
        DbClient::Mssql(client_arc) => {
            println!("Fetching tables for MSSQL, schema: {:?}", schema);
            let mut client = client_arc.lock().await;
            let target_schema = schema.unwrap_or_else(|| "dbo".to_string());
            
            let query = if target_schema == "*" {
                "SELECT table_schema + '.' + table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('sys', 'INFORMATION_SCHEMA')".to_string()
            } else {
                format!("SELECT table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema = '{}'", target_schema)
            };

            let stream = client
                .simple_query(&query)
                .await
                .map_err(|e| e.to_string())?;
            let rows: Vec<tiberius::Row> = stream
                .into_first_result()
                .await
                .map_err(|e| e.to_string())?;
            let mut tables = Vec::new();
            for row in rows {
                if let Ok(Some(name)) = row.try_get::<&str, _>(0) {
                    tables.push(name.to_string());
                }
            }
            println!("Found {} tables", tables.len());
            Ok(tables)
        }
        DbClient::Mysql(pool) => {
            println!("Fetching tables for MySQL, schema: {:?}", schema);
            use sqlx::Row;
            let target_schema = schema.unwrap_or_else(|| "DATABASE()".to_string());
            
            let q = if target_schema == "*" {
                 "SELECT CONCAT(table_schema, '.', table_name) FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')".to_string()
            } else if target_schema == "DATABASE()" {
                "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()".to_string()
            } else {
                format!(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = '{}'",
                    target_schema
                )
            };

            let rows = sqlx::query(&q)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            let tables: Vec<String> = rows.iter().map(|r| r.get(0)).collect();
            println!("Found {} tables", tables.len());
            Ok(tables)
        }
        DbClient::Postgres(pool) => {
            println!("Fetching tables for Postgres, schema: {:?}", schema);
            use sqlx::Row;
            let target_schema = schema.unwrap_or_else(|| "public".to_string());
            
            let q = if target_schema == "*" {
                "SELECT table_schema || '.' || table_name FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog')".to_string()
            } else {
                format!(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = '{}'",
                    target_schema
                )
            };

            let rows = sqlx::query(&q)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            let tables: Vec<String> = rows.iter().map(|r| r.get(0)).collect();
            println!("Found {} tables", tables.len());
            Ok(tables)
        }
        DbClient::Mongo(client) => {
            println!("Fetching collections for MongoDB, db: {:?}", schema);
            let db_name = schema.unwrap_or_else(|| {
                client
                    .default_database()
                    .map(|d| d.name().to_string())
                    .unwrap_or("test".to_string())
            });
            let db = client.database(&db_name);
            let collections = db
                .list_collection_names()
                .await
                .map_err(|e| e.to_string())?;
            println!("Found {} collections", collections.len());
            Ok(collections)
        }
        DbClient::Redis(_) => Ok(vec!["Keys (Use 'SCAN' in query)".to_string()]),
    }
}

pub async fn get_views(client: &DbClient, schema: Option<String>) -> Result<Vec<String>, String> {
    match client {
        DbClient::Mssql(client_arc) => {
            let mut client = client_arc.lock().await;
            let target_schema = schema.unwrap_or_else(|| "dbo".to_string());
            
            let query = if target_schema == "*" {
                 "SELECT DISTINCT table_schema + '.' + table_name FROM information_schema.views WHERE table_schema NOT IN ('sys', 'INFORMATION_SCHEMA')".to_string()
            } else {
                format!("SELECT DISTINCT table_name FROM information_schema.views WHERE table_schema = '{}'", target_schema)
            };

            let stream = client
                .simple_query(&query)
                .await
                .map_err(|e| e.to_string())?;
            let rows: Vec<tiberius::Row> = stream
                .into_first_result()
                .await
                .map_err(|e| e.to_string())?;
            let views: Vec<String> = rows
                .iter()
                .filter_map(|r| {
                    r.try_get::<&str, _>(0)
                        .ok()
                        .flatten()
                        .map(|s| s.to_string())
                })
                .collect();
            Ok(views)
        }
        DbClient::Mysql(pool) => {
            use sqlx::Row;
            let target_schema = schema.unwrap_or_else(|| "DATABASE()".to_string());
            
            let q = if target_schema == "*" {
                "SELECT DISTINCT CONCAT(table_schema, '.', table_name) FROM information_schema.views WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')".to_string()
            } else if target_schema == "DATABASE()" {
                "SELECT DISTINCT table_name FROM information_schema.views WHERE table_schema = DATABASE()".to_string()
            } else {
                format!("SELECT DISTINCT table_name FROM information_schema.views WHERE table_schema = '{}'", target_schema)
            };

            let rows = sqlx::query(&q)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            let views: Vec<String> = rows.iter().map(|r| r.get(0)).collect();
            Ok(views)
        }
        DbClient::Postgres(pool) => {
            use sqlx::Row;
            let target_schema = schema.unwrap_or_else(|| "public".to_string());
            
            let q = if target_schema == "*" {
                "SELECT DISTINCT table_schema || '.' || table_name FROM information_schema.views WHERE table_schema NOT IN ('information_schema', 'pg_catalog')".to_string()
            } else {
                format!("SELECT DISTINCT table_name FROM information_schema.views WHERE table_schema = '{}'", target_schema)
            };

            let rows = sqlx::query(&q)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            let views: Vec<String> = rows.iter().map(|r| r.get(0)).collect();
            Ok(views)
        }
        _ => Ok(vec![]),
    }
}

pub async fn get_functions(
    client: &DbClient,
    schema: Option<String>,
) -> Result<Vec<String>, String> {
    match client {
        DbClient::Mssql(client_arc) => {
            let mut client = client_arc.lock().await;
            let target_schema = schema.unwrap_or_else(|| "dbo".to_string());
            
            let query = if target_schema == "*" {
                "SELECT DISTINCT routine_schema + '.' + routine_name FROM information_schema.routines WHERE routine_type = 'FUNCTION' AND routine_schema NOT IN ('sys', 'INFORMATION_SCHEMA')".to_string()
            } else {
                format!("SELECT DISTINCT routine_name FROM information_schema.routines WHERE routine_type = 'FUNCTION' AND routine_schema = '{}'", target_schema)
            };

            let stream = client
                .simple_query(&query)
                .await
                .map_err(|e| e.to_string())?;
            let rows: Vec<tiberius::Row> = stream
                .into_first_result()
                .await
                .map_err(|e| e.to_string())?;
            let functions: Vec<String> = rows
                .iter()
                .filter_map(|r| {
                    r.try_get::<&str, _>(0)
                        .ok()
                        .flatten()
                        .map(|s| s.to_string())
                })
                .collect();
            Ok(functions)
        }
        DbClient::Mysql(pool) => {
            use sqlx::Row;
            let target_schema = schema.unwrap_or_else(|| "DATABASE()".to_string());

            let q = if target_schema == "*" {
                 "SELECT DISTINCT CONCAT(routine_schema, '.', routine_name) FROM information_schema.routines WHERE routine_type = 'FUNCTION' AND routine_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')".to_string()
            } else if target_schema == "DATABASE()" {
                "SELECT DISTINCT routine_name FROM information_schema.routines WHERE routine_type = 'FUNCTION' AND routine_schema = DATABASE()".to_string()
            } else {
                format!("SELECT DISTINCT routine_name FROM information_schema.routines WHERE routine_type = 'FUNCTION' AND routine_schema = '{}'", target_schema)
            };

            let rows = sqlx::query(&q)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            let functions: Vec<String> = rows.iter().map(|r| r.get(0)).collect();
            Ok(functions)
        }
        DbClient::Postgres(pool) => {
            use sqlx::Row;
            let target_schema = schema.unwrap_or_else(|| "public".to_string());
            
            let q = if target_schema == "*" {
                "SELECT DISTINCT routine_schema || '.' || routine_name FROM information_schema.routines WHERE routine_type = 'FUNCTION' AND routine_schema NOT IN ('information_schema', 'pg_catalog')".to_string()
            } else {
                format!("SELECT DISTINCT routine_name FROM information_schema.routines WHERE routine_type = 'FUNCTION' AND routine_schema = '{}'", target_schema)
            };

            let rows = sqlx::query(&q)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            let functions: Vec<String> = rows.iter().map(|r| r.get(0)).collect();
            Ok(functions)
        }
        _ => Ok(vec![]),
    }
}
