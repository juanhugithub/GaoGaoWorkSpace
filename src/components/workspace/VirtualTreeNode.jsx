import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Copy, File, Folder, FolderOpen, Trash2 } from "lucide-react";

const VirtualTreeNode = ({
  node,
  level = 0,
  onOpenPath,
  onCopyPath,
  onRevealPath,
  onRemoveMapping,
}) => {
  const [isOpen, setIsOpen] = useState(node.expanded || false);
  const [contextMenu, setContextMenu] = useState(null);
  const menuRef = useRef(null);
  const paddingLeft = `${level * 24 + 16}px`;

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setContextMenu(null);
      }
    };

    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [contextMenu]);

  return (
    <div className="relative">
      <div
        className="group flex items-center justify-between py-2 px-3 hover:bg-blue-50/60 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-blue-100 mb-0.5"
        style={{ paddingLeft }}
        onDoubleClick={() => onOpenPath(node.realPath)}
        onClick={() => node.itemType === "folder" && setIsOpen((current) => !current)}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <div className="flex items-center gap-3 overflow-hidden flex-1">
          {node.itemType === "folder" ? (
            <span className="text-gray-400 w-4 h-4 flex items-center justify-center shrink-0">
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          ) : (
            <span className="w-4 h-4 shrink-0"></span>
          )}

          <span className={`shrink-0 ${node.itemType === "folder" ? "text-blue-500" : "text-gray-500"}`}>
            {node.itemType === "folder" ? <Folder size={20} fill={isOpen ? "currentColor" : "none"} /> : <File size={18} />}
          </span>

          <div className="flex flex-col min-w-0 flex-1 justify-center">
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-bold truncate select-none ${
                  node.exists ? "text-gray-800 group-hover:text-blue-700" : "text-red-500"
                }`}
                title={node.displayName}
              >
                {node.displayName}
              </span>
              {node.tag && (
                <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-medium border border-gray-200 shrink-0">
                  {node.tag}
                </span>
              )}
              {!node.exists && (
                <span className="inline-block px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-[10px] font-medium border border-red-100 shrink-0">
                  路径不存在
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="hidden group-hover:flex items-center gap-1.5 pr-2 shrink-0">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onCopyPath(node.realPath);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:text-blue-700 hover:bg-blue-100/80 rounded-md transition-colors shadow-sm bg-white border border-gray-200"
            title="复制实际路径"
          >
            <Copy size={14} /> 复制
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onRevealPath(node.realPath);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:text-blue-700 hover:bg-blue-100/80 rounded-md transition-colors shadow-sm bg-white border border-gray-200"
            title="打开所在位置"
          >
            <FolderOpen size={14} /> 打开位置
          </button>
          {node.isMappedRoot && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onRemoveMapping(node.mappedItemId);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors shadow-sm bg-white border border-gray-200"
              title="移除此映射"
            >
              <Trash2 size={14} /> 移除映射
            </button>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] bg-white border border-gray-200 rounded-xl shadow-xl p-1.5"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              onCopyPath(node.realPath);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 rounded-lg"
          >
            <Copy size={14} /> 复制路径
          </button>
          <button
            onClick={() => {
              onRevealPath(node.realPath);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 rounded-lg"
          >
            <FolderOpen size={14} /> 打开所在位置
          </button>
          {node.isMappedRoot && (
            <button
              onClick={() => {
                onRemoveMapping(node.mappedItemId);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 size={14} /> 移除映射
            </button>
          )}
        </div>
      )}

      {node.itemType === "folder" && isOpen && node.children && node.children.length > 0 && (
        <div className="flex flex-col relative">
          <div className="absolute top-0 bottom-2 w-px bg-gray-200" style={{ left: `${level * 24 + 23}px` }}></div>
          {node.children.map((child) => (
            <VirtualTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              onOpenPath={onOpenPath}
              onCopyPath={onCopyPath}
              onRevealPath={onRevealPath}
              onRemoveMapping={onRemoveMapping}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default VirtualTreeNode;
