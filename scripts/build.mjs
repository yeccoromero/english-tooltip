import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });

const opts = {
  entryPoints: {
    content: "src/content/index.ts",
    background: "src/background/index.ts",
    options: "src/options/index.ts",
    popup: "src/popup/index.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
};

// Content scripts are classic scripts: bundle as IIFE. The rest are ES modules.
const { content, ...rest } = opts.entryPoints;
const contentOpts = { ...opts, entryPoints: { content }, format: "iife" };
const restOpts = { ...opts, entryPoints: rest };

if (watch) {
  for (const o of [contentOpts, restOpts]) await (await context(o)).watch();
} else {
  await build(contentOpts);
  await build(restOpts);
}
