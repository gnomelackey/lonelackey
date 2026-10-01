import { App, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_COINS } from "./core";
import type LonelackeyPlugin from "./main";

export interface LonelackeySettings {
  /** Notes carrying this tag are read as session logs. */
  sessionTag: string;
  /** Notes carrying this tag are character sheets, matched to [PC:Name] by note name. */
  characterTag: string;
  /** Sync automatically after a session note is saved. */
  autoSync: boolean;
  /** Milliseconds to wait after the last change before syncing. */
  delayMs: number;
  /** Show a notice listing what changed. */
  showNotices: boolean;
  /** Coin names used in [Wealth:…] tags → sheet properties, e.g. "gold=gp, silver=sp". */
  coins: string;
}

export const DEFAULT_SETTINGS: LonelackeySettings = {
  sessionTag: "session",
  characterTag: "character",
  autoSync: true,
  delayMs: 1500,
  showNotices: true,
  coins: Object.entries(DEFAULT_COINS).map(([k, v]) => `${k}=${v}`).join(", "),
};

export class LonelackeySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LonelackeyPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();

    new Setting(containerEl).setName("Sync when a session is saved")
      .setDesc("Update character sheets from Lonelog tags shortly after a session note changes.")
      .addToggle((t) => t.setValue(s.autoSync).onChange(async (v) => { s.autoSync = v; await save(); }));

    new Setting(containerEl).setName("Delay after saving (ms)")
      .setDesc("Waits until you pause typing before syncing. Minimum 250.")
      .addText((t) => t.setValue(String(s.delayMs)).onChange(async (v) => {
        const n = parseInt(v, 10);
        if (Number.isFinite(n) && n >= 250) { s.delayMs = n; await save(); }
      }));

    new Setting(containerEl).setName("Show a notice when sheets change")
      .addToggle((t) => t.setValue(s.showNotices).onChange(async (v) => { s.showNotices = v; await save(); }));

    new Setting(containerEl).setName("Session tag")
      .setDesc("Notes with this tag are read as sessions.")
      .addText((t) => t.setValue(s.sessionTag).onChange(async (v) => { s.sessionTag = v.trim() || "session"; await save(); }));

    new Setting(containerEl).setName("Character tag")
      .setDesc("Notes with this tag are character sheets, matched to [PC:Name] by note name.")
      .addText((t) => t.setValue(s.characterTag).onChange(async (v) => { s.characterTag = v.trim() || "character"; await save(); }));

    new Setting(containerEl).setName("Coins")
      .setDesc("Coin names in [Wealth:…] tags and the sheet property each one updates, e.g. gold=gp, silver=sp, credits=credits.")
      .addTextArea((t) => t.setValue(s.coins).onChange(async (v) => { s.coins = v; await save(); }));
  }
}
