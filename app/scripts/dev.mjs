// Modo desenvolvimento: Vite (HMR) + Electron apontando para o dev server.
import { createServer } from "vite";
import { spawn } from "node:child_process";
import electronPath from "electron";
import { buildElectron } from "./build-electron.mjs";

const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
const url = server.resolvedUrls.local[0];
await buildElectron({ dev: true });
console.log(`Vite em ${url} — abrindo Electron…`);

const proc = spawn(electronPath, ["."], { stdio: "inherit", env: { ...process.env, VITE_DEV_SERVER_URL: url } });
proc.on("close", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
