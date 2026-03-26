use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    time::Duration,
};

use chrono::{DateTime, Local, Utc};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;
use zip::ZipArchive;

use crate::{
    app_state::AppState,
    storage::{
        db,
        models::{MindMapNodeDto, NoteDetailDto, NoteListItemDto, NotebookDto, OperationResultDto},
        StorageResult,
    },
};

const NOTES_UPDATED_EVENT: &str = "notes://xmind-updated";
const NOTES_SYNC_ERROR_EVENT: &str = "notes://xmind-sync-error";
const DEFAULT_NOTEBOOKS: [(&str, &str, i64); 3] = [
    ("nb-business", "业务SOP与流程", 0),
    ("nb-system", "系统操作指南", 1),
    ("nb-personal", "个人经验沉淀", 2),
];

#[tauri::command]
pub fn list_notebooks(state: State<AppState>) -> Result<Vec<NotebookDto>, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    ensure_default_notebooks(&connection).map_err(|error| error.to_string())?;
    list_notebooks_internal(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_notebook(state: State<AppState>, name: String) -> Result<NotebookDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    ensure_default_notebooks(&connection).map_err(|error| error.to_string())?;
    create_notebook_internal(&connection, name.trim()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn rename_notebook(
    state: State<AppState>,
    notebook_id: String,
    name: String,
) -> Result<NotebookDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    rename_notebook_internal(&connection, &notebook_id, name.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_notebook(
    state: State<AppState>,
    notebook_id: String,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    delete_notebook_internal(&connection, &state, &notebook_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_notes(
    state: State<AppState>,
    notebook_id: String,
) -> Result<Vec<NoteListItemDto>, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    list_notes_internal(&connection, &notebook_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_notes_batch(
    state: State<AppState>,
    note_ids: Vec<String>,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    delete_notes_batch_internal(&connection, &state, &note_ids).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_xmind_note(
    app: AppHandle,
    state: State<AppState>,
    notebook_id: String,
    path: String,
) -> Result<NoteDetailDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    ensure_default_notebooks(&connection).map_err(|error| error.to_string())?;
    let detail = import_xmind_note_internal(&connection, &notebook_id, path.trim())
        .map_err(|error| error.to_string())?;
    ensure_note_watcher(&app, &state, &detail.id, &detail.path)
        .map_err(|error| error.to_string())?;
    Ok(detail)
}

#[tauri::command]
pub fn get_note_detail(
    app: AppHandle,
    state: State<AppState>,
    note_id: String,
) -> Result<NoteDetailDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    let detail =
        get_note_detail_internal(&connection, &note_id).map_err(|error| error.to_string())?;
    ensure_note_watcher(&app, &state, &detail.id, &detail.path)
        .map_err(|error| error.to_string())?;
    Ok(detail)
}

#[tauri::command]
pub fn refresh_note(
    app: AppHandle,
    state: State<AppState>,
    note_id: String,
) -> Result<NoteDetailDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    let detail = refresh_note_internal(&connection, &note_id).map_err(|error| error.to_string())?;
    ensure_note_watcher(&app, &state, &detail.id, &detail.path)
        .map_err(|error| error.to_string())?;
    Ok(detail)
}

#[tauri::command]
pub fn open_note_in_xmind(
    state: State<AppState>,
    note_id: String,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    let source_path: String = connection
        .query_row(
            "
            SELECT source_path
            FROM notes
            WHERE id = ?1
            ",
            [note_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "note not found".to_string())?;

    super::workspace::open_path_with_system(source_path)
}

fn list_notebooks_internal(connection: &Connection) -> StorageResult<Vec<NotebookDto>> {
    let mut statement = connection.prepare(
        "
        SELECT
            notebooks.id,
            notebooks.name,
            notebooks.sort_order,
            COUNT(notes.id) AS note_count
        FROM notebooks
        LEFT JOIN notes ON notes.notebook_id = notebooks.id
        GROUP BY notebooks.id, notebooks.name, notebooks.sort_order
        ORDER BY notebooks.sort_order ASC, notebooks.created_at ASC
        ",
    )?;

    let rows = statement.query_map([], |row| {
        Ok(NotebookDto {
            id: row.get(0)?,
            name: row.get(1)?,
            sort_order: row.get(2)?,
            note_count: row.get(3)?,
        })
    })?;

    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn list_notes_internal(
    connection: &Connection,
    notebook_id: &str,
) -> StorageResult<Vec<NoteListItemDto>> {
    let mut statement = connection.prepare(
        "
        SELECT id, notebook_id, title, source_path, note_type, last_synced_at
        FROM notes
        WHERE notebook_id = ?1
        ORDER BY updated_at DESC, created_at DESC
        ",
    )?;

    let rows = statement.query_map([notebook_id], |row| {
        let last_synced_at = row.get::<_, Option<String>>(5)?;
        Ok(NoteListItemDto {
            id: row.get(0)?,
            notebook_id: row.get(1)?,
            title: row.get(2)?,
            path: row.get(3)?,
            note_type: row.get(4)?,
            last_sync_label: format_sync_label(last_synced_at.as_deref()),
            last_synced_at,
        })
    })?;

    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn create_notebook_internal(connection: &Connection, name: &str) -> StorageResult<NotebookDto> {
    let name = name.trim();
    if name.is_empty() {
        return Err("笔记本名称不能为空".into());
    }

    let sort_order = connection.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM notebooks",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    let notebook_id = Uuid::new_v4().to_string();

    connection.execute(
        "
        INSERT INTO notebooks (id, name, sort_order)
        VALUES (?1, ?2, ?3)
        ",
        params![notebook_id, name, sort_order],
    )?;

    connection
        .query_row(
            "
            SELECT notebooks.id, notebooks.name, notebooks.sort_order, COUNT(notes.id) AS note_count
            FROM notebooks
            LEFT JOIN notes ON notes.notebook_id = notebooks.id
            WHERE notebooks.id = ?1
            GROUP BY notebooks.id, notebooks.name, notebooks.sort_order
            ",
            [notebook_id],
            |row| {
                Ok(NotebookDto {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    sort_order: row.get(2)?,
                    note_count: row.get(3)?,
                })
            },
        )
        .map_err(Into::into)
}

fn rename_notebook_internal(
    connection: &Connection,
    notebook_id: &str,
    name: &str,
) -> StorageResult<NotebookDto> {
    let name = name.trim();
    if name.is_empty() {
        return Err("笔记本名称不能为空".into());
    }

    let affected = connection.execute(
        "
        UPDATE notebooks
        SET name = ?2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?1
        ",
        params![notebook_id, name],
    )?;

    if affected == 0 {
        return Err(format!("notebook not found: {notebook_id}").into());
    }

    connection
        .query_row(
            "
            SELECT notebooks.id, notebooks.name, notebooks.sort_order, COUNT(notes.id) AS note_count
            FROM notebooks
            LEFT JOIN notes ON notes.notebook_id = notebooks.id
            WHERE notebooks.id = ?1
            GROUP BY notebooks.id, notebooks.name, notebooks.sort_order
            ",
            [notebook_id],
            |row| {
                Ok(NotebookDto {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    sort_order: row.get(2)?,
                    note_count: row.get(3)?,
                })
            },
        )
        .map_err(Into::into)
}

fn delete_notebook_internal(
    connection: &Connection,
    state: &AppState,
    notebook_id: &str,
) -> StorageResult<OperationResultDto> {
    let notebook_count: i64 =
        connection.query_row("SELECT COUNT(*) FROM notebooks", [], |row| row.get(0))?;
    if notebook_count <= 1 {
        return Err("at least one notebook must remain".into());
    }

    let note_ids = list_note_ids_by_notebook(connection, notebook_id)?;
    let affected = connection.execute("DELETE FROM notebooks WHERE id = ?1", [notebook_id])?;
    if affected == 0 {
        return Err(format!("notebook not found: {notebook_id}").into());
    }

    if let Ok(mut watchers) = state.note_watchers().lock() {
        for note_id in note_ids {
            watchers.remove(&note_id);
        }
    }

    Ok(OperationResultDto {
        success: true,
        message: "notebook deleted".to_string(),
    })
}

fn delete_notes_batch_internal(
    connection: &Connection,
    state: &AppState,
    note_ids: &[String],
) -> StorageResult<OperationResultDto> {
    if note_ids.is_empty() {
        return Ok(OperationResultDto {
            success: true,
            message: "no notes selected".to_string(),
        });
    }

    let transaction = connection.unchecked_transaction()?;
    let mut deleted_count = 0usize;
    for note_id in note_ids {
        deleted_count += transaction.execute("DELETE FROM notes WHERE id = ?1", [note_id])?;
    }
    transaction.commit()?;

    if let Ok(mut watchers) = state.note_watchers().lock() {
        for note_id in note_ids {
            watchers.remove(note_id);
        }
    }

    Ok(OperationResultDto {
        success: true,
        message: format!("deleted {deleted_count} notes"),
    })
}

fn list_note_ids_by_notebook(
    connection: &Connection,
    notebook_id: &str,
) -> StorageResult<Vec<String>> {
    let mut statement = connection.prepare(
        "
        SELECT id
        FROM notes
        WHERE notebook_id = ?1
        ",
    )?;
    let rows = statement.query_map([notebook_id], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn import_xmind_note_internal(
    connection: &Connection,
    notebook_id: &str,
    raw_path: &str,
) -> StorageResult<NoteDetailDto> {
    if raw_path.is_empty() {
        return Err("请选择 .xmind 文件".into());
    }
    let path = Path::new(raw_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()).into());
    }
    if !is_xmind_path(path) {
        return Err("仅支持导入 .xmind 文件".into());
    }

    let title = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名脑图".to_string());

    let existing = connection
        .query_row(
            "
            SELECT id
            FROM notes
            WHERE source_path = ?1
            LIMIT 1
            ",
            [raw_path],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    let note_id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
    let sync_timestamp = Utc::now().to_rfc3339();

    connection.execute(
        "
        INSERT INTO notes (id, notebook_id, title, source_path, note_type, last_synced_at)
        VALUES (?1, ?2, ?3, ?4, 'xmind', ?5)
        ON CONFLICT(id) DO UPDATE SET
            notebook_id = excluded.notebook_id,
            title = excluded.title,
            source_path = excluded.source_path,
            note_type = excluded.note_type,
            last_synced_at = excluded.last_synced_at,
            updated_at = CURRENT_TIMESTAMP
        ",
        params![note_id, notebook_id, title, raw_path, sync_timestamp],
    )?;

    refresh_note_internal(connection, &note_id)
}

fn get_note_detail_internal(
    connection: &Connection,
    note_id: &str,
) -> StorageResult<NoteDetailDto> {
    let row = connection
        .query_row(
            "
            SELECT id, notebook_id, title, source_path, note_type, last_synced_at
            FROM notes
            WHERE id = ?1
            ",
            [note_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            },
        )
        .optional()?;

    let Some((id, notebook_id, title, path, note_type, last_synced_at)) = row else {
        return Err(format!("note not found: {note_id}").into());
    };

    let tree = parse_xmind_tree(Path::new(&path))?;

    Ok(NoteDetailDto {
        id,
        notebook_id,
        title,
        path,
        note_type,
        last_sync_label: format_sync_label(last_synced_at.as_deref()),
        last_synced_at,
        tree,
    })
}

fn refresh_note_internal(connection: &Connection, note_id: &str) -> StorageResult<NoteDetailDto> {
    let source_path: String = connection
        .query_row(
            "
            SELECT source_path
            FROM notes
            WHERE id = ?1
            ",
            [note_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| format!("note not found: {note_id}"))?;

    let _ = parse_xmind_tree(Path::new(&source_path))?;
    let last_synced_at = Utc::now().to_rfc3339();
    connection.execute(
        "
        UPDATE notes
        SET last_synced_at = ?2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?1
        ",
        params![note_id, last_synced_at],
    )?;

    get_note_detail_internal(connection, note_id)
}

fn ensure_default_notebooks(connection: &Connection) -> StorageResult<()> {
    let existing_count: i64 =
        connection.query_row("SELECT COUNT(*) FROM notebooks", [], |row| row.get(0))?;
    if existing_count > 0 {
        return Ok(());
    }

    let transaction = connection.unchecked_transaction()?;
    for (id, name, sort_order) in DEFAULT_NOTEBOOKS {
        transaction.execute(
            "
            INSERT INTO notebooks (id, name, sort_order)
            VALUES (?1, ?2, ?3)
            ",
            params![id, name, sort_order],
        )?;
    }
    transaction.commit()?;
    Ok(())
}

fn ensure_note_watcher(
    app: &AppHandle,
    state: &AppState,
    note_id: &str,
    source_path: &str,
) -> StorageResult<()> {
    let path = PathBuf::from(source_path);
    if !path.exists() {
        return Ok(());
    }

    let db_path = state.db_path().to_path_buf();
    let app_handle = app.clone();
    let watched_note_id = note_id.to_string();
    let watched_path = path.clone();
    let watcher = RecommendedWatcher::new(
        move |result: Result<notify::Event, notify::Error>| {
            let Ok(event) = result else {
                let _ = app_handle.emit(
                    NOTES_SYNC_ERROR_EVENT,
                    serde_json::json!({
                        "noteId": watched_note_id,
                        "message": "文件监听失败",
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

            std::thread::sleep(Duration::from_millis(200));
            match db::open_connection(&db_path)
                .and_then(|connection| refresh_note_internal(&connection, &watched_note_id))
            {
                Ok(detail) => {
                    let _ = app_handle.emit(NOTES_UPDATED_EVENT, detail);
                }
                Err(error) => {
                    let _ = app_handle.emit(
                        NOTES_SYNC_ERROR_EVENT,
                        serde_json::json!({
                            "noteId": watched_note_id,
                            "message": error.to_string(),
                            "path": watched_path.to_string_lossy(),
                        }),
                    );
                }
            }
        },
        Config::default(),
    )?;

    let mut watcher = watcher;
    watcher.watch(&path, RecursiveMode::NonRecursive)?;

    let mut watchers = state
        .note_watchers()
        .lock()
        .map_err(|_| "watcher lock poisoned".to_string())?;
    watchers.insert(note_id.to_string(), watcher);
    Ok(())
}

fn parse_xmind_tree(path: &Path) -> StorageResult<MindMapNodeDto> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut content = String::new();

    let content_name = if archive.file_names().any(|name| name == "content.json") {
        "content.json"
    } else {
        "Content.json"
    };
    let mut content_file = archive.by_name(content_name)?;
    content_file.read_to_string(&mut content)?;

    let json: Value = serde_json::from_str(&content)?;
    let sheets = json
        .as_array()
        .ok_or_else(|| "Xmind content.json format is invalid".to_string())?;
    let first_sheet = sheets
        .first()
        .ok_or_else(|| "Xmind 文件中没有可用的 sheet".to_string())?;
    let root_topic = first_sheet
        .get("rootTopic")
        .or_else(|| first_sheet.get("root_topic"))
        .ok_or_else(|| "Xmind 文件缺少 rootTopic".to_string())?;

    parse_topic_node(root_topic)
}

fn parse_topic_node(topic: &Value) -> StorageResult<MindMapNodeDto> {
    let id = topic
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let name = topic
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| "未命名节点".to_string());

    let children = extract_child_topics(topic)
        .into_iter()
        .map(parse_topic_node)
        .collect::<StorageResult<Vec<_>>>()?;

    Ok(MindMapNodeDto { id, name, children })
}

fn extract_child_topics<'a>(topic: &'a Value) -> Vec<&'a Value> {
    let mut children = Vec::new();

    if let Some(array) = topic.get("children").and_then(Value::as_array) {
        children.extend(array.iter());
    }

    if let Some(object) = topic.get("children").and_then(Value::as_object) {
        for value in object.values() {
            if let Some(array) = value.as_array() {
                children.extend(array.iter());
            } else if let Some(topics) = value.get("topics").and_then(Value::as_array) {
                children.extend(topics.iter());
            }
        }
    }

    children
}

fn is_xmind_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("xmind"))
        .unwrap_or(false)
}

fn format_sync_label(last_synced_at: Option<&str>) -> String {
    let Some(last_synced_at) = last_synced_at else {
        return "未同步".to_string();
    };

    let parsed = DateTime::parse_from_rfc3339(last_synced_at)
        .map(|dt| dt.with_timezone(&Local))
        .ok();
    let Some(parsed) = parsed else {
        return "刚刚同步".to_string();
    };

    let now = Local::now();
    let diff = now - parsed;
    if diff.num_minutes() < 1 {
        "刚刚同步".to_string()
    } else if diff.num_minutes() < 60 {
        format!("{}分钟前同步", diff.num_minutes())
    } else if diff.num_hours() < 24 {
        format!("{}小时前同步", diff.num_hours())
    } else {
        parsed.format("%Y-%m-%d %H:%M").to_string()
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs::{self, File},
        io::Write,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use zip::write::FileOptions;

    use crate::storage::{db, migrations, StorageResult};

    use super::{
        ensure_default_notebooks, import_xmind_note_internal, list_notebooks_internal,
        parse_xmind_tree,
    };

    #[test]
    fn seeds_default_notebooks() {
        let db_path = unique_test_db_path();
        let connection = db::open_connection(&db_path).expect("open db");
        migrations::initialize_schema(&connection).expect("init schema");

        ensure_default_notebooks(&connection).expect("seed notebooks");
        let notebooks = list_notebooks_internal(&connection).expect("list notebooks");

        assert_eq!(notebooks.len(), 3);
        assert_eq!(notebooks[0].name, "业务SOP与流程");

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn imports_xmind_note_and_parses_tree() {
        let db_path = unique_test_db_path();
        let xmind_path = unique_test_xmind_path();
        write_test_xmind(&xmind_path).expect("write xmind");

        let connection = db::open_connection(&db_path).expect("open db");
        migrations::initialize_schema(&connection).expect("init schema");
        ensure_default_notebooks(&connection).expect("seed notebooks");

        let detail = import_xmind_note_internal(
            &connection,
            "nb-business",
            xmind_path.to_str().expect("utf8 path"),
        )
        .expect("import note");

        assert!(detail.title.starts_with("sample-"));
        assert_eq!(detail.tree.name, "项目申报流程");
        assert_eq!(detail.tree.children.len(), 2);

        drop(connection);
        let _ = fs::remove_file(db_path);
        let _ = fs::remove_file(xmind_path);
    }

    #[test]
    fn parses_xmind_content_json() {
        let xmind_path = unique_test_xmind_path();
        write_test_xmind(&xmind_path).expect("write xmind");

        let tree = parse_xmind_tree(&xmind_path).expect("parse xmind");
        assert_eq!(tree.name, "项目申报流程");
        assert_eq!(tree.children[0].name, "材料准备");

        let _ = fs::remove_file(xmind_path);
    }

    fn unique_test_db_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("personal-os-notes-{nanos}.sqlite3"))
    }

    fn unique_test_xmind_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("sample-{nanos}.xmind"))
    }

    fn write_test_xmind(path: &Path) -> StorageResult<()> {
        let file = File::create(path)?;
        let mut zip = zip::ZipWriter::new(file);
        let options = FileOptions::default();
        let content = r#"
[
  {
    "id": "sheet-1",
    "title": "Sheet 1",
    "rootTopic": {
      "id": "root",
      "title": "项目申报流程",
      "children": {
        "attached": [
          {
            "id": "child-1",
            "title": "材料准备",
            "children": {
              "attached": [
                { "id": "child-1-1", "title": "营业执照" }
              ]
            }
          },
          {
            "id": "child-2",
            "title": "系统填报"
          }
        ]
      }
    }
  }
]
"#;
        zip.start_file("content.json", options)?;
        zip.write_all(content.as_bytes())?;
        zip.finish()?;
        Ok(())
    }
}
