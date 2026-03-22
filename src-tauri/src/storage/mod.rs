pub mod db;
pub mod migrations;
pub mod models;

pub type StorageResult<T> = Result<T, Box<dyn std::error::Error>>;
