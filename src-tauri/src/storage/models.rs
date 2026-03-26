use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatusDto {
    pub db_path: String,
    pub schema_version: i64,
    pub tables: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalListItemDto {
    pub id: String,
    pub journal_date: String,
    pub date: String,
    pub weekday: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItemDto {
    pub id: String,
    pub text: String,
    pub is_completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalTaskDto {
    pub id: String,
    pub content: String,
    pub contact: String,
    pub deadline: String,
    pub progress: String,
    pub priority: String,
    pub remark: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub carried_over_from_task_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub carried_over_from_date: Option<String>,
    #[serde(default)]
    pub checklist_items: Vec<ChecklistItemDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalDetailDto {
    pub id: String,
    pub journal_date: String,
    pub date: String,
    pub weekday: String,
    pub review: String,
    pub tasks: BTreeMap<String, Vec<JournalTaskDto>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveJournalPayload {
    pub id: String,
    pub review: String,
    pub tasks: BTreeMap<String, Vec<JournalTaskDto>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMarkdownResultDto {
    pub file_path: String,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VirtualSpaceDto {
    pub id: String,
    pub name: String,
    pub mapped_count: i64,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MappedItemNodeDto {
    pub id: String,
    pub mapped_item_id: Option<String>,
    pub item_type: String,
    pub display_name: String,
    pub real_path: String,
    pub tag: Option<String>,
    pub exists: bool,
    pub is_mapped_root: bool,
    pub expanded: bool,
    pub children: Vec<MappedItemNodeDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryNodeDto {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub children: Vec<DirectoryNodeDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPresetDto {
    pub id: String,
    pub name: String,
    pub tree: Vec<DirectoryNodeDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResultDto {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateDirectoryResultDto {
    pub target_path: String,
    pub created_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsDto {
    pub app_lock_enabled: bool,
    pub has_app_lock_password: bool,
    pub auto_lock_minutes: i64,
    pub auto_start_enabled: bool,
    pub theme_mode: String,
    pub accent_theme: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAppSettingsPayload {
    pub app_lock_enabled: bool,
    pub auto_lock_minutes: i64,
    pub auto_start_enabled: bool,
    pub theme_mode: String,
    pub accent_theme: String,
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardShortcutDto {
    pub action_id: String,
    pub accelerator: String,
    pub default_accelerator: String,
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveKeyboardShortcutPayload {
    pub action_id: String,
    pub accelerator: String,
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookDto {
    pub id: String,
    pub name: String,
    pub note_count: i64,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MindMapNodeDto {
    pub id: String,
    pub name: String,
    pub children: Vec<MindMapNodeDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteListItemDto {
    pub id: String,
    pub notebook_id: String,
    pub title: String,
    pub path: String,
    pub note_type: String,
    pub last_sync_label: String,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDetailDto {
    pub id: String,
    pub notebook_id: String,
    pub title: String,
    pub path: String,
    pub note_type: String,
    pub last_sync_label: String,
    pub last_synced_at: Option<String>,
    pub tree: MindMapNodeDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDto {
    pub id: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    pub year: String,
    pub district: String,
    pub level: String,
    pub category: String,
    pub name: String,
    pub enterprise: String,
    pub progress: String,
    pub upper_amount: f64,
    pub local_amount: f64,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardFilterOptionsDto {
    pub categories: Vec<String>,
    pub progresses: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataSourceDto {
    pub id: String,
    pub file_path: String,
    pub file_name: String,
    pub sheet_name: String,
    pub header_row_number: i64,
    pub cached_project_count: i64,
    pub last_sync_time: Option<String>,
    pub last_sync_label: String,
    pub last_sync_status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataSourceConfigDto {
    pub id: String,
    pub file_path: String,
    pub file_name: String,
    pub sheet_name: String,
    pub header_row_number: i64,
    pub cached_project_count: i64,
    pub last_sync_time: Option<String>,
    pub last_sync_label: String,
    pub last_sync_status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error_message: Option<String>,
    pub mappings: Vec<ColumnMappingDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcelStructureDto {
    pub sheets: Vec<ExcelSheetScanDto>,
    pub selected_sheet: String,
    pub selected_header_row_number: i64,
    pub headers: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcelSheetScanDto {
    pub name: String,
    pub status: String,
    pub note: String,
    pub total_non_empty_rows: usize,
    pub header_row_number: i64,
    pub headers: Vec<String>,
    pub preview_rows: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnMappingDto {
    pub standard_field: String,
    pub excel_column: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataSourceSyncResultDto {
    pub source_id: String,
    pub file_path: String,
    pub sheet_name: String,
    pub header_row_number: i64,
    pub synced_count: usize,
    pub last_sync_time: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MappingPreviewRowDto {
    pub row_number: usize,
    pub year: String,
    pub district: String,
    pub level: String,
    pub category: String,
    pub name: String,
    pub enterprise: String,
    pub progress: String,
    pub upper_amount: f64,
    pub local_amount: f64,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MappingPreviewDto {
    pub total_rows: usize,
    pub preview_rows: Vec<MappingPreviewRowDto>,
}
