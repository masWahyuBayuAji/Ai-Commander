const { WebSocketServer } = require('ws');

let wss = null;
const channelSubscribers = new Map();

function attachToServer(server) {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    ws._subscribedChannels = new Set();

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      if (msg.subscribe) {
        const channel = msg.subscribe;
        ws._subscribedChannels.add(channel);
        if (!channelSubscribers.has(channel)) {
          channelSubscribers.set(channel, new Set());
        }
        channelSubscribers.get(channel).add(ws);
      }

      if (msg.unsubscribe) {
        const channel = msg.unsubscribe;
        ws._subscribedChannels.delete(channel);
        const subs = channelSubscribers.get(channel);
        if (subs) subs.delete(ws);
      }
    });

    ws.on('close', () => {
      for (const channel of ws._subscribedChannels) {
        const subs = channelSubscribers.get(channel);
        if (subs) subs.delete(ws);
      }
    });

    ws.on('error', () => {
      for (const channel of ws._subscribedChannels) {
        const subs = channelSubscribers.get(channel);
        if (subs) subs.delete(ws);
      }
    });
  });
}

function broadcast(channel, payload) {
  const subs = channelSubscribers.get(channel);
  if (!subs) return;

  const message = JSON.stringify({ channel, data: payload });
  for (const ws of subs) {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  }
}

module.exports = { attachToServer, broadcast };
