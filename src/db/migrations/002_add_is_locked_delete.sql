-- 002_add_is_locked_delete.sql
-- Tambah kolom untuk proteksi delete generic (dipakai a.l. untuk kanban group ON PROGRESS)

ALTER TABLE kanban_groups ADD COLUMN is_locked_delete INTEGER NOT NULL DEFAULT 0;

-- Retroactive fix: kanban group ON PROGRESS yang SUDAH ada (dibuat oleh seed default
-- lama di connection.js sebelum task ini dikerjakan) ikut diproteksi juga.
UPDATE kanban_groups SET is_locked_delete = 1 WHERE slash_command = '/on-progress';
