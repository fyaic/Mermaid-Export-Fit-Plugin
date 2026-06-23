const { Plugin, PluginSettingTab, Setting, Notice } = require('obsidian');

const PLUGIN_NAME = 'Mermaid Export Fit';

const DEFAULT_SETTINGS = {
  enableScroll: true,
  enableExportScale: true,
  scrollbarStyle: 'minimal',
  language: 'en'
};

const STRINGS = {
  en: {
    refreshCommand: 'Refresh all Mermaid diagrams',
    scaleCommand: 'Scale Mermaid diagrams to fit container',
    refreshedNotice: `${PLUGIN_NAME}: refreshed all diagrams`,
    scaledNotice: `${PLUGIN_NAME}: diagrams scaled to fit`,
    languageButtonLabel: 'Switch language to Chinese',
    languageChanged: 'Language switched to English',
    settingsDesc: 'Keeps Mermaid diagrams visible in Obsidian with horizontal scrolling and export-friendly scaling.',
    enableScrollName: 'Enable horizontal scrolling',
    enableScrollDesc: 'Show a horizontal scrollbar when a Mermaid diagram is wider than its container.',
    exportScaleName: 'Fit diagrams when exporting',
    exportScaleDesc: 'Scale Mermaid SVGs to the page width when exporting to PDF or HTML.',
    usageTitle: 'Usage notes',
    usageNoConfig: 'Works out of the box with no extra setup.',
    usageRefresh: 'If a diagram still looks clipped, run "Refresh all Mermaid diagrams" from the command palette.',
    usageExport: 'For wide PDFs, landscape page orientation usually gives the best result.',
    refreshSettingName: 'Refresh all Mermaid diagrams now',
    refreshSettingDesc: 'Run this if a diagram was rendered before the plugin adjusted it.',
    refreshButtonText: 'Refresh',
    refreshButtonNotice: 'Refreshed all Mermaid diagrams'
  },
  zh: {
    refreshCommand: '刷新所有 Mermaid 图表',
    scaleCommand: '强制缩放 Mermaid 到容器宽度',
    refreshedNotice: `${PLUGIN_NAME}：已刷新所有图表`,
    scaledNotice: `${PLUGIN_NAME}：已强制缩放`,
    languageButtonLabel: '切换语言为 English',
    languageChanged: '语言已切换为中文',
    settingsDesc: '自动修复 Mermaid 图表在 Obsidian 中显示不全的问题，支持横向滚动和导出自适应。',
    enableScrollName: '启用横向滚动条',
    enableScrollDesc: '当 Mermaid 图表超出容器宽度时，显示横向滚动条，保持原图清晰度。',
    exportScaleName: '导出时自适应',
    exportScaleDesc: '导出 PDF/HTML 时，自动让 Mermaid SVG 适应页面宽度。',
    usageTitle: '使用说明',
    usageNoConfig: '本插件开箱即用，无需额外配置。',
    usageRefresh: '如果图表仍显示不全，请在命令面板运行“刷新所有 Mermaid 图表”。',
    usageExport: '导出 PDF 时，横向页面通常能获得最佳效果。',
    refreshSettingName: '立即刷新当前页面的所有 Mermaid',
    refreshSettingDesc: '遇到渲染异常时手动触发。',
    refreshButtonText: '刷新',
    refreshButtonNotice: '已刷新所有 Mermaid 图表'
  }
};

function normalizeLanguage(language) {
  return language === 'zh' ? 'zh' : 'en';
}

function t(settings, key) {
  const language = normalizeLanguage(settings && settings.language);
  return STRINGS[language][key] || STRINGS.en[key] || key;
}

class MermaidFitPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.syncBodyClasses();

    this.registerMarkdownPostProcessor((element) => {
      this.fitMermaidInElement(element);
    });

    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.fitAllMermaid();
      })
    );

    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        setTimeout(() => this.fitAllMermaid(), 300);
      })
    );

    this.addCommand({
      id: 'refresh-all-mermaid',
      name: t(this.settings, 'refreshCommand'),
      callback: () => {
        this.fitAllMermaid();
        new Notice(t(this.settings, 'refreshedNotice'));
      }
    });

    this.addCommand({
      id: 'scale-mermaid-to-fit',
      name: t(this.settings, 'scaleCommand'),
      callback: () => {
        this.scaleAllMermaidToFit();
        new Notice(t(this.settings, 'scaledNotice'));
      }
    });

    this.addSettingTab(new MermaidFitSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => this.fitAllMermaid(), 500);
    });
  }

  onunload() {
    this.getActiveDocument().body.classList.remove(
      'mermaid-fit-enabled',
      'mermaid-fit-scroll-enabled',
      'mermaid-fit-export-enabled'
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.language = normalizeLanguage(this.settings.language);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getActiveDocument() {
    return this.app.workspace.activeDocument || globalThis.document;
  }

  syncBodyClasses() {
    const { body } = this.getActiveDocument();
    body.classList.toggle('mermaid-fit-enabled', true);
    body.classList.toggle('mermaid-fit-scroll-enabled', this.settings.enableScroll);
    body.classList.toggle('mermaid-fit-export-enabled', this.settings.enableExportScale);
  }

  /**
   * Fit every Mermaid block inside a rendered element.
   */
  fitMermaidInElement(element) {
    const mermaids = element.querySelectorAll('.mermaid');
    mermaids.forEach(mermaid => {
      this.fitSingleMermaid(mermaid);
    });
  }

  /**
   * Fit a single Mermaid container.
   */
  fitSingleMermaid(mermaid) {
    if (!mermaid) return;

    const svg = mermaid.querySelector('svg');
    if (!svg) return;

    mermaid.classList.add('mermaid-export-fit-managed');
    svg.classList.add('mermaid-export-fit-svg');
    mermaid.classList.remove('mermaid-export-fit-scaled');
    mermaid.classList.toggle('mermaid-export-fit-scrollable', this.settings.enableScroll);

    if (this.settings.enableExportScale) {
      mermaid.setAttribute('data-mermaid-fit', 'true');
    } else {
      mermaid.removeAttribute('data-mermaid-fit');
    }
  }

  /**
   * Refresh every Mermaid block in the current workspace.
   */
  fitAllMermaid() {
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    leaves.forEach(leaf => {
      if (leaf.view && leaf.view.containerEl) {
        this.fitMermaidInElement(leaf.view.containerEl);
      }
    });

    const mermaids = this.getActiveDocument().querySelectorAll('.mermaid');
    mermaids.forEach(m => this.fitSingleMermaid(m));
  }

  /**
   * Force every Mermaid SVG to fit the container width.
   */
  scaleAllMermaidToFit() {
    const mermaids = this.getActiveDocument().querySelectorAll('.mermaid');
    mermaids.forEach(mermaid => {
      if (mermaid.querySelector('svg')) {
        mermaid.classList.add('mermaid-export-fit-scaled');
      }
    });
  }
}

/**
 * Settings tab
 */
class MermaidFitSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(PLUGIN_NAME)
      .setDesc(t(this.plugin.settings, 'settingsDesc'))
      .setHeading()
      .addExtraButton((button) => button
        .setIcon('globe')
        .setTooltip(t(this.plugin.settings, 'languageButtonLabel'))
        .onClick(async () => {
          const currentLanguage = normalizeLanguage(this.plugin.settings.language);
          this.plugin.settings.language = currentLanguage === 'en' ? 'zh' : 'en';
          await this.plugin.saveSettings();
          this.display();
          new Notice(t(this.plugin.settings, 'languageChanged'));
        }));

    new Setting(containerEl)
      .setName(t(this.plugin.settings, 'enableScrollName'))
      .setDesc(t(this.plugin.settings, 'enableScrollDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableScroll)
        .onChange(async (value) => {
          this.plugin.settings.enableScroll = value;
          await this.plugin.saveSettings();
          this.plugin.syncBodyClasses();
          this.plugin.fitAllMermaid();
        }));

    new Setting(containerEl)
      .setName(t(this.plugin.settings, 'exportScaleName'))
      .setDesc(t(this.plugin.settings, 'exportScaleDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableExportScale)
        .onChange(async (value) => {
          this.plugin.settings.enableExportScale = value;
          await this.plugin.saveSettings();
          this.plugin.syncBodyClasses();
          this.plugin.fitAllMermaid();
        }));

    new Setting(containerEl)
      .setName(t(this.plugin.settings, 'usageTitle'))
      .setHeading();

    const ul = containerEl.createEl('ul');
    ul.createEl('li', { text: t(this.plugin.settings, 'usageNoConfig') });
    ul.createEl('li', { text: t(this.plugin.settings, 'usageRefresh') });
    ul.createEl('li', { text: t(this.plugin.settings, 'usageExport') });

    new Setting(containerEl)
      .setName(t(this.plugin.settings, 'refreshSettingName'))
      .setDesc(t(this.plugin.settings, 'refreshSettingDesc'))
      .addButton(button => button
        .setButtonText(t(this.plugin.settings, 'refreshButtonText'))
        .setCta()
        .onClick(() => {
          this.plugin.fitAllMermaid();
          new Notice(t(this.plugin.settings, 'refreshButtonNotice'));
        }));
  }
}

module.exports = MermaidFitPlugin;
