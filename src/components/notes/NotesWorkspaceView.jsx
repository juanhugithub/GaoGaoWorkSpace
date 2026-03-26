import { useEffect, useMemo, useState } from "react";
import { confirm as confirmDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  BookOpen,
  ExternalLink,
  Folder,
  Import,
  Library,
  Link as LinkIcon,
  MonitorPlay,
  Network,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import MindMapNode from "./MindMapNode";
import {
  createNotebook,
  deleteNotebook,
  deleteNotesBatch,
  getNoteDetail,
  importXmindNote,
  listNotebooks,
  listNotes,
  listen,
  NOTES_SYNC_ERROR_EVENT,
  NOTES_UPDATED_EVENT,
  openNoteInXmind,
  refreshNote,
  renameNotebook,
} from "../../lib/notes";
import {
  showErrorToast,
  showWarningToast,
} from "../../lib/toast";
import { useToast } from "../common/ToastProvider";

function NotesWorkspaceView() {
  const { showToast } = useToast();
  const [notebooks, setNotebooks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activeNotebook, setActiveNotebook] = useState(null);
  const [activeNote, setActiveNote] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState([]);
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(true);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreatingNotebook, setIsCreatingNotebook] = useState(false);
  const [mutatingNotebookId, setMutatingNotebookId] = useState("");
  const [isDeletingNotes, setIsDeletingNotes] = useState(false);

  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return notes;
    }
    return notes.filter((note) => note.title.toLowerCase().includes(query));
  }, [notes, searchQuery]);

  const selectedNoteIdSet = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds]);
  const allFilteredSelected =
    filteredNotes.length > 0 && filteredNotes.every((note) => selectedNoteIdSet.has(note.id));
  const currentNoteData = notes.find((note) => note.id === activeNote) ?? null;

  async function loadNotebookList(preferredNotebookId = null) {
    setIsLoadingNotebooks(true);
    try {
      const items = await listNotebooks();
      setNotebooks(items);
      setActiveNotebook((current) => {
        if (preferredNotebookId && items.some((item) => item.id === preferredNotebookId)) {
          return preferredNotebookId;
        }
        if (current && items.some((item) => item.id === current)) {
          return current;
        }
        return items[0]?.id ?? null;
      });
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "加载笔记本失败",
        error,
      });
    } finally {
      setIsLoadingNotebooks(false);
    }
  }

  async function loadNotebookNotes(notebookId, preferredNoteId = null) {
    if (!notebookId) {
      setNotes([]);
      setActiveNote(null);
      return;
    }

    setIsLoadingNotes(true);
    try {
      const items = await listNotes(notebookId);
      setNotes(items);
      setActiveNote((current) => {
        if (preferredNoteId && items.some((item) => item.id === preferredNoteId)) {
          return preferredNoteId;
        }
        if (current && items.some((item) => item.id === current)) {
          return current;
        }
        return items[0]?.id ?? null;
      });
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "加载笔记列表失败",
        error,
      });
    } finally {
      setIsLoadingNotes(false);
    }
  }

  function mergeNoteDetail(detail) {
    setNotes((current) =>
      current.map((note) =>
        note.id === detail.id
          ? {
              ...note,
              title: detail.title,
              path: detail.path,
              lastSyncLabel: detail.lastSyncLabel,
              lastSyncedAt: detail.lastSyncedAt,
              tree: detail.tree,
            }
          : note,
      ),
    );
  }

  useEffect(() => {
    loadNotebookList();
  }, []);

  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedNoteIds([]);
    loadNotebookNotes(activeNotebook);
  }, [activeNotebook]);

  useEffect(() => {
    setSelectedNoteIds((current) => current.filter((id) => notes.some((note) => note.id === id)));
  }, [notes]);

  useEffect(() => {
    let cancelled = false;

    async function loadNoteDetail() {
      if (!activeNote) {
        return;
      }

      setIsLoadingDetail(true);
      try {
        const detail = await getNoteDetail(activeNote);
        if (!cancelled) {
          mergeNoteDetail(detail);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          showErrorToast(showToast, {
            title: "加载脑图详情失败",
            error,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDetail(false);
        }
      }
    }

    loadNoteDetail();

    return () => {
      cancelled = true;
    };
  }, [activeNote, showToast]);

  useEffect(() => {
    let unlistenUpdated;
    let unlistenError;

    async function setupListeners() {
      unlistenUpdated = await listen(NOTES_UPDATED_EVENT, (event) => {
        const detail = event.payload;
        mergeNoteDetail(detail);
      });

      unlistenError = await listen(NOTES_SYNC_ERROR_EVENT, (event) => {
        const payload = event.payload;
        if (payload?.message) {
          showErrorToast(showToast, {
            title: "脑图同步失败",
            description: payload.message,
          });
        }
      });
    }

    setupListeners();

    return () => {
      if (unlistenUpdated) {
        unlistenUpdated();
      }
      if (unlistenError) {
        unlistenError();
      }
    };
  }, [showToast]);

  async function handleCreateNotebook() {
    const name = window.prompt("请输入新笔记本名称：", "");
    if (!name?.trim()) {
      return;
    }

    setIsCreatingNotebook(true);
    try {
      const notebook = await createNotebook(name.trim());
      await loadNotebookList(notebook.id);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "新建笔记本失败",
        error,
      });
    } finally {
      setIsCreatingNotebook(false);
    }
  }

  async function handleRenameNotebook(notebook) {
    const name = window.prompt("请输入新的笔记本名称：", notebook.name);
    if (!name?.trim() || name.trim() === notebook.name) {
      return;
    }

    setMutatingNotebookId(notebook.id);
    try {
      const updated = await renameNotebook(notebook.id, name.trim());
      await loadNotebookList(updated.id);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "重命名笔记本失败",
        error,
      });
    } finally {
      setMutatingNotebookId("");
    }
  }

  async function handleDeleteNotebook(notebook) {
    if (notebooks.length <= 1) {
      showWarningToast(showToast, {
        title: "无法删除最后一个笔记本",
        description: "请至少保留一个笔记本。",
      });
      return;
    }

    const confirmed = await confirmDialog(
      `确认删除笔记本“${notebook.name}”吗？其下所有脑图笔记会一并删除。`,
      { title: "删除笔记本", kind: "warning" },
    );
    if (!confirmed) {
      return;
    }

    setMutatingNotebookId(notebook.id);
    try {
      await deleteNotebook(notebook.id);
      const fallbackNotebookId = notebooks.find((item) => item.id !== notebook.id)?.id ?? null;
      await loadNotebookList(fallbackNotebookId);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "删除笔记本失败",
        error,
      });
    } finally {
      setMutatingNotebookId("");
    }
  }

  async function handleImportXmind() {
    if (!activeNotebook) {
      return;
    }

    const selected = await openDialog({
      filters: [{ name: "Xmind", extensions: ["xmind"] }],
      multiple: false,
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    setIsImporting(true);
    try {
      const detail = await importXmindNote(activeNotebook, selected);
      await loadNotebookList(activeNotebook);
      await loadNotebookNotes(activeNotebook, detail.id);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "导入 Xmind 失败",
        error,
      });
    } finally {
      setIsImporting(false);
    }
  }

  async function handleDeleteSelectedNotes() {
    if (selectedNoteIds.length === 0) {
      return;
    }

    const confirmed = await confirmDialog(
      `确认删除选中的 ${selectedNoteIds.length} 条脑图笔记吗？此操作不会删除原始 .xmind 文件。`,
      { title: "批量删除笔记", kind: "warning" },
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingNotes(true);
    try {
      await deleteNotesBatch(selectedNoteIds);
      exitSelectionMode();
      await loadNotebookList(activeNotebook);
      await loadNotebookNotes(activeNotebook);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "删除笔记失败",
        error,
      });
    } finally {
      setIsDeletingNotes(false);
    }
  }

  function toggleNoteSelection(noteId) {
    setSelectedNoteIds((current) =>
      current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId],
    );
  }

  function exitSelectionMode() {
    setIsSelectionMode(false);
    setSelectedNoteIds([]);
  }

  function toggleSelectAllFilteredNotes() {
    if (allFilteredSelected) {
      setSelectedNoteIds((current) => current.filter((id) => !filteredNotes.some((note) => note.id === id)));
      return;
    }

    setSelectedNoteIds((current) => {
      const next = new Set(current);
      filteredNotes.forEach((note) => next.add(note.id));
      return Array.from(next);
    });
  }

  async function triggerSync() {
    if (!activeNote) {
      return;
    }

    setIsSyncing(true);
    try {
      const detail = await refreshNote(activeNote);
      mergeNoteDetail(detail);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "手动同步失败",
        error,
      });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleOpenInXmind() {
    if (!activeNote) {
      return;
    }

    try {
      await openNoteInXmind(activeNote);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "打开 Xmind 失败",
        error,
      });
    }
  }

  return (
    <div className="flex-1 flex gap-4 h-full overflow-hidden">
      <div className="w-72 flex-shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-r from-blue-50/50 to-white">
          <Library size={20} className="text-blue-600" />
          <h2 className="text-base font-black text-gray-800">脑图笔记</h2>
        </div>
        <div className="px-4 py-3 border-b border-gray-100 flex flex-col gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索当前笔记..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
          </div>
          <button
            onClick={handleImportXmind}
            disabled={isImporting || !activeNotebook}
            className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Import size={15} /> {isImporting ? "正在导入..." : "导入 Xmind"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col">
          <div className="p-3">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">我的笔记本</span>
              <button
                onClick={handleCreateNotebook}
                disabled={isCreatingNotebook}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-60"
              >
                <Plus size={13} />
                {isCreatingNotebook ? "创建中" : "新建"}
              </button>
            </div>
            {isLoadingNotebooks && <div className="px-2 py-2 text-sm text-gray-400">正在加载笔记本...</div>}
            <div className="flex flex-col gap-0.5">
              {notebooks.map((notebook) => {
                const isActive = activeNotebook === notebook.id;
                const isBusy = mutatingNotebookId === notebook.id;

                return (
                  <div key={notebook.id} className="group relative">
                    <button
                      onClick={() => setActiveNotebook(notebook.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 pr-16 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder
                          size={16}
                          fill={isActive ? "currentColor" : "none"}
                          className={isActive ? "text-blue-500" : "text-gray-400"}
                        />
                        <span className="truncate">{notebook.name}</span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-blue-100/50" : "bg-gray-100"}`}>
                        {notebook.noteCount}
                      </span>
                    </button>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-white/90 rounded-lg px-1">
                      <button
                        onClick={() => handleRenameNotebook(notebook)}
                        disabled={isBusy}
                        className="w-8 h-8 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center disabled:opacity-60"
                      >
                        <PencilLine size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteNotebook(notebook)}
                        disabled={isBusy}
                        className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center disabled:opacity-60"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="w-full h-px bg-gray-100"></div>

          <div className="flex-1 p-3 bg-gray-50/50">
            <div className="flex items-center justify-between px-2 mb-2 gap-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                当前笔记 ({filteredNotes.length})
              </span>
              {isSelectionMode ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSelectAllFilteredNotes}
                    disabled={filteredNotes.length === 0}
                    className="text-[11px] font-bold text-gray-400 hover:text-blue-600 disabled:opacity-50"
                  >
                    {allFilteredSelected ? "取消全选" : "全选"}
                  </button>
                  <button
                    onClick={handleDeleteSelectedNotes}
                    disabled={selectedNoteIds.length === 0 || isDeletingNotes}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                    {isDeletingNotes ? "删除中" : `删除选中${selectedNoteIds.length ? `(${selectedNoteIds.length})` : ""}`}
                  </button>
                  <button
                    onClick={exitSelectionMode}
                    className="text-[11px] font-bold text-gray-400 hover:text-gray-600"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsSelectionMode(true)}
                  disabled={filteredNotes.length === 0}
                  className="text-[11px] font-bold text-gray-400 hover:text-blue-600 disabled:opacity-50"
                >
                  选择
                </button>
              )}
            </div>

            {isLoadingNotes && <div className="px-2 py-2 text-sm text-gray-400">正在加载笔记...</div>}

            <div className="flex flex-col gap-1.5">
              {filteredNotes.map((note) => {
                const isSelected = selectedNoteIdSet.has(note.id);
                const isActive = activeNote === note.id;

                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleNoteSelection(note.id);
                        return;
                      }
                      setActiveNote(note.id);
                    }}
                    className={`group p-3 rounded-xl border cursor-pointer transition-all ${
                      isActive
                        ? "bg-white border-blue-400 shadow-sm shadow-blue-100"
                        : "bg-white border-gray-200 hover:border-blue-200"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {isSelectionMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleNoteSelection(note.id)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      )}
                      <div className="shrink-0 mt-0.5">
                        <Network size={16} className={isActive ? "text-blue-600" : "text-amber-500"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className={`text-sm font-bold truncate mb-1 ${isActive ? "text-blue-700" : "text-gray-800"}`}>
                          {note.title}
                        </h4>
                        <p className="text-[10px] text-gray-400 flex items-center gap-1">
                          <RefreshCw size={10} /> {note.lastSyncLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!isLoadingNotes && filteredNotes.length === 0 && (
                <div className="px-2 py-4 text-sm text-gray-400">当前笔记本还没有脑图。</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {currentNoteData ? (
          <>
            <div className="p-5 border-b border-gray-100 shrink-0 flex items-center justify-between bg-white z-10 shadow-sm">
              <div className="flex flex-col min-w-0 mr-4">
                <h2 className="text-xl font-black text-gray-800 flex items-center gap-2 truncate">
                  {currentNoteData.title}
                </h2>
                <div className="text-xs text-gray-400 mt-1 flex items-center gap-4">
                  <span className="flex items-center gap-1 truncate">
                    <LinkIcon size={12} /> 源文件：{currentNoteData.path}
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600">
                    <MonitorPlay size={12} /> Xmind 保存后自动刷新
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={triggerSync}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-100"
                >
                  <RefreshCw size={14} className={isSyncing ? "animate-spin text-blue-600" : ""} /> 手动同步
                </button>
                <button
                  onClick={handleOpenInXmind}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 active:scale-95 transition-all"
                >
                  <ExternalLink size={16} /> 在 Xmind 中编辑
                </button>
              </div>
            </div>
            <div
              className="flex-1 overflow-auto relative scrollbar-thin bg-gray-50/50"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            >
              {isLoadingDetail || !currentNoteData.tree ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">正在解析脑图...</div>
              ) : (
                <div className="p-16 min-w-max min-h-max">
                  <MindMapNode node={currentNoteData.tree} isRoot={true} />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <BookOpen size={48} className="text-gray-300 mb-4 opacity-50" />
            <p className="text-lg font-bold text-gray-500 mb-2">未选择任何笔记</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default NotesWorkspaceView;
