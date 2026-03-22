import { useEffect, useState } from "react";
import { BarChart3, BookOpen, CalendarDays, FolderTree, Settings } from "lucide-react";
import TabButton from "./components/common/TabButton";
import DashboardView from "./components/dashboard/DashboardView";
import JournalWorkspaceView from "./components/journal/JournalWorkspaceView";
import NotesWorkspaceView from "./components/notes/NotesWorkspaceView";
import VirtualWorkspaceView from "./components/workspace/VirtualWorkspaceView";

const ACTIVE_TAB_STORAGE_KEY = "personal-os.active-tab";
const VALID_TABS = ["workspace", "dashboard", "notes", "journal"];

function getInitialActiveTab() {
  if (typeof window === "undefined") {
    return "journal";
  }

  const storedValue = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  return VALID_TABS.includes(storedValue) ? storedValue : "journal";
}

export default function App() {
  const [activeTab, setActiveTab] = useState(getInitialActiveTab);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className="h-screen bg-[#F3F3F3] font-sans flex flex-col overflow-hidden text-gray-900">
      <div className="bg-white border-b border-gray-200 flex items-center px-4 pt-2 gap-1 select-none shrink-0 shadow-sm overflow-x-auto">
        <TabButton
          icon={<FolderTree size={16} />}
          label="文件空间"
          isActive={activeTab === "workspace"}
          onClick={() => setActiveTab("workspace")}
        />
        <TabButton
          icon={<BarChart3 size={16} />}
          label="数据看台"
          isActive={activeTab === "dashboard"}
          onClick={() => setActiveTab("dashboard")}
        />
        <TabButton
          icon={<BookOpen size={16} />}
          label="脑图笔记"
          isActive={activeTab === "notes"}
          onClick={() => setActiveTab("notes")}
        />
        <TabButton
          icon={<CalendarDays size={16} />}
          label="工作日记本"
          isActive={activeTab === "journal"}
          onClick={() => setActiveTab("journal")}
        />

        <div className="flex-1"></div>
        <button className="flex items-center gap-2 px-4 py-1.5 mb-1.5 mr-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all group shrink-0">
          <Settings size={18} className="group-hover:rotate-45 transition-transform duration-500" />
          <span className="text-sm font-bold">全局设置</span>
        </button>
      </div>
      <div className="flex-1 flex overflow-hidden p-4">
        {activeTab === "workspace" && <VirtualWorkspaceView />}
        {activeTab === "dashboard" && <DashboardView />}
        {activeTab === "notes" && <NotesWorkspaceView />}
        {activeTab === "journal" && <JournalWorkspaceView />}
      </div>
    </div>
  );
}
