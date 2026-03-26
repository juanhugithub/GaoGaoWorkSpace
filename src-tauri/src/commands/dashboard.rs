use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    thread,
    time::Duration,
};

use calamine::{open_workbook_auto, Data, Range, Reader};
use chrono::{DateTime, Local, Utc};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::{params, Connection, OptionalExtension};
use rust_xlsxwriter::Workbook;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    storage::{
        db,
        models::{
            ColumnMappingDto, DashboardFilterOptionsDto, DataSourceConfigDto, DataSourceDto,
            DataSourceSyncResultDto, ExcelSheetScanDto, ExcelStructureDto, MappingPreviewDto,
            MappingPreviewRowDto, OperationResultDto, ProjectDto,
        },
        StorageResult,
    },
};

const DASHBOARD_SYNC_COMPLETE_EVENT: &str = "dashboard://sync-complete";
const DASHBOARD_SYNC_ERROR_EVENT: &str = "dashboard://sync-error";
const STANDARD_FIELDS: [&str; 10] = [
    "year",
    "district",
    "level",
    "category",
    "name",
    "enterprise",
    "upper_amount",
    "local_amount",
    "amount",
    "progress",
];

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<ProjectDto>, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    list_projects_internal(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_data_sources(state: State<AppState>) -> Result<Vec<DataSourceDto>, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    list_data_sources_internal(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_dashboard_filter_options(
    state: State<AppState>,
) -> Result<DashboardFilterOptionsDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    list_dashboard_filter_options_internal(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_excel_headers(path: String) -> Result<Vec<String>, String> {
    read_excel_headers_internal(Path::new(path.trim()), None, None)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_excel_structure(
    path: String,
    sheet_name: Option<String>,
    header_row_number: Option<i64>,
) -> Result<ExcelStructureDto, String> {
    read_excel_structure_internal(
        Path::new(path.trim()),
        sheet_name.as_deref(),
        header_row_number,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_mapping_and_sync(
    app: AppHandle,
    state: State<AppState>,
    source_id: Option<String>,
    file_path: String,
    sheet_name: Option<String>,
    header_row_number: Option<i64>,
    mappings: Vec<ColumnMappingDto>,
) -> Result<DataSourceSyncResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    let source_id = save_source_mapping_internal(
        &connection,
        source_id.as_deref(),
        file_path.trim(),
        sheet_name.as_deref(),
        header_row_number,
        &mappings,
    )
    .map_err(|error| error.to_string())?;

    let result = sync_source_internal(&connection, &source_id).map_err(|error| {
        let message = error.to_string();
        let _ = mark_source_sync_failed(&connection, &source_id, &message);
        message
    })?;

    ensure_dashboard_watcher(&app, &state, &result.source_id, &result.file_path)
        .map_err(|error| error.to_string())?;
    let _ = app.emit(DASHBOARD_SYNC_COMPLETE_EVENT, result.clone());
    Ok(result)
}

#[tauri::command]
pub fn get_data_source_config(
    state: State<AppState>,
    source_id: String,
) -> Result<DataSourceConfigDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    get_data_source_config_internal(&connection, &source_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resync_data_source(
    app: AppHandle,
    state: State<AppState>,
    source_id: String,
) -> Result<DataSourceSyncResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    let result = sync_source_internal(&connection, &source_id).map_err(|error| {
        let message = error.to_string();
        let _ = mark_source_sync_failed(&connection, &source_id, &message);
        message
    })?;

    let _ = ensure_dashboard_watcher(&app, &state, &result.source_id, &result.file_path);
    let _ = app.emit(DASHBOARD_SYNC_COMPLETE_EVENT, result.clone());
    Ok(result)
}

#[tauri::command]
pub fn clear_data_source_cache(
    state: State<AppState>,
    source_id: String,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    clear_data_source_cache_internal(&connection, &source_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_data_source(
    state: State<AppState>,
    source_id: String,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    delete_data_source_internal(&connection, &state, &source_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn preview_mapping_rows(
    path: String,
    sheet_name: Option<String>,
    header_row_number: Option<i64>,
    mappings: Vec<ColumnMappingDto>,
    limit: Option<usize>,
) -> Result<MappingPreviewDto, String> {
    preview_mapping_rows_internal(
        Path::new(path.trim()),
        sheet_name.as_deref(),
        header_row_number,
        &mappings,
        limit.unwrap_or(5),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_projects_excel(
    projects: Vec<ProjectDto>,
    output_path: String,
) -> Result<String, String> {
    export_projects_excel_internal(&projects, Path::new(output_path.trim()))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_project_source_file(
    state: State<AppState>,
    project_id: i64,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    let source_path = connection
        .query_row(
            "
            SELECT data_sources.file_path
            FROM projects
            INNER JOIN data_sources ON data_sources.id = projects.source_id
            WHERE projects.id = ?1
            ",
            [project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "project does not have an associated source file".to_string())?;

    super::workspace::open_path_with_system(source_path)
}

pub fn initialize_dashboard_watchers(app: &AppHandle, state: &AppState) -> StorageResult<()> {
    let connection = db::open_connection(state.db_path())?;
    for (source_id, file_path) in list_data_source_paths_internal(&connection)? {
        let _ = ensure_dashboard_watcher(app, state, &source_id, &file_path);
    }
    Ok(())
}

fn list_projects_internal(connection: &Connection) -> StorageResult<Vec<ProjectDto>> {
    let mut statement = connection.prepare(
        "
        SELECT
            projects.id,
            projects.source_id,
            data_sources.file_path,
            projects.year,
            projects.district,
            projects.level,
            projects.category,
            projects.name,
            projects.enterprise,
            projects.progress,
            projects.upper_amount,
            projects.local_amount,
            CASE
                WHEN COALESCE(projects.upper_amount, 0) != 0 OR COALESCE(projects.local_amount, 0) != 0
                    THEN COALESCE(projects.upper_amount, 0) + COALESCE(projects.local_amount, 0)
                ELSE COALESCE(projects.amount, 0)
            END AS total_amount
        FROM projects
        LEFT JOIN data_sources ON data_sources.id = projects.source_id
        ORDER BY projects.created_at DESC, projects.id DESC
        ",
    )?;

    let rows = statement.query_map([], |row| {
        Ok(ProjectDto {
            id: row.get(0)?,
            source_id: row.get::<_, Option<String>>(1)?,
            source_path: row.get::<_, Option<String>>(2)?,
            year: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            district: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
            level: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            category: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
            name: row.get(7)?,
            enterprise: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
            progress: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
            upper_amount: row.get::<_, Option<f64>>(10)?.unwrap_or(0.0),
            local_amount: row.get::<_, Option<f64>>(11)?.unwrap_or(0.0),
            amount: row.get::<_, Option<f64>>(12)?.unwrap_or(0.0),
        })
    })?;

    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn list_data_sources_internal(connection: &Connection) -> StorageResult<Vec<DataSourceDto>> {
    let mut statement = connection.prepare(
        "
        SELECT
            data_sources.id,
            data_sources.file_path,
            data_sources.sheet_name,
            data_sources.header_row_number,
            data_sources.last_sync_time,
            data_sources.last_sync_status,
            data_sources.last_error_message,
            COUNT(projects.id) AS cached_project_count
        FROM data_sources
        LEFT JOIN projects ON projects.source_id = data_sources.id
        GROUP BY
            data_sources.id,
            data_sources.file_path,
            data_sources.sheet_name,
            data_sources.header_row_number,
            data_sources.last_sync_time,
            data_sources.last_sync_status,
            data_sources.last_error_message,
            data_sources.updated_at,
            data_sources.created_at
        ORDER BY data_sources.updated_at DESC, data_sources.created_at DESC
        ",
    )?;

    let rows = statement.query_map([], |row| {
        let file_path = row.get::<_, String>(1)?;
        let last_sync_time = row.get::<_, Option<String>>(4)?;
        Ok(DataSourceDto {
            id: row.get(0)?,
            file_path: file_path.clone(),
            file_name: file_name_from_path(&file_path),
            sheet_name: row.get(2)?,
            header_row_number: row.get(3)?,
            cached_project_count: row.get(7)?,
            last_sync_time: last_sync_time.clone(),
            last_sync_label: format_sync_label(last_sync_time.as_deref()),
            last_sync_status: row.get(5)?,
            last_error_message: row.get(6)?,
        })
    })?;

    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn get_data_source_config_internal(
    connection: &Connection,
    source_id: &str,
) -> StorageResult<DataSourceConfigDto> {
    let row = connection
        .query_row(
            "
            SELECT
                data_sources.id,
                data_sources.file_path,
                data_sources.sheet_name,
                data_sources.header_row_number,
                data_sources.last_sync_time,
                data_sources.last_sync_status,
                data_sources.last_error_message,
                COUNT(projects.id) AS cached_project_count
            FROM data_sources
            LEFT JOIN projects ON projects.source_id = data_sources.id
            WHERE data_sources.id = ?1
            GROUP BY
                data_sources.id,
                data_sources.file_path,
                data_sources.sheet_name,
                data_sources.header_row_number,
                data_sources.last_sync_time,
                data_sources.last_sync_status,
                data_sources.last_error_message
            ",
            [source_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| format!("data source not found: {source_id}"))?;

    let mut statement = connection.prepare(
        "
        SELECT standard_field, excel_column
        FROM column_mappings
        WHERE source_id = ?1
        ORDER BY standard_field ASC
        ",
    )?;
    let rows = statement.query_map([source_id], |row| {
        Ok(ColumnMappingDto {
            standard_field: row.get(0)?,
            excel_column: row.get(1)?,
        })
    })?;

    let mappings = rows.collect::<Result<Vec<_>, _>>()?;

    Ok(DataSourceConfigDto {
        id: row.0,
        file_path: row.1.clone(),
        file_name: file_name_from_path(&row.1),
        sheet_name: row.2,
        header_row_number: row.3,
        cached_project_count: row.7,
        last_sync_time: row.4.clone(),
        last_sync_label: format_sync_label(row.4.as_deref()),
        last_sync_status: row.5,
        last_error_message: row.6,
        mappings,
    })
}

fn list_dashboard_filter_options_internal(
    connection: &Connection,
) -> StorageResult<DashboardFilterOptionsDto> {
    Ok(DashboardFilterOptionsDto {
        categories: list_distinct_strings(connection, "category")?,
        progresses: list_distinct_strings(connection, "progress")?,
    })
}

fn list_distinct_strings(connection: &Connection, column_name: &str) -> StorageResult<Vec<String>> {
    let sql = format!(
        "
        SELECT DISTINCT {column_name}
        FROM projects
        WHERE COALESCE(TRIM({column_name}), '') != ''
        ORDER BY {column_name} COLLATE NOCASE ASC
        "
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn list_data_source_paths_internal(
    connection: &Connection,
) -> StorageResult<Vec<(String, String)>> {
    let mut statement = connection.prepare(
        "
        SELECT id, file_path
        FROM data_sources
        ORDER BY updated_at DESC, created_at DESC
        ",
    )?;
    let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn save_source_mapping_internal(
    connection: &Connection,
    existing_source_id: Option<&str>,
    file_path: &str,
    selected_sheet_name: Option<&str>,
    header_row_number: Option<i64>,
    mappings: &[ColumnMappingDto],
) -> StorageResult<String> {
    let path = Path::new(file_path);
    validate_excel_source_path(path)?;
    validate_column_mappings(mappings)?;

    let structure = read_excel_structure_internal(path, selected_sheet_name, header_row_number)?;
    if structure.headers.is_empty() {
        return Err("selected worksheet does not expose a usable header row".into());
    }

    let sheet_name = structure.selected_sheet;
    let header_row_number = structure.selected_header_row_number;
    let transaction = connection.unchecked_transaction()?;

    let source_id = if let Some(source_id) = existing_source_id {
        let conflict = transaction
            .query_row(
                "
                SELECT id
                FROM data_sources
                WHERE file_path = ?1
                  AND sheet_name = ?2
                  AND id != ?3
                ",
                params![file_path, sheet_name.as_str(), source_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        if conflict.is_some() {
            return Err("data source already exists for this worksheet".into());
        }

        let updated = transaction.execute(
            "
            UPDATE data_sources
            SET file_path = ?2,
                sheet_name = ?3,
                header_row_number = ?4,
                last_error_message = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            ",
            params![source_id, file_path, sheet_name.as_str(), header_row_number],
        )?;

        if updated == 0 {
            return Err(format!("data source not found: {source_id}").into());
        }

        source_id.to_string()
    } else {
        let source_id = transaction
            .query_row(
                "
                SELECT id
                FROM data_sources
                WHERE file_path = ?1
                  AND sheet_name = ?2
                ",
                params![file_path, sheet_name.as_str()],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        transaction.execute(
            "
            INSERT INTO data_sources (
                id,
                file_path,
                sheet_name,
                header_row_number,
                last_sync_time,
                last_sync_status,
                last_error_message
            )
            VALUES (?1, ?2, ?3, ?4, NULL, 'never', NULL)
            ON CONFLICT(file_path, sheet_name) DO UPDATE SET
                header_row_number = excluded.header_row_number,
                last_error_message = NULL,
                updated_at = CURRENT_TIMESTAMP
            ",
            params![source_id, file_path, sheet_name.as_str(), header_row_number],
        )?;

        source_id
    };

    transaction.execute(
        "DELETE FROM column_mappings WHERE source_id = ?1",
        [&source_id],
    )?;

    for mapping in mappings {
        let standard_field = mapping.standard_field.trim();
        let excel_column = mapping.excel_column.trim();
        if standard_field.is_empty() || excel_column.is_empty() {
            continue;
        }

        transaction.execute(
            "
            INSERT INTO column_mappings (source_id, standard_field, excel_column)
            VALUES (?1, ?2, ?3)
            ",
            params![source_id, standard_field, excel_column],
        )?;
    }

    transaction.commit()?;
    Ok(source_id)
}

fn clear_data_source_cache_internal(
    connection: &Connection,
    source_id: &str,
) -> StorageResult<OperationResultDto> {
    let exists = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM data_sources WHERE id = ?1)",
        [source_id],
        |row| row.get::<_, i64>(0),
    )? == 1;

    if !exists {
        return Err(format!("data source not found: {source_id}").into());
    }

    let deleted_count =
        connection.execute("DELETE FROM projects WHERE source_id = ?1", [source_id])?;
    connection.execute(
        "
        UPDATE data_sources
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?1
        ",
        [source_id],
    )?;

    Ok(OperationResultDto {
        success: true,
        message: format!("cleared {deleted_count} cached rows"),
    })
}

fn delete_data_source_internal(
    connection: &Connection,
    state: &AppState,
    source_id: &str,
) -> StorageResult<OperationResultDto> {
    let affected = connection.execute("DELETE FROM data_sources WHERE id = ?1", [source_id])?;
    if affected == 0 {
        return Err(format!("data source not found: {source_id}").into());
    }

    if let Ok(mut watchers) = state.dashboard_watchers().lock() {
        watchers.remove(source_id);
    }
    if let Ok(mut debounce) = state.dashboard_debounce().lock() {
        debounce.remove(source_id);
    }

    Ok(OperationResultDto {
        success: true,
        message: "data source deleted".to_string(),
    })
}

fn sync_source_internal(
    connection: &Connection,
    source_id: &str,
) -> StorageResult<DataSourceSyncResultDto> {
    let source = load_source_config_internal(connection, source_id)?;
    let rows = parse_excel_rows_with_mappings(
        Path::new(&source.file_path),
        &source.sheet_name,
        source.header_row_number,
        &source.mappings,
    )?;

    let transaction = connection.unchecked_transaction()?;
    transaction.execute("DELETE FROM projects WHERE source_id = ?1", [source_id])?;

    let mut synced_count = 0usize;
    for row in rows {
        if row.name.trim().is_empty() {
            continue;
        }

        transaction.execute(
            "
            INSERT INTO projects (
                source_id,
                year,
                district,
                level,
                category,
                name,
                enterprise,
                progress,
                upper_amount,
                local_amount,
                amount
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ",
            params![
                source_id,
                row.year,
                row.district,
                row.level,
                row.category,
                row.name,
                row.enterprise,
                row.progress,
                row.upper_amount,
                row.local_amount,
                row.amount
            ],
        )?;
        synced_count += 1;
    }

    let last_sync_time = Utc::now().to_rfc3339();
    transaction.execute(
        "
        UPDATE data_sources
        SET last_sync_time = ?2,
            last_sync_status = 'success',
            last_error_message = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?1
        ",
        params![source_id, last_sync_time],
    )?;
    transaction.commit()?;

    Ok(DataSourceSyncResultDto {
        source_id: source_id.to_string(),
        file_path: source.file_path,
        sheet_name: source.sheet_name,
        header_row_number: source.header_row_number,
        synced_count,
        last_sync_time,
    })
}

fn load_source_config_internal(
    connection: &Connection,
    source_id: &str,
) -> StorageResult<SourceConfig> {
    let (file_path, sheet_name, header_row_number) = connection
        .query_row(
            "
            SELECT file_path, sheet_name, header_row_number
            FROM data_sources
            WHERE id = ?1
            ",
            [source_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| format!("data source not found: {source_id}"))?;

    let mut statement = connection.prepare(
        "
        SELECT standard_field, excel_column
        FROM column_mappings
        WHERE source_id = ?1
        ",
    )?;
    let rows = statement.query_map([source_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut mappings = HashMap::new();
    for row in rows {
        let (standard_field, excel_column) = row?;
        mappings.insert(standard_field, excel_column);
    }

    if mappings
        .get("name")
        .map(|value| value.trim().is_empty())
        .unwrap_or(true)
    {
        return Err("project name mapping is required".into());
    }

    Ok(SourceConfig {
        file_path,
        sheet_name,
        header_row_number: normalize_header_row_number(header_row_number),
        mappings,
    })
}

fn read_excel_headers_internal(
    path: &Path,
    sheet_name: Option<&str>,
    header_row_number: Option<i64>,
) -> StorageResult<Vec<String>> {
    Ok(read_excel_structure_internal(path, sheet_name, header_row_number)?.headers)
}

fn read_excel_structure_internal(
    path: &Path,
    preferred_sheet_name: Option<&str>,
    preferred_header_row_number: Option<i64>,
) -> StorageResult<ExcelStructureDto> {
    validate_excel_source_path(path)?;
    let mut workbook = open_workbook_auto(path)?;
    let sheet_names = workbook.sheet_names().to_vec();
    if sheet_names.is_empty() {
        return Err("Excel workbook has no worksheets".into());
    }

    let preferred_sheet_name = preferred_sheet_name
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let mut sheet_scans = Vec::with_capacity(sheet_names.len());

    for sheet_name in &sheet_names {
        let requested_header_row_number = (preferred_sheet_name == Some(sheet_name.as_str()))
            .then_some(preferred_header_row_number)
            .flatten();
        let scan = match workbook.worksheet_range(sheet_name) {
            Ok(range) => analyze_sheet(&range, sheet_name, requested_header_row_number),
            Err(error) => ExcelSheetScanDto {
                name: sheet_name.clone(),
                status: "error".to_string(),
                note: format!("failed to read worksheet: {error}"),
                total_non_empty_rows: 0,
                header_row_number: requested_header_row_number.unwrap_or(1).max(1),
                headers: Vec::new(),
                preview_rows: Vec::new(),
            },
        };
        sheet_scans.push(scan);
    }

    let selected_sheet = resolve_selected_sheet_name(&sheet_scans, preferred_sheet_name)?;
    let selected_scan = sheet_scans
        .iter()
        .find(|scan| scan.name == selected_sheet)
        .ok_or_else(|| "selected worksheet scan not found".to_string())?;
    let selected_header_row_number = selected_scan.header_row_number;
    let selected_headers = selected_scan.headers.clone();

    Ok(ExcelStructureDto {
        sheets: sheet_scans,
        selected_sheet,
        selected_header_row_number,
        headers: selected_headers,
    })
}

fn resolve_sheet_name(
    sheet_names: &[String],
    preferred_sheet_name: Option<&str>,
) -> StorageResult<Option<String>> {
    if sheet_names.is_empty() {
        return Ok(None);
    }

    let preferred_sheet_name = preferred_sheet_name
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(preferred_sheet_name) = preferred_sheet_name {
        let matched = sheet_names
            .iter()
            .find(|sheet_name| sheet_name.trim() == preferred_sheet_name)
            .cloned();
        return matched
            .map(Some)
            .ok_or_else(|| format!("worksheet not found: {preferred_sheet_name}").into());
    }

    Ok(sheet_names.first().cloned())
}

fn parse_excel_rows_with_mappings(
    path: &Path,
    sheet_name: &str,
    header_row_number: i64,
    mappings: &HashMap<String, String>,
) -> StorageResult<Vec<ParsedProjectRow>> {
    validate_excel_source_path(path)?;
    let mut workbook = open_workbook_auto(path)?;
    let selected_sheet = resolve_sheet_name(&workbook.sheet_names(), Some(sheet_name))?
        .ok_or_else(|| "Excel workbook has no worksheets".to_string())?;
    let range = workbook
        .worksheet_range(&selected_sheet)
        .map_err(|error| error.to_string())?;

    let header_row_index = resolve_header_row_index(&range, Some(header_row_number))?;
    let headers = header_values_from_row(&range, header_row_index)?;
    let header_map = build_header_index_map(headers.iter().map(String::as_str));
    let duplicated_headers = duplicated_normalized_headers(headers.iter().map(String::as_str));
    validate_mapping_headers(mappings, &header_map, &duplicated_headers)?;

    let mut parsed_rows = Vec::new();
    for (row_index, row) in range.rows().enumerate().skip(header_row_index + 1) {
        let raw_district = field_from_excel_row(row, &header_map, mappings, "district");
        let raw_level = field_from_excel_row(row, &header_map, mappings, "level");
        let raw_category = field_from_excel_row(row, &header_map, mappings, "category");
        let upper_amount_raw = field_from_excel_row(row, &header_map, mappings, "upper_amount");
        let local_amount_raw = field_from_excel_row(row, &header_map, mappings, "local_amount");
        let legacy_amount_raw = field_from_excel_row(row, &header_map, mappings, "amount");
        let (upper_amount, local_amount, total_amount) =
            resolve_project_amounts(&upper_amount_raw, &local_amount_raw, &legacy_amount_raw);

        let parsed_row = ParsedProjectRow {
            row_number: row_index + 1,
            year: field_from_excel_row(row, &header_map, mappings, "year"),
            district: normalize_district(&raw_district),
            level: normalize_project_level(&raw_level, &raw_category),
            category: raw_category.trim().to_string(),
            name: field_from_excel_row(row, &header_map, mappings, "name"),
            enterprise: field_from_excel_row(row, &header_map, mappings, "enterprise"),
            progress: field_from_excel_row(row, &header_map, mappings, "progress"),
            upper_amount,
            local_amount,
            amount: total_amount,
        };

        if parsed_row.is_empty() {
            continue;
        }

        parsed_rows.push(parsed_row);
    }

    Ok(parsed_rows)
}

fn preview_mapping_rows_internal(
    path: &Path,
    sheet_name: Option<&str>,
    header_row_number: Option<i64>,
    mappings: &[ColumnMappingDto],
    limit: usize,
) -> StorageResult<MappingPreviewDto> {
    validate_column_mappings(mappings)?;
    let structure = read_excel_structure_internal(path, sheet_name, header_row_number)?;
    let mapping_map = mappings
        .iter()
        .filter_map(|mapping| {
            let standard_field = mapping.standard_field.trim();
            if standard_field.is_empty() {
                return None;
            }
            Some((
                standard_field.to_string(),
                mapping.excel_column.trim().to_string(),
            ))
        })
        .collect::<HashMap<_, _>>();

    let rows = parse_excel_rows_with_mappings(
        path,
        &structure.selected_sheet,
        structure.selected_header_row_number,
        &mapping_map,
    )?;

    Ok(MappingPreviewDto {
        total_rows: rows.len(),
        preview_rows: rows
            .iter()
            .take(limit.clamp(1, 10))
            .map(|row| MappingPreviewRowDto {
                row_number: row.row_number,
                year: row.year.clone(),
                district: row.district.clone(),
                level: row.level.clone(),
                category: row.category.clone(),
                name: row.name.clone(),
                enterprise: row.enterprise.clone(),
                progress: row.progress.clone(),
                upper_amount: row.upper_amount,
                local_amount: row.local_amount,
                amount: row.amount,
            })
            .collect(),
    })
}

fn analyze_sheet(
    range: &Range<Data>,
    sheet_name: &str,
    requested_header_row_number: Option<i64>,
) -> ExcelSheetScanDto {
    let total_non_empty_rows = range.rows().filter(|row| row_has_value(row)).count();
    if total_non_empty_rows == 0 {
        return ExcelSheetScanDto {
            name: sheet_name.to_string(),
            status: "empty".to_string(),
            note: "worksheet is empty".to_string(),
            total_non_empty_rows,
            header_row_number: requested_header_row_number.unwrap_or(1).max(1),
            headers: Vec::new(),
            preview_rows: Vec::new(),
        };
    }

    let header_row_index = match resolve_header_row_index(range, requested_header_row_number) {
        Ok(index) => index,
        Err(error) => {
            return ExcelSheetScanDto {
                name: sheet_name.to_string(),
                status: "warning".to_string(),
                note: error.to_string(),
                total_non_empty_rows,
                header_row_number: requested_header_row_number.unwrap_or(1).max(1),
                headers: Vec::new(),
                preview_rows: Vec::new(),
            };
        }
    };

    let full_headers = match header_values_from_row(range, header_row_index) {
        Ok(headers) => headers,
        Err(error) => {
            return ExcelSheetScanDto {
                name: sheet_name.to_string(),
                status: "warning".to_string(),
                note: error.to_string(),
                total_non_empty_rows,
                header_row_number: header_row_index as i64 + 1,
                headers: Vec::new(),
                preview_rows: Vec::new(),
            };
        }
    };

    let headers = visible_headers(&full_headers);
    let preview_rows = collect_preview_rows(range, header_row_index, 5);
    let note = if headers.is_empty() {
        format!(
            "row {} does not expose usable headers",
            header_row_index + 1
        )
    } else if requested_header_row_number.is_some() {
        format!("using row {} as the header row", header_row_index + 1)
    } else if headers.len() < 2 {
        format!(
            "row {} is a low-confidence header guess",
            header_row_index + 1
        )
    } else {
        format!("row {} is the recommended header row", header_row_index + 1)
    };

    ExcelSheetScanDto {
        name: sheet_name.to_string(),
        status: if headers.is_empty() {
            "warning".to_string()
        } else if requested_header_row_number.is_none() && headers.len() < 2 {
            "warning".to_string()
        } else {
            "ready".to_string()
        },
        note,
        total_non_empty_rows,
        header_row_number: header_row_index as i64 + 1,
        headers,
        preview_rows,
    }
}

fn resolve_selected_sheet_name(
    sheet_scans: &[ExcelSheetScanDto],
    preferred_sheet_name: Option<&str>,
) -> StorageResult<String> {
    if sheet_scans.is_empty() {
        return Err("Excel workbook has no worksheets".into());
    }

    if let Some(preferred_sheet_name) = preferred_sheet_name {
        return sheet_scans
            .iter()
            .find(|scan| scan.name.trim() == preferred_sheet_name)
            .map(|scan| scan.name.clone())
            .ok_or_else(|| format!("worksheet not found: {preferred_sheet_name}").into());
    }

    if let Some(scan) = sheet_scans
        .iter()
        .find(|scan| matches!(scan.status.as_str(), "ready" | "warning"))
    {
        return Ok(scan.name.clone());
    }

    Ok(sheet_scans[0].name.clone())
}

fn resolve_header_row_index(
    range: &Range<Data>,
    requested_header_row_number: Option<i64>,
) -> StorageResult<usize> {
    if let Some(header_row_number) = requested_header_row_number {
        let header_row_number = normalize_header_row_number(header_row_number);
        let header_row_index = header_row_number.saturating_sub(1) as usize;
        let headers = header_values_from_row(range, header_row_index)?;
        if visible_headers(&headers).is_empty() {
            return Err(format!("row {header_row_number} does not expose usable headers").into());
        }
        return Ok(header_row_index);
    }

    detect_header_row_index(range).ok_or_else(|| "failed to auto-detect a header row".into())
}

fn detect_header_row_index(range: &Range<Data>) -> Option<usize> {
    let candidates = range
        .rows()
        .enumerate()
        .filter_map(|(row_index, row)| {
            let values = trimmed_row_values(row);
            let non_empty = values
                .iter()
                .filter(|value| !value.is_empty())
                .cloned()
                .collect::<Vec<_>>();
            if non_empty.is_empty() {
                return None;
            }

            let non_empty_count = non_empty.len() as i64;
            let unique_count = non_empty
                .iter()
                .map(|value| normalize_header(value))
                .filter(|value| !value.is_empty())
                .collect::<HashSet<_>>()
                .len() as i64;
            let keyword_hits = non_empty
                .iter()
                .filter(|value| looks_like_standard_header(value))
                .count() as i64;
            let short_text_count = non_empty
                .iter()
                .filter(|value| value.chars().count() <= 20)
                .count() as i64;
            let numeric_like_count = non_empty
                .iter()
                .filter(|value| looks_numeric(value))
                .count() as i64;
            let long_text_count = non_empty
                .iter()
                .filter(|value| value.chars().count() > 30)
                .count() as i64;

            let mut score =
                non_empty_count * 10 + unique_count * 4 + keyword_hits * 12 + short_text_count * 2;
            score -= numeric_like_count * 6;
            score -= long_text_count * 5;
            if non_empty_count == 1 {
                score -= 20;
            }

            Some((row_index, non_empty_count, score))
        })
        .collect::<Vec<_>>();

    if candidates.is_empty() {
        return None;
    }

    let has_multi_column_candidate = candidates
        .iter()
        .any(|(_, non_empty_count, _)| *non_empty_count >= 2);

    candidates
        .into_iter()
        .filter(|(_, non_empty_count, _)| !has_multi_column_candidate || *non_empty_count >= 2)
        .max_by(|left, right| left.2.cmp(&right.2).then_with(|| right.0.cmp(&left.0)))
        .map(|(row_index, _, _)| row_index)
}

fn header_values_from_row(range: &Range<Data>, row_index: usize) -> StorageResult<Vec<String>> {
    let row = range
        .rows()
        .nth(row_index)
        .ok_or_else(|| format!("row {} is outside worksheet bounds", row_index + 1))?;
    Ok(trimmed_row_values(row))
}

fn trimmed_row_values(row: &[Data]) -> Vec<String> {
    let mut values = row
        .iter()
        .map(cell_to_string)
        .map(|value| value.trim().to_string())
        .collect::<Vec<_>>();
    while values.last().is_some_and(|value| value.is_empty()) {
        values.pop();
    }
    values
}

fn visible_headers(headers: &[String]) -> Vec<String> {
    headers
        .iter()
        .filter(|value| !value.trim().is_empty())
        .cloned()
        .collect()
}

fn collect_preview_rows(
    range: &Range<Data>,
    header_row_index: usize,
    limit: usize,
) -> Vec<Vec<String>> {
    range
        .rows()
        .enumerate()
        .skip(header_row_index + 1)
        .filter_map(|(_, row)| {
            let values = trimmed_row_values(row);
            values
                .iter()
                .any(|value| !value.is_empty())
                .then_some(values)
        })
        .take(limit)
        .collect()
}

fn mark_source_sync_failed(
    connection: &Connection,
    source_id: &str,
    message: &str,
) -> StorageResult<()> {
    connection.execute(
        "
        UPDATE data_sources
        SET last_sync_status = 'error',
            last_error_message = ?2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?1
        ",
        params![source_id, message],
    )?;
    Ok(())
}

fn mark_source_sync_failed_by_id(
    db_path: &Path,
    source_id: &str,
    message: &str,
) -> StorageResult<()> {
    let connection = db::open_connection(db_path)?;
    mark_source_sync_failed(&connection, source_id, message)
}

fn export_projects_excel_internal(
    projects: &[ProjectDto],
    output_path: &Path,
) -> StorageResult<String> {
    if output_path.as_os_str().is_empty() {
        return Err("output path cannot be empty".into());
    }

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    let headers = [
        "年度",
        "区镇",
        "项目级别",
        "项目类别",
        "项目名称",
        "企业名称",
        "进度状态",
        "支持金额(万元)",
    ];

    for (index, header) in headers.iter().enumerate() {
        worksheet.write_string(0, index as u16, *header)?;
    }

    for (row_index, project) in projects.iter().enumerate() {
        let row = (row_index + 1) as u32;
        worksheet.write_string(row, 0, &project.year)?;
        worksheet.write_string(row, 1, &project.district)?;
        worksheet.write_string(row, 2, &project.level)?;
        worksheet.write_string(row, 3, &project.category)?;
        worksheet.write_string(row, 4, &project.name)?;
        worksheet.write_string(row, 5, &project.enterprise)?;
        worksheet.write_string(row, 6, &project.progress)?;
        worksheet.write_number(row, 7, project.amount)?;
    }

    worksheet.autofit();
    workbook.save(output_path)?;
    Ok(output_path.to_string_lossy().to_string())
}

fn ensure_dashboard_watcher(
    app: &AppHandle,
    state: &AppState,
    source_id: &str,
    file_path: &str,
) -> StorageResult<()> {
    let path = PathBuf::from(file_path);
    if !path.exists() {
        return Ok(());
    }

    let db_path = state.db_path().to_path_buf();
    let app_handle = app.clone();
    let watched_source_id = source_id.to_string();
    let watched_path = path.clone();
    let debounce_store = state.dashboard_debounce().clone();

    let watcher = RecommendedWatcher::new(
        move |result: Result<notify::Event, notify::Error>| {
            let Ok(event) = result else {
                let _ = mark_source_sync_failed_by_id(
                    &db_path,
                    &watched_source_id,
                    "file watch failed",
                );
                let _ = app_handle.emit(
                    DASHBOARD_SYNC_ERROR_EVENT,
                    serde_json::json!({
                        "sourceId": watched_source_id,
                        "path": watched_path.to_string_lossy(),
                        "message": "file watch failed",
                    }),
                );
                return;
            };

            if !matches!(
                event.kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Any
            ) {
                return;
            }

            let now = std::time::Instant::now();
            if let Ok(mut debounce_map) = debounce_store.lock() {
                debounce_map.insert(watched_source_id.clone(), now);
            }

            let debounce_store = debounce_store.clone();
            let app_handle = app_handle.clone();
            let db_path = db_path.clone();
            let watched_source_id = watched_source_id.clone();
            let watched_path = watched_path.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(2));

                let should_run = if let Ok(mut debounce_map) = debounce_store.lock() {
                    if debounce_map.get(&watched_source_id).copied() == Some(now) {
                        debounce_map.remove(&watched_source_id);
                        true
                    } else {
                        false
                    }
                } else {
                    false
                };

                if !should_run {
                    return;
                }

                match sync_source_with_retry_by_id(&db_path, &watched_source_id) {
                    Ok(result) => {
                        let _ = app_handle.emit(DASHBOARD_SYNC_COMPLETE_EVENT, result);
                    }
                    Err(error) => {
                        let _ = app_handle.emit(
                            DASHBOARD_SYNC_ERROR_EVENT,
                            serde_json::json!({
                                "sourceId": watched_source_id,
                                "path": watched_path.to_string_lossy(),
                                "message": error.to_string(),
                            }),
                        );
                    }
                }
            });
        },
        Config::default(),
    )?;

    let mut watcher = watcher;
    watcher.watch(&path, RecursiveMode::NonRecursive)?;

    let mut watchers = state
        .dashboard_watchers()
        .lock()
        .map_err(|_| "watcher lock poisoned".to_string())?;
    watchers.insert(source_id.to_string(), watcher);
    Ok(())
}

fn sync_source_with_retry_by_id(
    db_path: &Path,
    source_id: &str,
) -> StorageResult<DataSourceSyncResultDto> {
    let mut last_error = None;
    for _ in 0..3 {
        match db::open_connection(db_path)
            .and_then(|connection| sync_source_internal(&connection, source_id))
        {
            Ok(result) => return Ok(result),
            Err(error) => {
                last_error = Some(error.to_string());
                thread::sleep(Duration::from_millis(500));
            }
        }
    }

    let message = last_error.unwrap_or_else(|| "sync failed".to_string());
    let _ = mark_source_sync_failed_by_id(db_path, source_id, &message);
    Err(message.into())
}

fn validate_excel_source_path(path: &Path) -> StorageResult<()> {
    if path.as_os_str().is_empty() {
        return Err("file path cannot be empty".into());
    }
    if !path.exists() {
        return Err(format!("file does not exist: {}", path.display()).into());
    }
    if !path.is_file() {
        return Err(format!("path is not a file: {}", path.display()).into());
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    if !matches!(extension.as_str(), "xls" | "xlsx" | "xlsm") {
        return Err("only Excel files are supported".into());
    }
    Ok(())
}

fn validate_column_mappings(mappings: &[ColumnMappingDto]) -> StorageResult<()> {
    if mappings.is_empty() {
        return Err("at least one mapping is required".into());
    }

    let mut mapped_fields = HashSet::new();
    let mut name_mapped = false;
    for mapping in mappings {
        let standard_field = mapping.standard_field.trim();
        if !STANDARD_FIELDS.contains(&standard_field) {
            return Err(format!("unsupported standard field: {standard_field}").into());
        }
        if !mapped_fields.insert(standard_field.to_string()) {
            return Err(format!("duplicate mapping for standard field: {standard_field}").into());
        }
        if standard_field == "name" && !mapping.excel_column.trim().is_empty() {
            name_mapped = true;
        }
    }

    if !name_mapped {
        return Err("project name mapping is required".into());
    }
    Ok(())
}

fn validate_mapping_headers(
    mappings: &HashMap<String, String>,
    header_map: &HashMap<String, usize>,
    duplicated_headers: &HashSet<String>,
) -> StorageResult<()> {
    for excel_column in mappings.values() {
        let excel_column = excel_column.trim();
        if excel_column.is_empty() {
            continue;
        }
        let normalized = normalize_header(excel_column);
        if duplicated_headers.contains(&normalized) {
            return Err(format!(
                "mapped header is ambiguous because it appears multiple times: {excel_column}"
            )
            .into());
        }
        if !header_map.contains_key(&normalized) {
            return Err(format!("mapped header not found in worksheet: {excel_column}").into());
        }
    }
    Ok(())
}

fn field_from_excel_row(
    row: &[Data],
    header_map: &HashMap<String, usize>,
    mappings: &HashMap<String, String>,
    standard_field: &str,
) -> String {
    let Some(header_name) = mappings.get(standard_field) else {
        return String::new();
    };
    let header_name = header_name.trim();
    if header_name.is_empty() {
        return String::new();
    }

    let Some(index) = header_map.get(&normalize_header(header_name)) else {
        return String::new();
    };

    row.get(*index)
        .map(cell_to_string)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn build_header_index_map<'a>(headers: impl Iterator<Item = &'a str>) -> HashMap<String, usize> {
    let mut map = HashMap::new();
    for (index, header) in headers.enumerate() {
        let normalized = normalize_header(header);
        if normalized.is_empty() || map.contains_key(&normalized) {
            continue;
        }
        map.insert(normalized, index);
    }
    map
}

fn duplicated_normalized_headers<'a>(headers: impl Iterator<Item = &'a str>) -> HashSet<String> {
    let mut seen = HashSet::new();
    let mut duplicates = HashSet::new();
    for header in headers {
        let normalized = normalize_header(header);
        if normalized.is_empty() {
            continue;
        }
        if !seen.insert(normalized.clone()) {
            duplicates.insert(normalized);
        }
    }
    duplicates
}

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(value) => value.to_string(),
        Data::Float(value) => {
            if value.fract() == 0.0 {
                format!("{}", *value as i64)
            } else {
                value.to_string()
            }
        }
        Data::Int(value) => value.to_string(),
        Data::Bool(value) => {
            if *value {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
        Data::DateTime(value) => value.to_string(),
        Data::DateTimeIso(value) => value.to_string(),
        Data::DurationIso(value) => value.to_string(),
        Data::Error(value) => format!("{value:?}"),
    }
}

fn amount_from_str(value: &str) -> f64 {
    extract_first_number(value).unwrap_or(0.0)
}

fn resolve_project_amounts(
    upper_amount_raw: &str,
    local_amount_raw: &str,
    legacy_amount_raw: &str,
) -> (f64, f64, f64) {
    let upper_amount = amount_from_str(upper_amount_raw);
    let local_amount = amount_from_str(local_amount_raw);
    let legacy_amount = amount_from_str(legacy_amount_raw);

    if upper_amount_raw.trim().is_empty() && local_amount_raw.trim().is_empty() {
        return (legacy_amount, 0.0, legacy_amount);
    }

    let total_amount = upper_amount + local_amount;
    (upper_amount, local_amount, total_amount)
}

fn extract_first_number(value: &str) -> Option<f64> {
    let cleaned = value.replace(',', "").replace('，', "");
    let chars = cleaned.char_indices().collect::<Vec<_>>();
    if chars.is_empty() {
        return None;
    }

    for start_pos in 0..chars.len() {
        let (start_idx, first_char) = chars[start_pos];
        if !matches!(first_char, '+' | '-' | '.' | '0'..='9') {
            continue;
        }

        let mut cursor = start_pos;
        let mut seen_digit = false;
        let mut seen_dot = false;

        if matches!(first_char, '+' | '-') {
            cursor += 1;
            if cursor >= chars.len() {
                continue;
            }
            if chars[cursor].1 == '.' {
                seen_dot = true;
                cursor += 1;
            }
        } else if first_char == '.' {
            seen_dot = true;
            cursor += 1;
        } else {
            seen_digit = true;
            cursor += 1;
        }

        while cursor < chars.len() {
            let char = chars[cursor].1;
            if char.is_ascii_digit() {
                seen_digit = true;
                cursor += 1;
                continue;
            }
            if char == '.' && !seen_dot {
                seen_dot = true;
                cursor += 1;
                continue;
            }
            break;
        }

        if !seen_digit {
            continue;
        }

        let end_idx = chars
            .get(cursor)
            .map(|(index, _)| *index)
            .unwrap_or(cleaned.len());
        let token = cleaned[start_idx..end_idx].trim();
        if matches!(token, "" | "+" | "-" | "." | "+." | "-.") {
            continue;
        }

        if let Ok(mut parsed) = token.parse::<f64>() {
            if start_pos > 0
                && chars[start_pos - 1].1 == '('
                && chars
                    .get(cursor)
                    .map(|(_, char)| *char == ')')
                    .unwrap_or(false)
            {
                parsed = -parsed.abs();
            }
            return Some(parsed);
        }
    }

    None
}

fn row_has_value(row: &[Data]) -> bool {
    row.iter()
        .any(|cell| !cell_to_string(cell).trim().is_empty())
}

fn normalize_header(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|char| char.is_ascii_alphanumeric() || ('\u{4e00}'..='\u{9fa5}').contains(char))
        .collect()
}

fn looks_like_standard_header(value: &str) -> bool {
    matches!(
        normalize_header(value).as_str(),
        "year"
            | "年度"
            | "年份"
            | "district"
            | "区镇"
            | "属地"
            | "区域"
            | "level"
            | "级别"
            | "项目级别"
            | "category"
            | "类别"
            | "项目类别"
            | "name"
            | "项目名称"
            | "enterprise"
            | "企业名称"
            | "企业"
            | "upperamount"
            | "upperfund"
            | "上级经费"
            | "上级资金"
            | "上级支持"
            | "localamount"
            | "localfund"
            | "本级经费"
            | "本级资金"
            | "本级投入"
            | "amount"
            | "支持金额"
            | "金额"
            | "progress"
            | "状态"
            | "进度"
    )
}

fn looks_numeric(value: &str) -> bool {
    let compact = value.replace(',', "").replace('，', "");
    let compact = compact.trim();
    !compact.is_empty()
        && compact
            .chars()
            .all(|char| char.is_ascii_digit() || matches!(char, '.' | '-' | '+' | '%' | '/'))
}

fn normalize_header_row_number(value: i64) -> i64 {
    value.max(1)
}

fn normalize_district(value: &str) -> String {
    let compact = normalize_header(value);
    if compact.is_empty() || compact == "/" {
        return String::new();
    }
    if compact.contains("花桥") {
        return "花桥开发区".to_string();
    }
    if compact.contains("高新区")
        || compact.contains("高新技术产业开发区")
        || compact.contains("高新技术经济开发区")
    {
        return "高新区".to_string();
    }
    if compact.contains("开发区") || compact.contains("经济技术开发区") {
        return "开发区".to_string();
    }
    for name in [
        "张浦",
        "周市",
        "陆家",
        "巴城",
        "千灯",
        "锦溪",
        "周庄",
        "淀山湖",
    ] {
        if compact.contains(&normalize_header(name)) {
            return name.to_string();
        }
    }
    value.trim().trim_end_matches('镇').to_string()
}

fn normalize_project_level(level: &str, category: &str) -> String {
    let level_compact = normalize_header(level);
    let category_compact = normalize_header(category);
    if level_compact.contains("国家") || category_compact.contains("国家") {
        return "国家级".to_string();
    }
    if level_compact.contains("江苏")
        || level_compact.contains("省")
        || category_compact.contains("江苏")
    {
        return "省级".to_string();
    }
    if level_compact.contains("苏州") || category_compact.contains("苏州") {
        return "苏州市级".to_string();
    }
    if level_compact.contains("昆山") || category_compact.contains("昆山") {
        return "昆山本级".to_string();
    }
    level.trim().to_string()
}

fn format_sync_label(last_sync_time: Option<&str>) -> String {
    let Some(last_sync_time) = last_sync_time else {
        return "尚未同步".to_string();
    };
    let Ok(parsed) = DateTime::parse_from_rfc3339(last_sync_time) else {
        return last_sync_time.to_string();
    };
    let parsed = parsed.with_timezone(&Local);
    let diff = Local::now() - parsed;
    if diff.num_minutes() < 1 {
        "刚刚同步".to_string()
    } else if diff.num_minutes() < 60 {
        format!("{} 分钟前同步", diff.num_minutes())
    } else if diff.num_hours() < 24 {
        format!("{} 小时前同步", diff.num_hours())
    } else {
        parsed.format("%Y-%m-%d %H:%M").to_string()
    }
}

fn file_name_from_path(file_path: &str) -> String {
    Path::new(file_path)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| file_path.to_string())
}

#[derive(Debug, Clone)]
struct SourceConfig {
    file_path: String,
    sheet_name: String,
    header_row_number: i64,
    mappings: HashMap<String, String>,
}

#[derive(Debug, Clone)]
struct ParsedProjectRow {
    row_number: usize,
    year: String,
    district: String,
    level: String,
    category: String,
    name: String,
    enterprise: String,
    progress: String,
    upper_amount: f64,
    local_amount: f64,
    amount: f64,
}

impl ParsedProjectRow {
    fn is_empty(&self) -> bool {
        self.year.trim().is_empty()
            && self.district.trim().is_empty()
            && self.level.trim().is_empty()
            && self.category.trim().is_empty()
            && self.name.trim().is_empty()
            && self.enterprise.trim().is_empty()
            && self.progress.trim().is_empty()
            && self.upper_amount == 0.0
            && self.local_amount == 0.0
            && self.amount == 0.0
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use rust_xlsxwriter::Workbook;

    use super::{
        amount_from_str, normalize_district, normalize_project_level,
        parse_excel_rows_with_mappings, read_excel_structure_internal, validate_column_mappings,
        validate_excel_source_path, ColumnMappingDto,
    };

    #[test]
    fn validates_excel_path_rejects_directory() {
        let temp_dir = unique_temp_dir_path("dashboard-dir");
        fs::create_dir_all(&temp_dir).expect("create temp directory");

        let error =
            validate_excel_source_path(&temp_dir).expect_err("directory should be rejected");
        assert!(error.to_string().contains("not a file"));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn validates_column_mappings_rejects_duplicate_standard_field() {
        let mappings = vec![
            ColumnMappingDto {
                standard_field: "name".to_string(),
                excel_column: "项目名称".to_string(),
            },
            ColumnMappingDto {
                standard_field: "name".to_string(),
                excel_column: "项目名称2".to_string(),
            },
        ];

        let error = validate_column_mappings(&mappings).expect_err("duplicate fields should fail");
        assert!(error.to_string().contains("duplicate mapping"));
    }

    #[test]
    fn reads_excel_structure_for_multi_sheet_and_detects_header_row() {
        let workbook_path = unique_temp_file_path("dashboard-structure", "xlsx");
        let mut workbook = Workbook::new();

        let summary = workbook.add_worksheet();
        summary.set_name("Summary").expect("set summary sheet name");
        summary
            .write_string(0, 0, "昆山市项目台账（标题行）")
            .expect("write summary title");
        summary
            .write_string(2, 0, "年度")
            .expect("write summary header year");
        summary
            .write_string(2, 1, "区镇")
            .expect("write summary header district");
        summary
            .write_string(2, 2, "项目类别")
            .expect("write summary header category");
        summary
            .write_string(2, 3, "项目名称")
            .expect("write summary header name");
        summary
            .write_string(3, 0, "2026")
            .expect("write summary data year");
        summary
            .write_string(3, 1, "花桥镇")
            .expect("write summary data district");
        summary
            .write_string(3, 2, "苏州市级示范")
            .expect("write summary data category");
        summary
            .write_string(3, 3, "示例项目")
            .expect("write summary data name");

        let empty = workbook.add_worksheet();
        empty.set_name("Empty").expect("set empty sheet name");

        workbook.save(&workbook_path).expect("save workbook");

        let structure = read_excel_structure_internal(&workbook_path, None, None)
            .expect("read workbook structure");
        assert_eq!(structure.sheets.len(), 2);
        assert_eq!(structure.selected_sheet, "Summary");
        assert_eq!(structure.selected_header_row_number, 3);
        assert!(structure.headers.iter().any(|header| header == "项目名称"));
        let empty_sheet = structure
            .sheets
            .iter()
            .find(|sheet| sheet.name == "Empty")
            .expect("empty sheet should exist");
        assert_eq!(empty_sheet.status, "empty");

        let _ = fs::remove_file(workbook_path);
    }

    #[test]
    fn reads_excel_structure_honors_requested_sheet_and_header_row() {
        let workbook_path = unique_temp_file_path("dashboard-sheet-select", "xlsx");
        let mut workbook = Workbook::new();

        let first = workbook.add_worksheet();
        first.set_name("Main").expect("set main sheet name");
        first
            .write_string(0, 0, "项目名称")
            .expect("write main header");
        first
            .write_string(1, 0, "主表项目")
            .expect("write main row");

        let second = workbook.add_worksheet();
        second.set_name("Detail").expect("set detail sheet name");
        second
            .write_string(0, 0, "明细标题行")
            .expect("write detail title");
        second
            .write_string(1, 0, "项目名称")
            .expect("write detail header");
        second
            .write_string(1, 1, "支持金额")
            .expect("write detail header amount");
        second
            .write_string(2, 0, "明细项目")
            .expect("write detail data");
        second
            .write_string(2, 1, "88")
            .expect("write detail amount");

        workbook.save(&workbook_path).expect("save workbook");

        let structure = read_excel_structure_internal(&workbook_path, Some("Detail"), Some(2))
            .expect("read detail sheet structure");
        assert_eq!(structure.selected_sheet, "Detail");
        assert_eq!(structure.selected_header_row_number, 2);
        assert_eq!(
            structure.headers,
            vec!["项目名称".to_string(), "支持金额".to_string()]
        );

        let _ = fs::remove_file(workbook_path);
    }

    #[test]
    fn parses_rows_and_applies_normalization_rules() {
        let workbook_path = unique_temp_file_path("dashboard-parse", "xlsx");
        let mut workbook = Workbook::new();

        let sheet = workbook.add_worksheet();
        sheet.set_name("Projects").expect("set projects sheet name");
        sheet.write_string(0, 0, "年度").expect("write header year");
        sheet
            .write_string(0, 1, "区镇")
            .expect("write header district");
        sheet
            .write_string(0, 2, "项目类别")
            .expect("write header category");
        sheet
            .write_string(0, 3, "项目名称")
            .expect("write header name");
        sheet
            .write_string(0, 4, "企业名称")
            .expect("write header enterprise");
        sheet
            .write_string(0, 5, "支持金额")
            .expect("write header amount");
        sheet
            .write_string(0, 6, "进度")
            .expect("write header progress");
        sheet.write_string(1, 0, "2026").expect("write data year");
        sheet
            .write_string(1, 1, "花桥镇")
            .expect("write data district");
        sheet
            .write_string(1, 2, "苏州市智能制造项目")
            .expect("write data category");
        sheet
            .write_string(1, 3, "高端装备项目")
            .expect("write data name");
        sheet
            .write_string(1, 4, "示例企业")
            .expect("write data enterprise");
        sheet
            .write_string(1, 5, "￥1,230.5 万元")
            .expect("write data amount");
        sheet
            .write_string(1, 6, "在建")
            .expect("write data progress");

        workbook.save(&workbook_path).expect("save workbook");

        let mappings = mapping_map(&[
            ("year", "年度"),
            ("district", "区镇"),
            ("category", "项目类别"),
            ("name", "项目名称"),
            ("enterprise", "企业名称"),
            ("amount", "支持金额"),
            ("progress", "进度"),
        ]);

        let rows = parse_excel_rows_with_mappings(&workbook_path, "Projects", 1, &mappings)
            .expect("parse rows");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].district, "花桥开发区");
        assert_eq!(rows[0].level, "苏州市级");
        assert!((rows[0].amount - 1230.5).abs() < 0.0001);

        let _ = fs::remove_file(workbook_path);
    }

    #[test]
    fn parse_rejects_ambiguous_duplicate_headers() {
        let workbook_path = unique_temp_file_path("dashboard-duplicate-header", "xlsx");
        let mut workbook = Workbook::new();

        let sheet = workbook.add_worksheet();
        sheet.set_name("Dup").expect("set dup sheet name");
        sheet
            .write_string(0, 0, "项目名称")
            .expect("write header name a");
        sheet
            .write_string(0, 1, "项目名称")
            .expect("write header name b");
        sheet
            .write_string(1, 0, "项目A")
            .expect("write row value a");
        sheet
            .write_string(1, 1, "项目B")
            .expect("write row value b");

        workbook.save(&workbook_path).expect("save workbook");

        let mappings = mapping_map(&[("name", "项目名称")]);
        let error = parse_excel_rows_with_mappings(&workbook_path, "Dup", 1, &mappings)
            .expect_err("duplicate header should fail");
        assert!(error.to_string().contains("ambiguous"));

        let _ = fs::remove_file(workbook_path);
    }

    #[test]
    fn parses_amount_with_mixed_formats() {
        assert!((amount_from_str("￥1,234.56万元") - 1234.56).abs() < 0.0001);
        assert!((amount_from_str("约-88 万元") + 88.0).abs() < 0.0001);
        assert!((amount_from_str("(120.5)") + 120.5).abs() < 0.0001);
        assert!((amount_from_str("1.2.3") - 1.2).abs() < 0.0001);
        assert_eq!(amount_from_str("无"), 0.0);
    }

    #[test]
    fn normalizes_district_aliases() {
        assert_eq!(normalize_district("花桥镇"), "花桥开发区");
        assert_eq!(normalize_district("昆山经济技术开发区"), "开发区");
        assert_eq!(normalize_district("昆山高新技术经济开发区"), "高新区");
        assert_eq!(normalize_district("周市镇"), "周市");
        assert_eq!(normalize_district(""), "");
    }

    #[test]
    fn infers_project_level_from_level_and_category() {
        assert_eq!(
            normalize_project_level("", "国家重点研发计划项目"),
            "国家级"
        );
        assert_eq!(normalize_project_level("", "江苏省创新专项"), "省级");
        assert_eq!(
            normalize_project_level("", "苏州市科技计划项目"),
            "苏州市级"
        );
        assert_eq!(
            normalize_project_level("", "昆山市科技计划项目"),
            "昆山本级"
        );
        assert_eq!(normalize_project_level("其他", "其他"), "其他");
    }

    fn mapping_map(items: &[(&str, &str)]) -> HashMap<String, String> {
        items
            .iter()
            .map(|(standard_field, excel_column)| {
                ((*standard_field).to_string(), (*excel_column).to_string())
            })
            .collect()
    }

    fn unique_temp_file_path(prefix: &str, extension: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("{prefix}-{nanos}.{extension}"))
    }

    fn unique_temp_dir_path(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("{prefix}-{nanos}"))
    }
}
