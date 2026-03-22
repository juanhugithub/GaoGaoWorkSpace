import { useEffect, useMemo, useState } from "react";
import { save as openSaveDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock,
  DownloadCloud,
  MessageSquare,
  Plus,
  Save,
  Square,
  Trash2,
  User,
} from "lucide-react";
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
import ActivityIcon from "../common/ActivityIcon";

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
});

const todayDateValue = () => new Date().toISOString().slice(0, 10);

const ensureTaskShape = (tasks = {}) =>
  JOURNAL_CATEGORIES.reduce(
    (accumulator, category) => ({
      ...accumulator,
      [category]: Array.isArray(tasks[category]) ? tasks[category] : [],
    }),
    {}
  );

const ensureJournalShape = (journal) =>
  journal
    ? {
        ...journal,
        tasks: ensureTaskShape(journal.tasks),
      }
    : null;

function JournalWorkspaceView() {
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
    [journals]
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
          alert(`加载日记列表失败：${String(error)}`);
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
  }, []);

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
          alert(`加载日记详情失败：${String(error)}`);
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
  }, [activeJournalId]);

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
      alert(`开启今日日记模板失败：${String(error)}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateForDate = async () => {
    if (!selectedCreateDate) {
      alert("请先选择要补开的日期。");
      return;
    }

    setIsCreatingForDate(true);
    try {
      await openCreatedJournal(await createJournalForDate(selectedCreateDate));
    } catch (error) {
      console.error(error);
      alert(`开启指定日期日记失败：${String(error)}`);
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
            task.id === taskId ? { ...task, [field]: value } : task
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
      alert("当前进度已保存。");
    } catch (error) {
      console.error(error);
      alert(`保存失败：${String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleExportSelection = (journalId) => {
    setSelectedForExport((current) =>
      current.includes(journalId)
        ? current.filter((item) => item !== journalId)
        : [...current, journalId]
    );
  };

  const handleExportMarkdown = async () => {
    if (selectedForExport.length === 0) {
      alert("请至少选择一天日记进行导出。");
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
      alert(`Markdown 已导出到：\n${result.filePath}`);
      setIsExportMode(false);
      setSelectedForExport([]);
    } catch (error) {
      console.error(error);
      alert(`导出失败：${String(error)}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 flex gap-4 h-full overflow-hidden">
      <div className="w-72 flex-shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-white">
          <div className="flex items-center gap-2">
            <CalendarDays size={20} className="text-blue-600" />
            <h2 className="text-base font-black text-gray-800">我的工作日记</h2>
          </div>
          <button
            onClick={() => {
              setIsExportMode(!isExportMode);
              setSelectedForExport([]);
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              isExportMode ? "bg-blue-100 text-blue-700" : "text-gray-400 hover:text-blue-600 hover:bg-gray-100"
            }`}
            title="批量导出 Markdown"
          >
            <DownloadCloud size={16} />
          </button>
        </div>

        {!isExportMode && (
          <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
            <button
              onClick={handleCreateTodayJournal}
              disabled={isCreating}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-200 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              <Plus size={16} /> {isCreating ? "正在创建..." : "开启今日日记模板"}
            </button>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">补开指定日期</span>
              <input
                type="date"
                value={selectedCreateDate}
                onChange={(event) => setSelectedCreateDate(event.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              <button
                onClick={handleCreateForDate}
                disabled={isCreatingForDate}
                className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <CalendarDays size={15} />
                {isCreatingForDate ? "正在补开..." : "开启该日期日记"}
              </button>
            </div>
          </div>
        )}

        {isExportMode && (
          <div className="p-3 border-b border-blue-100 bg-blue-50 flex flex-col gap-2">
            <div className="text-xs font-bold text-blue-800">请选择要导出的日记：</div>
            <button
              onClick={handleExportMarkdown}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isExporting ? "正在导出..." : `导出选中 (${selectedForExport.length})`}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 flex flex-col gap-1">
          {isLoadingList && <div className="px-3 py-6 text-sm text-gray-400">正在加载日记列表...</div>}

          {!isLoadingList &&
            Object.entries(groupedJournals).map(([month, monthJournals]) => (
              <div key={month} className="mb-2">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-2 py-1.5 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
                  {month}
                </div>
                <div className="flex flex-col gap-1">
                  {monthJournals.map((journal) => (
                    <div key={journal.id} className="flex items-center gap-2">
                      {isExportMode && (
                        <button
                          onClick={() => toggleExportSelection(journal.id)}
                          className="shrink-0 text-gray-400 hover:text-blue-600 transition-colors pl-1"
                        >
                          {selectedForExport.includes(journal.id) ? (
                            <CheckSquare size={16} className="text-blue-600" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => !isExportMode && setActiveJournalId(journal.id)}
                        className={`flex-1 flex flex-col text-left px-3 py-2.5 rounded-xl transition-all border ${
                          activeJournalId === journal.id && !isExportMode
                            ? "bg-blue-50 border-blue-200 shadow-sm shadow-blue-100"
                            : "bg-white border-transparent hover:border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className={`text-sm font-bold mb-0.5 ${
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
            <div className="px-3 py-8 text-sm text-gray-400">还没有任何日记，先开启今日日记模板。</div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-[#FAFAFA] border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {activeJournal ? (
          <>
            <div className="p-6 border-b border-gray-200 bg-white shrink-0 flex items-center justify-between z-10 shadow-sm">
              <div>
                <h2 className="text-3xl font-black text-gray-800 tracking-tight">{activeJournal.date}</h2>
                <p className="text-sm font-medium text-gray-500 mt-1">{activeJournal.weekday} · 结构化工作记录</p>
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving || isLoadingDetail}
                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <Save size={16} /> {isSaving ? "保存中..." : "保存当前进度"}
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 scrollbar-thin flex flex-col gap-8">
              {isLoadingDetail && <div className="text-sm text-gray-400">正在加载日记详情...</div>}

              {JOURNAL_CATEGORIES.map((category) => (
                <div key={category} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                    <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                      <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div>
                      {category}
                    </h3>
                    <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                      {activeJournal.tasks[category]?.length || 0} 项
                    </span>
                  </div>
                  <div className="flex flex-col gap-4">
                    {activeJournal.tasks[category]?.map((task) => (
                      <div
                        key={task.id}
                        className="group flex flex-col gap-2.5 p-3.5 bg-gray-50/50 border border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-sm transition-all relative"
                      >
                        <button
                          onClick={() => removeTask(category, task.id)}
                          className="absolute -right-2 -top-2 w-6 h-6 bg-white border border-gray-200 rounded-full text-gray-400 hover:text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                        >
                          <Trash2 size={12} />
                        </button>

                        <div className="flex items-start gap-2">
                          <CheckCircle2
                            size={18}
                            className={`shrink-0 mt-0.5 ${
                              task.progress === "已完成" ? "text-emerald-500" : "text-gray-300"
                            }`}
                          />
                          <div className="flex-1">
                            <input
                              type="text"
                              placeholder="填写工作事项内容..."
                              value={task.content}
                              onChange={(event) => updateTask(category, task.id, "content", event.target.value)}
                              className={`w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none text-sm px-1 py-0.5 transition-colors ${
                                task.progress === "已完成"
                                  ? "text-gray-400 line-through"
                                  : "text-gray-800 font-bold"
                              }`}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pl-6">
                          <div className="flex items-center gap-1.5 text-xs">
                            <User size={14} className="text-gray-400" />
                            <span className="text-gray-500">对接人:</span>
                            <input
                              type="text"
                              placeholder="联系方式"
                              value={task.contact}
                              onChange={(event) => updateTask(category, task.id, "contact", event.target.value)}
                              className="w-28 bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 focus:outline-none text-gray-700 px-1"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <Clock size={14} className="text-gray-400" />
                            <span className="text-gray-500">截止:</span>
                            <input
                              type="text"
                              placeholder="时间节点"
                              value={task.deadline}
                              onChange={(event) => updateTask(category, task.id, "deadline", event.target.value)}
                              className="w-24 bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 focus:outline-none text-gray-700 px-1"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <ActivityIcon progress={task.progress} />
                            <span className="text-gray-500">进度:</span>
                            <select
                              value={task.progress}
                              onChange={(event) => updateTask(category, task.id, "progress", event.target.value)}
                              className={`appearance-none bg-transparent border-b border-dashed border-gray-300 focus:outline-none cursor-pointer pl-1 pr-4 py-0.5 font-bold ${
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
                                <option key={progress} className="text-gray-900" value={progress}>
                                  {progress}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs ml-auto">
                            <AlertCircle size={14} className="text-gray-400" />
                            <span className="text-gray-500">优先级:</span>
                            <select
                              value={task.priority}
                              onChange={(event) => updateTask(category, task.id, "priority", event.target.value)}
                              className={`appearance-none bg-transparent border-b border-dashed border-gray-300 focus:outline-none cursor-pointer pl-1 pr-4 py-0.5 font-bold ${
                                task.priority === "高"
                                  ? "text-red-600"
                                  : task.priority === "中"
                                    ? "text-amber-500"
                                    : "text-gray-500"
                              }`}
                            >
                              {JOURNAL_PRIORITY_OPTIONS.map((priority) => (
                                <option key={priority} className="text-gray-900" value={priority}>
                                  {priority}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="pl-6 mt-1">
                          <textarea
                            value={task.remark || ""}
                            onChange={(event) => updateTask(category, task.id, "remark", event.target.value)}
                            placeholder="添加详细备注说明、链接或草稿（支持多行）..."
                            className="w-full bg-white/60 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700 focus:outline-none focus:border-blue-400 focus:bg-white transition-all resize-none min-h-[60px]"
                          ></textarea>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => addTask(category)}
                      className="flex items-center gap-1.5 py-2 px-3 text-sm font-medium text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-dashed border-transparent hover:border-blue-200 self-start"
                    >
                      <Plus size={16} /> 添加 {category} 事项
                    </button>
                  </div>
                </div>
              ))}
              <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 shadow-sm mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare size={18} className="text-amber-500" />
                  <h3 className="text-base font-bold text-amber-800">今日复盘与备注</h3>
                </div>
                <textarea
                  value={activeJournal.review}
                  onChange={(event) => updateReview(event.target.value)}
                  placeholder="记录今天的经验教训、卡点分析，或者给明天留下的备忘事项..."
                  className="w-full h-32 bg-white/60 border border-amber-200/50 rounded-xl p-4 text-sm text-gray-800 placeholder-amber-700/30 focus:outline-none focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all resize-none"
                ></textarea>
              </div>
              <div className="h-10"></div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <CalendarDays size={48} className="text-gray-300 mb-4 opacity-50" />
            <p className="text-lg font-bold text-gray-500 mb-2">
              {isLoadingList ? "正在加载日记..." : "未选择任何日记"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default JournalWorkspaceView;
