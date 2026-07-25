const crypto = require('node:crypto');

function generateShortId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

module.exports = generateShortId;
