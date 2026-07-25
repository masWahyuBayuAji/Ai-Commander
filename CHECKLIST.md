بِسْمِ اللهِ الرَّحْمنِ الرَّحِيمِ

# CHECKLIST.md — Rilis ai-commander

Checklist manual sebelum rilis. Jalankan satu per satu di environment bersih.

---

## Prasyarat

- [ ] Node.js >= 18 terinstal (`node -v` harus >= 18.0.0)
- [ ] Build tools untuk native module tersedia (`node-gyp`, `python3`, `make`/`gcc`)
- [ ] Folder `~/.ai-commander` dihapus agar test dimulai dari kondisi fresh

## 1. Build & Pack

- [ ] `npm install` berjalan tanpa error (termasuk compile `better-sqlite3` dan `node-pty`)
- [ ] `npm pack` menghasilkan file tarball `.tgz` (mis. `ai-commander-0.1.0.tgz`)
- [ ] File tarball berisi semua file yang diperlukan:
  - [ ] `bin/server.js`, `bin/cli.js`
  - [ ] `src/` (semua modul: server, db, core, shared)
  - [ ] `public/` (index.html, orchestrator.html, css, js)
  - [ ] `package.json`

## 2. Test Install dari Tarball

- [ ] Buat folder test baru yang bersih (mis. `/tmp/ai-commander-test`)
- [ ] Jalankan `npm install /path/to/ai-commander-0.1.0.tgz` di folder test
- [ ] Jalankan `npx ai-commander` — server harus start tanpa error
- [ ] Cek `~/.ai-commander/data.db` terbuat
- [ ] Cek `~/.ai-commander/server.json` berisi `httpPort`, `socketPath`, `pid`
- [ ] Cek `~/.ai-commander/ipc.sock` terbuat
- [ ] Dashboard bisa diakses di `http://localhost:4321`

## 3. Smoke Test Fungsionalitas

- [ ] **Settings**: toggle `Use Grouping Project` berfungsi
- [ ] **Project Group**: CRUD project group (create, edit, delete) berfungsi
- [ ] **Kanban Group**: 5 default groups muncul (TO-DO, ON PROGRESS, NEED REVIEW, COMMIT, DONE)
- [ ] **Kanban Group**: tidak bisa menghapus TO-DO atau DONE (locked)
- [ ] **Task**: buat task baru via modal, muncul di kolom TO-DO
- [ ] **Task**: edit task (detail/provider) tersimpan
- [ ] **Task**: drag & drop task antar kolom berfungsi
- [ ] **Task Start**: klik Start pada task TO-DO, task pindah ke ON PROGRESS
- [ ] **Task Progress**: terminal viewer menampilkan output real-time
- [ ] **Task Delete**: hapus task dari kolom DONE, task masuk Deleted Task view
- [ ] **Task Restore**: restore task dari Deleted Task view kembali ke TO-DO
- [ ] **Dashboard**: total done & token usage ter-update
- [ ] **CLI Bridge**: `ai-commander-cli update - <task_id> <kanban_id>` berfungsi
- [ ] **WebSocket**: perubahan task ter-update real-time tanpa refresh

## 4. Recovery Test

- [ ] Jalankan task sampai status `running`
- [ ] Kill server paksa (`kill -9 <pid_server>`)
- [ ] Jalankan server ulang
- [ ] Task yang sebelumnya `running` berubah jadi `interrupted`
- [ ] Task event error tercatat di task_events

## 5. Multi-Provider Test

- [ ] Test dengan provider `claude-code` (jika CLI terinstal)
- [ ] Test dengan provider `opencode` (jika CLI terinstal)
- [ ] Provider yang tidak terinstal menghasilkan error yang jelas

## 6. Cleanup

- [ ] Hapus folder test setelah selesai
- [ ] Hapus tarball `.tgz` yang dihasilkan `npm pack`

---

## Open Questions (perlu konfirmasi ke pemilik project)

1. Provider "openrouter" di spesifikasi awal vs "opencode" di implementasi — perlu klarifikasi
2. Flag CLI bypass-permission untuk Claude Code dan OpenCode — perlu verifikasi ke dokumentasi resmi
3. Format output token usage dari CLI — perlu contoh log nyata
4. Perilaku `Use Grouping Project = no` — cwd default pty atau input path manual?

---

_Documentation generated as part of TASK-047_
