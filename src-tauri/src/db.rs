use chrono;
use futures::TryStreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{Column, Row};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::sync::{Arc, Mutex as StdMutex};
use tiberius::{Client, Config};
use tokio::net::TcpStream;
use tokio::sync::Mutex as AsyncMutex;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};
use url::Url; // Added chrono import

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

// Export Helper Structs
#[derive(Serialize)]
#[serde(rename = "row")]
struct XmlRow {
    #[serde(flatten)]
    fields: HashMap<String, Value>,
}

#[derive(Serialize)]
#[serde(rename = "data")]
struct XmlData {
    #[serde(rename = "row")]
    rows: Vec<XmlRow>,
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

pub async fn execute_query(client: &DbClient, sql: String) -> Result<QueryResponse, String> {
    match client {
        DbClient::Postgres(pool) => {
            let rows = sqlx::query(&sql)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;

            if rows.is_empty() {
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
                let mut current_row = Vec::new();
                for (i, _) in columns.iter().enumerate() {
                    // Try to decode as various types
                    // Simplified: check type info or try generic decode
                    // This is a bit hacky in generic sqlx types without reflection.
                    // Better approach: use `try_get` for common types.

                    // Helper to convert PG value to JSON Value
                    let val: Value = if let Ok(v) = row.try_get::<i32, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<i64, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<f64, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<bool, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<String, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                        json!(v.to_rfc3339())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(v) = row.try_get::<serde_json::Value, _>(i) {
                        v
                    } else {
                        // Fallback to string if possible, or null
                        // Note: sqlx doesn't easy provide "any string" conversion without knows types.
                        // We can try getting raw bytes or try string again (handled above).
                        json!(null)
                    };
                    current_row.push(val);
                }
                result_rows.push(current_row);
            }

            Ok(QueryResponse {
                columns,
                rows: result_rows,
            })
        }
        DbClient::Mysql(pool) => {
            let rows = sqlx::query(&sql)
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;

            if rows.is_empty() {
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
                let mut current_row = Vec::new();
                for (i, _) in columns.iter().enumerate() {
                    let val: Value = if let Ok(v) = row.try_get::<i32, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<i64, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<f64, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<bool, _>(i) {
                        // MySQL bool is tinyint
                        json!(v)
                    } else if let Ok(v) = row.try_get::<String, _>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                        json!(v.to_rfc3339())
                    } else {
                        json!(null)
                    };
                    current_row.push(val);
                }
                result_rows.push(current_row);
            }
            Ok(QueryResponse {
                columns,
                rows: result_rows,
            })
        }
        DbClient::Mssql(client_mutex) => {
            let mut client = client_mutex.lock().await;

            let result = client.simple_query(&sql).await.map_err(|e| e.to_string())?;

            let rows: Vec<tiberius::Row> = result
                .into_first_result()
                .await
                .map_err(|e| e.to_string())?;

            if rows.is_empty() {
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
                let mut current_row = Vec::new();
                for i in 0..columns.len() {
                    let val: Value = if let Ok(Some(v)) = row.try_get::<i32, _>(i) {
                        json!(v)
                    } else if let Ok(Some(v)) = row.try_get::<i64, _>(i) {
                        json!(v)
                    } else if let Ok(Some(v)) = row.try_get::<f64, _>(i) {
                        json!(v)
                    } else if let Ok(Some(v)) = row.try_get::<bool, _>(i) {
                        json!(v)
                    } else if let Ok(Some(v)) = row.try_get::<&str, _>(i) {
                        json!(v)
                    } else if let Ok(Some(v)) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                        json!(v.to_string())
                    } else if let Ok(Some(v)) = row.try_get::<chrono::NaiveDate, _>(i) {
                        json!(v.to_string())
                    } else {
                        json!(null)
                    };
                    current_row.push(val);
                }
                result_rows.push(current_row);
            }

            Ok(QueryResponse {
                columns,
                rows: result_rows,
            })
        }
        _ => Err("Unsupported database type for query execution".to_string()),
    }
}

pub async fn get_tables(client: &DbClient, schema: Option<String>) -> Result<Vec<String>, String> {
    match client {
        DbClient::Postgres(pool) => {
            let schema_filter = schema.unwrap_or_else(|| "public".to_string());
            let rows = sqlx::query(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
            )
            .bind(schema_filter)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

            Ok(rows.iter().map(|r| r.get(0)).collect())
        }
        DbClient::Mysql(pool) => {
            // MySQL doesn't have multiple schemas in the PG sense (schema = database usually).
            // We can ignore schema arg or treat it as database if needed, but usually we connect to a DB.
            // If we want to filter by connected DB:
            let rows = sqlx::query(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
            )
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| r.get(0)).collect())
        }
        DbClient::Mssql(client_mutex) => {
            let mut client = client_mutex.lock().await;
            let schema_filter = schema.unwrap_or_else(|| "dbo".to_string());
            // Tiberius query params are 1-based P1, P2... or just replace in string (risky for injection).
            // Safer to use Param.
            // For simplicity, we assume schema is safe or use simple format, but technically should binding.
            // Tiberius supports binding.
            let query = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = @P1";
            let rows = client
                .query(query, &[&schema_filter])
                .await
                .map_err(|e| e.to_string())?
                .into_first_result()
                .await
                .map_err(|e| e.to_string())?;

            let mut tables = Vec::new();
            for r in rows {
                if let Ok(Some(name)) = r.try_get::<&str, _>(0) {
                    tables.push(name.to_string());
                }
            }
            Ok(tables)
        }
        _ => Ok(vec![]),
    }
}

pub async fn get_views(client: &DbClient, schema: Option<String>) -> Result<Vec<String>, String> {
    match client {
        DbClient::Postgres(pool) => {
            let schema_filter = schema.unwrap_or_else(|| "public".to_string());
            let rows = sqlx::query(
                "SELECT table_name FROM information_schema.views WHERE table_schema = $1",
            )
            .bind(schema_filter)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| r.get(0)).collect())
        }
        DbClient::Mysql(pool) => {
            let rows = sqlx::query(
                "SELECT table_name FROM information_schema.views WHERE table_schema = DATABASE()",
            )
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| r.get(0)).collect())
        }
        DbClient::Mssql(client_mutex) => {
            let mut client = client_mutex.lock().await;
            let schema_filter = schema.unwrap_or_else(|| "dbo".to_string());
            let query = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = @P1";
            let rows = client
                .query(query, &[&schema_filter])
                .await
                .map_err(|e| e.to_string())?
                .into_first_result()
                .await
                .map_err(|e| e.to_string())?;
            let mut views = Vec::new();
            for r in rows {
                if let Ok(Some(name)) = r.try_get::<&str, _>(0) {
                    views.push(name.to_string());
                }
            }
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
        DbClient::Postgres(pool) => {
            let schema_filter = schema.unwrap_or_else(|| "public".to_string());
            let rows = sqlx::query(
                "SELECT routine_name FROM information_schema.routines WHERE routine_type = 'FUNCTION' AND routine_schema = $1"
            )
            .bind(schema_filter)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| r.get(0)).collect())
        }
        DbClient::Mysql(pool) => {
            let rows = sqlx::query(
                "SELECT routine_name FROM information_schema.routines WHERE routine_type = 'FUNCTION' AND routine_schema = DATABASE()"
            )
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| r.get(0)).collect())
        }
        DbClient::Mssql(client_mutex) => {
            let mut client = client_mutex.lock().await;
            let schema_filter = schema.unwrap_or_else(|| "dbo".to_string());
            let query = "SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'FUNCTION' AND ROUTINE_SCHEMA = @P1";
            let rows = client
                .query(query, &[&schema_filter])
                .await
                .map_err(|e| e.to_string())?
                .into_first_result()
                .await
                .map_err(|e| e.to_string())?;
            let mut funcs = Vec::new();
            for r in rows {
                if let Ok(Some(name)) = r.try_get::<&str, _>(0) {
                    funcs.push(name.to_string());
                }
            }
            Ok(funcs)
        }
        _ => Ok(vec![]),
    }
}

pub async fn get_schemas(client: &DbClient) -> Result<Vec<String>, String> {
    match client {
        DbClient::Postgres(pool) => {
            let rows = sqlx::query(
                "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')"
            )
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| r.get(0)).collect())
        }
        DbClient::Mysql(_) => {
            // MySQL uses databases as schemas generally.
            Ok(vec!["def".to_string()]) // Or list databases?
        }
        DbClient::Mssql(client_mutex) => {
            let mut client = client_mutex.lock().await;
            let query = "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME NOT IN ('information_schema', 'sys', 'guest', 'users')";
            let rows = client
                .query(query, &[])
                .await
                .map_err(|e| e.to_string())?
                .into_first_result()
                .await
                .map_err(|e| e.to_string())?;
            let mut schemas = Vec::new();
            for r in rows {
                if let Ok(Some(name)) = r.try_get::<&str, _>(0) {
                    schemas.push(name.to_string());
                }
            }
            Ok(schemas)
        }
        _ => Ok(vec![]),
    }
}

pub async fn get_databases(client: &DbClient) -> Result<Vec<String>, String> {
    match client {
        DbClient::Postgres(pool) => {
            let rows = sqlx::query("SELECT datname FROM pg_database WHERE datistemplate = false;")
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| r.get(0)).collect())
        }
        DbClient::Mysql(pool) => {
            let rows = sqlx::query("SHOW DATABASES")
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;
            // First column is Database
            Ok(rows.iter().map(|r| r.get(0)).collect())
        }
        DbClient::Mssql(client_mutex) => {
            let mut client = client_mutex.lock().await;
            let query = "SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')";
            let rows = client
                .query(query, &[])
                .await
                .map_err(|e| e.to_string())?
                .into_first_result()
                .await
                .map_err(|e| e.to_string())?;
            let mut dbs = Vec::new();
            for r in rows {
                if let Ok(Some(name)) = r.try_get::<&str, _>(0) {
                    dbs.push(name.to_string());
                }
            }
            Ok(dbs)
        }
        _ => Ok(vec![]),
    }
}

// Test Connection
pub async fn test_connection(conn_str: &str) -> Result<String, String> {
    let client = create_client(conn_str).await?;
    // Try simple query
    match client {
        DbClient::Postgres(pool) => {
            sqlx::query("SELECT 1")
                .fetch_one(&pool)
                .await
                .map_err(|e| e.to_string())?;
        }
        DbClient::Mysql(pool) => {
            sqlx::query("SELECT 1")
                .fetch_one(&pool)
                .await
                .map_err(|e| e.to_string())?;
        }
        DbClient::Mssql(client_mutex) => {
            let mut client = client_mutex.lock().await;
            client
                .simple_query("SELECT 1")
                .await
                .map_err(|e| e.to_string())?;
        }
        DbClient::Mongo(client) => {
            // Check list database names
            client
                .list_database_names()
                .await
                .map_err(|e| e.to_string())?;
        }
        DbClient::Redis(client) => {
            let mut con = client
                .get_multiplexed_async_connection()
                .await
                .map_err(|e| e.to_string())?;
            redis::cmd("PING")
                .query_async::<String>(&mut con)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok("Connection successful".to_string())
}

pub async fn export_data(
    client: &DbClient,
    sql: String,
    format: String,
    path: String,
) -> Result<(), String> {
    let result = execute_query(client, sql).await?;
    let columns = result.columns;
    let rows = result.rows;
    let file = File::create(&path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(file);

    match format.as_str() {
        "json" => {
            let mut data = Vec::new();
            for row in rows {
                let mut map = serde_json::Map::new();
                for (i, col) in columns.iter().enumerate() {
                    map.insert(col.clone(), row[i].clone());
                }
                data.push(Value::Object(map));
            }
            serde_json::to_writer_pretty(writer, &data).map_err(|e| e.to_string())?;
        }
        "jsonl" => {
            for row in rows {
                let mut map = serde_json::Map::new();
                for (i, col) in columns.iter().enumerate() {
                    map.insert(col.clone(), row[i].clone());
                }
                let mut json_str =
                    serde_json::to_string(&Value::Object(map)).map_err(|e| e.to_string())?;
                json_str.push('\n');
                writer
                    .write_all(json_str.as_bytes())
                    .map_err(|e| e.to_string())?;
            }
        }
        "csv" | "csv_semicolon" | "tsv" => {
            let delimiter = match format.as_str() {
                "csv_semicolon" => b';',
                "tsv" => b'\t',
                _ => b',',
            };
            let mut csv_writer = csv::WriterBuilder::new()
                .delimiter(delimiter)
                .from_writer(writer);

            // Write Headers
            csv_writer
                .write_record(&columns)
                .map_err(|e| e.to_string())?;

            // Write Rows
            for row in rows {
                let record: Vec<String> = row
                    .iter()
                    .map(|v| match v {
                        Value::Null => "".to_string(),
                        Value::String(s) => s.clone(),
                        Value::Bool(b) => b.to_string(),
                        Value::Number(n) => n.to_string(),
                        _ => v.to_string(),
                    })
                    .collect();
                csv_writer
                    .write_record(&record)
                    .map_err(|e| e.to_string())?;
            }
            csv_writer.flush().map_err(|e| e.to_string())?;
        }
        "sql" => {
            // Very basic INSERT generator
            // Needed: Table Name. But we only have query.
            // We'll use "EXPORT_TABLE" as placeholder or try to parse (hard).
            // Let's use "export_table".
            for row in rows {
                let values: Vec<String> = row
                    .iter()
                    .map(|v| match v {
                        Value::Null => "NULL".to_string(),
                        Value::String(s) => format!("'{}'", s.replace("'", "''")),
                        Value::Bool(b) => {
                            if *b {
                                "TRUE".to_string()
                            } else {
                                "FALSE".to_string()
                            }
                        }
                        Value::Number(n) => n.to_string(),
                        _ => format!("'{}'", v.to_string().replace("'", "''")),
                    })
                    .collect();

                let sql = format!(
                    "INSERT INTO export_table ({}) VALUES ({});\n",
                    columns.join(", "),
                    values.join(", ")
                );
                writer
                    .write_all(sql.as_bytes())
                    .map_err(|e| e.to_string())?;
            }
        }
        "xml" => {
            let mut xml_rows = Vec::new();
            for row in rows {
                let mut map = HashMap::new();
                for (i, col) in columns.iter().enumerate() {
                    // XML tags cannot contain spaces etc. simplified.
                    let safe_col = col.replace(' ', "_");
                    map.insert(safe_col, row[i].clone());
                }
                xml_rows.push(XmlRow { fields: map });
            }
            let data = XmlData { rows: xml_rows };
            let xml_str = quick_xml::se::to_string(&data).map_err(|e| e.to_string())?;
            writer
                .write_all(xml_str.as_bytes())
                .map_err(|e| e.to_string())?;
        }
        "excel" => {
            // rust_xlsxwriter needs separate file handling, it creates its own file.
            // So we close our file/writer and pass path to workbook.
            // Actually `Workbook::new()` doesn't take path, `save(path)` does.
            // So drop writer first.
            drop(writer);

            let mut workbook = rust_xlsxwriter::Workbook::new();
            let sheet = workbook.add_worksheet();

            // Headers
            for (i, col) in columns.iter().enumerate() {
                sheet
                    .write_string(0, i as u16, col)
                    .map_err(|e| e.to_string())?;
            }

            // Rows
            for (r, row) in rows.iter().enumerate() {
                for (c, val) in row.iter().enumerate() {
                    let row_idx = (r + 1) as u32;
                    let col_idx = c as u16;
                    match val {
                        Value::Null => {}
                        Value::String(s) => {
                            sheet
                                .write_string(row_idx, col_idx, s)
                                .map_err(|e| e.to_string())?;
                        }
                        Value::Bool(b) => {
                            sheet
                                .write_boolean(row_idx, col_idx, *b)
                                .map_err(|e| e.to_string())?;
                        }
                        Value::Number(n) => {
                            if let Some(f) = n.as_f64() {
                                sheet
                                    .write_number(row_idx, col_idx, f)
                                    .map_err(|e| e.to_string())?;
                            } else if let Some(i) = n.as_i64() {
                                sheet
                                    .write_number(row_idx, col_idx, i as f64)
                                    .map_err(|e| e.to_string())?; // Excel uses f64
                            }
                        }
                        _ => {
                            sheet
                                .write_string(row_idx, col_idx, val.to_string())
                                .map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
            workbook.save(path).map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Unsupported format: {}", format)),
    }

    Ok(())
}
