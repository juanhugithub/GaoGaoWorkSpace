import { invokeCommand } from "./tauri";

export function listProjects() {
  return invokeCommand("list_projects");
}

export function listDataSources() {
  return invokeCommand("list_data_sources");
}

export function listDashboardFilterOptions() {
  return invokeCommand("list_dashboard_filter_options");
}

export function readExcelHeaders(path) {
  return invokeCommand("read_excel_headers", { path });
}

export function readExcelStructure(path, sheetName = null, headerRowNumber = null) {
  return invokeCommand("read_excel_structure", { path, sheetName, headerRowNumber });
}

export function saveMappingAndSync(
  filePath,
  sheetName,
  headerRowNumber,
  mappings,
  sourceId = null,
) {
  return invokeCommand("save_mapping_and_sync", {
    filePath,
    sheetName,
    headerRowNumber,
    mappings,
    sourceId,
  });
}

export function getDataSourceConfig(sourceId) {
  return invokeCommand("get_data_source_config", { sourceId });
}

export function resyncDataSource(sourceId) {
  return invokeCommand("resync_data_source", { sourceId });
}

export function clearDataSourceCache(sourceId) {
  return invokeCommand("clear_data_source_cache", { sourceId });
}

export function deleteDataSource(sourceId) {
  return invokeCommand("delete_data_source", { sourceId });
}

export function previewMappingRows(filePath, sheetName, headerRowNumber, mappings, limit = 5) {
  return invokeCommand("preview_mapping_rows", {
    path: filePath,
    sheetName,
    headerRowNumber,
    mappings,
    limit,
  });
}

export function exportProjectsExcel(projects, outputPath) {
  return invokeCommand("export_projects_excel", { projects, outputPath });
}

export function openProjectSourceFile(projectId) {
  return invokeCommand("open_project_source_file", { projectId });
}
