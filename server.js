import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import messageRoutes from "./routes/messageRoutes.js";
import connectionRoutes from "./routes/connectionRoutes.js";
import User from "./models/User.js";
import Message from "./models/Message.js";
import connectDB from "./config/db.js";
import { updateLastMessage } from "./utility/updateLastMessage.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http:// localhost:5173",
    methods: ["GET", "POST"],
    // credentials: true,
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/connections", connectionRoutes);


// DB connect
connectDB();

// ---- Socket auth helper ----
import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET;

// Map username -> socketId (for simple online tracking; single socket per user assumed)
const onlineUsers = new Map();
console.log("test")
io.use((socket, next) => {
  // Expect token in query: socket = io(url, { auth: { token } }) on client
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication error: No token"));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.username = payload.username;
    socket.userId = payload.id;
    return next();
  } catch (err) {
    return next(new Error("Authentication error"));
  }
});

io.on("connection", async (socket) => {
  // let timestamp = new Date();
  const username = socket.username;
  console.log(`Socket connected: ${username} (${socket.id})`);
  onlineUsers.set(username, socket.id);
  await User.findOneAndUpdate({ username }, { $set: { "onlineStatus.online": true, "onlineStatus.lastSeen": null } });

  io.emit("online-status", {
    username,
    online: true,
    lastSeen: null,
    onlineUserss: Array.from(onlineUsers.keys())
  });

  // Send message
  socket.on("send-message", async (data, callback) => {
    console.log("Send message event is hit:", data);
    try {
      const msg = new Message({
        sender: data.sender,
        receiver: data.receiver,
        text: data.text,
        timestamp: Date.now(),
        // read: false,
        status: "sent",                      // default status
        // optional fields with defaults
        deletedFor: [],                      // no one deleted yet
        isDeletedForEveryone: false,
        isEdited: false,
        editedAt: null,
        replyTo: data.replyTo || null,       // if message is a reply
        reactions: [],                       // no emoji reactions yet
        attachments: data.attachments || [], // e.g. uploaded files/images
        isForwarded: data.isForwarded || false,
        seenBy: [],                          // no one seen yet
        type: data.type || "text",           // "text", "image", "file", etc.
      });
      await msg.save();
      // console.log("Message sent:", msg);
      await updateLastMessage(data.sender, data.receiver, data.text);
      callback({ status: true, data: msg });
      // io.to(socket.id).emit("receive-message", msg);

      const recvSocketId = onlineUsers.get(data.receiver);

      if (recvSocketId) io.to(recvSocketId).emit("receive-message", msg);
    } catch (err) {
      console.error("Send message error:", err);
    }
  });

  // Typing (with safety timeout)
  let typingTimeouts = {};
  socket.on("typing", (data) => {
    const recvSocketId = onlineUsers.get(data.to);
    if (!recvSocketId) return;
    io.to(recvSocketId).emit("typing", { from: data.from, isTyping: data.isTyping });

    if (data.isTyping) {
      clearTimeout(typingTimeouts[data.from]);
      typingTimeouts[data.from] = setTimeout(() => {
        io.to(recvSocketId).emit("typing", { from: data.from, isTyping: false });
      }, 3000);
    }
  });
  //emi delivered
  socket.on("message-received", async ({ sender, receiver }) => {
    console.log(`Message of user ${sender} has delivered from server to ${receiver}`);
    setTimeout(async () => {
      try {
        await Message.updateMany({ sender, receiver, status: "sent" }, { $set: { status: "delivered" } });
        const senderSocketId = onlineUsers.get(sender);
        const receiverSocketId = onlineUsers.get(receiver);
        if (senderSocketId) io.to(senderSocketId).emit("messages-delivered", { sender, receiver });
        // if (receiverSocketId) io.to(receiverSocketId).emit("messages-read", { sender, receiver });
      } catch (err) {
        console.error("Error marking read:", err);
      }
    }, 200);
  });

  // Mark-read (notify both)
  socket.on("mark-read", async ({ sender, receiver }) => {
    console.log(`Mark read from ${sender} to ${receiver}`);
    setTimeout(async () => {
      try {
        // 1️⃣ Update message statuses
        await Message.updateMany(
          { sender, receiver, status: { $in: ["sent", "delivered"] } },
          { $set: { status: "read" } }
        );

        // 2️⃣ Reset unread count for receiver in their connections
        await User.updateOne(
          { username: receiver, "connections.username": sender },
          
          { $set: { "connections.$.unread": 0 } }
        );

        // 3️⃣ Emit socket updates to both users
        const senderSocketId = onlineUsers.get(sender);
        const receiverSocketId = onlineUsers.get(receiver);
        if (senderSocketId) io.to(senderSocketId).emit("messages-read", { sender, receiver });
        if (receiverSocketId) io.to(receiverSocketId).emit("messages-read", { sender, receiver });
      } catch (err) {
        console.error("Error marking read:", err);
      }
    }, 200);
  });

  socket.on("disconnect", async () => {
    let timestamp = new Date();
    console.log(`Socket disconnected: ${username} (${socket.id})`);

    // remove from online users map
    onlineUsers.delete(username);

    // ✅ update nested onlineStatus fields
    await User.findOneAndUpdate({ username },
      { $set: { "onlineStatus.online": false, "onlineStatus.lastSeen": timestamp } });

    // ✅ emit updated info to all connected clients
    io.emit("online-status", {
      username,
      online: false,
      lastSeen: timestamp,
      onlineUserss: Array.from(onlineUsers.keys())
    });
  });
});


// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
