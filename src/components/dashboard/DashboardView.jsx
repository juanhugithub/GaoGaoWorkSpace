import { useEffect, useMemo, useState } from "react";
import {
  confirm as confirmDialog,
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calculator,
  Database,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Link2,
  PencilLine,
  Plus,
  RefreshCw,
  Unplug,
  Upload,
  X,
} from "lucide-react";
import FilterInput from "../common/FilterInput";
import MultiSelectFilter from "../common/MultiSelectFilter";
import { listen } from "../../lib/tauri";
import {
  clearDataSourceCache,
  deleteDataSource,
  exportProjectsExcel,
  getDataSourceConfig,
  listDashboardFilterOptions,
  listDataSources,
  listProjects,
  openProjectSourceFile,
  previewMappingRows,
  readExcelStructure,
  resyncDataSource,
  saveMappingAndSync,
} from "../../lib/dashboard";

const DISTRICT_OPTIONS = [
  "开发区",
  "高新区",
  "花桥开发区",
  "张浦",
  "周市",
  "陆家",
  "巴城",
  "千灯",
  "淀山湖",
  "锦溪",
  "周庄",
];

const LEVEL_OPTIONS = ["国家级", "省级", "苏州市级", "昆山本级"];

const STANDARD_FIELDS = [
  { key: "year", label: "年度", required: false, aliases: ["年度", "年份", "year"] },
  { key: "district", label: "区镇", required: false, aliases: ["区镇", "属地", "区域", "district"] },
  { key: "level", label: "项目级别", required: false, aliases: ["级别", "项目级别", "level"] },
  { key: "category", label: "项目类别", required: false, aliases: ["类别", "项目类别", "category"] },
  { key: "name", label: "项目名称", required: true, aliases: ["项目名称", "名称", "name"] },
  {
    key: "enterprise",
    label: "企业名称",
    required: false,
    aliases: ["企业名称", "企业", "承担企业", "enterprise"],
  },
  {
    key: "upper_amount",
    label: "上级经费",
    required: false,
    aliases: ["上级经费", "上级资金", "上级支持", "支持金额", "金额", "资助金额", "upper amount", "upper fund"],
  },
  {
    key: "local_amount",
    label: "本级经费",
    required: false,
    aliases: ["本级经费", "本级资金", "本级投入", "local amount", "local fund"],
  },
];

function createEmptyMappings() {
  return STANDARD_FIELDS.reduce((result, field) => {
    result[field.key] = "";
    return result;
  }, {});
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

function guessMappings(headers) {
  const headerMap = new Map(headers.map((header) => [normalizeHeader(header), header]));
  return STANDARD_FIELDS.reduce((result, field) => {
    const matchedAlias = field.aliases.find((alias) => headerMap.has(normalizeHeader(alias)));
    result[field.key] = matchedAlias ? headerMap.get(normalizeHeader(matchedAlias)) : "";
    return result;
  }, createEmptyMappings());
}

function reconcileMappingsWithHeaders(currentMappings, headers) {
  const guessedMappings = guessMappings(headers);
  return STANDARD_FIELDS.reduce((result, field) => {
    const currentValue = currentMappings?.[field.key] || "";
    result[field.key] = headers.includes(currentValue) ? currentValue : guessedMappings[field.key] || "";
    return result;
  }, createEmptyMappings());
}

function mappingsArrayToObject(mappingsArray) {
  const base = createEmptyMappings();
  for (const mapping of mappingsArray || []) {
    if (mapping?.standardField) {
      if (mapping.standardField === "amount" && !base.upper_amount) {
        base.upper_amount = mapping.excelColumn || "";
      } else if (Object.prototype.hasOwnProperty.call(base, mapping.standardField)) {
        base[mapping.standardField] = mapping.excelColumn || "";
      }
    }
  }
  return base;
}

function getRecentYears() {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 20 }, (_, index) => String(currentYear - index));
}

function fileNameFromPath(filePath) {
  if (!filePath) return "";
  const segments = filePath.split(/[/\\]/);
  return segments[segments.length - 1] || filePath;
}

function formatSheetLabel(sheetName) {
  return sheetName ? `工作表：${sheetName}` : "工作表：首个可用 sheet";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function getProjectTotalAmount(project) {
  const upperAmount = Number(project?.upperAmount ?? project?.upper_amount ?? 0) || 0;
  const localAmount = Number(project?.localAmount ?? project?.local_amount ?? 0) || 0;
  if (upperAmount !== 0 || localAmount !== 0) {
    return upperAmount + localAmount;
  }
  return Number(project?.amount) || 0;
}

function getSyncStatusMeta(status) {
  switch (status) {
    case "success":
      return { label: "同步成功", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "error":
      return { label: "同步失败", className: "border-red-200 bg-red-50 text-red-700" };
    default:
      return { label: "未同步", className: "border-gray-200 bg-gray-100 text-gray-600" };
  }
}

function getSheetStatusMeta(status) {
  switch (status) {
    case "ready":
      return { label: "可用", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "warning":
      return { label: "需确认", className: "border-amber-200 bg-amber-50 text-amber-700" };
    case "error":
      return { label: "读取失败", className: "border-red-200 bg-red-50 text-red-700" };
    case "empty":
      return { label: "空白", className: "border-gray-200 bg-gray-100 text-gray-600" };
    default:
      return { label: status || "未知", className: "border-gray-200 bg-gray-100 text-gray-600" };
  }
}

function buildMappingPayload(mappings) {
  return STANDARD_FIELDS.map((field) => ({
    standardField: field.key,
    excelColumn: mappings[field.key] || "",
  }));
}

function DashboardView() {
  const [projects, setProjects] = useState([]);
  const [dataSources, setDataSources] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ categories: [], progresses: [] });
  const [keyword, setKeyword] = useState("");
  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedDistricts, setSelectedDistricts] = useState([]);
  const [selectedLevels, setSelectedLevels] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [openingProjectId, setOpeningProjectId] = useState(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configView, setConfigView] = useState("manage");
  const [mappingSourceId, setMappingSourceId] = useState(null);
  const [mappingFilePath, setMappingFilePath] = useState("");
  const [sheetScans, setSheetScans] = useState([]);
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [headerRowNumber, setHeaderRowNumber] = useState(1);
  const [headerRowInput, setHeaderRowInput] = useState("1");
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [mappings, setMappings] = useState(createEmptyMappings());
  const [previewRows, setPreviewRows] = useState([]);
  const [previewTotalRows, setPreviewTotalRows] = useState(0);
  const [previewErrorMessage, setPreviewErrorMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncErrorMessage, setSyncErrorMessage] = useState("");
  const [formErrorMessage, setFormErrorMessage] = useState("");
  const [isReadingHeaders, setIsReadingHeaders] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState("");
  const [syncingSourceId, setSyncingSourceId] = useState("");
  const [clearingSourceId, setClearingSourceId] = useState("");
  const [deletingSourceId, setDeletingSourceId] = useState("");

  const yearOptions = useMemo(() => getRecentYears(), []);
  const selectedSheetScan = useMemo(
    () => sheetScans.find((sheet) => sheet.name === selectedSheetName) || null,
    [selectedSheetName, sheetScans],
  );

  const filteredProjects = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return projects.filter((project) => {
      const keywordMatched =
        !normalizedKeyword ||
        [project.name, project.enterprise, project.category, project.district]
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);

      const yearMatched = selectedYears.length === 0 || selectedYears.includes(project.year);
      const districtMatched =
        selectedDistricts.length === 0 || selectedDistricts.includes(project.district);
      const levelMatched = selectedLevels.length === 0 || selectedLevels.includes(project.level);
      const categoryMatched =
        selectedCategories.length === 0 || selectedCategories.includes(project.category);

      return (
        keywordMatched &&
        yearMatched &&
        districtMatched &&
        levelMatched &&
        categoryMatched
      );
    });
  }, [
    keyword,
    projects,
    selectedYears,
    selectedDistricts,
    selectedLevels,
    selectedCategories,
  ]);

  const stats = useMemo(() => {
    const totalCount = filteredProjects.length;
    const totalAmount = filteredProjects.reduce((sum, item) => sum + getProjectTotalAmount(item), 0);

    return {
      totalCount,
      totalAmount,
    };
  }, [filteredProjects]);

  async function loadDashboardData({ showLoading = true } = {}) {
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const [projectItems, sourceItems, optionItems] = await Promise.all([
        listProjects(),
        listDataSources(),
        listDashboardFilterOptions(),
      ]);
      setProjects(projectItems || []);
      setDataSources(sourceItems || []);
      setFilterOptions(optionItems || { categories: [], progresses: [] });
    } catch (error) {
      console.error(error);
      window.alert(`加载台账数据失败：${String(error)}`);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    let unlistenComplete;
    let unlistenError;

    async function attachListeners() {
      unlistenComplete = await listen("dashboard://sync-complete", async (event) => {
        const payload = event.payload ?? {};
        setSyncErrorMessage("");
        setSyncMessage(
          `已同步 ${fileNameFromPath(payload.filePath)} · ${payload.sheetName || "首个可用 sheet"} · 表头第 ${
            payload.headerRowNumber || 1
          } 行`,
        );
        await loadDashboardData({ showLoading: false });
      });

      unlistenError = await listen("dashboard://sync-error", async (event) => {
        const payload = event.payload ?? {};
        setSyncErrorMessage(payload.message || "同步失败");
        await loadDashboardData({ showLoading: false });
      });
    }

    attachListeners();

    return () => {
      if (typeof unlistenComplete === "function") {
        unlistenComplete();
      }
      if (typeof unlistenError === "function") {
        unlistenError();
      }
    };
  }, []);

  function resetMappingForm() {
    setMappingSourceId(null);
    setMappingFilePath("");
    setSheetScans([]);
    setSelectedSheetName("");
    setHeaderRowNumber(1);
    setHeaderRowInput("1");
    setExcelHeaders([]);
    setMappings(createEmptyMappings());
    setPreviewRows([]);
    setPreviewTotalRows(0);
    setPreviewErrorMessage("");
    setFormErrorMessage("");
  }

  function closeConfigModal() {
    setIsConfigModalOpen(false);
    setConfigView("manage");
    setEditingSourceId("");
    resetMappingForm();
  }

  function openManageModal() {
    setIsConfigModalOpen(true);
    setConfigView("manage");
    setEditingSourceId("");
    resetMappingForm();
  }

  function openCreateSource() {
    setIsConfigModalOpen(true);
    setConfigView("edit");
    setEditingSourceId("");
    resetMappingForm();
  }

  async function loadWorkbookStructure(filePath, sheetName = null, nextHeaderRowNumber = null) {
    setIsReadingHeaders(true);
    setFormErrorMessage("");

    try {
      const structure = await readExcelStructure(filePath, sheetName, nextHeaderRowNumber);
      setMappingFilePath(filePath);
      setSheetScans(structure.sheets || []);
      setSelectedSheetName(structure.selectedSheet || "");
      setHeaderRowNumber(structure.selectedHeaderRowNumber || 1);
      setHeaderRowInput(String(structure.selectedHeaderRowNumber || 1));
      setExcelHeaders(structure.headers || []);
      return structure;
    } catch (error) {
      setFormErrorMessage(String(error));
      throw error;
    } finally {
      setIsReadingHeaders(false);
    }
  }

  async function handlePickExcelFile() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "Excel", extensions: ["xlsx", "xls", "xlsm"] }],
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    try {
      const structure = await loadWorkbookStructure(selected);
      setMappings((current) => {
        const hasValue = Object.values(current).some(Boolean);
        return hasValue
          ? reconcileMappingsWithHeaders(current, structure.headers || [])
          : guessMappings(structure.headers || []);
      });
    } catch (error) {
      console.error(error);
      window.alert(`读取 Excel 失败：${String(error)}`);
    }
  }

  async function handleEditSource(sourceId) {
    setIsConfigModalOpen(true);
    setConfigView("edit");
    setEditingSourceId(sourceId);
    setFormErrorMessage("");

    try {
      const config = await getDataSourceConfig(sourceId);
      const structure = await loadWorkbookStructure(
        config.filePath,
        config.sheetName || null,
        config.headerRowNumber || 1,
      );

      setMappingSourceId(config.id);
      setMappings(
        reconcileMappingsWithHeaders(
          mappingsArrayToObject(config.mappings),
          structure.headers || [],
        ),
      );
    } catch (error) {
      console.error(error);
      setConfigView("manage");
      window.alert(`加载映射配置失败：${String(error)}`);
    } finally {
      setEditingSourceId("");
    }
  }

  async function handleChangeSheet(nextSheetName) {
    if (!mappingFilePath || !nextSheetName) {
      return;
    }

    try {
      const structure = await loadWorkbookStructure(mappingFilePath, nextSheetName, null);
      setMappings((current) => reconcileMappingsWithHeaders(current, structure.headers || []));
      setPreviewRows([]);
      setPreviewTotalRows(0);
      setPreviewErrorMessage("");
    } catch (error) {
      console.error(error);
      window.alert(`切换工作表失败：${String(error)}`);
    }
  }

  async function handleApplyHeaderRow() {
    const parsed = Number.parseInt(headerRowInput, 10);

    if (!mappingFilePath || !selectedSheetName) {
      return;
    }
    if (!Number.isInteger(parsed) || parsed < 1) {
      window.alert("表头行必须是大于等于 1 的整数。");
      return;
    }

    try {
      const structure = await loadWorkbookStructure(mappingFilePath, selectedSheetName, parsed);
      setMappings((current) => reconcileMappingsWithHeaders(current, structure.headers || []));
      setPreviewRows([]);
      setPreviewTotalRows(0);
      setPreviewErrorMessage("");
    } catch (error) {
      console.error(error);
      window.alert(`重新识别表头失败：${String(error)}`);
    }
  }

  async function handlePreviewMapping() {
    if (!mappingFilePath) {
      window.alert("请先选择一个 Excel 文件。");
      return;
    }
    if (!mappings.name) {
      window.alert("项目名称字段是必填映射，请先完成映射。");
      return;
    }

    setIsPreviewing(true);
    setPreviewErrorMessage("");

    try {
      const preview = await previewMappingRows(
        mappingFilePath,
        selectedSheetName || null,
        headerRowNumber,
        buildMappingPayload(mappings),
        5,
      );
      setPreviewRows(preview.previewRows || []);
      setPreviewTotalRows(preview.totalRows || 0);
    } catch (error) {
      console.error(error);
      setPreviewRows([]);
      setPreviewTotalRows(0);
      setPreviewErrorMessage(String(error));
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSaveMapping() {
    if (!mappingFilePath) {
      window.alert("请先选择 Excel 文件。");
      return;
    }
    if (!mappings.name) {
      window.alert("项目名称字段必须完成映射后才能保存。");
      return;
    }

    setIsSavingMapping(true);
    setFormErrorMessage("");

    try {
      const result = await saveMappingAndSync(
        mappingFilePath,
        selectedSheetName || null,
        headerRowNumber,
        buildMappingPayload(mappings),
        mappingSourceId,
      );

      setSyncErrorMessage("");
      setSyncMessage(
        `已同步 ${fileNameFromPath(result.filePath)} · ${result.sheetName} · 共 ${result.syncedCount} 条`,
      );
      await loadDashboardData({ showLoading: false });
      setConfigView("manage");
      resetMappingForm();
    } catch (error) {
      console.error(error);
      setFormErrorMessage(String(error));
      await loadDashboardData({ showLoading: false });
      window.alert(`保存映射失败：${String(error)}`);
    } finally {
      setIsSavingMapping(false);
    }
  }

  async function handleResyncSource(sourceId) {
    setSyncingSourceId(sourceId);
    try {
      const result = await resyncDataSource(sourceId);
      setSyncErrorMessage("");
      setSyncMessage(
        `已重新同步 ${fileNameFromPath(result.filePath)} · ${result.sheetName} · 共 ${result.syncedCount} 条`,
      );
      await loadDashboardData({ showLoading: false });
    } catch (error) {
      console.error(error);
      window.alert(`重新同步失败：${String(error)}`);
    } finally {
      setSyncingSourceId("");
    }
  }

  async function handleClearSourceCache(source) {
    const confirmed = await confirmDialog(
      `确认清空 ${source.fileName} 的缓存数据吗？这不会删除源文件，也不会解除映射。`,
      { title: "清空缓存", kind: "warning" },
    );
    if (!confirmed) {
      return;
    }

    setClearingSourceId(source.id);
    try {
      await clearDataSourceCache(source.id);
      await loadDashboardData({ showLoading: false });
    } catch (error) {
      console.error(error);
      window.alert(`清空缓存失败：${String(error)}`);
    } finally {
      setClearingSourceId("");
    }
  }

  async function handleDeleteSource(source) {
    const confirmed = await confirmDialog(
      `确认解除 ${source.fileName} 的映射关系吗？解除后会一并删除本地缓存数据。`,
      { title: "解除绑定", kind: "warning" },
    );
    if (!confirmed) {
      return;
    }

    setDeletingSourceId(source.id);
    try {
      await deleteDataSource(source.id);
      await loadDashboardData({ showLoading: false });
    } catch (error) {
      console.error(error);
      window.alert(`解除绑定失败：${String(error)}`);
    } finally {
      setDeletingSourceId("");
    }
  }

  async function handleExport() {
    const outputPath = await saveDialog({
      defaultPath: `项目台账导出-${new Date().toISOString().slice(0, 10)}.xlsx`,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });

    if (!outputPath) {
      return;
    }

    setIsExporting(true);
    try {
      await exportProjectsExcel(filteredProjects, outputPath);
    } catch (error) {
      console.error(error);
      window.alert(`导出失败：${String(error)}`);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleOpenProjectSource(projectId) {
    setOpeningProjectId(projectId);
    try {
      await openProjectSourceFile(projectId);
    } catch (error) {
      console.error(error);
      window.alert(`打开源文件失败：${String(error)}`);
    } finally {
      setOpeningProjectId(null);
    }
  }

  return (
    <>
      <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-gray-800">数据看台</h2>
              <p className="text-sm text-gray-500 mt-1.5 flex items-center gap-1.5">
                <Link2 size={14} className="text-gray-400" />
                共享盘 Excel 作为唯一事实来源，本地 SQLite 仅作为只读高速缓存。
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={openManageModal}
                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
              >
                <Database size={16} />
                配置数据源
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting || filteredProjects.length === 0}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-sm shadow-blue-200 disabled:opacity-60 inline-flex items-center gap-2"
              >
                <Upload size={16} className={isExporting ? "animate-spin" : ""} />
                {isExporting ? "导出中..." : "导出当前结果"}
              </button>
            </div>
          </div>

          {(syncMessage || syncErrorMessage) && (
            <div className="mt-4 space-y-2">
              {syncMessage && (
                <div className="px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">
                  {syncMessage}
                </div>
              )}
              {syncErrorMessage && (
                <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{syncErrorMessage}</span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-2.5 mt-5 items-end">
            <div className="lg:col-span-4">
              <FilterInput
                label="搜索"
                placeholder="搜索项目名称、企业名称、类别或区镇"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
            <div className="lg:col-span-2">
              <MultiSelectFilter label="年度" options={yearOptions} selected={selectedYears} onChange={setSelectedYears} />
            </div>
            <div className="lg:col-span-2">
              <MultiSelectFilter
              label="区镇"
              options={DISTRICT_OPTIONS}
              selected={selectedDistricts}
              onChange={setSelectedDistricts}
            />
            </div>
            <div className="lg:col-span-2">
              <MultiSelectFilter
              label="项目级别"
              options={LEVEL_OPTIONS}
              selected={selectedLevels}
              onChange={setSelectedLevels}
            />
            </div>
            <div className="lg:col-span-2">
              <MultiSelectFilter
              label="项目类别"
              options={filterOptions.categories || []}
              selected={selectedCategories}
              onChange={setSelectedCategories}
            />
            </div>
          </div>
        </div>

        <div className="px-6 pt-3 shrink-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="relative bg-[#F6F8FB] border border-gray-200 rounded-2xl px-5 py-3 min-h-[84px] flex items-center justify-center text-center">
              <div className="absolute top-3 right-4 w-9 h-9 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <BarChart3 size={20} />
              </div>
              <div>
                <p className="text-sm text-gray-500">项目数</p>
                <p className="text-[1.75rem] leading-none font-black text-gray-900 mt-2">{stats.totalCount}</p>
              </div>
            </div>

            <div className="relative bg-[#F6F8FB] border border-gray-200 rounded-2xl px-5 py-3 min-h-[84px] flex items-center justify-center text-center">
              <div className="absolute top-3 right-4 w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Calculator size={20} />
              </div>
              <div>
                <p className="text-sm text-gray-500">总金额</p>
                <p className="text-[1.75rem] leading-none font-black text-gray-900 mt-2">
                  {formatCurrency(stats.totalAmount)}
                </p>
                <p className="text-xs text-gray-400 mt-1.5">单位：万元</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-6 pt-4">
          <div className="h-full border border-gray-200 rounded-2xl overflow-hidden bg-white">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-gray-800">项目缓存表</h3>
                <p className="text-xs text-gray-500 mt-1">
                  当前显示 {filteredProjects.length} 条，已配置 {dataSources.length} 个数据源
                </p>
              </div>
              <div className="text-xs text-gray-400">只读展示，修改请回到共享盘源文件</div>
            </div>

            {isLoading ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">
                正在加载项目数据...
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <FileSpreadsheet size={48} className="text-gray-300 mb-4" />
                <h4 className="text-lg font-bold text-gray-700">暂无可展示数据</h4>
                <p className="text-sm text-gray-500 mt-2 max-w-xl">
                  {dataSources.length === 0
                    ? "请先配置一个或多个 Excel 数据源映射。系统会把共享盘源文件解析后缓存到本地数据库中。"
                    : "当前筛选条件下没有匹配结果。你可以调整筛选条件，或者重新同步数据源。"}
                </p>
                <button
                  onClick={openManageModal}
                  className="mt-5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-sm shadow-blue-200 inline-flex items-center gap-2"
                >
                  <Database size={16} />
                  配置数据源
                </button>
              </div>
            ) : (
              <div className="h-full overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#F8F9FB] sticky top-0 z-10">
                    <tr className="text-left text-gray-500">
                      <th className="px-4 py-3 font-semibold">年度</th>
                      <th className="px-4 py-3 font-semibold">区镇</th>
                      <th className="px-4 py-3 font-semibold">项目级别</th>
                      <th className="px-4 py-3 font-semibold">项目类别</th>
                      <th className="px-4 py-3 font-semibold min-w-[220px]">项目名称</th>
                      <th className="px-4 py-3 font-semibold min-w-[180px]">企业名称</th>
                      <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">上级经费</th>
                      <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">本级经费</th>
                      <th className="px-4 py-3 font-semibold min-w-[240px]">来源文件</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((project) => (
                      <tr key={project.id} className="border-t border-gray-100 hover:bg-gray-50/80">
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{project.year || "-"}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{project.district || "-"}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{project.level || "-"}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{project.category || "-"}</td>
                        <td className="px-4 py-3 text-gray-900 font-medium">{project.name}</td>
                        <td className="px-4 py-3 text-gray-700">{project.enterprise || "-"}</td>
                        <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">
                          {formatCurrency(project.upperAmount)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">
                          {formatCurrency(project.localAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="min-w-[240px]">
                            <div className="text-gray-900 font-medium truncate">
                              {fileNameFromPath(project.sourcePath) || "未绑定源文件"}
                            </div>
                            <div className="text-xs text-gray-500 truncate mt-1">
                              {project.sourcePath || "该记录当前未关联到外部源文件"}
                            </div>
                            <button
                              onClick={() => handleOpenProjectSource(project.id)}
                              disabled={!project.sourceId || openingProjectId === project.id}
                              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                            >
                              <ExternalLink size={14} />
                              {openingProjectId === project.id ? "正在打开..." : "打开源文件"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={closeConfigModal}></div>
          <div className="relative w-full max-w-6xl h-[88vh] bg-white rounded-[28px] shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xl font-black text-gray-900">
                  {configView === "manage" ? "配置数据源映射" : mappingSourceId ? "修改数据源映射" : "新增数据源映射"}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {configView === "manage"
                    ? "集中管理新增、修改、重同步、清空缓存和解除绑定。"
                    : "逐个确认工作表、标题行和字段映射，再将 Excel 解析结果同步到本地缓存。"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {configView === "edit" && (
                  <button
                    onClick={() => {
                      setConfigView("manage");
                      resetMappingForm();
                    }}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
                  >
                    <ArrowLeft size={16} />
                    返回列表
                  </button>
                )}
                <button
                  onClick={closeConfigModal}
                  className="w-10 h-10 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {configView === "manage" ? (
              <div className="flex-1 min-h-0 overflow-auto p-6 bg-[#F7F8FA]">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <div className="text-sm text-gray-500">
                    已绑定 <span className="font-bold text-gray-900">{dataSources.length}</span> 个数据源
                  </div>
                  <button
                    onClick={openCreateSource}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-sm shadow-blue-200 inline-flex items-center gap-2"
                  >
                    <Plus size={16} />
                    新增数据源映射
                  </button>
                </div>

                {dataSources.length === 0 ? (
                  <div className="bg-white border border-dashed border-gray-300 rounded-2xl h-[320px] flex flex-col items-center justify-center text-center px-6">
                    <Database size={48} className="text-gray-300 mb-4" />
                    <h4 className="text-lg font-bold text-gray-700">还没有绑定任何数据源</h4>
                    <p className="text-sm text-gray-500 mt-2 max-w-xl">
                      支持多个共享盘 Excel 分散映射。每个数据源都可以独立配置 sheet、表头行和字段映射规则。
                    </p>
                    <button
                      onClick={openCreateSource}
                      className="mt-5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-sm shadow-blue-200 inline-flex items-center gap-2"
                    >
                      <Plus size={16} />
                      立即新增
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dataSources.map((source) => {
                      const statusMeta = getSyncStatusMeta(source.lastSyncStatus);
                      const busy =
                        editingSourceId === source.id ||
                        syncingSourceId === source.id ||
                        clearingSourceId === source.id ||
                        deletingSourceId === source.id;

                      return (
                        <div
                          key={source.id}
                          className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-base font-bold text-gray-900">{source.fileName}</h4>
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusMeta.className}`}
                                >
                                  {statusMeta.label}
                                </span>
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border border-gray-200 bg-gray-50 text-gray-600">
                                  {source.cachedProjectCount} 条缓存
                                </span>
                              </div>
                              <div className="text-sm text-gray-500 mt-2 break-all">{source.filePath}</div>
                              <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500 mt-3">
                                <span>{formatSheetLabel(source.sheetName)}</span>
                                <span>表头第 {source.headerRowNumber} 行</span>
                                <span>{source.lastSyncLabel}</span>
                              </div>
                              {source.lastErrorMessage && (
                                <div className="mt-3 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
                                  {source.lastErrorMessage}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                              <button
                                onClick={() => handleEditSource(source.id)}
                                disabled={busy}
                                className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60 inline-flex items-center gap-2"
                              >
                                <PencilLine size={15} />
                                编辑映射
                              </button>
                              <button
                                onClick={() => handleResyncSource(source.id)}
                                disabled={busy}
                                className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60 inline-flex items-center gap-2"
                              >
                                <RefreshCw
                                  size={15}
                                  className={syncingSourceId === source.id ? "animate-spin" : ""}
                                />
                                重新同步
                              </button>
                              <button
                                onClick={() => handleClearSourceCache(source)}
                                disabled={busy}
                                className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                              >
                                清空缓存
                              </button>
                              <button
                                onClick={() => handleDeleteSource(source)}
                                disabled={busy}
                                className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-60 inline-flex items-center gap-2"
                              >
                                <Unplug size={15} />
                                解除绑定
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto p-6 bg-[#F7F8FA]">
                <div className="space-y-5">
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-800">1. 选择 Excel 源文件</div>
                        <div className="text-sm text-gray-500 mt-1">
                          可以是本地文件，也可以是共享盘上的 Excel。
                        </div>
                        <div className="mt-3 text-sm text-gray-700 break-all">
                          {mappingFilePath || "尚未选择文件"}
                        </div>
                      </div>
                      <button
                        onClick={handlePickExcelFile}
                        disabled={isReadingHeaders}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-sm shadow-blue-200 disabled:opacity-60 inline-flex items-center gap-2"
                      >
                        <FileSpreadsheet size={16} />
                        {mappingFilePath ? "更换文件" : "选择 Excel"}
                      </button>
                    </div>
                  </div>

                  {mappingFilePath && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                        <div>
                          <div className="text-sm font-bold text-gray-800">2. 逐个确认工作表</div>
                          <div className="text-sm text-gray-500 mt-1">
                            系统会扫描所有 sheet，并给出推荐的表头行。请确认真正承载台账数据的工作表。
                          </div>
                        </div>
                        {isReadingHeaders && (
                          <div className="text-sm text-blue-600 inline-flex items-center gap-2">
                            <RefreshCw size={14} className="animate-spin" />
                            正在扫描工作簿...
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {sheetScans.map((sheet) => {
                          const meta = getSheetStatusMeta(sheet.status);
                          const isSelected = selectedSheetName === sheet.name;

                          return (
                            <button
                              key={sheet.name}
                              type="button"
                              onClick={() => handleChangeSheet(sheet.name)}
                              className={`text-left border rounded-2xl p-4 transition-all ${
                                isSelected
                                  ? "border-blue-300 bg-blue-50 shadow-sm"
                                  : "border-gray-200 bg-white hover:border-gray-300"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-base font-bold text-gray-900 truncate">
                                    {sheet.name}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    非空行 {sheet.totalNonEmptyRows} · 推荐表头第 {sheet.headerRowNumber} 行
                                  </div>
                                </div>
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.className}`}
                                >
                                  {meta.label}
                                </span>
                              </div>

                              <div className="text-sm text-gray-600 mt-3 line-clamp-2">{sheet.note}</div>

                              {sheet.headers?.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {sheet.headers.slice(0, 6).map((header) => (
                                    <span
                                      key={`${sheet.name}-${header}`}
                                      className="px-2.5 py-1 rounded-full bg-gray-100 text-xs text-gray-600"
                                    >
                                      {header}
                                    </span>
                                  ))}
                                  {sheet.headers.length > 6 && (
                                    <span className="px-2.5 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                                      +{sheet.headers.length - 6}
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {mappingFilePath && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                      <div className="text-sm font-bold text-gray-800">3. 确认表头行</div>
                      <div className="text-sm text-gray-500 mt-1">
                        如果 Excel 前面存在大标题、说明行或空行，请手动指定真正的表头行，再重新识别字段。
                      </div>

                      <div className="mt-4 flex items-center gap-3 flex-wrap">
                        <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700">
                          当前工作表：{selectedSheetName || "未选择"}
                        </div>
                        <input
                          type="number"
                          min="1"
                          value={headerRowInput}
                          onChange={(event) => setHeaderRowInput(event.target.value)}
                          className="w-32 bg-white border border-gray-300 text-sm text-gray-900 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        <button
                          onClick={handleApplyHeaderRow}
                          disabled={isReadingHeaders || !mappingFilePath}
                          className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          重新识别表头
                        </button>
                        <div className="text-xs text-gray-500">当前已识别为第 {headerRowNumber} 行</div>
                      </div>

                      {selectedSheetScan?.previewRows?.length > 0 && (
                        <div className="mt-4 overflow-auto border border-gray-200 rounded-2xl">
                          <table className="min-w-full text-sm">
                            <thead className="bg-[#F8F9FB]">
                              <tr className="text-left text-gray-500">
                                {excelHeaders.map((header, index) => (
                                  <th key={`${header}-${index}`} className="px-3 py-2 font-semibold whitespace-nowrap">
                                    {header || `列 ${index + 1}`}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedSheetScan.previewRows.slice(0, 3).map((row, rowIndex) => (
                                <tr key={`sample-${rowIndex}`} className="border-t border-gray-100">
                                  {excelHeaders.map((_, columnIndex) => (
                                    <td key={`sample-${rowIndex}-${columnIndex}`} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                      {row[columnIndex] || "-"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {mappingFilePath && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                      <div className="text-sm font-bold text-gray-800">4. 配置字段映射</div>
                      <div className="text-sm text-gray-500 mt-1">
                        标准字段固定，右侧下拉选择 Excel 真实表头。项目名称为必填字段。
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        {STANDARD_FIELDS.map((field) => (
                          <label key={field.key} className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              {field.label}
                              {field.required ? " *" : ""}
                            </span>
                            <select
                              value={mappings[field.key] || ""}
                              onChange={(event) =>
                                setMappings((current) => ({
                                  ...current,
                                  [field.key]: event.target.value,
                                }))
                              }
                              className="bg-white border border-gray-300 text-sm text-gray-900 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            >
                              <option value="">不映射</option>
                              {excelHeaders.map((header) => (
                                <option key={`${field.key}-${header}`} value={header}>
                                  {header}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {mappingFilePath && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <div className="text-sm font-bold text-gray-800">5. 预览清洗结果</div>
                          <div className="text-sm text-gray-500 mt-1">
                            保存前先抽样预览。区镇归一化、级别推断、金额清洗都会在这里体现。
                          </div>
                        </div>
                        <button
                          onClick={handlePreviewMapping}
                          disabled={isPreviewing || !mappingFilePath}
                          className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60 inline-flex items-center gap-2"
                        >
                          <Eye size={16} />
                          {isPreviewing ? "预览中..." : "生成预览"}
                        </button>
                      </div>

                      {previewErrorMessage && (
                        <div className="mt-4 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
                          {previewErrorMessage}
                        </div>
                      )}

                      {previewRows.length > 0 && (
                        <>
                          <div className="mt-4 text-xs text-gray-500">
                            共识别 {previewTotalRows} 条数据，以下展示前 {previewRows.length} 条。
                          </div>
                          <div className="mt-3 overflow-auto border border-gray-200 rounded-2xl">
                            <table className="min-w-full text-sm">
                              <thead className="bg-[#F8F9FB]">
                                <tr className="text-left text-gray-500">
                                  <th className="px-3 py-2 font-semibold">行号</th>
                                  <th className="px-3 py-2 font-semibold">年度</th>
                                  <th className="px-3 py-2 font-semibold">区镇</th>
                                  <th className="px-3 py-2 font-semibold">项目级别</th>
                                  <th className="px-3 py-2 font-semibold">项目类别</th>
                                  <th className="px-3 py-2 font-semibold">项目名称</th>
                                  <th className="px-3 py-2 font-semibold">企业名称</th>
                                  <th className="px-3 py-2 font-semibold text-right">上级经费</th>
                                  <th className="px-3 py-2 font-semibold text-right">本级经费</th>
                                </tr>
                              </thead>
                              <tbody>
                                {previewRows.map((row) => (
                                  <tr key={`preview-${row.rowNumber}`} className="border-t border-gray-100">
                                    <td className="px-3 py-2 text-gray-700">{row.rowNumber}</td>
                                    <td className="px-3 py-2 text-gray-700">{row.year || "-"}</td>
                                    <td className="px-3 py-2 text-gray-700">{row.district || "-"}</td>
                                    <td className="px-3 py-2 text-gray-700">{row.level || "-"}</td>
                                    <td className="px-3 py-2 text-gray-700">{row.category || "-"}</td>
                                    <td className="px-3 py-2 text-gray-900 font-medium">{row.name || "-"}</td>
                                    <td className="px-3 py-2 text-gray-700">{row.enterprise || "-"}</td>
                                    <td className="px-3 py-2 text-right text-gray-900">
                                      {formatCurrency(row.upperAmount)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-900">
                                      {formatCurrency(row.localAmount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {formErrorMessage && (
                    <div className="px-4 py-3 rounded-2xl border border-red-200 bg-red-50 text-sm text-red-700">
                      {formErrorMessage}
                    </div>
                  )}
                </div>
              </div>
            )}

            {configView === "edit" && (
              <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between gap-4 bg-white">
                <div className="text-sm text-gray-500">
                  当前文件：
                  <span className="text-gray-800 font-medium ml-1">
                    {fileNameFromPath(mappingFilePath) || "未选择"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setConfigView("manage");
                      resetMappingForm();
                    }}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveMapping}
                    disabled={isSavingMapping || !mappingFilePath}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-sm shadow-blue-200 disabled:opacity-60 inline-flex items-center gap-2"
                  >
                    <RefreshCw size={16} className={isSavingMapping ? "animate-spin" : ""} />
                    {isSavingMapping ? "保存并同步中..." : "保存映射并立即同步"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default DashboardView;
