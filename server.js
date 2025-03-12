const { parse } = require("path");
const WebSocket = require("ws");

// Constants for TTL
const TTL_HOURS = 6;
const TTL_MS = TTL_HOURS * 60 * 60 * 1000; // 6 hours in milliseconds
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes

// Create a WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// Track connected users and space activity
let users = new Map();
let spaceLastActivity = new Map(); // Tracks last activity time for each space

// Function to update space activity
function updateSpaceActivity(spaceId) {
  spaceLastActivity.set(spaceId, Date.now());
}

// Function to clean up inactive spaces
function cleanupInactiveSpaces() {
  const now = Date.now();
  for (const [spaceId, lastActivity] of spaceLastActivity.entries()) {
    if (now - lastActivity > TTL_MS) {
      const space = users.get(spaceId);
      if (space) {
        // Disconnect all users in the space
        for (const [ws] of space.entries()) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Space expired due to inactivity",
              })
            );
            ws.close();
          }
        }
        // Clean up the space
        users.delete(spaceId);
        spaceLastActivity.delete(spaceId);
        console.log(`Space ${spaceId} cleaned up due to inactivity`);
      }
    }
  }
}

// Start cleanup interval
setInterval(cleanupInactiveSpaces, CLEANUP_INTERVAL_MS);

// Function to broadcast a message to all connected clients
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Handle new connections
wss.on("connection", (ws, req) => {
  const params = new URL(req.url || "", `http://${req.headers.host}`)
    .searchParams;
  const spaceId = params.get("spaceId");

  if (!spaceId) {
    ws.send(JSON.stringify({ type: "error", message: "Space ID is required" }));
    ws.close();
    return;
  }

  // Update space activity on connection
  updateSpaceActivity(spaceId);

  let totalUsersSpace = 1;
  let user = {
    userId: Date.now().toString(),
    userDetails: null,
    lastActive: Date.now(),
  };

  if (users.has(spaceId)) {
    const space = users.get(spaceId);
    space.set(ws, user);
    totalUsersSpace = space.size;
  } else {
    users.set(spaceId, new Map([[ws, user]]));
  }

  // Broadcast to all users that a new user has connected
  broadcast({
    type: "userConnected",
    userId: user.userId,
    totalUsers: totalUsersSpace,
  });

  ws.send(JSON.stringify({ users: Array.from(users.get(spaceId).values()) }));

  // Handle incoming messages from this client
  ws.on("message", (data) => {
    // Update space activity on any message
    try {
      const parsedMessage = JSON.parse(data.toString());
      if (parsedMessage.type === "register") {
        handleRegister(ws, spaceId, parsedMessage);
      } else if (parsedMessage.type === "event") {
        updateSpaceActivity(spaceId);
        broadcast(parsedMessage);
      } else if (parsedMessage.type === "ping") {
        // Handle keepalive pings
        ws.send(
          JSON.stringify({
            type: "pong",
            serverTime: Date.now(),
            ttlRemaining:
              TTL_MS - (Date.now() - spaceLastActivity.get(spaceId)),
          })
        );
      }
    } catch (error) {
      console.log("Invalid message", error);
    }
  });

  // Handle user disconnection
  ws.on("close", () => {
    const space = users.get(spaceId);
    if (space) {
      const disconnectedUserId = space.get(ws)?.userId;
      space.delete(ws);

      // If space is empty, mark it for cleanup but don't delete immediately
      if (space.size === 0) {
        console.log(
          `Space ${spaceId} is empty, will be cleaned up after ${TTL_HOURS} hours of inactivity`
        );
      }

      // Broadcast to all users that a user has disconnected
      broadcast({
        type: "userDisconnected",
        userId: disconnectedUserId,
        totalUsers: space.size,
      });
    }
  });
});

function handleRegister(ws, spaceId, parsedMessage) {
  const space = users.get(spaceId);
  if (!space) return;

  const user = space.get(ws);
  if (!user) return;

  user.userDetails = {
    name: parsedMessage.name,
    avatar: parsedMessage.avatar,
  };
  user.lastActive = Date.now();

  // Update space activity on registration
  updateSpaceActivity(spaceId);

  broadcast({
    type: "register",
    user,
  });
}

console.log("WebSocket server is running on ws://localhost:8080");
