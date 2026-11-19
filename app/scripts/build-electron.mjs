// Compila o processo main e o preload do Electron (CJS, com dependências embutidas).
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

export async function buildElectron({ dev = false } = {}) {
  const common = {
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    external: ["electron"],
    sourcemap: dev ? "inline" : false,
    logLevel: "warning",
  };
  await build({ ...common, entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.cjs" });
  await build({ ...common, entryPoints: ["electron/preload.ts"], outfile: "dist-electron/preload.cjs" });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildElectron();
  console.log("✓ dist-electron/ gerado");
}
