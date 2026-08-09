# ARCHITECTURE.md — ai-commander

Dokumen ini menjelaskan arsitektur teknis `ai-commander` secara detail: stack,
struktur folder, skema database, state machine kanban, protokol komunikasi
CLI ↔ Server, dan alur hemat-token yang jadi dasar desain aplikasi ini.

---

## 1. Prinsip Desain

1. **Native-first**: sebisa mungkin tidak pakai framework besar (React, Vue,
   Express, dll). Frontend = HTML/CSS/JS murni yang di-serve oleh
   `node:http`. Backend = modul native Node.js (`node:http`, `node:child_process`,
   `node:crypto`, `node:fs`, `node:path`, `node:events`, `node:net`).
2. **Dependency pihak ketiga hanya untuk hal yang mustahil dibuat manual
   secara wajar**:
   - `better-sqlite3` → driver SQLite (native binding, wajib karena Node
     tidak punya SQLite driver bawaan yang stabil secara sync).
   - `node-pty` → untuk membuka pseudo-terminal (dibutuhkan agar output CLI
     Claude Code/OpenCode — termasuk kontrol warna/cursor — bisa ditangkap
     dan direplay persis seperti terminal asli di **Task Progress View** dan
     **Orchestrator Terminal**).
   - `ws` → WebSocket server ringan untuk push update realtime ke browser
     (dashboard, kanban board, terminal stream). Alternatif native
     (long-polling via `node:http`) sengaja dihindari karena tidak efisien
     untuk streaming terminal output.
   - `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links` →
     terminal emulator di browser untuk merender output PTY dengan akurat
     (ANSI color, cursor, Unicode, dll). Di-vendored di `public/vendor/`
     agar tidak memerlukan bundler.
   - `uuid` **tidak dipakai** — gunakan `crypto.randomUUID()` bawaan Node.
   Semua dependency lain (routing, validasi, ORM, dsb.) **dibuat manual**.
3. **1 Task = 1 Session CLI**: setiap task yang dijalankan membuka **satu**
   proses CLI (`claude` atau `opencode`) dalam satu pty, dari awal hingga
   task selesai/keluar. Tidak ada arsitektur multi-agent/multi-commander yang
   saling polling — ini akar penyebab borosnya quota di tool lain yang sudah
   dicoba sebelumnya.
4. **Bypass permission**: proses CLI dijalankan dengan flag `--dangerously-skip-permissions`
   (Claude Code) atau `--auto` (OpenCode) sehingga tidak ada prompt konfirmasi
   yang menggantung menunggu user.
5. **Instruksi tahap kanban dikirim sekali di awal** (lewat prompt atau
   custom agent file), bukan lewat polling berulang. Agent AI sendiri yang
   secara aktif memanggil `ai-commander-cli update ...` ketika mencapai
   checkpoint tahap berikutnya (lihat §6). Ini menghindari overhead
   network/polling terus-menerus.

---

## 2. Tech Stack

| Layer            | Teknologi                                                      |
|-------------------|-----------------------------------------------------------------|
| Runtime           | Node.js >= 18                                                   |
| HTTP Server       | `node:http` (native), routing manual                            |
| Realtime          | `ws` (WebSocket)                                                 |
| Database          | SQLite via `better-sqlite3`                                      |
| Terminal / PTY    | `node-pty`                                                       |
| Terminal UI       | `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links`  |
| Frontend          | HTML + CSS + Vanilla JS (tanpa framework), di-serve statis        |
| CLI Bridge        | Binary kedua `ai-commander-cli` (native `node:net` unix socket)   |
| Packaging         | npm package dengan 2 bin entry: `ai-commander`, `ai-commander-cli`|

---

## 3. Struktur Folder

```
ai-commander/
├── bin/
│   ├── server.js          # entrypoint "ai-commander" (npx ai-commander)
│   └── cli.js             # entrypoint "ai-commander-cli" (dipanggil oleh AI agent)
├── src/
│   ├── server/
│   │   ├── http-server.js     # native http server + static file serving
│   │   ├── router.js          # manual routing (path matcher sederhana)
│   │   ├── ws-server.js       # websocket broadcast hub
│   │   ├── ipc-socket.js      # unix socket listener untuk ai-commander-cli
│   │   └── routes/
│   │       ├── settings.routes.js
│   │       ├── project-groups.routes.js
│   │       ├── kanban-groups.routes.js
│   │       ├── tasks.routes.js
│   │       ├── deleted-tasks.routes.js
│   │       ├── dashboard.routes.js
│   │       ├── project-alias-mappings.routes.js
│   │       └── orchestrator.routes.js
│   ├── db/
│   │   ├── connection.js      # inisialisasi better-sqlite3 + migration runner
│   │   ├── migrations/
│   │   │   ├── 001_init.sql
│   │   │   ├── 002_add_is_locked_delete.sql
│   │   │   ├── 003_add_project_alias_mappings.sql
│   │   │   ├── 004_drop_repo_path.sql
│   │   │   └── 005_add_is_working_directory.sql
│   │   └── repositories/
│   │       ├── settings.repo.js
│   │       ├── projectGroup.repo.js
│   │       ├── kanbanGroup.repo.js
│   │       ├── task.repo.js
│   │       ├── tokenUsage.repo.js
│   │       └── projectAliasMapping.repo.js
│   ├── core/
│   │   ├── kanban-state-machine.js   # validasi "next step move to"
│   │   ├── trigger-next-task.js        # auto-start next task saat DONE (shared by HTTP + IPC)
│   │   ├── task-runner.js            # spawn pty, kirim prompt awal, capture output
│   │   ├── orchestrator-runner.js    # pty khusus utk halaman Orchestrator
│   │   ├── recovery.js               # recover orphaned tasks saat server restart (NOTE: dead code, lihat §13)
│   │   ├── provider-adapters/
│   │   │   ├── index.js              # adapter registry + getAdapter()
│   │   │   ├── claude-code.adapter.js
│   │   │   └── opencode.adapter.js
│   │   ├── prompt-builder.js         # bangun prompt instruksi awal task
│   │   ├── orchestrator-prompt-builder.js # bangun prompt instruksi awal orchestrator
│   │   ├── opencode-agent-file.js    # manage custom agent file (task runner + orchestrator) utk OpenCode
│   │   ├── claude-code-system-prompt-file.js # manage file system prompt sementara utk Claude Code task runner
│   │   └── token-usage-parser.js     # parse token usage dari output CLI
│   └── shared/
│       ├── uuid.js             # wrapper crypto.randomUUID()
│       └── short-id.js         # generator uuid pendek (8 char) utk task
├── public/
│   ├── index.html
│   ├── orchestrator.html          # standalone orchestrator page (legacy/alternate)
│   ├── css/app.css
│   ├── vendor/                     # xterm.js library (vendored)
│   │   ├── xterm/
│   │   ├── xterm-addon-fit/
│   │   └── xterm-addon-web-links/
│   └── js/
│       ├── app.js
│       ├── kanban.js
│       ├── list-view.js
│       ├── settings.js
│       ├── dashboard.js
│       ├── project-alias-mapping.js
│       ├── task-progress.js     # xterm.js terminal renderer utk stream pty
│       ├── orchestrator.js      # xterm.js terminal renderer utk orchestrator
│       ├── deleted-task.js
│       ├── modal.js
│       └── ws-client.js
├── package.json
├── README.md
├── ARCHITECTURE.md
├── LICENSE.md
└── TASKS.md
```

---

## 4. Skema Database (SQLite)

Semua tabel pakai **soft delete** via kolom `deleted_at` (nullable datetime,
ISO string). Tidak ada `DELETE` fisik kecuali proses purge eksplisit di masa
depan (di luar cakupan tahap 1).

**Catatan**: Skema awal mengalami beberapa migrasi (003-005) yang menghapus
kolom `repo_path` dari `project_groups` dan menambahkan tabel
`project_alias_mappings` beserta Working Directory. Skema di bawah adalah
**status akhir** setelah seluruh migrasi dijalankan.

```sql
-- Final schema setelah migration 001-007

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL         -- JSON string
);
-- contoh row: ('use_grouping_project', 'true' | 'false')
-- contoh row: ('selected_project_group', '<project_group_id> | "default"')
-- contoh row: ('task_runner_agent_mode', '"interactive" | "headless"')

CREATE TABLE project_groups (
  id TEXT PRIMARY KEY,            -- uuid
  name TEXT NOT NULL,             -- alias, contoh: "PROJECT A", "Backend PROJECT A"
  use_alias_mapping INTEGER NOT NULL DEFAULT 0,  -- 1 = pakai alias mapping (multi-path)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL
);

CREATE TABLE project_alias_mappings (
  id TEXT PRIMARY KEY,                -- uuid
  project_group_id TEXT NOT NULL,     -- FK ke project_groups
  alias TEXT NOT NULL,                -- nama alias, contoh: "frontend", "backend"
  path TEXT NOT NULL,                 -- path absolut ke folder
  is_working_directory INTEGER NOT NULL DEFAULT 0,  -- 1 = working directory aktif utk cwd PTY
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL,
  FOREIGN KEY (project_group_id) REFERENCES project_groups(id)
);

CREATE TABLE kanban_groups (
  id TEXT PRIMARY KEY,                 -- uuid
  project_group_id TEXT NULL,          -- NULL jika use_grouping_project = false
  name TEXT NOT NULL,                  -- "TO-DO", "ON PROGRESS", dst
  slash_command TEXT NOT NULL,         -- "/todo", "/on-progress", "/need-review", dst
  position INTEGER NOT NULL,           -- urutan tampilan kolom kanban
  is_locked_todo INTEGER NOT NULL DEFAULT 0,  -- 1 jika ini kolom TO-DO (tak boleh dihapus)
  is_locked_done INTEGER NOT NULL DEFAULT 0,  -- 1 jika ini kolom DONE (tak boleh dihapus)
  is_locked_delete INTEGER NOT NULL DEFAULT 0, -- 1 jika kolom ini tak boleh dihapus (mis. ON PROGRESS)
  next_step_group_id TEXT NULL,        -- FK ke kanban_groups.id ("next step move to")
  instruction TEXT NULL,               -- instruksi default utk agent di tahap ini
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL,
  FOREIGN KEY (project_group_id) REFERENCES project_groups(id),
  FOREIGN KEY (next_step_group_id) REFERENCES kanban_groups(id)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,               -- short uuid (8 char, lihat shared/short-id.js)
  project_group_id TEXT NULL,
  kanban_group_id TEXT NOT NULL,     -- posisi kanban saat ini
  title TEXT NOT NULL,               -- ringkasan singkat (opsional, auto dari detail)
  detail TEXT NOT NULL,              -- "Detail Task" dari form New Task
  ai_provider TEXT NOT NULL,         -- 'claude-code' | 'opencode'
  session_pid INTEGER NULL,          -- pid proses pty yang sedang berjalan (jika ada)
  session_status TEXT NOT NULL DEFAULT 'idle', -- idle | running | waiting_manual | finished | error | interrupted
  started_at TEXT NULL,
  finished_at TEXT NULL,
  next_run_task_id TEXT NULL,          -- FK ke tasks.id (auto-start next task saat DONE)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL,
  FOREIGN KEY (project_group_id) REFERENCES project_groups(id),
  FOREIGN KEY (kanban_group_id) REFERENCES kanban_groups(id),
  FOREIGN KEY (next_run_task_id) REFERENCES tasks(id)
);

CREATE TABLE task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,   -- 'log' | 'stage_change' | 'error' | 'token_usage'
  content TEXT NOT NULL,  -- teks log mentah / JSON payload
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE token_usage (
  id TEXT PRIMARY KEY,
  project_group_id TEXT NULL,
  task_id TEXT NOT NULL,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_tasks_kanban_group ON tasks(kanban_group_id);
CREATE INDEX idx_tasks_project_group ON tasks(project_group_id);
CREATE INDEX idx_tasks_deleted_at ON tasks(deleted_at);
CREATE INDEX idx_tasks_next_run_task ON tasks(next_run_task_id);
CREATE INDEX idx_task_events_task_id ON task_events(task_id);
```

**Catatan default seed** (dijalankan sekali saat DB pertama kali dibuat):
- Jika `use_grouping_project = false` (atau tabel kosong): buat 5 `kanban_groups`
  default dengan `project_group_id = NULL`: `TO-DO` (locked_todo),
  `ON PROGRESS` (locked_delete), `NEED REVIEW`, `COMMIT`,
  `DONE` (locked_done), dengan `next_step_group_id` berantai sesuai urutan tsb.
- Jika user membuat project group baru lewat UI (dengan alias mapping), server
  otomatis membuat **3 kanban groups default** untuk project group tsb:
  `TO-DO` → `ON PROGRESS` → `DONE` (tanpa `NEED REVIEW` dan `COMMIT`).
  User bisa menambahkan kanban group tambahan secara manual lewat Setting.
- `TO-DO` selalu `instruction = NULL`.
- `DONE` default instruction: `"Jalankan /context sebelum /exit."`
- `ON PROGRESS` di-lock dari delete (`is_locked_delete = 1`) karena merupakan
  kolom transisi wajib yang tidak boleh dihapus.

---

## 5. Halaman & Endpoint API (ringkas)

Base URL: `http://localhost:<port>` (port disimpan di `~/.ai-commander/server.json`
bersama path unix socket, dibaca oleh `ai-commander-cli`).

| Method | Path                                            | Fungsi                                      |
|--------|--------------------------------------------------|----------------------------------------------|
| GET    | `/`                                              | Serve UI (index.html)                        |
| GET    | `/api/settings`                                  | Ambil settings                               |
| PUT    | `/api/settings`                                  | Update settings (use_grouping_project, selected_project_group, dll.) |
| GET    | `/api/project-groups`                            | List project group (alias mapping)           |
| POST   | `/api/project-groups`                            | Buat project group baru                      |
| PUT    | `/api/project-groups/:id`                        | Edit project group                           |
| DELETE | `/api/project-groups/:id`                        | Soft delete project group                    |
| GET    | `/api/kanban-groups?project_group_id=`           | List kanban group (per project group / null) |
| POST   | `/api/kanban-groups`                             | Tambah kanban group                          |
| PUT    | `/api/kanban-groups/:id`                         | Edit kanban group (next_step, instruction) — next_step editable untuk semua group termasuk TO-DO |
| DELETE | `/api/kanban-groups/:id`                         | Hapus kanban group (kecuali locked)          |
| GET    | `/api/tasks?project_group_id=&kanban_group_id=`  | List task (untuk kanban/list view)           |
| POST   | `/api/tasks`                                     | Buat task baru (di TO-DO)                    |
| PUT    | `/api/tasks/:id`                                 | Edit task (detail, provider) — konversi `aiProvider` → `ai_provider` otomatis |
| POST   | `/api/tasks/:id/start`                           | Mulai session CLI utk task ini                |
| POST   | `/api/tasks/:id/transition`                      | Pindah kanban group (dipakai UI & CLI bridge)|
| DELETE | `/api/tasks/:id`                                 | Soft delete (set deleted_at)                 |
| POST   | `/api/tasks/:id/restore`                         | Restore ke TO-DO (dari Deleted Task view)     |
| GET    | `/api/tasks/deleted`                             | List task ter-soft-delete                     |
| PUT    | `/api/tasks/:id/next-run`                     | Set/clear `next_run_task_id` (link task ke task berikutnya) |
| POST   | `/api/tasks/:id/input`                       | Kirim input ke running task PTY (follow-up instruction)     |
| POST   | `/api/tasks/:id/resize`                      | Resize PTY terminal task                                    |
| GET    | `/api/tasks/debug/next-run`                   | Debug: cek kolom `next_run_task_id` & status TO-DO groups |
| GET    | `/api/tasks/:id/events`                          | Ambil log events task utk Task Progress View  |
| GET    | `/api/dashboard/summary`                         | Total token usage (K) + total done per group  |
| GET    | `/api/project-alias-mappings?project_group_id=` | List alias mappings untuk project group       |
| WS     | `/ws`                                          | WebSocket endpoint — client kirim `{ subscribe: "channel" }` untuk join channel |
|        | → channel `board`                              | Broadcast update kanban (task_updated, token_usage) |
|        | → channel `task:<id>`                          | Stream live terminal output + exit event per task |
|        | → channel `orchestrator`                       | Stream live terminal orchestrator |
| POST   | `/api/orchestrator/start`                        | Buka pty orchestrator (body: `{ provider, projectGroupId? }`) — stop process lama dulu jika ada |
| POST   | `/api/orchestrator/stop`                         | Hentikan pty orchestrator yang sedang jalan                             |
| POST   | `/api/orchestrator/input`                        | Kirim input ke pty orchestrator                                        |
| POST   | `/api/orchestrator/resize`                       | Resize terminal orchestrator                                           |
| GET    | `/api/orchestrator/status`                       | Cek status orchestrator (running/provider)                              |
| POST   | `/api/orchestrator/create-tasks`                 | Buat task baru dari orchestrator (bulk create)                                       |
| GET    | `/api/orchestrator/context`                       | Ambil context project groups & kanban groups untuk orchestrator                       |

---

## 6. Alur Task & Protokol CLI Bridge (Hemat Token)

### 6.1 Saat task di-*start* dari TO-DO

1. User mengklik tombol **Start** pada task card di kolom TO-DO.
2. Frontend menampilkan **optimistic UI**: tombol di-disable dan teks berubah
   menjadi "Starting...", task card mendapat border hijau dengan label
   "Running" jika `session_status === 'running'`.
3. Server mengambil daftar `kanban_groups` untuk `project_group_id` task
   tersebut (atau global jika null), diurutkan sesuai `position`.
2. Server membangun **instruksi workflow** (berbeda per provider):
   - **Claude Code**: `prompt-builder.js` menghasilkan instruksi workflow lengkap berisi
     `project_group_uuid`, `task_uuid`, `next_step_group_id` (UUID target
     langsung dari kanban group saat ini), `done_group_id`, daftar kanban
     group beserta `slash_command`, `next_step_group_id`, `instruction`,
     perintah eksplisit untuk menjalankan `ai-commander-cli update ...`
     dengan UUID target yang sudah terisi (bukan placeholder), **serta
     `task.detail` dari user** (lihat §6.1a). Instruksi ini ditulis ke
     file sementara (`.claude-tmp/task-<id>.md`) oleh
     `claude-code-system-prompt-file.js` untuk menghindari limit panjang
     argumen CLI (ARG_MAX). File path dikirim ke CLI lewat flag
     `--append-system-prompt-file`. Mode **INTERACTIVE**: tanpa `--print`,
     AI bisa tanya balik ke user. Mode **HEADLESS**: tambah `--print`,
     output ke stdout dan exit otomatis. Keduanya pakai
     `--dangerously-skip-permissions --verbose`.
   - **OpenCode**: Karena OpenCode tidak mendukung flag `--system`, konteks
      kanban **serta `task.detail` dari user** ditulis ke **custom agent
      file** (`.opencode/agents/aic-task-<id>.md`) oleh
      `opencode-agent-file.js`. File ini berisi instruksi workflow yang
      sama dengan prompt Claude Code, termasuk `next_step_group_id` yang
      sudah terisi langsung. Mode **INTERACTIVE**: prompt dikirim lewat
      flag `--prompt` (`opencode --auto --prompt "prompt" --agent <name>`),
      sehingga AI bisa tanya balik ke user. Mode **HEADLESS**: prompt
      dikirim sebagai positional argumen (`opencode run --auto --agent <name> "prompt"`),
      non-interactive. File agent dihapus otomatis saat task selesai (masuk DONE).
   - **Read-First Instruction** (kedua provider): Jika cwd adalah home
     directory (`isCwdHome = true`), prompt/agent file akan menyertakan
     instruksi agar AI membaca `AGENTS.md`/`CLAUDE.md` dari setiap path
     project alias mapping sebelum memulai operasi (lihat §8).
3. Server memindahkan task dari `TO-DO` ke `next_step_group_id` milik
   `TO-DO` (default: `ON PROGRESS`) — **transisi ini terjadi sebelum** agent
   mulai bekerja, sesuai keinginan alur di spesifikasi.
4. Server men-spawn 1 proses pty (`task-runner.js`) menjalankan CLI provider
   (`claude` atau `opencode`) di `cwd = repo_path` project group tsb, dengan
   flag bypass-permission, lalu mengirim prompt dari langkah 2 sebagai input
   pertama.
5. Seluruh output pty di-stream ke `task_events` (type `log`) dan
   di-broadcast via WebSocket ke Task Progress View yang sedang membuka
   task tsb.
6. Jika terjadi error, frontend menampilkan alert dan mengembalikan tombol
   Start ke kondisi aktif.

### 6.2 Saat agent memanggil `ai-commander-cli update ...` atau `ai-commander-cli create ...`

**Update (pindah kanban group):**
```
ai-commander-cli update <project_group_uuid|-> <task_uuid> <target_kanban_group_uuid>
```

- `ai-commander-cli` adalah proses Node kecil yang terhubung ke **unix
  socket** milik server yang sedang jalan (path dibaca dari
  `~/.ai-commander/server.json`).
- Ia mengirim payload `{ type: "transition", projectGroupId, taskId, targetKanbanGroupId }`.
- Server menerima via `ipc-socket.js`, memvalidasi transisi lewat
  `kanban-state-machine.js` (target harus valid & merupakan salah satu
  kanban group yang terdaftar), lalu:
  - Update `tasks.kanban_group_id`
  - Insert `task_events` (type `stage_change`)
  - Broadcast update ke semua client WS yang membuka board tsb (realtime,
    **tanpa polling** dari browser — browser cukup subscribe WS sekali).
    Struktur pesa WS: `{ channel: 'board', data: { type: 'task_updated', data: <task> } }`.
  - **Next Run auto-trigger**: Jika kanban group tujuan adalah DONE
    (`is_locked_done = 1`) DAN task punya `next_run_task_id`, server
    memanggil `triggerNextTask()` (modul `src/core/trigger-next-task.js`)
    untuk otomatis memulai task berikutnya (session terpisah).
    Trigger ini juga dipanggil dari HTTP endpoint `POST /api/tasks/:id/transition`.
- Jika kanban group tujuan punya `instruction` baru, instruksi tsb seharusnya
  di-*append* sebagai pesan lanjutan ke pty task yang sama (tetap 1 session
  CLI, tidak membuka proses baru) — sehingga agent langsung tahu instruksi
  tahap berikutnya tanpa harus di-*restart*. **Catatan**: fungsi
  `sendFollowupInstruction()` di `task-runner.js` sudah diimplementasi tapi
  belum dipanggil dari IPC handler (`ipc-socket.js`) maupun route manapun.
  Saat ini, instruksi tahap baru hanya dikirim saat agent AI memanggil
  `ai-commander-cli update ...` (agent sendiri yang melanjutkan berdasarkan
  instruksi awal yang dikirim di awal session).
- Proses ini berulang otomatis hingga task mencapai kolom `DONE`, kecuali
  ada tahap yang secara eksplisit ditandai *manual* di instruksinya.

**Create (buat task baru):**
```
ai-commander-cli create <project_group_uuid|-> <detail> [ai_provider]
```

- `ai-commander-cli` mengirim payload `{ type: "create", projectGroupId,
  detail, aiProvider }` ke server lewat unix socket.
- Server menerima via `ipc-socket.js`, menemukan kolom `TO-DO` untuk
  project group tsb, lalu membuat task baru via `taskRepo.create()`.
- Broadcast update ke semua client WS (realtime).
- Command ini dipanggil oleh AI agent di Orchestrator ketika user meminta
  membuat task baru.

### 6.3 Kenapa ini hemat token/quota

- Tidak ada proses "commander" tambahan yang mem-*poll* status atau
  membuka sesi CLI terpisah untuk sekadar memonitor (unlike arsitektur
  multi-commander yang sudah dicoba sebelumnya).
- Instruksi seluruh tahap kanban dikirim **sekali** di awal, bukan
  di-*fetch* ulang tiap transisi.
- 1 task tetap 1 pty/1 session CLI dari `ON PROGRESS` sampai `DONE`;
  transisi antar kolom hanya mengganti status di DB + mengirim pesan
  lanjutan ke pty yang sama.

### 6.4 Saat user membuat task dari Orchestrator
### 6.5 Next Run — Auto-Trigger Task

Fitur **Next Run** memungkinkan user menghubungkan satu task ke task lainnya,
sehingga saat task pertama selesai (pindah ke kolom DONE), task berikutnya
otomatis di-start (dalam session CLI terpisah).

**Cara kerja:**

1. User mengklik **icon polygon** di pojok kanan atas task card (task A).
2. Board masuk **linking mode**: icon polygon pada task A berubah menjadi icon "X" (cancel/clear), dan task lain menampilkan icon "+" (drop link here).
3. User mengklik task card tujuan (task B) untuk membuat koneksi. Server menyimpan `next_run_task_id = <task_b_id>` di tabel `tasks` untuk task A.
4. **Clear next run**: Jika task A sudah memiliki `next_run_task_id`, user bisa mengklik icon "X" pada task A lagi untuk **menghapus** koneksi next run (set `next_run_task_id = NULL`). Jika task A belum memiliki `next_run_task_id`, klik icon "X" hanya membatalkan linking mode.
5. Saat task A dipindah ke kolom DONE (baik via UI drag-drop maupun CLI
   `ai-commander-cli update`), server mendeteksi:
   - `targetGroup.is_locked_done === 1` (target adalah kolom DONE)
   - `task.next_run_task_id` tidak kosong
5. Server memanggil `triggerNextTask(nextTaskId)` yang:
   - Memvalidasi task berikutnya ada dan masih di kolom TO-DO
   - Memindahkan task dari TO-DO ke ON PROGRESS (via `validateAndTransition`)
   - Spawn PTY baru via `taskRunner.startTask()` (session terpisah)
   - Broadcast update ke semua client WS

**Backend**: `src/core/trigger-next-task.js` — modul terpisah yang di-import
baik oleh HTTP route (`tasks.routes.js`) maupun IPC socket handler
(`ipc-socket.js`).

**Frontend**: Task card menampilkan:
- **Icon polygon** di pojok kanan atas (klik untuk memulai linking / mengakhiri linking / menghapus next run)
- **Label "next run: {task_id}"** di bawah deskripsi jika task memiliki
  `next_run_task_id`
- **SVG bezier connection lines** antar task card yang ter-link (overlay
  di atas kanban board, di-draw ulang saat resize/scroll)

**Linking mode behavior**:
- Klik icon polygon pada task → masuk linking mode (icon berubah "X", task lain menampilkan icon "+")
- Klik icon "+" pada task lain → set `next_run_task_id` ke task tersebut
- Klik icon "X" pada task yang sudah memiliki `next_run_task_id` → **clear/unlink** `next_run_task_id`
- Klik icon "X" pada task yang belum memiliki `next_run_task_id` → batal linking mode


```
ai-commander-cli create <project_group_uuid|-> <detail> [ai_provider]
```

1. User membuka halaman Orchestrator, memilih provider (OpenCode/Claude Code).
2. Server spawn PTY dalam mode interaktif:
   - **Claude Code**: `claude --dangerously-skip-permissions --system-prompt "..."`.
     Prompt berisi project alias mapping, syntax create/update task, daftar
     project groups & kanban groups.
   - **OpenCode**: Menulis **custom agent file**
      `.opencode/agents/aic-orchestrator-<projectGroupName>.md` (nama di-sanitize:
     lowercase, spasi jadi `-`), lalu spawn `opencode --agent <agentName>`.
     File agent berisi instruksi yang sama dengan prompt Claude Code.
3. User mengetik permintaan dalam bahasa alami (mis. "buat task baru dengan
   deskripsi 'abc'").
4. AI agent di orchestrator mengenali permintaan tersebut dan menjalankan
   `ai-commander-cli create <project_uuid> "abc" opencode` di terminal.
5. `ai-commander-cli` mengirim payload `{ type: "create", projectGroupId,
   detail, aiProvider }` ke server lewat unix socket.
6. Server (`ipc-socket.js`) membuat task baru di kolom `TO-DO`, lalu
   broadcast update ke UI kanban via WebSocket.
7. Task baru muncul di kolom `TO-DO` secara realtime tanpa refresh.
8. Saat orchestrator di-stop, server menghapus file agent orchestrator
   secara otomatis (cleanup).

---

## 7. Task Progress View & Orchestrator (PTY)

- Menggunakan `node-pty` untuk membuka pseudo-terminal asli agar output
  (termasuk ANSI escape code, progress bar, dsb.) identik dengan menjalankan
  CLI secara manual di terminal.
- Frontend merender stream terminal menggunakan **`@xterm/xterm`**
  (`public/js/task-progress.js` dan `public/js/orchestrator.js`) dengan addon
  `@xterm/addon-fit` (auto-resize) dan `@xterm/addon-web-links` (klik link
  di terminal). Library xterm.js di-vendored di `public/vendor/xterm/` agar
  tidak memerlukan bundler. CSS xterm.js di-load via `<link>` di `index.html`.
- **Task Progress View**: dibuka sebagai **slide-in panel di sisi kiri layar**
  saat user mengklik tombol "View" pada task card. Panel menggunakan xterm.js
  terminal dengan theme gelap (GitHub-style), `cursorBlink: true`,
  `allowProposedApi: true`, dan `scrollback: 10000`. Terminal bersifat
  **interaktif** — user bisa mengetik langsung di terminal untuk mengirim
  input ke task yang sedang berjalan (via `POST /api/tasks/:id/input`).
  History log di-load dari `GET /api/tasks/:id/events`, lalu live stream
  masuk lewat WebSocket channel `task:<id>`. Panel juga mendukung
  **resize otomatis** via `@xterm/addon-fit` dan **klik link** via
  `@xterm/addon-web-links`. Panel bisa di-close tanpa memutus WebSocket
  channel `board` (hanya disconnect channel task spesifik).
- **Task Progress Input**: user bisa mengetik langsung di terminal xterm.js
  untuk mengirim input ke task yang sedang berjalan. Setiap keystroke
  dikirim via `POST /api/tasks/:id/input` → `sendFollowupInstruction()`
  di `task-runner.js` yang menulis ke PTY. Mode INTERACTIVE: input tanpa
  `\n` (biarkan user tekan Enter sendiri). Mode HEADLESS: input dengan
  `\n` (auto-submit).
- **Emergency Stop**: tombol di panel task progress untuk menghentikan
  proses PTY yang sedang berjalan (`POST /api/tasks/:id/stop`).
- **Orchestrator** memakai mekanisme pty yang sama, tapi tidak terikat ke 1
  task — ini adalah sesi bebas untuk membuat/menyusun banyak task/list task
  otomatis. Orchestrator ditampilkan sebagai **slide-in panel** di sisi kanan
  layar (bukan modal terpisah), dengan terminal xterm.js interaktif
  (`disableStdin: false`, `cursorBlink: true`). User bisa mengetik langsung
  di terminal orchestrator.

**Task Card UI**:
- Task dengan `session_status === 'running'` mendapat **border hijau** dan
  label "Running" di samping task ID.
- Tombol Start berubah menjadi **disabled "Running"** saat task sedang
  berjalan.
- Tombol **View** tersedia di semua kolom (bukan hanya TO-DO) untuk melihat
  progress task kapan saja. Saat orchestrator di-start:
  - **Claude Code**: server mengirim **initial prompt**
    (`orchestrator-prompt-builder.js`) lewat `--system-prompt` flag.
  - **OpenCode**: server menulis **custom agent file**
     `.opencode/agents/aic-orchestrator-<projectGroupName>.md` dan spawn
    `opencode --agent <agentName>`. Prompt yang sama dimasukkan sebagai isi
    agent file.
  - Prompt berisi: project alias mapping (name → UUID), syntax create task
    (`ai-commander-cli create`), syntax move task (`ai-commander-cli update`),
    daftar project groups & kanban groups, serta aturan workflow.
  - AI agent di orchestrator menerima prompt ini dan mengetahui cara membuat
    task secara langsung lewat CLI, tanpa perlu user mengetahui syntax
    command-nya. Selain itu, endpoint `POST /api/orchestrator/create-tasks`
    juga tersedia untuk pembuatan task via HTTP (bulk create).
- **Setiap kali user membuka Orchestrator**, frontend selalu memanggil
  `POST /api/orchestrator/stop` terlebih dahulu untuk membunuh process lama
  (jika ada), lalu `POST /api/orchestrator/start` untuk spawn session baru.
  Ini memastikan orchestrator selalu mulai dalam kondisi bersih — tidak ada
  residual state dari session sebelumnya (termasuk setelah browser reload).
- Orchestrator mendukung **resize otomatis** via `@xterm/addon-fit`:
  `ResizeObserver` dan `window.resize` event memicu `fitAddon.fit()`, lalu
  mengirim dimensi baru ke server via `POST /api/orchestrator/resize`.

---

## 8. Project Group (Multi-Repository)

- Setting → `Use Grouping Project? yes/no` disimpan di tabel `settings`.
- **Jika yes**: user mendefinisikan banyak `project_groups` (nama alias +
  daftar path). Tiap project group memiliki:
  - **`use_alias_mapping`**: `0` = mode sederhana (1 path), `1` = mode alias
    mapping (banyak path per project group).
  - **`project_alias_mappings`**: tabel terpisah yang menyimpan mapping
    `alias` → `path` untuk tiap project group. Setiap alias bisa ditandai
    sebagai **Working Directory** (`is_working_directory = 1`) yang
    digunakan sebagai `cwd` saat spawn PTY task.
  - Semua `kanban_groups` yang dibuat lewat Setting akan meminta memilih
    `project_group_id` tertentu. Kanban board di halaman utama menyediakan
    dropdown "Change Project Group" untuk berpindah konteks papan kanban
    antar repo. Pilihan terakhir disimpan otomatis ke tabel `settings`
    (key: `selected_project_group`) dan di-restore saat halaman di-reload.
- **Jika no**: `kanban_groups.project_group_id = NULL` untuk semua kanban
  group, hanya ada 1 papan kanban global, task tidak terikat repo tertentu
  secara eksplisit lewat sistem ini (path kerja bisa diisi manual per task
  jika diperlukan, di luar cakupan tahap 1 — dicatat sebagai catatan open
  di TASKS.md).

**Sticky Toolbar**: Header (tombol view toggle + Setting) dan toolbar
(dropdown Project Group + Orchestrator) dibungkus dalam satu container
`.top-bar` dengan `position: sticky; top: 0` sehingga keduanya tetap
terlihat di atas layar saat user scroll-y ke bawah.

**Working Directory**: Saat task di-start, cwd PTY ditentukan oleh:
1. Jika ada `project_alias_mappings` dengan `is_working_directory = 1` untuk
   project group tsb → gunakan `path` dari alias tsb.
2. Jika tidak ada → fallback ke `os.homedir()`.
3. Jika tidak ada project group → gunakan `process.cwd()` (folder tempat
   `ai-commander` dijalankan).

**AGENTS.md / CLAUDE.md Read-First Instruction**: Jika working directory
adalah home directory (`cwd === os.homedir()`, artinya tidak ada alias
`is_working_directory = 1` yang dikonfigurasi), ai-commander otomatis
menambahkan instruksi ke prompt/agent file agar AI membaca file instruksi
dari setiap project alias mapping path **sebelum** memulai operasi apapun
di path tersebut:

- **OpenCode**: Prioritas baca `AGENTS.md`, fallback ke `CLAUDE.md` jika
  tidak ditemukan. Juga berlaku untuk orchestrator.
- **Claude Code**: Prioritas baca `CLAUDE.md`, fallback ke `AGENTS.md` jika
  tidak ditemukan. Juga berlaku untuk orchestrator.

Fitur ini memastikan AI mengikuti konvensi/project rules yang sudah ada di
masing-masing repository sebelum mulai bekerja, meskipun cwd-nya adalah
home directory (bukan path project spesifik).

**Default kanban groups per project group**: Ketika user membuat project group
baru lewat UI, server otomatis membuat **3 kanban groups** default untuk
project group tsb (berbeda dari 5 group global):
- `TO-DO` (locked_todo) → `ON PROGRESS` (locked_delete) → `DONE` (locked_done)
- User bisa menambahkan `NEED REVIEW`, `COMMIT`, atau group lainnya secara
  manual lewat halaman Setting.

---

## 9. Soft Delete & Deleted Task View

- Kolom `deleted_at` di tabel `tasks` (dan `project_groups`,
  `kanban_groups`) tidak pernah benar-benar dihapus dari DB pada tahap 1.
- Tombol **delete** di task pada kolom `DONE` → `PUT` set `deleted_at = now()`.
- Halaman **Deleted Task** (diakses lewat tombol di header kolom `DONE`)
  menampilkan semua `tasks` dengan `deleted_at IS NOT NULL`, dengan tombol
  **"Move to To-Do"** yang men-set `deleted_at = NULL` dan
  `kanban_group_id = <id kolom TO-DO>`.

---

## 10. Dashboard

- `token_usage` diagregasi per `project_group_id`:
  `SUM(tokens_input + tokens_output) / 1000` → ditampilkan dalam satuan **K**.
- `total task done` = `COUNT(tasks) WHERE kanban_group_id = <id kolom DONE>
  AND deleted_at IS NULL`, dikelompokkan per `project_group_id`.
- Update realtime lewat WebSocket broadcast setiap kali ada
  `token_usage` baru (diparse dari output CLI oleh
  `token-usage-parser.js`) atau task berpindah ke `DONE`.
- Section dashboard di `index.html` saat ini **hidden by default**
  (`style="display:none"`). Data tetap di-load dan di-render secara
  background oleh `dashboard.js`, namun section tidak terlihat oleh user
  karena tidak ada mekanisme toggle visibility yang diimplementasi.

---

## 11. Packaging (npx ai-commander)

`package.json` (ringkas):

```json
{
  "name": "ai-commander",
  "version": "0.1.0",
  "bin": {
    "ai-commander": "./bin/server.js",
    "ai-commander-cli": "./bin/cli.js"
  },
  "engines": { "node": ">=18" },
  "dependencies": {
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/addon-web-links": "^0.12.0",
    "@xterm/xterm": "^6.0.0",
    "better-sqlite3": "^11.0.0",
    "node-pty": "^1.0.0",
    "ws": "^8.18.0"
  }
}
```

`bin/server.js` diberi shebang `#!/usr/bin/env node` dan dijadikan executable
(`chmod +x`) agar `npx ai-commander` dapat langsung menjalankannya tanpa
instalasi global.

---

## 12. Keamanan Bypass-Permission

Karena seluruh operasi CLI dijalankan tanpa konfirmasi manual, ai-commander
**wajib**:
- Hanya menjalankan proses CLI di dalam `repo_path` yang sudah eksplisit
  didefinisikan user di Project Group (tidak pernah menjalankan command di
  luar path yang dikonfigurasi).
- Menyimpan seluruh log task (`task_events`) agar setiap aksi bypass tetap
  bisa diaudit/ditinjau ulang lewat Task Progress View meskipun terjadi
  otomatis.
- Server hanya menerima koneksi `ai-commander-cli` lewat **unix domain
  socket lokal** (bukan TCP terbuka), agar perintah `update`/`create` tidak
  bisa dipicu dari luar mesin.

**Flag bypass per provider:**
- **Claude Code**: `--dangerously-skip-permissions` (auto-approve semua operasi)
- **OpenCode**: `--auto` (auto-approve semua operasi)

**Task Runner AI Agent Mode** (setting `task_runner_agent_mode`):
- **INTERACTIVE** (default): CLI berjalan tanpa `--print` (Claude) atau
  tanpa `run` (OpenCode). AI bisa menampilkan pertanyaan dan user bisa
  menjawab langsung di terminal.
- **HEADLESS**: CLI berjalan dengan `--print` (Claude) atau `run --auto`
  (OpenCode). Output ke stdout, exit otomatis setelah selesai. Cocok untuk
  otomasi penuh tanpa intervensi user.

---

## 13. Recovery Orphaned Tasks

Karena PTY processes disimpan di **in-memory Map** (bukan persistent), saat
server restart semua task yang sedang `running` akan kehilangan PTY-nya
(orphaned). Mekanisme recovery ditangani di **inline function** dalam
`bin/server.js`:

1. Saat startup, server query semua task dengan `session_status = 'running'`.
2. Untuk setiap orphaned task (dalam satu transaction):
   - Update `session_status` menjadi `'interrupted'`
   - Set `session_pid = NULL`
   - Insert `task_events` (type `error`) dengan pesan: *"Server direstart,
     session sebelumnya terputus. Silakan mulai ulang task ini secara manual."*
3. User dapat melihat task interrupted di UI dan memulai ulang secara manual
   (klik Start).

**Catatan**: Modul `src/core/recovery.js` berisi implementasi serupa tapi
**tidak digunakan** (dead code) — `bin/server.js` tidak meng-import modul
ini. Perbedaan: versi inline di `bin/server.js` menggunakan transaction dan
juga membersihkan `session_pid = NULL`, sedangkan versi modul tidak melakukan
keduanya. Idealnya modul `recovery.js` yang digunakan agar recovery logic
terpusat dan mudah diuji.

**Tidak ada auto-resume** PTY process — ini disengaja karena:
- PTY state (scroll buffer, environment) tidak bisa dipulihkan secara
  sempurna.
- Agent AI mungkin sedang dalam state yang konsisten, restart paksa bisa
  menyebabkan inkonsistensi.

---

## 14. Provider Adapters

Arsitektur provider adapter memungkinkan dukungan untuk multiple AI CLI
(Claude Code, OpenCode) dengan interface yang konsisten.

**Lokasi**: `src/core/provider-adapters/`

**Interface** (setiap adapter harus mengimplementasi):
```javascript
{
  buildSpawnCommand({ cwd, initialPrompt, agentName, systemPromptFilePath, interactive, agentMode })
    → { command: string, args: string[] }
  
  formatInitialPrompt(prompt)
    → string
}
```

**Adapter yang tersedia**:
- **`claude-code.adapter.js`**: Spawn `claude` dengan flag
  `--dangerously-skip-permissions`. Mode interaktif (orchestrator):
  `--system-prompt "..."`. Mode task runner:
  - INTERACTIVE: `--verbose --append-system-prompt-file <path> "prompt"` (tanpa `--print`)
  - HEADLESS: `--print --verbose --append-system-prompt-file <path> "prompt"`
  Instruksi permanen (workflow + kanban + task detail) dikirim lewat file
  terpisah menggunakan `--append-system-prompt-file <path>` (menghindari
  limit panjang argumen CLI ARG_MAX).
- **`opencode.adapter.js`**: Spawn `opencode` dengan mode berbeda:
  - Interactive (orchestrator): `opencode --agent <name>`
  - INTERACTIVE (task runner): `opencode --auto --prompt "prompt" --agent <name>`
  - HEADLESS (task runner): `opencode run --auto --agent <name> "prompt"`
  Custom agent file per-task berisi workflow + kanban + task detail
  (lihat §6.1).

**Registry**: `provider-adapters/index.js` menyediakan `getAdapter(name)`
yang mengembalikan adapter berdasarkan provider name (`'claude-code'` |
`'opencode'`).

**Custom Agent File (OpenCode)**: Karena OpenCode tidak mendukung flag
`--system` untuk system prompt, ai-commander menulis file `.md` agent
ke `.opencode/agents/` di dalam project. Ada 2 jenis agent file:

- **Task runner**: `.opencode/agents/aic-task-<id>.md` — per-task, dihapus
  saat task selesai (masuk DONE). Berisi instruksi workflow kanban untuk
  task spesifik **serta `task.detail` dari user** (digabung dalam satu
  file agar tidak perlu mengirim task.detail sebagai argumen CLI yang
  bisa melebihi batas ARG_MAX).
- **Orchestrator**: `.opencode/agents/aic-orchestrator-<projectGroupName>.md` —
  per project group, dihapus saat orchestrator di-stop. Berisi instruksi
  cara membuat task, move task, project alias mapping, dan daftar kanban
  groups.

Kedua jenis file dibuat oleh `opencode-agent-file.js` yang menyediakan
fungsi `writeTaskAgentFile()`, `deleteTaskAgentFile()`,
`writeOrchestratorAgentFile()`, dan `deleteOrchestratorAgentFile()`.

**Custom System Prompt File (Claude Code)**: Karena instruksi workflow + kanban
bisa sangat panjang (banyak kanban group, banyak alias project), Claude Code
menggunakan file terpisah untuk menghindari limit panjang argumen CLI (ARG_MAX).
File disimpan di `.claude-tmp/task-<id>.md` di dalam working directory task.

- **Task runner**: `.claude-tmp/task-<id>.md` — per-task, dihapus saat task
  selesai (masuk DONE) DAN saat proses PTY exit sebagai jaring pengaman.
  File ini berisi instruksi workflow kanban **serta `task.detail` dari user**
  (digabung dalam satu file agar tidak perlu mengirim task.detail sebagai
  argumen CLI yang bisa melebihi batas ARG_MAX).
- **Flag CLI**: `--append-system-prompt-file <path>` untuk mengirim instruksi
  panjang via file (menghindari ARG_MAX). Dipakai di kedua mode
  (INTERACTIVE dan HEADLESS).
- **Verbose output**: Flag `--verbose` ditambahkan untuk menampilkan detail
  tool call (Bash/Grep/Read/dll) di output terminal, mendekati pengalaman
  OpenCode.

File dibuat oleh `claude-code-system-prompt-file.js` yang menyediakan
fungsi `writeTaskSystemPromptFile()`, `deleteTaskSystemPromptFile()`,
dan `getSystemPromptFilePath()`.
