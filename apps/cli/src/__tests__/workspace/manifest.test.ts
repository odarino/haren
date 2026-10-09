import { describe, it, expect } from "bun:test";
import {
  parseManifest,
  hasMarker,
  normalizeRepos,
  renderReposBlock,
  replaceTopLevelBlock,
  migrateManifestText,
  buildManifestText,
} from "../../workspace/manifest";

const LEGACY = `project: shop
mode: explore
language: English

repos:
  # Add your repos here (relative paths from this directory)
  - ../backend
  - ../frontend

sources:
  # docs: ./artifacts/00-baseline/requirements.pdf

hooks:
  # on-phase-complete:
`;

describe("parseManifest / hasMarker", () => {
  it("detects the marker", () => {
    expect(hasMarker(parseManifest(`haren:\n  version: "1.2.0"\nproject: x\n`))).toBe(true);
  });
  it("rejects a manifest without the marker", () => {
    expect(hasMarker(parseManifest(LEGACY))).toBe(false);
  });
  it("returns {} for empty or non-map YAML", () => {
    expect(parseManifest("")).toEqual({});
    expect(parseManifest("- a\n- b\n")).toEqual({});
  });
});

describe("normalizeRepos", () => {
  it("converts a list of paths to a map keyed by folder name", () => {
    expect(normalizeRepos(["../backend", "../web/frontend"])).toEqual({
      backend: { path: "../backend" },
      frontend: { path: "../web/frontend" },
    });
  });
  it("keeps a map and accepts string values", () => {
    expect(
      normalizeRepos({ api: { path: "../api", remote: "git@x:a/api.git" }, web: "../web" }),
    ).toEqual({
      api: { path: "../api", remote: "git@x:a/api.git" },
      web: { path: "../web" },
    });
  });
  it("returns {} for null", () => {
    expect(normalizeRepos(null)).toEqual({});
  });
});

describe("renderReposBlock", () => {
  it("quotes values that need quoting and skips empty fields", () => {
    const text = renderReposBlock({
      backend: { path: "../backend", remote: "git@github.com:acme/b.git", test_cmd: "bun test" },
    });
    expect(text).toBe(
      'repos:\n  backend:\n    path: ../backend\n    remote: "git@github.com:acme/b.git"\n    test_cmd: "bun test"\n',
    );
    expect(normalizeRepos(parseManifest(text).repos)).toEqual({
      backend: { path: "../backend", remote: "git@github.com:acme/b.git", test_cmd: "bun test" },
    });
  });
  it("renders a commented example for an empty map", () => {
    expect(parseManifest(renderReposBlock({})).repos).toBeNull();
  });
});

describe("replaceTopLevelBlock", () => {
  it("replaces only the named block and keeps the blank line after it", () => {
    const out = replaceTopLevelBlock(LEGACY, "repos", "repos:\n  api:\n    path: ../api\n");
    expect(out).toContain("repos:\n  api:\n    path: ../api\n\nsources:");
    expect(out).not.toContain("- ../backend");
  });
  it("appends the block when the key is missing", () => {
    expect(replaceTopLevelBlock("project: x\n", "repos", "repos:\n  a:\n    path: ../a\n")).toBe(
      "project: x\n\nrepos:\n  a:\n    path: ../a\n",
    );
  });
});

describe("migrateManifestText", () => {
  it("adds marker and layout, converts repos, keeps comments elsewhere", () => {
    const out = migrateManifestText(LEGACY, {
      version: "1.2.0",
      layout: "workspace",
      repos: normalizeRepos(parseManifest(LEGACY).repos),
    });
    const m = parseManifest(out);
    expect(hasMarker(m)).toBe(true);
    expect(m.layout).toBe("workspace");
    expect(normalizeRepos(m.repos)).toEqual({
      backend: { path: "../backend" },
      frontend: { path: "../frontend" },
    });
    expect(out).toContain("# docs: ./artifacts/00-baseline/requirements.pdf");
    expect(out.startsWith('haren:\n  version: "1.2.0"\nlayout: workspace\n')).toBe(true);
  });
  it("updates the version and keeps an existing layout", () => {
    const out = migrateManifestText(`haren:\n  version: "1.1.0"\nlayout: monorepo\nproject: x\n`, {
      version: "1.2.0",
      layout: "workspace",
    });
    expect(out).toBe(`haren:\n  version: "1.2.0"\nlayout: monorepo\nproject: x\n`);
  });
});

describe("buildManifestText", () => {
  it("builds a v2 manifest with marker, layout and repos", () => {
    const text = buildManifestText({
      version: "1.2.0",
      layout: "workspace",
      project: "shop",
      mode: "explore",
      language: "English",
      repos: { backend: { path: "../backend", remote: "git@github.com:acme/b.git" } },
      iterations: { duration: "2 weeks", startDate: "2026-10-09", demoDay: "Friday" },
    });
    const m = parseManifest(text);
    expect(hasMarker(m)).toBe(true);
    expect(m.layout).toBe("workspace");
    expect(m.project).toBe("shop");
    expect(text).toContain("project: shop");
    expect(text).toContain("mode: explore");
    expect(normalizeRepos(m.repos).backend.remote).toBe("git@github.com:acme/b.git");
    expect((m.iterations as { enabled: boolean }).enabled).toBe(true);
  });

  it("keeps special scalar values as strings on round-trip", () => {
    const text = buildManifestText({
      version: "1.2.0",
      layout: "workspace",
      project: "my: app #1",
      mode: "explore",
      language: "yes",
      repos: {},
      iterations: { duration: "2 weeks", startDate: "2026-10-09", demoDay: "123" },
    });
    const m = parseManifest(text);
    expect(m.project).toBe("my: app #1");
    expect(m.language).toBe("yes");
    expect((m.haren as { version: unknown }).version).toBe("1.2.0");
    const it2 = m.iterations as { duration: unknown; start_date: unknown; demo_day: unknown };
    expect(it2.duration).toBe("2 weeks");
    expect(it2.start_date).toBe("2026-10-09");
    expect(it2.demo_day).toBe("123");
  });
});

describe("yamlScalar via renderReposBlock", () => {
  it("quotes values that YAML would read as numbers or special tokens", () => {
    const repos = {
      a: { path: "123" },
      b: { path: "-" },
      c: { path: ".hidden" },
      d: { path: "-1" },
    };
    const parsed = normalizeRepos(parseManifest(renderReposBlock(repos)).repos);
    expect(parsed).toEqual(repos);
  });
});
