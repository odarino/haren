export interface PlannedTask {
  key: string;
  number: number;
  title: string;
  description: string;
  dependencies: string[];
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Parse a module's tasks.md (content/templates/tasks.md format). */
export function parseTasksFile(text: string): PlannedTask[] {
  const sections = text.split(/^## Task (\d+):[ \t]*(.+)$/m);
  const raw: { number: number; title: string; body: string }[] = [];
  for (let i = 1; i + 2 < sections.length; i += 3) {
    raw.push({
      number: Number(sections[i]),
      title: sections[i + 1]!.trim(),
      body: sections[i + 2] ?? "",
    });
  }
  const keyOf = new Map(raw.map((t) => [t.number, `task-${t.number}-${slugify(t.title)}`]));
  return raw.map((t) => {
    const field = (name: string) =>
      new RegExp(`^\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, "m").exec(t.body)?.[1]?.trim() ?? "";
    const deps = [...field("Dependencies").matchAll(/Task (\d+)/g)]
      .map((m) => keyOf.get(Number(m[1])))
      .filter((k): k is string => k !== undefined);
    return {
      key: keyOf.get(t.number)!,
      number: t.number,
      title: t.title,
      description: field("Description"),
      dependencies: deps,
    };
  });
}
