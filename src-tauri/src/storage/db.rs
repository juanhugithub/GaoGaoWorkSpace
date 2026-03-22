use std::{
    fs,
    path::{Path, PathBuf},
};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::storage::StorageResult;

pub const DATABASE_FILE_NAME: &str = "personal_os.sqlite3";

pub fn resolve_database_path(app_handle: &AppHandle) -> StorageResult<PathBuf> {
    let app_local_data_dir = app_handle.path().app_local_data_dir()?;
    fs::create_dir_all(&app_local_data_dir)?;
    Ok(app_local_data_dir.join(DATABASE_FILE_NAME))
}

pub fn open_connection(db_path: impl AsRef<Path>) -> StorageResult<Connection> {
    let connection = Connection::open(db_path)?;
    configure_connection(&connection)?;
    Ok(connection)
}

pub fn list_application_tables(connection: &Connection) -> StorageResult<Vec<String>> {
    let mut statement = connection.prepare(
        "
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        ",
    )?;

    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    let tables = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(tables)
}

pub fn read_schema_version(connection: &Connection) -> StorageResult<i64> {
    let version = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    Ok(version)
}

fn configure_connection(connection: &Connection) -> StorageResult<()> {
    connection.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;
        ",
    )?;

    Ok(())
}
