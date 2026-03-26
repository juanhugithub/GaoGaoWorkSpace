use rusqlite::Connection;

use crate::storage::StorageResult;

pub const SCHEMA_VERSION: i64 = 9;

pub fn initialize_schema(connection: &Connection) -> StorageResult<()> {
    create_core_tables(connection)?;
    ensure_data_sources_sheet_schema(connection)?;
    ensure_data_sources_header_row_schema(connection)?;
    ensure_data_sources_sync_state_schema(connection)?;
    ensure_projects_source_schema(connection)?;
    ensure_projects_split_amount_schema(connection)?;
    ensure_data_source_foreign_keys_schema(connection)?;
    create_indexes(connection)?;
    connection.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION};"))?;
    Ok(())
}

fn create_core_tables(connection: &Connection) -> StorageResult<()> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS virtual_spaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS mapped_items (
            id TEXT PRIMARY KEY,
            virtual_space_id TEXT NOT NULL,
            item_type TEXT NOT NULL,
            display_name TEXT NOT NULL,
            real_path TEXT NOT NULL,
            tag TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (virtual_space_id) REFERENCES virtual_spaces(id) ON DELETE CASCADE,
            UNIQUE (virtual_space_id, real_path)
        );

        CREATE TABLE IF NOT EXISTS directory_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            tree_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS data_sources (
            id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            sheet_name TEXT NOT NULL DEFAULT '',
            header_row_number INTEGER NOT NULL DEFAULT 1,
            last_sync_time TEXT,
            last_sync_status TEXT NOT NULL DEFAULT 'never',
            last_error_message TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (file_path, sheet_name)
        );

        CREATE TABLE IF NOT EXISTS column_mappings (
            source_id TEXT NOT NULL,
            standard_field TEXT NOT NULL,
            excel_column TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (source_id, standard_field),
            FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT,
            year TEXT,
            district TEXT,
            level TEXT,
            category TEXT,
            name TEXT NOT NULL,
            enterprise TEXT,
            progress TEXT,
            upper_amount REAL NOT NULL DEFAULT 0,
            local_amount REAL NOT NULL DEFAULT 0,
            amount REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notebooks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            notebook_id TEXT NOT NULL,
            title TEXT NOT NULL,
            source_path TEXT NOT NULL,
            note_type TEXT NOT NULL DEFAULT 'xmind',
            last_synced_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS journals (
            id TEXT PRIMARY KEY,
            journal_date TEXT NOT NULL UNIQUE,
            weekday TEXT NOT NULL DEFAULT '',
            review TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS journal_tasks (
            id TEXT PRIMARY KEY,
            journal_id TEXT NOT NULL,
            category TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            contact TEXT NOT NULL DEFAULT '',
            deadline_text TEXT NOT NULL DEFAULT '',
            progress TEXT NOT NULL DEFAULT '未开始',
            priority TEXT NOT NULL DEFAULT '中',
            remark TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            carried_over_from_task_id TEXT,
            carried_over_from_date TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS journal_task_checklist_items (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            text TEXT NOT NULL DEFAULT '',
            is_completed INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES journal_tasks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            app_lock_enabled INTEGER NOT NULL DEFAULT 0,
            app_lock_password_hash TEXT,
            app_lock_password_salt TEXT,
            auto_lock_minutes INTEGER NOT NULL DEFAULT 0,
            auto_start_enabled INTEGER NOT NULL DEFAULT 0,
            theme_mode TEXT NOT NULL DEFAULT 'system',
            accent_theme TEXT NOT NULL DEFAULT 'classic-blue',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
            action_id TEXT PRIMARY KEY,
            accelerator TEXT NOT NULL,
            default_accelerator TEXT NOT NULL,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        ",
    )?;

    Ok(())
}

fn ensure_data_sources_sheet_schema(connection: &Connection) -> StorageResult<()> {
    if !table_exists(connection, "data_sources")? {
        return Ok(());
    }

    if table_has_column(connection, "data_sources", "sheet_name")? {
        return Ok(());
    }

    connection.execute_batch(
        "
        PRAGMA foreign_keys = OFF;

        ALTER TABLE data_sources RENAME TO data_sources_legacy_v2;

        CREATE TABLE data_sources (
            id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            sheet_name TEXT NOT NULL DEFAULT '',
            header_row_number INTEGER NOT NULL DEFAULT 1,
            last_sync_time TEXT,
            last_sync_status TEXT NOT NULL DEFAULT 'never',
            last_error_message TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (file_path, sheet_name)
        );

        INSERT INTO data_sources (
            id,
            file_path,
            sheet_name,
            header_row_number,
            last_sync_time,
            last_sync_status,
            last_error_message,
            created_at,
            updated_at
        )
        SELECT
            id,
            file_path,
            '',
            1,
            last_sync_time,
            'never',
            NULL,
            created_at,
            updated_at
        FROM data_sources_legacy_v2;

        DROP TABLE data_sources_legacy_v2;

        PRAGMA foreign_keys = ON;
        ",
    )?;

    Ok(())
}

fn ensure_data_sources_header_row_schema(connection: &Connection) -> StorageResult<()> {
    if !table_exists(connection, "data_sources")? {
        return Ok(());
    }

    if table_has_column(connection, "data_sources", "header_row_number")? {
        return Ok(());
    }

    connection.execute_batch(
        "
        ALTER TABLE data_sources
        ADD COLUMN header_row_number INTEGER NOT NULL DEFAULT 1;
        ",
    )?;

    Ok(())
}

fn ensure_data_sources_sync_state_schema(connection: &Connection) -> StorageResult<()> {
    if !table_exists(connection, "data_sources")? {
        return Ok(());
    }

    if !table_has_column(connection, "data_sources", "last_sync_status")? {
        connection.execute_batch(
            "
            ALTER TABLE data_sources
            ADD COLUMN last_sync_status TEXT NOT NULL DEFAULT 'never';
            ",
        )?;
    }

    if !table_has_column(connection, "data_sources", "last_error_message")? {
        connection.execute_batch(
            "
            ALTER TABLE data_sources
            ADD COLUMN last_error_message TEXT;
            ",
        )?;
    }

    Ok(())
}

fn ensure_projects_source_schema(connection: &Connection) -> StorageResult<()> {
    if !table_exists(connection, "projects")? {
        return Ok(());
    }

    if table_has_column(connection, "projects", "source_id")? {
        return Ok(());
    }

    connection.execute_batch(
        "
        ALTER TABLE projects RENAME TO projects_legacy_v1;

        CREATE TABLE projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT,
            year TEXT,
            district TEXT,
            level TEXT,
            category TEXT,
            name TEXT NOT NULL,
            enterprise TEXT,
            progress TEXT,
            upper_amount REAL NOT NULL DEFAULT 0,
            local_amount REAL NOT NULL DEFAULT 0,
            amount REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
        );

        INSERT INTO projects (
            id,
            year,
            district,
            level,
            category,
            name,
            enterprise,
            progress,
            upper_amount,
            local_amount,
            amount,
            created_at,
            updated_at
        )
        SELECT
            id,
            year,
            district,
            level,
            category,
            name,
            enterprise,
            progress,
            amount,
            0,
            amount,
            created_at,
            updated_at
        FROM projects_legacy_v1;

        DROP TABLE projects_legacy_v1;
        ",
    )?;

    Ok(())
}

fn ensure_projects_split_amount_schema(connection: &Connection) -> StorageResult<()> {
    if !table_exists(connection, "projects")? {
        return Ok(());
    }

    if !table_has_column(connection, "projects", "upper_amount")? {
        connection.execute_batch(
            "
            ALTER TABLE projects
            ADD COLUMN upper_amount REAL NOT NULL DEFAULT 0;
            ",
        )?;
    }

    if !table_has_column(connection, "projects", "local_amount")? {
        connection.execute_batch(
            "
            ALTER TABLE projects
            ADD COLUMN local_amount REAL NOT NULL DEFAULT 0;
            ",
        )?;
    }

    connection.execute_batch(
        "
        UPDATE projects
        SET upper_amount = COALESCE(amount, 0)
        WHERE COALESCE(upper_amount, 0) = 0
          AND COALESCE(local_amount, 0) = 0
          AND COALESCE(amount, 0) != 0;
        ",
    )?;

    Ok(())
}

fn ensure_data_source_foreign_keys_schema(connection: &Connection) -> StorageResult<()> {
    let should_rebuild_column_mappings = table_exists(connection, "column_mappings")?
        && !table_references_parent(connection, "column_mappings", "data_sources")?;
    let should_rebuild_projects = table_exists(connection, "projects")?
        && table_has_column(connection, "projects", "source_id")?
        && !table_references_parent(connection, "projects", "data_sources")?;

    if !should_rebuild_column_mappings && !should_rebuild_projects {
        return Ok(());
    }

    connection.execute_batch("PRAGMA foreign_keys = OFF;")?;

    if should_rebuild_column_mappings {
        connection.execute_batch(
            "
            ALTER TABLE column_mappings RENAME TO column_mappings_legacy_fk_fix;

            CREATE TABLE column_mappings (
                source_id TEXT NOT NULL,
                standard_field TEXT NOT NULL,
                excel_column TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (source_id, standard_field),
                FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
            );

            INSERT INTO column_mappings (
                source_id,
                standard_field,
                excel_column,
                created_at,
                updated_at
            )
            SELECT
                source_id,
                standard_field,
                excel_column,
                created_at,
                updated_at
            FROM column_mappings_legacy_fk_fix;

            DROP TABLE column_mappings_legacy_fk_fix;
            ",
        )?;
    }

    if should_rebuild_projects {
        connection.execute_batch(
            "
            ALTER TABLE projects RENAME TO projects_legacy_fk_fix;

            CREATE TABLE projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT,
                year TEXT,
                district TEXT,
                level TEXT,
                category TEXT,
                name TEXT NOT NULL,
                enterprise TEXT,
                progress TEXT,
                upper_amount REAL NOT NULL DEFAULT 0,
                local_amount REAL NOT NULL DEFAULT 0,
                amount REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
            );

            INSERT INTO projects (
                id,
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
                amount,
                created_at,
                updated_at
            )
            SELECT
                id,
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
                amount,
                created_at,
                updated_at
            FROM projects_legacy_fk_fix;

            DROP TABLE projects_legacy_fk_fix;
            ",
        )?;
    }

    connection.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(())
}

fn create_indexes(connection: &Connection) -> StorageResult<()> {
    connection.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_projects_source_id
        ON projects(source_id);

        CREATE INDEX IF NOT EXISTS idx_column_mappings_source_id
        ON column_mappings(source_id);

        CREATE INDEX IF NOT EXISTS idx_journal_task_checklist_items_task_id
        ON journal_task_checklist_items(task_id);

        DROP INDEX IF EXISTS idx_data_sources_file_path;

        CREATE INDEX IF NOT EXISTS idx_data_sources_file_path_sheet_name
        ON data_sources(file_path, sheet_name);
        ",
    )?;

    Ok(())
}

fn table_exists(connection: &Connection, table_name: &str) -> StorageResult<bool> {
    let exists = connection.query_row(
        "
        SELECT EXISTS(
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = ?1
        )
        ",
        [table_name],
        |row| row.get::<_, i64>(0),
    )?;

    Ok(exists == 1)
}

fn table_has_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
) -> StorageResult<bool> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table_name})"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;

    for row in rows {
        if row? == column_name {
            return Ok(true);
        }
    }

    Ok(false)
}

fn table_references_parent(
    connection: &Connection,
    table_name: &str,
    parent_table_name: &str,
) -> StorageResult<bool> {
    let mut statement = connection.prepare(&format!("PRAGMA foreign_key_list({table_name})"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(2))?;

    for row in rows {
        if row? == parent_table_name {
            return Ok(true);
        }
    }

    Ok(false)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::storage::db;

    use super::{
        ensure_data_sources_sheet_schema, initialize_schema, table_references_parent,
        SCHEMA_VERSION,
    };

    #[test]
    fn initializes_expected_tables_and_schema_version() {
        let db_path = unique_test_db_path();
        let connection = db::open_connection(&db_path).expect("open test db");

        initialize_schema(&connection).expect("initialize schema");

        let schema_version = db::read_schema_version(&connection).expect("read schema version");
        let tables = db::list_application_tables(&connection).expect("list application tables");

        assert_eq!(schema_version, SCHEMA_VERSION);
        assert_eq!(
            tables,
            vec![
                "app_settings".to_string(),
                "column_mappings".to_string(),
                "data_sources".to_string(),
                "directory_presets".to_string(),
                "journal_task_checklist_items".to_string(),
                "journal_tasks".to_string(),
                "journals".to_string(),
                "keyboard_shortcuts".to_string(),
                "mapped_items".to_string(),
                "notebooks".to_string(),
                "notes".to_string(),
                "projects".to_string(),
                "virtual_spaces".to_string(),
            ]
        );
        assert!(has_column(&connection, "projects", "source_id"));
        assert!(has_column(&connection, "data_sources", "sheet_name"));
        assert!(has_column(&connection, "data_sources", "header_row_number"));
        assert!(has_column(&connection, "data_sources", "last_sync_status"));
        assert!(has_column(
            &connection,
            "data_sources",
            "last_error_message"
        ));

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn migrates_existing_projects_table_to_source_schema() {
        let db_path = unique_test_db_path();
        let connection = db::open_connection(&db_path).expect("open test db");

        connection
            .execute_batch(
                "
                CREATE TABLE projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    year TEXT,
                    district TEXT,
                    level TEXT,
                    category TEXT,
                    name TEXT NOT NULL,
                    enterprise TEXT,
                    progress TEXT,
                    amount REAL NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                INSERT INTO projects (
                    year,
                    district,
                    level,
                    category,
                    name,
                    enterprise,
                    progress,
                    amount
                ) VALUES (
                    '2025',
                    '高新区',
                    '省级',
                    '科技项目',
                    '智能制造升级',
                    '示例企业',
                    '进行中',
                    120
                );

                PRAGMA user_version = 1;
                ",
            )
            .expect("seed legacy schema");

        initialize_schema(&connection).expect("migrate schema");

        assert!(has_column(&connection, "projects", "source_id"));
        let project_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("count projects");
        assert_eq!(project_count, 1);

        let legacy_row = connection
            .query_row(
                "SELECT year, district, level, category, name, enterprise, progress, amount, source_id FROM projects",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, f64>(7)?,
                        row.get::<_, Option<String>>(8)?,
                    ))
                },
            )
            .expect("read migrated row");
        assert_eq!(legacy_row.0.as_deref(), Some("2025"));
        assert_eq!(legacy_row.1.as_deref(), Some("高新区"));
        assert_eq!(legacy_row.4, "智能制造升级");
        assert_eq!(legacy_row.7, 120.0);
        assert_eq!(legacy_row.8, None);

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn migrates_existing_data_sources_to_sheet_aware_schema() {
        let db_path = unique_test_db_path();
        let connection = db::open_connection(&db_path).expect("open test db");

        connection
            .execute_batch(
                "
                CREATE TABLE data_sources (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL UNIQUE,
                    last_sync_time TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE column_mappings (
                    source_id TEXT NOT NULL,
                    standard_field TEXT NOT NULL,
                    excel_column TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (source_id, standard_field),
                    FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
                );

                CREATE TABLE projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id TEXT,
                    year TEXT,
                    district TEXT,
                    level TEXT,
                    category TEXT,
                    name TEXT NOT NULL,
                    enterprise TEXT,
                    progress TEXT,
                    amount REAL NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
                );

                INSERT INTO data_sources (id, file_path, last_sync_time)
                VALUES ('source-1', 'D:\\shared\\projects.xlsx', '2026-03-22T10:00:00Z');

                INSERT INTO column_mappings (source_id, standard_field, excel_column)
                VALUES ('source-1', 'name', '项目名称');

                INSERT INTO projects (source_id, name, amount)
                VALUES ('source-1', '示例项目', 100);

                PRAGMA user_version = 2;
                ",
            )
            .expect("seed v2 schema");

        initialize_schema(&connection).expect("migrate schema");

        assert!(has_column(&connection, "data_sources", "sheet_name"));
        let migrated = connection
            .query_row(
                "
                SELECT file_path, sheet_name, header_row_number, last_sync_time, last_sync_status, last_error_message
                FROM data_sources
                WHERE id = 'source-1'
                ",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                },
            )
            .expect("read migrated data source");
        assert_eq!(migrated.0, "D:\\shared\\projects.xlsx");
        assert_eq!(migrated.1, "");
        assert_eq!(migrated.2, 1);
        assert_eq!(migrated.3.as_deref(), Some("2026-03-22T10:00:00Z"));
        assert_eq!(migrated.4, "never");
        assert_eq!(migrated.5, None);

        let mapping_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM column_mappings WHERE source_id = 'source-1'",
                [],
                |row| row.get(0),
            )
            .expect("count mappings");
        let project_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE source_id = 'source-1'",
                [],
                |row| row.get(0),
            )
            .expect("count projects");
        assert_eq!(mapping_count, 1);
        assert_eq!(project_count, 1);

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn migrates_v3_data_sources_to_add_sync_state_columns() {
        let db_path = unique_test_db_path();
        let connection = db::open_connection(&db_path).expect("open test db");

        connection
            .execute_batch(
                "
                PRAGMA foreign_keys = OFF;

                CREATE TABLE data_sources_legacy_v2 (
                    id TEXT PRIMARY KEY
                );

                CREATE TABLE data_sources (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    sheet_name TEXT NOT NULL DEFAULT '',
                    last_sync_time TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (file_path, sheet_name)
                );

                CREATE TABLE column_mappings (
                    source_id TEXT NOT NULL,
                    standard_field TEXT NOT NULL,
                    excel_column TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (source_id, standard_field),
                    FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
                );

                CREATE TABLE projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id TEXT,
                    name TEXT NOT NULL,
                    amount REAL NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
                );

                INSERT INTO data_sources (id, file_path, sheet_name, last_sync_time)
                VALUES ('source-1', 'D:\\shared\\projects.xlsx', '项目表', '2026-03-22T10:00:00Z');

                PRAGMA user_version = 3;
                ",
            )
            .expect("seed v3 schema");

        initialize_schema(&connection).expect("migrate schema");

        let migrated = connection
            .query_row(
                "
                SELECT sheet_name, last_sync_status, last_error_message
                FROM data_sources
                WHERE id = 'source-1'
                ",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .expect("read migrated v3 row");
        assert_eq!(migrated.0, "项目表");
        assert_eq!(migrated.1, "never");
        assert_eq!(migrated.2, None);

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn migrates_v5_data_sources_to_add_header_row_number() {
        let db_path = unique_test_db_path();
        let connection = db::open_connection(&db_path).expect("open test db");

        connection
            .execute_batch(
                "
                CREATE TABLE data_sources (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    sheet_name TEXT NOT NULL DEFAULT '',
                    last_sync_time TEXT,
                    last_sync_status TEXT NOT NULL DEFAULT 'success',
                    last_error_message TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (file_path, sheet_name)
                );

                INSERT INTO data_sources (id, file_path, sheet_name, last_sync_time)
                VALUES ('source-1', 'D:\\shared\\projects.xlsx', 'sheet-1', '2026-03-22T10:00:00Z');

                PRAGMA user_version = 5;
                ",
            )
            .expect("seed v5 schema");

        initialize_schema(&connection).expect("migrate schema");

        let migrated = connection
            .query_row(
                "
                SELECT header_row_number
                FROM data_sources
                WHERE id = 'source-1'
                ",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("read migrated v5 row");
        assert_eq!(migrated, 1);

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn repairs_foreign_keys_pointing_to_legacy_data_sources_table() {
        let db_path = unique_test_db_path();
        let connection = db::open_connection(&db_path).expect("open test db");

        connection
            .execute_batch(
                "
                CREATE TABLE data_sources (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL UNIQUE,
                    last_sync_time TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE column_mappings (
                    source_id TEXT NOT NULL,
                    standard_field TEXT NOT NULL,
                    excel_column TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (source_id, standard_field),
                    FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
                );

                CREATE TABLE projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id TEXT,
                    year TEXT,
                    district TEXT,
                    level TEXT,
                    category TEXT,
                    name TEXT NOT NULL,
                    enterprise TEXT,
                    progress TEXT,
                    amount REAL NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
                );

                INSERT INTO data_sources (id, file_path, last_sync_time)
                VALUES ('source-1', 'D:\\shared\\projects.xlsx', '2026-03-22T10:00:00Z');

                INSERT INTO column_mappings (source_id, standard_field, excel_column)
                VALUES ('source-1', 'name', '项目名称');

                INSERT INTO projects (source_id, name, amount)
                VALUES ('source-1', '示例项目', 100);

                PRAGMA user_version = 2;
                ",
            )
            .expect("seed v2 schema");

        ensure_data_sources_sheet_schema(&connection)
            .expect("introduce broken sheet migration state");
        assert!(
            table_references_parent(&connection, "column_mappings", "data_sources_legacy_v2")
                .expect("legacy fk parent")
        );
        assert!(
            table_references_parent(&connection, "projects", "data_sources_legacy_v2")
                .expect("legacy fk parent")
        );

        initialize_schema(&connection).expect("repair schema");

        assert!(
            table_references_parent(&connection, "column_mappings", "data_sources")
                .expect("fk parent")
        );
        assert!(
            table_references_parent(&connection, "projects", "data_sources").expect("fk parent")
        );

        let mapping_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM column_mappings", [], |row| row.get(0))
            .expect("count mappings");
        let project_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("count projects");
        assert_eq!(mapping_count, 1);
        assert_eq!(project_count, 1);

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    fn has_column(connection: &rusqlite::Connection, table_name: &str, column_name: &str) -> bool {
        let mut statement = connection
            .prepare(&format!("PRAGMA table_info({table_name})"))
            .expect("prepare table info");
        let rows = statement
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query columns");

        let found = rows.filter_map(Result::ok).any(|name| name == column_name);
        found
    }

    fn unique_test_db_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!("personal-os-schema-{nanos}.sqlite3"))
    }
}
