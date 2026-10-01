/**
 * Build Lonelackey.
 *
 *   node esbuild.config.mjs               one-off development build
 *   node esbuild.config.mjs --production  minified release build
 *   node esbuild.config.mjs --watch       rebuild on change
 *
 * Output:
 *   dist/obsidian/lonelackey/   → copy into <vault>/.obsidian/plugins/
 *   dist/vault-template/         → a ready-to-open starter vault (plugin already inside)
 *
 * Set OBSIDIAN_VAULT=<path to a vault> to also copy the plugin into that vault after every build.
 */
import esbuild from "esbuild";
import builtins from "builtin-modules";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const production = args.has("--production");
const watch = args.has("--watch");

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // works on Windows paths with spaces
const TEMPLATE_DIR = path.join(ROOT, "template");
const DIST = path.join(ROOT, "dist");
const PLUGIN_OUT = path.join(DIST, "obsidian", "lonelackey");
const VAULT_OUT = path.join(DIST, "vault-template");
const DEFAULT_CAMPAIGN = "My Campaign";

/** Every file under template/, as { path, content } with forward-slash paths. */
async function readTemplate(dir = TEMPLATE_DIR, base = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await readTemplate(full, rel)));
    else if (entry.name !== ".gitkeep") out.push({ path: rel, content: await readFile(full, "utf8") });
    else out.push({ path: rel.replace(/\/?\.gitkeep$/, "/"), content: null }); // empty folder marker
  }
  return out;
}

/** Lets src/ do `import { TEMPLATE_FILES } from "virtual:template"` — the template ships inside main.js. */
const templatePlugin = {
  name: "lonelackey-template",
  setup(build) {
    build.onResolve({ filter: /^virtual:template$/ }, () => ({ path: "template", namespace: "lonelackey-template" }));
    build.onLoad({ filter: /.*/, namespace: "lonelackey-template" }, async () => ({
      contents: `export const TEMPLATE_FILES = ${JSON.stringify(await readTemplate())};`,
      loader: "js",
      watchFiles: (await readTemplate()).map((f) => path.join(TEMPLATE_DIR, f.path)),
      watchDirs: [TEMPLATE_DIR],
    }));
  },
};

/** Copy main.js + manifest (+ styles) into the Obsidian plugin layout, then build the starter vault. */
const assemblePlugin = {
  name: "lonelackey-assemble",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      await rm(PLUGIN_OUT, { recursive: true, force: true });
      await mkdir(PLUGIN_OUT, { recursive: true });
      await cp(path.join(DIST, "main.js"), path.join(PLUGIN_OUT, "main.js"));
      await cp(path.join(ROOT, "manifest.json"), path.join(PLUGIN_OUT, "manifest.json"));
      if (existsSync(path.join(ROOT, "styles.css"))) await cp(path.join(ROOT, "styles.css"), path.join(PLUGIN_OUT, "styles.css"));

      await rm(VAULT_OUT, { recursive: true, force: true });
      for (const file of await readTemplate()) {
        const rel = file.path.replaceAll("{{campaign}}", DEFAULT_CAMPAIGN);
        const target = path.join(VAULT_OUT, rel);
        if (file.content === null) { await mkdir(target, { recursive: true }); continue; }
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.content.replaceAll("{{campaign}}", DEFAULT_CAMPAIGN));
      }
      await cp(PLUGIN_OUT, path.join(VAULT_OUT, ".obsidian", "plugins", "lonelackey"), { recursive: true });

      const vault = process.env.OBSIDIAN_VAULT;
      if (vault) {
        if (!(await stat(path.join(vault, ".obsidian")).catch(() => null))) {
          console.warn(`OBSIDIAN_VAULT is not a vault (no .obsidian folder): ${vault}`);
        } else {
          await cp(PLUGIN_OUT, path.join(vault, ".obsidian", "plugins", "lonelackey"), { recursive: true });
          console.log(`Copied plugin into ${vault}`);
        }
      }
      console.log(`Built ${path.relative(ROOT, PLUGIN_OUT)} and ${path.relative(ROOT, VAULT_OUT)}`);
    });
  },
};

const context = await esbuild.context({
  entryPoints: [path.join(ROOT, "src", "main.ts")],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtins],
  format: "cjs",
  target: "es2021",
  platform: "browser",
  sourcemap: production ? false : "inline",
  minify: production,
  treeShaking: true,
  logLevel: "info",
  outfile: path.join(DIST, "main.js"),
  plugins: [templatePlugin, assemblePlugin],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
