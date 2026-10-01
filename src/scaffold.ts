import { App, Modal, Notice, Setting, normalizePath } from "obsidian";
import { TEMPLATE_FILES } from "virtual:template";

const PLACEHOLDER = "{{campaign}}";

export interface ScaffoldResult { created: string[]; skipped: string[] }

/**
 * Write the starter vault into the current vault. Existing files are never overwritten,
 * so it's safe to run in a vault you already use.
 */
export async function createStarterVault(app: App, campaign: string): Promise<ScaffoldResult> {
  const name = campaign.trim().replace(/[\\/:*?"<>|#^[\]]/g, "") || "My Campaign";
  const created: string[] = [];
  const skipped: string[] = [];
  const adapter = app.vault.adapter;

  for (const file of TEMPLATE_FILES) {
    const rel = normalizePath(file.path.split(PLACEHOLDER).join(name));
    if (file.content === null) {
      if (!(await adapter.exists(rel))) { await adapter.mkdir(rel); created.push(`${rel}/`); }
      continue;
    }
    if (await adapter.exists(rel)) { skipped.push(rel); continue; }
    const dir = rel.split("/").slice(0, -1).join("/");
    if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);
    // adapter.write also reaches hidden folders like .obsidian/snippets
    await adapter.write(rel, file.content.split(PLACEHOLDER).join(name));
    created.push(rel);
  }
  return { created, skipped };
}

export class ScaffoldModal extends Modal {
  private campaign = "My Campaign";

  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText("Create starter vault");
    contentEl.createEl("p", {
      text: "Adds a Home dashboard, a campaign folder (characters, sessions, world, threads), note templates, a character-sheet style and an empty compendium with a guide. Existing files are left untouched.",
    });

    new Setting(contentEl).setName("Campaign name").addText((t) =>
      t.setValue(this.campaign).onChange((v) => { this.campaign = v; }));

    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Create").setCta().onClick(() => {
        b.setDisabled(true);
        createStarterVault(this.app, this.campaign)
          .then(({ created, skipped }) => {
            this.close();
            new Notice(
              `Lonelackey: created ${created.length} item${created.length === 1 ? "" : "s"}` +
              (skipped.length ? `, kept ${skipped.length} existing file${skipped.length === 1 ? "" : "s"}` : "") +
              ".\nNext: enable the lonelackey-sheet CSS snippet and point the Templates plugin at the Templates folder. See Home.",
              10000,
            );
          })
          .catch((e: unknown) => {
            b.setDisabled(false);
            new Notice(`Lonelackey: couldn't create the vault — ${e instanceof Error ? e.message : String(e)}`);
          });
      }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
