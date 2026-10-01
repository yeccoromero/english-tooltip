// Bundles each tests/*.test.mjs with esbuild (so TS sources with extensionless imports work), then runs node --test.
import { build } from "esbuild";
import { readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync("tests").filter((f) => f.endsWith(".test.mjs"));
rmSync(".test-dist", { recursive: true, force: true });
await build({
  entryPoints: files.map((f) => `tests/${f}`),
  outdir: ".test-dist",
  bundle: true,
  platform: "node",
  format: "esm",
  outExtension: { ".js": ".mjs" },
  logLevel: "error",
});
const r = spawnSync("node", ["--test", ...files.map((f) => `.test-dist/${f}`)], { stdio: "inherit" });
rmSync(".test-dist", { recursive: true, force: true });
process.exit(r.status ?? 1);
