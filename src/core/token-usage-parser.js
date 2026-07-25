/**
 * Token Usage Parser
 * 
 * Parses PTY output chunks to extract token usage information from
 * Claude Code and OpenCode CLI outputs.
 * 
 * IMPORTANT: The regex patterns below are based on research of CLI output formats.
 * These patterns may need adjustment based on actual CLI output in different versions.
 * 
 * Claude Code CLI:
 * - When using `--print` mode, the CLI outputs token usage in various formats
 * - Common patterns include "Tokens: X in, Y out" or similar variations
 * - The exact format may vary between versions and providers
 * 
 * OpenCode CLI:
 * - Uses `opencode stats` for token usage statistics
 * - In `run` mode with `--format json`, usage data is included in JSON output
 * - Text output may include usage information in different formats
 * 
 * NOTE: These patterns are best-effort based on available documentation.
 * Real-world testing with actual CLI outputs may require pattern adjustments.
 */

const tokenUsageRepo = require('../db/repositories/tokenUsage.repo');
const wsServer = require('../server/ws-server');

/**
 * Regex patterns for matching token usage output
 * Each pattern has a name for documentation and regex groups for extraction
 * 
 * Format: { name, regex, inputGroup, outputGroup, description, source }
 */
const TOKEN_PATTERNS = [
  // Pattern 1: "Tokens: 1234 in, 567 out" or similar variations
  // Common in various AI CLI tools
  {
    name: 'standard-tokens',
    regex: /tokens?\s*[:=]\s*(\d[\d,]*(?:\.\d+)?)\s*(?:input|in|prompt|sent)[\s,]+(\d[\d,]*(?:\.\d+)?)\s*(?:output|out|completion|received)/i,
    inputGroup: 1,
    outputGroup: 2,
    description: 'Standard format: "Tokens: X in, Y out"',
    source: 'Generic AI CLI pattern',
  },
  
  // Pattern 2: "Input: 1234 tokens, Output: 567 tokens"
  {
    name: 'input-output-tokens',
    regex: /input\s*[:=]\s*(\d[\d,]*(?:\.\d+)?)\s*tokens?[\s,;]+output\s*[:=]\s*(\d[\d,]*(?:\.\d+)?)\s*tokens?/i,
    inputGroup: 1,
    outputGroup: 2,
    description: 'Format: "Input: X tokens, Output: Y tokens"',
    source: 'Common AI CLI format',
  },
  
  // Pattern 3: "Prompt: 1234, Completion: 567" (Anthropic format)
  {
    name: 'prompt-completion',
    regex: /prompt\s*[:=]\s*(\d[\d,]*(?:\.\d+)?)\s*[,;]\s*completion\s*[:=]\s*(\d[\d,]*(?:\.\d+)?)\s*[,;]/i,
    inputGroup: 1,
    outputGroup: 2,
    description: 'Format: "Prompt: X, Completion: Y, ..."',
    source: 'Anthropic API format',
  },
  
  // Pattern 4: "1234 input tokens, 567 output tokens"
  {
    name: 'numeric-tokens',
    regex: /(\d[\d,]*(?:\.\d+)?)\s*input\s*tokens?\s*[,;\s]+(?:and\s+)?(\d[\d,]*(?:\.\d+)?)\s*output\s*tokens?/i,
    inputGroup: 1,
    outputGroup: 2,
    description: 'Format: "X input tokens, Y output tokens"',
    source: 'Common AI CLI format',
  },
  
  // Pattern 5: "Usage: prompt_tokens=1234, completion_tokens=567"
  {
    name: 'usage-equals',
    regex: /usage\s*[:=]\s*prompt[_\s]tokens?\s*[:=]\s*(\d[\d,]*(?:\.\d+)?)\s*[,;\s]+completion[_\s]tokens?\s*[:=]\s*(\d[\d,]*(?:\.\d+)?)\s*[,;\s]*/i,
    inputGroup: 1,
    outputGroup: 2,
    description: 'Format: "Usage: prompt_tokens=X, completion_tokens=Y"',
    source: 'OpenAI/Anthropic API format',
  },
  
  // Pattern 6: "Total tokens: 1234 (in: 1234, out: 567)"
  {
    name: 'total-with-breakdown',
    regex: /total\s*tokens?\s*[:=]\s*\d[\d,]*(?:\.\d+)?\s*\(\s*in(?:put)?\s*[:=]\s*(\d[\d,]*(?:\.\d+)?)\s*[,;]\s*out(?:put)?\s*[:=]\s*(\d[\d,]*(?:\.\d+)?)\s*\)/i,
    inputGroup: 1,
    outputGroup: 2,
    description: 'Format: "Total tokens: X (in: Y, out: Z)"',
    source: 'Claude Code style',
  },
  
  // Pattern 7: "Cost: $0.0012 (1234 tokens)"
  // This is a fallback for when only total tokens are available
  {
    name: 'cost-with-tokens',
    regex: /cost\s*[:=]\s*\$[\d.]+\s*\(\s*(\d[\d,]*(?:\.\d+)?)\s*tokens?\s*\)/i,
    inputGroup: 1,
    outputGroup: null, // No output group, will use 0
    description: 'Format: "Cost: $X.XX (Y tokens)" - total tokens only',
    source: 'Various AI CLI tools',
  },
  
  // Pattern 8: JSON-like format in output (for structured output)
  {
    name: 'json-usage',
    regex: /["']?usage["']?\s*[:=]\s*\{[^}]*["']?prompt[_\s]tokens["']?\s*[:=]\s*(\d[\d,]*(?:\.\d+)?)\s*[,}][^}]*["']?completion[_\s]tokens["']?\s*[:=]\s*(\d[\d,]*(?:\.\d+)?)\s*[,}]/i,
    inputGroup: 1,
    outputGroup: 2,
    description: 'JSON-like format: "usage": {"prompt_tokens": X, "completion_tokens": Y}',
    source: 'Structured API responses',
  },
];

/**
 * Parse a text chunk for token usage information
 * @param {string} text - The text chunk to parse
 * @returns {Object|null} - { tokensInput, tokensOutput } or null if no match
 */
function parseTokenUsage(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }
  
  // Try each pattern until we find a match
  for (const pattern of TOKEN_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      // Extract and clean the token counts
      const inputStr = match[pattern.inputGroup].replace(/,/g, '');
      const input = parseInt(inputStr, 10);
      
      let output = 0;
      if (pattern.outputGroup !== null && match[pattern.outputGroup]) {
        const outputStr = match[pattern.outputGroup].replace(/,/g, '');
        output = parseInt(outputStr, 10);
      }
      
      // Validate the numbers
      if (!isNaN(input) && !isNaN(output) && input >= 0 && output >= 0) {
        return {
          tokensInput: input,
          tokensOutput: output,
          patternName: pattern.name,
          description: pattern.description,
        };
      }
    }
  }
  
  return null;
}

/**
 * Process a PTY output chunk and record token usage if found
 * @param {string} data - The PTY output chunk
 * @param {Object} context - Context information
 * @param {string} context.taskId - The task ID
 * @param {string|null} context.projectGroupId - The project group ID
 * @returns {Object|null} - The recorded usage or null
 */
function processChunk(data, { taskId, projectGroupId }) {
  const usage = parseTokenUsage(data);
  
  if (usage) {
    // Record to database
    const record = tokenUsageRepo.record({
      projectGroupId,
      taskId,
      tokensInput: usage.tokensInput,
      tokensOutput: usage.tokensOutput,
    });
    
    // Broadcast to dashboard
    wsServer.broadcast('board', {
      type: 'token_usage_updated',
      data: {
        taskId,
        projectGroupId,
        tokensInput: usage.tokensInput,
        tokensOutput: usage.tokensOutput,
        patternName: usage.patternName,
      },
    });
    
    return record;
  }
  
  return null;
}

/**
 * Get all available patterns (for debugging/testing)
 * @returns {Object[]} - List of pattern info
 */
function getPatterns() {
  return TOKEN_PATTERNS.map(p => ({
    name: p.name,
    description: p.description,
    source: p.source,
    regex: p.regex.toString(),
  }));
}

module.exports = {
  parseTokenUsage,
  processChunk,
  getPatterns,
  TOKEN_PATTERNS,
};
