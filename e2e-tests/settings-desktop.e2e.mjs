import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { Builder, By, Capabilities, Key, until } from "selenium-webdriver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tauriDriverPort = 4444;
const nativeDriverPort = 4445;
const tauriDriverPath =
  process.env.TAURI_DRIVER_PATH || path.join(os.homedir(), ".cargo", "bin", "tauri-driver.exe");
const edgeDriverPath =
  process.env.EDGE_DRIVER_PATH ||
  path.join(
    process.env.LOCALAPPDATA || "",
    "Microsoft",
    "WinGet",
    "Packages",
    "Microsoft.EdgeDriver_Microsoft.Winget.Source_8wekyb3d8bbwe",
    "msedgedriver.exe",
  );
const applicationPath = path.join(rootDir, "src-tauri", "target", "debug", "personal_os");
const e2eAppDataDir = path.join(
  process.env.LOCALAPPDATA || "",
  "com.juanhu.gaogaoworkspace.e2e",
);

let tauriDriverProcess;
let driver;

function quoteForCmd(value) {
  const stringValue = String(value);
  if (!/[\s"]/u.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/"/g, '\\"')}"`;
}

function xpathLiteral(value) {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  return `concat('${value.split("'").join(`', "'", '`)}')`;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const spawnCommand =
      process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : command;
    const spawnArgs =
      process.platform === "win32"
        ? [
            "/d",
            "/s",
            "/c",
            [quoteForCmd(command), ...args.map((arg) => quoteForCmd(arg))].join(" "),
          ]
        : args;

    const child = spawn(spawnCommand, spawnArgs, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          [
            `command failed: ${command} ${args.join(" ")}`,
            stdout.trim(),
            stderr.trim(),
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}

function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = new net.Socket();
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`timed out waiting for port ${port}`));
          return;
        }
        setTimeout(attempt, 250);
      });
      socket.connect(port, "127.0.0.1");
    };

    attempt();
  });
}

async function waitForVisibleText(text, timeout = 15000) {
  const locator = By.xpath(`//*[contains(normalize-space(), ${xpathLiteral(text)})]`);
  const element = await driver.wait(until.elementLocated(locator), timeout);
  await driver.wait(until.elementIsVisible(element), timeout);
  return element;
}

async function clickButtonByText(text, timeout = 15000) {
  const button = await findButtonByText(text, { timeout, exact: true });
  await button.click();
  return button;
}

async function clickButtonContainingText(text, timeout = 15000) {
  const button = await findButtonByText(text, { timeout, exact: false });
  await button.click();
  return button;
}

async function findButtonByText(text, { timeout = 15000, exact = true } = {}) {
  return driver.wait(async () => {
    const buttons = await driver.findElements(By.css("button"));
    for (const button of buttons) {
      if (!(await button.isDisplayed())) {
        continue;
      }
      const buttonText = (await button.getText()).trim();
      const isMatch = exact ? buttonText === text : buttonText.includes(text);
      if (isMatch) {
        return button;
      }
    }
    return null;
  }, timeout);
}

async function clickLabelByText(text, timeout = 15000) {
  const label = await driver.wait(
    until.elementLocated(By.xpath(`//*[normalize-space()=${xpathLiteral(text)}]/ancestor::label[1]`)),
    timeout,
  );
  await driver.wait(until.elementIsVisible(label), timeout);
  await label.click();
  return label;
}

async function clearAndTypeCss(selector, value, timeout = 15000) {
  const input = await driver.wait(until.elementLocated(By.css(selector)), timeout);
  await driver.wait(until.elementIsVisible(input), timeout);
  await input.clear();
  await input.sendKeys(value);
  return input;
}

async function sendShortcut(key) {
  await driver.actions().keyDown(Key.CONTROL).sendKeys(key).keyUp(Key.CONTROL).perform();
}

before(async () => {
  if (!existsSync(tauriDriverPath)) {
    throw new Error(`tauri-driver not found: ${tauriDriverPath}`);
  }
  if (!existsSync(edgeDriverPath)) {
    throw new Error(`msedgedriver not found: ${edgeDriverPath}`);
  }

  rmSync(e2eAppDataDir, { recursive: true, force: true });
  await runCommand("npm", ["run", "build:e2e"], { cwd: rootDir });

  tauriDriverProcess = spawn(
    tauriDriverPath,
    [
      "--port",
      String(tauriDriverPort),
      "--native-port",
      String(nativeDriverPort),
      "--native-driver",
      edgeDriverPath,
    ],
    {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  tauriDriverProcess.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
  });
  tauriDriverProcess.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  await waitForPort(tauriDriverPort, 30000);

  const capabilities = new Capabilities();
  capabilities.setBrowserName("webview2");
  capabilities.set("tauri:options", {
    application: applicationPath,
    args: [],
  });

  driver = await new Builder()
    .usingServer(`http://127.0.0.1:${tauriDriverPort}`)
    .withCapabilities(capabilities)
    .build();
}, { timeout: 300000 });

after(async () => {
  await driver?.quit().catch(() => {});
  if (tauriDriverProcess) {
    tauriDriverProcess.kill();
  }
});

test(
  "desktop settings flow verifies immediate theme, settings shortcut, quick lock, and restore",
  { timeout: 120000 },
  async () => {
    console.log("E2E step: wait journal");
    await waitForVisibleText("工作日记");

    console.log("E2E step: open settings shortcut");
    await sendShortcut(",");
    await waitForVisibleText("Global Settings");

    console.log("E2E step: switch to appearance");
    await clickButtonContainingText("个性化与外观");
    await waitForVisibleText("主题模式");
    console.log("E2E step: click dark theme");
    await clickButtonContainingText("暗黑");
    console.log("E2E step: wait dark theme applied");
    await driver.wait(
      async () => (await driver.executeScript("return document.body.dataset.theme")) === "dark",
      10000,
    );

    console.log("E2E step: switch to privacy");
    await clickButtonContainingText("隐私与安全");
    console.log("E2E step: save password");
    await clearAndTypeCss("input[placeholder='请输入锁定密码']", "2468");
    await clickButtonByText("设置密码");
    await waitForVisibleText("锁定密码已设置");

    console.log("E2E step: enable lock");
    await clickLabelByText("开启应用锁定保护");

    console.log("E2E step: go to notes and check quick lock");
    const quickLockButton = await clickButtonByText("脑图笔记").then(async () => {
      const button = await driver.findElement(By.xpath("//*[normalize-space()='立即锁定']/ancestor::button[1]"));
      await driver.wait(async () => button.isEnabled(), 10000);
      return button;
    });

    assert.equal(await quickLockButton.isEnabled(), true);
    await waitForVisibleText("未选择任何笔记");

    console.log("E2E step: quick lock shortcut");
    await sendShortcut("l");
    await waitForVisibleText("应用已锁定");
    await waitForVisibleText("解锁后将恢复到锁定前的脑图笔记。");

    console.log("E2E step: unlock and verify restore");
    await clearAndTypeCss("input[placeholder='输入锁定密码']", "2468");
    await clickButtonByText("解锁进入");

    await waitForVisibleText("未选择任何笔记");
    await waitForVisibleText("已恢复到锁定前的脑图笔记，当前视图状态已保留。");
  },
);
