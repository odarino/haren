import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, readFile, chmod, realpath } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

const SCRIPT = resolve(import.meta.dir, "..", "..", "..", "..", "..", "install.sh");
let dir: string;
let bin: string;
let log: string;

async function stub(name: string, body: string) {
  const path = join(bin, name);
  await writeFile(path, `#!/bin/bash\necho "${name} $*" >> "${log}"\n${body}\n`);
  await chmod(path, 0o755);
}

async function run(env: Record<string, string>, cwd = dir) {
  const proc = Bun.spawn(["/bin/bash", SCRIPT], {
    cwd,
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: dir, ...env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const calls = existsSync(log) ? await readFile(log, "utf-8") : "";
  return { out, err, code, calls };
}

beforeEach(async () => {
  // realpath: on macOS tmpdir is a symlink, but bash reports the physical $PWD
  dir = await realpath(await mkdtemp(join(tmpdir(), "haren-install-")));
  bin = join(dir, "bin");
  log = join(dir, "calls.log");
  await mkdir(bin);
  await stub("uname", 'if [ "$1" = "-s" ]; then echo Darwin; else echo arm64; fi');
  await stub("bun", 'if [ "$1" = "pm" ]; then dirname "$0"; fi');
  await stub("haren", "");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("install.sh", () => {
  it("installs the pinned version and prints next steps when there is no terminal", async () => {
    const r = await run({ HAREN_VERSION: "1.2.0", HAREN_INSTALL_TTY: join(dir, "no-such-tty") });
    expect(r.code).toBe(0);
    expect(r.calls).toContain("bun add -g @odarino/haren@1.2.0");
    expect(r.calls).not.toContain("haren init");
    expect(r.out).toContain("haren init");
  });

  it("defaults to latest and skips the prompt in CI", async () => {
    const tty = join(dir, "tty");
    await writeFile(tty, "\n");
    const r = await run({ CI: "true", HAREN_INSTALL_TTY: tty });
    expect(r.code).toBe(0);
    expect(r.calls).toContain("bun add -g @odarino/haren@latest");
    expect(r.calls).not.toContain("haren init");
  });

  it("treats CI=false, CI=0 and an empty CI as not CI", async () => {
    const tty = join(dir, "tty");
    for (const ci of ["false", "FALSE", "0", ""]) {
      await writeFile(tty, "~/shop\n");
      if (existsSync(log)) await rm(log);
      const r = await run({ CI: ci, HAREN_INSTALL_TTY: tty });
      expect(r.code).toBe(0);
      expect(r.calls).toContain(`haren init --dir ${dir}/shop`);
    }
  });

  it("fails for a ~user path", async () => {
    const tty = join(dir, "tty");
    await writeFile(tty, "~bob/x\n");
    const r = await run({ HAREN_INSTALL_TTY: tty });
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("Use a full path, for example /home/bob/x");
    expect(r.calls).not.toContain("haren init");
  });

  it("fails clearly when HOME is not set", async () => {
    const tty = join(dir, "tty");
    await writeFile(tty, "~/shop\n");
    const proc = Bun.spawn(["/bin/bash", SCRIPT], {
      cwd: dir,
      env: { PATH: `${bin}:/usr/bin:/bin`, HAREN_INSTALL_TTY: tty },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    expect(code).not.toBe(0);
    expect(err).toContain("HOME is not set");
    expect(err).not.toContain("unbound variable");
  });

  it("asks for the workspace path on the terminal and runs haren init --dir", async () => {
    const tty = join(dir, "tty");
    await writeFile(tty, "~/shop\n");
    const r = await run({ HAREN_INSTALL_TTY: tty });
    expect(r.code).toBe(0);
    expect(r.calls).toContain(`haren init --dir ${dir}/shop`);
  });

  it("uses the current folder when the answer is empty", async () => {
    const tty = join(dir, "tty");
    await writeFile(tty, "\n");
    const work = join(dir, "work");
    await mkdir(work);
    const r = await run({ HAREN_INSTALL_TTY: tty }, work);
    expect(r.code).toBe(0);
    expect(r.calls).toContain(`haren init --dir ${work}\n`);
  });

  it("asks again instead of defaulting to the home folder", async () => {
    const tty = join(dir, "tty");
    await writeFile(tty, "\nproj\n");
    const r = await run({ HAREN_INSTALL_TTY: tty });
    expect(r.code).toBe(0);
    expect(r.calls).toContain(`haren init --dir ${dir}/proj\n`);
  });

  it("strips surrounding quotes and drag-and-drop backslashes from the answer", async () => {
    const tty = join(dir, "tty");
    await writeFile(tty, '  "~/my proj"  \n');
    const r = await run({ HAREN_INSTALL_TTY: tty });
    expect(r.code).toBe(0);
    expect(r.calls).toContain(`haren init --dir ${dir}/my proj\n`);

    await rm(log);
    await writeFile(tty, "~/my\\ proj\n");
    const r2 = await run({ HAREN_INSTALL_TTY: tty });
    expect(r2.calls).toContain(`haren init --dir ${dir}/my proj\n`);
  });

  it("runs the haren that bun installed, not an older one earlier on PATH", async () => {
    const old = join(dir, "old-bin");
    await mkdir(old);
    await writeFile(join(old, "haren"), `#!/bin/bash\necho "old-haren $*" >> "${log}"\n`);
    await chmod(join(old, "haren"), 0o755);
    const tty = join(dir, "tty");
    await writeFile(tty, "~/shop\n");
    const r = await run({ HAREN_INSTALL_TTY: tty, PATH: `${old}:${bin}:/usr/bin:/bin` });
    expect(r.code).toBe(0);
    expect(r.calls).toContain(`haren init --dir ${dir}/shop`);
    expect(r.calls).not.toContain("old-haren");
    expect(r.out).toContain(`export PATH="${bin}:$PATH"`);
  });

  it("fails clearly when bun did not install the haren binary", async () => {
    await rm(join(bin, "haren"));
    const tty = join(dir, "tty");
    await writeFile(tty, "~/shop\n");
    const r = await run({ HAREN_INSTALL_TTY: tty });
    expect(r.code).not.toBe(0);
    expect(r.err).toContain(`haren was not found in ${bin}`);
  });

  it("expands a bare ~", async () => {
    const tty = join(dir, "tty");
    await writeFile(tty, "~\n");
    const r = await run({ HAREN_INSTALL_TTY: tty });
    expect(r.code).toBe(0);
    expect(r.calls).toContain(`haren init --dir ${dir}\n`);
  });

  it("fails when the Bun installer download fails", async () => {
    await rm(join(bin, "bun"));
    await stub("curl", "exit 22");
    const r = await run({ HAREN_INSTALL_TTY: join(dir, "no-such-tty") });
    expect(r.code).not.toBe(0);
    expect(r.calls).not.toContain("bun add");
  });

  it("installs Bun with the official installer when bun is missing", async () => {
    await rm(join(bin, "bun"));
    // fake curl prints a script that "installs" bun into $HOME/.bun/bin
    await stub(
      "curl",
      `cat <<'EOS'\nmkdir -p "$HOME/.bun/bin"\nprintf '#!/bin/bash\\necho "bun $*" >> "${log}"\\n' > "$HOME/.bun/bin/bun"\nchmod +x "$HOME/.bun/bin/bun"\nEOS`,
    );
    const r = await run({ HAREN_INSTALL_TTY: join(dir, "no-such-tty") });
    expect(r.code).toBe(0);
    expect(r.calls).toContain("curl -fsSL https://bun.sh/install");
    expect(r.calls).toContain("bun add -g @odarino/haren@latest");
  });

  it("refuses an unsupported OS", async () => {
    await stub("uname", 'if [ "$1" = "-s" ]; then echo FreeBSD; else echo amd64; fi');
    const r = await run({ HAREN_INSTALL_TTY: join(dir, "no-such-tty") });
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("Unsupported");
    expect(r.calls).not.toContain("bun add");
  });

  it("passes shellcheck and stays under 100 lines", async () => {
    const text = await readFile(SCRIPT, "utf-8");
    expect(text.split("\n").length).toBeLessThan(100);
    const sc = Bun.spawnSync(["shellcheck", SCRIPT]);
    expect(sc.exitCode).toBe(0);
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    expect(lines[lines.length - 1]).toBe('main "$@"');
  });
});
