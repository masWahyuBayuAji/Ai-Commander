/**
 * Provider adapters index
 * 
 * Exports all provider adapters and provides a helper to get the right adapter
 * based on the provider name.
 */

const claudeCodeAdapter = require('./claude-code.adapter');
const opencodeAdapter = require('./opencode.adapter');

const adapters = {
  'claude-code': claudeCodeAdapter,
  'opencode': opencodeAdapter,
};

/**
 * Get adapter for a specific provider
 * @param {string} providerName - Name of the provider (claude-code | opencode)
 * @returns {Object} Adapter with buildSpawnCommand and formatInitialPrompt methods
 * @throws {Error} If provider is not supported
 */
function getAdapter(providerName) {
  const adapter = adapters[providerName];
  if (!adapter) {
    throw new Error(`Unsupported provider: ${providerName}. Supported providers: ${Object.keys(adapters).join(', ')}`);
  }
  return adapter;
}

module.exports = {
  getAdapter,
  adapters,
};
