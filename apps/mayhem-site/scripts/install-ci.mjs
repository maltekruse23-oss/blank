import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./sites-env.mjs";
import { readExecutionProfile } from "./execution-profile.mjs";
import { runNpmInstall } from "./npm-install.mjs";

if (!process.env.npm_execpath) {
  throw new Error("Run this installer with npm run install:ci.");
}

// Some Windows launchers report an npm path that does not exist (seen as
// <site>\node_modules\npm\bin\npm-cli.js); fall back to the npm bundled with node.
const npmCli = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
].find((candidate) => existsSync(candidate));
if (!npmCli) {
  throw new Error(`npm not found at ${process.env.npm_execpath}.`);
}

if (![
  "SHARP_IGNORE_GLOBAL_LIBVIPS",
  "SHARP_FORCE_GLOBAL_LIBVIPS",
  "npm_config_build_from_source",
  "NPM_CONFIG_BUILD_FROM_SOURCE",
].some((key) => key in process.env)) {
  process.env.SHARP_IGNORE_GLOBAL_LIBVIPS = "1";
}

if (readExecutionProfile() === "managed-linux") {
  const result = spawnSync("bash", [path.join(projectRoot, "scripts/install-ci.sh")], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Invoke npm's JavaScript entrypoint, avoiding platform-specific shell shims.
const installed = await runNpmInstall([
  process.execPath,
    npmCli, "ci", "--prefix", projectRoot, "--workspaces=false",
    "--include=dev", "--include=optional", "--prefer-offline", "--no-audit", "--no-fund",
]);
if (installed.signal) process.kill(process.pid, installed.signal);
if (installed.code !== 0 || installed.signal) process.exit(installed.code || 1);

try {
  accessSync(
    path.join(
      projectRoot, "node_modules", ".bin",
      process.platform === "win32" ? "vinext.cmd" : "vinext",
    ),
    process.platform === "win32" ? constants.F_OK : constants.X_OK,
  );
} catch {
  console.error("npm ci exited successfully but the local vinext executable is unavailable.");
  process.exitCode = 69;
}
