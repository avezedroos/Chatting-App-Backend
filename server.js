import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import messageRoutes from "./routes/messageRoutes.js";
import User from "./models/User.js";
import Message from "./models/Message.js";
import connectDB from "./config/db.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  }
});

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

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
  const username = socket.username;
  console.log(`Socket connected: ${username} (${socket.id})`);
  onlineUsers.set(username, socket.id);
  await User.findOneAndUpdate({ username }, { online: true });

  io.emit("online-status", { username, online: true, onlineUserss: Array.from(onlineUsers.keys()) });

  // Send message
  socket.on("send-message", async (data) => {
    try {
      const msg = new Message({
        sender: data.sender,
        receiver: data.receiver,
        text: data.text,
        timestamp: Date.now(),
        read: false,
      });
      await msg.save();

      io.to(socket.id).emit("receive-message", msg);
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

  // Mark-read (notify both)
  socket.on("mark-read", async ({ sender, receiver }) => {
    console.log(`Mark read from ${sender} to ${receiver}`);
    setTimeout(async () => {
      try {
        await Message.updateMany({ sender, receiver, read: false }, { $set: { read: true } });
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
    console.log(`Socket disconnected: ${username} (${socket.id})`);
    onlineUsers.delete(username);
    await User.findOneAndUpdate({ username }, { online: false });
    io.emit("online-status", { username, online: false, onlineUserss: Array.from(onlineUsers.keys()) });
  });
});


// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
