🚀 **haren** — agentic SDLC framework · brainstorm → plan → build

> Framework SDLC tối giản, dựa trên skill, dành cho AI coding agent.

`haren` dựng sẵn một workspace có cấu trúc — gồm agents, skills, templates và một file state tự quản lý — để dẫn dắt AI coding agent (Claude Code hoặc Cursor) đi qua một vòng đời phát triển phần mềm có kỷ luật:

`research → discover → decompose → plan → implement → evaluate`

Thay vì để LLM nhảy thẳng vào code, haren bắt buộc một quy trình theo từng giai đoạn: brainstorm và research trước, chia nhỏ thành các module, viết plan, *rồi mới* implement. Kết quả là tốn ít token hơn, ít tính năng làm dở dang hơn, và có một "vết tích" quyết định mà bạn thực sự review được.

━━━━━━━━━━━━━━━━━━━━

🤔 **Vì sao cần haren**

LLM coding agent rất "hăng". Bạn yêu cầu một tính năng là nó bắt đầu viết file ngay khi chưa ai thống nhất *cái gì* đang được xây. haren bổ sung nửa đầu còn thiếu của SDLC và **chặn việc implement cho tới khi đã plan xong** — một module không thể được code cho tới khi đạt trạng thái `planned`. Cổng chặn này do một hook thực thi, không chỉ là một câu prompt, nên kỷ luật vẫn được giữ ngay cả khi model "quên".

Mọi thứ nằm gọn trong một thư mục haren (mặc định là `haren/`, tên nào cũng được) mà bạn có thể đọc, diff và commit.

━━━━━━━━━━━━━━━━━━━━

📋 **Yêu cầu**

• **Bun ≥ 1.2.21** (https://bun.com) — đã cài và có trong `PATH`. haren chạy trên runtime Bun; chỉ có Node.js là không đủ. Trình cài đặt một dòng bên dưới sẽ tự cài Bun nếu thiếu.
• Một AI coding agent: **Claude Code** (https://claude.com/claude-code) hoặc **Cursor** (https://cursor.com) — hoặc cả hai.

⬇️ **Cài đặt**

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/odarino/haren/main/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/odarino/haren/main/install.ps1 | iex
```

Script làm các bước sau:
• Cài Bun bằng trình cài đặt chính thức nếu thiếu. Trình cài đặt của Bun có thể thêm Bun vào shell profile hoặc `PATH` của user.
• Cài `@odarino/haren` bằng `bun add -g`.
• Nếu `haren` trong `PATH` bị thiếu hoặc là bản khác, script in ra dòng cần thêm và luôn chạy bản `haren` do Bun cài.
• Hỏi thư mục workspace rồi chạy `haren init --dir <folder>`. Script không dùng thư mục home làm workspace.

Bước hỏi thư mục chỉ chạy khi script hỏi được: cần có terminal, và `CI` phải rỗng, `false` hoặc `0`. Các trường hợp còn lại (CI, input bị redirect như `ssh host "..."` không có `-t`) script chỉ cài đặt và in ra bước tiếp theo.

Ghim phiên bản bằng `HAREN_VERSION` (mặc định `latest`). Ví dụ `1.2.0` chỉ chạy được sau khi bản 1.2.0 đã được publish lên npm.

```bash
curl -fsSL https://raw.githubusercontent.com/odarino/haren/main/install.sh | HAREN_VERSION=1.2.0 bash
```

```powershell
try { $env:HAREN_VERSION = '1.2.0'; irm https://raw.githubusercontent.com/odarino/haren/main/install.ps1 | iex } finally { Remove-Item Env:HAREN_VERSION }
```

Khối `finally` xóa biến, kể cả khi cài lỗi, nên lần cài sau trong cùng cửa sổ PowerShell lại dùng `latest`.

**Dùng package manager** (cần cài Bun trước):

```bash
npm install -g @odarino/haren
# hoặc chạy luôn không cần cài:
npx @odarino/haren init
```

━━━━━━━━━━━━━━━━━━━━

⚡ **Bắt đầu nhanh**

```bash
cd your-project
haren init          # dựng thư mục haren (tương tác)
```

`init` tự nhận diện layout (xem phần Layout), hỏi vài câu (tên project, mode, ngôn ngữ, editor) rồi hiện plan. Sau khi bạn xác nhận, nó tạo thư mục haren cùng file config mà agent của bạn đọc ở mỗi phiên làm việc. Sau đó mở project (workspace root) trong editor và chạy `/haren-onboard`, hoặc nói:

> **"what's next?"**

Agent sẽ đọc `skill.md` trong thư mục haren, tự định hướng từ `manifest.yaml` và `progress.json`, rồi dẫn bạn vào đúng giai đoạn cần làm.

━━━━━━━━━━━━━━━━━━━━

🗂️ **Layout**

haren hỗ trợ hai layout. `haren init` tự nhận diện bạn đang dùng layout nào.

**Monorepo** — một git repo, thư mục haren nằm bên trong.

```
my-app/              (.git)
├── backend/
├── frontend/
├── haren/
├── CLAUDE.md        # được sinh ra, commit cùng repo
└── .claude/
```

**Multi-repo workspace** — thư mục thường (không có `.git`) chứa nhiều git repo. haren là một repo riêng nằm cạnh các repo code.

```
workspace/           (no .git)
├── backend/         (.git)
├── frontend/        (.git)
├── cmis_ai_rules/   (.git — repo haren, tên thư mục tùy ý)
├── CLAUDE.md        # sinh theo từng máy, không version
└── .claude/         # sinh theo từng máy, không version
```

Thư mục haren có thể đặt tên bất kỳ. haren tìm nó bằng marker `haren:` ở cấp cao nhất của `manifest.yaml`, không phải bằng tên. Hãy mở editor ở **workspace root** (thư mục chứa tất cả repo) để một phiên thấy được mọi repo.

━━━━━━━━━━━━━━━━━━━━

🛠️ **Các lệnh**

• `haren init` — Thiết lập haren trong thư mục hiện tại: dựng thư mục haren mới, hoặc set up một thư mục haren đã clone. Tương tác, hoặc truyền flag (xem bên dưới).
• `haren upgrade` — Cập nhật các file framework trong thư mục haren lên phiên bản đã cài, và migrate `manifest.yaml` / `progress.json` cũ. Lệnh này cũng cài lại các plugin còn thiếu trong `plugins.json`. Dùng `--yes` để chấp nhận plugin từ nguồn không chính thức.
• `haren plugin` — Quản lý plugin: `add <name|source>`, `remove <name>`, `list`, `doctor`, `run <hook>`. Xem [PLUGINS.md](PLUGINS.md).
• `haren agent` — Quản lý cầu nối agent cục bộ *(thử nghiệm — dành cho Haren Portal đang phát triển)*. Chạy được ở cả hai layout, dùng git remote của repo haren làm project key của Portal.

Chạy `haren` không kèm tham số để xem trợ giúp.

**Flag cho `init` (bỏ qua phần hỏi đáp):**

```bash
haren init \
  --project "my-app" \
  --mode blueprint \          # blueprint | explore | inherit | undecided
  --language English \
  --editor both \             # claude-code | cursor | both
  --iterations \              # bật planning theo iteration
  --duration "2 weeks" --start-date 2026-06-08 --demo-day Friday
```

Flag về layout và thư mục:
• `--dir <path>` — Chạy trong thư mục này thay vì thư mục hiện tại.
• `--layout monorepo|workspace` — Bỏ qua bước nhận diện layout.
• `--haren-dir <name>` — Tên thư mục haren mới (mặc định `haren`).
• `--yes` (`-y`) — Nhận mặc định và bỏ qua bước xác nhận. Bắt buộc khi không có terminal.
• `--dry-run` — In plan rồi thoát, không ghi gì.
• `--plugin <name|source>` — Cài một plugin. Lặp lại flag để cài nhiều plugin.
• `--force` — Dựng lại thư mục haren có sẵn (giữ tên thư mục, layout và repos trong `manifest.yaml`). Cũng cần để chạy ở thư mục home.

`init` từ chối chạy ở thư mục home trừ khi có `--force`.

**Plan preview** — `init` không ghi gì cho tới khi bạn xác nhận. Nó in plan trước:

```
Plan:
  /path/to/workspace/
  ├── cmis_ai_rules/         + create   (git init, own repo)
  │   ├── manifest.yaml      + create   layout: workspace
  │   ├── artifacts/         + create
  │   └── hooks/             + create
  ├── CLAUDE.md              + create   (generated, not versioned)
  ├── backend/               = keep
  └── frontend/              = keep

? Apply this plan? (Y)es / (n)o / (e)dit selection
```

Ký hiệu: `+` create, `~` modify, `=` keep, `↓` clone, `!` cảnh báo (ví dụ thư mục không phải git repo, hoặc repo không có remote để clone).

Trong workspace, `init` chạy `git init` trong thư mục haren mới nhưng không commit. Các file ở root (`CLAUDE.md`, `.cursorrules`, `.claude/`, `.cursor/`) sinh theo từng máy và không được version. Nếu `CLAUDE.md` hoặc `.cursorrules` đã có nội dung, haren giữ nguyên — chỉ ghi giữa `<!-- haren:begin -->` và `<!-- haren:end -->`.

**Thiết lập cho đồng đội** — repo haren là nguồn chân lý, đồng đội không cần init đầy đủ:

```bash
git clone <haren-repo-url> workspace/cmis_ai_rules
cd workspace/cmis_ai_rules
haren init
```

`init` tìm manifest, clone từng repo còn thiếu từ `remote`, và sinh các file root ở thư mục cha. Sau đó mở workspace root trong editor và chạy `/haren-onboard`. Nếu một lần clone lỗi, `init` vẫn tiếp tục với các repo khác rồi thoát với mã 1; chạy lại `haren init` để thử lại đúng các repo còn thiếu. Nếu mọi thứ đã đủ, `init` in "Already set up".

**Plugins** — plugin kết nối công cụ khác vào quy trình haren. Plugin cài công cụ, thiết lập nó trong project và phản hồi các hook của haren.

```bash
haren init --plugin backlog      # cài lúc init
haren plugin add backlog         # cài sau
haren plugin list | remove <name> | doctor
```

Ví dụ: plugin `backlog` đồng bộ task của haren với board Backlog.md trong `<thư mục haren>/backlog/`.

**Plugin khi làm việc nhóm:** commit `plugins.json` và `.plugin-data/` (trạng thái dùng chung cho cả team). haren thêm `.plugins/` (mã plugin đã tải về) vào `.gitignore`. Đồng đội clone thư mục haren rồi chạy `haren init` hoặc `haren upgrade`; haren sẽ cài lại mỗi plugin còn thiếu. Với nguồn không chính thức, cần xác nhận (hoặc `--yes`); nếu một plugin lỗi, haren in lỗi và vẫn chạy tiếp.

Xem [PLUGINS.md](PLUGINS.md) để biết chi tiết, plugin backlog và cách viết plugin.

**`/haren-onboard`** — skill cho developer mới hoặc workspace mới:
• **Analyze repos** — đọc build file của từng repo, đề xuất `stack`, `test_cmd`, `default_branch`, `role`; chỉ ghi vào `manifest.yaml` sau khi bạn duyệt.
• **Health check** — báo repo bị thiếu, không phải git repo, dirty, hoặc đang ở branch khác `default_branch`.
• **Briefing** — tóm tắt giai đoạn hiện tại, các module đang chạy và bước tiếp theo.

Skill này không bao giờ clone và không đổi trạng thái git. Muốn clone repo thiếu, chạy `haren init`.

━━━━━━━━━━━━━━━━━━━━

⚙️ **Cách hoạt động**

**Modes** — bạn chọn mode lúc init tùy theo project đang ở đâu:
• `blueprint` — Project mới (greenfield) đã có sẵn docs/specs để làm việc.
• `explore` — Project mới, bắt đầu chỉ từ một ý tưởng.
• `inherit` — Project cũ (brownfield) đã có codebase.
• `undecided` — Để agent giúp bạn chọn ở phiên đầu tiên.

**Các giai đoạn & cổng chặn code** — mỗi module đi qua các giai đoạn **theo đúng thứ tự**, không nhảy cóc được:

`discovered → specified → planned → implementing → evaluating → completed`

Hook `brainstorm-gate` chặn `Edit`/`Write` lên mọi file **nằm ngoài thư mục haren** cho tới khi ít nhất một module đạt `planned`. Chỉ có docs discovery và specs là chưa đủ — phải plan xong trước. (Ghi file *bên trong* thư mục haren thì luôn được phép, để các giai đoạn planning tạo ra artifact.)

**Agents** — haren đi kèm các định nghĩa agent theo vai trò mà LLM của bạn "nhập vai" theo từng giai đoạn — gồm **researcher**, **ideator**, **architect**, **planner**, **developer**, **reviewer** và **qa-engineer**. Mỗi vai trò có phạm vi tập trung để model hành xử như đúng chuyên gia vào đúng thời điểm.

**Skills** — là các quy trình mà agent tuân theo: `discover` (brainstorming), `research`, `decompose`, `plan`, `implement`, `evaluate`, `extract-stories`, `generate-mockup`, cùng một bộ helper quản lý artifact (`create-artifact`, `validate-artifact`, `search-artifact`, `update-tracking`, v.v.).

**Thư mục haren:**

```
haren/                 # tên nào cũng được
├── manifest.yaml      # config project (layout, repos, mode, ngôn ngữ, sources)
├── progress.json      # state tự quản lý — giai đoạn & trạng thái module
├── skill.md           # cẩm nang vận hành của LLM (đọc mỗi phiên)
├── FEEDBACK.md        # log chỉ-ghi-thêm về các điểm vướng của framework
├── agents/            # định nghĩa vai trò agent
├── skills/            # quy trình theo giai đoạn + helper
├── templates/         # template artifact (spec, design, tasks, research, …)
├── hooks/             # brainstorm-gate.ts (cổng chặn code)
└── artifacts/         # output theo giai đoạn, sắp xếp theo stage
    ├── 00-baseline/   # docs đầu vào
    ├── 01-research/   ├── 02-discovery/   ├── 03-modules/
    ├── 04-plans/      ├── 05-implementation/   └── 06-evaluation/
```

**manifest.yaml** (v2):

```yaml
haren:
  version: 1.2.0          # marker; haren tìm thư mục bằng key này
layout: workspace         # monorepo | workspace
project: shop
mode: blueprint
language: English

repos:
  backend:
    path: ../backend      # tương đối so với thư mục haren
    remote: git@github.com:acme/shop-backend.git
    default_branch: main
    role: backend         # frontend | backend | e2e | other
    stack: node-express   # role, stack, test_cmd, default_branch: do /haren-onboard đặt
    test_cmd: bun test
  frontend:
    path: ../frontend
    remote: git@github.com:acme/shop-frontend.git
    default_branch: main
    role: frontend
```

Trong monorepo, `remote` để trống và mỗi `path` trỏ vào bên trong cùng repo.

**Quy ước git** — khi một module chạm tới code:
• Module dùng branch `feat/<module-slug>` trong **mọi repo nó chạm tới**.
• Code được commit ở từng repo code. File haren (artifacts, session log, `progress.json`) được commit ở repo haren. Với monorepo, đó là commit thứ hai trên cùng branch.
• `progress.json` ghi `branch`, `repos` và `lastCommit` theo từng repo key.
• haren không bao giờ push và không mở pull request trừ khi bạn yêu cầu.

**E2E tests** — agent `qa-engineer` viết test Playwright trong repo UI (mục `repos` có `role: frontend`). Trong workspace, test nằm ở `<frontend repo>/e2e/<module>/`. Trong monorepo, test nằm ở `e2e/` ngay root repo.

**Tích hợp editor** — `init` cấu hình sẵn cho editor bạn chọn:
• **Claude Code** → `CLAUDE.md` + `.claude/settings.json` (đăng ký cổng chặn dưới dạng hook `PreToolUse`).
• **Cursor** → `.cursorrules` + `.cursor/rules/haren.mdc` + `.cursor/hooks.json` (đăng ký cổng chặn qua `beforeFileEdit`/`preToolUse`).
• Cả hai editor đều được cài mọi skill và agent của haren vào thư mục riêng của editor: `.claude/skills/haren-<skill>/`, `.claude/agents/haren-<agent>.md`, và tương tự trong `.cursor/`. Prefix `haren-` giúp không trùng với skill và agent của bạn (ví dụ `/haren-plan`, agent `haren-developer`). `haren upgrade` cập nhật lại các bản này từ thư mục haren.

Các file này nằm ở workspace root (thư mục cha của thư mục haren). Config có sẵn được giữ nguyên: haren chỉ ghi trong khối có đánh dấu của nó.

━━━━━━━━━━━━━━━━━━━━

🔄 **Nâng cấp**

```bash
cd your-workspace      # hoặc project root, hoặc chính thư mục haren
haren upgrade
```

Lệnh này làm mới agents, skills, templates và gate hook trong thư mục haren cho khớp với phiên bản CLI đã cài, giữ nguyên artifacts của bạn. Nó cũng migrate project cũ:
• `manifest.yaml` được thêm marker `haren:` và `layout`. Danh sách `repos` chuyển thành map có `remote`.
• `progress.json` lên version 2: `lastCommit` thành một commit cho mỗi repo.
• Các file root (`CLAUDE.md`, `.claude/`, `.cursor/`, ...) được sinh lại.

Chạy `haren upgrade --dry-run` để xem từng bước mà không ghi gì. Upgrade cần Bun ≥ 1.2.21.

━━━━━━━━━━━━━━━━━━━━

🙏 **Ghi nhận**

Triết lý workflow của haren chịu ảnh hưởng lớn từ **Superpowers** (https://github.com/obra/superpowers) của Jesse Vincent — kỷ luật *brainstorm → viết plan → thực thi với subagent mới → review*, hướng tiếp cận test-driven và YAGNI, cùng ý tưởng chặn implement sau một design đã duyệt đều bắt nguồn từ đó. haren đóng gói một triết lý tương tự thành một SDLC theo giai đoạn, dựa trên artifact, cho các product team. Xin chân thành cảm ơn.

📄 **License**

MIT — xem [LICENSE](./LICENSE).
