import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

import registerConnectionHandlers from "./handlers/connection.js";
import registerMessageHandlers from "./handlers/message.js";
import registerReactionHandlers from "./handlers/reaction.js";
import registerEditHandlers from "./handlers/edit.js";
import registerDeleteHandlers from "./handlers/delete.js";

export default function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  const JWT_SECRET = process.env.JWT_SECRET;

  // 🔐 Socket Auth Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token"));

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).lean();

      if (!user) return next(new Error("User not found"));

      socket.userId = user._id.toString();
      socket.username = user.username;

      next();
    } catch (err) {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", async (socket) => {
    // 🔥 register all handlers
    registerConnectionHandlers(io, socket);
    registerMessageHandlers(io, socket);
    registerReactionHandlers(io, socket);
    registerEditHandlers(io, socket);
    registerDeleteHandlers(io, socket);
  });

  return io;
}
