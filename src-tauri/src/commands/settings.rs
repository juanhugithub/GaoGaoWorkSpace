use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
};

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[cfg(target_os = "windows")]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

use crate::{
    app_state::AppState,
    storage::{
        db,
        models::{
            AppSettingsDto, KeyboardShortcutDto, OperationResultDto, SaveAppSettingsPayload,
            SaveKeyboardShortcutPayload,
        },
        StorageResult,
    },
};

const SETTINGS_ROW_ID: i64 = 1;
const LOGS_DIR_NAME: &str = "logs";
const MAINTENANCE_LOG_FILE_NAME: &str = "maintenance.log";
const WINDOWS_RUN_KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const WINDOWS_AUTOSTART_VALUE_NAME: &str = "GaoGaoWorkSpace";
const ALLOWED_AUTO_LOCK_MINUTES: [i64; 4] = [0, 5, 15, 30];
const ALLOWED_THEME_MODES: [&str; 3] = ["light", "dark", "system"];
const ALLOWED_ACCENT_THEMES: [&str; 5] = [
    "classic-blue",
    "emerald-green",
    "amber-gold",
    "soft-violet",
    "cherry-rose",
];
const DEFAULT_SHORTCUTS: [(&str, &str, bool); 8] = [
    ("quick_lock", "Ctrl+L", true),
    ("open_settings", "Ctrl+,", true),
    ("tab_workspace", "Alt+1", true),
    ("tab_dashboard", "Alt+2", true),
    ("tab_notes", "Alt+3", true),
    ("tab_journal", "Alt+4", true),
    ("save_current_journal", "Ctrl+S", true),
    ("create_today_journal", "Ctrl+Alt+J", true),
];

#[tauri::command]
pub fn get_app_settings(state: State<AppState>) -> Result<AppSettingsDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    get_app_settings_internal(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_app_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: SaveAppSettingsPayload,
) -> Result<AppSettingsDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    let saved = save_app_settings_internal(&app, &connection, settings)
        .map_err(|error| error.to_string())?;
    Ok(saved)
}

#[tauri::command]
pub fn list_keyboard_shortcuts(state: State<AppState>) -> Result<Vec<KeyboardShortcutDto>, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    list_keyboard_shortcuts_internal(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_keyboard_shortcut(
    state: State<AppState>,
    shortcut: SaveKeyboardShortcutPayload,
) -> Result<KeyboardShortcutDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    save_keyboard_shortcut_internal(&connection, shortcut).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reset_keyboard_shortcut(
    state: State<AppState>,
    action_id: String,
) -> Result<KeyboardShortcutDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    reset_keyboard_shortcut_internal(&connection, action_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn verify_app_lock_password(
    state: State<AppState>,
    password: String,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    verify_app_lock_password_internal(&connection, password.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn vacuum_database(
    app: AppHandle,
    state: State<AppState>,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    let result = vacuum_database_internal(&app, &connection, state.db_path())
        .map_err(|error| error.to_string())?;
    Ok(result)
}

#[tauri::command]
pub fn open_log_directory(app: AppHandle) -> Result<OperationResultDto, String> {
    let log_directory = resolve_log_directory(&app).map_err(|error| error.to_string())?;
    super::workspace::open_path_with_system(log_directory.to_string_lossy().to_string())
}

fn get_app_settings_internal(connection: &Connection) -> StorageResult<AppSettingsDto> {
    ensure_app_settings_row(connection)?;
    ensure_keyboard_shortcuts(connection)?;

    let stored = read_app_settings_row(connection)?;

    let actual_auto_start_enabled = read_auto_start_enabled()?;
    if actual_auto_start_enabled != stored.4 {
        connection.execute(
            "
            UPDATE app_settings
            SET auto_start_enabled = ?2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            ",
            params![
                SETTINGS_ROW_ID,
                if actual_auto_start_enabled { 1 } else { 0 },
            ],
        )?;
    }

    Ok(build_app_settings_dto(stored, actual_auto_start_enabled))
}

fn save_app_settings_internal(
    app: &AppHandle,
    connection: &Connection,
    settings: SaveAppSettingsPayload,
) -> StorageResult<AppSettingsDto> {
    set_auto_start_enabled(settings.auto_start_enabled)?;
    let actual_auto_start_enabled = read_auto_start_enabled()?;
    let saved = persist_app_settings_record(connection, &settings, actual_auto_start_enabled)?;

    append_log_entry(
        app,
        &format!(
            "saved app settings: lock={}, auto_lock_minutes={}, auto_start={}, theme={}, accent={}",
            settings.app_lock_enabled,
            settings.auto_lock_minutes,
            actual_auto_start_enabled,
            settings.theme_mode,
            settings.accent_theme,
        ),
    )?;

    Ok(saved)
}

fn persist_app_settings_record(
    connection: &Connection,
    settings: &SaveAppSettingsPayload,
    actual_auto_start_enabled: bool,
) -> StorageResult<AppSettingsDto> {
    validate_auto_lock_minutes(settings.auto_lock_minutes)?;
    validate_theme_mode(&settings.theme_mode)?;
    validate_accent_theme(&settings.accent_theme)?;
    ensure_app_settings_row(connection)?;

    let existing_password = connection.query_row(
        "
        SELECT app_lock_password_hash, app_lock_password_salt
        FROM app_settings
        WHERE id = ?1
        ",
        [SETTINGS_ROW_ID],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        },
    )?;

    let mut password_hash = existing_password.0;
    let mut password_salt = existing_password.1;

    if let Some(password) = settings.password.as_deref() {
        let password = password.trim();
        if !password.is_empty() {
            let salt = Uuid::new_v4().to_string();
            let hash = hash_password(&salt, password);
            password_hash = Some(hash);
            password_salt = Some(salt);
        }
    }

    if settings.app_lock_enabled && (password_hash.is_none() || password_salt.is_none()) {
        return Err("开启应用锁定保护前请先设置密码".into());
    }

    connection.execute(
        "
        UPDATE app_settings
        SET app_lock_enabled = ?2,
            app_lock_password_hash = ?3,
            app_lock_password_salt = ?4,
            auto_lock_minutes = ?5,
            auto_start_enabled = ?6,
            theme_mode = ?7,
            accent_theme = ?8,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?1
        ",
        params![
            SETTINGS_ROW_ID,
            if settings.app_lock_enabled { 1 } else { 0 },
            password_hash,
            password_salt,
            settings.auto_lock_minutes,
            if actual_auto_start_enabled { 1 } else { 0 },
            settings.theme_mode,
            settings.accent_theme,
        ],
    )?;

    Ok(build_app_settings_dto(
        (
            settings.app_lock_enabled,
            password_hash,
            password_salt,
            settings.auto_lock_minutes,
            actual_auto_start_enabled,
            settings.theme_mode.clone(),
            settings.accent_theme.clone(),
        ),
        actual_auto_start_enabled,
    ))
}

fn list_keyboard_shortcuts_internal(
    connection: &Connection,
) -> StorageResult<Vec<KeyboardShortcutDto>> {
    ensure_keyboard_shortcuts(connection)?;

    let mut statement = connection.prepare(
        "
        SELECT action_id, accelerator, default_accelerator, is_enabled
        FROM keyboard_shortcuts
        ORDER BY created_at ASC, action_id ASC
        ",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(KeyboardShortcutDto {
            action_id: row.get(0)?,
            accelerator: row.get(1)?,
            default_accelerator: row.get(2)?,
            is_enabled: row.get::<_, i64>(3)? != 0,
        })
    })?;

    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn save_keyboard_shortcut_internal(
    connection: &Connection,
    shortcut: SaveKeyboardShortcutPayload,
) -> StorageResult<KeyboardShortcutDto> {
    ensure_keyboard_shortcuts(connection)?;

    let action_id = shortcut.action_id.trim();
    let accelerator = shortcut.accelerator.trim();
    validate_shortcut_action_id(action_id)?;
    validate_shortcut_accelerator(accelerator)?;

    let conflict = connection
        .query_row(
            "
            SELECT action_id
            FROM keyboard_shortcuts
            WHERE accelerator = ?1
              AND is_enabled = 1
              AND action_id != ?2
            LIMIT 1
            ",
            params![accelerator, action_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    if shortcut.is_enabled && conflict.is_some() {
        return Err(format!("快捷键 {accelerator} 已被其他动作占用").into());
    }

    connection.execute(
        "
        UPDATE keyboard_shortcuts
        SET accelerator = ?2,
            is_enabled = ?3,
            updated_at = CURRENT_TIMESTAMP
        WHERE action_id = ?1
        ",
        params![
            action_id,
            accelerator,
            if shortcut.is_enabled { 1 } else { 0 },
        ],
    )?;

    read_keyboard_shortcut(connection, action_id)
}

fn reset_keyboard_shortcut_internal(
    connection: &Connection,
    action_id: &str,
) -> StorageResult<KeyboardShortcutDto> {
    ensure_keyboard_shortcuts(connection)?;
    validate_shortcut_action_id(action_id)?;
    let (default_accelerator, default_enabled) = default_shortcut_meta(action_id)?;

    let conflict = connection
        .query_row(
            "
            SELECT action_id
            FROM keyboard_shortcuts
            WHERE accelerator = ?1
              AND is_enabled = 1
              AND action_id != ?2
            LIMIT 1
            ",
            params![default_accelerator, action_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    if default_enabled && conflict.is_some() {
        return Err(format!("快捷键 {default_accelerator} 已被其他动作占用").into());
    }

    connection.execute(
        "
        UPDATE keyboard_shortcuts
        SET accelerator = ?2,
            is_enabled = ?3,
            updated_at = CURRENT_TIMESTAMP
        WHERE action_id = ?1
        ",
        params![
            action_id,
            default_accelerator,
            if default_enabled { 1 } else { 0 },
        ],
    )?;

    read_keyboard_shortcut(connection, action_id)
}

fn verify_app_lock_password_internal(
    connection: &Connection,
    password: &str,
) -> StorageResult<OperationResultDto> {
    ensure_app_settings_row(connection)?;
    if password.is_empty() {
        return Err("请输入应用锁定密码".into());
    }

    let row = connection
        .query_row(
            "
            SELECT app_lock_password_hash, app_lock_password_salt
            FROM app_settings
            WHERE id = ?1
            ",
            [SETTINGS_ROW_ID],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            },
        )
        .optional()?;

    let Some((Some(password_hash), Some(password_salt))) = row else {
        return Err("当前未设置应用锁定密码".into());
    };

    if hash_password(&password_salt, password) != password_hash {
        return Err("密码错误".into());
    }

    Ok(OperationResultDto {
        success: true,
        message: "验证通过".to_string(),
    })
}

fn vacuum_database_internal(
    app: &AppHandle,
    connection: &Connection,
    db_path: &std::path::Path,
) -> StorageResult<OperationResultDto> {
    let size_before = fs::metadata(db_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    connection.execute_batch(
        "
        PRAGMA wal_checkpoint(TRUNCATE);
        VACUUM;
        ",
    )?;
    let size_after = fs::metadata(db_path)
        .map(|metadata| metadata.len())
        .unwrap_or(size_before);
    let reclaimed_bytes = size_before.saturating_sub(size_after);

    append_log_entry(
        app,
        &format!(
            "vacuum completed: db={}, size_before={}, size_after={}, reclaimed={}",
            db_path.display(),
            size_before,
            size_after,
            reclaimed_bytes,
        ),
    )?;

    Ok(OperationResultDto {
        success: true,
        message: format!(
            "数据库清理完成，释放约 {} KB 空间。",
            reclaimed_bytes / 1024
        ),
    })
}

fn ensure_app_settings_row(connection: &Connection) -> StorageResult<()> {
    connection.execute(
        "
        INSERT INTO app_settings (id)
        VALUES (?1)
        ON CONFLICT(id) DO NOTHING
        ",
        [SETTINGS_ROW_ID],
    )?;
    Ok(())
}

fn ensure_keyboard_shortcuts(connection: &Connection) -> StorageResult<()> {
    for (action_id, default_accelerator, is_enabled) in DEFAULT_SHORTCUTS {
        connection.execute(
            "
            INSERT INTO keyboard_shortcuts (
                action_id,
                accelerator,
                default_accelerator,
                is_enabled
            )
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(action_id) DO UPDATE SET
                default_accelerator = excluded.default_accelerator
            ",
            params![
                action_id,
                default_accelerator,
                default_accelerator,
                if is_enabled { 1 } else { 0 },
            ],
        )?;
    }
    Ok(())
}

fn read_app_settings_row(
    connection: &Connection,
) -> StorageResult<(
    bool,
    Option<String>,
    Option<String>,
    i64,
    bool,
    String,
    String,
)> {
    connection
        .query_row(
            "
            SELECT
                app_lock_enabled,
                app_lock_password_hash,
                app_lock_password_salt,
                auto_lock_minutes,
                auto_start_enabled,
                theme_mode,
                accent_theme
            FROM app_settings
            WHERE id = ?1
            ",
            [SETTINGS_ROW_ID],
            |row| {
                Ok((
                    row.get::<_, i64>(0)? != 0,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)? != 0,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .map_err(Into::into)
}

fn build_app_settings_dto(
    stored: (
        bool,
        Option<String>,
        Option<String>,
        i64,
        bool,
        String,
        String,
    ),
    actual_auto_start_enabled: bool,
) -> AppSettingsDto {
    AppSettingsDto {
        app_lock_enabled: stored.0,
        has_app_lock_password: stored.1.is_some() && stored.2.is_some(),
        auto_lock_minutes: stored.3,
        auto_start_enabled: actual_auto_start_enabled,
        theme_mode: stored.5,
        accent_theme: stored.6,
    }
}

fn resolve_log_directory(app: &AppHandle) -> StorageResult<PathBuf> {
    let log_directory = app.path().app_local_data_dir()?.join(LOGS_DIR_NAME);
    fs::create_dir_all(&log_directory)?;
    Ok(log_directory)
}

fn append_log_entry(app: &AppHandle, message: &str) -> StorageResult<()> {
    let log_directory = resolve_log_directory(app)?;
    let log_file_path = log_directory.join(MAINTENANCE_LOG_FILE_NAME);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_file_path)?;
    writeln!(file, "{} {}", Utc::now().to_rfc3339(), message)?;
    Ok(())
}

fn validate_auto_lock_minutes(value: i64) -> StorageResult<()> {
    if !ALLOWED_AUTO_LOCK_MINUTES.contains(&value) {
        return Err(format!("unsupported auto lock minutes: {value}").into());
    }
    Ok(())
}

fn validate_theme_mode(value: &str) -> StorageResult<()> {
    if !ALLOWED_THEME_MODES.contains(&value) {
        return Err(format!("unsupported theme mode: {value}").into());
    }
    Ok(())
}

fn validate_accent_theme(value: &str) -> StorageResult<()> {
    if !ALLOWED_ACCENT_THEMES.contains(&value) {
        return Err(format!("unsupported accent theme: {value}").into());
    }
    Ok(())
}

fn validate_shortcut_action_id(action_id: &str) -> StorageResult<()> {
    if DEFAULT_SHORTCUTS
        .iter()
        .any(|(default_action_id, _, _)| *default_action_id == action_id)
    {
        return Ok(());
    }
    Err(format!("unsupported keyboard shortcut action: {action_id}").into())
}

fn validate_shortcut_accelerator(accelerator: &str) -> StorageResult<()> {
    if accelerator.is_empty() {
        return Err("快捷键不能为空".into());
    }
    if accelerator.len() > 32 {
        return Err("快捷键过长".into());
    }
    Ok(())
}

fn read_keyboard_shortcut(
    connection: &Connection,
    action_id: &str,
) -> StorageResult<KeyboardShortcutDto> {
    connection
        .query_row(
            "
            SELECT action_id, accelerator, default_accelerator, is_enabled
            FROM keyboard_shortcuts
            WHERE action_id = ?1
            ",
            [action_id],
            |row| {
                Ok(KeyboardShortcutDto {
                    action_id: row.get(0)?,
                    accelerator: row.get(1)?,
                    default_accelerator: row.get(2)?,
                    is_enabled: row.get::<_, i64>(3)? != 0,
                })
            },
        )
        .map_err(Into::into)
}

fn default_shortcut_meta(action_id: &str) -> StorageResult<(&'static str, bool)> {
    DEFAULT_SHORTCUTS
        .iter()
        .find(|(default_action_id, _, _)| *default_action_id == action_id)
        .map(|(_, default_accelerator, is_enabled)| (*default_accelerator, *is_enabled))
        .ok_or_else(|| format!("unsupported keyboard shortcut action: {action_id}").into())
}

fn hash_password(salt: &str, password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt.as_bytes());
    hasher.update(b":");
    hasher.update(password.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(target_os = "windows")]
fn read_auto_start_enabled() -> StorageResult<bool> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = hkcu.create_subkey(WINDOWS_RUN_KEY_PATH)?;
    let auto_start_value = run_key.get_value::<String, _>(WINDOWS_AUTOSTART_VALUE_NAME);
    Ok(auto_start_value.is_ok())
}

#[cfg(not(target_os = "windows"))]
fn read_auto_start_enabled() -> StorageResult<bool> {
    Ok(false)
}

#[cfg(target_os = "windows")]
fn set_auto_start_enabled(enabled: bool) -> StorageResult<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = hkcu.create_subkey(WINDOWS_RUN_KEY_PATH)?;

    if enabled {
        let current_executable = std::env::current_exe()?;
        let command = format!("\"{}\"", current_executable.display());
        run_key.set_value(WINDOWS_AUTOSTART_VALUE_NAME, &command)?;
    } else {
        let _ = run_key.delete_value(WINDOWS_AUTOSTART_VALUE_NAME);
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_auto_start_enabled(enabled: bool) -> StorageResult<()> {
    if enabled {
        return Err("当前平台暂不支持开机自启动配置".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::storage::{
        db, migrations,
        models::{SaveAppSettingsPayload, SaveKeyboardShortcutPayload},
    };

    use super::{
        persist_app_settings_record, read_keyboard_shortcut, reset_keyboard_shortcut_internal,
        save_keyboard_shortcut_internal, verify_app_lock_password_internal,
    };

    #[test]
    fn persists_app_settings_and_verifies_password() {
        let db_path = unique_test_db_path();
        let connection = db::open_connection(&db_path).expect("open db");
        migrations::initialize_schema(&connection).expect("initialize schema");

        let saved = persist_app_settings_record(
            &connection,
            &SaveAppSettingsPayload {
                app_lock_enabled: true,
                auto_lock_minutes: 15,
                auto_start_enabled: false,
                theme_mode: "dark".to_string(),
                accent_theme: "emerald-green".to_string(),
                password: Some("123456".to_string()),
            },
            false,
        )
        .expect("persist app settings");

        assert!(saved.app_lock_enabled);
        assert!(saved.has_app_lock_password);
        assert_eq!(saved.auto_lock_minutes, 15);
        assert!(!saved.auto_start_enabled);
        assert_eq!(saved.theme_mode, "dark");
        assert_eq!(saved.accent_theme, "emerald-green");

        verify_app_lock_password_internal(&connection, "123456").expect("verify password");

        let stored_hash: Option<String> = connection
            .query_row(
                "SELECT app_lock_password_hash FROM app_settings WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("read password hash");
        assert!(stored_hash.is_some());

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn resetting_shortcut_rejects_conflicting_default_accelerator() {
        let db_path = unique_test_db_path();
        let connection = db::open_connection(&db_path).expect("open db");
        migrations::initialize_schema(&connection).expect("initialize schema");

        save_keyboard_shortcut_internal(
            &connection,
            SaveKeyboardShortcutPayload {
                action_id: "quick_lock".to_string(),
                accelerator: "Ctrl+Shift+L".to_string(),
                is_enabled: true,
            },
        )
        .expect("move quick lock away from default");

        save_keyboard_shortcut_internal(
            &connection,
            SaveKeyboardShortcutPayload {
                action_id: "open_settings".to_string(),
                accelerator: "Ctrl+L".to_string(),
                is_enabled: true,
            },
        )
        .expect("reuse old quick lock accelerator");

        let error = reset_keyboard_shortcut_internal(&connection, "quick_lock")
            .expect_err("default accelerator should conflict");
        assert!(error.to_string().contains("快捷键 Ctrl+L 已被其他动作占用"));

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn reset_shortcut_restores_default_value_after_customization() {
        let db_path = unique_test_db_path();
        let connection = db::open_connection(&db_path).expect("open db");
        migrations::initialize_schema(&connection).expect("initialize schema");

        save_keyboard_shortcut_internal(
            &connection,
            SaveKeyboardShortcutPayload {
                action_id: "quick_lock".to_string(),
                accelerator: "Ctrl+Shift+L".to_string(),
                is_enabled: false,
            },
        )
        .expect("save custom shortcut");

        let reset = reset_keyboard_shortcut_internal(&connection, "quick_lock")
            .expect("reset shortcut to default");
        assert_eq!(reset.accelerator, "Ctrl+L");
        assert!(reset.is_enabled);

        let reloaded =
            read_keyboard_shortcut(&connection, "quick_lock").expect("reload quick lock");
        assert_eq!(reloaded.accelerator, "Ctrl+L");
        assert!(reloaded.is_enabled);

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    fn unique_test_db_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!("personal-os-settings-{nanos}.sqlite3"))
    }
}
