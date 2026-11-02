# Sample adapter

A neutral example adapter for haren migration mode. It reads a fake screen format.

Install it into a migration workspace:

    haren plugin add file:/path/to/examples/adapters/sample

`fixture/legacy_src/` holds three fake screens. Copy it next to the haren folder
as the legacy repo (`role: legacy`, `readOnly: true`).

| Tool                 | Does                                                  |
| -------------------- | ----------------------------------------------------- |
| `tools/inventory.ts` | Lists `*.screen.xml` units with parent, family, title |
| `tools/extract.ts`   | Writes `ir.xml` and `view.txt` for one unit           |
| `tools/gate.ts`      | Rules `missing-binding` and `missing-writes`          |

The tools use plain Bun and TypeScript. They need no npm package.
