'use strict';
const http  = require('node:http');
const https = require('node:https');
const fs    = require('node:fs');
const path  = require('node:path');
const os    = require('node:os');
const { exec } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const IS_PKG      = process.pkg !== undefined;
const IS_ELECTRON = !!process.versions.electron;

const PORT      = 3690;
const HTML_FILE = path.join(__dirname, 'renderer', 'index.html');
const LIB_DIR   = path.join(__dirname, 'lib');

const CONFIG_FILE = path.join(os.homedir(), '.vega-config.json');
const DEFAULT_DATA_DIR = (IS_PKG || IS_ELECTRON) ? path.join(os.homedir(), '.vega') : path.join(__dirname, 'data');

let DATA_DIR         = DEFAULT_DATA_DIR;
let TASKS_DIR        = '';
let NOTES_DIR        = '';
let INDEX_FILE       = '';
let LINKS_FILE       = '';
let RECURRING_FILE   = '';
let ATTACHMENTS_FILE = '';
let CHAT_FILE        = '';
let FOLDERS_FILE     = '';
let MCP_FILE         = '';
let IMAGES_DIR       = '';

function applyDataDir(dir) {
  DATA_DIR         = dir;
  const yearDir    = path.join(dir, String(new Date().getFullYear()));
  TASKS_DIR        = path.join(yearDir, 'tasks');
  NOTES_DIR        = path.join(dir, 'notes');
  INDEX_FILE       = path.join(dir, 'index.json');
  LINKS_FILE       = path.join(dir, 'links.json');
  RECURRING_FILE   = path.join(dir, 'recurring.json');
  ATTACHMENTS_FILE = path.join(dir, 'attachments.json');
  CHAT_FILE        = path.join(dir, 'chat.json');
  FOLDERS_FILE     = path.join(dir, 'folders.json');
  MCP_FILE         = path.join(dir, 'mcp.json');
  IMAGES_DIR       = path.join(dir, 'images');
  fs.mkdirSync(TASKS_DIR, { recursive: true });
  fs.mkdirSync(NOTES_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  // Migrate legacy flat files → per-item dirs
  migrateJsonToDir(path.join(yearDir, 'tasks.json'), TASKS_DIR, t => taskSubDir(TASKS_DIR, t));
  migrateJsonToDir(path.join(dir, 'notes.json'), NOTES_DIR, null);
  rebuildIndex();
}

// Load saved config, fall back to default
try {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  applyDataDir(typeof cfg.dataDir === 'string' && cfg.dataDir ? cfg.dataDir : DEFAULT_DATA_DIR);
} catch {
  applyDataDir(DEFAULT_DATA_DIR);
}

const TITLE_RE = /<title[^>]*>([^<]*)<\/title>/i;
const HTML_ENTITIES = [['&amp;','&'],['&lt;','<'],['&gt;','>'],['&#39;',"'"],['&quot;','"']];

const readJson  = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '[]';
const writeJson = (file, body) => { JSON.parse(body); fs.writeFileSync(file, body, 'utf8'); };
const jsonOk    = (res, body) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(body); };
const readBody  = (req, cb)  => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => cb(b)); };

// ── per-item file storage helpers ──────────────────────────────────────────────

function taskSubDir(baseDir, task) {
  const s = task.status || 'ready';
  if (s === 'completed') {
    const month = (task.completedAt || new Date().toISOString()).slice(0, 7);
    return path.join(baseDir, 'completed', month);
  }
  return path.join(baseDir, s);
}

function walkDir(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) walkDir(full, onFile);
    else if (f.name.endsWith('.json')) onFile(full, f.name);
  }
}

function readDirRecursive(dir) {
  const results = [];
  walkDir(dir, full => { try { results.push(JSON.parse(fs.readFileSync(full, 'utf8'))); } catch {} });
  return JSON.stringify(results);
}

function findFile(baseDir, id) {
  let found = null;
  walkDir(baseDir, (full, name) => { if (name === `${id}.json`) found = full; });
  return found;
}

function rebuildIndex() {
  const taskEntries = [], noteEntries = [];
  walkDir(TASKS_DIR, full => {
    try {
      const t = JSON.parse(fs.readFileSync(full, 'utf8'));
      taskEntries.push({ id: t.id, path: path.relative(DATA_DIR, full), title: t.title,
        status: t.status, priority: t.priority, type: t.type, tags: t.tags,
        planStartDate: t.planStartDate, planEndDate: t.planEndDate, parentId: t.parentId,
        createdAt: t.createdAt });
    } catch {}
  });
  walkDir(NOTES_DIR, full => {
    try {
      const n = JSON.parse(fs.readFileSync(full, 'utf8'));
      noteEntries.push({ id: n.id, path: path.relative(DATA_DIR, full), title: n.title,
        tags: n.tags, pinned: n.pinned, folderId: n.folderId, createdAt: n.createdAt });
    } catch {}
  });
  if (INDEX_FILE) fs.writeFileSync(INDEX_FILE,
    JSON.stringify({ updatedAt: new Date().toISOString(), tasks: taskEntries, notes: noteEntries }), 'utf8');
}

function writeDirItems(baseDir, body, subDirFn) {
  const arr = JSON.parse(body);
  const incoming = new Set(arr.map(item => item.id));
  for (const item of arr) {
    const dir = subDirFn ? subDirFn(item) : baseDir;
    fs.mkdirSync(dir, { recursive: true });
    const newPath = path.join(dir, `${item.id}.json`);
    const oldPath = findFile(baseDir, item.id);
    if (oldPath && oldPath !== newPath) fs.unlinkSync(oldPath);
    fs.writeFileSync(newPath, JSON.stringify(item), 'utf8');
  }
  walkDir(baseDir, (full, name) => {
    if (!incoming.has(name.replace('.json', ''))) fs.unlinkSync(full);
  });
  rebuildIndex();
}

function migrateJsonToDir(jsonFile, baseDir, subDirFn) {
  if (!fs.existsSync(jsonFile)) return;
  try {
    writeDirItems(baseDir, fs.readFileSync(jsonFile, 'utf8'), subDirFn);
    fs.renameSync(jsonFile, jsonFile + '.bak');
  } catch {}
}

// Per-item task/note helpers used by AI tools
function readTaskFile(id) {
  const p = findFile(TASKS_DIR, id);
  return p ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}
function writeTaskFile(task) {
  const dir = taskSubDir(TASKS_DIR, task);
  fs.mkdirSync(dir, { recursive: true });
  const newPath = path.join(dir, `${task.id}.json`);
  const oldPath = findFile(TASKS_DIR, task.id);
  if (oldPath && oldPath !== newPath) fs.unlinkSync(oldPath);
  fs.writeFileSync(newPath, JSON.stringify(task), 'utf8');
  rebuildIndex();
}
function deleteTaskFile(id) {
  const toDelete = new Set([id]);
  const allTasks = JSON.parse(readDirRecursive(TASKS_DIR));
  let prev = 0;
  while (toDelete.size !== prev) {
    prev = toDelete.size;
    for (const t of allTasks) { if (t.parentId && toDelete.has(t.parentId)) toDelete.add(t.id); }
  }
  for (const tid of toDelete) { const p = findFile(TASKS_DIR, tid); if (p) fs.unlinkSync(p); }
  rebuildIndex();
  return toDelete.size;
}
function readNoteFile(id) {
  const p = path.join(NOTES_DIR, `${id}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}
function writeNoteFile(note) {
  fs.writeFileSync(path.join(NOTES_DIR, `${note.id}.json`), JSON.stringify(note), 'utf8');
  rebuildIndex();
}
function deleteNoteFile(id) {
  const p = path.join(NOTES_DIR, `${id}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  rebuildIndex();
}

// ── route handlers ─────────────────────────────────────────────────────────────

function serveLib(res, url) {
  const name = path.basename(url.slice(5));
  const file = path.join(LIB_DIR, name);
  if (/^[\w.-]+\.js$/.test(name) && fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(fs.readFileSync(file));
  } else {
    res.writeHead(404); res.end('Not found');
  }
}

function serveAsset(res, filename, contentType) {
  const file = path.join(__dirname, filename);
  try {
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
  }
  catch { res.writeHead(404); res.end('Not found'); }
}

function serveHtml(res) {
  try { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(HTML_FILE, 'utf8')); }
  catch { res.writeHead(500); res.end('Could not read index.html'); }
}

function handleGetJson(res, file) {
  try { jsonOk(res, readJson(file)); }
  catch { res.writeHead(500); res.end('[]'); }
}

function handlePostJson(req, res, file) {
  readBody(req, body => {
    try { writeJson(file, body); jsonOk(res, '{"ok":true}'); }
    catch { res.writeHead(400); res.end('Invalid JSON'); }
  });
}

function decodeHtmlEntities(str) {
  let s = str;
  for (const [entity, char] of HTML_ENTITIES) s = s.replaceAll(entity, char);
  return s.replace(/\s+/g, ' ');
}

function handleFetchTitle(req, res) {
  const targetUrl = new URL(req.url, 'http://localhost').searchParams.get('url');
  if (!targetUrl) { res.writeHead(400); res.end('{"error":"missing url"}'); return; }

  let protocol;
  try { protocol = new URL(targetUrl).protocol; }
  catch { jsonOk(res, '{"title":""}'); return; }

  const mod = protocol === 'https:' ? https : http;
  const outReq = mod.get(
    targetUrl,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Vega/1.0)' }, timeout: 6000 },
    (r) => {
      let html = '';
      r.setEncoding('utf8');
      r.on('data', chunk => { html += chunk; if (html.length > 80000) outReq.destroy(); });
      r.on('end', () => {
        const m = TITLE_RE.exec(html);
        const title = m ? decodeHtmlEntities(m[1].trim()) : '';
        if (!res.headersSent) jsonOk(res, JSON.stringify({ title }));
      });
    }
  );
  outReq.on('error', () => { if (!res.headersSent) jsonOk(res, '{"title":""}'); });
  outReq.on('timeout', () => outReq.destroy());
}

function handleUploadImage(req, res) {
  readBody(req, body => {
    try {
      const { name, data, entityId, entityType } = JSON.parse(body);
      const m = data.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) { res.writeHead(400); res.end('Invalid data'); return; }
      const mime = m[1];
      const ext  = (mime.split('/')[1] || 'bin').replace('jpeg', 'jpg');
      const nameNoExt = (name || 'file').replace(/\.[^.]*$/, '');
      const safe      = nameNoExt.replace(/[^a-zA-Z0-9_-]/g, '_') || 'file';
      const filename  = `${Date.now()}_${safe}.${ext}`;
      const filepath  = path.join(IMAGES_DIR, filename);
      fs.writeFileSync(filepath, Buffer.from(m[2], 'base64'));
      const url  = `/api/images/${filename}`;
      const size = fs.statSync(filepath).size;
      const att  = {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: name || filename, filename, url, mime, size,
        entityId: entityId || null, entityType: entityType || null,
        createdAt: new Date().toISOString(),
      };
      const all = JSON.parse(readJson(ATTACHMENTS_FILE));
      all.push(att);
      fs.writeFileSync(ATTACHMENTS_FILE, JSON.stringify(all), 'utf8');
      jsonOk(res, JSON.stringify(att));
    } catch { res.writeHead(400); res.end('Upload failed'); }
  });
}

function handleGetAttachments(req, res) {
  const entityId = new URL(req.url, 'http://localhost').searchParams.get('entityId');
  try {
    const all      = JSON.parse(readJson(ATTACHMENTS_FILE));
    const filtered = entityId ? all.filter(a => a.entityId === entityId) : all;
    jsonOk(res, JSON.stringify(filtered));
  } catch { jsonOk(res, '[]'); }
}

function handleDeleteAttachment(req, res) {
  readBody(req, body => {
    try {
      const { id } = JSON.parse(body);
      const all = JSON.parse(readJson(ATTACHMENTS_FILE));
      const att = all.find(a => a.id === id);
      if (att) {
        const file = path.join(IMAGES_DIR, att.filename);
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      fs.writeFileSync(ATTACHMENTS_FILE, JSON.stringify(all.filter(a => a.id !== id)), 'utf8');
      jsonOk(res, '{"ok":true}');
    } catch { res.writeHead(400); res.end('Failed'); }
  });
}

function handleGetConfig(res) {
  jsonOk(res, JSON.stringify({ dataDir: DATA_DIR }));
}

function handleSetConfig(req, res) {
  readBody(req, body => {
    try {
      const { dataDir } = JSON.parse(body);
      if (!dataDir || typeof dataDir !== 'string') { res.writeHead(400); res.end('{"error":"invalid dataDir"}'); return; }
      const resolved = dataDir.startsWith('~') ? path.join(os.homedir(), dataDir.slice(1)) : path.resolve(dataDir);
      applyDataDir(resolved);
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ dataDir: resolved }), 'utf8');
      jsonOk(res, JSON.stringify({ ok: true, dataDir: resolved }));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
  });
}

function serveImage(res, url) {
  const filename = path.basename(url.replace('/api/images/', ''));
  const file = path.join(IMAGES_DIR, filename);
  const ext = path.extname(filename).slice(1).toLowerCase();
  const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
  if (/^[\w.-]+$/.test(filename) && fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  } else {
    res.writeHead(404); res.end('Not found');
  }
}

// ── AI integration (OpenAI-compatible) ────────────────────────────────────

function callAI(apiKey, baseUrl, payload) {
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  }).then(r => r.json());
}

// ── MCP client ────────────────────────────────────────────────────────────────

let _mcpReqId = 0;

async function mcpPost(url, method, params) {
  const id = ++_mcpReqId;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  // Handle both plain JSON and SSE-wrapped responses
  const line = text.split('\n').find(l => l.startsWith('{') || l.startsWith('data: {'));
  return line ? JSON.parse(line.replace(/^data:\s*/, '')) : JSON.parse(text);
}

async function getMcpServerTools(server) {
  try {
    await mcpPost(server.url, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'vega', version: '1.5.0' },
    });
    const r = await mcpPost(server.url, 'tools/list', {});
    if (r.error || !Array.isArray(r.result?.tools)) return [];
    return r.result.tools.map(t => ({
      function: {
        name: `mcp_${t.name}`,
        description: `[${server.name}] ${t.description || t.name}`,
        parameters: t.inputSchema || { type: 'object', properties: {} },
      },
      _mcpToolName: t.name,
    }));
  } catch { return []; }
}

async function callMcpTool(server, originalName, args) {
  try {
    const r = await mcpPost(server.url, 'tools/call', { name: originalName, arguments: args || {} });
    if (r.error) return { error: r.error.message || JSON.stringify(r.error) };
    const content = r.result?.content;
    if (Array.isArray(content)) return content.map(c => (c.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
    return r.result ?? r;
  } catch (e) { return { error: e.message }; }
}

const AI_TOOLS = [
  { type: 'function', function: { name: 'list_tasks',   description: 'Get all tasks. Returns id, title, status, priority, planEndDate, tags, note.',
    parameters: { type: 'object', properties: { status: { type: 'string', enum: ['ready','in_progress','paused','completed','skipped'], description: 'Optional status filter' } } } } },
  { type: 'function', function: { name: 'create_task',  description: 'Create a new task.',
    parameters: { type: 'object', required: ['title'], properties: {
      title:       { type: 'string' },
      priority:    { type: 'integer', description: '1=highest priority, 5=lowest. Default 3.' },
      planEndDate: { type: 'string',  description: 'Due date YYYY-MM-DD' },
      tags:        { type: 'array', items: { type: 'string' } },
      note:        { type: 'string' },
      parentId:    { type: 'string', description: 'Parent task id for subtasks' },
    } } } },
  { type: 'function', function: { name: 'update_task',  description: 'Update an existing task by id.',
    parameters: { type: 'object', required: ['id'], properties: {
      id: { type: 'string' }, title: { type: 'string' }, note: { type: 'string' }, description: { type: 'string' },
      status:      { type: 'string', enum: ['ready','in_progress','paused','completed','skipped'] },
      priority:    { type: 'integer' },
      planEndDate: { type: 'string' },
      tags:        { type: 'array', items: { type: 'string' } },
    } } } },
  { type: 'function', function: { name: 'delete_task',  description: 'Delete a task and its subtasks by id.',
    parameters: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
  { type: 'function', function: { name: 'list_notes',   description: 'Get all notes. Returns id, title, tags, pinned, folderId, updatedAt.',
    parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'create_note',  description: 'Create a new note.',
    parameters: { type: 'object', required: ['title'], properties: {
      title:    { type: 'string' },
      content:  { type: 'string', description: 'Markdown content' },
      tags:     { type: 'array', items: { type: 'string' } },
      folderId: { type: 'string' },
    } } } },
  { type: 'function', function: { name: 'update_note',  description: 'Update an existing note by id.',
    parameters: { type: 'object', required: ['id'], properties: {
      id: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' },
      tags:   { type: 'array', items: { type: 'string' } },
      pinned: { type: 'boolean' }, folderId: { type: 'string' },
    } } } },
  { type: 'function', function: { name: 'delete_note',  description: 'Delete a note by id.',
    parameters: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
  { type: 'function', function: { name: 'list_links',   description: 'Get all bookmarks. Returns id, url, title, description, tags.',
    parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'create_link',  description: 'Create a new bookmark.',
    parameters: { type: 'object', required: ['url', 'title'], properties: {
      url: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    } } } },
  { type: 'function', function: { name: 'update_link',  description: 'Update an existing bookmark by id.',
    parameters: { type: 'object', required: ['id'], properties: {
      id: { type: 'string' }, url: { type: 'string' }, title: { type: 'string' },
      description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } },
    } } } },
  { type: 'function', function: { name: 'delete_link',  description: 'Delete a bookmark by id.',
    parameters: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
  { type: 'function', function: { name: 'navigate_to',  description: 'Navigate the UI to a specific tab.',
    parameters: { type: 'object', required: ['tab'], properties: {
      tab: { type: 'string', enum: ['todo','active','paused','done','calendar','analysis','notes','links','recurring','settings'] },
    } } } },
  { type: 'function', function: { name: 'open_task',    description: 'Open the task detail popup for a specific task by id.',
    parameters: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
  { type: 'function', function: { name: 'open_note',    description: 'Open a specific note for viewing/editing by id. Navigates to the Notes tab and opens the note.',
    parameters: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
  { type: 'function', function: { name: 'open_link',    description: 'Open a bookmark URL in the system browser by id.',
    parameters: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
  { type: 'function', function: { name: 'show_dynamic_view', description: 'Create a dynamic page to display filtered or custom data when no dedicated page exists. Use this for queries like "show skipped tasks", "notes tagged X", "all high priority tasks", custom summaries, etc. Include _type field ("task","note","link","custom") on each item.',
    parameters: { type: 'object', required: ['title', 'items'], properties: {
      title:       { type: 'string', description: 'Page title, e.g. "Skipped Tasks" or "High Priority Notes"' },
      description: { type: 'string', description: 'Brief description of what this view shows' },
      items:       { type: 'array', description: 'Items to display. Each item should have a _type field and relevant fields.', items: { type: 'object' } },
    } } } },
  { type: 'function', function: { name: 'update_settings', description: 'Update app settings. Can change theme (light/dark) or font size.',
    parameters: { type: 'object', properties: {
      theme:    { type: 'string', enum: ['light', 'dark'], description: 'UI theme' },
      fontSize: { type: 'string', enum: ['small', 'medium', 'large'], description: 'Font size' },
    } } } },
];

const READ_ONLY_TOOLS = new Set(['list_tasks', 'list_notes', 'list_links', 'navigate_to', 'open_task', 'open_note', 'open_link', 'show_dynamic_view']);

function isoToday() { return new Date().toISOString().slice(0, 10); }

// ── per-domain tool handlers ──────────────────────────────────────────────────

function toolTasks(name, args) {
  if (name === 'list_tasks') {
    const tasks = JSON.parse(readDirRecursive(TASKS_DIR));
    const list = args.status ? tasks.filter(t => t.status === args.status) : tasks;
    return list.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, planEndDate: t.planEndDate, tags: t.tags, note: t.note }));
  }
  if (name === 'create_task') {
    const today = isoToday();
    const task = {
      id: randomUUID(), title: args.title, description: '', note: args.note || '',
      priority: args.priority ?? 3, type: '', tags: args.tags || [], links: [],
      planStartDate: today, planEndDate: args.planEndDate || today,
      estimate: '', actualTime: '', status: 'ready', completed: false,
      completedAt: null, parentId: args.parentId || null,
      createdAt: new Date().toISOString(),
    };
    writeTaskFile(task);
    return { ok: true, id: task.id, title: task.title };
  }
  if (name === 'update_task') {
    const task = readTaskFile(args.id);
    if (!task) return { error: 'Task not found' };
    const { id, ...fields } = args;
    if (fields.status === 'completed') { fields.completed = true; fields.completedAt = new Date().toISOString(); }
    writeTaskFile({ ...task, ...fields });
    return { ok: true };
  }
  if (name === 'delete_task') {
    return { ok: true, deleted: deleteTaskFile(args.id) };
  }
  return null;
}

function toolNotes(name, args) {
  if (name === 'list_notes') {
    return JSON.parse(readDirRecursive(NOTES_DIR)).map(n => ({ id: n.id, title: n.title, tags: n.tags, pinned: n.pinned, folderId: n.folderId, updatedAt: n.updatedAt }));
  }
  if (name === 'create_note') {
    const note = {
      id: randomUUID(), title: args.title, content: args.content || '',
      tags: args.tags || [], pinned: false, folderId: args.folderId || null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    writeNoteFile(note);
    return { ok: true, id: note.id, title: note.title };
  }
  if (name === 'update_note') {
    const note = readNoteFile(args.id);
    if (!note) return { error: 'Note not found' };
    const { id, ...fields } = args;
    fields.updatedAt = new Date().toISOString();
    writeNoteFile({ ...note, ...fields });
    return { ok: true };
  }
  if (name === 'delete_note') {
    deleteNoteFile(args.id);
    return { ok: true };
  }
  return null;
}

function toolLinks(name, args) {
  if (name === 'list_links') return JSON.parse(readJson(LINKS_FILE));
  if (name === 'create_link') {
    const links = JSON.parse(readJson(LINKS_FILE));
    const link = {
      id: randomUUID(), url: args.url, title: args.title || args.url,
      description: args.description || '', tags: args.tags || [],
      createdAt: new Date().toISOString(),
    };
    links.push(link);
    fs.writeFileSync(LINKS_FILE, JSON.stringify(links), 'utf8');
    return { ok: true, id: link.id, title: link.title };
  }
  if (name === 'update_link') {
    const links = JSON.parse(readJson(LINKS_FILE));
    const idx = links.findIndex(l => l.id === args.id);
    if (idx === -1) return { error: 'Link not found' };
    const { id, ...fields } = args;
    links[idx] = { ...links[idx], ...fields };
    fs.writeFileSync(LINKS_FILE, JSON.stringify(links), 'utf8');
    return { ok: true };
  }
  if (name === 'delete_link') {
    const links = JSON.parse(readJson(LINKS_FILE));
    fs.writeFileSync(LINKS_FILE, JSON.stringify(links.filter(l => l.id !== args.id)), 'utf8');
    return { ok: true };
  }
  return null;
}

function toolUI(name, args) {
  if (name === 'navigate_to')     return { ok: true, navigate: args.tab };
  if (name === 'open_task')       return { ok: true, uiAction: { type: 'open_task', id: args.id } };
  if (name === 'open_note')       return { ok: true, uiAction: { type: 'open_note', id: args.id } };
  if (name === 'update_settings') return { ok: true, uiAction: { type: 'update_settings', patch: args } };
  if (name === 'show_dynamic_view') {
    const view = { id: randomUUID(), title: args.title, description: args.description || '', items: args.items || [], createdAt: new Date().toISOString() };
    return { ok: true, uiAction: { type: 'show_dynamic_view', view } };
  }
  if (name === 'open_link') {
    const link = JSON.parse(readJson(LINKS_FILE)).find(l => l.id === args.id);
    if (!link) return { error: 'Bookmark not found' };
    return { ok: true, uiAction: { type: 'open_link', url: link.url, title: link.title } };
  }
  return null;
}

function executeAiTool(name, args) {
  return toolUI(name, args) ?? toolTasks(name, args) ?? toolNotes(name, args) ?? toolLinks(name, args) ?? { error: `Unknown tool: ${name}` };
}

async function buildMcpContext() {
  const servers = JSON.parse(readJson(MCP_FILE)).filter(s => s.enabled !== false);
  const mcpMap = {};
  const mcpToolDefs = [];
  for (const server of servers) {
    for (const t of await getMcpServerTools(server)) {
      if (!mcpMap[t.function.name]) {
        mcpMap[t.function.name] = { server, originalName: t._mcpToolName };
        mcpToolDefs.push({ type: 'function', function: t.function });
      }
    }
  }
  return { mcpMap, allTools: [...AI_TOOLS, ...mcpToolDefs] };
}

async function runToolCall(call, mcpMap) {
  let args;
  try { args = JSON.parse(call.function.arguments); } catch { args = {}; }
  console.log('[AI] tool:', call.function.name, JSON.stringify(args));
  let result, navigate = null, uiAction = null, writes = false;
  if (mcpMap[call.function.name]) {
    const { server, originalName } = mcpMap[call.function.name];
    result = await callMcpTool(server, originalName, args);
  } else {
    result = executeAiTool(call.function.name, args);
    navigate = result.navigate || null;
    uiAction = result.uiAction || null;
    writes = !READ_ONLY_TOOLS.has(call.function.name);
  }
  return { msg: { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) }, navigate, uiAction, writes };
}

async function processToolCalls(toolCalls, mcpMap) {
  let navigate = null, changed = false;
  const uiActions = [], msgs = [];
  for (const call of toolCalls) {
    const { msg, navigate: nav, uiAction, writes } = await runToolCall(call, mcpMap);
    if (nav) navigate = nav;
    if (uiAction) uiActions.push(uiAction);
    if (writes) changed = true;
    msgs.push(msg);
  }
  return { msgs, navigate, uiActions, changed };
}

async function runAgentLoop(apiKey, apiUrl, model, loop, allTools, mcpMap) {
  let changed = false, navigate = null, uiActions = [], reply = '';
  for (let i = 0; i < 10; i++) {
    const result = await callAI(apiKey, apiUrl, { model, messages: loop, tools: allTools, tool_choice: 'auto', temperature: 0.1, max_tokens: 4096 });
    if (result.error) throw new Error((typeof result.error === 'string' ? result.error : result.error.message) || JSON.stringify(result.error));
    const choice = result.choices?.[0];
    if (!choice) throw new Error('No response from AI');
    loop.push(choice.message);
    const toolCalls = choice.message.tool_calls;
    if (!toolCalls?.length || choice.finish_reason === 'stop') { reply = choice.message.content?.trim() ?? ''; break; }
    const r = await processToolCalls(toolCalls, mcpMap);
    if (r.navigate) navigate = r.navigate;
    if (r.changed) changed = true;
    uiActions.push(...r.uiActions);
    loop.push(...r.msgs);
  }
  return { changed, navigate, uiActions, reply };
}

async function handleAiChat(req, res) {
  readBody(req, async (body) => {
    try {
      const { messages, apiKey, model, apiUrl } = JSON.parse(body);
      if (!apiKey) { res.writeHead(400); res.end(JSON.stringify({ error: 'API token required. Configure it in Settings → AI Assistant.' })); return; }
      if (!apiUrl) { res.writeHead(400); res.end(JSON.stringify({ error: 'API URL required. Configure it in Settings → AI Assistant.' })); return; }

      const normalise = (c) => {
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) return c.filter(b => b.type === 'text').map(b => b.text).join('\n');
        return String(c);
      };

      const today = isoToday();
      const snapshot = {
        tasks: JSON.parse(fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf8') : '{"tasks":[],"notes":[]}').tasks.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, planEndDate: t.planEndDate, tags: t.tags, parentId: t.parentId })),
        notes: JSON.parse(fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf8') : '{"tasks":[],"notes":[]}').notes.map(n => ({ id: n.id, title: n.title, tags: n.tags, pinned: n.pinned, folderId: n.folderId })),
        links: JSON.parse(readJson(LINKS_FILE)).map(l => ({ id: l.id, url: l.url, title: l.title, tags: l.tags })),
      };

      const loop = [
        { role: 'system', content: `You are Vega AI, a personal productivity assistant built into the Vega app. Today is ${today}.

## CRITICAL RULES — follow without exception:
1. You MUST call a tool to perform any action. NEVER say "Done", "I've opened", "I've changed", "It's been switched", or any similar phrase unless you have already called the corresponding tool and received a successful result. Claiming to do something without calling a tool is a serious error.
2. To open a bookmark in the browser → call open_link with the bookmark id.
3. To open a task detail popup → call open_task with the task id.
4. To open a note → call open_note with the note id.
5. To navigate to a tab → call navigate_to with the tab name.
6. To change theme or font size → call update_settings.
7. To create/update/delete tasks, notes, or bookmarks → call the appropriate tool.
8. After calling a tool successfully, give a concise one-sentence confirmation. No invented emojis or excited sign-offs.

## Live data snapshot (use these ids for tool calls):
TASKS: ${JSON.stringify(snapshot.tasks)}
NOTES: ${JSON.stringify(snapshot.notes)}
BOOKMARKS: ${JSON.stringify(snapshot.links)}

Task statuses: ready, in_progress, paused, completed, skipped. Priority: 1=highest, 5=lowest.` },
        ...messages.map(m => ({ role: m.role, content: normalise(m.content) })).filter(m => m.content.trim()),
      ];

      const { mcpMap, allTools } = await buildMcpContext();
      const { reply, changed, navigate, uiActions } = await runAgentLoop(apiKey, apiUrl, model || 'claude-sonnet-4-6', loop, allTools, mcpMap);
      if (!reply) console.log('[AI] WARNING: empty reply after loop');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reply, changed, navigate, uiActions }));
    } catch (e) {
      console.error('[AI] error:', e.message);
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
  });
}


const ROUTES = [
  { method: 'GET',  test: (u) => u.startsWith('/lib/'),             fn: (q, s) => serveLib(s, q.url) },
  { method: 'GET',  test: (u) => u.startsWith('/favicon.svg') || u.startsWith('/icon.svg'), fn: (_, s) => serveAsset(s, path.join('assets', 'icon.svg'), 'image/svg+xml') },
  { method: 'GET',  test: (u) => u === '/' || u === '/index.html',  fn: (_, s) => serveHtml(s) },
  { method: 'GET',  test: (u) => u === '/api/tasks',
    fn: (_, s) => { try { jsonOk(s, readDirRecursive(TASKS_DIR)); } catch { s.writeHead(500); s.end('[]'); } } },
  { method: 'POST', test: (u) => u === '/api/tasks',
    fn: (q, s) => readBody(q, b => { try { writeDirItems(TASKS_DIR, b, t => taskSubDir(TASKS_DIR, t)); jsonOk(s, '{"ok":true}'); } catch { s.writeHead(400); s.end('Invalid JSON'); } }) },
  { method: 'GET',  test: (u) => u === '/api/links',                fn: (_, s) => handleGetJson(s, LINKS_FILE) },
  { method: 'POST', test: (u) => u === '/api/links',                fn: (q, s) => handlePostJson(q, s, LINKS_FILE) },
  { method: 'GET',  test: (u) => u === '/api/notes',
    fn: (_, s) => { try { jsonOk(s, readDirRecursive(NOTES_DIR)); } catch { s.writeHead(500); s.end('[]'); } } },
  { method: 'POST', test: (u) => u === '/api/notes',
    fn: (q, s) => readBody(q, b => { try { writeDirItems(NOTES_DIR, b, null); jsonOk(s, '{"ok":true}'); } catch { s.writeHead(400); s.end('Invalid JSON'); } }) },
  { method: 'GET',  test: (u) => u === '/api/index',                fn: (_, s) => handleGetJson(s, INDEX_FILE) },
  { method: 'GET',  test: (u) => u === '/api/recurring',            fn: (_, s) => handleGetJson(s, RECURRING_FILE) },
  { method: 'POST', test: (u) => u === '/api/recurring',            fn: (q, s) => handlePostJson(q, s, RECURRING_FILE) },
  { method: 'GET',  test: (u) => u.startsWith('/api/fetch-title?'),    fn: (q, s) => handleFetchTitle(q, s) },
  { method: 'POST', test: (u) => u === '/api/upload',                  fn: (q, s) => handleUploadImage(q, s) },
  { method: 'GET',  test: (u) => u.startsWith('/api/images/'),         fn: (q, s) => serveImage(s, q.url) },
  { method: 'GET',  test: (u) => u.startsWith('/api/attachments'),     fn: (q, s) => handleGetAttachments(q, s) },
  { method: 'POST', test: (u) => u === '/api/attachments/delete',      fn: (q, s) => handleDeleteAttachment(q, s) },
  { method: 'GET',  test: (u) => u === '/api/chat',                    fn: (_, s) => handleGetJson(s, CHAT_FILE) },
  { method: 'POST', test: (u) => u === '/api/chat',                    fn: (q, s) => handlePostJson(q, s, CHAT_FILE) },
  { method: 'GET',  test: (u) => u === '/api/folders',                 fn: (_, s) => handleGetJson(s, FOLDERS_FILE) },
  { method: 'POST', test: (u) => u === '/api/folders',                 fn: (q, s) => handlePostJson(q, s, FOLDERS_FILE) },
  { method: 'GET',  test: (u) => u === '/api/mcp',                     fn: (_, s) => handleGetJson(s, MCP_FILE) },
  { method: 'POST', test: (u) => u === '/api/mcp',                     fn: (q, s) => handlePostJson(q, s, MCP_FILE) },
  { method: 'GET',  test: (u) => u === '/api/config',                  fn: (_, s) => handleGetConfig(s) },
  { method: 'POST', test: (u) => u === '/api/config',                  fn: (q, s) => handleSetConfig(q, s) },
  { method: 'POST', test: (u) => u === '/api/ai/chat',                 fn: (q, s) => handleAiChat(q, s) },
];

const server = http.createServer((req, res) => {
  const route = ROUTES.find(r => r.method === req.method && r.test(req.url));
  if (route) { route.fn(req, res); return; }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ✦ Vega is running → http://localhost:${PORT}\n`);
  if (IS_PKG || IS_ELECTRON) console.log(`  Data directory: ${DATA_DIR}\n`);
  if (!IS_ELECTRON) {
    let openCmd;
    if (process.platform === 'win32') openCmd = 'start';
    else if (process.platform === 'darwin') openCmd = 'open';
    else openCmd = 'xdg-open';
    try { exec(`${openCmd} http://localhost:${PORT}`); } catch { /* ignore */ }
  }
});

module.exports = { server };
