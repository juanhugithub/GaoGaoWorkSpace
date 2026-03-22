# 个人高绩效工作台 (GaoGaoWorkSpace)

桌面端本地办公工作台，基于 `Tauri v2 + Rust + React 18 + Vite + Tailwind CSS` 构建，面向政企办公场景，覆盖文件空间、数据看台、脑图笔记、工作日记本四个核心模块。

当前交付版本：
- 对外发布版本：`V1.0.0322`
- 应用内部语义化版本：`1.0.322`

## 1. 项目概览

本项目的目标是把分散的共享盘文件、异构 Excel 台账、XMind SOP 脑图、结构化工作日记统一收敛到一套本地桌面工作台中，核心原则如下：

- 本地优先：所有业务数据落在本机 SQLite，保证检索和渲染速度。
- 源文件不破坏：共享盘 Excel 与本地 XMind 仍是事实来源，系统只做映射、缓存和同步。
- 桌面级体验：支持调用系统默认程序、打开源文件、热更新同步、离线安装。
- 1:1 UI 落地：前端页面严格沿用原始静态稿的视觉结构与交互风格。

## 2. 功能模块

### 文件空间
- 虚拟业务场景分类管理
- 本地/共享盘文件与文件夹映射
- 双击用系统默认程序打开
- 打开所在位置、复制路径
- 文件目录生成模板的保存、载入、删除
- 按 JSON 树一键生成真实目录结构

### 数据看台
- 多数据源 Excel 映射与热同步
- 自定义字段映射，兼容异构表头和多 Sheet
- SQLite 缓存加速筛选与统计
- 按区镇、项目级别、年度、项目类别检索
- 只读表格与源文件追溯打开

### 脑图笔记
- XMind 文件导入与解析
- 外部编辑后自动热重载
- 笔记本新增、重命名、删除
- 笔记批量选择与批量删除

### 工作日记本
- 按月份归档
- 指定日期补开日记
- 自动继承上一份未完成任务
- 结构化任务字段编辑
- Markdown 批量导出

## 3. 技术栈

- 前端：`React 18`、`Vite`、`Tailwind CSS`、`lucide-react`
- 桌面壳：`Tauri v2`
- 后端：`Rust`
- 本地数据库：`SQLite (rusqlite bundled)`
- 文件监听：`notify`
- Excel 读取：`calamine`
- Excel 导出：`rust_xlsxwriter`
- XMind 解析：`zip` + `serde_json`

## 4. 目录结构

```text
GaoGaoWork/
├─ src/                    # React 前端
├─ src-tauri/              # Tauri / Rust 后端
├─ public/                 # 静态资源
├─ WorkspaceApp.jsx        # 原始静态稿参考
├─ Demand.md               # 需求说明
└─ README.md               # 项目说明
```

## 5. 安装与使用

### 普通用户安装

GitHub Release 中提供 Windows 安装包，双击 `Setup` 安装即可使用。

本版本采用 Tauri Windows `offlineInstaller` 模式打包 WebView2 运行时：
- 新电脑无需单独安装 Node.js
- 无需单独安装 Rust
- 无需手动安装 SQLite
- 大多数未预装 WebView2 的 Windows 机器也可直接离线安装

首次启动后，程序会自动在本机用户目录下创建应用数据目录与 SQLite 数据库。

默认数据位置：
```text
%LOCALAPPDATA%\com.juanhu.gaogaoworkspace\
```

数据库文件：
```text
personal_os.sqlite3
```

## 6. 开发运行

### 前端开发

```bash
npm install
npm run tauri dev
```

### 生产构建

```bash
npm run build
npm run tauri build
```

## 7. 打包产物

Windows 发布产物默认位于：

```text
src-tauri\target\release\bundle\nsis\
```

常见文件包括：
- `*.exe`：Windows 安装程序
- `*.nsis.zip`：安装器压缩包

## 8. 测试与质量校验

已建立并验证的检查项：

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
npm audit --omit=dev --json
cd src-tauri && cargo audit
```

当前状态：
- Rust 单元测试通过
- 前端生产构建通过
- npm 生产依赖无漏洞
- Rust 依赖审计可运行，但 Tauri Linux 传递依赖仍存在 GTK3 维护告警

## 9. 数据设计原则

- `virtual_spaces` / `mapped_items`：文件空间映射
- `directory_presets`：目录模板 JSON
- `data_sources` / `column_mappings`：台账数据源与字段映射
- `projects`：同步后的只读项目缓存
- `notebooks` / `notes`：脑图笔记与 XMind 路径
- `journals` / `journal_tasks`：结构化工作日记

## 10. 维护建议

- 如果共享盘 Excel 结构经常变化，优先维护字段映射，不要直接改库表结构。
- 如果要发布 Linux 版本，先处理 `cargo audit` 报出的 GTK3 传递依赖风险。
- 如果要继续扩展功能，建议优先补齐前端自动化测试，再新增更复杂的配置页与批量操作。

## 11. 许可证与交付说明

本仓库当前用于项目交付与内部部署。若后续需要开源，请再单独补充许可证、贡献规范与发布策略。
