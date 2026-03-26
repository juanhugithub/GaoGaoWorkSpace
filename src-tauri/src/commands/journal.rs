use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::Path,
};

use chrono::{Datelike, Local, NaiveDate, Weekday};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use tauri::State;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    storage::{
        db,
        models::{
            ChecklistItemDto, ExportMarkdownResultDto, JournalDetailDto, JournalListItemDto,
            JournalTaskDto, SaveJournalPayload,
        },
        StorageResult,
    },
};

const JOURNAL_CATEGORIES: [&str; 5] = ["安全生产", "科技项目", "材料报送", "活动对接", "其他事项"];
const COMPLETED_PROGRESS: &str = "已完成";

#[tauri::command]
pub fn list_journals(state: State<AppState>) -> Result<Vec<JournalListItemDto>, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    list_journals_internal(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_journal_detail(
    state: State<AppState>,
    journal_id: String,
) -> Result<JournalDetailDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    fetch_journal_detail(&connection, &journal_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_today_journal(state: State<AppState>) -> Result<JournalDetailDto, String> {
    let mut connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    create_or_get_journal_for_date(&mut connection, Local::now().date_naive())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_journal_for_date(
    state: State<AppState>,
    journal_date: String,
) -> Result<JournalDetailDto, String> {
    let target_date = NaiveDate::parse_from_str(journal_date.trim(), "%Y-%m-%d")
        .map_err(|_| format!("invalid journal date: {journal_date}"))?;
    let mut connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    create_or_get_journal_for_date(&mut connection, target_date).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_journal(
    state: State<AppState>,
    journal: SaveJournalPayload,
) -> Result<JournalDetailDto, String> {
    let mut connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    save_journal_internal(&mut connection, journal).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_journals_markdown(
    state: State<AppState>,
    journal_ids: Vec<String>,
    output_path: String,
) -> Result<ExportMarkdownResultDto, String> {
    let connection = db::open_connection(state.db_path()).map_err(|error| error.to_string())?;
    export_journals_markdown_internal(&connection, &journal_ids, output_path.trim())
        .map_err(|error| error.to_string())
}

fn list_journals_internal(connection: &Connection) -> StorageResult<Vec<JournalListItemDto>> {
    let mut statement = connection.prepare(
        "
        SELECT id, journal_date, weekday
        FROM journals
        ORDER BY journal_date DESC
        ",
    )?;

    let rows = statement.query_map([], |row| {
        let journal_date = row.get::<_, String>(1)?;
        Ok(JournalListItemDto {
            id: row.get(0)?,
            journal_date: journal_date.clone(),
            date: format_display_date(&journal_date),
            weekday: row.get(2)?,
        })
    })?;

    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn fetch_journal_detail(
    connection: &Connection,
    journal_id: &str,
) -> StorageResult<JournalDetailDto> {
    let journal = connection
        .query_row(
            "
            SELECT id, journal_date, weekday, review
            FROM journals
            WHERE id = ?1
            ",
            [journal_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()?;

    let Some((id, journal_date, weekday, review)) = journal else {
        return Err(format!("journal not found: {journal_id}").into());
    };

    let checklist_items = load_checklist_items_by_journal(connection, journal_id)?;
    let mut tasks = empty_tasks_map();
    let mut statement = connection.prepare(
        "
        SELECT
            id,
            category,
            content,
            contact,
            deadline_text,
            progress,
            priority,
            remark,
            carried_over_from_task_id,
            carried_over_from_date
        FROM journal_tasks
        WHERE journal_id = ?1
        ORDER BY category, sort_order, created_at, id
        ",
    )?;

    let rows = statement.query_map([journal_id], |row| {
        let task_id = row.get::<_, String>(0)?;
        Ok((
            task_id.clone(),
            row.get::<_, String>(1)?,
            JournalTaskDto {
                id: task_id.clone(),
                content: row.get(2)?,
                contact: row.get(3)?,
                deadline: row.get(4)?,
                progress: row.get(5)?,
                priority: row.get(6)?,
                remark: row.get(7)?,
                carried_over_from_task_id: row.get(8)?,
                carried_over_from_date: row.get(9)?,
                checklist_items: checklist_items.get(&task_id).cloned().unwrap_or_default(),
            },
        ))
    })?;

    for row in rows {
        let (_, category, task) = row?;
        tasks.entry(category).or_default().push(task);
    }

    Ok(JournalDetailDto {
        id,
        journal_date: journal_date.clone(),
        date: format_display_date(&journal_date),
        weekday,
        review,
        tasks,
    })
}

fn create_or_get_journal_for_date(
    connection: &mut Connection,
    target_date: NaiveDate,
) -> StorageResult<JournalDetailDto> {
    let journal_id = target_date.format("%Y-%m-%d").to_string();
    if journal_exists(connection, &journal_id)? {
        return fetch_journal_detail(connection, &journal_id);
    }

    let transaction = connection.transaction()?;
    transaction.execute(
        "
        INSERT INTO journals (id, journal_date, weekday, review)
        VALUES (?1, ?2, ?3, '')
        ",
        params![journal_id, journal_id, weekday_to_cn(target_date.weekday()),],
    )?;

    carry_over_latest_previous_tasks(&transaction, &journal_id, target_date)?;

    transaction.commit()?;
    fetch_journal_detail(connection, &journal_id)
}

fn carry_over_latest_previous_tasks(
    transaction: &Transaction<'_>,
    target_journal_id: &str,
    target_date: NaiveDate,
) -> StorageResult<()> {
    let target_date_text = target_date.format("%Y-%m-%d").to_string();
    let previous_journal = transaction
        .query_row(
            "
            SELECT id, journal_date
            FROM journals
            WHERE journal_date < ?1
            ORDER BY journal_date DESC
            LIMIT 1
            ",
            [target_date_text.as_str()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?;

    let Some((previous_journal_id, previous_journal_date)) = previous_journal else {
        return Ok(());
    };

    let mut category_sort_orders: HashMap<String, i64> = HashMap::new();
    let mut statement = transaction.prepare(
        "
        SELECT
            id,
            category,
            content,
            contact,
            deadline_text,
            progress,
            priority,
            remark
        FROM journal_tasks
        WHERE journal_id = ?1
          AND progress != ?2
        ORDER BY category, sort_order, created_at, id
        ",
    )?;

    let rows = statement.query_map(params![previous_journal_id, COMPLETED_PROGRESS], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
        ))
    })?;

    for row in rows {
        let (source_task_id, category, content, contact, deadline, progress, priority, remark) =
            row?;
        let sort_order = category_sort_orders.entry(category.clone()).or_insert(0);
        transaction.execute(
            "
            INSERT INTO journal_tasks (
                id,
                journal_id,
                category,
                content,
                contact,
                deadline_text,
                progress,
                priority,
                remark,
                sort_order,
                carried_over_from_task_id,
                carried_over_from_date
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ",
            params![
                Uuid::new_v4().to_string(),
                target_journal_id,
                category,
                content,
                contact,
                deadline,
                progress,
                priority,
                remark,
                *sort_order,
                source_task_id,
                previous_journal_date,
            ],
        )?;
        *sort_order += 1;
    }

    Ok(())
}

fn save_journal_internal(
    connection: &mut Connection,
    journal: SaveJournalPayload,
) -> StorageResult<JournalDetailDto> {
    let journal_id = journal.id.trim().to_string();
    if journal_id.is_empty() {
        return Err("journal id is required".into());
    }

    let (journal_date, weekday) = resolve_or_build_journal_meta(connection, &journal_id)?;
    let transaction = connection.transaction()?;

    transaction.execute(
        "
        INSERT INTO journals (id, journal_date, weekday, review)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(id) DO UPDATE SET
            journal_date = excluded.journal_date,
            weekday = excluded.weekday,
            review = excluded.review,
            updated_at = CURRENT_TIMESTAMP
        ",
        params![journal_id, journal_date, weekday, journal.review],
    )?;

    transaction.execute(
        "
        DELETE FROM journal_tasks
        WHERE journal_id = ?1
        ",
        [journal_id.as_str()],
    )?;

    for category in ordered_categories(&journal.tasks) {
        if let Some(tasks) = journal.tasks.get(&category) {
            for (index, task) in tasks.iter().enumerate() {
                let task_id = if task.id.trim().is_empty() {
                    Uuid::new_v4().to_string()
                } else {
                    task.id.clone()
                };

                transaction.execute(
                    "
                    INSERT INTO journal_tasks (
                        id,
                        journal_id,
                        category,
                        content,
                        contact,
                        deadline_text,
                        progress,
                        priority,
                        remark,
                        sort_order,
                        carried_over_from_task_id,
                        carried_over_from_date
                    )
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                    ",
                    params![
                        task_id,
                        journal_id,
                        category,
                        task.content,
                        task.contact,
                        task.deadline,
                        task.progress,
                        task.priority,
                        task.remark,
                        index as i64,
                        task.carried_over_from_task_id,
                        task.carried_over_from_date,
                    ],
                )?;

                for (checklist_index, checklist_item) in task
                    .checklist_items
                    .iter()
                    .filter(|item| !item.text.trim().is_empty())
                    .enumerate()
                {
                    let checklist_id = if checklist_item.id.trim().is_empty() {
                        Uuid::new_v4().to_string()
                    } else {
                        checklist_item.id.clone()
                    };

                    transaction.execute(
                        "
                        INSERT INTO journal_task_checklist_items (
                            id,
                            task_id,
                            text,
                            is_completed,
                            sort_order
                        )
                        VALUES (?1, ?2, ?3, ?4, ?5)
                        ",
                        params![
                            checklist_id,
                            task_id,
                            checklist_item.text.trim(),
                            if checklist_item.is_completed { 1 } else { 0 },
                            checklist_index as i64,
                        ],
                    )?;
                }
            }
        }
    }

    transaction.commit()?;
    fetch_journal_detail(connection, &journal_id)
}

fn export_journals_markdown_internal(
    connection: &Connection,
    journal_ids: &[String],
    output_path: &str,
) -> StorageResult<ExportMarkdownResultDto> {
    if journal_ids.is_empty() {
        return Err("请至少选择一篇日记进行导出".into());
    }
    if output_path.is_empty() {
        return Err("导出路径不能为空".into());
    }

    let mut journals = journal_ids
        .iter()
        .map(|journal_id| fetch_journal_detail(connection, journal_id))
        .collect::<StorageResult<Vec<_>>>()?;
    journals.sort_by(|left, right| right.journal_date.cmp(&left.journal_date));

    let markdown = build_markdown(&journals);
    let path = Path::new(output_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, &markdown)?;

    Ok(ExportMarkdownResultDto {
        file_path: path.display().to_string(),
        markdown,
    })
}

fn resolve_or_build_journal_meta(
    connection: &Connection,
    journal_id: &str,
) -> StorageResult<(String, String)> {
    if let Some(meta) = connection
        .query_row(
            "
            SELECT journal_date, weekday
            FROM journals
            WHERE id = ?1
            ",
            [journal_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
    {
        return Ok(meta);
    }

    let journal_date = NaiveDate::parse_from_str(journal_id, "%Y-%m-%d")
        .map_err(|_| format!("invalid journal id/date: {journal_id}"))?;

    Ok((
        journal_id.to_string(),
        weekday_to_cn(journal_date.weekday()).to_string(),
    ))
}

fn journal_exists(connection: &Connection, journal_id: &str) -> StorageResult<bool> {
    let exists = connection
        .query_row(
            "
            SELECT 1
            FROM journals
            WHERE id = ?1
            LIMIT 1
            ",
            [journal_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some();

    Ok(exists)
}

fn ordered_categories(tasks: &BTreeMap<String, Vec<JournalTaskDto>>) -> Vec<String> {
    let mut ordered = Vec::new();
    for category in JOURNAL_CATEGORIES {
        if tasks.contains_key(category) {
            ordered.push(category.to_string());
        }
    }

    for category in tasks.keys() {
        if !ordered.iter().any(|existing| existing == category) {
            ordered.push(category.clone());
        }
    }

    ordered
}

fn empty_tasks_map() -> BTreeMap<String, Vec<JournalTaskDto>> {
    JOURNAL_CATEGORIES
        .iter()
        .map(|category| (category.to_string(), Vec::new()))
        .collect()
}

fn load_checklist_items_by_journal(
    connection: &Connection,
    journal_id: &str,
) -> StorageResult<HashMap<String, Vec<ChecklistItemDto>>> {
    let mut statement = connection.prepare(
        "
        SELECT
            journal_task_checklist_items.id,
            journal_task_checklist_items.task_id,
            journal_task_checklist_items.text,
            journal_task_checklist_items.is_completed
        FROM journal_task_checklist_items
        INNER JOIN journal_tasks ON journal_tasks.id = journal_task_checklist_items.task_id
        WHERE journal_tasks.journal_id = ?1
        ORDER BY
            journal_task_checklist_items.sort_order ASC,
            journal_task_checklist_items.created_at ASC,
            journal_task_checklist_items.id ASC
        ",
    )?;

    let rows = statement.query_map([journal_id], |row| {
        Ok((
            row.get::<_, String>(1)?,
            ChecklistItemDto {
                id: row.get(0)?,
                text: row.get(2)?,
                is_completed: row.get::<_, i64>(3)? != 0,
            },
        ))
    })?;

    let mut grouped = HashMap::new();
    for row in rows {
        let (task_id, checklist_item) = row?;
        grouped
            .entry(task_id)
            .or_insert_with(Vec::new)
            .push(checklist_item);
    }

    Ok(grouped)
}

fn build_markdown(journals: &[JournalDetailDto]) -> String {
    let mut markdown = String::from("# 工作日志合并导出\n\n");

    for journal in journals {
        markdown.push_str(&format!("## {} {}\n\n", journal.date, journal.weekday));

        for category in JOURNAL_CATEGORIES {
            let Some(tasks) = journal.tasks.get(category) else {
                continue;
            };
            if tasks.is_empty() {
                continue;
            }

            markdown.push_str(&format!("### {category}\n"));
            for task in tasks {
                let content = if task.content.trim().is_empty() {
                    "未填写事项"
                } else {
                    task.content.trim()
                };
                let contact = if task.contact.trim().is_empty() {
                    "-"
                } else {
                    task.contact.trim()
                };
                let deadline = if task.deadline.trim().is_empty() {
                    "-"
                } else {
                    task.deadline.trim()
                };

                markdown.push_str(&format!(
                    "- **[{}]** {} (对接: {}, 截止: {}, 优先级: {})\n",
                    task.progress, content, contact, deadline, task.priority
                ));

                if !task.remark.trim().is_empty() {
                    markdown.push_str(&format!("  > 备注: {}\n", task.remark.trim()));
                }
            }
            markdown.push('\n');
        }

        if !journal.review.trim().is_empty() {
            markdown.push_str("### 今日复盘\n");
            markdown.push_str(journal.review.trim());
            markdown.push_str("\n\n");
        }

        markdown.push_str("---\n\n");
    }

    markdown
}

fn format_display_date(journal_date: &str) -> String {
    NaiveDate::parse_from_str(journal_date, "%Y-%m-%d")
        .map(|date| {
            format!(
                "{:04}年{:02}月{:02}日",
                date.year(),
                date.month(),
                date.day()
            )
        })
        .unwrap_or_else(|_| journal_date.to_string())
}

fn weekday_to_cn(weekday: Weekday) -> &'static str {
    match weekday {
        Weekday::Mon => "星期一",
        Weekday::Tue => "星期二",
        Weekday::Wed => "星期三",
        Weekday::Thu => "星期四",
        Weekday::Fri => "星期五",
        Weekday::Sat => "星期六",
        Weekday::Sun => "星期日",
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use chrono::NaiveDate;
    use rusqlite::params;

    use crate::storage::{
        db, migrations,
        models::{JournalDetailDto, JournalTaskDto, SaveJournalPayload},
    };

    use super::{
        build_markdown, create_or_get_journal_for_date, empty_tasks_map,
        export_journals_markdown_internal, fetch_journal_detail, save_journal_internal,
    };

    #[test]
    fn create_journal_carries_over_from_latest_existing_previous_journal() {
        let db_path = unique_test_db_path();
        let mut connection = db::open_connection(&db_path).expect("open db");
        migrations::initialize_schema(&connection).expect("initialize schema");

        connection
            .execute(
                "
                INSERT INTO journals (id, journal_date, weekday, review)
                VALUES ('2026-03-18', '2026-03-18', '星期三', '')
                ",
                [],
            )
            .expect("insert older journal");
        connection
            .execute(
                "
                INSERT INTO journal_tasks (
                    id, journal_id, category, content, contact, deadline_text, progress, priority, remark, sort_order
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                ",
                params![
                    "task-old",
                    "2026-03-18",
                    "科技项目",
                    "旧任务，不应继承",
                    "王总",
                    "周四",
                    "进行中",
                    "高",
                    "",
                    0_i64
                ],
            )
            .expect("insert older task");

        connection
            .execute(
                "
                INSERT INTO journals (id, journal_date, weekday, review)
                VALUES ('2026-03-20', '2026-03-20', '星期五', '')
                ",
                [],
            )
            .expect("insert latest previous journal");
        connection
            .execute(
                "
                INSERT INTO journal_tasks (
                    id, journal_id, category, content, contact, deadline_text, progress, priority, remark, sort_order
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                ",
                params![
                    "task-1",
                    "2026-03-20",
                    "科技项目",
                    "跟进专家评审意见",
                    "赵总",
                    "下周一",
                    "进行中",
                    "高",
                    "等待补充材料",
                    0_i64
                ],
            )
            .expect("insert incomplete task");
        connection
            .execute(
                "
                INSERT INTO journal_tasks (
                    id, journal_id, category, content, contact, deadline_text, progress, priority, remark, sort_order
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                ",
                params![
                    "task-2",
                    "2026-03-20",
                    "其他事项",
                    "提交周报",
                    "办公室",
                    "今天",
                    "已完成",
                    "中",
                    "",
                    1_i64
                ],
            )
            .expect("insert completed task");

        let detail = create_or_get_journal_for_date(
            &mut connection,
            NaiveDate::from_ymd_opt(2026, 3, 22).expect("valid date"),
        )
        .expect("create target journal");

        assert_eq!(detail.id, "2026-03-22");
        assert_eq!(detail.tasks["科技项目"].len(), 1);
        assert_eq!(detail.tasks["科技项目"][0].content, "跟进专家评审意见");
        assert_eq!(
            detail.tasks["科技项目"][0]
                .carried_over_from_task_id
                .as_deref(),
            Some("task-1")
        );
        assert_eq!(
            detail.tasks["科技项目"][0]
                .carried_over_from_date
                .as_deref(),
            Some("2026-03-20")
        );
        assert!(detail.tasks["其他事项"].is_empty());

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn save_journal_replaces_existing_tasks_and_keeps_category_shape() {
        let db_path = unique_test_db_path();
        let mut connection = db::open_connection(&db_path).expect("open db");
        migrations::initialize_schema(&connection).expect("initialize schema");

        connection
            .execute(
                "
                INSERT INTO journals (id, journal_date, weekday, review)
                VALUES ('2026-03-22', '2026-03-22', '星期日', '')
                ",
                [],
            )
            .expect("insert journal");

        let mut tasks = empty_tasks_map();
        tasks
            .get_mut("安全生产")
            .expect("category exists")
            .push(JournalTaskDto {
                id: String::from("task-a"),
                content: String::from("检查配电柜"),
                contact: String::from("张工"),
                deadline: String::from("18:00"),
                progress: String::from("未开始"),
                priority: String::from("高"),
                remark: String::from("先拍照留档"),
                carried_over_from_task_id: None,
                carried_over_from_date: None,
                checklist_items: vec![],
            });

        let detail = save_journal_internal(
            &mut connection,
            SaveJournalPayload {
                id: String::from("2026-03-22"),
                review: String::from("今天先把高优先级任务排完。"),
                tasks,
            },
        )
        .expect("save journal");

        assert_eq!(detail.review, "今天先把高优先级任务排完。");
        assert_eq!(detail.tasks["安全生产"].len(), 1);
        assert!(detail.tasks["科技项目"].is_empty());

        let reloaded = fetch_journal_detail(&connection, "2026-03-22").expect("reload detail");
        assert_eq!(reloaded.tasks["安全生产"][0].id, "task-a");

        drop(connection);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn export_markdown_writes_file() {
        let db_path = unique_test_db_path();
        let export_path = unique_markdown_path();
        let mut connection = db::open_connection(&db_path).expect("open db");
        migrations::initialize_schema(&connection).expect("initialize schema");

        let mut tasks = empty_tasks_map();
        tasks
            .get_mut("活动对接")
            .expect("category exists")
            .push(JournalTaskDto {
                id: String::from("task-export"),
                content: String::from("确认活动流程"),
                contact: String::from("李老师"),
                deadline: String::from("周三"),
                progress: String::from("进行中"),
                priority: String::from("中"),
                remark: String::from("等主办方回传最终议程"),
                carried_over_from_task_id: None,
                carried_over_from_date: None,
                checklist_items: vec![],
            });

        save_journal_internal(
            &mut connection,
            SaveJournalPayload {
                id: String::from("2026-03-22"),
                review: String::from("推进正常。"),
                tasks,
            },
        )
        .expect("save journal");

        let export_result = export_journals_markdown_internal(
            &connection,
            &[String::from("2026-03-22")],
            export_path.to_str().expect("utf8 path"),
        )
        .expect("export markdown");

        assert!(export_result.markdown.contains("## 2026年03月22日 星期日"));
        assert!(export_result.markdown.contains("### 活动对接"));
        assert!(export_result.markdown.contains("确认活动流程"));
        assert!(export_path.exists());

        let file_content = fs::read_to_string(&export_path).expect("read export file");
        assert_eq!(file_content, export_result.markdown);

        drop(connection);
        let _ = fs::remove_file(db_path);
        let _ = fs::remove_file(export_path);
    }

    #[test]
    fn build_markdown_skips_empty_categories() {
        let mut tasks = empty_tasks_map();
        tasks
            .get_mut("科技项目")
            .expect("category exists")
            .push(JournalTaskDto {
                id: String::from("task-markdown"),
                content: String::from("准备申报书"),
                contact: String::new(),
                deadline: String::new(),
                progress: String::from("未开始"),
                priority: String::from("高"),
                remark: String::new(),
                carried_over_from_task_id: None,
                carried_over_from_date: None,
                checklist_items: vec![],
            });

        let markdown = build_markdown(&[JournalDetailDto {
            id: String::from("2026-03-22"),
            journal_date: String::from("2026-03-22"),
            date: String::from("2026年03月22日"),
            weekday: String::from("星期日"),
            review: String::new(),
            tasks,
        }]);

        assert!(markdown.contains("### 科技项目"));
        assert!(!markdown.contains("### 安全生产"));
    }

    fn unique_test_db_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!("personal-os-journal-{nanos}.sqlite3"))
    }

    fn unique_markdown_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!("personal-os-export-{nanos}.md"))
    }
}
