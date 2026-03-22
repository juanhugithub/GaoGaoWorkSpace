use std::{fs, path::Path, process::Command};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    storage::{
        db,
        models::{
            DirectoryNodeDto, DirectoryPresetDto, GenerateDirectoryResultDto, MappedItemNodeDto,
            OperationResultDto, VirtualSpaceDto,
        },
        StorageResult,
    },
};

const DEFAULT_VIRTUAL_SPACES: [(&str, &str, i64); 3] = [
    ("vs-projects", "项目申报", 0),
    ("vs-safety", "安全生产", 1),
    ("vs-activities", "党建与活动", 2),
];

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[tauri::command]
pub fn list_virtual_spaces(state: State<AppState>) -> Result<Vec<VirtualSpaceDto>, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    ensure_default_virtual_spaces(&connection).map_err(|error| error.to_string())?;
    list_virtual_spaces_internal(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_virtual_space(
    state: State<AppState>,
    name: String,
) -> Result<VirtualSpaceDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    ensure_default_virtual_spaces(&connection).map_err(|error| error.to_string())?;
    create_virtual_space_internal(&connection, name.trim()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_virtual_space(
    state: State<AppState>,
    space_id: String,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    delete_virtual_space_internal(&connection, &space_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_mapped_items_tree(
    state: State<AppState>,
    space_id: String,
) -> Result<Vec<MappedItemNodeDto>, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    list_mapped_items_tree_internal(&connection, &space_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn add_mapped_items(
    state: State<AppState>,
    space_id: String,
    paths: Vec<String>,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    add_mapped_items_internal(&connection, &space_id, &paths).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn remove_mapped_item(
    state: State<AppState>,
    mapped_item_id: String,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    remove_mapped_item_internal(&connection, &mapped_item_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_path_with_system(path: String) -> Result<OperationResultDto, String> {
    open_path_with_system_internal(Path::new(path.trim())).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reveal_path_in_system(path: String) -> Result<OperationResultDto, String> {
    reveal_path_in_system_internal(Path::new(path.trim())).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_directory_presets(state: State<AppState>) -> Result<Vec<DirectoryPresetDto>, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    ensure_default_directory_presets(&connection).map_err(|error| error.to_string())?;
    list_directory_presets_internal(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_directory_preset(
    state: State<AppState>,
    name: String,
    tree: Vec<DirectoryNodeDto>,
) -> Result<DirectoryPresetDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    save_directory_preset_internal(&connection, name.trim(), &tree)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_directory_preset(
    state: State<AppState>,
    preset_id: String,
) -> Result<OperationResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    delete_directory_preset_internal(&connection, &preset_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn generate_directory_structure(
    target_path: String,
    tree: Vec<DirectoryNodeDto>,
) -> Result<GenerateDirectoryResultDto, String> {
    generate_directory_structure_internal(target_path.trim(), &tree)
        .map_err(|error| error.to_string())
}

fn list_virtual_spaces_internal(connection: &Connection) -> StorageResult<Vec<VirtualSpaceDto>> {
    let mut statement = connection.prepare(
        "
        SELECT
            virtual_spaces.id,
            virtual_spaces.name,
            virtual_spaces.sort_order,
            COUNT(mapped_items.id) AS mapped_count
        FROM virtual_spaces
        LEFT JOIN mapped_items ON mapped_items.virtual_space_id = virtual_spaces.id
        GROUP BY virtual_spaces.id, virtual_spaces.name, virtual_spaces.sort_order
        ORDER BY virtual_spaces.sort_order ASC, virtual_spaces.created_at ASC
        ",
    )?;

    let rows = statement.query_map([], |row| {
        Ok(VirtualSpaceDto {
            id: row.get(0)?,
            name: row.get(1)?,
            sort_order: row.get(2)?,
            mapped_count: row.get(3)?,
        })
    })?;

    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn create_virtual_space_internal(
    connection: &Connection,
    name: &str,
) -> StorageResult<VirtualSpaceDto> {
    if name.is_empty() {
        return Err("分类名称不能为空".into());
    }

    let next_sort_order: i64 = connection.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM virtual_spaces",
        [],
        |row| row.get(0),
    )?;
    let id = Uuid::new_v4().to_string();

    connection.execute(
        "
        INSERT INTO virtual_spaces (id, name, sort_order)
        VALUES (?1, ?2, ?3)
        ",
        params![id, name, next_sort_order],
    )?;

    Ok(VirtualSpaceDto {
        id,
        name: name.to_string(),
        mapped_count: 0,
        sort_order: next_sort_order,
    })
}

fn delete_virtual_space_internal(
    connection: &Connection,
    space_id: &str,
) -> StorageResult<OperationResultDto> {
    let affected = connection.execute(
        "
        DELETE FROM virtual_spaces
        WHERE id = ?1
        ",
        [space_id],
    )?;

    if affected == 0 {
        return Err(format!("virtual space not found: {space_id}").into());
    }

    Ok(OperationResultDto {
        success: true,
        message: "业务场景已删除".to_string(),
    })
}

fn list_mapped_items_tree_internal(
    connection: &Connection,
    space_id: &str,
) -> StorageResult<Vec<MappedItemNodeDto>> {
    let mut statement = connection.prepare(
        "
        SELECT id, item_type, display_name, real_path, tag
        FROM mapped_items
        WHERE virtual_space_id = ?1
        ORDER BY sort_order ASC, created_at ASC
        ",
    )?;

    let rows = statement.query_map([space_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
        ))
    })?;

    let mut nodes = Vec::new();
    for row in rows {
        let (mapped_item_id, item_type, display_name, real_path, tag) = row?;
        nodes.push(build_mapped_root_node(
            &mapped_item_id,
            &item_type,
            &display_name,
            &real_path,
            tag,
        )?);
    }

    Ok(nodes)
}

fn add_mapped_items_internal(
    connection: &Connection,
    space_id: &str,
    paths: &[String],
) -> StorageResult<OperationResultDto> {
    if paths.is_empty() {
        return Err("没有选择任何要映射的路径".into());
    }

    let next_sort_order: i64 = connection.query_row(
        "
        SELECT COALESCE(MAX(sort_order), -1) + 1
        FROM mapped_items
        WHERE virtual_space_id = ?1
        ",
        [space_id],
        |row| row.get(0),
    )?;

    let mut current_sort_order = next_sort_order;
    let transaction = connection.unchecked_transaction()?;
    for raw_path in paths {
        let path = Path::new(raw_path.trim());
        if raw_path.trim().is_empty() || !path.exists() {
            continue;
        }

        let metadata = fs::metadata(path)?;
        let item_type = if metadata.is_dir() { "folder" } else { "file" };
        let display_name = display_name_for_path(path);
        let tag = derive_path_tag(path);

        transaction.execute(
            "
            INSERT INTO mapped_items (
                id,
                virtual_space_id,
                item_type,
                display_name,
                real_path,
                tag,
                sort_order
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(virtual_space_id, real_path) DO UPDATE SET
                item_type = excluded.item_type,
                display_name = excluded.display_name,
                tag = excluded.tag,
                updated_at = CURRENT_TIMESTAMP
            ",
            params![
                Uuid::new_v4().to_string(),
                space_id,
                item_type,
                display_name,
                path.to_string_lossy().to_string(),
                tag,
                current_sort_order,
            ],
        )?;

        current_sort_order += 1;
    }

    transaction.commit()?;

    Ok(OperationResultDto {
        success: true,
        message: "映射已更新".to_string(),
    })
}

fn remove_mapped_item_internal(
    connection: &Connection,
    mapped_item_id: &str,
) -> StorageResult<OperationResultDto> {
    let affected = connection.execute(
        "
        DELETE FROM mapped_items
        WHERE id = ?1
        ",
        [mapped_item_id],
    )?;

    if affected == 0 {
        return Err(format!("mapped item not found: {mapped_item_id}").into());
    }

    Ok(OperationResultDto {
        success: true,
        message: "映射已移除".to_string(),
    })
}

fn list_directory_presets_internal(
    connection: &Connection,
) -> StorageResult<Vec<DirectoryPresetDto>> {
    let mut statement = connection.prepare(
        "
        SELECT id, name, tree_json
        FROM directory_presets
        ORDER BY created_at ASC, name ASC
        ",
    )?;

    let rows = statement.query_map([], |row| {
        let tree_json = row.get::<_, String>(2)?;
        let tree = serde_json::from_str::<Vec<DirectoryNodeDto>>(&tree_json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                2,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?;
        Ok(DirectoryPresetDto {
            id: row.get(0)?,
            name: row.get(1)?,
            tree,
        })
    })?;

    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn save_directory_preset_internal(
    connection: &Connection,
    name: &str,
    tree: &[DirectoryNodeDto],
) -> StorageResult<DirectoryPresetDto> {
    if name.is_empty() {
        return Err("预设名称不能为空".into());
    }
    if tree.is_empty() {
        return Err("当前目录结构为空，无法保存为预设".into());
    }

    let id = Uuid::new_v4().to_string();
    let tree_json = serde_json::to_string(tree)?;
    connection.execute(
        "
        INSERT INTO directory_presets (id, name, tree_json)
        VALUES (?1, ?2, ?3)
        ",
        params![id, name, tree_json],
    )?;

    Ok(DirectoryPresetDto {
        id,
        name: name.to_string(),
        tree: tree.to_vec(),
    })
}

fn delete_directory_preset_internal(
    connection: &Connection,
    preset_id: &str,
) -> StorageResult<OperationResultDto> {
    let affected = connection.execute(
        "
        DELETE FROM directory_presets
        WHERE id = ?1
        ",
        [preset_id],
    )?;

    if affected == 0 {
        return Err(format!("directory preset not found: {preset_id}").into());
    }

    Ok(OperationResultDto {
        success: true,
        message: "目录预设已删除".to_string(),
    })
}

fn generate_directory_structure_internal(
    target_path: &str,
    tree: &[DirectoryNodeDto],
) -> StorageResult<GenerateDirectoryResultDto> {
    if target_path.is_empty() {
        return Err("目标路径不能为空".into());
    }
    if tree.is_empty() {
        return Err("目录结构为空，无法生成".into());
    }

    let root = Path::new(target_path);
    fs::create_dir_all(root)?;

    let mut created_count = 0;
    for node in tree {
        created_count += create_directory_node(root, node)?;
    }

    Ok(GenerateDirectoryResultDto {
        target_path: root.to_string_lossy().to_string(),
        created_count,
    })
}

fn ensure_default_virtual_spaces(connection: &Connection) -> StorageResult<()> {
    let existing_count: i64 =
        connection.query_row("SELECT COUNT(*) FROM virtual_spaces", [], |row| row.get(0))?;
    if existing_count > 0 {
        return Ok(());
    }

    let transaction = connection.unchecked_transaction()?;
    for (id, name, sort_order) in DEFAULT_VIRTUAL_SPACES {
        transaction.execute(
            "
            INSERT INTO virtual_spaces (id, name, sort_order)
            VALUES (?1, ?2, ?3)
            ",
            params![id, name, sort_order],
        )?;
    }
    transaction.commit()?;
    Ok(())
}

fn ensure_default_directory_presets(connection: &Connection) -> StorageResult<()> {
    let existing_count: i64 =
        connection.query_row("SELECT COUNT(*) FROM directory_presets", [], |row| {
            row.get(0)
        })?;
    if existing_count > 0 {
        return Ok(());
    }

    let presets = default_directory_presets();
    let transaction = connection.unchecked_transaction()?;
    for preset in presets {
        transaction.execute(
            "
            INSERT INTO directory_presets (id, name, tree_json)
            VALUES (?1, ?2, ?3)
            ",
            params![preset.id, preset.name, serde_json::to_string(&preset.tree)?],
        )?;
    }
    transaction.commit()?;
    Ok(())
}

fn default_directory_presets() -> Vec<DirectoryPresetDto> {
    vec![
        DirectoryPresetDto {
            id: "preset-district-collection".to_string(),
            name: "11区镇材料收集".to_string(),
            tree: vec![DirectoryNodeDto {
                id: "root-districts".to_string(),
                name: "2025年度各区镇材料汇总".to_string(),
                children: [
                    "高新区",
                    "经开区",
                    "主城区",
                    "周市镇",
                    "张浦镇",
                    "巴城镇",
                    "千灯镇",
                    "淀山湖镇",
                    "锦溪镇",
                    "周庄镇",
                    "陆家镇",
                ]
                .iter()
                .enumerate()
                .map(|(index, district)| DirectoryNodeDto {
                    id: format!("district-{index}"),
                    name: (*district).to_string(),
                    children: vec![
                        DirectoryNodeDto {
                            id: format!("district-{index}-summary"),
                            name: "01_工作总结".to_string(),
                            children: vec![],
                        },
                        DirectoryNodeDto {
                            id: format!("district-{index}-ledger"),
                            name: "02_项目台账".to_string(),
                            children: vec![],
                        },
                        DirectoryNodeDto {
                            id: format!("district-{index}-attachments"),
                            name: "03_证明附件".to_string(),
                            children: vec![],
                        },
                    ],
                })
                .collect(),
            }],
        },
        DirectoryPresetDto {
            id: "preset-project-application".to_string(),
            name: "标准项目申报".to_string(),
            tree: vec![DirectoryNodeDto {
                id: "root-project".to_string(),
                name: "标准项目申报材料结构".to_string(),
                children: vec![
                    DirectoryNodeDto {
                        id: "project-1".to_string(),
                        name: "01_正式申报书".to_string(),
                        children: vec![],
                    },
                    DirectoryNodeDto {
                        id: "project-2".to_string(),
                        name: "02_企业基础材料".to_string(),
                        children: vec![
                            DirectoryNodeDto {
                                id: "project-2-1".to_string(),
                                name: "营业执照及法人材料".to_string(),
                                children: vec![],
                            },
                            DirectoryNodeDto {
                                id: "project-2-2".to_string(),
                                name: "近三年财务审计报告".to_string(),
                                children: vec![],
                            },
                            DirectoryNodeDto {
                                id: "project-2-3".to_string(),
                                name: "完税证明".to_string(),
                                children: vec![],
                            },
                        ],
                    },
                    DirectoryNodeDto {
                        id: "project-3".to_string(),
                        name: "03_核心技术材料".to_string(),
                        children: vec![
                            DirectoryNodeDto {
                                id: "project-3-1".to_string(),
                                name: "发明专利与软著".to_string(),
                                children: vec![],
                            },
                            DirectoryNodeDto {
                                id: "project-3-2".to_string(),
                                name: "第三方权威检测报告".to_string(),
                                children: vec![],
                            },
                            DirectoryNodeDto {
                                id: "project-3-3".to_string(),
                                name: "科技查新报告".to_string(),
                                children: vec![],
                            },
                        ],
                    },
                ],
            }],
        },
    ]
}

fn build_mapped_root_node(
    mapped_item_id: &str,
    item_type: &str,
    display_name: &str,
    real_path: &str,
    tag: Option<String>,
) -> StorageResult<MappedItemNodeDto> {
    let path = Path::new(real_path);
    let exists = path.exists();

    let mut node = MappedItemNodeDto {
        id: format!("mapped::{mapped_item_id}"),
        mapped_item_id: Some(mapped_item_id.to_string()),
        item_type: item_type.to_string(),
        display_name: display_name.to_string(),
        real_path: real_path.to_string(),
        tag,
        exists,
        is_mapped_root: true,
        expanded: item_type == "folder",
        children: vec![],
    };

    if exists && item_type == "folder" {
        node.children = build_filesystem_children(path)?;
    }

    Ok(node)
}

fn build_filesystem_children(path: &Path) -> StorageResult<Vec<MappedItemNodeDto>> {
    let read_dir = match fs::read_dir(path) {
        Ok(read_dir) => read_dir,
        Err(_) => return Ok(vec![]),
    };

    let mut entries = Vec::new();
    for entry in read_dir {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let child_path = entry.path();
        let metadata = match fs::symlink_metadata(&child_path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };

        let is_directory = metadata.is_dir() && !metadata.file_type().is_symlink();
        let child_name = display_name_for_path(&child_path);
        let mut node = MappedItemNodeDto {
            id: format!("fs::{}", child_path.to_string_lossy()),
            mapped_item_id: None,
            item_type: if is_directory { "folder" } else { "file" }.to_string(),
            display_name: child_name,
            real_path: child_path.to_string_lossy().to_string(),
            tag: None,
            exists: true,
            is_mapped_root: false,
            expanded: false,
            children: vec![],
        };

        if is_directory {
            node.children = build_filesystem_children(&child_path)?;
        }

        entries.push(node);
    }

    entries.sort_by(|left, right| {
        let left_rank = if left.item_type == "folder" { 0 } else { 1 };
        let right_rank = if right.item_type == "folder" { 0 } else { 1 };
        left_rank.cmp(&right_rank).then_with(|| {
            left.display_name
                .to_lowercase()
                .cmp(&right.display_name.to_lowercase())
        })
    });

    Ok(entries)
}

fn display_name_for_path(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn derive_path_tag(path: &Path) -> Option<String> {
    let path_text = path.to_string_lossy();
    if path_text.starts_with("\\\\") {
        Some("共享盘".to_string())
    } else if path.is_absolute() {
        Some("本地".to_string())
    } else {
        None
    }
}

fn create_directory_node(base: &Path, node: &DirectoryNodeDto) -> StorageResult<usize> {
    let name = node.name.trim();
    if name.is_empty() {
        return Ok(0);
    }

    let current_path = base.join(name);
    fs::create_dir_all(&current_path)?;
    let mut created_count = 1;
    for child in &node.children {
        created_count += create_directory_node(&current_path, child)?;
    }
    Ok(created_count)
}

fn open_path_with_system_internal(path: &Path) -> StorageResult<OperationResultDto> {
    if path.as_os_str().is_empty() {
        return Err("路径不能为空".into());
    }
    if !path.exists() {
        return Err(format!("路径不存在: {}", path.display()).into());
    }

    let status = if cfg!(target_os = "windows") {
        let mut command = Command::new("cmd");
        command.arg("/C").arg("start").arg("").arg(path.as_os_str());
        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);
        command.status()?
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(path).status()?
    } else {
        Command::new("xdg-open").arg(path).status()?
    };

    if !status.success() {
        return Err(format!("无法打开路径: {}", path.display()).into());
    }

    Ok(OperationResultDto {
        success: true,
        message: "已调用系统默认程序打开".to_string(),
    })
}

fn reveal_path_in_system_internal(path: &Path) -> StorageResult<OperationResultDto> {
    if path.as_os_str().is_empty() {
        return Err("路径不能为空".into());
    }
    if !path.exists() {
        return Err(format!("路径不存在: {}", path.display()).into());
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("explorer");
        if path.is_dir() {
            command.arg(path);
        } else {
            command.arg(format!("/select,{}", path.display()));
        }
        command.creation_flags(CREATE_NO_WINDOW).spawn()?;

        return Ok(OperationResultDto {
            success: true,
            message: "已打开所在位置".to_string(),
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = if cfg!(target_os = "macos") {
            if path.is_dir() {
                Command::new("open").arg(path).status()?
            } else {
                Command::new("open").arg("-R").arg(path).status()?
            }
        } else {
            let target = if path.is_dir() {
                path.to_path_buf()
            } else {
                path.parent()
                    .map(Path::to_path_buf)
                    .unwrap_or_else(|| path.to_path_buf())
            };
            Command::new("xdg-open").arg(target).status()?
        };

        if !status.success() {
            return Err(format!("无法打开所在位置: {}", path.display()).into());
        }

        return Ok(OperationResultDto {
            success: true,
            message: "已打开所在位置".to_string(),
        });
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::storage::migrations;
    use crate::storage::models::DirectoryNodeDto;

    use super::{
        add_mapped_items_internal, create_virtual_space_internal, delete_directory_preset_internal,
        ensure_default_directory_presets, generate_directory_structure_internal,
        list_directory_presets_internal, list_mapped_items_tree_internal,
        save_directory_preset_internal,
    };

    #[test]
    fn lists_default_directory_presets() {
        let db_path = unique_test_db_path();
        let connection = crate::storage::db::open_connection(&db_path).expect("open db");
        migrations::initialize_schema(&connection).expect("initialize schema");

        ensure_default_directory_presets(&connection).expect("seed presets");
        let presets = list_directory_presets_internal(&connection).expect("list presets");

        assert_eq!(presets.len(), 2);
        assert_eq!(presets[0].name, "11区镇材料收集");

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn deletes_saved_directory_preset() {
        let db_path = unique_test_db_path();
        let connection = crate::storage::db::open_connection(&db_path).expect("open db");
        migrations::initialize_schema(&connection).expect("initialize schema");

        let preset = save_directory_preset_internal(
            &connection,
            "自定义模板",
            &[DirectoryNodeDto {
                id: "root".to_string(),
                name: "根目录".to_string(),
                children: vec![],
            }],
        )
        .expect("save preset");

        delete_directory_preset_internal(&connection, &preset.id).expect("delete preset");
        let presets = list_directory_presets_internal(&connection).expect("list presets");
        assert!(presets.into_iter().all(|item| item.id != preset.id));

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn maps_folder_and_builds_tree_from_filesystem() {
        let db_path = unique_test_db_path();
        let root_dir = unique_test_dir("mapped-tree");
        let nested_dir = root_dir.join("子目录");
        fs::create_dir_all(&nested_dir).expect("create nested dir");
        fs::write(root_dir.join("说明.txt"), "demo").expect("write file");
        fs::write(nested_dir.join("附件.docx"), "demo").expect("write nested file");

        let connection = crate::storage::db::open_connection(&db_path).expect("open db");
        migrations::initialize_schema(&connection).expect("initialize schema");
        let space = create_virtual_space_internal(&connection, "测试空间").expect("create space");
        add_mapped_items_internal(
            &connection,
            &space.id,
            &[root_dir.to_string_lossy().to_string()],
        )
        .expect("add mapping");

        let nodes = list_mapped_items_tree_internal(&connection, &space.id).expect("list tree");
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].item_type, "folder");
        assert!(nodes[0]
            .children
            .iter()
            .any(|child| child.display_name == "说明.txt"));
        assert!(nodes[0]
            .children
            .iter()
            .any(|child| child.display_name == "子目录"));

        drop(connection);
        let _ = fs::remove_file(db_path);
        let _ = fs::remove_dir_all(root_dir);
    }

    #[test]
    fn generates_directory_structure_recursively() {
        let target_dir = unique_test_dir("generated-tree");
        let tree = vec![DirectoryNodeDto {
            id: "root".to_string(),
            name: "项目资料".to_string(),
            children: vec![DirectoryNodeDto {
                id: "child".to_string(),
                name: "01_申报书".to_string(),
                children: vec![],
            }],
        }];

        let result =
            generate_directory_structure_internal(target_dir.to_string_lossy().as_ref(), &tree)
                .expect("generate directories");

        assert_eq!(result.created_count, 2);
        assert!(target_dir.join("项目资料").exists());
        assert!(target_dir.join("项目资料").join("01_申报书").exists());

        let _ = fs::remove_dir_all(target_dir);
    }

    fn unique_test_db_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("personal-os-workspace-{nanos}.sqlite3"))
    }

    fn unique_test_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("{prefix}-{nanos}"));
        fs::create_dir_all(&path).expect("create unique test dir");
        path
    }
}
