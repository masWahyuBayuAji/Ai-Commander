#!/usr/bin/env node

const { exec } = require('node:child_process');
const os = require('node:os');
const db = require('../src/db/connection');
const { createServer } = require('../src/server/http-server');
const { startIpcServer } = require('../src/server/ipc-socket');
const uuid = require('../src/shared/uuid');

const PORT = process.env.PORT || 4321;

// --- TASK-029: Recovery orphaned tasks on startup ---
function recoverOrphanedTasks() {
  const orphaned = db.prepare(
    "SELECT id, title FROM tasks WHERE session_status = 'running'"
  ).all();

  if (orphaned.length === 0) return;

  const now = new Date().toISOString();
  const updateStmt = db.prepare(
    "UPDATE tasks SET session_status = 'interrupted', session_pid = NULL, updated_at = ? WHERE id = ?"
  );
  const insertEvent = db.prepare(
    "INSERT INTO task_events (id, task_id, type, content, created_at) VALUES (?, ?, 'error', ?, ?)"
  );

  const recover = db.transaction(() => {
    for (const task of orphaned) {
      updateStmt.run(now, task.id);
      insertEvent.run(
        uuid(),
        task.id,
        'Server direstart, session sebelumnya terputus. Silakan mulai ulang task ini secara manual.',
        now
      );
    }
  });

  recover();
  console.log(`Recovered ${orphaned.length} orphaned task(s)`);
}

// --- Open browser (cross-platform) ---
function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') cmd = `open "${url}"`;
  else if (platform === 'win32') cmd = `start "${url}"`;
  else cmd = `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) console.log(`  (could not auto-open browser: ${err.message})`);
  });
}

// --- Main startup sequence ---
// 1. Init DB & migration (already done via require above)
// 2. Recovery orphaned tasks
recoverOrphanedTasks();

// 3. Start HTTP server + WS + static serving
const server = createServer(PORT);
server.listen(PORT, () => {
  const dashboardUrl = `http://localhost:${PORT}`;
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║  ai-commander is running!            ║`);
  console.log(`  ║  Dashboard: ${dashboardUrl.padEnd(24)}║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);

  // 4. Start unix socket IPC
  startIpcServer(PORT);

  // 5. server.json is already written by startIpcServer (ipc-socket.js)

  // 6. Optionally open browser
  if (!process.env.NO_BROWSER) {
    openBrowser(dashboardUrl);
  }
});
