import axios from "axios";
import dotenv from "dotenv";
import FormData from "form-data";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import process from "node:process";

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const packageJsonPath = path.join(projectRoot, "package.json");
const tauriConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(projectRoot, "src-tauri", "Cargo.toml");
const bundleDirectoryPath = path.join(projectRoot, "src-tauri", "target", "release", "bundle", "nsis");
const giteeApiBase = "https://gitee.com/api/v5";
const giteeWebBase = "https://gitee.com";
const defaultReleaseNotes = "常规更新";
const defaultUpdateJsonPath = "update.json";
const defaultBranch = "main";
const windowsTargetKey = "windows-x86_64";

function logStep(message) {
  console.log(`\n⏳ ${message}`);
}

function logDone(message) {
  console.log(`✅ ${message}`);
}

function logInfo(message) {
  console.log(`ℹ️  ${message}`);
}

function logWarn(message) {
  console.warn(`⚠️  ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArguments(argv) {
  const options = {
    version: "",
    notes: "",
    yes: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--help" || current === "-h") {
      options.help = true;
      continue;
    }

    if (current === "--yes" || current === "-y") {
      options.yes = true;
      continue;
    }

    if (current.startsWith("--version=")) {
      options.version = current.slice("--version=".length).trim();
      continue;
    }

    if (current === "--version" || current === "-v") {
      options.version = (argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (current.startsWith("--notes=")) {
      options.notes = current.slice("--notes=".length).trim();
      continue;
    }

    if (current === "--notes" || current === "-n") {
      options.notes = (argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    fail(`无法识别的参数：${current}`);
  }

  return options;
}

function printHelp() {
  console.log(`
用法：
  npm run release -- --version 1.0.323 --notes "修复若干问题"

可选参数：
  --version, -v   指定发布版本号
  --notes, -n     指定 Release 说明，默认值为“常规更新”
  --yes, -y       跳过交互确认
  --help, -h      查看帮助
`);
}

function assertSemver(version) {
  const semverPattern =
    /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

  if (!semverPattern.test(version)) {
    fail(`版本号格式不合法：${version}`);
  }
}

function normalizeVersion(version) {
  return version.startsWith("v") ? version.slice(1) : version;
}

async function promptForVersion(currentVersion) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await readline.question(
      `请输入新版本号（当前版本 ${currentVersion}）：`,
    );
    return answer.trim();
  } finally {
    readline.close();
  }
}

function ensureEnvironment(requiredKeys) {
  const missingKeys = requiredKeys.filter((key) => !String(process.env[key] || "").trim());
  if (missingKeys.length > 0) {
    fail(`缺少必要环境变量：${missingKeys.join(", ")}`);
  }
}

function normalizeMultilineEnvValue(value) {
  return String(value || "")
    .trim()
    .replace(/\\n/g, "\n");
}

function resolveSigningPrivateKey() {
  const rawValue = String(process.env.TAURI_SIGNING_PRIVATE_KEY || "").trim();
  if (!rawValue) {
    fail("缺少 TAURI_SIGNING_PRIVATE_KEY，无法生成 updater 签名文件。");
  }

  const possiblePath = path.resolve(projectRoot, rawValue);
  if (fs.existsSync(rawValue) && fs.statSync(rawValue).isFile()) {
    process.env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(rawValue, "utf8");
    return;
  }

  if (fs.existsSync(possiblePath) && fs.statSync(possiblePath).isFile()) {
    process.env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(possiblePath, "utf8");
    return;
  }

  process.env.TAURI_SIGNING_PRIVATE_KEY = normalizeMultilineEnvValue(rawValue);
}

function updateCargoTomlVersion(version) {
  const cargoTomlContent = fs.readFileSync(cargoTomlPath, "utf8");
  const updatedContent = cargoTomlContent.replace(
    /(\[package\][\s\S]*?^\s*version\s*=\s*")([^"]+)(")/m,
    `$1${version}$3`,
  );

  if (updatedContent === cargoTomlContent) {
    fail("未能更新 src-tauri/Cargo.toml 中的版本号。");
  }

  fs.writeFileSync(cargoTomlPath, updatedContent, "utf8");
}

function encodeRepositoryPath(relativePath) {
  return relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildRawUpdateEndpoint(owner, repo, branch, updateJsonPath) {
  const normalizedPath = updateJsonPath.replace(/^\/+/, "");
  return `${giteeWebBase}/${owner}/${repo}/raw/${branch}/${normalizedPath}`;
}

function syncVersionsAndUpdaterConfig(version, updateEndpoint, updaterPubkey) {
  logStep("正在同步 package.json、tauri.conf.json 和 Cargo.toml 版本号...");

  execSync(`npm version ${version} --no-git-tag-version`, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  const tauriConfig = readJson(tauriConfigPath);
  tauriConfig.version = version;
  tauriConfig.bundle = tauriConfig.bundle || {};
  tauriConfig.bundle.createUpdaterArtifacts = "v1Compatible";
  tauriConfig.plugins = tauriConfig.plugins || {};
  tauriConfig.plugins.updater = {
    ...(tauriConfig.plugins.updater || {}),
    active: true,
    endpoints: [updateEndpoint],
    pubkey: updaterPubkey,
    windows: {
      ...((tauriConfig.plugins.updater || {}).windows || {}),
      installMode: "passive",
    },
  };
  writeJson(tauriConfigPath, tauriConfig);

  updateCargoTomlVersion(version);
  logDone("版本号与 updater 配置同步完成。");
}

function runTauriBuild() {
  logStep("正在打包 Tauri 应用...");
  const buildStartedAt = Date.now();

  execSync("npm run tauri build", {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });

  logDone("Tauri 打包完成。");
  return buildStartedAt;
}

function resolveUpdaterArtifacts(buildStartedAt) {
  if (!fs.existsSync(bundleDirectoryPath)) {
    fail(`未找到 NSIS 构建目录：${bundleDirectoryPath}`);
  }

  const bundleFiles = fs
    .readdirSync(bundleDirectoryPath)
    .filter((fileName) => fileName.endsWith(".nsis.zip"))
    .map((fileName) => {
      const fullPath = path.join(bundleDirectoryPath, fileName);
      const stat = fs.statSync(fullPath);
      return {
        fileName,
        fullPath,
        modifiedAt: stat.mtimeMs,
      };
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt);

  if (bundleFiles.length === 0) {
    fail("未找到 .nsis.zip 更新包，请确认 tauri.conf.json 已启用 createUpdaterArtifacts。");
  }

  const latestBundle =
    bundleFiles.find((item) => item.modifiedAt >= buildStartedAt - 1000) || bundleFiles[0];
  const signaturePath = `${latestBundle.fullPath}.sig`;

  if (!fs.existsSync(signaturePath)) {
    fail(`未找到对应签名文件：${signaturePath}`);
  }

  const signature = fs.readFileSync(signaturePath, "utf8").trim();
  if (!signature) {
    fail(`签名文件内容为空：${signaturePath}`);
  }

  return {
    bundlePath: latestBundle.fullPath,
    bundleFileName: latestBundle.fileName,
    signaturePath,
    signature,
  };
}

function buildFormUrlEncodedBody(payload) {
  const urlSearchParams = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      urlSearchParams.append(key, String(value));
    }
  });
  return urlSearchParams.toString();
}

async function createGiteeRelease({
  token,
  owner,
  repo,
  branch,
  version,
  notes,
}) {
  logStep("正在创建 Gitee Release...");

  const response = await axios.post(
    `${giteeApiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`,
    buildFormUrlEncodedBody({
      access_token: token,
      tag_name: `v${version}`,
      name: `v${version}`,
      body: notes,
      target_commitish: branch,
      prerelease: false,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 30_000,
    },
  );

  const releaseId = response.data?.id;
  if (!releaseId) {
    fail("Gitee Release 创建成功，但响应中没有返回 release id。");
  }

  logDone(`Gitee Release 已创建：v${version}`);
  return response.data;
}

function toAbsoluteGiteeUrl(url) {
  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("/")) {
    return `${giteeWebBase}${url}`;
  }

  return `${giteeWebBase}/${url.replace(/^\/+/, "")}`;
}

function extractAttachmentDownloadUrl(uploadResponse, owner, repo, fileName) {
  const candidates = [];
  const visitedObjects = new Set();
  const queue = [uploadResponse];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (visitedObjects.has(current)) {
      continue;
    }
    visitedObjects.add(current);

    ["browser_download_url", "download_url", "url"].forEach((field) => {
      if (typeof current[field] === "string" && current[field].trim()) {
        candidates.push(current[field].trim());
      }
    });

    Object.values(current).forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach((item) => queue.push(item));
      } else if (value && typeof value === "object") {
        queue.push(value);
      }
    });
  }

  const directCandidate = candidates.find((candidate) => candidate.includes("/download/"));
  if (directCandidate) {
    return toAbsoluteGiteeUrl(directCandidate);
  }

  const fallbackByAttachId =
    uploadResponse?.id && uploadResponse?.name
      ? `${giteeWebBase}/${owner}/${repo}/attach_files/${uploadResponse.id}/download/${encodeURIComponent(uploadResponse.name)}`
      : "";

  if (fallbackByAttachId) {
    return fallbackByAttachId;
  }

  fail(
    `无法从 Gitee 附件上传响应中提取下载地址，请检查 API 返回结构。目标文件：${fileName}`,
  );
}

async function uploadReleaseAsset({
  token,
  owner,
  repo,
  releaseId,
  filePath,
}) {
  logStep("正在上传更新包到 Gitee Release...");

  const form = new FormData();
  form.append("file", fs.createReadStream(filePath), path.basename(filePath));

  const response = await axios.post(
    `${giteeApiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${releaseId}/attach_files`,
    form,
    {
      params: {
        access_token: token,
      },
      headers: form.getHeaders(),
      maxContentLength: Number.POSITIVE_INFINITY,
      maxBodyLength: Number.POSITIVE_INFINITY,
      timeout: 120_000,
    },
  );

  const downloadUrl = extractAttachmentDownloadUrl(
    response.data,
    owner,
    repo,
    path.basename(filePath),
  );

  logDone("更新包上传完成。");
  return {
    rawResponse: response.data,
    downloadUrl,
  };
}

function buildUpdateManifest({ version, notes, signature, downloadUrl }) {
  return {
    version,
    notes,
    pub_date: new Date().toISOString(),
    url: downloadUrl,
    signature,
    platforms: {
      [windowsTargetKey]: {
        url: downloadUrl,
        signature,
      },
    },
  };
}

async function getRepositoryFileSha({
  token,
  owner,
  repo,
  branch,
  updateJsonPath,
}) {
  const encodedPath = encodeRepositoryPath(updateJsonPath);

  try {
    const response = await axios.get(
      `${giteeApiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
      {
        params: {
          access_token: token,
          ref: branch,
        },
        timeout: 30_000,
      },
    );

    return response.data?.sha || "";
  } catch (error) {
    if (error.response?.status === 404) {
      return "";
    }

    throw error;
  }
}

async function upsertUpdateJson({
  token,
  owner,
  repo,
  branch,
  updateJsonPath,
  updateManifest,
}) {
  const encodedPath = encodeRepositoryPath(updateJsonPath);
  const sha = await getRepositoryFileSha({
    token,
    owner,
    repo,
    branch,
    updateJsonPath,
  });

  const requestMethod = sha ? "put" : "post";
  const commitMessage = sha
    ? `chore: update ${updateJsonPath} for v${updateManifest.version}`
    : `chore: create ${updateJsonPath} for v${updateManifest.version}`;

  logStep(`正在${sha ? "更新" : "创建"}仓库中的 ${updateJsonPath}...`);

  await axios({
    method: requestMethod,
    url: `${giteeApiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
    data: buildFormUrlEncodedBody({
      access_token: token,
      content: Buffer.from(`${JSON.stringify(updateManifest, null, 2)}\n`, "utf8").toString(
        "base64",
      ),
      message: commitMessage,
      branch,
      sha,
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 30_000,
  });

  logDone(`${updateJsonPath} 已提交到 Gitee 仓库。`);
}

function printReleaseSummary({
  version,
  releaseNotes,
  bundlePath,
  signaturePath,
  downloadUrl,
  updateEndpoint,
}) {
  console.log("\n================ 发布结果 ================");
  console.log(`版本号：${version}`);
  console.log(`更新说明：${releaseNotes}`);
  console.log(`更新包：${bundlePath}`);
  console.log(`签名文件：${signaturePath}`);
  console.log(`附件下载地址：${downloadUrl}`);
  console.log(`Updater Endpoint：${updateEndpoint}`);
  console.log("==========================================\n");
}

async function main() {
  const argumentsMap = parseArguments(process.argv.slice(2));
  if (argumentsMap.help) {
    printHelp();
    return;
  }

  ensureEnvironment([
    "GITEE_TOKEN",
    "GITEE_OWNER",
    "GITEE_REPO",
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_UPDATER_PUBLIC_KEY",
  ]);
  resolveSigningPrivateKey();

  const packageJson = readJson(packageJsonPath);
  const currentVersion = String(packageJson.version || "").trim();
  if (!currentVersion) {
    fail("package.json 中没有找到当前版本号。");
  }

  let nextVersion = argumentsMap.version.trim();
  if (!nextVersion) {
    nextVersion = await promptForVersion(currentVersion);
  }

  if (!nextVersion) {
    fail("未提供新版本号，发布已取消。");
  }

  assertSemver(nextVersion);
  nextVersion = normalizeVersion(nextVersion);

  if (nextVersion === normalizeVersion(currentVersion)) {
    fail(`新版本号不能与当前版本号相同：${nextVersion}`);
  }

  const releaseNotes = argumentsMap.notes.trim() || defaultReleaseNotes;
  const giteeToken = process.env.GITEE_TOKEN.trim();
  const giteeOwner = process.env.GITEE_OWNER.trim();
  const giteeRepo = process.env.GITEE_REPO.trim();
  const giteeBranch = String(process.env.GITEE_BRANCH || defaultBranch).trim();
  const updateJsonPath = String(process.env.GITEE_UPDATE_JSON_PATH || defaultUpdateJsonPath).trim();
  const updaterPubkey = normalizeMultilineEnvValue(process.env.TAURI_UPDATER_PUBLIC_KEY);
  const updateEndpoint = buildRawUpdateEndpoint(
    giteeOwner,
    giteeRepo,
    giteeBranch,
    updateJsonPath,
  );

  logInfo(`当前版本：${currentVersion}`);
  logInfo(`目标版本：${nextVersion}`);
  logInfo(`更新说明：${releaseNotes}`);
  logInfo(`Gitee 仓库：${giteeOwner}/${giteeRepo}`);
  logInfo(`更新清单地址：${updateEndpoint}`);

  if (!argumentsMap.yes) {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const answer = await readline.question("确认继续发布吗？输入 yes 继续：");
      if (answer.trim().toLowerCase() !== "yes") {
        fail("用户取消发布。");
      }
    } finally {
      readline.close();
    }
  }

  syncVersionsAndUpdaterConfig(nextVersion, updateEndpoint, updaterPubkey);
  const buildStartedAt = runTauriBuild();
  const bundleArtifacts = resolveUpdaterArtifacts(buildStartedAt);
  logDone(`已定位更新包：${bundleArtifacts.bundleFileName}`);
  logDone(`已读取签名文件：${path.basename(bundleArtifacts.signaturePath)}`);

  const release = await createGiteeRelease({
    token: giteeToken,
    owner: giteeOwner,
    repo: giteeRepo,
    branch: giteeBranch,
    version: nextVersion,
    notes: releaseNotes,
  });

  const uploadedAsset = await uploadReleaseAsset({
    token: giteeToken,
    owner: giteeOwner,
    repo: giteeRepo,
    releaseId: release.id,
    filePath: bundleArtifacts.bundlePath,
  });

  const updateManifest = buildUpdateManifest({
    version: nextVersion,
    notes: releaseNotes,
    signature: bundleArtifacts.signature,
    downloadUrl: uploadedAsset.downloadUrl,
  });

  await upsertUpdateJson({
    token: giteeToken,
    owner: giteeOwner,
    repo: giteeRepo,
    branch: giteeBranch,
    updateJsonPath,
    updateManifest,
  });

  printReleaseSummary({
    version: nextVersion,
    releaseNotes,
    bundlePath: bundleArtifacts.bundlePath,
    signaturePath: bundleArtifacts.signaturePath,
    downloadUrl: uploadedAsset.downloadUrl,
    updateEndpoint,
  });
}

main().catch((error) => {
  console.error("\n❌ 发布失败");

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const responseBody =
      typeof error.response?.data === "string"
        ? error.response.data
        : JSON.stringify(error.response?.data || {}, null, 2);
    console.error(`状态码：${status || "unknown"}`);
    console.error(`响应内容：${responseBody}`);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }

  process.exitCode = 1;
});
