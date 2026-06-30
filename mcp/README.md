# Vega MCP Server

MCP server that lets Claude read and update your Vega productivity data (tasks, notes, bookmarks, ideas, stories, defects).

## Setup

### 1. Build

```bash
cd vega/mcp
npm install
npm run build
```

### 2. Configure in Claude Code

Add to your Claude Code MCP config (`~/.claude/settings.json` or via `/mcp` command):

```json
{
  "mcpServers": {
    "vega": {
      "command": "node",
      "args": ["/path/to/vega/mcp/dist/index.js"],
      "env": {
        "VEGA_URL": "http://localhost:3690"
      }
    }
  }
}
```

Replace `/path/to/vega` with the actual path to this repository.

### 3. Start Vega

Vega must be running for the MCP server to work:

```bash
cd vega
node server.js
```

## Available Tools

| Tool | Description |
|---|---|
| `vega_get_summary` | High-level counts: tasks by status, ideas, notes |
| `vega_search` | Search all items by keyword |
| `vega_list_tasks` | List tasks (optional status filter) |
| `vega_get_task` | Full task details by ID |
| `vega_create_task` | Create a new task |
| `vega_update_task` | Update title, status, priority, sprint, estimate, etc. |
| `vega_delete_task` | Delete a task |
| `vega_list_notes` | List all notes |
| `vega_get_note` | Full note content by ID |
| `vega_create_note` | Create a note with Markdown content |
| `vega_update_note` | Update note title/content/tags |
| `vega_list_ideas` | List ideas/features (optional status filter) |
| `vega_get_idea` | Full idea with stories, docs, defects |
| `vega_create_idea` | Create a new idea |
| `vega_update_idea` | Update idea title/description/status |
| `vega_add_story` | Add a story to an idea |
| `vega_update_story` | Update story status, estimate, actual time |
| `vega_add_defect` | Report a defect on an idea |
| `vega_list_bookmarks` | List bookmarks |
| `vega_create_bookmark` | Add a bookmark |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VEGA_URL` | `http://localhost:3690` | Vega server URL |
