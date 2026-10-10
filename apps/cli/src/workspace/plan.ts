import { existsSync } from "fs";
import { basename, relative, resolve, sep } from "path";
import { hasGitDir } from "./git";
import type { Layout, RepoEntry } from "./manifest";
import { computeRootFiles, summarizeRootFiles, type Editor } from "./root-files";

export type PlanAction = "create" | "modify" | "keep" | "clone" | "warn";

export interface PlanItem {
  path: string;
  action: PlanAction;
  note?: string;
  remote?: string;
}

export interface Plan {
  rootDir: string;
  harenDirName: string;
  layout: Layout;
  createHaren: boolean;
  items: PlanItem[];
  manifestPreview?: string;
}

export interface PlanInput {
  rootDir: string;
  harenDir: string;
  layout: Layout;
  createHaren: boolean;
  repos: Record<string, RepoEntry>;
  editor: Editor;
  manifestPreview?: string;
}

export async function buildPlan(input: PlanInput): Promise<Plan> {
  const items: PlanItem[] = [];
  const generatedNote = input.layout === "workspace" ? "(generated, not versioned)" : undefined;

  const rootFiles = await computeRootFiles({
    workspaceDir: input.rootDir,
    harenDir: input.harenDir,
    editor: input.editor,
  });
  for (const file of summarizeRootFiles(rootFiles)) {
    const count = file.count ? `(${file.count} files)` : undefined;
    const join = (...notes: (string | undefined)[]) => notes.filter(Boolean).join(" ") || undefined;
    if (!file.existed)
      items.push({ path: file.path, action: "create", note: join(count, generatedNote) });
    else if (file.changed)
      items.push({
        path: file.path,
        action: "modify",
        note: file.userContent ? "(haren block only)" : count,
      });
    else items.push({ path: file.path, action: "keep", note: count });
  }

  for (const [key, repo] of Object.entries(input.repos)) {
    const abs = resolve(input.harenDir, repo.path);
    // Show and clone the repo relative to the workspace root, e.g. "backend".
    const path = relative(input.rootDir, abs).split(sep).join("/") || key;
    if (existsSync(abs)) {
      items.push(
        hasGitDir(abs) || input.layout === "monorepo"
          ? { path, action: "keep" }
          : { path, action: "warn", note: "! not a git repo" },
      );
    } else if (input.layout === "monorepo") {
      items.push({ path, action: "warn", note: "! folder not found" });
    } else if (repo.remote) {
      items.push({ path, action: "clone", remote: repo.remote });
    } else {
      items.push({ path, action: "warn", note: "! cannot clone, no remote" });
    }
  }

  return {
    rootDir: input.rootDir,
    harenDirName: basename(input.harenDir),
    layout: input.layout,
    createHaren: input.createHaren,
    items,
    manifestPreview: input.manifestPreview,
  };
}

const MARKS: Record<PlanAction, string> = {
  create: "+ create",
  modify: "~ modify",
  keep: "= keep",
  clone: "↓ clone",
  warn: "! warn",
};

// Width of the tree prefix plus the name; long names widen the column for all rows.
const MIN_NAME_WIDTH = 28;

function row(
  width: number,
  prefix: string,
  name: string,
  action: PlanAction,
  note?: string,
): string {
  return `  ${prefix}${name.padEnd(width - prefix.length)} ${MARKS[action].padEnd(10)} ${note ?? ""}`.trimEnd();
}

export function renderPlan(plan: Plan): string {
  // Windows paths use backslashes; do not print "C:\\ws/".
  const rootSep = plan.rootDir.includes("\\") ? "\\" : "/";
  const lines: string[] = ["Plan:", `  ${plan.rootDir}${rootSep}`];
  type Row = { name: string; action: PlanAction; note?: string; children?: Row[] };
  const rows: Row[] = [];

  if (plan.createHaren) {
    rows.push({
      name: `${plan.harenDirName}/`,
      action: "create",
      note: plan.layout === "workspace" ? "(git init, own repo)" : undefined,
      children: [
        { name: "manifest.yaml", action: "create", note: `layout: ${plan.layout}` },
        { name: "artifacts/", action: "create" },
        { name: "hooks/", action: "create" },
      ],
    });
  }
  for (const item of plan.items) {
    const note = item.action === "clone" ? `from ${item.remote}` : item.note;
    rows.push({ name: item.path, action: item.action, note });
  }

  // Top-level prefixes are 4 characters wide, child prefixes 8.
  const width = Math.max(
    MIN_NAME_WIDTH,
    ...rows.flatMap((r) => [
      4 + r.name.length,
      ...(r.children ?? []).map((c) => 8 + c.name.length),
    ]),
  );
  rows.forEach((r, i) => {
    const last = i === rows.length - 1;
    lines.push(row(width, last ? "└── " : "├── ", r.name, r.action, r.note));
    r.children?.forEach((c, j) => {
      const branch = j === r.children!.length - 1 ? "└── " : "├── ";
      lines.push(row(width, `${last ? "    " : "│   "}${branch}`, c.name, c.action, c.note));
    });
  });

  if (plan.manifestPreview) {
    lines.push("", "  manifest.yaml preview:");
    for (const line of plan.manifestPreview.trimEnd().split("\n")) lines.push(`    ${line}`);
  }
  return lines.join("\n");
}

export function isNoop(plan: Plan): boolean {
  return (
    !plan.createHaren &&
    plan.items.every((item) => item.action === "keep" || item.action === "warn")
  );
}
