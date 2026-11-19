// Empacota "M535 Remap.app", assina com o certificado local e instala em ~/Applications.
import { packager } from "@electron/packager";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const IDENTITY = "M535Remap Local Signing";
const out = path.resolve("../build");
const helperApp = path.join(out, "M535 Remap Helper.app");

// O app leva o helper e o desinstalador dentro de Contents/Resources (instala/atualiza/desinstala pela UI).
console.log("→ Compilando o helper");
execFileSync("bash", [path.resolve("../scripts/build-helper.sh")], { stdio: "inherit" });
const [appDir] = await packager({
  dir: ".",
  out,
  name: "M535 Remap",
  appBundleId: "com.m535remap.settings",
  icon: "build-resources/icon.icns",
  platform: "darwin",
  arch: "arm64",
  overwrite: true,
  asar: true,
  prune: true,
  extraResource: [helperApp, path.resolve("../scripts/uninstall.sh")],
  // O main/preload/renderer já estão empacotados por esbuild/vite: só dist* e package.json são necessários.
  ignore: [/^\/(src|electron|scripts|node_modules|public|build-resources)(\/|$)/, /^\/(tsconfig\.json|vite\.config\.ts|index\.html)$/],
});
const app = path.join(appDir, "M535 Remap.app");

const ids = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"]).toString();
const identity = ids.includes(`"${IDENTITY}"`) ? IDENTITY : "-";
console.log(`→ Assinando com ${identity === "-" ? "ad-hoc" : identity}`);
execFileSync("codesign", ["--force", "--deep", "--sign", identity, "--timestamp=none", app], { stdio: "inherit" });

const appsDir = path.join(os.homedir(), "Applications");
const dest = path.join(appsDir, "M535 Remap.app");
// Nunca sobrescreve o helper de versões antigas (mesmo nome, outro bundle id): build-helper.sh --install migra ele.
const destPlist = path.join(dest, "Contents/Info.plist");
if (fs.existsSync(destPlist) && fs.readFileSync(destPlist, "utf8").includes("com.m535remap.helper")) {
  console.error("✗ ~/Applications/M535 Remap.app ainda é o helper antigo. Rode antes: scripts/build-helper.sh --install");
  process.exit(1);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.rmSync(path.join(appsDir, "M535 Remap Settings.app"), { recursive: true, force: true }); // nome antigo da interface
fs.cpSync(app, dest, { recursive: true, verbatimSymlinks: true });
console.log(`✓ Instalado em ${dest}`);
