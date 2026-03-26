import { useEffect, useMemo, useRef, useState } from "react";
import { save as openSaveDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock,
  DownloadCloud,
  GripVertical,
  ListChecks,
  MessageSquare,
  Plus,
  Save,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";
import { APP_SHORTCUT_EVENT_NAME } from "../../app/settings";
import {
  JOURNAL_CATEGORIES,
  JOURNAL_PRIORITY_OPTIONS,
  JOURNAL_PROGRESS_OPTIONS,
} from "../../app/constants";
import {
  createJournalForDate,
  createTodayJournal,
  exportJournalsMarkdown,
  getJournalDetail,
  listJournals,
  saveJournal,
} from "../../lib/journal";
import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
} from "../../lib/toast";
import ActivityIcon from "../common/ActivityIcon";
import { useToast } from "../common/ToastProvider";

const CHECKLIST_DROP_END = "__checklist-drop-end__";

const defaultTask = () => ({
  id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  content: "",
  contact: "",
  deadline: "",
  progress: "未开始",
  priority: "中",
  remark: "",
  carriedOverFromTaskId: null,
  carriedOverFromDate: null,
  checklistItems: [],
});

const todayDateValue = () => new Date().toISOString().slice(0, 10);

const defaultChecklistItem = () => ({
  id: `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  text: "",
  isCompleted: false,
});

const normalizeChecklistItems = (items = []) =>
  Array.isArray(items)
    ? items.map((item) => ({
        id: item.id || `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: item.text || "",
        isCompleted: Boolean(item.isCompleted),
      }))
    : [];

const normalizeTask = (task) => ({
  ...defaultTask(),
  ...task,
  checklistItems: normalizeChecklistItems(task?.checklistItems),
});

const ensureTaskShape = (tasks = {}) =>
  JOURNAL_CATEGORIES.reduce(
    (accumulator, category) => ({
      ...accumulator,
      [category]: Array.isArray(tasks[category]) ? tasks[category].map(normalizeTask) : [],
    }),
    {},
  );

const ensureJournalShape = (journal) =>
  journal
    ? {
        ...journal,
        tasks: ensureTaskShape(journal.tasks),
      }
    : null;

function reorderChecklistItems(items, draggedId, targetId, position) {
  if (!draggedId || !targetId || draggedId === targetId) {
    return items;
  }

  const sourceIndex = items.findIndex((item) => item.id === draggedId);
  if (sourceIndex === -1) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(sourceIndex, 1);

  if (targetId === CHECKLIST_DROP_END) {
    nextItems.push(movedItem);
    return nextItems;
  }

  let insertIndex = nextItems.findIndex((item) => item.id === targetId);
  if (insertIndex === -1) {
    return items;
  }

  if (position === "after") {
    insertIndex += 1;
  }

  nextItems.splice(insertIndex, 0, movedItem);
  return nextItems;
}

function JournalWorkspaceView() {
  const { showToast } = useToast();
  const [journals, setJournals] = useState([]);
  const [activeJournalId, setActiveJournalId] = useState(null);
  const [activeJournal, setActiveJournal] = useState(null);
  const [selectedCreateDate, setSelectedCreateDate] = useState(todayDateValue());
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingForDate, setIsCreatingForDate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportMode, setIsExportMode] = useState(false);
  const [selectedForExport, setSelectedForExport] = useState([]);
  const [editingChecklist, setEditingChecklist] = useState(null);
  const [draggingChecklistItemId, setDraggingChecklistItemId] = useState("");
  const [dragOverState, setDragOverState] = useState(null);
  const saveCurrentJournalRef = useRef(() => {});
  const createTodayJournalRef = useRef(() => {});

  const groupedJournals = useMemo(
    () =>
      journals.reduce((accumulator, journal) => {
        const month = journal.date.substring(0, 8);
        if (!accumulator[month]) {
          accumulator[month] = [];
        }
        accumulator[month].push(journal);
        return accumulator;
      }, {}),
    [journals],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadJournals() {
      setIsLoadingList(true);
      try {
        const items = await listJournals();
        if (cancelled) {
          return;
        }

        setJournals(items);
        setActiveJournalId((currentId) => {
          if (currentId && items.some((item) => item.id === currentId)) {
            return currentId;
          }
          return items[0]?.id ?? null;
        });
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          showErrorToast(showToast, {
            title: "加载日记列表失败",
            error,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingList(false);
        }
      }
    }

    loadJournals();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;

    async function loadJournalDetail() {
      if (!activeJournalId) {
        setActiveJournal(null);
        return;
      }

      setIsLoadingDetail(true);
      try {
        const detail = await getJournalDetail(activeJournalId);
        if (!cancelled) {
          setActiveJournal(ensureJournalShape(detail));
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          showErrorToast(showToast, {
            title: "加载日记详情失败",
            error,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDetail(false);
        }
      }
    }

    loadJournalDetail();

    return () => {
      cancelled = true;
    };
  }, [activeJournalId, showToast]);

  useEffect(() => {
    setEditingChecklist(null);
    setDraggingChecklistItemId("");
    setDragOverState(null);
  }, [activeJournalId]);

  useEffect(() => {
    const handleShortcut = (event) => {
      const actionId = event.detail?.actionId;
      if (actionId === "save_current_journal") {
        saveCurrentJournalRef.current();
      }
      if (actionId === "create_today_journal") {
        createTodayJournalRef.current();
      }
    };

    window.addEventListener(APP_SHORTCUT_EVENT_NAME, handleShortcut);
    return () => {
      window.removeEventListener(APP_SHORTCUT_EVENT_NAME, handleShortcut);
    };
  }, []);

  const refreshJournalList = async (preferredJournalId = null) => {
    const items = await listJournals();
    setJournals(items);
    setActiveJournalId((currentId) => {
      if (preferredJournalId && items.some((item) => item.id === preferredJournalId)) {
        return preferredJournalId;
      }
      if (currentId && items.some((item) => item.id === currentId)) {
        return currentId;
      }
      return items[0]?.id ?? null;
    });
  };

  const openCreatedJournal = async (detail) => {
    const normalized = ensureJournalShape(detail);
    setActiveJournal(normalized);
    setActiveJournalId(normalized.id);
    setSelectedCreateDate(normalized.journalDate);
    await refreshJournalList(normalized.id);
  };

  const handleCreateTodayJournal = async () => {
    setIsCreating(true);
    try {
      await openCreatedJournal(await createTodayJournal());
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "打开今日日记模板失败",
        error,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateForDate = async () => {
    if (!selectedCreateDate) {
      showWarningToast(showToast, {
        title: "请选择补开日期",
        description: "先选择一个日期，再打开对应的日记模板。",
      });
      return;
    }

    setIsCreatingForDate(true);
    try {
      await openCreatedJournal(await createJournalForDate(selectedCreateDate));
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "打开指定日期日记失败",
        error,
      });
    } finally {
      setIsCreatingForDate(false);
    }
  };

  const updateTask = (category, taskId, field, value) => {
    setActiveJournal((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        tasks: {
          ...current.tasks,
          [category]: current.tasks[category].map((task) =>
            task.id === taskId ? { ...task, [field]: value } : task,
          ),
        },
      };
    });
  };

  const addTask = (category) => {
    setActiveJournal((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        tasks: {
          ...current.tasks,
          [category]: [...current.tasks[category], defaultTask()],
        },
      };
    });
  };

  const removeTask = (category, taskId) => {
    if (editingChecklist?.taskId === taskId) {
      closeChecklistEditor();
    }

    setActiveJournal((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        tasks: {
          ...current.tasks,
          [category]: current.tasks[category].filter((task) => task.id !== taskId),
        },
      };
    });
  };

  const updateReview = (value) => {
    setActiveJournal((current) => (current ? { ...current, review: value } : current));
  };

  const openChecklistEditor = (category, taskId) => {
    setEditingChecklist({ category, taskId });
    setDraggingChecklistItemId("");
    setDragOverState(null);
  };

  const closeChecklistEditor = () => {
    setEditingChecklist(null);
    setDraggingChecklistItemId("");
    setDragOverState(null);
  };

  const updateChecklistItems = (category, taskId, updater) => {
    setActiveJournal((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        tasks: {
          ...current.tasks,
          [category]: current.tasks[category].map((task) =>
            task.id === taskId ? { ...task, checklistItems: updater(task.checklistItems || []) } : task,
          ),
        },
      };
    });
  };

  const addChecklistItem = (category, taskId) => {
    updateChecklistItems(category, taskId, (items) => [...items, defaultChecklistItem()]);
  };

  const updateChecklistItem = (category, taskId, checklistItemId, field, value) => {
    updateChecklistItems(category, taskId, (items) =>
      items.map((item) => (item.id === checklistItemId ? { ...item, [field]: value } : item)),
    );
  };

  const removeChecklistItem = (category, taskId, checklistItemId) => {
    updateChecklistItems(category, taskId, (items) => items.filter((item) => item.id !== checklistItemId));
  };

  const moveChecklistItem = (category, taskId, draggedId, targetId, position = "before") => {
    if (!draggedId || !targetId) {
      return;
    }

    updateChecklistItems(category, taskId, (items) =>
      reorderChecklistItems(items, draggedId, targetId, position),
    );
  };

  const editingTask =
    editingChecklist && activeJournal
      ? activeJournal.tasks[editingChecklist.category]?.find((task) => task.id === editingChecklist.taskId) ?? null
      : null;

  const getChecklistSummary = (task) => {
    const checklistItems = task.checklistItems || [];
    const total = checklistItems.length;
    const completed = checklistItems.filter((item) => item.isCompleted).length;
    return { total, completed };
  };

  const handleSave = async () => {
    if (!activeJournal) {
      return;
    }

    setIsSaving(true);
    try {
      const savedJournal = await saveJournal({
        id: activeJournal.id,
        review: activeJournal.review,
        tasks: activeJournal.tasks,
      });
      setActiveJournal(ensureJournalShape(savedJournal));
      await refreshJournalList(activeJournal.id);
      showSuccessToast(showToast, {
        title: "当前进度已保存",
        description: "日记内容已写入本地数据库。",
      });
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "保存失败",
        error,
      });
    } finally {
      setIsSaving(false);
    }
  };

  saveCurrentJournalRef.current = handleSave;
  createTodayJournalRef.current = handleCreateTodayJournal;

  const toggleExportSelection = (journalId) => {
    setSelectedForExport((current) =>
      current.includes(journalId)
        ? current.filter((item) => item !== journalId)
        : [...current, journalId],
    );
  };

  const handleExportMarkdown = async () => {
    if (selectedForExport.length === 0) {
      showWarningToast(showToast, {
        title: "请选择导出范围",
        description: "至少选择一天日记后，才能导出 Markdown。",
      });
      return;
    }

    const outputPath = await openSaveDialog({
      defaultPath: `工作日志导出-${todayDateValue()}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });

    if (!outputPath) {
      return;
    }

    setIsExporting(true);
    try {
      const result = await exportJournalsMarkdown(selectedForExport, outputPath);
      console.log(result.markdown);
      showSuccessToast(showToast, {
        title: "Markdown 已导出",
        description: `已导出到：${result.filePath}`,
        duration: 4800,
      });
      setIsExportMode(false);
      setSelectedForExport([]);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "导出失败",
        error,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleChecklistDragStart = (event, itemId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
    setDraggingChecklistItemId(itemId);
    setDragOverState(null);
  };

  const handleChecklistDragOver = (event, targetId) => {
    event.preventDefault();
    if (!draggingChecklistItemId || draggingChecklistItemId === targetId) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY >= rect.top + rect.height / 2 ? "after" : "before";
    setDragOverState({ targetId, position });
  };

  const handleChecklistDrop = (event, targetId, position = null) => {
    event.preventDefault();
    if (!editingChecklist || !draggingChecklistItemId) {
      return;
    }

    moveChecklistItem(
      editingChecklist.category,
      editingChecklist.taskId,
      draggingChecklistItemId,
      targetId,
      position || dragOverState?.position || "before",
    );
    setDraggingChecklistItemId("");
    setDragOverState(null);
  };

  const clearChecklistDragState = () => {
    setDraggingChecklistItemId("");
    setDragOverState(null);
  };

  return (
    <div className="flex h-full flex-1 gap-4 overflow-hidden">
      <div className="relative flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-white p-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={20} className="text-blue-600" />
            <h2 className="text-base font-black text-gray-800">我的工作日记</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsExportMode(!isExportMode);
              setSelectedForExport([]);
            }}
            className={`rounded-lg p-1.5 transition-colors ${
              isExportMode ? "bg-blue-100 text-blue-700" : "text-gray-400 hover:bg-gray-100 hover:text-blue-600"
            }`}
            title="批量导出 Markdown"
          >
            <DownloadCloud size={16} />
          </button>
        </div>

        {!isExportMode && (
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4">
            <button
              type="button"
              onClick={handleCreateTodayJournal}
              disabled={isCreating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-200 transition-all hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
            >
              <Plus size={16} />
              {isCreating ? "正在创建..." : "打开今日日记模板"}
            </button>

            <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                补开指定日期
              </span>
              <input
                type="date"
                value={selectedCreateDate}
                onChange={(event) => setSelectedCreateDate(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={handleCreateForDate}
                disabled={isCreatingForDate}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-2 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <CalendarDays size={15} />
                {isCreatingForDate ? "正在补开..." : "打开该日期日记"}
              </button>
            </div>
          </div>
        )}

        {isExportMode && (
          <div className="flex flex-col gap-2 border-b border-blue-100 bg-blue-50 p-3">
            <div className="text-xs font-bold text-blue-800">请选择要导出的日记：</div>
            <button
              type="button"
              onClick={handleExportMarkdown}
              disabled={isExporting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isExporting ? "正在导出..." : `导出选中 (${selectedForExport.length})`}
            </button>
          </div>
        )}

        <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
          {isLoadingList && <div className="px-3 py-6 text-sm text-gray-400">正在加载日记列表...</div>}

          {!isLoadingList &&
            Object.entries(groupedJournals).map(([month, monthJournals]) => (
              <div key={month} className="mb-2">
                <div className="sticky top-0 z-10 bg-white/90 px-2 py-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-400 backdrop-blur-sm">
                  {month}
                </div>
                <div className="flex flex-col gap-1">
                  {monthJournals.map((journal) => (
                    <div key={journal.id} className="flex items-center gap-2">
                      {isExportMode && (
                        <button
                          type="button"
                          onClick={() => toggleExportSelection(journal.id)}
                          className="shrink-0 pl-1 text-gray-400 transition-colors hover:text-blue-600"
                        >
                          {selectedForExport.includes(journal.id) ? (
                            <CheckSquare size={16} className="text-blue-600" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => !isExportMode && setActiveJournalId(journal.id)}
                        className={`flex flex-1 flex-col rounded-xl border px-3 py-2.5 text-left transition-all ${
                          activeJournalId === journal.id && !isExportMode
                            ? "border-blue-200 bg-blue-50 shadow-sm shadow-blue-100"
                            : "border-transparent bg-white hover:border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className={`mb-0.5 text-sm font-bold ${
                            activeJournalId === journal.id && !isExportMode ? "text-blue-700" : "text-gray-800"
                          }`}
                        >
                          {journal.date}
                        </span>
                        <span className="text-xs text-gray-500">{journal.weekday}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {!isLoadingList && journals.length === 0 && (
            <div className="px-3 py-8 text-sm text-gray-400">
              还没有任何日记，先打开今日日记模板。
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#FAFAFA] shadow-sm">
        {activeJournal ? (
          <>
            <div className="z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-3xl font-black tracking-tight text-gray-800">{activeJournal.date}</h2>
                <p className="mt-1 text-sm font-medium text-gray-500">{activeJournal.weekday} · 结构化工作记录</p>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isLoadingDetail}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Save size={16} />
                {isSaving ? "保存中..." : "保存当前进度"}
              </button>
            </div>

            <div className="scrollbar-thin flex flex-1 flex-col gap-8 overflow-auto p-6">
              {isLoadingDetail && <div className="text-sm text-gray-400">正在加载日记详情...</div>}

              {JOURNAL_CATEGORIES.map((category) => (
                <div key={category} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-2">
                    <h3 className="flex items-center gap-2 text-base font-bold text-gray-800">
                      <div className="h-4 w-1.5 rounded-full bg-blue-600"></div>
                      {category}
                    </h3>
                    <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-400">
                      {activeJournal.tasks[category]?.length || 0} 项
                    </span>
                  </div>

                  <div className="flex flex-col gap-4">
                    {activeJournal.tasks[category]?.map((task) => {
                      const checklistSummary = getChecklistSummary(task);

                      return (
                        <div
                          key={task.id}
                          className="group relative flex flex-col gap-2.5 rounded-xl border border-gray-100 bg-gray-50/50 p-3.5 transition-all hover:border-blue-200 hover:shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() => removeTask(category, task.id)}
                            className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 opacity-0 shadow-sm transition-opacity hover:text-red-500 group-hover:opacity-100"
                          >
                            <Trash2 size={12} />
                          </button>

                          <div className="flex items-start gap-2">
                            <CheckCircle2
                              size={18}
                              className={`mt-0.5 shrink-0 ${
                                task.progress === "已完成" ? "text-emerald-500" : "text-gray-300"
                              }`}
                            />
                            <div className="flex-1">
                              <input
                                type="text"
                                placeholder="填写工作事项内容..."
                                value={task.content}
                                onChange={(event) => updateTask(category, task.id, "content", event.target.value)}
                                className={`w-full border-b border-transparent bg-transparent px-1 py-0.5 text-sm transition-colors hover:border-gray-300 focus:border-blue-500 focus:outline-none ${
                                  task.progress === "已完成" ? "text-gray-400 line-through" : "font-bold text-gray-800"
                                }`}
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pl-6">
                            <div className="flex items-center gap-1.5 text-xs">
                              <User size={14} className="text-gray-400" />
                              <span className="text-gray-500">对接人</span>
                              <input
                                type="text"
                                placeholder="联系方式"
                                value={task.contact}
                                onChange={(event) => updateTask(category, task.id, "contact", event.target.value)}
                                className="w-28 border-b border-dashed border-gray-300 bg-transparent px-1 text-gray-700 focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-1.5 text-xs">
                              <Clock size={14} className="text-gray-400" />
                              <span className="text-gray-500">截止</span>
                              <input
                                type="text"
                                placeholder="时间节点"
                                value={task.deadline}
                                onChange={(event) => updateTask(category, task.id, "deadline", event.target.value)}
                                className="w-24 border-b border-dashed border-gray-300 bg-transparent px-1 text-gray-700 focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-1.5 text-xs">
                              <ActivityIcon progress={task.progress} />
                              <span className="text-gray-500">进度</span>
                              <select
                                value={task.progress}
                                onChange={(event) => updateTask(category, task.id, "progress", event.target.value)}
                                className={`cursor-pointer appearance-none border-b border-dashed border-gray-300 bg-transparent py-0.5 pl-1 pr-4 font-bold focus:outline-none ${
                                  task.progress === "未开始"
                                    ? "text-gray-500"
                                    : task.progress === "进行中"
                                      ? "text-blue-600"
                                      : task.progress === "卡点等待"
                                        ? "text-amber-500"
                                        : "text-emerald-600"
                                }`}
                              >
                                {JOURNAL_PROGRESS_OPTIONS.map((progress) => (
                                  <option key={progress} value={progress} className="text-gray-900">
                                    {progress}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <button
                              type="button"
                              onClick={() => openChecklistEditor(category, task.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            >
                              <ListChecks size={14} />
                              清单
                              {checklistSummary.total > 0 && (
                                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                                  {checklistSummary.completed}/{checklistSummary.total}
                                </span>
                              )}
                            </button>

                            <div className="ml-auto flex items-center gap-1.5 text-xs">
                              <AlertCircle size={14} className="text-gray-400" />
                              <span className="text-gray-500">优先级</span>
                              <select
                                value={task.priority}
                                onChange={(event) => updateTask(category, task.id, "priority", event.target.value)}
                                className={`cursor-pointer appearance-none border-b border-dashed border-gray-300 bg-transparent py-0.5 pl-1 pr-4 font-bold focus:outline-none ${
                                  task.priority === "高"
                                    ? "text-red-600"
                                    : task.priority === "中"
                                      ? "text-amber-500"
                                      : "text-gray-500"
                                }`}
                              >
                                {JOURNAL_PRIORITY_OPTIONS.map((priority) => (
                                  <option key={priority} value={priority} className="text-gray-900">
                                    {priority}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="mt-1 pl-6">
                            <textarea
                              value={task.remark || ""}
                              onChange={(event) => updateTask(category, task.id, "remark", event.target.value)}
                              placeholder="添加详细备注说明、链接或草稿（支持多行）..."
                              className="min-h-[60px] w-full resize-none rounded-lg border border-gray-200 bg-white/60 p-2.5 text-xs text-gray-700 transition-all focus:border-blue-400 focus:bg-white focus:outline-none"
                            ></textarea>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => addTask(category)}
                      className="self-start rounded-xl border border-dashed border-transparent px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Plus size={16} />
                        添加 {category} 事项
                      </span>
                    </button>
                  </div>
                </div>
              ))}

              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/50 p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare size={18} className="text-amber-500" />
                  <h3 className="text-base font-bold text-amber-800">今日复盘与备注</h3>
                </div>
                <textarea
                  value={activeJournal.review}
                  onChange={(event) => updateReview(event.target.value)}
                  placeholder="记录今天的经验教训、卡点分析，或者给明天留下的备忘事项..."
                  className="h-32 w-full resize-none rounded-xl border border-amber-200/50 bg-white/60 p-4 text-sm text-gray-800 transition-all focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                ></textarea>
              </div>

              <div className="h-10"></div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
            <CalendarDays size={48} className="mb-4 text-gray-300 opacity-50" />
            <p className="mb-2 text-lg font-bold text-gray-500">
              {isLoadingList ? "正在加载日记..." : "未选择任何日记"}
            </p>
          </div>
        )}
      </div>

      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={closeChecklistEditor}></div>
          <div className="relative z-10 flex h-[min(720px,88vh)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-bold text-blue-700">
                  <ListChecks size={16} />
                  Checklist 过程管理
                </div>
                <h3 className="mt-2 truncate text-xl font-black text-gray-900">
                  {editingTask.content || "未命名事项"}
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Checklist 仅用于过程拆解与推进，不参与 Markdown 导出。
                </p>
              </div>
              <button
                type="button"
                onClick={closeChecklistEditor}
                className="rounded-xl border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="scrollbar-thin flex-1 overflow-auto bg-[#FAFAFA] px-6 py-6">
              <div className="mx-auto flex max-w-2xl flex-col gap-3">
                {(editingTask.checklistItems || []).map((item, index) => {
                  const isDropBefore =
                    draggingChecklistItemId &&
                    dragOverState?.targetId === item.id &&
                    dragOverState.position === "before";
                  const isDropAfter =
                    draggingChecklistItemId &&
                    dragOverState?.targetId === item.id &&
                    dragOverState.position === "after";

                  return (
                    <div key={item.id} className="flex flex-col gap-1">
                      {isDropBefore && <div className="h-1 rounded-full bg-blue-400"></div>}
                      <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                        <button
                          type="button"
                          draggable
                          onDragStart={(event) => handleChecklistDragStart(event, item.id)}
                          onDragEnd={clearChecklistDragState}
                          className="cursor-grab rounded-xl border border-gray-200 bg-white p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 active:cursor-grabbing"
                          title="拖拽排序"
                        >
                          <GripVertical size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateChecklistItem(
                              editingChecklist.category,
                              editingChecklist.taskId,
                              item.id,
                              "isCompleted",
                              !item.isCompleted,
                            )
                          }
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            item.isCompleted
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-gray-300 bg-white text-transparent"
                          }`}
                        >
                          <CheckSquare size={12} />
                        </button>

                        <div className="w-7 shrink-0 text-center text-xs font-semibold text-gray-400">
                          {index + 1}
                        </div>

                        <div
                          className="flex flex-1 items-center"
                          onDragOver={(event) => handleChecklistDragOver(event, item.id)}
                          onDrop={(event) => handleChecklistDrop(event, item.id)}
                        >
                          <input
                            type="text"
                            value={item.text}
                            onChange={(event) =>
                              updateChecklistItem(
                                editingChecklist.category,
                                editingChecklist.taskId,
                                item.id,
                                "text",
                                event.target.value,
                              )
                            }
                            placeholder="输入一个可执行的检查步骤..."
                            className={`w-full border-b border-transparent bg-transparent px-1 py-1 text-sm outline-none transition-colors hover:border-gray-300 focus:border-blue-500 ${
                              item.isCompleted ? "text-gray-400 line-through" : "text-gray-900"
                            }`}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeChecklistItem(editingChecklist.category, editingChecklist.taskId, item.id)
                          }
                          className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {isDropAfter && <div className="h-1 rounded-full bg-blue-400"></div>}
                    </div>
                  );
                })}

                {(editingTask.checklistItems || []).length > 1 && (
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (draggingChecklistItemId) {
                        setDragOverState({ targetId: CHECKLIST_DROP_END, position: "after" });
                      }
                    }}
                    onDrop={(event) => handleChecklistDrop(event, CHECKLIST_DROP_END, "after")}
                    className={`rounded-2xl border border-dashed px-4 py-3 text-center text-sm transition-all ${
                      dragOverState?.targetId === CHECKLIST_DROP_END
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-gray-300 bg-white text-gray-500"
                    }`}
                  >
                    拖到这里可移动到末尾
                  </div>
                )}

                {(editingTask.checklistItems || []).length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
                    当前还没有 checklist 步骤，先新增一条拆解项。
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-gray-100 bg-white px-6 py-4">
              <div className="text-sm text-gray-500">
                共 {(editingTask.checklistItems || []).length} 条步骤，完成{" "}
                {(editingTask.checklistItems || []).filter((item) => item.isCompleted).length} 条。
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => addChecklistItem(editingChecklist.category, editingChecklist.taskId)}
                  className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  新增步骤
                </button>
                <button
                  type="button"
                  onClick={closeChecklistEditor}
                  className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-blue-200 transition-colors hover:bg-blue-700"
                >
                  完成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default JournalWorkspaceView;
