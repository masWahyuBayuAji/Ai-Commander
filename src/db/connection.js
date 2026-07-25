const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const DB_DIR = path.join(os.homedir(), '.ai-commander');
const DB_PATH = path.join(DB_DIR, 'data.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Migration runner ---
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )
`);

const applied = db.prepare('SELECT name FROM _migrations').all().map(r => r.name);
const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

const runMigration = db.transaction((sql, name) => {
  db.exec(sql);
  db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(name, new Date().toISOString());
});

for (const file of migrationFiles) {
  if (!applied.includes(file)) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    runMigration(sql, file);
  }
}

// --- Seed default kanban groups (TASK-006) ---
function seedDefaultKanbanGroups() {
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM kanban_groups').get();
  if (count.cnt > 0) return;

  const now = new Date().toISOString();

  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
    'use_grouping_project', 'false'
  );

  const groups = [
    { name: 'TO-DO',        position: 0, slash_command: '/todo',         is_locked_todo: 1, is_locked_done: 0, instruction: null },
    { name: 'ON PROGRESS',  position: 1, slash_command: '/on-progress',  is_locked_todo: 0, is_locked_done: 0, instruction: null },
    { name: 'NEED REVIEW',  position: 2, slash_command: '/need-review',  is_locked_todo: 0, is_locked_done: 0, instruction: null },
    { name: 'COMMIT',       position: 3, slash_command: '/commit',       is_locked_todo: 0, is_locked_done: 0, instruction: null },
    { name: 'DONE',         position: 4, slash_command: '/done',         is_locked_todo: 0, is_locked_done: 1, instruction: 'Jalankan /context sebelum /exit.' },
  ];

  const ids = [];
  const insert = db.prepare(`
    INSERT INTO kanban_groups (id, project_group_id, name, slash_command, position,
      is_locked_todo, is_locked_done, next_step_group_id, instruction, created_at, updated_at)
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const linkNext = db.prepare('UPDATE kanban_groups SET next_step_group_id = ? WHERE id = ?');

  const seedAll = db.transaction(() => {
    for (const g of groups) {
      const id = crypto.randomUUID();
      ids.push(id);
      insert.run(id, g.name, g.slash_command, g.position, g.is_locked_todo, g.is_locked_done, null, g.instruction, now, now);
    }
    for (let i = 0; i < ids.length - 1; i++) {
      linkNext.run(ids[i + 1], ids[i]);
    }
  });

  seedAll();
}

seedDefaultKanbanGroups();

module.exports = db;
