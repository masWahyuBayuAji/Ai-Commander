const db = require('../connection');

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
const deleteSettingStmt = db.prepare('DELETE FROM settings WHERE key = ?');
const getAllSettingsStmt = db.prepare('SELECT key, value FROM settings');

function getSetting(key) {
  const row = getSettingStmt.get(key);
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function setSetting(key, value) {
  if (value === undefined || value === null) {
    deleteSettingStmt.run(key);
    return;
  }
  const jsonValue = JSON.stringify(value);
  setSettingStmt.run(key, jsonValue);
}

function getAllSettings() {
  const rows = getAllSettingsStmt.all();
  const settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  return settings;
}

module.exports = { getSetting, setSetting, getAllSettings };