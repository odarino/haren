# Writing a haren plugin

A haren plugin installs a tool and sets it up in the project. It connects the tool to the haren workflow through hooks.

## Install a plugin

```bash
haren plugin add backlog                       # official registry name
haren plugin add npm:@scope/haren-plugin-x     # npm package
haren plugin add git:https://github.com/a/b#v1 # git repo, optional ref
haren plugin add file:../my-plugin             # local folder
haren init --plugin backlog                    # during init
```

haren asks for confirmation when the source is not in the registry. Hooks run as code with your user permissions.

Use `-y` or `--yes` to answer all confirmations with yes.

haren installs in this order:

1. It fetches the plugin into a staging folder.
2. It checks each `requires` entry. If a tool is missing and has an `install` command, haren asks before it runs the command.
3. It runs each `setup` command.
4. It registers the plugin in `haren/plugins.json`.

If a step fails, haren does not register the plugin.

## Package layout

```
my-plugin/
  haren-plugin.json
  package.json         (npm source only)
  hooks/
  skills/<skill>/SKILL.md
  agents/<agent>.md
```

## `haren-plugin.json`

| Field              | Required                   | Notes                                                                            |
| ------------------ | -------------------------- | -------------------------------------------------------------------------------- |
| `name`             | yes                        | kebab-case                                                                       |
| `version`          | git and file: yes. npm: no | npm takes the version from `package.json`. A different value fails.              |
| `harenApi`         | yes                        | `"1"`                                                                            |
| `description`      | no                         |                                                                                  |
| `requires`         | no                         | `[{ "bin", "version"?: semver range, "install"?: command }]`                     |
| `setup`            | no                         | Commands that run once in the project root. `{{project}}` is the project name.   |
| `hooks`            | no                         | `{ "<hook>": "<command>" }`. The command runs in the plugin folder.              |
| `config`           | no                         | Default values. Users override them in `haren/plugins.json`.                     |
| `skills`, `agents` | no                         | Paths. haren copies them to `.claude/` and `.cursor/` with the prefix `<name>-`. |

## Hooks

| Hook             | When                                  | Payload                                                                                                     |
| ---------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `session-start`  | `read-context` skill                  | `{ "hook" }`                                                                                                |
| `after-plan`     | `plan` skill, after the plan is final | `{ "hook", "module", "tasksFile", "tasks": [{ "key", "number", "title", "description", "dependencies" }] }` |
| `on-task-status` | `update-tracking` skill               | `{ "hook", "module", "feature", "status" }`                                                                 |

`after-plan` sends `tasksFile` as an absolute path.

The task `key` is the feature key in `progress.json`. Use it in `on-task-status` updates.
If the module has a feature with the same task number, haren sends that key.
If many features have the same task number, haren uses the first one.
haren adds each missing task to `progress.json` as `pending` before it runs the hooks.

Rules for a hook:

- Read the payload as JSON from stdin.
- Print one JSON object to stdout: `{ "messages"?: string[], "updates"?: Update[] }`.
- Exit with code 0 on success.
- Finish in 30 seconds. After that, haren stops the hook.
- Read these environment variables: `HAREN_ROOT`, `HAREN_DIR`, `HAREN_PLUGIN_DIR`, `HAREN_PLUGIN_DATA`, `HAREN_PLUGIN_CONFIG` (JSON).

`HAREN_PLUGIN_DATA` is a folder for plugin state. haren keeps it when it upgrades or removes the plugin.

haren prints each message as `[<plugin>] <message>`.

`Update` is `{ "module", "feature", "status" }`. `status` is one of `pending`, `in-progress`, `evaluating`, `passing`, `fixing`, `blocked`. haren checks the feature transition rules. It skips an invalid update and prints the reason. A plugin must not write haren files.

A failed hook does not stop the haren workflow. haren prints a warning. haren also appends the error to `haren/.plugins/<name>/errors.log`. Run `haren plugin doctor` to see the errors.

`haren plugin run <hook>` always exits with code 0. It exits with a different code only when its arguments are not valid. If haren cannot find the haren folder, it prints `warning: plugin hook <hook> skipped: <message>`.

## Test a plugin locally

```bash
haren plugin add file:../my-plugin -y
haren plugin run session-start
haren plugin doctor
```
