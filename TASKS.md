# TASKS.md — ai-commander

Daftar task pengembangan, disusun berurutan (kerjakan dari atas ke bawah,
per task = 1 unit kerja). Setiap task ditulis selengkap mungkin agar bisa
dieksekusi oleh model AI yang lebih murah / developer junior tanpa perlu
banyak konteks tambahan.

**Aturan umum untuk setiap task:**
- Baca `ARCHITECTURE.md` dulu sebelum mulai (skema DB, struktur folder, dan
  daftar endpoint ada di sana — WAJIB diikuti persis, jangan improvisasi
  nama tabel/kolom/endpoint).
- Jangan menambah dependency npm baru di luar yang sudah disebut
  (`better-sqlite3`, `node-pty`, `ws`) tanpa menandainya sebagai "OPEN
  QUESTION" di akhir kerja dan menjelaskan kenapa dibutuhkan.
- Setiap task harus menyertakan cara verifikasi manual (dituliskan di
  bagian "Cara Test" pada tiap task) sebelum ditandai selesai.
- Commit per task, dengan pesan commit mengikuti format:
  `feat(ai-commander): <ringkasan task>` atau `fix(...)`/`chore(...)` sesuai isi.

---

## FASE 0 — Setup Project

### TASK-001: Inisialisasi project & struktur folder
**Deskripsi:** Buat repo Node.js baru bernama `ai-commander`. Jalankan
`npm init -y`, lalu edit `package.json` sesuai contoh di `ARCHITECTURE.md`
§11 (nama, versi, `bin` untuk `ai-commander` dan `ai-commander-cli`,
`engines.node >= 18`). Buat seluruh struktur folder kosong (dengan file
`.gitkeep` jika perlu) persis seperti di `ARCHITECTURE.md` §3.
**Cara Test:** `node -v` menunjukkan versi >= 18. `npm run` tidak error.
Struktur folder cocok 1:1 dengan §3 di ARCHITECTURE.md.
**status: done**

### TASK-002: Install dependency inti
**Deskripsi:** Install `better-sqlite3`, `node-pty`, `ws` sebagai
dependencies. Pastikan versi yang terinstal kompatibel dengan Node 18+.
Tambahkan `.gitignore` (node_modules, `*.db`, `~/.ai-commander` tidak perlu
di-ignore karena di luar repo).
**Cara Test:** `npm install` sukses tanpa error build native module
(`better-sqlite3` dan `node-pty` butuh compile native — pastikan
`node-gyp`/build tools tersedia di environment CI/dev).
**status: done**

### TASK-003: Skeleton `bin/server.js` & `bin/cli.js`
**Deskripsi:** Buat `bin/server.js` dengan shebang `#!/usr/bin/env node`
yang untuk sementara hanya mencetak `"ai-commander server starting..."` ke
console lalu `process.exit(0)`. Buat `bin/cli.js` dengan shebang yang sama,
mencetak `"ai-commander-cli placeholder"`. Set permission executable
(`chmod +x`) pada kedua file.
**Cara Test:** `node bin/server.js` mencetak pesan tanpa error. Setelah
`npm link`, command `ai-commander` dan `ai-commander-cli` bisa dijalankan
dari terminal manapun.
**status: done**

---

## FASE 1 — Database Layer

### TASK-004: Migration SQL awal
**Deskripsi:** Buat file `src/db/migrations/001_init.sql` berisi PERSIS
skema SQL dari `ARCHITECTURE.md` §4 (tabel `settings`, `project_groups`,
`kanban_groups`, `tasks`, `task_events`, `token_usage`, beserta index-nya).
Jangan ubah nama kolom/tabel.
**Cara Test:** File SQL valid (bisa dijalankan lewat `sqlite3` CLI atau
lewat `better-sqlite3` tanpa syntax error).
**status: done**

### TASK-005: Modul koneksi DB & migration runner
**Deskripsi:** Buat `src/db/connection.js`. Modul ini harus:
1. Menentukan path DB default: `~/.ai-commander/data.db` (buat folder
   `~/.ai-commander` jika belum ada, gunakan `node:os.homedir()` +
   `node:path`).
2. Membuka koneksi `better-sqlite3` (mode WAL disarankan:
   `db.pragma('journal_mode = WAL')`).
3. Menjalankan seluruh file `.sql` di `src/db/migrations/` secara berurutan
   (urut berdasarkan nama file, mis. `001_`, `002_`, dst), hanya sekali
   (buat tabel internal kecil `_migrations(name TEXT PRIMARY KEY, applied_at
   TEXT)` untuk tracking migration yang sudah jalan — tabel ini boleh
   ditambahkan di luar skema utama karena murni infrastruktur migrasi).
4. Export instance `db` singleton yang dipakai modul lain.
**Cara Test:** Jalankan sekali via script kecil (`node -e
"require('./src/db/connection.js')"`), pastikan file `data.db` terbuat di
`~/.ai-commander/`, dan seluruh tabel dari §4 ARCHITECTURE.md ada
(cek pakai `sqlite3 ~/.ai-commander/data.db ".tables"`). Jalankan dua kali,
pastikan tidak error (migration idempotent).
**status: done**

### TASK-006: Seed default kanban groups
**Deskripsi:** Tambahkan logic seed (bisa di file migration terpisah
`002_seed_default_kanban.sql` atau lewat JS di `connection.js` setelah
migration jalan — pilih JS agar bisa generate UUID dinamis via
`crypto.randomUUID()`). Saat `settings.use_grouping_project` belum ada
(fresh DB), lakukan:
1. Insert row `settings` dengan `key='use_grouping_project'`,
   `value='false'`.
2. Insert 5 `kanban_groups` dengan `project_group_id = NULL`:
   `TO-DO` (position 0, `is_locked_todo=1`, `slash_command='/todo'`,
   `instruction=NULL`), `ON PROGRESS` (position 1, `slash_command=
   '/on-progress'`), `NEED REVIEW` (position 2, `slash_command=
   '/need-review'`), `COMMIT` (position 3, `slash_command='/commit'`),
   `DONE` (position 4, `is_locked_done=1`, `slash_command='/done'`,
   `instruction='Jalankan /context sebelum /exit.'`).
3. Set `next_step_group_id` masing-masing secara berantai:
   TO-DO→ON PROGRESS→NEED REVIEW→COMMIT→DONE (DONE→NULL).
Jalankan seed ini hanya jika tabel `kanban_groups` masih kosong (cek
`SELECT COUNT(*) FROM kanban_groups` sebelum insert).
**Cara Test:** Hapus `~/.ai-commander/data.db`, jalankan ulang server,
query `SELECT name, position, next_step_group_id FROM kanban_groups ORDER
BY position` harus menghasilkan 5 baris sesuai urutan & instruction di
atas.
**status: done**

### TASK-007: Helper `shared/uuid.js` & `shared/short-id.js`
**Deskripsi:** `src/shared/uuid.js` cukup: `module.exports = () =>
crypto.randomUUID()`. `src/shared/short-id.js`: generator 8 karakter
alfanumerik unik untuk task (mis. ambil 8 karakter pertama dari
`crypto.randomUUID().replace(/-/g, '')`). Tambahkan fungsi untuk cek
collision sederhana (opsional: retry generate jika sudah ada di DB tasks —
boleh diserahkan ke repository layer, cukup buat generator murni di sini).
**Cara Test:** Buat test kecil manual (`node -e ...`) yang memanggil
fungsi 1000 kali dan pastikan tidak ada duplikat di 1000 sample tsb (peluang
collision rendah, cukup smoke test).
**status: done**

---

## FASE 2 — Repository Layer (akses data)

> Setiap repository di bawah ini adalah modul CommonJS yang mengekspor
> fungsi-fungsi CRUD murni (menerima `db` dari `connection.js`), TIDAK
> boleh mengandung logic HTTP di dalamnya (pemisahan layer).

### TASK-008: `settings.repo.js`
**Deskripsi:** Implement `getSetting(key)`, `setSetting(key, value)`,
`getAllSettings()`. Value disimpan sebagai string JSON di kolom `value`;
repo bertugas `JSON.stringify`/`JSON.parse` otomatis saat baca/tulis.
**Cara Test:** Tulis test manual: set `use_grouping_project` ke `true`
(boolean asli di JS), baca lagi, pastikan hasilnya `true` (boolean, bukan
string `"true"`).
**status: done**

### TASK-009: `projectGroup.repo.js`
**Deskripsi:** Implement `list({ includeDeleted=false })`,
`getById(id)`, `create({ name, repoPath })`, `update(id, { name,
repoPath })`, `softDelete(id)`. Semua fungsi query harus otomatis
mem-filter `deleted_at IS NULL` kecuali `includeDeleted=true` diminta.
`create` harus generate `id` via `shared/uuid.js` dan set `created_at`,
`updated_at` (ISO string, `new Date().toISOString()`).
**Cara Test:** Buat 2 project group, list harus mengembalikan 2 item.
`softDelete` salah satu, list default harus mengembalikan 1 item saja,
`list({includeDeleted:true})` mengembalikan 2 item.
**status: done**

### TASK-010: `kanbanGroup.repo.js`
**Deskripsi:** Implement `listByProjectGroup(projectGroupId)` (
`projectGroupId` boleh `null` — pastikan query pakai `IS NULL` bukan `=
NULL` saat null), `getById(id)`, `create({...})`, `update(id, {...})`,
`softDelete(id)` (**tolak** penghapusan jika `is_locked_todo=1` atau
`is_locked_done=1` — lempar Error dengan pesan jelas, mis.
`"Kanban group TO-DO/DONE tidak boleh dihapus"`).
**Cara Test:** Coba `softDelete` pada kanban group TO-DO default →
harus throw error. Coba pada kanban group custom (bukan locked) → berhasil.
**status: done**

### TASK-011: `task.repo.js`
**Deskripsi:** Implement `listByKanbanGroup(kanbanGroupId)`,
`listByProjectGroup(projectGroupId, { includeDeleted=false })`,
`getById(id)`, `create({ projectGroupId, kanbanGroupId, title, detail,
aiProvider })` (id pakai `short-id.js`, retry generate jika sudah ada
kolisi di tabel `tasks`), `update(id, {...})`, `updateKanbanGroup(id,
newKanbanGroupId)` (khusus untuk transisi kanban, juga insert
`task_events` type `stage_change`), `softDelete(id)`, `restore(id,
todoKanbanGroupId)` (set `deleted_at=NULL` DAN `kanban_group_id =
todoKanbanGroupId` sekaligus), `listDeleted()`.
**Cara Test:** Buat task, pindahkan kanban group via
`updateKanbanGroup`, cek row di `task_events` bertambah 1 dengan type
`stage_change` dan content berupa JSON `{from, to}`.
**status: done**

### TASK-012: `tokenUsage.repo.js` & `deletedTask` query
**Deskripsi:** `tokenUsage.repo.js`: `record({ projectGroupId, taskId,
tokensInput, tokensOutput })`, `sumByProjectGroup()` → mengembalikan array
`[{ projectGroupId, totalTokensK }]` (`totalTokensK = ROUND(SUM(tokens_input
+ tokens_output)/1000.0, 2)`), `countDoneByProjectGroup(doneKanbanGroupId)`
→ `[{ projectGroupId, totalDone }]` (query ke tabel `tasks`, filter
`kanban_group_id = doneKanbanGroupId AND deleted_at IS NULL`, group by
`project_group_id`).
**Cara Test:** Insert beberapa dummy token_usage row lewat SQL manual,
panggil `sumByProjectGroup()`, cocokkan hasil kalkulasi manual dengan hasil
fungsi.
**status: done**

---

## FASE 3 — HTTP Server & Routing Native

### TASK-013: `http-server.js` + static file serving
**Deskripsi:** Buat native HTTP server (`node:http`) yang:
1. Untuk request `GET` ke path yang match file di folder `public/`,
   serve file tsb dengan `Content-Type` yang benar (map ekstensi manual:
   `.html`→`text/html`, `.css`→`text/css`, `.js`→`application/javascript`,
   dst — buat helper `mimeType(ext)` sederhana, tanpa dependency).
2. Untuk request ke path `/api/*`, delegasikan ke `router.js` (lihat
   TASK-014).
3. Default route `/` → serve `public/index.html`.
4. Handle 404 dengan response JSON `{ error: "Not Found" }` untuk `/api/*`
   dan plain text untuk file statis.
**Cara Test:** Jalankan server di port tertentu (mis. 4321), akses
`http://localhost:4321/` di browser harus menampilkan isi
`public/index.html` (boleh masih placeholder kosong di tahap ini).
**status: done**

### TASK-014: `router.js` — manual path matcher
**Deskripsi:** Buat router sederhana native (tanpa Express) yang
mendukung: method matching (GET/POST/PUT/DELETE), path param (`:id`),
query string parsing (`node:url`), dan body JSON parsing otomatis untuk
POST/PUT (baca stream request, `JSON.parse`, tangani error parse dengan
response 400). API: `router.get(path, handler)`, `router.post(path,
handler)`, dst. `handler(req, res, { params, query, body })`.
**Cara Test:** Daftarkan route dummy `GET /api/ping` yang balas
`{ok:true}` dan `POST /api/echo` yang balas kembali body yang dikirim.
Test pakai `curl`.
**status: done**

### TASK-015: Endpoint Settings (`settings.routes.js`)
**Deskripsi:** Implement `GET /api/settings` (balas seluruh settings via
`getAllSettings()`) dan `PUT /api/settings` (terima body `{ key, value }`
atau object banyak key sekaligus — putuskan salah satu format lalu
dokumentasikan di komentar kode, sarankan format `{ use_grouping_project:
true }` — merge dengan existing settings). Panggil `settings.repo.js`.
**Cara Test:** `curl -X PUT -d '{"use_grouping_project":true}' ...`
lalu `curl GET /api/settings` mencerminkan perubahan.
**status: done**

### TASK-016: Endpoint Project Groups (`project-groups.routes.js`)
**Deskripsi:** Implement 4 endpoint sesuai tabel di `ARCHITECTURE.md` §5:
`GET/POST /api/project-groups`, `PUT/DELETE /api/project-groups/:id`.
Validasi minimal: `name` dan `repoPath` wajib diisi saat create (balas 400
jika kosong). Saat create/update, opsional cek `repoPath` benar-benar ada
di filesystem (`fs.existsSync`) — jika tidak ada, tetap simpan tapi balas
warning di response (`{ data, warning: "Path tidak ditemukan" }`), jangan
blok pembuatan (user mungkin belum membuat foldernya).
**Cara Test:** CRUD lengkap via `curl`, cek soft delete bekerja (`DELETE`
lalu `GET` list tidak menampilkannya).
**status: done**

### TASK-017: Endpoint Kanban Groups (`kanban-groups.routes.js`)
**Deskripsi:** Implement endpoint sesuai §5. `GET
/api/kanban-groups?project_group_id=` (jika query kosong/`"null"`,
treat sebagai `NULL`). `POST` untuk create (validasi: `name` wajib,
`next_step_group_id` jika diisi harus merujuk ke kanban group yang valid
milik project group yang sama). `PUT` untuk update field `next_step_group_id`
dan `instruction`. `DELETE` memanggil `softDelete` dari repo (yang sudah
menolak locked group — pastikan endpoint meneruskan error tsb sebagai
response `400` dengan pesan errornya, bukan 500 generic).
**Cara Test:** Coba hapus kolom TO-DO via `curl DELETE` → harus balas 400
dengan pesan jelas. Buat kolom baru custom → berhasil, muncul di list.
**status: done**

### TASK-018: Endpoint Tasks dasar (CRUD, tanpa run CLI dulu)
**Deskripsi:** Implement di `tasks.routes.js`: `GET /api/tasks` (filter
`project_group_id`, `kanban_group_id` dari query), `POST /api/tasks`
(body: `{ projectGroupId, detail, aiProvider }` — `kanban_group_id`
otomatis diisi ID kolom TO-DO yang sesuai, cari lewat
`kanbanGroup.repo.listByProjectGroup` filter `is_locked_todo=1`), `PUT
/api/tasks/:id` (update `detail`/`aiProvider`), `DELETE /api/tasks/:id`
(soft delete — validasi FE nantinya hanya menampilkan tombol delete di
kolom DONE, tapi backend tidak perlu membatasi ini secara ketat di tahap
1, cukup catat sebagai "OPEN QUESTION" di laporan task jika ingin
diperketat nanti).
**Cara Test:** Buat task baru tanpa provider (harus gagal validasi, balas
400). Buat dengan `aiProvider: "claude-code"` → berhasil, muncul otomatis
di kolom TO-DO.
**status: done**

### TASK-019: Endpoint Deleted Task & Restore
**Deskripsi:** `GET /api/tasks/deleted` (pakai `task.repo.listDeleted()`),
`POST /api/tasks/:id/restore` (cari kanban group TO-DO sesuai
`project_group_id` milik task tsb, panggil `task.repo.restore`).
**Cara Test:** Hapus sebuah task, cek muncul di `GET
/api/tasks/deleted`, panggil restore, cek task kembali muncul di `GET
/api/tasks?kanban_group_id=<id TO-DO>` dan hilang dari list deleted.
**status: done**

---

## FASE 4 — Realtime (WebSocket)

### TASK-020: `ws-server.js` — broadcast hub
**Deskripsi:** Buat WebSocket server (`ws` package) yang attach ke HTTP
server yang sama (gunakan `server.on('upgrade', ...)` manual, jangan buat
port terpisah). Sediakan API internal: `broadcast(channel, payload)` yang
mengirim ke semua client yang subscribe channel tsb (channel contoh:
`board`, `task:<id>`, `orchestrator`). Client mengirim pesan pertama
`{ subscribe: "board" }` setelah connect untuk memilih channel.
**Cara Test:** Buka 2 tab browser dengan script kecil yang subscribe
channel `board`, panggil `broadcast('board', {test:true})` dari server
side (lewat endpoint debug sementara), pastikan kedua tab menerima pesan.
**status: done**

### TASK-021: Hubungkan broadcast ke event penting
**Deskripsi:** Panggil `wsServer.broadcast('board', {...})` setiap kali
ada perubahan yang relevan untuk board: task dibuat, task pindah kanban
group (dari endpoint transition di TASK-024), task dihapus/direstore,
kanban group berubah. Payload minimal: `{ type: 'task_updated' |
'task_created' | 'task_deleted' | 'kanban_group_updated', data: {...} }`.
**Cara Test:** Buka UI kanban (boleh masih placeholder), buat task baru
lewat `curl`, pastikan browser menerima event via console.log tanpa
refresh halaman.
**status: done**

---

## FASE 5 — CLI Bridge (Unix Socket + `ai-commander-cli`)

### TASK-022: `ipc-socket.js` — unix socket listener di server
**Deskripsi:** Saat server start, buat unix domain socket di path
`~/.ai-commander/ipc.sock` (pakai `node:net.createServer()`, hapus file
socket lama jika ada sebelum listen — `fs.existsSync` + `fs.unlinkSync`).
Simpan info port HTTP + path socket ke `~/.ai-commander/server.json`
(format: `{ "httpPort": 4321, "socketPath": "/home/user/.ai-commander/ipc.sock",
"pid": 12345 }`). Socket menerima pesan JSON per baris (newline-delimited
JSON), pesan pertama yang didukung: `{ type: "transition", projectGroupId,
taskId, targetKanbanGroupId }`.
**Cara Test:** Jalankan server, dari terminal lain pakai `nc -U
~/.ai-commander/ipc.sock` kirim JSON manual, cek server menerima &
mem-parsing dengan benar (log ke console dulu sebelum implement logic
transisi sebenarnya).
**status: done**

### TASK-023: Implement handler `transition` di ipc-socket
**Deskripsi:** Saat menerima pesan `transition`, server harus:
1. Validasi `taskId` ada di DB (jika tidak, balas `{ error: "task not
   found" }` lewat socket yang sama lalu tutup koneksi).
2. Validasi `targetKanbanGroupId` adalah kanban group yang valid untuk
   `project_group_id` task tsb.
3. Panggil `task.repo.updateKanbanGroup(taskId, targetKanbanGroupId)`.
4. Broadcast event `board` (pakai TASK-021).
5. Jika kanban group tujuan punya `instruction` terisi, kirim instruksi
   tsb sebagai input lanjutan ke pty task yang sedang berjalan (lihat
   `task-runner.js` di TASK-027 — buat fungsi
   `taskRunner.sendFollowupInstruction(taskId, instructionText)` yang
   dipanggil di sini).
6. Balas `{ ok: true }` lewat socket.
**Cara Test:** Simulasikan lewat `nc -U` (tanpa proses agent asli dulu):
kirim transition, cek `tasks.kanban_group_id` di DB berubah, cek client
WS menerima broadcast.
**status: done**

### TASK-024: Endpoint HTTP `POST /api/tasks/:id/transition`
**Deskripsi:** Buat endpoint HTTP yang melakukan validasi & aksi PERSIS
sama seperti handler di TASK-023 (boleh extract logic transisi ke 1
fungsi bersama di `core/kanban-state-machine.js`, dipanggil baik dari
endpoint HTTP maupun dari `ipc-socket.js`, agar tidak duplikasi kode).
Endpoint ini dipakai UI (drag-drop task antar kolom kanban secara manual
oleh user).
**Cara Test:** `curl POST /api/tasks/:id/transition -d
'{"targetKanbanGroupId":"..."}'`, cek hasil sama dengan test TASK-023.
**status: done**

### TASK-025: `bin/cli.js` implementasi penuh
**Deskripsi:** Implement command:
```
ai-commander-cli update <project_group_uuid|-> <task_uuid> <target_kanban_group_uuid>
```
Program harus:
1. Baca `~/.ai-commander/server.json` untuk dapat `socketPath`. Jika file
   tidak ada / server tidak jalan, cetak error jelas ke stderr dan
   `process.exit(1)`.
2. Connect ke unix socket, kirim JSON `{ type: "transition",
   projectGroupId: arg1 === '-' ? null : arg1, taskId: arg2,
   targetKanbanGroupId: arg3 }` + newline.
3. Tunggu 1 balasan JSON dari server, cetak hasilnya ke stdout (`ok` atau
   `error`), lalu exit dengan code 0 (sukses) atau 1 (error).
4. Timeout 5 detik jika server tidak membalas → cetak error timeout,
   exit 1.
**Cara Test:** Jalankan server, lalu dari terminal lain jalankan
`ai-commander-cli update - <task_uuid_valid> <kanban_group_uuid_valid>`,
cek task berpindah kolom di UI/DB. Coba dengan uuid task yang tidak ada →
harus mencetak error dan exit code 1.
**status: done**

---

## FASE 6 — Task Runner (PTY, Provider Adapter, Prompt Builder)

### TASK-026: `provider-adapters/claude-code.adapter.js` & `opencode.adapter.js`
**Deskripsi:** Masing-masing adapter mengekspor fungsi
`buildSpawnCommand({ cwd, initialPrompt })` yang mengembalikan `{ command,
args }` untuk dipakai `node-pty`. Untuk Claude Code: command `claude`,
args berisi flag bypass-permission yang sesuai (research nama flag CLI
Claude Code yang benar — dokumentasikan di komentar kode jika berbeda dari
asumsi `--permission-mode bypassPermissions`; jika ragu, tandai sebagai
`// TODO: verifikasi flag CLI resmi` dan pilih pendekatan paling aman yang
tersedia). Untuk OpenCode: sama, riset flag non-interaktif yang tersedia
di CLI opencode. `initialPrompt` dikirim sebagai input pertama ke pty
setelah proses siap (bukan sebagai argumen CLI, kecuali CLI mendukung flag
prompt langsung — sesuaikan berdasarkan hasil riset).
**Cara Test:** Panggil manual dengan `cwd` folder testing kosong dan
prompt `"halo"`, pastikan proses CLI benar-benar terbuka (cek `ps aux` ada
proses `claude`/`opencode` berjalan) dan menerima input tsb.

### TASK-027: `core/prompt-builder.js`
**Deskripsi:** Fungsi `buildInitialPrompt({ task, projectGroup,
kanbanGroups })` yang menghasilkan string prompt sesuai format di
`ARCHITECTURE.md` §6.1 poin 2: sertakan `project_group_uuid` (atau
`"null"` jika tidak pakai grouping), `task_uuid`, daftar seluruh kanban
group (uuid, slash_command, next_step_group_id, instruction) dalam format
list yang mudah dibaca AI (boleh JSON di dalam code block agar model AI
gampang parsing), instruksi eksplisit untuk memanggil `ai-commander-cli
update ...` sendiri, dan `detail` task dari user di bagian paling akhir
prompt dengan label jelas (`"=== TASK DETAIL ==="`).
**Cara Test:** Buat unit test kecil (`node -e` atau file test manual) yang
memanggil fungsi dengan data dummy, print hasil prompt, cek semua elemen
wajib ada di string tsb.

### TASK-028: `core/task-runner.js`
**Deskripsi:** Modul ini bertanggung jawab siklus hidup pty per task:
- `startTask(taskId)`: ambil data task+project group+kanban groups dari
  DB, panggil `prompt-builder`, panggil adapter provider yang sesuai
  (`ai_provider` field), spawn pty via `node-pty` dengan `cwd = repoPath`
  (atau `process.cwd()` jika tidak grouping — catat sebagai keterbatasan
  tahap 1 di komentar kode), simpan `session_pid` & `session_status =
  'running'` ke DB, kirim `initialPrompt` ke pty stdin.
- Tangkap event `pty.onData` → simpan tiap chunk ke `task_events` (type
  `log`) DAN broadcast via WS channel `task:<id>`.
- Tangkap event `pty.onExit` → update `session_status = 'finished'` (atau
  `'error'` jika exit code != 0), set `finished_at`.
- `sendFollowupInstruction(taskId, text)`: cari pty aktif untuk task
  tsb (simpan referensi pty di in-memory Map `taskId -> ptyProcess`
  selama proses server berjalan, karena pty tidak bisa "diambil lagi"
  setelah restart server — dokumentasikan keterbatasan ini: jika server
  di-restart, task yang sedang `running` akan orphan dan perlu ditandai
  `error`/`interrupted` saat server start ulang, lihat TASK-029).
**Cara Test:** Start task dummy dengan provider yang benar-benar
terinstal di environment dev, pastikan output pty muncul di
`task_events` secara realtime, dan proses benar-benar berjalan di
background.

### TASK-029: Recovery orphaned task saat server restart
**Deskripsi:** Saat server start (`bin/server.js`), sebelum membuka HTTP
listener, query semua `tasks` dengan `session_status = 'running'` dari
sesi sebelumnya (server sebelumnya mati/di-restart tanpa proses exit
normal). Untuk task-task ini, set `session_status = 'interrupted'` dan
tambahkan `task_events` (type `error`, content: `"Server direstart,
session sebelumnya terputus. Silakan mulai ulang task ini secara
manual."`). Jangan mencoba auto-resume pty lama (di luar cakupan tahap 1).
**Cara Test:** Start task, paksa kill proses server (`kill -9`) tanpa
menghentikan pty (atau simulasikan dengan set manual `session_status =
'running'` di DB), start ulang server, cek task tsb berubah jadi
`interrupted` dan event error tercatat.

### TASK-030: Endpoint `POST /api/tasks/:id/start`
**Deskripsi:** Endpoint ini memanggil urutan dari `ARCHITECTURE.md` §6.1:
pindahkan task dari TO-DO ke `next_step_group_id` milik TO-DO (default ON
PROGRESS) DULU, broadcast event board, baru panggil
`taskRunner.startTask(taskId)`. Balas response segera `{ ok: true,
status: 'starting' }` tanpa menunggu task selesai (proses pty jalan di
background, statusnya dipantau lewat WS `task:<id>`).
**Cara Test:** Klik "start" dari UI (atau `curl`), cek task langsung
pindah ke ON PROGRESS di board, dan Task Progress View menerima stream
log dari pty.

---

## FASE 7 — Frontend: Layout Dasar & Navigasi

### TASK-031: `public/index.html` + `public/css/app.css` (layout dasar)
**Deskripsi:** Buat layout halaman utama: header dengan 2 tombol
icon+title `KANBAN | LIST` (toggle tampilan), tombol teks `Setting` di
kanan header. Di bawah header: dropdown "Change Project Group" (default
`"default"`) + tombol "Open Orchestrator", lalu container kosong untuk
kanban board / list view (di-swap via JS, lihat TASK-034/035). Styling
native CSS (flexbox/grid), tanpa framework CSS pihak ketiga.
**Cara Test:** Buka di browser, layout tampil sesuai deskripsi, responsif
minimal di lebar layar umum (>=1024px cukup untuk tahap 1, mobile
bukan prioritas).

### TASK-032: `public/js/ws-client.js` — koneksi WS reusable
**Deskripsi:** Buat modul kecil (bisa plain function, bukan class jika
lebih sederhana) `connectChannel(channelName, onMessage)` yang membuka
`WebSocket` ke `/ws` server, mengirim `{subscribe: channelName}` setelah
`onopen`, lalu memanggil `onMessage(data)` untuk tiap pesan masuk
(`JSON.parse`). Tambahkan auto-reconnect sederhana (retry tiap 3 detik
jika koneksi putus).
**Cara Test:** Buka console browser, panggil
`connectChannel('board', console.log)`, trigger event dari backend (buat
task baru via curl), pastikan log muncul di console.

### TASK-033: Halaman Setting — struktur & navigasi
**Deskripsi:** Buat `public/settings.html` (atau render via JS sebagai
"view" dalam SPA sederhana — pilih salah satu pendekatan, dokumentasikan
di komentar). Tombol `Setting` di header (TASK-031) mengarah ke halaman
ini. Sediakan tempat untuk: toggle `Use Grouping Project? yes/no`,
section "Project Alias Mapping" (muncul hanya jika grouping=yes), section
"Kanban Group Setting" (list kanban group + form tambah/edit).
**Cara Test:** Navigasi dari halaman utama ke Setting dan kembali
berfungsi tanpa reload penuh yang menghilangkan state (boleh full reload
jika arsitekturnya multi-page, itu OK untuk tahap 1 — prioritaskan
kesederhanaan native di atas kehalusan SPA).

---

## FASE 8 — Frontend: Halaman Setting (Fungsional)

### TASK-034: Toggle "Use Grouping Project" + Project Alias Mapping form
**Deskripsi:** Di `settings.js`: fetch `GET /api/settings` saat halaman
load, render toggle sesuai nilai `use_grouping_project`. Saat user ubah
toggle, panggil `PUT /api/settings`. Jika `true`, tampilkan form
"Project Alias Mapping": list existing `project_groups` (fetch `GET
/api/project-groups`) dengan kolom Name + Path, tombol tambah baris baru
(input Name + input Path + tombol Save memanggil `POST
/api/project-groups`), tombol edit & delete per baris.
**Cara Test:** Toggle ke `yes`, tambah 2 mapping (`RMS` → path A,
`Backend RMS` → path B), refresh halaman, data tetap muncul (tersimpan di
DB, bukan hanya di memory browser).

### TASK-035: Kanban Group Setting form
**Deskripsi:** Tampilkan list kanban group (fetch sesuai
`project_group_id` yang dipilih jika grouping aktif, atau global jika
tidak). Untuk tiap kanban group, tampilkan form inline/modal kecil:
dropdown "Next step move to" (isi = daftar kanban group lain, kecuali diri
sendiri), textarea "In this step instruction" (disabled/kosong terkunci
untuk TO-DO). Tombol "Tambah Kanban Group Baru" (input Name saja, generate
`slash_command` otomatis dari nama, mis. lowercase + ganti spasi jadi
`-`, prefix `/`). Tombol delete per baris (disable/hidden untuk TO-DO dan
DONE — kanban group dengan `is_locked_todo`/`is_locked_done = 1`).
**Cara Test:** Tambah kanban group baru "TESTING", set next-step-nya ke
"COMMIT", refresh, cek urutan & instruksi tersimpan lewat `GET
/api/kanban-groups`.

---

## FASE 9 — Frontend: Kanban Board & List View

### TASK-036: Render Kanban Board (read-only dulu)
**Deskripsi:** `public/js/kanban.js`: fetch `GET /api/kanban-groups` +
`GET /api/tasks` (filter sesuai Project Group aktif), render kolom sesuai
`position`, tiap kolom menampilkan card task (tampilkan `id` short-uuid +
cuplikan `detail` + badge `ai_provider`). Subscribe channel `board` (pakai
`ws-client.js`) untuk re-render otomatis saat ada perubahan dari server
(tanpa perlu refresh manual).
**Cara Test:** Buat beberapa task dummy via `curl` di kolom berbeda, buka
halaman kanban, semua card tampil di kolom yang benar. Ubah task lewat
`curl` transition endpoint, card pindah kolom otomatis tanpa refresh.

### TASK-037: Drag & drop antar kolom (opsional interaktif) + tombol aksi card
**Deskripsi:** Tambahkan drag-and-drop native (`draggable="true"` +
event `dragstart`/`dragover`/`drop`, tanpa library) untuk memindah task
antar kolom manual → panggil `POST /api/tasks/:id/transition`. Di kolom
`TO-DO`: tombol "Add New Task" di header kolom (buka modal, lihat
TASK-039) dan tombol "Start" di tiap card TO-DO (panggil `POST
/api/tasks/:id/start`). Di kolom `DONE`: tombol "Delete" di tiap card
(panggil `DELETE /api/tasks/:id`) DAN tombol "Deleted Task" di header
kolom (buka halaman/modal Deleted Task, lihat TASK-042).
**Cara Test:** Drag card dari TO-DO ke ON PROGRESS manual, cek DB
berubah. Klik Start pada task TO-DO, cek pindah otomatis + Task Progress
View bisa dibuka dari card tsb (lihat TASK-040).

### TASK-038: Toggle KANBAN | LIST view
**Deskripsi:** `public/js/list-view.js`: render alternatif tampilan
tabel/list (bukan kolom) dari data task yang sama — kolom tabel: ID,
Detail (cuplikan), Kanban Group (nama), AI Provider, Created At, tombol
aksi (Start/Delete sesuai kondisi kanban group-nya). Tombol header
`KANBAN`/`LIST` di `index.html` men-toggle antara `kanban.js` render dan
`list-view.js` render tanpa reload halaman (sembunyikan/tampilkan
container terkait, atau re-render container yang sama).
**Cara Test:** Toggle antar 2 mode beberapa kali, data konsisten (jumlah
task sama di kedua tampilan), state Project Group aktif tidak reset saat
toggle.

### TASK-039: Modal New Task & Edit Task
**Deskripsi:** Buat 1 komponen modal reusable (`public/js/modal.js`
generik) dipakai untuk 2 kebutuhan: New Task (form: textarea Detail Task,
select AI Provider `claude code`/`openrouter` — **catatan**: spesifikasi
asli menyebut pilihan "openrouter", tapi provider yang diimplementasikan
di backend (TASK-026) adalah `claude-code` dan `opencode`; tandai ini
sebagai "OPEN QUESTION" di laporan kerja dan gunakan value
`claude-code`/`opencode` di option select mengikuti backend, minta
konfirmasi user), tombol Save (`POST /api/tasks`) & Cancel. Edit Task:
form sama tapi pre-filled dari data existing, Save memanggil `PUT
/api/tasks/:id`.
**Cara Test:** Buat task baru lewat modal, muncul di kolom TO-DO. Edit
detail-nya lewat modal Edit, perubahan tersimpan & tampil di card.

### TASK-040: New Group modal (dari halaman Kanban, bukan Setting)
**Deskripsi:** Jika ada tombol tambah kolom kanban langsung dari board
(opsional, sesuai spek "UI new group" yang disebut terpisah dari Setting)
buat modal sederhana: input Name + tombol Save (panggil `POST
/api/kanban-groups` dengan `next_step_group_id=null` & `instruction=null`
default, bisa diedit lebih lanjut lewat halaman Setting) & Cancel.
**Cara Test:** Buat kolom baru dari board, muncul sebagai kolom kosong di
posisi paling kanan.

---

## FASE 10 — Task Progress View & Orchestrator (Frontend)

### TASK-041: Task Progress View (terminal viewer)
**Deskripsi:** `public/js/task-progress.js`: saat card task diklik (atau
tombol "View Progress"), buka panel/modal fullscreen yang subscribe
channel `task:<id>` via `ws-client.js`, render tiap chunk log sebagai teks
di elemen `<pre>` dengan auto-scroll ke bawah. Parsing ANSI dasar manual:
minimal dukung reset (`\x1b[0m`) dan warna dasar (`\x1b[31m` merah, dst)
dengan mapping ke `<span style="color:...">` — cukup subset umum, tidak
perlu library ANSI penuh. Saat load pertama, fetch history log task
tersebut (buat endpoint baru `GET /api/tasks/:id/events` yang
mengembalikan `task_events` type `log` terurut `created_at ASC` —
tambahkan endpoint ini di `tasks.routes.js`).
**Cara Test:** Start sebuah task nyata, buka Task Progress View-nya,
output CLI (termasuk warna dasar) tampil realtime sesuai urutan
kemunculan.

### TASK-042: Halaman Orchestrator
**Deskripsi:** `public/orchestrator.html` + `public/js/orchestrator.js`:
tombol "Open Orchestrator" di board (TASK-031) membuka halaman/panel ini.
Panel berisi 1 terminal penuh: panggil `POST /api/orchestrator/start`
untuk membuka pty orchestrator (implementasikan endpoint ini di
`orchestrator.routes.js`, pakai `core/orchestrator-runner.js` — pty
generik yang menjalankan provider AI pilihan user di root workspace,
TANPA context task tertentu), subscribe channel `orchestrator` untuk
stream output, sediakan input text box untuk mengirim perintah/pesan
manual ke pty tsb (`POST` endpoint kirim stdin, atau lewat WS message
langsung — pilih salah satu, dokumentasikan).
**Cara Test:** Buka Orchestrator, ketik instruksi bebas (mis. "buatkan 3
task todo untuk refactor modul X"), verifikasi agent bisa memanggil
endpoint `POST /api/orchestrator/create-tasks` (atau langsung `POST
/api/tasks` berkali-kali) untuk benar-benar membuat task baru yang muncul
di board.

### TASK-043: Dashboard view
**Deskripsi:** `public/js/dashboard.js`: render section (bisa jadi bagian
dari halaman utama, mis. sidebar/atas board) menampilkan tabel: Project
Group | Total Token Usage (K) | Total Task Done — fetch `GET
/api/dashboard/summary` (implementasikan endpoint ini di
`dashboard.routes.js`, gabungkan hasil `tokenUsage.repo.sumByProjectGroup()`
dan `countDoneByProjectGroup()`). Subscribe channel `board` juga untuk
re-fetch dashboard saat ada task baru masuk `DONE` atau token usage baru
tercatat (tambahkan broadcast type baru `token_usage_updated` di
`task-runner.js` saat `token-usage-parser.js` berhasil parse angka usage
dari output CLI).
**Cara Test:** Selesaikan sebuah task hingga DONE, cek dashboard
ter-update realtime (total done +1 untuk project group terkait).

### TASK-044: Halaman/Modal Deleted Task
**Deskripsi:** `public/js/deleted-task.js`: dibuka dari tombol "Deleted
Task" di header kolom DONE (TASK-037). Fetch `GET /api/tasks/deleted`,
render list task terhapus (tampilkan `id`, cuplikan detail, tanggal
`deleted_at`), tombol "Move to To-Do" per item memanggil `POST
/api/tasks/:id/restore`.
**Cara Test:** Hapus task dari board, buka Deleted Task view, klik "Move
to To-Do", task muncul kembali di kolom TO-DO board utama.

---

## FASE 11 — Token Usage Parsing

### TASK-045: `core/token-usage-parser.js`
**Deskripsi:** Buat parser yang menyisir tiap chunk output pty (dari
`task-runner.js` §onData) mencari pola output token usage yang biasa
dicetak CLI (mis. `"Tokens: 1234 in, 567 out"` atau format lain sesuai
CLI Claude Code/OpenCode yang sebenarnya — **WAJIB riset dulu format asli
output usage dari kedua CLI tsb sebelum implement regex**, jangan
menebak-nebak; jika format bervariasi antar versi CLI, buat beberapa
pattern regex dan dokumentasikan sumber masing-masing pola di komentar
kode). Saat pola ketemu, panggil
`tokenUsage.repo.record({projectGroupId, taskId, tokensInput,
tokensOutput})` dan broadcast `token_usage_updated`.
**Cara Test:** Jalankan task nyata sampai CLI mencetak info token usage,
cek row baru masuk ke tabel `token_usage` dengan angka yang sesuai dengan
yang ditampilkan CLI aslinya.

---

## FASE 12 — Packaging & Finalisasi

### TASK-046: Finalisasi `bin/server.js` (real entrypoint)
**Deskripsi:** Gabungkan seluruh modul (`db/connection.js`,
`http-server.js`, `ws-server.js`, `ipc-socket.js`, recovery orphaned task
TASK-029) jadi 1 alur startup di `bin/server.js`: 1) init DB & migration,
2) recovery orphaned tasks, 3) start HTTP server + WS + static serving,
4) start unix socket IPC, 5) tulis `~/.ai-commander/server.json`, 6) log
ke console URL dashboard (`http://localhost:<port>`) dan opsional buka
browser otomatis (native, pakai `child_process.exec('open ...')` /
`xdg-open`/`start` sesuai OS — deteksi `process.platform`).
**Cara Test:** `npx ai-commander` (setelah `npm link` lokal) benar-benar
menjalankan seluruh sistem end-to-end: buat project group, buat kanban
group custom, buat task, start task (kalau ada CLI provider terinstal di
mesin test), lihat progress, sampai task pindah manual/otomatis ke DONE,
lihat dashboard & deleted task — smoke test menyeluruh.

### TASK-047: Dokumentasi akhir & checklist rilis
**Deskripsi:** Update `README.md` jika ada detail yang berubah selama
implementasi (mis. nama flag CLI provider yang benar setelah riset di
TASK-026, keterbatasan yang ditemukan di TASK-028/029). Buat checklist
manual rilis sederhana di README atau file `CHECKLIST.md`: pastikan
`npm pack` menghasilkan tarball yang valid, `npx ai-commander` dari
tarball tsb (test lokal, bukan publish ke registry publik dulu) berjalan
tanpa error di direktori kosong baru.
**Cara Test:** Ikuti checklist tsb satu per satu di environment bersih
(folder baru, tanpa `node_modules` sebelumnya).

---

## Catatan "Open Questions" yang Perlu Dikonfirmasi ke Pemilik Project

Kumpulkan dan laporkan poin-poin berikut ke pemilik project (jangan
diputuskan sepihak oleh developer/AI junior tanpa konfirmasi):

1. Provider "openrouter" disebut di spesifikasi awal UI New Task, namun
   arsitektur teknis (koneksi CLI langsung) baru mencakup `claude-code`
   dan `opencode`. Perlu klarifikasi apakah "openrouter" dimaksud sebagai
   provider CLI terpisah, atau salah ketik dari "opencode".
2. Flag CLI resmi untuk bypass-permission di Claude Code dan OpenCode
   perlu diverifikasi ke dokumentasi resmi masing-masing CLI (bisa
   berubah antar versi) — jangan asal tebak nama flag.
3. Format output token usage asli dari kedua CLI (untuk parser di
   TASK-045) perlu contoh log nyata sebelum regex final ditulis.
4. Perilaku ketika `Use Grouping Project = no`: task tidak terikat
   `repo_path` tertentu secara otomatis — perlu diputuskan apakah cwd
   default pty adalah folder tempat `ai-commander` dijalankan, atau perlu
   input path manual per task di form New Task untuk kasus ini.
