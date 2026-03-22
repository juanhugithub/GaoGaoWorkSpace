import { invokeCommand } from "./tauri";

export function listVirtualSpaces() {
  return invokeCommand("list_virtual_spaces");
}

export function createVirtualSpace(name) {
  return invokeCommand("create_virtual_space", { name });
}

export function deleteVirtualSpace(spaceId) {
  return invokeCommand("delete_virtual_space", { spaceId });
}

export function listMappedItemsTree(spaceId) {
  return invokeCommand("list_mapped_items_tree", { spaceId });
}

export function addMappedItems(spaceId, paths) {
  return invokeCommand("add_mapped_items", { spaceId, paths });
}

export function removeMappedItem(mappedItemId) {
  return invokeCommand("remove_mapped_item", { mappedItemId });
}

export function openPathWithSystem(path) {
  return invokeCommand("open_path_with_system", { path });
}

export function revealPathInSystem(path) {
  return invokeCommand("reveal_path_in_system", { path });
}

export function listDirectoryPresets() {
  return invokeCommand("list_directory_presets");
}

export function saveDirectoryPreset(name, tree) {
  return invokeCommand("save_directory_preset", { name, tree });
}

export function deleteDirectoryPreset(presetId) {
  return invokeCommand("delete_directory_preset", { presetId });
}

export function generateDirectoryStructure(targetPath, tree) {
  return invokeCommand("generate_directory_structure", { targetPath, tree });
}
