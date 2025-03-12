const WebSocket = require('ws');

// Create a WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// Track connected users
let users = new Map(); // Stores WebSocket connections with user IDs
let totalUsers = 0; // Total connected users

// Function to broadcast a message to all connected clients
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Handle new connections
wss.on('connection', (ws) => {
  // Generate a unique user ID (for simplicity, use a timestamp)
  const userId = Date.now().toString();
  users.set(ws, userId); // Store the user ID
  totalUsers++; // Increment total user count

  // Send a welcome message to the new user
  ws.send(JSON.stringify({
    type: 'welcome',
    message: `Welcome, User ${userId}!`,
    userId,
    totalUsers,
  }));

  // Broadcast to all users that a new user has connected
  broadcast({
    type: 'userConnected',
    message: `User ${userId} has connected.`,
    userId,
    totalUsers,
  });

  console.log(`User ${userId} connected. Total users: ${totalUsers}`);

  // Handle user disconnection
  ws.on('close', () => {
    const disconnectedUserId = users.get(ws);
    users.delete(ws); // Remove the user from the map
    totalUsers--; // Decrement total user count

    // Broadcast to all users that a user has disconnected
    broadcast({
      type: 'userDisconnected',
      message: `User ${disconnectedUserId} has disconnected.`,
      userId: disconnectedUserId,
      totalUsers,
    });

    console.log(`User ${disconnectedUserId} disconnected. Total users: ${totalUsers}`);
  });
});

console.log('WebSocket server is running on ws://localhost:8080');