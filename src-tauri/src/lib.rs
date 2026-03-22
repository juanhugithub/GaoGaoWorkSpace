mod app_state;
mod commands;
mod storage;

use app_state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_state = AppState::initialize(app.handle())?;
            commands::dashboard::initialize_dashboard_watchers(app.handle(), &app_state)?;
            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::dashboard::list_projects,
            commands::dashboard::list_data_sources,
            commands::dashboard::list_dashboard_filter_options,
            commands::dashboard::read_excel_headers,
            commands::dashboard::read_excel_structure,
            commands::dashboard::save_mapping_and_sync,
            commands::dashboard::get_data_source_config,
            commands::dashboard::resync_data_source,
            commands::dashboard::clear_data_source_cache,
            commands::dashboard::delete_data_source,
            commands::dashboard::preview_mapping_rows,
            commands::dashboard::export_projects_excel,
            commands::dashboard::open_project_source_file,
            commands::debug::debug_get_storage_status,
            commands::journal::list_journals,
            commands::journal::get_journal_detail,
            commands::journal::create_today_journal,
            commands::journal::create_journal_for_date,
            commands::journal::save_journal,
            commands::journal::export_journals_markdown,
            commands::notes::list_notebooks,
            commands::notes::create_notebook,
            commands::notes::rename_notebook,
            commands::notes::delete_notebook,
            commands::notes::list_notes,
            commands::notes::delete_notes_batch,
            commands::notes::import_xmind_note,
            commands::notes::get_note_detail,
            commands::notes::refresh_note,
            commands::notes::open_note_in_xmind,
            commands::workspace::list_virtual_spaces,
            commands::workspace::create_virtual_space,
            commands::workspace::delete_virtual_space,
            commands::workspace::list_mapped_items_tree,
            commands::workspace::add_mapped_items,
            commands::workspace::remove_mapped_item,
            commands::workspace::open_path_with_system,
            commands::workspace::reveal_path_in_system,
            commands::workspace::list_directory_presets,
            commands::workspace::save_directory_preset,
            commands::workspace::delete_directory_preset,
            commands::workspace::generate_directory_structure
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
