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
   - `uuid` **tidak dipakai** — gunakan `crypto.randomUUID()` bawaan Node.
   Semua dependency lain (routing, validasi, ORM, dsb.) **dibuat manual**.
3. **1 Task = 1 Session CLI**: setiap task yang dijalankan membuka **satu**
   proses CLI (`claude` atau `opencode`) dalam satu pty, dari awal hingga
   task selesai/keluar. Tidak ada arsitektur multi-agent/multi-commander yang
   saling polling — ini akar penyebab borosnya quota di tool lain yang sudah
   dicoba sebelumnya.
4. **Bypass permission**: proses CLI dijalankan dengan flag non-interaktif /
   auto-approve (mis. `--permission-mode bypassPermissions` untuk Claude
   Code, atau flag setara di OpenCode) sehingga tidak ada prompt konfirmasi
   yang menggantung menunggu user.
5. **Instruksi tahap kanban dikirim sekali di awal prompt**, bukan lewat
   polling berulang. Agent AI sendiri yang secara aktif memanggil
   `ai-commander-cli update ...` ketika mencapai checkpoint tahap
   berikutnya (lihat §6). Ini menghindari overhead network/polling terus-menerus.

---

## 2. Tech Stack

| Layer            | Teknologi                                                      |
|-------------------|-----------------------------------------------------------------|
| Runtime           | Node.js >= 18                                                   |
| HTTP Server       | `node:http` (native), routing manual                            |
| Realtime          | `ws` (WebSocket)                                                 |
| Database          | SQLite via `better-sqlite3`                                      |
| Terminal / PTY    | `node-pty`                                                       |
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
│   │       ├── dashboard.routes.js
│   │       └── orchestrator.routes.js
│   ├── db/
│   │   ├── connection.js      # inisialisasi better-sqlite3 + migration runner
│   │   ├── migrations/
│   │   │   ├── 001_init.sql
│   │   │   └── ...
│   │   └── repositories/
│   │       ├── settings.repo.js
│   │       ├── projectGroup.repo.js
│   │       ├── kanbanGroup.repo.js
│   │       ├── task.repo.js
│   │       ├── tokenUsage.repo.js
│   │       └── deletedTask.repo.js
│   ├── core/
│   │   ├── kanban-state-machine.js   # validasi "next step move to"
│   │   ├── task-runner.js            # spawn pty, kirim prompt awal, capture output
│   │   ├── provider-adapters/
│   │   │   ├── claude-code.adapter.js
│   │   │   └── opencode.adapter.js
│   │   ├── prompt-builder.js         # bangun prompt instruksi awal task
│   │   ├── orchestrator-prompt-builder.js # bangun prompt instruksi awal orchestrator
│   │   ├── token-usage-parser.js     # parse token usage dari output CLI
│   │   └── orchestrator-runner.js    # pty khusus utk halaman Orchestrator
│   └── shared/
│       ├── uuid.js             # wrapper crypto.randomUUID()
│       ├── short-id.js         # generator uuid pendek (8 char) utk task
│       └── constants.js        # nama kanban group default, dsb.
├── public/
│   ├── index.html
│   ├── css/app.css
│   └── js/
│       ├── kanban.js
│       ├── list-view.js
│       ├── settings.js
│       ├── dashboard.js
│       ├── task-progress.js     # xterm-like renderer utk stream pty (native canvas/DOM)
│       ├── orchestrator.js
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

```sql
-- 001_init.sql

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL         -- JSON string
);
-- contoh row: ('use_grouping_project', 'true' | 'false')

CREATE TABLE project_groups (
  id TEXT PRIMARY KEY,            -- uuid
  name TEXT NOT NULL,             -- alias, contoh: "RMS", "Backend RMS"
  repo_path TEXT NOT NULL,        -- path absolut ke folder project
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL
);

CREATE TABLE kanban_groups (
  id TEXT PRIMARY KEY,                 -- uuid
  project_group_id TEXT NULL,          -- NULL jika use_grouping_project = false
  name TEXT NOT NULL,                  -- "TO-DO", "ON PROGRESS", dst
  slash_command TEXT NOT NULL,         -- "/todo", "/on-progress", "/need-review", dst
  position INTEGER NOT NULL,           -- urutan tampilan kolom kanban
  is_locked_todo INTEGER NOT NULL DEFAULT 0,  -- 1 jika ini kolom TO-DO (tak boleh dihapus)
  is_locked_done INTEGER NOT NULL DEFAULT 0,  -- 1 jika ini kolom DONE (tak boleh dihapus)
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
  session_status TEXT NOT NULL DEFAULT 'idle', -- idle | running | waiting_manual | finished | error
  started_at TEXT NULL,
  finished_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL,
  FOREIGN KEY (project_group_id) REFERENCES project_groups(id),
  FOREIGN KEY (kanban_group_id) REFERENCES kanban_groups(id)
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
CREATE INDEX idx_task_events_task_id ON task_events(task_id);
```

**Catatan default seed** (dijalankan sekali saat DB pertama kali dibuat):
- Jika `use_grouping_project = false`: buat 5 `kanban_groups` default dengan
  `project_group_id = NULL`: `TO-DO` (locked_todo), `ON PROGRESS`,
  `NEED REVIEW`, `COMMIT`, `DONE` (locked_done), dengan `next_step_group_id`
  berantai sesuai urutan tsb.
- `TO-DO` selalu `instruction = NULL`.
- `DONE` default instruction: `"Jalankan /context sebelum /exit."`

---

## 5. Halaman & Endpoint API (ringkas)

Base URL: `http://localhost:<port>` (port disimpan di `~/.ai-commander/server.json`
bersama path unix socket, dibaca oleh `ai-commander-cli`).

| Method | Path                                            | Fungsi                                      |
|--------|--------------------------------------------------|----------------------------------------------|
| GET    | `/`                                              | Serve UI (index.html)                        |
| GET    | `/api/settings`                                  | Ambil settings                               |
| PUT    | `/api/settings`                                  | Update settings (use_grouping_project, dll.) |
| GET    | `/api/project-groups`                            | List project group (alias mapping)           |
| POST   | `/api/project-groups`                            | Buat project group baru                      |
| PUT    | `/api/project-groups/:id`                        | Edit project group                           |
| DELETE | `/api/project-groups/:id`                        | Soft delete project group                    |
| GET    | `/api/kanban-groups?project_group_id=`           | List kanban group (per project group / null) |
| POST   | `/api/kanban-groups`                             | Tambah kanban group                          |
| PUT    | `/api/kanban-groups/:id`                         | Edit kanban group (next_step, instruction)   |
| DELETE | `/api/kanban-groups/:id`                         | Hapus kanban group (kecuali locked)          |
| GET    | `/api/tasks?project_group_id=&kanban_group_id=`  | List task (untuk kanban/list view)           |
| POST   | `/api/tasks`                                     | Buat task baru (di TO-DO)                    |
| PUT    | `/api/tasks/:id`                                 | Edit task (detail, provider)                 |
| POST   | `/api/tasks/:id/start`                           | Mulai session CLI utk task ini                |
| POST   | `/api/tasks/:id/transition`                      | Pindah kanban group (dipakai UI & CLI bridge)|
| DELETE | `/api/tasks/:id`                                 | Soft delete (set deleted_at)                 |
| POST   | `/api/tasks/:id/restore`                         | Restore ke TO-DO (dari Deleted Task view)     |
| GET    | `/api/tasks/deleted`                             | List task ter-soft-delete                     |
| GET    | `/api/dashboard/summary`                         | Total token usage (K) + total done per group  |
| WS     | `/ws/tasks/:id`                                  | Stream live terminal output (Task Progress)   |
| WS     | `/ws/orchestrator`                                | Stream live terminal Orchestrator             |
| POST   | `/api/orchestrator/start`                        | Buka pty orchestrator (selalu fresh — stop process lama dulu jika ada) |
| POST   | `/api/orchestrator/stop`                         | Hentikan pty orchestrator yang sedang jalan                             |
| POST   | `/api/orchestrator/input`                        | Kirim input ke pty orchestrator                                        |
| POST   | `/api/orchestrator/resize`                       | Resize terminal orchestrator                                           |
| GET    | `/api/orchestrator/status`                       | Cek status orchestrator (running/provider)                              |
| POST   | `/api/orchestrator/create-tasks`                 | Buat task baru dari orchestrator (bulk create)                                       |
| GET    | `/api/orchestrator/context`                       | Ambil context project groups & kanban groups untuk orchestrator                       |

---

## 6. Alur Task & Protokol CLI Bridge (Hemat Token)

### 6.1 Saat task di-*start* dari TO-DO

1. Server mengambil daftar `kanban_groups` untuk `project_group_id` task
   tersebut (atau global jika null), diurutkan sesuai `position`.
2. Server membangun **prompt instruksi awal** (`prompt-builder.js`) berisi:
   - `project_group_uuid` (atau `null`)
   - `task_uuid` (short id)
   - Daftar seluruh kanban group beserta: `uuid`, `slash_command`
     (mis. `/need-review`), `next_step_group_id`, dan `instruction`
   - Perintah eksplisit: *"Jalankan `ai-commander-cli update <project_group_uuid>
     <task_uuid> <target_kanban_group_uuid>` sendiri ketika kamu merasa
     pekerjaan pada tahap ini sudah selesai dan siap pindah ke tahap
     berikutnya. Lakukan ini otomatis kecuali instruksi tahap tsb secara
     eksplisit meminta konfirmasi manual."*
   - Isi `detail` task dari user.
3. Server memindahkan task dari `TO-DO` ke `next_step_group_id` milik
   `TO-DO` (default: `ON PROGRESS`) — **transisi ini terjadi sebelum** agent
   mulai bekerja, sesuai keinginan alur di spesifikasi.
4. Server men-spawn 1 proses pty (`task-runner.js`) menjalankan CLI provider
   (`claude` atau `opencode`) di `cwd = repo_path` project group tsb, dengan
   flag bypass-permission, lalu mengirim prompt dari langkah 2 sebagai input
   pertama.
5. Seluruh output pty di-stream ke `task_events` (type `log`) dan
   di-broadcast via WebSocket ke `Task Progress View` yang sedang membuka
   task tsb.

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
- Jika kanban group tujuan punya `instruction` baru, instruksi tsb otomatis
  di-*append* sebagai pesan lanjutan ke pty task yang sama (tetap 1 session
  CLI, tidak membuka proses baru) — sehingga agent langsung tahu instruksi
  tahap berikutnya tanpa harus di-*restart*.
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

```
ai-commander-cli create <project_group_uuid|-> <detail> [ai_provider]
```

1. User membuka halaman Orchestrator, memilih provider (OpenCode/Claude Code).
2. Server spawn PTY dalam mode interaktif, lalu mengirim **initial prompt**
   (`orchestrator-prompt-builder.js`) yang berisi instruksi cara membuat task
   beserta daftar project groups & kanban groups.
3. User mengetik permintaan dalam bahasa alami (mis. "buat task baru dengan
   deskripsi 'abc'").
4. AI agent di orchestrator mengenali permintaan tersebut dan menjalankan
   `ai-commander-cli create <project_uuid> "abc" opencode` di terminal.
5. `ai-commander-cli` mengirim payload `{ type: "create", projectGroupId,
   detail, aiProvider }` ke server lewat unix socket.
6. Server (`ipc-socket.js`) membuat task baru di kolom `TO-DO`, lalu
   broadcast update ke UI kanban via WebSocket.
7. Task baru muncul di kolom `TO-DO` secara realtime tanpa refresh.

---

## 7. Task Progress View & Orchestrator (PTY)

- Menggunakan `node-pty` untuk membuka pseudo-terminal asli agar output
  (termasuk ANSI escape code, progress bar, dsb.) identik dengan menjalankan
  CLI secara manual di terminal.
- Frontend merender stream ini di elemen `<pre>`/custom canvas ringan
  (`public/js/task-progress.js`) yang mem-parsing ANSI dasar secara manual
  (warna, bold) — tanpa library terminal emulator pihak ketiga, untuk tetap
  menjaga prinsip native-first (jika kompleksitas ANSI parsing manual
  ternyata terlalu tinggi, tim boleh mengevaluasi `xterm.js` sebagai
  pengecualian dependency, didiskusikan dulu sebelum ditambahkan).
- **Orchestrator** memakai mekanisme pty yang sama, tapi tidak terikat ke 1
  task — ini adalah sesi bebas untuk membuat/menyusun banyak task/list task
  otomatis. Saat orchestrator di-start, server mengirim **initial prompt**
  (`orchestrator-prompt-builder.js`) yang berisi:
  - Instruksi cara membuat task: `ai-commander-cli create <project_uuid|-> "detail" [provider]`
  - Instruksi cara memindahkan task: `ai-commander-cli update ...`
  - Daftar project groups & kanban groups yang tersedia di database
  - Aturan agar AI agent langsung menjalankan perintah create di terminal
    ketika user meminta membuat task.
  
  AI agent (OpenCode/Claude Code) di orchestrator menerima prompt ini dan
  mengetahui cara membuat task secara langsung lewat CLI, tanpa perlu
  user mengetahui syntax command-nya. Selain itu, endpoint
  `POST /api/orchestrator/create-tasks` juga tersedia untuk pembuatan
  task via HTTP (bulk create).
- **Setiap kali user membuka Orchestrator**, frontend selalu memanggil
  `POST /api/orchestrator/stop` terlebih dahulu untuk membunuh process lama
  (jika ada), lalu `POST /api/orchestrator/start` untuk spawn session baru.
  Ini memastikan orchestrator selalu mulai dalam kondisi bersih — tidak ada
  residual state dari session sebelumnya (termasuk setelah browser reload).

---

## 8. Project Group (Multi-Repository)

- Setting → `Use Grouping Project? yes/no` disimpan di tabel `settings`.
- **Jika yes**: user mendefinisikan banyak `project_groups` (nama alias +
  `repo_path`). Semua `kanban_groups` yang dibuat lewat Setting akan
  meminta memilih `project_group_id` tertentu. Kanban board di halaman
  utama menyediakan dropdown "Change Project Group" untuk berpindah
  konteks papan kanban antar repo.
- **Jika no**: `kanban_groups.project_group_id = NULL` untuk semua kanban
  group, hanya ada 1 papan kanban global, task tidak terikat repo tertentu
  secara eksplisit lewat sistem ini (path kerja bisa diisi manual per task
  jika diperlukan, di luar cakupan tahap 1 — dicatat sebagai catatan open
  di TASKS.md).

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
