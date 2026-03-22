import { invokeCommand } from "./tauri";

export function listJournals() {
  return invokeCommand("list_journals");
}

export function getJournalDetail(journalId) {
  return invokeCommand("get_journal_detail", { journalId });
}

export function createTodayJournal() {
  return invokeCommand("create_today_journal");
}

export function createJournalForDate(journalDate) {
  return invokeCommand("create_journal_for_date", { journalDate });
}

export function saveJournal(journal) {
  return invokeCommand("save_journal", { journal });
}

export function exportJournalsMarkdown(journalIds, outputPath) {
  return invokeCommand("export_journals_markdown", { journalIds, outputPath });
}
