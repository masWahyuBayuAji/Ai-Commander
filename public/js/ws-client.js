(function() {
  const connections = {};
  let reconnectTimers = {};

  function connectChannel(channelName, onMessage) {
    if (connections[channelName]) {
      return connections[channelName];
    }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;

    function createConnection() {
      const ws = new WebSocket(wsUrl);

      ws.onopen = function() {
        console.log(`[ws] Connected to channel: ${channelName}`);
        ws.send(JSON.stringify({ subscribe: channelName }));
      };

      ws.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          if (onMessage) {
            onMessage(data);
          }
        } catch (e) {
          console.error('[ws] Failed to parse message:', e);
        }
      };

      ws.onclose = function() {
        console.log(`[ws] Connection closed for channel: ${channelName}`);
        delete connections[channelName];
        scheduleReconnect(channelName, onMessage);
      };

      ws.onerror = function(err) {
        console.error(`[ws] Error on channel ${channelName}:`, err);
      };

      return ws;
    }

    connections[channelName] = createConnection();
    return connections[channelName];
  }

  function scheduleReconnect(channelName, onMessage) {
    if (reconnectTimers[channelName]) {
      return;
    }
    reconnectTimers[channelName] = setTimeout(function() {
      delete reconnectTimers[channelName];
      console.log(`[ws] Reconnecting to channel: ${channelName}`);
      connectChannel(channelName, onMessage);
    }, 3000);
  }

  function disconnect(channelName) {
    if (reconnectTimers[channelName]) {
      clearTimeout(reconnectTimers[channelName]);
      delete reconnectTimers[channelName];
    }
    if (connections[channelName]) {
      connections[channelName].close();
      delete connections[channelName];
    }
  }

  function disconnectAll() {
    Object.keys(reconnectTimers).forEach(function(ch) {
      clearTimeout(reconnectTimers[ch]);
    });
    reconnectTimers = {};
    Object.keys(connections).forEach(function(ch) {
      connections[ch].close();
    });
    connections = {};
  }

  window.WsClient = {
    connect: connectChannel,
    disconnect: disconnect,
    disconnectAll: disconnectAll
  };
})();
