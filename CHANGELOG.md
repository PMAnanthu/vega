# Changelog

All notable changes to Vega are documented here.

---

## [1.24.0] — 2026-07-01

### Fixed

- **MCP server rebuilt** — `mcp/dist/index.js` rebuilt to include all recent
  fixes. Previous build was from before the `index.filter` fix, causing the
  running process to use stale code. Restart `/mcp` in Claude Code to reload.

---

## [1.23.0] — 2026-07-01

## [1.23.0] — 2026-07-01

### Fixed

- **MCP task lookup** — `/api/index` returns `{ tasks, notes }` dict, not a
  flat array. Fixed `vega_list_tasks`, `vega_search`, and `vega_get_summary`
  to read `index.tasks` / `index.notes` correctly.
- Added optional `keyword` filter to `vega_list_tasks` for searching by title.

---

## [1.22.0] — 2026-07-01

## [1.22.0] — 2026-07-01

### Added

- **Scrollable canvas** — the sticky-note canvas now has full vertical and
  horizontal scrolling. The inner canvas is 2400×1600 px; the outer viewport
  scrolls independently so stickies can be placed anywhere.

### Fixed

- **Multiple app instances** — removed `requestSingleInstanceLock()`; each
  new window checks if port 3690 is already bound and connects to the existing
  server instead of starting a new one.
- **Canvas JSX syntax error** — fixed missing closing `</div>` for the
  `CanvasBoard` wrapper that caused a Babel parse error.

---

## [1.21.0] — 2026-07-01

## [1.21.0] — 2026-07-01

### Added

- **Canvas MCP tools** — 6 new MCP tools for managing sticky-note canvas docs
  via Claude: `vega_list_canvas_docs`, `vega_get_canvas`, `vega_add_sticky`,
  `vega_update_sticky`, `vega_delete_sticky`, `vega_connect_stickies`.
- **Auto-refresh on external writes** — renderer polls `/api/last-modified`
  every 3 s and auto-refreshes when a file is written by MCP or another
  external tool, without requiring a manual refresh.
- `/api/last-modified` endpoint returning max mtime across all data files.

---

## [1.20.0] — 2026-07-01

## [1.20.0] — 2026-07-01

### Fixed

- **Mermaid diagrams in Markdown** — fenced ` ```mermaid ``` ` blocks now
  render as live diagrams in Preview mode inside notes and idea documents.
  Uses a custom `marked` renderer to emit `<div class="mermaid">` and calls
  `mermaid.run()` after the HTML is injected into the DOM.

---

## [1.19.0] — 2026-07-01

## [1.19.0] — 2026-07-01

### Added

- **Open doc by double-click** — double-clicking a doc title row in an expanded
  idea card opens the doc in DocViewer (↗ button still works as before).
- **Export / Import** — ⬇ Export and ⬆ Import buttons appear in the header
  toolbar on Notes, Bookmarks, and all Features tabs (Ideas/Design/etc.).
  Exports a versioned JSON file; import merges without duplicates.

### Changed

- Share buttons removed (not functional in web mode).

---

## [1.18.0] — 2026-06-30

## [1.18.0] — 2026-06-30

### Added

- **Vega MCP Server** (`vega/mcp/`) — Model Context Protocol server that exposes
  Vega data to Claude. 20 tools covering tasks, notes, bookmarks, ideas, stories,
  and defects. Configured automatically in `.claude/settings.json`. Requires Vega
  running on `http://localhost:3690` (or `VEGA_URL` env var).
- **Feature Menu toggles** — Settings → Feature Menus: toggle switches for
  Sprint View, Notes, Bookmarks, Secrets, and the entire Features section.

---

## [1.17.0] — 2026-06-30

### Added

- **Sprint Planner calendar template** — new doc template on Design+ ideas. Drag stories
  from the side panel onto a monthly calendar; estimate auto-spreads across working days
  (skips weekends and holidays). Dependency check blocks placement if a required story
  isn't planned first. Add/remove holidays. Persists story dates on the idea.
- **Stories on ideas** — Design/Implementation/Released ideas now have a Stories section.
  Each story has title, status, estimate, links, and dependencies (dropdown selector).
  StoryEditor opens full-screen with ← Back navigation.
- **Actual time on stories** — shown in Implementation/Released status with variance and
  progress bar.
- **Defects section 🐛** — Implementation/Released ideas have a Defects section. Each
  defect has severity (Critical/High/Medium/Low), status (Open/In Progress/Fixed/Won't Fix),
  description, linked story, and links. Opens in DefectEditor.
- **Idea progress bar** — collapsed card shows an overall story progress bar
  (green = done, blue = in-progress) in Implementation/Released status.
- **Feature Menu toggles** — Settings → Feature Menus: toggle switches for Sprint View,
  Notes, Bookmarks, Secrets, and the entire Features section (Ideas/Design/etc.).
  Settings persist across sessions.
- **Cross-doc references** — type `[[IdeaTitle / DocTitle]]` in any Markdown doc to link
  to another document. Renders as a clickable link in Preview; navigates to the target doc.
- **Sprint field on tasks** — combobox field with autocomplete from existing sprints.
- **Sprint View tab** — sprint selector with Time by Type chart, Open and Completed groups
  with total hours and variance.

### Changed

- Delete button moved to left, Done button to right in idea card editor footer.
- Dependencies in StoryEditor changed from checkboxes to a dropdown selector with tag pills.

---

## [1.16.0] — 2026-06-24

### Added

- **Sprint field on tasks** — new Sprint combobox+autocomplete field in the task
  detail panel (below Type). Free-text with suggestions from existing sprints.
- **Sprint View tab** — dedicated sprint analytics tab. Includes a sprint selector,
  Time by Type doughnut chart (actual hours + %), Open Tasks group, and Completed
  group with total actual vs estimated hours in the header.

---

## [1.10.0] — 2026-05-27

### Added

- **Secrets tab** — full CRUD secrets manager for storing sensitive credentials. Each secret has a name, tags, an optional bookmark (dropdown from saved Bookmarks), and a list of name/value fields. Values are always masked; per-field eye button to reveal, copy button to clipboard.
- **Secrets encryption** — secrets are encrypted at rest with AES-256-GCM (PBKDF2 key derivation). Set a passphrase in Settings → Secrets to enable; re-encryption on passphrase change is automatic.
- **Note language selector** — each note has a language dropdown (Markdown, Plain Text, JavaScript, TypeScript, Python, SQL, Bash, and more). Language is persisted per note and shown in the footer.
- **Line numbers in note editor** — a live line-number gutter scrolls in sync with the textarea. Footer shows total line count and word count.

### Changed

- **Edit / Preview toggle — Markdown only** — the Edit | Preview toggle is now shown only when the note language is Markdown.

---

## [1.9.0] — 2026-05-26

### Added

- **Configurable required fields per state** — Settings → Todos lets you choose which fields (Start Date, End Date, Estimate, Actual Time) must be filled before a task can transition to a given status. Defaults to requiring all four for Completed. Configuration is persisted per-state and respected across the task list, sub-task rows, and the detail panel.

### Changed

- **Notes open as a full page** — clicking a note no longer opens a floating modal overlay. Notes now open inline within the Notes tab with a **← Notes** back button in the header, replacing the modal × close button.
- **Status change blocking is now per-target-state** — the required-fields check now evaluates against the *target* status (the one being changed to), not the task's current status. This makes per-state configuration work correctly.

---

## [1.8.0] — 2026-05-17

### Added

- **Per-item file storage** — each task and note is now stored as its own `{id}.json` file instead of a single flat array. Tasks are partitioned by status (`ready/`, `in_progress/`, `paused/`, `skipped/`) and completed tasks are further grouped by month (`completed/YYYY-MM/`). Notes are stored flat under `notes/`.
- **`GET /api/index` endpoint** — a lightweight metadata index (`index.json`) is maintained at the data root and served via `/api/index`. Contains title, status, priority, type, tags, dates, and relative file path for every task and note — allowing the AI to query all metadata in a single request without reading individual files.
- **Automatic migration** — on first launch, existing `tasks.json` and `notes.json` are silently migrated to the new per-file layout and renamed to `.bak`.

### Changed

- Index is rebuilt automatically after every task/note create, update, or delete operation.
- Status changes cause the task file to move to the correct status subdirectory automatically.

---

## [1.7.0] — 2026-05-15

### Added

- **Year-based task storage** — `tasks.json` is now stored under a year subfolder (e.g. `~/.vega/2026/tasks.json`). Existing flat `tasks.json` is automatically migrated on first launch. At year-end, archive old years by moving or zipping the year folder.

### Fixed

- **App exit closes the server** — the HTTP server on port 3690 is now cleanly shut down when the app quits, releasing the port immediately.
- **Electron network-service crash on startup** — added `no-sandbox` and `disable-gpu-sandbox` command-line switches to prevent the Chromium network service from crashing on first load.
- **White screen on load failure** — added a `did-fail-load` retry handler so the window automatically reloads if the initial connection to the local server fails.
- **Missing server constants** — `PORT`, `HTML_FILE`, and `LIB_DIR` constants that were lost during an earlier refactor have been restored in `server.js`.

### Changed

- **Settings tab visual style** — card backgrounds updated from gray (`bg-gray-50`) to white (`bg-white shadow-sm`) and section headers darkened to match the rest of the app.
- **User Guide width** — guide content now spans 80% of the screen width instead of a fixed narrow column.
- **User Guide: Settings section** — added documentation for MCP Servers configuration and the Data Folder path setting.

---

## [1.6.0] — 2026-05-15

### Added

- **MCP Server support** — configure HTTP/SSE Model Context Protocol servers in Settings → MCP Servers. Enabled servers have their tools automatically discovered and made available to Vega AI in every chat session.
- **Bookmark card in AI chat** — when the AI opens a bookmark, a clickable card showing the site favicon, title, and hostname appears in the chat alongside launching the browser.
- **Chat history navigation** — press ↑ / ↓ in the AI chat input to cycle through previously sent messages, like a terminal shell.

### Fixed

- **AI action reliability** — the system prompt now explicitly requires the AI to call a tool before claiming any action was performed. Fixes cases where the AI said "Done!" or "Opened!" without actually doing anything.
- **Browser URL opening** — `shell.openExternal` is now routed through the Electron IPC main process, fixing silent failures when opening bookmarks or external links from the AI chat.
- **`update_settings` wiring** — the AI's `update_settings` tool call is now correctly applied to the live UI (theme/font size changes take effect immediately).
- **App icon rounded corners** — icon corners are now baked into the PNG asset (radius 220 px on 1024 × 1024) so they render correctly everywhere, not just in the macOS Dock.
- **Image resize button contrast** — the image size overlay buttons now use a dark background that meets WCAG AA contrast requirements.

### Changed

- Refactored the AI agentic loop into `buildMcpContext`, `runToolCall`, `processToolCalls`, and `runAgentLoop` helper functions, reducing cognitive complexity and making it easier to extend.

---

## [1.5.0] — 2026-05-15

### Added

- **Vega AI** — floating chat panel (bottom-right ✦ button) powered by any OpenAI-compatible API (Anthropic, SAP AI Core proxy, etc.).
- **18 built-in AI tools** — full CRUD for tasks, notes, and bookmarks; navigate between tabs; open task detail popups; open notes; launch bookmarks in the system browser; create dynamic data views; change app theme / font size.
- **Dynamic Views** — when a query has no dedicated page, the AI creates a custom tab showing the filtered results in an auto-detected table.
- **User Guide tab** — in-app documentation covering all features.
- **About tab** — version, author, and contact info.
- **Bookmarks open in system browser** — clicking any bookmark now launches the default OS browser via Electron `shell.openExternal`.
- **Chat history persistence** — conversation is saved to `~/.vega/chat.json` and restored on next launch. A "New chat" button clears history.

### Changed

- Status values standardised to `ready`, `in_progress`, `paused`, `skipped`, `completed` across the UI, data model, and AI tools.

---

## [1.4.0] — 2026-05-15

### Added

- **Task status system** — six statuses replace the simple complete/incomplete toggle: Ready, In Progress, Blocked, Skip, Completed. Each shown as a colored pill badge with a dropdown to change status directly from any task row or the detail panel.
- **In Progress & Blocked sidebar tabs** — dedicated views for tasks currently in progress and blocked tasks.
- **Sub-tasks grouped by status** — in the task detail panel, sub-tasks are grouped by status with collapsible sections. Completed and Skip groups start collapsed by default.
- **Description & Note default to View mode** — fields with existing content open in rendered Markdown view instead of raw edit mode.
- **Analysis: custom date range** — start date and end date pickers added alongside the preset period buttons (7d · 14d · 30d · 60d · 90d · **1y**).
- **Time by Type drill-down** — double-clicking a doughnut segment opens a modal listing all tasks of that type with actual vs estimated hours. Clicking a task opens its detail panel.
- **Time by Type: percentages** — legend entries and tooltips now show percentage share alongside hours. Segments are ordered largest to smallest.
- **Notes: card grid layout** — notes are displayed as cards in a responsive 3-column grid instead of a flat list.

### Changed

- **Skip status** — skipped tasks are removed from the To Do tab and appear in a dedicated **Skipped** section at the bottom of the Completed tab.
- **Skip excluded from analysis** — skipped tasks are excluded from all Analysis metrics (open count, estimate/actual hours, Time by Type chart, Open by Priority chart).
- **Skip exempt from Actual Time** — skipped tasks do not require Actual Time to be filled before the status can be set.
- **Overdue & Due Today** — skipped and completed tasks are never flagged as overdue or due today (including descendant checks).

---

## [1.3.0] — 2026-05-14

### Added

- **Attachments panel** in task detail and notes — attach any file (images, PDFs, docs, zip) via click or drag & drop. Images show thumbnails; clicking opens a full-screen lightbox.
- **Image rendering in description/note fields** — each field now has an **Edit | View** toggle. View mode renders the content as Markdown, displaying images inline rather than showing raw `![name](url)` text.
- **Image resizing** — hover over any image in View mode (or in the Notes preview) to reveal a **25% / 50% / 75% / 100%** size toolbar. Clicking a size updates the stored Markdown instantly.
- **Paste screenshot support** — pasting an image from the clipboard in any description, note, or notes field uploads it automatically and inserts the reference.

### Changed

- Image upload now stores attachment metadata (`attachments.json`) with `entityId`/`entityType` so attachments are linked to their task or note.
- Fixed double-extension bug in uploaded filenames (e.g. `photo.png` was saved as `photo.png.png`).
- Images now render correctly in the Notes Markdown preview (`max-width: 100%`, rounded corners).

---

## [1.2.0] — 2026-05-14

### Added

- **Recurring Tasks** — define templates that auto-create tasks on a daily, weekly, custom-interval, or monthly schedule. Templates support sub-tasks that are also created automatically.
- **Refresh button** on every tab — reloads all data from disk without restarting the server.
- **Run Now button** on the Recurring tab — immediately runs the recurring-task generator for today.
- **Standalone executables** — `npm run build` produces self-contained binaries for macOS, Windows, and Linux (no Node.js required on the target machine). Data is stored in `~/.vega/`.

### Changed

- **Actual time & estimate auto-sum** — editing a child task's Estimate or Actual Time automatically sums all siblings and updates the parent, propagating all the way to the root.
- **Type & tags inheritance** — changing a parent task's Type or Tags pushes the values down to all descendants. New sub-tasks also inherit the parent's Type and Tags at creation time.
- **Completion guard** — tasks cannot be marked complete unless Start Date, End Date, Estimate, and Actual Time are all filled in. Missing fields are shown as red pills in the detail panel.
- **Start Date / End Date default to today** for all newly created tasks.
- **Completed tab enhancements** — each completed task row shows priority badge, type badge, tags, and estimated vs actual hours with variance %. Strikethrough removed for readability.
- **Completed date grouping** now uses local timezone (previously used UTC, causing off-by-one date issues for UTC+ users).
- **Cross-platform browser launch** — the server now opens the browser using the correct command on macOS (`open`), Windows (`start`), and Linux (`xdg-open`).

---

## [1.1.0] — 2026-04-20

### Added

- **Notes tab** — Markdown-enabled notes with full CRUD, stored in `notes.json`.
- **Bookmarks tab** — link manager with automatic title fetching, stored in `links.json`.
- **Calendar view** — monthly calendar showing tasks by plan start date.
- **Analysis tab** — bar/pie charts for task distribution by type, priority, and completion rate.
- **Sub-tasks** — unlimited nesting; parent tasks collapse/expand in the task list.
- **Detail panel** — slide-in side panel for editing all task fields including description (Markdown), notes, links, and custom tags.

---

## [1.0.0] — 2026-03-01

### Added

- Initial release: task manager with To Do / Completed views.
- Priority levels (1–5), types, and free-form tags.
- Plan start / end dates and time estimates.
- Local JSON persistence via a minimal Node.js HTTP server.
- Entirely self-contained — all JS/CSS libraries bundled in `lib/`.


### Added

- **Task status system** — six statuses replace the simple complete/incomplete toggle: Ready, In Progress, Blocked, Skip, Completed. Each shown as a colored pill badge with a dropdown to change status directly from any task row or the detail panel.
- **In Progress & Blocked sidebar tabs** — dedicated views for tasks currently in progress and blocked tasks.
- **Sub-tasks grouped by status** — in the task detail panel, sub-tasks are grouped by status with collapsible sections. Completed and Skip groups start collapsed by default.
- **Description & Note default to View mode** — fields with existing content open in rendered Markdown view instead of raw edit mode.
- **Analysis: custom date range** — start date and end date pickers added alongside the preset period buttons (7d · 14d · 30d · 60d · 90d · **1y**).
- **Time by Type drill-down** — double-clicking a doughnut segment opens a modal listing all tasks of that type with actual vs estimated hours. Clicking a task opens its detail panel.
- **Time by Type: percentages** — legend entries and tooltips now show percentage share alongside hours. Segments are ordered largest to smallest.
- **Notes: card grid layout** — notes are displayed as cards in a responsive 3-column grid instead of a flat list.

### Changed

- **Skip status** — skipped tasks are removed from the To Do tab and appear in a dedicated **Skipped** section at the bottom of the Completed tab.
- **Skip excluded from analysis** — skipped tasks are excluded from all Analysis metrics (open count, estimate/actual hours, Time by Type chart, Open by Priority chart).
- **Skip exempt from Actual Time** — skipped tasks do not require Actual Time to be filled before the status can be set.
- **Overdue & Due Today** — skipped and completed tasks are never flagged as overdue or due today (including descendant checks).

---

## [1.3.0] — 2026-05-14

### Added

- **Attachments panel** in task detail and notes — attach any file (images, PDFs, docs, zip) via click or drag & drop. Images show thumbnails; clicking opens a full-screen lightbox.
- **Image rendering in description/note fields** — each field now has an **Edit | View** toggle. View mode renders the content as Markdown, displaying images inline rather than showing raw `![name](url)` text.
- **Image resizing** — hover over any image in View mode (or in the Notes preview) to reveal a **25% / 50% / 75% / 100%** size toolbar. Clicking a size updates the stored Markdown instantly.
- **Paste screenshot support** — pasting an image from the clipboard in any description, note, or notes field uploads it automatically and inserts the reference.

### Changed

- Image upload now stores attachment metadata (`attachments.json`) with `entityId`/`entityType` so attachments are linked to their task or note.
- Fixed double-extension bug in uploaded filenames (e.g. `photo.png` was saved as `photo.png.png`).
- Images now render correctly in the Notes Markdown preview (`max-width: 100%`, rounded corners).

---

## [1.2.0] — 2026-05-14

### Added

- **Recurring Tasks** — define templates that auto-create tasks on a daily, weekly, custom-interval, or monthly schedule. Templates support sub-tasks that are also created automatically.
- **Refresh button** on every tab — reloads all data from disk without restarting the server.
- **Run Now button** on the Recurring tab — immediately runs the recurring-task generator for today.
- **Standalone executables** — `npm run build` produces self-contained binaries for macOS, Windows, and Linux (no Node.js required on the target machine). Data is stored in `~/.vega/`.

### Changed

- **Actual time & estimate auto-sum** — editing a child task's Estimate or Actual Time automatically sums all siblings and updates the parent, propagating all the way to the root.
- **Type & tags inheritance** — changing a parent task's Type or Tags pushes the values down to all descendants. New sub-tasks also inherit the parent's Type and Tags at creation time.
- **Completion guard** — tasks cannot be marked complete unless Start Date, End Date, Estimate, and Actual Time are all filled in. Missing fields are shown as red pills in the detail panel.
- **Start Date / End Date default to today** for all newly created tasks.
- **Completed tab enhancements** — each completed task row shows priority badge, type badge, tags, and estimated vs actual hours with variance %. Strikethrough removed for readability.
- **Completed date grouping** now uses local timezone (previously used UTC, causing off-by-one date issues for UTC+ users).
- **Cross-platform browser launch** — the server now opens the browser using the correct command on macOS (`open`), Windows (`start`), and Linux (`xdg-open`).

---

## [1.1.0] — 2026-04-20

### Added

- **Notes tab** — Markdown-enabled notes with full CRUD, stored in `notes.json`.
- **Bookmarks tab** — link manager with automatic title fetching, stored in `links.json`.
- **Calendar view** — monthly calendar showing tasks by plan start date.
- **Analysis tab** — bar/pie charts for task distribution by type, priority, and completion rate.
- **Sub-tasks** — unlimited nesting; parent tasks collapse/expand in the task list.
- **Detail panel** — slide-in side panel for editing all task fields including description (Markdown), notes, links, and custom tags.

---

## [1.0.0] — 2026-03-01

### Added

- Initial release: task manager with To Do / Completed views.
- Priority levels (1–5), types, and free-form tags.
- Plan start / end dates and time estimates.
- Local JSON persistence via a minimal Node.js HTTP server.
- Entirely self-contained — all JS/CSS libraries bundled in `lib/`.
