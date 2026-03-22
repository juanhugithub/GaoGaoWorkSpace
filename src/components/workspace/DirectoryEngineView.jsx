import { useEffect, useState } from "react";
import { confirm as confirmDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { ChevronDown, CornerDownRight, Folder, FolderPlus, Network, Play, Plus, Save, Trash2 } from "lucide-react";
import {
  deleteDirectoryPreset,
  generateDirectoryStructure,
  listDirectoryPresets,
  saveDirectoryPreset,
} from "../../lib/workspace";

function DirectoryEngineView() {
  const [treeData, setTreeData] = useState([{ id: "root-1", name: "新建文件夹集", children: [] }]);
  const [targetPath, setTargetPath] = useState("");
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [isLoadingPresets, setIsLoadingPresets] = useState(true);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isDeletingPreset, setIsDeletingPreset] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPresets() {
      setIsLoadingPresets(true);
      try {
        const items = await listDirectoryPresets();
        if (!cancelled) {
          setPresets(items);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          alert(`加载目录预设失败：${String(error)}`);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPresets(false);
        }
      }
    }

    loadPresets();

    return () => {
      cancelled = true;
    };
  }, []);

  const addChildNode = (parentId) => {
    const newNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: "新建文件夹",
      children: [],
    };

    if (!parentId) {
      setTreeData((current) => [...current, newNode]);
      return;
    }

    const updateTree = (nodes) =>
      nodes.map((node) => {
        if (node.id === parentId) {
          return { ...node, children: [...node.children, newNode] };
        }
        if (node.children?.length) {
          return { ...node, children: updateTree(node.children) };
        }
        return node;
      });

    setTreeData((current) => updateTree(current));
  };

  const updateNodeName = (id, newName, nodes = treeData) =>
    nodes.map((node) => {
      if (node.id === id) {
        return { ...node, name: newName };
      }
      if (node.children?.length) {
        return { ...node, children: updateNodeName(id, newName, node.children) };
      }
      return node;
    });

  const deleteNode = (id, nodes = treeData) =>
    nodes
      .filter((node) => node.id !== id)
      .map((node) => ({
        ...node,
        children: node.children?.length ? deleteNode(id, node.children) : [],
      }));

  const handleSavePreset = async () => {
    if (treeData.length === 0) {
      alert("当前画布为空，无法保存为预设。");
      return;
    }

    const presetName = window.prompt("请输入新结构预设的名称：", "新建结构模板");
    if (!presetName?.trim()) {
      return;
    }

    setIsSavingPreset(true);
    try {
      const preset = await saveDirectoryPreset(presetName.trim(), treeData);
      setPresets((current) => [...current, preset]);
      setSelectedPresetId(preset.id);
      alert("目录预设已保存。");
    } catch (error) {
      console.error(error);
      alert(`保存预设失败：${String(error)}`);
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleDeletePreset = async () => {
    if (!selectedPresetId) {
      return;
    }

    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) {
      return;
    }

    const confirmed = await confirmDialog(`确认删除预设“${preset.name}”吗？`, {
      title: "删除预设",
      kind: "warning",
      okLabel: "删除",
      cancelLabel: "取消",
    });

    if (!confirmed) {
      return;
    }

    setIsDeletingPreset(true);
    try {
      await deleteDirectoryPreset(selectedPresetId);
      setPresets((current) => current.filter((item) => item.id !== selectedPresetId));
      setSelectedPresetId("");
      alert("目录预设已删除。");
    } catch (error) {
      console.error(error);
      alert(`删除预设失败：${String(error)}`);
    } finally {
      setIsDeletingPreset(false);
    }
  };

  const handleBrowseTarget = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: targetPath || undefined,
    });

    if (typeof selected === "string") {
      setTargetPath(selected);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await generateDirectoryStructure(targetPath, treeData);
      alert(`目录生成完成。\n目标路径：${result.targetPath}\n创建目录数：${result.createdCount}`);
    } catch (error) {
      console.error(error);
      alert(`目录生成失败：${String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const renderNode = (node, depth = 0) => (
    <div key={node.id} className="relative group">
      {depth > 0 && <div className="absolute left-[-20px] top-[18px] w-[16px] h-px bg-gray-300"></div>}
      {depth > 0 && <div className="absolute left-[-20px] top-[-100%] bottom-[18px] w-px bg-gray-300"></div>}
      <div className="flex items-center gap-2 py-1.5">
        <Folder size={18} className="text-blue-500 shrink-0" fill="currentColor" />
        <input
          type="text"
          value={node.name}
          onChange={(event) => setTreeData(updateNodeName(node.id, event.target.value))}
          className="bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:shadow-sm rounded px-2 py-1 text-sm font-medium text-gray-800 outline-none transition-all w-64"
        />
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
          <button
            onClick={() => addChildNode(node.id)}
            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="添加子文件夹"
          >
            <CornerDownRight size={16} />
          </button>
          <button
            onClick={() => setTreeData(deleteNode(node.id))}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="删除该项"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {node.children?.length > 0 && <div className="ml-6 relative pl-2">{node.children.map((child) => renderNode(child, depth + 1))}</div>}
    </div>
  );

  return (
    <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
      <div className="p-6 border-b border-gray-100 shrink-0 bg-gradient-to-r from-blue-50/50 to-white">
        <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3 mb-2">
          <Network size={24} className="text-blue-600" />
          文件目录生成
        </h2>
        <p className="text-sm text-gray-500 mb-5">可视化编辑复杂文件夹层级，一键在指定的本地物理路径中完成创建。</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mr-2">模板预设库</span>
          <div className="relative">
            <select
              className="appearance-none bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-gray-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-sm transition-all"
              value={selectedPresetId}
              onChange={(event) => {
                const nextPresetId = event.target.value;
                setSelectedPresetId(nextPresetId);
                if (!nextPresetId) {
                  return;
                }

                const preset = presets.find((item) => item.id === nextPresetId);
                if (preset) {
                  setTreeData(JSON.parse(JSON.stringify(preset.tree)));
                }
              }}
            >
              <option value="">{isLoadingPresets ? "-- 正在加载预设 --" : "-- 选择预设模板 --"}</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-2 text-gray-400 pointer-events-none" />
          </div>
          <button
            onClick={handleDeletePreset}
            disabled={!selectedPresetId || isDeletingPreset}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-100 text-red-600 rounded-lg text-sm font-bold hover:bg-red-600 hover:text-white transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} /> {isDeletingPreset ? "删除中..." : "删除预设"}
          </button>
          <button
            onClick={handleSavePreset}
            disabled={isSavingPreset}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-sm font-bold hover:bg-blue-600 hover:text-white transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Save size={14} /> {isSavingPreset ? "保存中..." : "保存当前为预设"}
          </button>
          <div className="w-px h-6 bg-gray-200 mx-2"></div>
          <button
            onClick={() => setTreeData([])}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-sm font-medium hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            清空画布
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-8 bg-[#FAFAFA] scrollbar-thin">
        <div className="bg-white border border-gray-200 rounded-xl p-6 min-h-full shadow-sm">
          {treeData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20">
              <FolderPlus size={48} className="mb-4 opacity-50" />
              <p className="mb-4 text-gray-500">画布为空</p>
              <button
                onClick={() => addChildNode(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md"
              >
                创建根文件夹
              </button>
            </div>
          ) : (
            <div className="pb-20">
              {treeData.map((node) => renderNode(node, 0))}
              <button
                onClick={() => addChildNode(null)}
                className="mt-4 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Plus size={16} /> 添加同级根目录
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="p-4 bg-white border-t border-gray-200 shrink-0 flex items-center gap-4">
        <div className="flex-1 flex flex-col gap-1.5">
          <span className="text-xs font-bold text-gray-500">目标物理路径</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={targetPath}
              onChange={(event) => setTargetPath(event.target.value)}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <button
              onClick={handleBrowseTarget}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              浏览...
            </button>
          </div>
        </div>
        <div className="w-px h-10 bg-gray-200 mx-2"></div>
        <button
          onClick={handleGenerate}
          disabled={treeData.length === 0 || !targetPath || isGenerating}
          className="flex items-center gap-2 h-11 px-8 bg-blue-600 text-white rounded-xl text-base font-bold hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 disabled:active:scale-100"
        >
          <Play size={18} fill="currentColor" /> {isGenerating ? "正在生成..." : "一键生成结构"}
        </button>
      </div>
    </div>
  );
}

export default DirectoryEngineView;
