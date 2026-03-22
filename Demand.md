# 角色设定与任务目标
你是一个顶级的全栈桌面应用架构师，精通 **Tauri v2, Rust, React 18, Vite, Tailwind CSS**。
我的目标是从零开始，开发一款名为「个人高绩效工作台 (Personal OS)」的跨平台桌面端应用。
我已经提供了一份完全写好的、纯静态的前端 UI 代码（见附件 `WorkspaceApp.jsx`）。你的任务是：基于这份 UI，搭建完整的 Tauri v2 项目，并用 Rust 补全所有底层的业务逻辑、本地文件系统交互和 SQLite 数据库操作，最终交付一个 1:1 还原且功能完备的本地桌面应用。

# 🛠️ 技术栈规范 (严格遵守)
- **核心框架**: Tauri v2
- **前端**: React 18 + Vite + Tailwind CSS + `lucide-react` (图标)
- **后端**: Rust
- **数据库**: `rusqlite` (本地 SQLite 存储)
- **系统交互**: `tauri-plugin-dialog` (文件选择), `notify` (Rust 文件监控), `zip` / `serde_json` (Xmind 解析)
- **UI 风格**: 现代 WinUI 极简风（背景 `#F3F3F3`，纯白内容面板，细腻的圆角 `rounded-2xl`，柔和的描边和阴影，无冗余加粗，呼吸感布局）。

# 📦 核心业务模块与功能规格

## 模块 1：虚拟业务空间 (Virtual Workspace) & 目录结构引擎
**前端 UI 对应**: `VirtualWorkspaceView` 与 `DirectoryEngineView`
**业务逻辑**:
1. **虚拟映射**: 用户可以在左侧创建虚拟分类（如“项目申报”、“安全生产”），并在右侧将电脑本地或共享盘的物理文件/文件夹“映射”进来（仅存物理路径，不移动原文件）。
2. **快捷操作**: 节点双击直接调用系统默认程序打开文件。悬浮右键菜单支持“复制路径”、“打开所在位置”。
3. **脑图式目录引擎**:
   - 允许用户在 UI 上无限极增删改文件夹树节点。
   - **预设系统**: 支持下拉框选择预设模板（载入时必须使用深度拷贝，防止污染底稿）。支持将当前画布结构“保存为新预设”存入数据库。
   - **一键生成**: 结合目标本地路径，Rust 后端需递归创建真实的物理文件夹结构。

## 模块 2：项目台账数据看台 (Data Dashboard)
**前端 UI 对应**: `DashboardView`
**业务逻辑**:
1. **联动聚合看板**: 顶部的三个统计卡片（项目数、总金额、验收率）必须是**动态响应式**的，随着下方表格数据的筛选而实时重新计算。
2. **多维检索**: 提供搜索框（模糊匹配名称/企业）和自定义多选下拉框（MultiSelectFilter）。
3. **数据导入/导出**:
   - 必须支持通过 Rust 后端读取本地 Excel/CSV 文件，将台账数据导入 SQLite。
   - 支持将当前过滤后的表格数据导出为 Excel。

## 模块 3：SOP 脑图笔记 (Process Notes)
**前端 UI 对应**: `NotesWorkspaceView`
**业务逻辑**:
1. **Xmind 无损解析**: 选定本地的 `.xmind` 文件后，Rust 后端需解压读取 `content.json`，转化为树形结构传给前端渲染为漂亮的无限网格脑图。
2. **外部编辑与热重载 (Hot Sync)**:
   - 前端点击“在 Xmind 中编辑”唤起本地系统程序打开该文件。
   - **核心痛点解决**: Rust 后端必须使用 `notify` 监听该 `.xmind` 文件的变动。一旦用户在外部按了 `Ctrl+S` 保存，Rust 自动重新解析并通过 Tauri Event 推送给前端，实现 UI 的实时无缝刷新。

## 模块 4：工作日记本 (Daily Journal)
**前端 UI 对应**: `JournalWorkspaceView`
**业务逻辑**:
1. **月份归档**: 左侧日记列表提取日期前缀按“YYYY年MM月”进行分组。
2. **填空式记录**: 每个任务包含内容、对接人、截止时间、进度、优先级，以及一个专用的多行 `remark` (详细备注) 字段。
3. **智能继承 (Auto-Carryover)**: 点击“开启今日日记模板”时，不仅创建当天的空模板，还需要**自动检索上一天进度不为“已完成”的任务，将其继承（复制）到今天的对应分类下**。
4. **Markdown 批量导出**: 提供复选框多选日志，将结构化数据合并转换为规范的 Markdown 文本（用于喂给 AI 写周报）。

# 🗄️ 数据库设计要求 (SQLite)
请在 Rust 启动时初始化必要的表结构，至少包含：
- `virtual_spaces` (虚拟空间分类) & `mapped_items` (文件映射关系)
- `directory_presets` (目录结构预设，存 JSON)
- `projects` (台账中心项目数据)
- `notebooks` & `notes` (SOP 笔记本与 xmind 路径)
- `journals` & `journal_tasks` (按日期存储的结构化日记及子任务)

# 🚀 执行步骤 (Action Plan)
为了避免一次性输出过多导致上下文崩溃，请严格按照以下步骤**分步执行**，每完成一步请等待我的确认：

- **Step 1**: 初始化 Tauri v2 项目结构，配置 React + Vite + Tailwind，安装 `lucide-react`。把附件中的 `WorkspaceApp.jsx` 完整集成进去作为主界面，跑通前端静态展示。
- **Step 2**: 编写 Rust 后端的 SQLite 初始化模块 (`storage.rs` / `db.rs`)，建好表结构。
- **Step 3**: 实现「工作日记本」的前后端交互（Tauri Commands），完成新建、自动继承、状态保存和 Markdown 导出功能。
- **Step 4**: 实现「虚拟业务空间」和「目录生成引擎」，完成物理文件映射、双击调用系统打开、以及基于 JSON 树批量创建真实本地文件夹的 Rust 逻辑。
- **Step 5**: 实现「SOP笔记」的 Xmind 解析与 `notify` 热更新机制。
- **Step 6**: 实现「数据看台」的 Excel 导入与动态聚合统计逻辑。
