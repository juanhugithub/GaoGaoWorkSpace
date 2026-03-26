import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Briefcase, FolderOpen, Link as LinkIcon, Network, Plus, Search, ShieldCheck, Star, Trash2 } from "lucide-react";
import DirectoryEngineView from "./DirectoryEngineView";
import VirtualTreeNode from "./VirtualTreeNode";
import {
  addMappedItems,
  createVirtualSpace,
  deleteVirtualSpace,
  listMappedItemsTree,
  listVirtualSpaces,
  openPathWithSystem,
  removeMappedItem,
  revealPathInSystem,
} from "../../lib/workspace";
import {
  showErrorToast,
  showSuccessToast,
} from "../../lib/toast";
import { useToast } from "../common/ToastProvider";

const TOOL_SPACE_ID = "vs-dir-engine";
const ACTIVE_WORKSPACE_STORAGE_KEY = "personal-os.workspace.active-space";
const iconByIndex = [Briefcase, ShieldCheck, Star];

function getInitialActiveSpace() {
  if (typeof window === "undefined") {
    return TOOL_SPACE_ID;
  }

  return window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) || TOOL_SPACE_ID;
}

function VirtualWorkspaceView() {
  const { showToast } = useToast();
  const [spaces, setSpaces] = useState([]);
  const [activeSpace, setActiveSpace] = useState(getInitialActiveSpace);
  const [mappedItems, setMappedItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingSpaces, setIsLoadingSpaces] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isAddingSpace, setIsAddingSpace] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, activeSpace);
  }, [activeSpace]);

  const activeSpaceData = useMemo(() => {
    if (activeSpace === TOOL_SPACE_ID) {
      return { id: TOOL_SPACE_ID, name: "文件目录生成", mappedCount: 0 };
    }
    return spaces.find((space) => space.id === activeSpace) ?? null;
  }, [activeSpace, spaces]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return mappedItems;
    }

    const filterTree = (nodes) =>
      nodes
        .map((node) => {
          const children = filterTree(node.children || []);
          const matched = node.displayName.toLowerCase().includes(query);
          if (matched || children.length > 0) {
            return { ...node, children };
          }
          return null;
        })
        .filter(Boolean);

    return filterTree(mappedItems);
  }, [mappedItems, searchQuery]);

  useEffect(() => {
    let cancelled = false;

    async function loadSpaces() {
      setIsLoadingSpaces(true);
      try {
        const items = await listVirtualSpaces();
        if (cancelled) {
          return;
        }
        setSpaces(items);
        setActiveSpace((current) =>
          current === TOOL_SPACE_ID || items.some((item) => item.id === current)
            ? current
            : items[0]?.id ?? TOOL_SPACE_ID
        );
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          showErrorToast(showToast, {
            title: "加载文件空间失败",
            error,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSpaces(false);
        }
      }
    }

    loadSpaces();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;

    async function loadMappedItems() {
      if (!activeSpace || activeSpace === TOOL_SPACE_ID) {
        setMappedItems([]);
        return;
      }

      setIsLoadingItems(true);
      try {
        const items = await listMappedItemsTree(activeSpace);
        if (!cancelled) {
          setMappedItems(items);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          showErrorToast(showToast, {
            title: "加载映射文件失败",
            error,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingItems(false);
        }
      }
    }

    loadMappedItems();

    return () => {
      cancelled = true;
    };
  }, [activeSpace, showToast]);

  const refreshSpaces = async (preferredSpaceId = null) => {
    const items = await listVirtualSpaces();
    setSpaces(items);
    setActiveSpace((current) =>
      preferredSpaceId && items.some((item) => item.id === preferredSpaceId)
        ? preferredSpaceId
        : current === TOOL_SPACE_ID || items.some((item) => item.id === current)
          ? current
          : items[0]?.id ?? TOOL_SPACE_ID
    );
  };

  const refreshMappedItems = async (spaceId = activeSpace) => {
    if (!spaceId || spaceId === TOOL_SPACE_ID) {
      setMappedItems([]);
      return;
    }
    const items = await listMappedItemsTree(spaceId);
    setMappedItems(items);
  };

  const handleCreateSpace = async () => {
    const name = window.prompt("请输入新的业务场景名称：", "");
    if (!name?.trim()) {
      return;
    }

    setIsAddingSpace(true);
    try {
      const space = await createVirtualSpace(name.trim());
      await refreshSpaces(space.id);
      showSuccessToast(showToast, {
        title: "业务场景已创建",
        description: `已创建业务场景“${space.name}”。`,
      });
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "创建业务场景失败",
        error,
      });
    } finally {
      setIsAddingSpace(false);
    }
  };

  const handleDeleteSpace = async (spaceId, spaceName) => {
    if (!window.confirm(`确认删除“${spaceName}”吗？该场景下的映射会一并移除。`)) {
      return;
    }

    try {
      await deleteVirtualSpace(spaceId);
      await refreshSpaces();
      await refreshMappedItems();
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "删除业务场景失败",
        error,
      });
    }
  };

  const handleAddMappings = async (mode) => {
    if (!activeSpaceData || activeSpaceData.id === TOOL_SPACE_ID) {
      return;
    }

    const selected = await openDialog({
      directory: mode === "folder",
      multiple: true,
    });

    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (paths.length === 0) {
      return;
    }

    try {
      await addMappedItems(activeSpaceData.id, paths);
      await refreshSpaces(activeSpaceData.id);
      await refreshMappedItems(activeSpaceData.id);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "添加映射失败",
        error,
      });
    }
  };

  const handleRemoveMapping = async (mappedItemId) => {
    if (!mappedItemId) {
      return;
    }

    if (!window.confirm("确认移除此映射吗？原始文件不会被删除。")) {
      return;
    }

    try {
      await removeMappedItem(mappedItemId);
      await refreshSpaces(activeSpace);
      await refreshMappedItems(activeSpace);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "移除映射失败",
        error,
      });
    }
  };

  const handleOpenPath = async (path) => {
    try {
      await openPathWithSystem(path);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "打开失败",
        error,
      });
    }
  };

  const handleRevealPath = async (path) => {
    try {
      await revealPathInSystem(path);
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "打开所在位置失败",
        error,
      });
    }
  };

  const handleCopyPath = async (path) => {
    try {
      await navigator.clipboard.writeText(path);
      showSuccessToast(showToast, {
        title: "路径已复制到剪贴板",
        description: path,
        duration: 4200,
      });
    } catch (error) {
      console.error(error);
      showErrorToast(showToast, {
        title: "复制路径失败",
        error,
      });
    }
  };

  const renderSpaceIcon = (index, isActive) => {
    const Icon = iconByIndex[index % iconByIndex.length];
    return <Icon size={18} className={isActive ? "text-blue-200" : "text-gray-400"} />;
  };

  return (
    <div className="flex-1 flex gap-4 h-full overflow-hidden">
      <div className="w-64 flex-shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
          <div className="text-[11px] font-bold text-gray-400 px-3 uppercase tracking-widest">业务场景</div>
          <button
            onClick={handleCreateSpace}
            disabled={isAddingSpace}
            className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-70"
          >
            <Plus size={14} /> {isAddingSpace ? "创建中" : "新建"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
          {isLoadingSpaces && <div className="px-3 py-4 text-sm text-gray-400">正在加载业务场景...</div>}
          <div className="flex flex-col gap-1">
            {spaces.map((space, index) => {
              const isActive = activeSpace === space.id;
              return (
                <div key={space.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveSpace(space.id)}
                    className={`flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {renderSpaceIcon(index, isActive)}
                      <span>{space.name}</span>
                    </div>
                    <span className={`text-xs ${isActive ? "text-blue-100" : "text-gray-400"}`}>{space.mappedCount}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteSpace(space.id, space.name)}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="删除业务场景"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-6 mb-3 px-3 border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-widest">全局工具</div>
            <button
              onClick={() => setActiveSpace(TOOL_SPACE_ID)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeSpace === TOOL_SPACE_ID
                  ? "bg-indigo-500 text-white shadow-md shadow-indigo-200"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <Network size={18} className={activeSpace === TOOL_SPACE_ID ? "text-white/80" : "text-indigo-500"} />
              文件目录生成
            </button>
          </div>
        </div>
      </div>

      {activeSpace === TOOL_SPACE_ID ? (
        <DirectoryEngineView />
      ) : (
        <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-100 shrink-0">
            <div className="flex justify-between items-start mb-4 gap-4">
              <div>
                <h2 className="text-2xl font-black text-gray-800">{activeSpaceData?.name || "文件空间"}</h2>
                <p className="text-sm text-gray-500 mt-1.5 flex items-center gap-1.5">
                  <LinkIcon size={14} className="text-gray-400" />
                  此空间的内容为底层文件/文件夹的虚拟快捷映射，不移动原始文件。
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleAddMappings("file")}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  映射文件
                </button>
                <button
                  onClick={() => handleAddMappings("folder")}
                  className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-sm shadow-blue-200"
                >
                  映射文件夹
                </button>
              </div>
            </div>
            <div className="relative max-w-md">
              <input
                type="text"
                placeholder={`在“${activeSpaceData?.name || ""}”中搜索映射...`}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Search size={18} className="absolute left-3.5 top-2 text-gray-400" />
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6 bg-white scrollbar-thin">
            {isLoadingItems ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <FolderOpen size={48} className="text-gray-300 mb-4 opacity-50" />
                <p className="text-lg font-bold text-gray-500 mb-2">正在加载映射内容</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <FolderOpen size={48} className="text-gray-300 mb-4 opacity-50" />
                <p className="text-lg font-bold text-gray-500 mb-2">
                  {mappedItems.length === 0 ? "当前业务场景暂无关联文件" : "没有匹配的映射结果"}
                </p>
              </div>
            ) : (
              <div className="flex flex-col max-w-5xl mx-auto w-full pb-10">
                {filteredItems.map((item) => (
                  <VirtualTreeNode
                    key={item.id}
                    node={item}
                    onOpenPath={handleOpenPath}
                    onCopyPath={handleCopyPath}
                    onRevealPath={handleRevealPath}
                    onRemoveMapping={handleRemoveMapping}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default VirtualWorkspaceView;
