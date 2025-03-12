const { parse } = require("path");
const WebSocket = require("ws");

// Create a WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// Track connected users
let users = new Map();
// map (spaceId, map(ws, user))
// user: {userId, userDetails: null}

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

  let totalUsersSpace = 1;
  let user = {
    userId: Date.now().toString(),
    userDetails: null,
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
    //user connected
    try {
      const parsedMessage = JSON.parse(data.toString());
      if (parsedMessage.type === "register") {
        handleRegister(ws, spaceId, parsedMessage);
      } else if (parsedMessage.type === "event") {
        broadcast(parsedMessage);
      }
    } catch (error) {
      console.log("Invalid message", error);
    }
  });

  // Handle user disconnection
  ws.on("close", () => {
    const disconnectedUserId = users.get(spaceId).get(ws).userId;
    users.get(spaceId).delete(ws);

    // Broadcast to all users that a user has disconnected
    broadcast({
      type: "userDisconnected",
      userId: disconnectedUserId,
      totalUsers: users.get(spaceId).size,
    });
  });
});

function handleRegister(ws, spaceId, parsedMessage) {
  const user = users.get(spaceId).get(ws);
  user.userDetails = {
    name: parsedMessage.name,
    avatar: parsedMessage.avatar,
  };

  broadcast({
    type: "register",
    user,
  });
}

console.log("WebSocket server is running on ws://localhost:8080");
