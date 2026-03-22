use tauri::State;

use crate::{
    app_state::AppState,
    storage::{db, models::StorageStatusDto},
};

#[tauri::command]
pub fn debug_get_storage_status(state: State<AppState>) -> Result<StorageStatusDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    let schema_version = db::read_schema_version(&connection).map_err(|error| error.to_string())?;
    let tables = db::list_application_tables(&connection).map_err(|error| error.to_string())?;

    Ok(StorageStatusDto {
        db_path: state.db_path().display().to_string(),
        schema_version,
        tables,
    })
}
