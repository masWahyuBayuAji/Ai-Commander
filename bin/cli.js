#!/usr/bin/env node

const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SERVER_INFO_PATH = path.join(os.homedir(), '.ai-commander', 'server.json');

function printUsage() {
  console.error('Usage: ai-commander-cli update <project_group_uuid|-> <task_uuid> <target_kanban_group_uuid>');
}

function readServerInfo() {
  if (!fs.existsSync(SERVER_INFO_PATH)) {
    return null;
  }
  try {
    const data = fs.readFileSync(SERVER_INFO_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function connectToSocket(socketPath, message) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);

    let responseBuffer = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        reject(new Error('Timeout: server did not respond within 5 seconds'));
      }
    }, 5000);

    client.on('connect', () => {
      client.write(JSON.stringify(message) + '\n');
    });

    client.on('data', (data) => {
      responseBuffer += data.toString();
      const newlineIndex = responseBuffer.indexOf('\n');
      if (newlineIndex !== -1 && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        const response = responseBuffer.slice(0, newlineIndex).trim();
        client.end();
        try {
          resolve(JSON.parse(response));
        } catch {
          reject(new Error(`Invalid JSON response: ${response}`));
        }
      }
    });

    client.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    client.on('end', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error('Connection closed before receiving response'));
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args[0] !== 'update') {
    printUsage();
    process.exit(1);
  }

  const [_, projectGroupArg, taskId, targetKanbanGroupId] = args;

  if (!taskId || !targetKanbanGroupId) {
    printUsage();
    process.exit(1);
  }

  const serverInfo = readServerInfo();
  if (!serverInfo) {
    console.error('Error: Cannot read server info. Is the ai-commander server running?');
    console.error(`Expected file: ${SERVER_INFO_PATH}`);
    process.exit(1);
  }

  const projectGroupId = projectGroupArg === '-' ? null : projectGroupArg;

  const message = {
    type: 'transition',
    projectGroupId,
    taskId,
    targetKanbanGroupId,
  };

  try {
    const response = await connectToSocket(serverInfo.socketPath, message);
    if (response.ok) {
      console.log(JSON.stringify(response));
      process.exit(0);
    } else {
      console.error(JSON.stringify(response));
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
