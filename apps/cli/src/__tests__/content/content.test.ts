import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const CONTENT = resolve(import.meta.dir, "..", "..", "..", "..", "..", "content");
const read = (rel: string) => readFileSync(resolve(CONTENT, rel), "utf-8");

describe("content: implement and developer", () => {
  for (const rel of ["skills/implement/SKILL.md", "agents/developer.md"]) {
    it(`${rel} uses per-repo branches and commits`, () => {
      const text = read(rel);
      expect(text).toContain("feat/{module-slug}");
      expect(text).toContain("lastCommit.<repoKey>");
      expect(text).toContain('skill.md "Repos and Git"');
      expect(text).toContain("Never push");
      expect(text).toContain("Changes inside the haren folder do not count");
      expect(text).toContain("two commits on the same branch");
      expect(text).not.toContain("one commit that holds both");
      expect(text).not.toMatch(/(^|[\s`])haren\//m);
      expect(text).toContain("set it to `implementing`");
      expect(text).toContain("or from the current branch if `default_branch` is not set");
      expect(text).toContain("make one code commit for all repo keys");
    });
  }
});

describe("content: read-context and update-tracking", () => {
  for (const rel of ["skills/read-context/SKILL.md", "skills/update-tracking/SKILL.md"]) {
    it(`${rel} checks git per repo key`, () => {
      const text = read(rel);
      expect(text).toContain('skill.md "Repos and Git"');
      expect(text).toContain("lastCommit.<repoKey>");
      expect(text).toContain("git -C <repo>");
      expect(text).toContain("`default`");
    });
  }
  it("update-tracking tests ancestry and read-context reports the haren repo", () => {
    expect(read("skills/update-tracking/SKILL.md")).toContain("merge-base --is-ancestor");
    expect(read("skills/read-context/SKILL.md")).toContain("Haren repo:");
  });
  it("read-context checks only active modules and handles a missing branch", () => {
    const text = read("skills/read-context/SKILL.md");
    expect(text).toContain("`implementing` or `evaluating`");
    expect(text).toContain("merged or deleted?");
  });
  it("developer points to the No repos listed fallback", () => {
    expect(read("agents/developer.md")).toContain('"No repos listed" fallback');
  });
  it("update-tracking uses the recorded module branch", () => {
    const text = read("skills/update-tracking/SKILL.md");
    expect(text).toContain("the module's recorded `branch`");
  });
  it("onboard handles an empty repos map", () => {
    const text = read("skills/onboard/SKILL.md");
    expect(text).toContain("If `repos` is empty");
    expect(text).toContain("skip this repo");
    expect(text).not.toContain("skip this step");
    expect(text).toContain("No repos listed");
    expect(text).toContain("the key `default`");
  });
  it("onboard handles a detached HEAD and orders the manifest fields", () => {
    const text = read("skills/onboard/SKILL.md");
    expect(text).toContain("detached HEAD at <short sha>");
    expect(text).toContain("git -C <repo> rev-parse --short HEAD");
    expect(text).toContain("Only when `default_branch` is known");
    expect(text).toContain("Do not compare it with a default branch");
    expect(text).toContain("`path`, `remote`, `default_branch`, `role`, `stack`, `test_cmd`");
  });
  it("update-tracking excludes the haren folder with the top pathspec", () => {
    expect(read("skills/update-tracking/SKILL.md")).toContain(
      "':(top,exclude)<haren folder path relative to the repo root>'",
    );
  });
});

describe("content: qa-engineer, ideate, module template", () => {
  it("qa-engineer resolves $FRONTEND and $E2E from the manifest", () => {
    const text = read("agents/qa-engineer.md");
    expect(text).toContain("## Paths");
    expect(text).toContain("role: frontend");
    expect(text).toContain("add a `repos` entry");
    expect(text).toContain("`$FRONTEND/e2e`");
    // no bare cwd-relative paths left
    expect(text).not.toMatch(/(^|[\s`"(])frontend\/src/m);
    expect(text).not.toMatch(/(^|[\s`"(])e2e\//m);
    // the skill folder name must stay intact
    expect(text).toContain(".claude/skills/excel-tc-to-e2e");
    expect(text).toContain("Read the full skill at `$SKILL_DIR/SKILL.md`");
    expect(text).not.toContain("Read the full skill at `.cursor");
    expect(text).toContain("Run every command from the workspace root, except Playwright itself");
  });

  it("ideate and module template do not hard-code the haren folder name", () => {
    expect(read("skills/ideate/SKILL.md")).not.toMatch(/(^|[\s`])haren\//m);
    expect(read("templates/module.md")).toContain(
      "repos: [{repo keys from the manifest `repos` map}]",
    );
  });
});

describe("content: plugin extension points", () => {
  it("skills call the plugin extension points", () => {
    expect(read("skills/read-context/SKILL.md")).toContain("haren plugin run session-start");
    expect(read("skills/plan/SKILL.md")).toContain("haren plugin run after-plan");
    expect(read("skills/update-tracking/SKILL.md")).toContain("haren plugin run on-task-status");
  });
});

describe("content: migration mode", () => {
  it("extract skill has frontmatter name", () => {
    const text = read("skills/extract/SKILL.md");
    expect(text).toMatch(/^---\nname: extract\n/);
    expect(text).toContain("haren migrate gate <unit> --approve");
  });
  for (const t of [
    "unit-map",
    "unit-spec",
    "legacy-semantics",
    "deviation-log",
    "parity-evidence",
  ]) {
    it(`template ${t}.md exists`, () => {
      expect(read(`templates/${t}.md`).length).toBeGreaterThan(0);
    });
  }
  it("discover routes migration mode", () => {
    expect(read("skills/discover/SKILL.md")).toContain("skills/discover/migration.md");
    expect(read("skills/discover/migration.md")).toContain("legacy-semantics.md");
  });
  it("evaluate closes a difference only by fix, parity evidence or approved deviation", () => {
    const text = read("skills/evaluate/SKILL.md");
    expect(text).toContain("Close each difference only by one of these");
    expect(text).toContain("parity-evidence");
    expect(text).toContain("`approved` row in `artifacts/03-modules/deviation-log.md`");
    expect(text).toContain("static-review-only");
  });
  it("implement reads the deviation log and keeps approved deviations", () => {
    const text = read("skills/implement/SKILL.md");
    expect(text).toContain("deviation-log.md");
    expect(text).toContain("Never change behavior that has an `approved` deviation row");
  });
  it("decompose records dependencies with haren track depends", () => {
    expect(read("skills/decompose/SKILL.md")).toContain("haren track depends");
    expect(read("agents/architect.md")).toContain("haren track depends");
  });
  it("decompose registers modules with the CLI and has no hand-written progress.json shape", () => {
    const text = read("skills/decompose/SKILL.md");
    expect(text).toContain("haren track status <module> decomposed --branch feat/<module> --repos");
    expect(text).not.toContain('"currentPhase"');
    expect(text).not.toContain("```json");
    expect(text).not.toContain("Update progress.json");
  });
  it("extract registers the unit spec at spec-draft, before approval", () => {
    const text = read("skills/extract/SKILL.md");
    const draft = text.indexOf("spec-draft");
    const register = text.indexOf("haren track artifact <id> --type unit-spec");
    const approve = text.indexOf("Only after the user approves");
    expect(register).toBeGreaterThan(draft);
    expect(register).toBeLessThan(approve);
    expect(text.split("--type unit-spec").length - 1).toBe(1);
  });
  it("extract explains that a blocked unit skips the gate.json check", () => {
    const text = read("skills/extract/SKILL.md");
    expect(text).toContain("`blocked`");
    expect(text).toContain("skips the `gate.json` check");
  });
  it("update-tracking lists depends, the adapter timeout and the gate demotion", () => {
    const text = read("skills/update-tracking/SKILL.md");
    expect(text).toContain("haren track depends");
    expect(text).toContain("HAREN_ADAPTER_TIMEOUT_MS");
    expect(text).toContain("`spec-draft`");
  });
});

describe("content: discover registers the context brief once", () => {
  for (const rel of [
    "skills/discover/migration.md",
    "skills/discover/blueprint.md",
    "skills/discover/explore.md",
    "skills/discover/inherit.md",
  ]) {
    it(`${rel} leaves registration to discover/SKILL.md`, () => {
      const text = read(rel);
      expect(text).toContain("discover/SKILL.md step 6 registers the context brief");
      expect(text).not.toContain("--type context-brief");
    });
  }
  it("discover SKILL registers it with a resolved ID", () => {
    const text = read("skills/discover/SKILL.md");
    expect(text).toContain("resolve-next-id");
    expect(text).toContain(
      "haren track artifact <id> --type context-brief --path artifacts/02-discovery/context-brief.md",
    );
  });
  it("migration runs track check after the registration step", () => {
    expect(read("skills/discover/migration.md")).toContain("After step 6 of `discover/SKILL.md`");
  });
});

describe("content: migration notes from retest", () => {
  const PATH_RULE =
    "Resolve repo paths in manifest.yaml from the haren folder, not from the workspace root.";
  it("extract and migration.md say repo paths are relative to the haren folder", () => {
    expect(read("skills/extract/SKILL.md")).toContain(PATH_RULE);
    expect(read("skills/discover/migration.md")).toContain(PATH_RULE);
  });
  it("resolve-next-id lists unit-spec and legacy-semantics formats", () => {
    const text = read("skills/resolve-next-id/SKILL.md");
    expect(text).toContain("UNITSPEC-<unit>");
    expect(text).toContain("LSEM-NNN");
  });
  it("migration.md copies semantics from the installed plugin", () => {
    const text = read("skills/discover/migration.md");
    expect(text).toContain("<haren>/.plugins/<adapter>/");
    expect(text).toContain("adapter.semantics");
    expect(text).toContain("LSEM-NNN");
  });
  it("extract uses the UNITSPEC id", () => {
    expect(read("skills/extract/SKILL.md")).toContain("UNITSPEC-<unit>");
  });
});

describe("content: extract exit codes", () => {
  it("puts exit code 3 at the gate step, once", () => {
    const text = read("skills/extract/SKILL.md");
    expect(text.match(/Exit code 3/g)?.length).toBe(1);
    expect(text).toContain("Go to step 6");
    expect(text.indexOf("Exit code 3")).toBeLessThan(text.indexOf("6. Show the spec"));
  });
});

describe("content: no hand edit of progress.json", () => {
  it("no skill or agent tells the agent to update progress.json by hand", () => {
    const { readdirSync, statSync } = require("fs");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = resolve(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name.endsWith(".md")) files.push(full);
      }
    };
    walk(resolve(CONTENT, "skills"));
    walk(resolve(CONTENT, "agents"));
    const bad = /^\s*(\d+\.|-)?\s*\**(update|edit|write|ensure)\**\s+(the\s+)?`?progress\.json/im;
    for (const file of files) {
      expect(`${file}: ${bad.test(readFileSync(file, "utf-8"))}`).toBe(`${file}: false`);
    }
    expect(read("skills/plan/SKILL.md")).toContain(
      "Check that `currentIteration` in progress.json is 1",
    );
  });

  it("ships the visual-companion and ui-review skills", () => {
    const vc = read("skills/visual-companion/SKILL.md");
    expect(vc).toContain("name: visual-companion");
    for (const s of ["haren companion start --open", "haren companion status", "haren track ui-mode browser", "state_dir/events", "waiting.html", "?key="]) expect(vc).toContain(s);
    const ur = read("skills/ui-review/SKILL.md");
    expect(ur).toContain("name: ui-review");
    for (const s of ["blocker", "major", "minor", "## UI Review", "empty", "loading", "contrast"]) expect(ur).toContain(s);
  });
});

describe("content: ui modes wired into skills", () => {
  it("wires ui modes into plan, generate-mockup, evaluate and validate-artifact", () => {
    const gm = read("skills/generate-mockup/SKILL.md");
    expect(gm).toContain("ui.mockups");
    expect(gm).not.toContain("mockups/{screen-slug}.html");
    const plan = read("skills/plan/SKILL.md");
    for (const s of ["ui.mockups", "ui-review", "## UI Review", "Never skip the UI review for a changed screen."]) expect(plan).toContain(s);
    const ev = read("skills/evaluate/SKILL.md");
    for (const s of [".compare", "ui-review", "Rebuild the chosen option from the ASCII wireframe in design.md with the HTML mock elements.", "An open blocker (no fix and not 'accepted by user') is a fail.", "skipped and why", "On `ask`, follow the offer in the visual-companion skill"]) expect(ev).toContain(s);
    expect(gm.indexOf("### Mode")).toBeLessThan(gm.indexOf("### Options mode"));
    expect(gm).toContain("write the chosen option as ASCII into design.md");
    expect(plan).toContain("run the `ui-review` skill again");
    expect(read("skills/validate-artifact/SKILL.md")).toContain("## UI Review");
    expect(read("templates/design.md")).toContain("## UI Review");
    expect(read("templates/design.md")).toContain("| ID | Screen | Heuristic | Severity | Finding | Fix |");
    expect(read("skills/ideate/SKILL.md")).toContain("visual-companion");
    expect(read("skills/discover/SKILL.md")).toContain("visual-companion");
    expect(read("skills/read-context/SKILL.md")).toContain("ui.mockups");
  });
  it("init skill.md mentions the ui mode", () => {
    const init = readFileSync(resolve(import.meta.dir, "..", "..", "commands", "init.ts"), "utf-8");
    expect(init).toContain("Visual questions follow the ui mode in manifest.yaml");
  });
});

describe("content: migration ID and plugin rules", () => {
  it("migration.md copies only from the installed plugin", () => {
    const m = read("skills/discover/migration.md");
    expect(m).toContain("Do not copy from the adapter source folder.");
    expect(m).toContain("the haren folder");
  });
  it("resolve-next-id scopes numbering and covers LSEM", () => {
    const r = read("skills/resolve-next-id/SKILL.md");
    expect(r).toContain("numbered types");
    expect(r).toContain("normally LSEM-001");
  });
});
