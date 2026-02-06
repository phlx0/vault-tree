import {
  Plugin,
  ItemView,
  WorkspaceLeaf,
  TAbstractFile,
  TFile,
  TFolder,
} from "obsidian";

const VIEW_TYPE_VAULT_TREE = "vault-tree-view";

/* ---------------- TREE BUILDING ---------------- */

function buildTree(files: TAbstractFile[]) {
  const root: any = {};

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (!current[part]) {
        current[part] = {
          __children: {},
          __file: null,
        };
      }

      if (i === parts.length - 1) {
        current[part].__file = file;
      }

      current = current[part].__children;
    }
  }

  return root;
}

/* ---------------- VIEW ---------------- */

class VaultTreeView extends ItemView {
  tree: any;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_VAULT_TREE;
  }

  getDisplayText() {
    return "Vault Tree";
  }

  async onOpen() {
    this.contentEl.addClass("vault-tree");
    this.build();
  }

  build() {
    const files = this.app.vault.getAllLoadedFiles();
    this.tree = buildTree(files);

    this.contentEl.empty();
    this.contentEl.addClass("vault-tree");

    this.renderTree(this.tree, this.contentEl);
  }

  renderTree(node: any, container: HTMLElement) {
    const ul = container.createEl("ul");

    const keys = Object.keys(node).sort((a, b) => {
      const aIsFile = node[a].__file instanceof TFile;
      const bIsFile = node[b].__file instanceof TFile;
      return Number(aIsFile) - Number(bIsFile) || a.localeCompare(b);
    });

    for (const key of keys) {
      const li = ul.createEl("li");
      const item = node[key];

      const label = li.createEl("span", { text: key });

      if (item.__file instanceof TFile) {
        label.addClass("vault-tree-file");
        label.onclick = () => {
          this.app.workspace.openLinkText(item.__file.path, "", false);
        };
      } else {
        label.addClass("vault-tree-folder");
      }

      this.renderTree(item.__children, li);
    }
  }
}

/* ---------------- PLUGIN ---------------- */

export default class VaultTreePlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE_VAULT_TREE, (leaf) => new VaultTreeView(leaf));

    this.addRibbonIcon("list-tree", "Open Vault Tree", () => {
      this.activateView();
    });

    this.addRibbonIcon("file-plus", "Generate TOC files", () => {
      this.generateAllTocs();
    });

    this.registerEvent(this.app.vault.on("create", () => this.refresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.refresh()));
    this.registerEvent(this.app.vault.on("rename", () => this.refresh()));
  }

  async activateView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_TREE);

    if (leaves.length > 0) {
      for (const leaf of leaves) {
        leaf.detach();
      }
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(true);
    await leaf.setViewState({
      type: VIEW_TYPE_VAULT_TREE,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
  }

  refresh() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_TREE);

    for (const leaf of leaves) {
      (leaf.view as VaultTreeView).build();
    }
  }

  /* ---------------- TOC FILE GENERATION ---------------- */

  async generateAllTocs() {
    const root = this.app.vault.getRoot();
    await this.processFolder(root);
  }

  async processFolder(folder: TFolder) {
    const files: TFile[] = [];
    const subfolders: TFolder[] = [];

    for (const child of folder.children) {
      if (child instanceof TFile && child.name !== "table-of-content.md") {
        files.push(child);
      } else if (child instanceof TFolder) {
        subfolders.push(child);
      }
    }

    const content = this.buildTocContent(folder, files, subfolders);

    const tocPath =
      folder.path === "/"
        ? "table-of-content.md"
        : `${folder.path}/table-of-content.md`;

    await this.upsertFile(tocPath, content);

    for (const sub of subfolders) {
      await this.processFolder(sub);
    }
  }

  buildTocContent(
    folder: TFolder,
    files: TFile[],
    subfolders: TFolder[],
  ): string {
    let md = `# ${folder.name}\n\n`;

    if (files.length) {
      md += `## Files\n`;

      for (const file of files) {
        md += `- [[${file.path}]]\n`;
      }

      md += `\n`;
    }

    if (subfolders.length) {
      md += `## Subfolders\n`;
      for (const sub of subfolders) {
        md += `- [[${sub.path}/table-of-content]]\n`;
      }
    }

    return md;
  }

  async upsertFile(path: string, content: string) {
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }
}
