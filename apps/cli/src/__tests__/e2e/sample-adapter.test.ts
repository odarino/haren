// src/__tests__/e2e/sample-adapter.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { tmpdir } from "os";

const TOOLS = resolve(import.meta.dir, "../../../../../examples/adapters/sample/tools");

const IR = `<screen id="SCR_X001">
  <field name="a" bind="ORDER_TBL.ORDER_NO"/>
  <writes table="ORDER_LOG"/>
</screen>
`;

const tool = async (name: string, args: string[]) => {
  const proc = Bun.spawn(["bun", join(TOOLS, `${name}.ts`), ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "haren-sample-tools-"));
  await writeFile(join(dir, "ir.xml"), IR);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("sample adapter tools", () => {
  it("fail with a usage message when a flag is absent", async () => {
    for (const [name, args] of [
      ["inventory", []],
      ["extract", ["SCR_X001"]],
      ["extract", ["SCR_X001", "--root"]],
      ["gate", [join(dir, "spec.md")]],
    ] as const) {
      const r = await tool(name, [...args]);
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/^error: Usage:/m);
    }
  });

  it("gate matches a binding as a whole token only", async () => {
    const spec = (bind: string) =>
      writeFile(join(dir, "spec.md"), `# X\n\n## Writes\n- ORDER_LOG\n\n## Bindings\n- ${bind}\n`);
    const run = async () =>
      JSON.parse((await tool("gate", [join(dir, "spec.md"), "--ir", dir])).stdout);

    await spec("ORDER_TBL.ORDER_NO2");
    let r = await run();
    expect(r.pass).toBe(false);
    expect(r.findings[0].rule).toBe("missing-binding");

    await spec("XORDER_TBL.ORDER_NO");
    expect((await run()).pass).toBe(false);

    await spec("ORDER_TBL.ORDER_NO");
    r = await run();
    expect(r.pass).toBe(true);
  });
});
