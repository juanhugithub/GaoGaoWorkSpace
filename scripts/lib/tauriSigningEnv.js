import fs from "node:fs";
import path from "node:path";

export function normalizeMultilineEnvValue(value) {
  return String(value || "")
    .trim()
    .replace(/\\n/g, "\n");
}

export function loadTauriSigningEnvironment(projectRoot) {
  const rawPrivateKeyValue = String(process.env.TAURI_SIGNING_PRIVATE_KEY || "").trim();
  if (!rawPrivateKeyValue) {
    throw new Error("缺少 TAURI_SIGNING_PRIVATE_KEY，无法生成 updater 签名文件。");
  }

  const directPath = path.resolve(rawPrivateKeyValue);
  const projectRelativePath = path.resolve(projectRoot, rawPrivateKeyValue);
  const candidatePaths = [directPath, projectRelativePath];

  const resolvedPrivateKeyPath = candidatePaths.find((candidatePath) => {
    try {
      return fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile();
    } catch {
      return false;
    }
  });

  if (resolvedPrivateKeyPath) {
    process.env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(resolvedPrivateKeyPath, "utf8");
  } else {
    process.env.TAURI_SIGNING_PRIVATE_KEY = normalizeMultilineEnvValue(rawPrivateKeyValue);
  }

  const privateKeyPassword = normalizeMultilineEnvValue(
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
  );
  if (privateKeyPassword) {
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = privateKeyPassword;
  }

  const updaterPublicKey = normalizeMultilineEnvValue(process.env.TAURI_UPDATER_PUBLIC_KEY);
  if (updaterPublicKey) {
    process.env.TAURI_UPDATER_PUBLIC_KEY = updaterPublicKey;
  }

  return {
    resolvedPrivateKeyPath: resolvedPrivateKeyPath || "",
  };
}
