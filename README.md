# GaoGao Workbench (V1 CLI)

这是一个可直接打包为 Windows `.exe` 的 V1 核心闭环工具（CLI 版），覆盖：

- 扫描目录结构
- 导出 XMind 兼容 Markdown
- 解析 Markdown 并生成创建计划
- 按确认参数执行目录创建（默认仅目录）

## 构建 Windows EXE

```bash
GOOS=windows GOARCH=amd64 go build -o dist/gaogao-workbench.exe ./cmd/gaogao
```

## 使用示例

```bash
# 扫描
./gaogao-workbench.exe scan -root "D:\\Workspace" -include-files=true -max-depth=3

# 导出
./gaogao-workbench.exe export -root "D:\\Workspace" -out "D:\\workspace.md" -include-files=true

# 导入预览
./gaogao-workbench.exe import-plan -md "D:\\workspace.md" -target "D:\\NewRoot"

# 执行创建（必须显式确认）
./gaogao-workbench.exe import-apply -md "D:\\workspace.md" -target "D:\\NewRoot" -confirm APPLY
```

## 安全策略（V1）

- 默认只创建，不删除、不覆盖
- 创建前建议先运行 `import-plan`
- `import-apply` 必须传 `-confirm APPLY`
- 对系统危险路径会标记 warning 并跳过


## 仓库说明（PR 兼容）

为避免代码托管平台在 Pull Request 中拒绝二进制文件，仓库不提交 `dist/*.exe`、`dist/*.zip`。
请在本地执行构建命令生成可执行文件后再分发。
