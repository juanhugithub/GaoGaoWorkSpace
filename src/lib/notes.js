import { invokeCommand, listen } from "./tauri";

export const NOTES_UPDATED_EVENT = "notes://xmind-updated";
export const NOTES_SYNC_ERROR_EVENT = "notes://xmind-sync-error";

export function listNotebooks() {
  return invokeCommand("list_notebooks");
}

export function createNotebook(name) {
  return invokeCommand("create_notebook", { name });
}

export function renameNotebook(notebookId, name) {
  return invokeCommand("rename_notebook", { notebookId, name });
}

export function deleteNotebook(notebookId) {
  return invokeCommand("delete_notebook", { notebookId });
}

export function listNotes(notebookId) {
  return invokeCommand("list_notes", { notebookId });
}

export function deleteNotesBatch(noteIds) {
  return invokeCommand("delete_notes_batch", { noteIds });
}

export function importXmindNote(notebookId, path) {
  return invokeCommand("import_xmind_note", { notebookId, path });
}

export function getNoteDetail(noteId) {
  return invokeCommand("get_note_detail", { noteId });
}

export function refreshNote(noteId) {
  return invokeCommand("refresh_note", { noteId });
}

export function openNoteInXmind(noteId) {
  return invokeCommand("open_note_in_xmind", { noteId });
}

export { listen };
