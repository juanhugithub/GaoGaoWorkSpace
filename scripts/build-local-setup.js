import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { loadTauriSigningEnvironment } from "./lib/tauriSigningEnv.js";

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const bundleDirectoryPath = path.join(projectRoot, "src-tauri", "target", "release", "bundle", "nsis");

function logStep(message) {
  console.log(`\n⏳ ${message}`);
}

function logDone(message) {
  console.log(`✅ ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveBundleArtifacts(buildStartedAt) {
  const artifacts = fs
    .readdirSync(bundleDirectoryPath)
    .map((fileName) => {
      const fullPath = path.join(bundleDirectoryPath, fileName);
      return {
        fileName,
        fullPath,
        modifiedAt: fs.statSync(fullPath).mtimeMs,
      };
    })
    .filter((item) => item.modifiedAt >= buildStartedAt - 1000);

  const setupExe = artifacts.find((item) => item.fileName.endsWith("-setup.exe"));
  const updaterZip = artifacts.find((item) => item.fileName.endsWith(".nsis.zip"));
  const setupExeSig = artifacts.find((item) => item.fileName.endsWith("-setup.exe.sig"));
  const updaterZipSig = artifacts.find((item) => item.fileName.endsWith(".nsis.zip.sig"));

  if (!setupExe || !updaterZip || !setupExeSig || !updaterZipSig) {
    throw new Error("打包完成，但未找到完整的 setup.exe / updater zip / 签名文件。");
  }

  return {
    setupExe,
    updaterZip,
    setupExeSig,
    updaterZipSig,
  };
}

function main() {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = readJson(packageJsonPath);

  logStep(`正在为 v${packageJson.version} 加载本地签名环境...`);
  const signingEnvironment = loadTauriSigningEnvironment(projectRoot);
  logDone(
    signingEnvironment.resolvedPrivateKeyPath
      ? `已加载签名私钥文件：${signingEnvironment.resolvedPrivateKeyPath}`
      : "已从环境变量加载签名私钥内容。",
  );

  logStep("正在构建 Windows 安装包与热更新包...");
  const buildStartedAt = Date.now();
  execSync("npm run tauri build", {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  const artifacts = resolveBundleArtifacts(buildStartedAt);
  logDone("安装包与热更新包构建完成。");

  console.log("\n================ 本地构建结果 ================");
  console.log(`setup.exe: ${artifacts.setupExe.fullPath}`);
  console.log(`setup.exe.sig: ${artifacts.setupExeSig.fullPath}`);
  console.log(`updater zip: ${artifacts.updaterZip.fullPath}`);
  console.log(`updater zip.sig: ${artifacts.updaterZipSig.fullPath}`);
  console.log("说明: Gitee 热更新实际使用 updater zip 与其 .sig；setup.exe 用于首次安装或手动重装。");
  console.log("============================================\n");
}

try {
  main();
} catch (error) {
  console.error("\n❌ 本地安装包构建失败");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
