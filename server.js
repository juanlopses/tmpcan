const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");
const path = require("path");
const config = require("./config");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const activeRooms = {};
const roomHostPing = {};

app.get("/status", (req, res) => {
  const key = req.query.key;
  if (key !== config.DASHBOARD_KEY) return res.status(403).send("No autorizado");

  const cpuLoad = os.loadavg();
  const memory = {
    total: os.totalmem(),
    free: os.freemem()
  };

  res.render("status", {
    rooms: Object.keys(activeRooms),
    cpu: cpuLoad,
    memory,
    hostPings: roomHostPing
  });
});

io.on("connection", (socket) => {
  let roomJoined = null;
  let lastPingTime;

  socket.on("create-room", ({ roomId }) => {
    if (activeRooms[roomId]) {
      socket.emit("room-exists");
      return;
    }
    roomJoined = roomId;
    activeRooms[roomId] = 1;
    roomHostPing[roomId] = null;
    socket.join(roomId);
    socket.emit("room-created", { roomId });
    io.to(roomId).emit("viewer-count", activeRooms[roomId]);
  });

  socket.on("join-room", ({ roomId }) => {
    if (!activeRooms[roomId]) {
      socket.emit("no-room");
      return;
    }
    roomJoined = roomId;
    activeRooms[roomId]++;
    socket.join(roomId);
    io.to(roomId).emit("viewer-count", activeRooms[roomId]);
  });

  socket.on("ping-host", () => {
    lastPingTime = Date.now();
    socket.emit("pong-host");
  });

  socket.on("pong-host", () => {
    if (!roomJoined) return;
    const now = Date.now();
    const ping = now - lastPingTime;
    roomHostPing[roomJoined] = ping;
    io.to(roomJoined).emit("update-host-ping", { ping });
  });

  socket.on("disconnect", () => {
    if (roomJoined && activeRooms[roomJoined]) {
      activeRooms[roomJoined]--;
      if (activeRooms[roomJoined] <= 0) {
        delete activeRooms[roomJoined];
        delete roomHostPing[roomJoined];
      } else {
        io.to(roomJoined).emit("viewer-count", activeRooms[roomJoined]);
      }
    }
  });
});

server.listen(config.PORT, () => {
  console.log(`Servidor activo en http://localhost:${config.PORT}`);
});
