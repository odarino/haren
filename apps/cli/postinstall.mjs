#!/usr/bin/env node
// Runs after `haren` is installed. The published binary has a `#!/usr/bin/env bun`
// shebang, so package managers generate a shim that launches `bun`. If the user
// doesn't have Bun installed, that shim fails with "bun(.exe) not recognized".
//
// This script checks for Bun and installs it automatically when missing, so
// `haren` works regardless of whether the user already had Bun.
//
// Must stay plain Node (no Bun APIs) — it runs before Bun is guaranteed to exist.
import { spawnSync } from "node:child_process";

const SKIP = process.env.HAREN_SKIP_BUN_INSTALL;
const isWindows = process.platform === "win32";

function log(msg) {
  console.log(`[haren] ${msg}`);
}

function bunIsInstalled() {
  // `bun --version` resolves bun/bun.exe/bun.cmd via PATH using the OS shell.
  const probe = spawnSync("bun", ["--version"], {
    stdio: "ignore",
    shell: true,
  });
  return probe.status === 0;
}

function installBun() {
  if (isWindows) {
    log("Bun not found — installing via bun.sh (PowerShell)...");
    return spawnSync(
      "powershell",
      ["-NoProfile", "-Command", "irm https://bun.sh/install.ps1 | iex"],
      { stdio: "inherit" },
    );
  }
  log("Bun not found — installing via bun.sh ...");
  return spawnSync("bash", ["-c", "curl -fsSL https://bun.sh/install | bash"], {
    stdio: "inherit",
  });
}

function main() {
  if (SKIP) {
    log("HAREN_SKIP_BUN_INSTALL set — skipping Bun check.");
    return;
  }

  if (bunIsInstalled()) {
    log("Bun is already installed — nothing to do.");
    return;
  }

  const result = installBun();

  if (result.error || result.status !== 0) {
    log("Could not install Bun automatically.");
    log("haren requires the Bun runtime. Install it manually, then re-run:");
    log(
      isWindows
        ? '  powershell -c "irm https://bun.sh/install.ps1 | iex"'
        : "  curl -fsSL https://bun.sh/install | bash",
    );
    log("More info: https://bun.sh/docs/installation");
    // Do not fail the install — the package files are already in place.
    return;
  }

  log("Bun installed. Open a NEW terminal so PATH updates, then run `haren`.");
}

main();
