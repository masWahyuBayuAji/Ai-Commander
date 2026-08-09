بِسْمِ اللهِ الرَّحْمنِ الرَّحِيمِ
آللَّهُمَّ صَلِّ  وَ سَلِّم عَلَى سَيِّدِنَا مُحَمَّدٍ وَ عَلَى آلِ سَيِّدِنَا مُحَمَّد

# ai-commander

**Kanban-based task orchestrator untuk AI coding agent (Claude Code & OpenCode), dengan dukungan multi-repository, mode bypass-permission, dan usaha efisiensi penggunaan token.**

---

## Kenapa ai-commander?

Setelah mencoba beberapa tools kanban/orchestrator AI yang ada, ditemukan dua masalah umum:

1. **Network/usage yang membengkak tidak wajar** saat tool pihak ketiga menjalankan Claude Code di background (indikasi overhead yang tidak perlu / polling berlebihan).
2. **Konsumsi quota yang jauh lebih boros** dibanding menjalankan task yang sama secara manual dalam satu sesi CLI utuh (misalnya 1 task manual = 1-3% quota, tapi lewat app orchestrator multi-agent bisa sampai 10%).

`ai-commander` dibangun dengan filosofi:

- **1 task = 1 session CLI** (tidak ada overhead multi-agent/multi-commander yang tidak perlu).
- **Instruksi antar-tahap kanban disuntikkan langsung ke prompt agent**, bukan lewat polling terus-menerus.
- **Native code sepenuhnya** (minim dependency pihak ketiga) agar perilaku tool sepenuhnya bisa diaudit dan dikontrol.
- **Bypass permission** untuk operasi CLI (tanpa konfirmasi manual berulang), karena agent sudah diberi instruksi & wewenang yang jelas per tahap kanban.

---

## Fitur Utama

- 📋 **Kanban board** dengan kanban group yang bisa dikustomisasi (default: `TO-DO`, `ON PROGRESS`, `NEED REVIEW`, `COMMIT`, `DONE`)
- 📃 Toggle tampilan **Kanban / List**
- 🗂️ **Multi-repository** via **Project Group** (mapping alias project ke path folder)
- ⚙️ **Kanban Group Settings**: atur alur "next step move to" (termasuk untuk TO-DO) + instruksi default per tahap
- 🖥️ **Task Progress View**: slide-in panel di sisi kiri layar dengan live terminal interaktif dari session AI yang sedang berjalan
- ✍️ **Task Progress Input**: terminal interaktif — user bisa mengetik langsung di terminal untuk mengirim perintah/pesan ke task yang sedang berjalan
- 🧭 **Orchestrator Terminal**: slide-in panel di sisi kanan layar untuk membuat task/list task secara otomatis
- 📊 **Dashboard realtime**: total token usage (dalam K) & total task selesai per Project Group (section dashboard hidden by default di `index.html`, data tetap di-load secara background)
- 🗂️ **Project Alias Mapping card**: menampilkan informasi alias mapping (name, path, working directory) untuk project group yang aktif
- 🗑️ **Soft-delete task**: task yang dihapus disimpan (bukan dihapus permanen), bisa dikembalikan ke `TO-DO`
- 🤖 Dukungan provider: **Claude Code** & **OpenCode** (via CLI, bypass permission)
- 🔄 **Task Runner AI Agent Mode**: pilih antara **INTERACTIVE** (AI bisa tanya balik ke user) atau **HEADLESS** (non-interactive, auto-exit) di halaman Setting
- 📖 **Auto-read project rules**: jika working directory adalah home directory, AI otomatis membaca `AGENTS.md`/`CLAUDE.md` dari setiap path project sebelum memulai pekerjaan
- 🔍 **Verbose output untuk Claude Code**: menampilkan detail tool call (Bash/Grep/Read/dll) di output terminal, mendekati pengalaman OpenCode
- 🔁 Agent AI dapat **memindahkan task antar kanban group secara otomatis** lewat perintah CLI internal (`ai-commander-cli update ...`)
- 🛠️ **CLI `ai-commander-cli`**: command `update` (pindah kanban group) & `create` (buat task baru) bisa dipanggil langsung oleh AI agent
- 🔄 **Auto-recovery**: server otomatis memulihkan task yang terputus saat server di-restart
- 🔗 **Next Run (Auto-Trigger)**: link task satu sama lain agar task berikutnya otomatis di-start saat task sebelumnya DONE. Klik icon pada task sumber lagi untuk clear/unlink koneksi.
- 🔶 **Polygon connection lines**: visualisasi garis SVG bezier penghubung antar task card yang ter-link
- 🟢 **Running indicator**: task yang sedang berjalan ditandai dengan border hijau dan label "Running"
- ⚡ **Optimistic UI**: tombol Start menampilkan feedback langsung saat diklik (Starting... → Running)
- 💾 **Persistent project group selection**: pilihan project group terakhir disimpan otomatis dan di-restore setelah reload
- 📌 **Sticky toolbar**: header dan toolbar tetap terlihat di atas layar saat scroll-y

---

## Instalasi & Menjalankan

```bash
# Jalankan langsung via npx (tanpa install global)
npx ai-commander
```

Atau instalasi global:

```bash
npm install -g ai-commander
ai-commander
```

Setelah dijalankan, ai-commander akan:
1. Menginisialisasi database SQLite lokal (`~/.ai-commander/data.db`)
2. Menjalankan recovery task orphaned jika ada sesi sebelumnya yang terputus
3. Menjalankan local web server (default: `http://localhost:4321`)
4. Menjalankan unix socket IPC (`~/.ai-commander/ipc.sock`) & menulis info server ke `~/.ai-commander/server.json`
5. Membuka dashboard di browser secara otomatis

Untuk menjalankan tanpa auto-open browser:
```bash
NO_BROWSER=1 npx ai-commander
```

---

## Persyaratan

- Node.js >= 18
- CLI `claude` (Claude Code) dan/atau `opencode` sudah terinstal & ter-autentikasi di mesin yang sama
- SQLite (menggunakan native binding, lihat `ARCHITECTURE.md`)

---

## Alur Kerja Singkat

1. Buat **Project Group** (opsional, jika multi-repo diaktifkan di Setting) → mapping alias ke path folder repo.
2. Buat kanban group & aturan alur (`next step move to`, instruksi per tahap) di halaman **Setting**.
3. Buat task baru di kolom `TO-DO` (isi detail task + pilih AI Provider).
4. Klik start → tombol berubah menjadi "Starting..." (optimistic UI), lalu:
   - Task dipindah ke tahap berikutnya (default: `ON PROGRESS`)
   - Task card mendapat border hijau dengan label "Running"
   - Tombol Start berubah menjadi disabled "Running"
   - ai-commander membuka 1 session CLI (Claude Code/OpenCode) dengan bypass permission
   - Mode **INTERACTIVE** (default): AI bisa menampilkan pertanyaan dan user
     bisa menjawab langsung di terminal task progress
   - Mode **HEADLESS**: CLI berjalan otomatis tanpa intervensi user
   - Agent menerima instruksi workflow berisi:
     - UUID Project Group
     - UUID Task (pendek)
     - **Next Step Group ID** (UUID target langsung, bukan placeholder)
     - DONE Group ID
     - Daftar kanban group + urutan "next step move to" + instruksi tiap tahap
     - **Task detail** dari user (digabung dalam satu file sistem prompt/agent)
5. Task otomatis dipindah ke tahap berikutnya (default: `ON PROGRESS`).
6. Agent bekerja, dan ketika pekerjaan selesai, agent WAJIB memanggil:
   ```bash
   ai-commander-cli update <project_group_uuid> <task_uuid> <next_step_group_id>
   ```
   Instruksi sudah terisi langsung dengan UUID target (bukan placeholder), sehingga
   agent tidak perlu menebak. Tanpa menjalankan perintah ini, task akan tetap
   terjebak di tahap saat ini.
7. UI kanban ter-update secara realtime tanpa perlu reload, dashboard token usage ikut ter-update.
8. (Opsional) User bisa menghubungkan task ke task lainnya via **icon polygon** — saat task DONE, task berikutnya otomatis di-start. Klik icon pada task sumber lagi untuk clear/unlink koneksi.
8. Klik "View" pada task card untuk membuka **slide-in panel** di sisi kiri layar yang menampilkan live terminal output dari task yang sedang berjalan.
9. Task terus berjalan otomatis melewati tahap-tahap kanban (`NEED REVIEW` → `COMMIT` → `DONE`) sesuai instruksi masing-masing tahap, kecuali ada tahap yang sengaja ditandai untuk dijalankan manual.

### Membuat task dari Orchestrator

Ketika user membuka Orchestrator (slide-in panel di sisi kanan layar), AI agent di dalamnya sudah diberi instruksi awal tentang cara membuat task. User cukup ketik dalam bahasa alami:

> "Buat task baru dengan deskripsi 'Buat halaman login'"

AI agent akan menjalankan:
```bash
ai-commander-cli create <project_group_uuid> "Buat halaman login" opencode
```

Task baru langsung muncul di kolom `TO-DO` secara realtime.

---

## Dokumentasi Lengkap

- Arsitektur teknis: lihat [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Checklist rilis: lihat [`CHECKLIST.md`](./CHECKLIST.md)
- Lisensi: lihat [`LICENSE.md`](./LICENSE.md)

---

## Keterbatasan Tahap 1

- **PTY in-memory**: proses PTY yang sedang berjalan hanya tersimpan di memori server. Jika server di-restart, task yang sedang `running` akan ditandai `interrupted` dan perlu dimulai ulang secara manual.
- **Single workspace**: jika `Use Grouping Project = no`, cwd default pty adalah folder tempat `ai-commander` dijalankan. Jika `Use Grouping Project = yes`, user bisa memilih Working Directory per project group (dari daftar alias mapping) sebagai cwd PTY — tapi belum ada input path manual per task secara individual.
- **No HTTPS**: server hanya mendukung HTTP (localhost only, bukan untuk deployment publik).
- **Open Questions**: beberapa detail perlu dikonfirmasi — lihat bagian Open Questions di `TASKS.md`.

---

## Lisensi

Project ini menggunakan **lisensi kustom (ACCL v1.0)**:

- ✅ Gratis digunakan untuk mengerjakan proyek apa pun (pribadi, riset, edukasi, maupun komersial).
- ❌ Dilarang memodifikasi/menjual ulang Software ini sebagai aplikasi berbayar atau layanan SaaS berbayar (asli maupun turunannya), **kecuali** oleh pencipta awal — dan itu pun hanya untuk fitur tambahan opsional (cloud sync, managed inference, dsb.), dengan versi dasar tetap gratis untuk semua orang.

Baca selengkapnya di [`LICENSE.md`](./LICENSE.md).
