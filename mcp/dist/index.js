#!/usr/bin/env node
/**
 * Vega MCP Server
 * Exposes Vega's task/note/idea data to Claude via the Model Context Protocol.
 * Requires Vega to be running on http://localhost:3690 (or VEGA_URL env var).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const BASE_URL = process.env.VEGA_URL || "http://localhost:3690";
// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function vegaGet(path) {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok)
        throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
}
async function vegaPost(path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok)
        throw new Error(`POST ${path} failed: ${res.status}`);
    return res.json();
}
// ── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
// ── Server ───────────────────────────────────────────────────────────────────
const server = new McpServer({
    name: "vega-mcp",
    version: "1.0.0",
});
// ── TASKS ────────────────────────────────────────────────────────────────────
server.tool("vega_list_tasks", "List all tasks from Vega. Optionally filter by status or title keyword.", {
    status: z.string().optional().describe("Filter: ready | in_progress | paused | skipped | completed"),
    keyword: z.string().optional().describe("Search keyword in task title"),
}, async ({ status, keyword }) => {
    const index = await vegaGet("/api/index");
    // /api/index returns { tasks: [...], notes: [...] } — extract tasks array
    const allTasks = Array.isArray(index) ? index.filter((i) => i.type === "task") : (index.tasks || []);
    let filtered = status ? allTasks.filter((t) => t.status === status) : allTasks;
    if (keyword) {
        const q = keyword.toLowerCase();
        filtered = filtered.filter((t) => (t.title || "").toLowerCase().includes(q));
    }
    return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
});
server.tool("vega_get_task", "Get full details of a task by ID or title keyword.", {
    id: z.string().optional().describe("Exact task ID"),
    keyword: z.string().optional().describe("Search in title (used if id not provided)"),
}, async ({ id, keyword }) => {
    const tasks = await vegaGet("/api/tasks");
    let task;
    if (id) {
        task = tasks.find((t) => t.id === id);
        if (!task)
            throw new Error(`Task not found: ${id}`);
    }
    else if (keyword) {
        const q = keyword.toLowerCase();
        const matches = tasks.filter((t) => (t.title || "").toLowerCase().includes(q));
        if (matches.length === 0)
            throw new Error(`No task matching: ${keyword}`);
        if (matches.length > 1)
            return { content: [{ type: "text", text: `Multiple matches (${matches.length}) — use id:\n${JSON.stringify(matches.map((t) => ({ id: t.id, title: t.title, status: t.status })), null, 2)}` }] };
        task = matches[0];
    }
    else {
        throw new Error("Provide id or keyword");
    }
    return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
});
server.tool("vega_create_task", "Create a new task (or sub-task) in Vega.", {
    title: z.string().describe("Task title"),
    priority: z.number().int().min(1).max(5).default(3).describe("Priority 1-5"),
    type: z.string().optional().describe("Task type e.g. Bug, Feature"),
    sprint: z.string().optional().describe("Sprint name"),
    tags: z.array(z.string()).optional().describe("Tags"),
    estimate: z.string().optional().describe("Estimated hours"),
    description: z.string().optional().describe("Markdown description"),
    planStartDate: z.string().optional().describe("YYYY-MM-DD"),
    planEndDate: z.string().optional().describe("YYYY-MM-DD"),
    parentId: z.string().optional().describe("Parent task ID — set to make this a sub-task"),
}, async (args) => {
    const tasks = await vegaGet("/api/tasks");
    const today = new Date().toISOString().slice(0, 10);
    const task = {
        id: uid(), title: args.title, description: args.description || "",
        note: "", priority: args.priority, type: args.type || "",
        sprint: args.sprint || "", tags: args.tags || [], links: [],
        planStartDate: args.planStartDate || today,
        planEndDate: args.planEndDate || today,
        estimate: args.estimate || "", actualTime: "",
        status: "ready", completed: false, completedAt: null,
        parentId: args.parentId || null,
        createdAt: now(),
    };
    tasks.unshift(task);
    await vegaPost("/api/tasks", tasks);
    return { content: [{ type: "text", text: `Created task: ${task.id}\n${JSON.stringify(task, null, 2)}` }] };
});
server.tool("vega_update_task", "Update fields on an existing task.", {
    id: z.string().describe("Task ID to update"),
    title: z.string().optional(),
    status: z.enum(["ready", "in_progress", "paused", "skipped", "completed"]).optional(),
    priority: z.number().int().min(1).max(5).optional(),
    type: z.string().optional(),
    sprint: z.string().optional(),
    tags: z.array(z.string()).optional(),
    estimate: z.string().optional(),
    actualTime: z.string().optional(),
    description: z.string().optional(),
    note: z.string().optional(),
    planStartDate: z.string().optional(),
    planEndDate: z.string().optional(),
    parentId: z.string().nullable().optional().describe("Set parent task ID (null to make root task)"),
}, async ({ id, ...updates }) => {
    const tasks = await vegaGet("/api/tasks");
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1)
        throw new Error(`Task not found: ${id}`);
    const upd = { ...updates };
    if (updates.status === "completed") {
        upd.completedAt = now();
        upd.completed = true;
    }
    tasks[idx] = { ...tasks[idx], ...upd };
    await vegaPost("/api/tasks", tasks);
    return { content: [{ type: "text", text: `Updated task ${id}\n${JSON.stringify(tasks[idx], null, 2)}` }] };
});
server.tool("vega_delete_task", "Delete a task (and optionally its sub-tasks) by ID.", {
    id: z.string().describe("Task ID"),
    deleteSubtasks: z.boolean().default(false).describe("Also delete all child sub-tasks"),
}, async ({ id, deleteSubtasks }) => {
    const tasks = await vegaGet("/api/tasks");
    const toDelete = new Set([id]);
    if (deleteSubtasks) {
        // Collect all descendants
        const addChildren = (pid) => {
            tasks.filter((t) => t.parentId === pid).forEach((t) => { toDelete.add(t.id); addChildren(t.id); });
        };
        addChildren(id);
    }
    const filtered = tasks.filter((t) => !toDelete.has(t.id));
    if (filtered.length === tasks.length)
        throw new Error(`Task not found: ${id}`);
    await vegaPost("/api/tasks", filtered);
    return { content: [{ type: "text", text: `Deleted ${toDelete.size} task(s): ${[...toDelete].join(", ")}` }] };
});
server.tool("vega_list_subtasks", "List all direct sub-tasks of a parent task.", { parentId: z.string().describe("Parent task ID") }, async ({ parentId }) => {
    const tasks = await vegaGet("/api/tasks");
    const subtasks = tasks.filter((t) => t.parentId === parentId);
    return { content: [{ type: "text", text: JSON.stringify(subtasks, null, 2) }] };
});
// ── NOTES ────────────────────────────────────────────────────────────────────
server.tool("vega_list_notes", "List all notes from Vega.", {}, async () => {
    const notes = await vegaGet("/api/notes");
    const summary = notes.map((n) => ({ id: n.id, title: n.title, tags: n.tags, updatedAt: n.updatedAt }));
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
});
server.tool("vega_get_note", "Get the full content of a note by ID.", { id: z.string() }, async ({ id }) => {
    const notes = await vegaGet("/api/notes");
    const note = notes.find((n) => n.id === id);
    if (!note)
        throw new Error(`Note not found: ${id}`);
    return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
});
server.tool("vega_create_note", "Create a new note.", {
    title: z.string().describe("Note title"),
    content: z.string().optional().describe("Markdown content"),
    tags: z.array(z.string()).optional(),
}, async ({ title, content, tags }) => {
    const notes = await vegaGet("/api/notes");
    const note = {
        id: uid(), title, content: content || "", tags: tags || [],
        pinned: false, folderId: null, language: "markdown",
        createdAt: now(), updatedAt: now(),
    };
    notes.unshift(note);
    await vegaPost("/api/notes", notes);
    return { content: [{ type: "text", text: `Created note: ${note.id}\n${JSON.stringify(note, null, 2)}` }] };
});
server.tool("vega_update_note", "Update title or content of a note.", {
    id: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
    tags: z.array(z.string()).optional(),
}, async ({ id, ...updates }) => {
    const notes = await vegaGet("/api/notes");
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1)
        throw new Error(`Note not found: ${id}`);
    notes[idx] = { ...notes[idx], ...updates, updatedAt: now() };
    await vegaPost("/api/notes", notes);
    return { content: [{ type: "text", text: `Updated note ${id}` }] };
});
// ── IDEAS / FEATURES ─────────────────────────────────────────────────────────
server.tool("vega_list_ideas", "List all ideas/features from Vega, optionally filtered by status.", { status: z.enum(["idea", "design", "implementation", "released"]).optional() }, async ({ status }) => {
    const ideas = await vegaGet("/api/ideas");
    const filtered = status ? ideas.filter((i) => i.status === status) : ideas;
    const summary = filtered.map((i) => ({
        id: i.id, title: i.title, status: i.status,
        stories: (i.stories || []).length, docs: (i.docs || []).length,
        defects: (i.defects || []).length, updatedAt: i.updatedAt,
    }));
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
});
server.tool("vega_get_idea", "Get full details of an idea including its stories, docs, and defects.", { id: z.string() }, async ({ id }) => {
    const ideas = await vegaGet("/api/ideas");
    const idea = ideas.find((i) => i.id === id);
    if (!idea)
        throw new Error(`Idea not found: ${id}`);
    return { content: [{ type: "text", text: JSON.stringify(idea, null, 2) }] };
});
server.tool("vega_create_idea", "Create a new idea.", {
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(["idea", "design", "implementation", "released"]).default("idea"),
    tags: z.array(z.string()).optional(),
}, async ({ title, description, status, tags }) => {
    const ideas = await vegaGet("/api/ideas");
    const idea = {
        id: uid(), title, description: description || "",
        tags: tags || [], links: [], docs: [], stories: [], defects: [],
        status, createdAt: now(), updatedAt: now(),
    };
    ideas.unshift(idea);
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Created idea: ${idea.id}\n${JSON.stringify(idea, null, 2)}` }] };
});
server.tool("vega_update_idea", "Update an idea's title, description, or status.", {
    id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["idea", "design", "implementation", "released"]).optional(),
    tags: z.array(z.string()).optional(),
}, async ({ id, ...updates }) => {
    const ideas = await vegaGet("/api/ideas");
    const idx = ideas.findIndex((i) => i.id === id);
    if (idx === -1)
        throw new Error(`Idea not found: ${id}`);
    ideas[idx] = { ...ideas[idx], ...updates, updatedAt: now() };
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Updated idea ${id}` }] };
});
server.tool("vega_add_story", "Add a story to an existing idea.", {
    ideaId: z.string().describe("Idea ID to add story to"),
    title: z.string(),
    description: z.string().optional(),
    estimate: z.string().optional().describe("Hours e.g. '4'"),
    status: z.enum(["todo", "in_progress", "done", "blocked"]).default("todo"),
}, async ({ ideaId, title, description, estimate, status }) => {
    const ideas = await vegaGet("/api/ideas");
    const idx = ideas.findIndex((i) => i.id === ideaId);
    if (idx === -1)
        throw new Error(`Idea not found: ${ideaId}`);
    const story = {
        id: uid(), title, description: description || "",
        links: [], dependencies: [], estimate: estimate || "",
        actualTime: "", status, plannedStart: "", plannedEnd: "",
        createdAt: now(), updatedAt: now(),
    };
    ideas[idx].stories = [...(ideas[idx].stories || []), story];
    ideas[idx].updatedAt = now();
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Added story ${story.id} to idea ${ideaId}` }] };
});
server.tool("vega_update_story", "Update a story's status, title, or estimate.", {
    ideaId: z.string(),
    storyId: z.string(),
    title: z.string().optional(),
    status: z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
    estimate: z.string().optional(),
    actualTime: z.string().optional(),
    description: z.string().optional(),
}, async ({ ideaId, storyId, ...updates }) => {
    const ideas = await vegaGet("/api/ideas");
    const ideaIdx = ideas.findIndex((i) => i.id === ideaId);
    if (ideaIdx === -1)
        throw new Error(`Idea not found: ${ideaId}`);
    const stories = ideas[ideaIdx].stories || [];
    const sIdx = stories.findIndex((s) => s.id === storyId);
    if (sIdx === -1)
        throw new Error(`Story not found: ${storyId}`);
    stories[sIdx] = { ...stories[sIdx], ...updates, updatedAt: now() };
    ideas[ideaIdx].stories = stories;
    ideas[ideaIdx].updatedAt = now();
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Updated story ${storyId}` }] };
});
server.tool("vega_add_defect", "Report a defect on an idea.", {
    ideaId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
}, async ({ ideaId, title, description, severity }) => {
    const ideas = await vegaGet("/api/ideas");
    const idx = ideas.findIndex((i) => i.id === ideaId);
    if (idx === -1)
        throw new Error(`Idea not found: ${ideaId}`);
    const defect = {
        id: uid(), title, description: description || "",
        severity, status: "open", storyId: "", links: [],
        createdAt: now(), updatedAt: now(),
    };
    ideas[idx].defects = [...(ideas[idx].defects || []), defect];
    ideas[idx].updatedAt = now();
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Added defect ${defect.id}` }] };
});
// ── INDEX / SEARCH ────────────────────────────────────────────────────────────
server.tool("vega_search", "Search across all Vega items (tasks, notes, ideas) by keyword in title.", { query: z.string().describe("Search keyword") }, async ({ query }) => {
    const index = await vegaGet("/api/index");
    // /api/index returns { tasks: [...], notes: [...] }
    const items = Array.isArray(index)
        ? index
        : [...(index.tasks || []), ...(index.notes || [])];
    const q = query.toLowerCase();
    const results = items.filter((item) => (item.title || "").toLowerCase().includes(q) ||
        (item.tags || []).some((t) => t.toLowerCase().includes(q)));
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
});
server.tool("vega_get_summary", "Get a high-level summary of all Vega data: task counts by status, open ideas, recent notes.", {}, async () => {
    const index = await vegaGet("/api/index");
    const tasks = Array.isArray(index) ? index.filter((i) => i.type === "task") : (index.tasks || []);
    const notes = Array.isArray(index) ? index.filter((i) => i.type === "note") : (index.notes || []);
    const ideas = await vegaGet("/api/ideas");
    const tasksByStatus = {};
    tasks.forEach((t) => { tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1; });
    const ideasByStatus = {};
    ideas.forEach((i) => { ideasByStatus[i.status] = (ideasByStatus[i.status] || 0) + 1; });
    const summary = {
        tasks: { total: tasks.length, byStatus: tasksByStatus },
        notes: { total: notes.length },
        ideas: { total: ideas.length, byStatus: ideasByStatus },
        vegaUrl: BASE_URL,
    };
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
});
// ── IDEA DOCS ─────────────────────────────────────────────────────────────────
server.tool("vega_list_idea_docs", "List all documents (markdown, canvas, diagram, calendar) inside an idea.", { ideaId: z.string() }, async ({ ideaId }) => {
    const ideas = await vegaGet("/api/ideas");
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea)
        throw new Error(`Idea not found: ${ideaId}`);
    const docs = (idea.docs || []).map((d) => ({
        id: d.id, title: d.title, template: d.template,
        updatedAt: d.updatedAt, historyCount: (d.history || []).length,
    }));
    return { content: [{ type: "text", text: JSON.stringify(docs, null, 2) }] };
});
server.tool("vega_get_idea_doc", "Get the full content of a document inside an idea.", {
    ideaId: z.string(),
    docIdOrTitle: z.string().describe("Doc ID or partial title"),
}, async ({ ideaId, docIdOrTitle }) => {
    const ideas = await vegaGet("/api/ideas");
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea)
        throw new Error(`Idea not found: ${ideaId}`);
    const doc = (idea.docs || []).find((d) => d.id === docIdOrTitle || (d.title || "").toLowerCase().includes(docIdOrTitle.toLowerCase()));
    if (!doc)
        throw new Error(`Doc not found: ${docIdOrTitle}`);
    return { content: [{ type: "text", text: JSON.stringify(doc, null, 2) }] };
});
server.tool("vega_create_idea_doc", "Create a new document inside an idea (markdown, canvas, or diagram template).", {
    ideaId: z.string(),
    title: z.string().describe("Document title"),
    template: z.enum(["markdown", "canvas", "diagram"]).default("markdown"),
    content: z.string().optional().describe("Initial content (markdown text, JSON array for canvas, or diagram JSON)"),
}, async ({ ideaId, title, template, content }) => {
    const ideas = await vegaGet("/api/ideas");
    const ideaIdx = ideas.findIndex((i) => i.id === ideaId);
    if (ideaIdx === -1)
        throw new Error(`Idea not found: ${ideaId}`);
    const newDoc = { id: uid(), title, template, content: content || "", history: [], createdAt: now(), updatedAt: now() };
    ideas[ideaIdx] = { ...ideas[ideaIdx], docs: [...(ideas[ideaIdx].docs || []), newDoc], updatedAt: now() };
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Created doc: ${newDoc.id}\n${JSON.stringify(newDoc, null, 2)}` }] };
});
server.tool("vega_update_idea_doc", "Update the title or content of a document inside an idea.", {
    ideaId: z.string(),
    docIdOrTitle: z.string(),
    title: z.string().optional(),
    content: z.string().optional().describe("New full content"),
}, async ({ ideaId, docIdOrTitle, ...updates }) => {
    const ideas = await vegaGet("/api/ideas");
    const ideaIdx = ideas.findIndex((i) => i.id === ideaId);
    if (ideaIdx === -1)
        throw new Error(`Idea not found: ${ideaId}`);
    const docs = ideas[ideaIdx].docs || [];
    const docIdx = docs.findIndex((d) => d.id === docIdOrTitle || (d.title || "").toLowerCase().includes(docIdOrTitle.toLowerCase()));
    if (docIdx === -1)
        throw new Error(`Doc not found: ${docIdOrTitle}`);
    docs[docIdx] = { ...docs[docIdx], ...updates, updatedAt: now() };
    ideas[ideaIdx] = { ...ideas[ideaIdx], docs, updatedAt: now() };
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Updated doc ${docs[docIdx].id}` }] };
});
server.tool("vega_delete_idea_doc", "Delete a document from an idea.", {
    ideaId: z.string(),
    docIdOrTitle: z.string(),
}, async ({ ideaId, docIdOrTitle }) => {
    const ideas = await vegaGet("/api/ideas");
    const ideaIdx = ideas.findIndex((i) => i.id === ideaId);
    if (ideaIdx === -1)
        throw new Error(`Idea not found: ${ideaId}`);
    const before = (ideas[ideaIdx].docs || []).length;
    ideas[ideaIdx] = {
        ...ideas[ideaIdx],
        docs: (ideas[ideaIdx].docs || []).filter((d) => d.id !== docIdOrTitle && !(d.title || "").toLowerCase().includes(docIdOrTitle.toLowerCase())),
        updatedAt: now(),
    };
    const after = ideas[ideaIdx].docs.length;
    if (before === after)
        throw new Error(`Doc not found: ${docIdOrTitle}`);
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Deleted ${before - after} doc(s)` }] };
});
// ── BOOKMARKS ─────────────────────────────────────────────────────────────────
server.tool("vega_list_bookmarks", "List all bookmarks.", {}, async () => {
    const links = await vegaGet("/api/links");
    return { content: [{ type: "text", text: JSON.stringify(links, null, 2) }] };
});
server.tool("vega_create_bookmark", "Create a new bookmark.", {
    url: z.string().describe("URL"),
    title: z.string().optional().describe("Display title"),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
}, async ({ url, title, description, tags }) => {
    const links = await vegaGet("/api/links");
    const link = {
        id: uid(), url, title: title || url, description: description || "",
        tags: tags || [], createdAt: now(),
    };
    links.unshift(link);
    await vegaPost("/api/links", links);
    return { content: [{ type: "text", text: `Created bookmark: ${link.id}` }] };
});
// ── CANVAS DOCS ───────────────────────────────────────────────────────────────
const STICKY_COLORS = ['#fef9c3', '#dbeafe', '#dcfce7', '#fce7f3', '#ede9fe', '#ffedd5'];
/** Find a canvas doc inside an idea by id or title. */
function findCanvasDoc(idea, docIdOrTitle) {
    const docs = idea.docs || [];
    return docs.find((d) => d.template === 'canvas' && (d.id === docIdOrTitle || (d.title || '').toLowerCase().includes(docIdOrTitle.toLowerCase())));
}
server.tool("vega_list_canvas_docs", "List all canvas (sticky-note board) documents inside an idea.", { ideaId: z.string().describe("Idea ID") }, async ({ ideaId }) => {
    const ideas = await vegaGet("/api/ideas");
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea)
        throw new Error(`Idea not found: ${ideaId}`);
    const canvasDocs = (idea.docs || []).filter((d) => d.template === 'canvas');
    const summary = canvasDocs.map((d) => {
        const notes = (() => { try {
            return JSON.parse(d.content || '[]');
        }
        catch {
            return [];
        } })();
        return { id: d.id, title: d.title, stickyCount: notes.length };
    });
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
});
server.tool("vega_get_canvas", "Get all sticky notes from a canvas doc.", {
    ideaId: z.string().describe("Idea ID"),
    docIdOrTitle: z.string().describe("Canvas doc ID or title (partial match)"),
}, async ({ ideaId, docIdOrTitle }) => {
    const ideas = await vegaGet("/api/ideas");
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea)
        throw new Error(`Idea not found: ${ideaId}`);
    const doc = findCanvasDoc(idea, docIdOrTitle);
    if (!doc)
        throw new Error(`Canvas doc not found: ${docIdOrTitle}`);
    const notes = (() => { try {
        return JSON.parse(doc.content || '[]');
    }
    catch {
        return [];
    } })();
    return { content: [{ type: "text", text: JSON.stringify(notes, null, 2) }] };
});
server.tool("vega_add_sticky", "Add one or more sticky notes to a canvas doc inside an idea.", {
    ideaId: z.string().describe("Idea ID"),
    docIdOrTitle: z.string().describe("Canvas doc ID or title"),
    stickies: z.array(z.object({
        text: z.string().describe("Sticky note text"),
        color: z.string().optional().describe("Hex color, e.g. #fef9c3. Defaults to cycling palette."),
        x: z.number().optional().describe("Horizontal position 0-85 (%). Defaults to auto."),
        y: z.number().optional().describe("Vertical position 0-85 (%). Defaults to auto."),
    })).describe("List of sticky notes to add"),
}, async ({ ideaId, docIdOrTitle, stickies }) => {
    const ideas = await vegaGet("/api/ideas");
    const ideaIdx = ideas.findIndex((i) => i.id === ideaId);
    if (ideaIdx === -1)
        throw new Error(`Idea not found: ${ideaId}`);
    const idea = ideas[ideaIdx];
    const doc = findCanvasDoc(idea, docIdOrTitle);
    if (!doc)
        throw new Error(`Canvas doc not found: ${docIdOrTitle}`);
    const existing = (() => { try {
        return JSON.parse(doc.content || '[]');
    }
    catch {
        return [];
    } })();
    const added = [];
    let offset = existing.length;
    for (const s of stickies) {
        const gridOffset = (offset * 3) % 20;
        const note = {
            id: uid(),
            text: s.text,
            color: s.color || STICKY_COLORS[offset % STICKY_COLORS.length],
            x: s.x ?? (35 + gridOffset),
            y: s.y ?? (20 + gridOffset),
            connections: [],
        };
        existing.push(note);
        added.push(note);
        offset++;
    }
    const docUpdated = { ...doc, content: JSON.stringify(existing), updatedAt: now() };
    ideas[ideaIdx] = {
        ...idea,
        docs: (idea.docs || []).map((d) => d.id === doc.id ? docUpdated : d),
        updatedAt: now(),
    };
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Added ${added.length} sticky/stickies.\n${JSON.stringify(added, null, 2)}` }] };
});
server.tool("vega_update_sticky", "Update the text or color of a sticky note in a canvas doc.", {
    ideaId: z.string(),
    docIdOrTitle: z.string(),
    stickyId: z.string().describe("Sticky note ID to update"),
    text: z.string().optional(),
    color: z.string().optional().describe("New hex color"),
    x: z.number().optional(),
    y: z.number().optional(),
}, async ({ ideaId, docIdOrTitle, stickyId, ...updates }) => {
    const ideas = await vegaGet("/api/ideas");
    const ideaIdx = ideas.findIndex((i) => i.id === ideaId);
    if (ideaIdx === -1)
        throw new Error(`Idea not found: ${ideaId}`);
    const idea = ideas[ideaIdx];
    const doc = findCanvasDoc(idea, docIdOrTitle);
    if (!doc)
        throw new Error(`Canvas doc not found: ${docIdOrTitle}`);
    const notes = (() => { try {
        return JSON.parse(doc.content || '[]');
    }
    catch {
        return [];
    } })();
    const idx = notes.findIndex((n) => n.id === stickyId);
    if (idx === -1)
        throw new Error(`Sticky not found: ${stickyId}`);
    notes[idx] = { ...notes[idx], ...updates };
    const docUpdated = { ...doc, content: JSON.stringify(notes), updatedAt: now() };
    ideas[ideaIdx] = { ...idea, docs: (idea.docs || []).map((d) => d.id === doc.id ? docUpdated : d), updatedAt: now() };
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Updated sticky ${stickyId}` }] };
});
server.tool("vega_delete_sticky", "Delete a sticky note from a canvas doc.", {
    ideaId: z.string(),
    docIdOrTitle: z.string(),
    stickyId: z.string().describe("Sticky note ID to delete"),
}, async ({ ideaId, docIdOrTitle, stickyId }) => {
    const ideas = await vegaGet("/api/ideas");
    const ideaIdx = ideas.findIndex((i) => i.id === ideaId);
    if (ideaIdx === -1)
        throw new Error(`Idea not found: ${ideaId}`);
    const idea = ideas[ideaIdx];
    const doc = findCanvasDoc(idea, docIdOrTitle);
    if (!doc)
        throw new Error(`Canvas doc not found: ${docIdOrTitle}`);
    const notes = (() => { try {
        return JSON.parse(doc.content || '[]');
    }
    catch {
        return [];
    } })();
    const cleaned = notes
        .filter((n) => n.id !== stickyId)
        .map((n) => ({ ...n, connections: (n.connections || []).filter((c) => c.toId !== stickyId) }));
    const docUpdated = { ...doc, content: JSON.stringify(cleaned), updatedAt: now() };
    ideas[ideaIdx] = { ...idea, docs: (idea.docs || []).map((d) => d.id === doc.id ? docUpdated : d), updatedAt: now() };
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Deleted sticky ${stickyId}` }] };
});
server.tool("vega_connect_stickies", "Draw a connection (arrow) between two sticky notes in a canvas doc.", {
    ideaId: z.string(),
    docIdOrTitle: z.string(),
    fromStickyId: z.string().describe("Source sticky ID"),
    toStickyId: z.string().describe("Target sticky ID"),
    fromAnchor: z.enum(["top", "right", "bottom", "left"]).default("right"),
    toAnchor: z.enum(["top", "right", "bottom", "left"]).default("left"),
}, async ({ ideaId, docIdOrTitle, fromStickyId, toStickyId, fromAnchor, toAnchor }) => {
    const ideas = await vegaGet("/api/ideas");
    const ideaIdx = ideas.findIndex((i) => i.id === ideaId);
    if (ideaIdx === -1)
        throw new Error(`Idea not found: ${ideaId}`);
    const idea = ideas[ideaIdx];
    const doc = findCanvasDoc(idea, docIdOrTitle);
    if (!doc)
        throw new Error(`Canvas doc not found: ${docIdOrTitle}`);
    const notes = (() => { try {
        return JSON.parse(doc.content || '[]');
    }
    catch {
        return [];
    } })();
    const fromIdx = notes.findIndex((n) => n.id === fromStickyId);
    if (fromIdx === -1)
        throw new Error(`Source sticky not found: ${fromStickyId}`);
    const existing = notes[fromIdx].connections || [];
    const dupe = existing.some((c) => c.toId === toStickyId && c.fromAnchor === fromAnchor && c.toAnchor === toAnchor);
    if (!dupe) {
        notes[fromIdx] = { ...notes[fromIdx], connections: [...existing, { toId: toStickyId, fromAnchor, toAnchor }] };
    }
    const docUpdated = { ...doc, content: JSON.stringify(notes), updatedAt: now() };
    ideas[ideaIdx] = { ...idea, docs: (idea.docs || []).map((d) => d.id === doc.id ? docUpdated : d), updatedAt: now() };
    await vegaPost("/api/ideas", ideas);
    return { content: [{ type: "text", text: `Connected ${fromStickyId} → ${toStickyId}` }] };
});
// ── Transport ──────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
