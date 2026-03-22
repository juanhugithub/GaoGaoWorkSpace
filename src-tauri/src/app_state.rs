use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Instant,
};

use notify::RecommendedWatcher;
use tauri::AppHandle;

use crate::storage::{db, migrations, StorageResult};

pub struct AppState {
    db_path: PathBuf,
    note_watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    dashboard_watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    dashboard_debounce: Arc<Mutex<HashMap<String, Instant>>>,
}

impl AppState {
    pub fn initialize(app_handle: &AppHandle) -> StorageResult<Self> {
        let db_path = db::resolve_database_path(app_handle)?;
        let connection = db::open_connection(&db_path)?;
        migrations::initialize_schema(&connection)?;

        Ok(Self {
            db_path,
            note_watchers: Mutex::new(HashMap::new()),
            dashboard_watchers: Mutex::new(HashMap::new()),
            dashboard_debounce: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub fn note_watchers(&self) -> &Mutex<HashMap<String, RecommendedWatcher>> {
        &self.note_watchers
    }

    pub fn dashboard_watchers(&self) -> &Mutex<HashMap<String, RecommendedWatcher>> {
        &self.dashboard_watchers
    }

    pub fn dashboard_debounce(&self) -> &Arc<Mutex<HashMap<String, Instant>>> {
        &self.dashboard_debounce
    }
}
