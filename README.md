# Vega ✦

A personal productivity app — tasks, notes, and bookmarks — that runs entirely on your machine. No accounts, no cloud, no tracking. All data is stored as plain JSON files on your filesystem.

---

## Features

| Area | Highlights |
|---|---|
| **Tasks** | Nested sub-tasks · 5 priority levels · types · tags · plan dates · time estimates |
| **Status workflow** | Ready → In Progress → Blocked → Completed (or Skip) with colored badge picker |
| **Recurring Tasks** | Daily / weekly / monthly / custom-interval templates that auto-create tasks on schedule |
| **Notes** | Markdown-rendered notes displayed as a card grid |
| **Bookmarks** | Link manager with automatic page-title fetching |
| **Calendar** | Monthly view of tasks by plan start/end date |
| **Analysis** | Completion trends · estimate vs actual · time by type (with drill-down) · configurable date range |
| **Attachments** | Upload images and files; paste screenshots; attach to any task or note |

### Task workflow
- Six statuses: **Ready · In Progress · Blocked · Skip · Completed** — click the status badge to change it.
- **Estimate** and **Actual Time** auto-sum from child tasks up to the parent.
- **Type** and **Tags** set on a parent are pushed down to all sub-tasks automatically.
- A task can only be marked **Completed** once Start Date, End Date, Estimate, and Actual Time are filled in.
- **Skipped** tasks are excluded from all Analysis metrics and appear in the Completed tab.

---

## Installation

### Option A — Standalone executable (recommended, no Node.js required)

Download the binary for your platform from `dist/executables/` and follow the steps below.

#### macOS

```bash
# 1. Download vega (the macOS binary)
# 2. Make it executable
chmod +x vega

# 3. Remove the quarantine flag (required the first time on macOS)
xattr -d com.apple.quarantine vega

# 4. Run it
./vega
```

> **First run note:** macOS may show "cannot be opened because the developer cannot be verified."  
> Go to **System Settings → Privacy & Security → scroll down → click "Allow Anyway"**, then run again.

Data is stored in **`~/.vega/`** and the browser opens automatically at `http://localhost:3000`.

---

#### Windows

```powershell
# 1. Download vega-win.exe
# 2. Double-click it, or run from a terminal:
.\vega-win.exe
```

> Windows Defender SmartScreen may warn "Windows protected your PC."  
> Click **More info → Run anyway**.

Data is stored in **`%USERPROFILE%\.vega\`** and the browser opens automatically.

---

#### Linux

```bash
# 1. Download vega-linux
# 2. Make it executable
chmod +x vega-linux

# 3. Run it
./vega-linux
```

Data is stored in **`~/.vega/`** and the browser opens automatically at `http://localhost:3000`.

---

### Option B — Run from source (requires Node.js ≥ 18)

```bash
git clone <repo-url>
cd vega
node server.js
# Opens http://localhost:3000 automatically
```

Or use the convenience script, which kills any existing process on port 3000 first:

```bash
bash start.sh
```

---

## Building executables

```bash
npm install           # install dev dependencies (esbuild + @yao-pkg/pkg)
npm run build         # build for macOS, Windows, and Linux
npm run build:host    # build for the current platform only (faster)
```

Output goes to `dist/executables/`:

| File | Platform |
|---|---|
| `vega` | macOS (x64) |
| `vega-win.exe` | Windows (x64) |
| `vega-linux` | Linux (x64) |

---

## Data files

All data is plain JSON. When running as an executable files live in `~/.vega/`; when running from source they live next to `server.js`.

| File | Contents |
|---|---|
| `tasks.json` | All tasks and sub-tasks |
| `links.json` | Bookmarks |
| `notes.json` | Notes |
| `recurring.json` | Recurring task templates |
| `attachments.json` | Attachment metadata |
| `images/` | Uploaded images and files |

---

## Tech stack

- **Runtime**: Node.js (HTTP server, no framework)
- **UI**: React 18 (UMD) + Babel standalone — JSX rendered in-browser, no build step for development
- **Styling**: Tailwind CSS (local copy)
- **Charts**: Chart.js (local copy)
- **Markdown**: marked.js (local copy)

All libraries are bundled in `lib/` — the app works fully offline.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
