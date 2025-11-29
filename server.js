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
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
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
import { getConnectionUsernames } from "./utility/getConnectionList.js";
const JWT_SECRET = process.env.JWT_SECRET;

// Map username -> socketId (for simple online tracking; single socket per user assumed)
const onlineUsers = new Map();

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication error: No token"));
    }

    // Decode only userId from token
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    // Fetch user details from DB
    const user = await User.findById(userId).lean();
    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    // Attach info to socket
    socket.userId = user._id.toString();
    socket.username = user.username;

    next();
  } catch (err) {
    console.error("Socket auth error:", err);
    next(new Error("Authentication error"));
  }
});


io.on("connection", async (socket) => {
  const username = socket.username;
  socket.data.connectionlist = await getConnectionUsernames(username, onlineUsers)
  const connectionlist = socket.data.connectionlist
  console.log(`Socket connected: ${username} (${socket.id})`);
  socket.join(username);
  onlineUsers.set(username, socket.id);
  // console.log(onlineUsers)
  await User.findOneAndUpdate({ username }, { $set: { "onlineStatus.online": true, "onlineStatus.lastSeen": null } });
  //  connectionlist = await getConnectionUsernames(username,onlineUsers)

  try {
    console.log("connectionlist", connectionlist)
    if (connectionlist.length > 0) {
      io.to(connectionlist).emit("user-online", {
        payload: username
      });
    }
    io.to(username).emit("user-online", {
      payload: connectionlist
    })


  } catch (error) {
    console.log(error)
  }


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

      // ✅ POPULATE replyTo BEFORE sending to frontend
      await msg.populate({
        path: "replyTo",
        select: "_id text sender",
      });

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
 const typingTimeouts = new Map();

socket.on("typing", ({ from, to, isTyping }) => {
// console.log("typing is running")
  const receiverSocketId = onlineUsers.get(to);
  if (!receiverSocketId) return;

  const key = `${from}-${to}`;

  io.to(receiverSocketId).emit("typing", { from, isTyping });

  if (isTyping) {
    // Clear existing timeout for this conversation
    if (typingTimeouts.has(key)) {
      clearTimeout(typingTimeouts.get(key));
    }

    const timeout = setTimeout(() => {
      io.to(receiverSocketId).emit("typing", { from, isTyping: false });
      typingTimeouts.delete(key);
    }, 3000);

    typingTimeouts.set(key, timeout);
  }
});


  //emi delivered
  socket.on("message-received", async ({ payload }) => {
    console.log("message-received")
    try {
      if (!Array.isArray(payload) || payload.length === 0) return;

      // 1️⃣ Group messages by sender
      const groups = {};
      payload.forEach(item => {
        const sender = item.Sender;
        if (!groups[sender]) groups[sender] = [];
        groups[sender].push(item.messageId);
      });

      // 2️⃣ Update all messages in DB
      const allMessageIds = payload.map(p => p.messageId);

      await Message.updateMany(
        {
          _id: { $in: allMessageIds },
          status: "sent"
        },
        {
          $set: { status: "delivered" }
        }
      );

      // 3️⃣ Get receiver (event trigger user)
      const receiver = socket.username;

      // 4️⃣ Notify each sender with only their messages
      for (const sender in groups) {
        const senderSocketId = onlineUsers.get(sender);

        if (senderSocketId) {
          io.to(senderSocketId).emit("messages-delivered", {
            receiver,
            messageIds: groups[sender],
          });
        }
      }

      console.log(
        `Delivered messages grouped by sender: `,
        groups
      );

    } catch (err) {
      console.error("Error marking delivered:", err);
    }
  });


  // Mark-read (notify both)
  socket.on("mark-read", async ({ sender, receiver, messageIds }) => {
    console.log(`Mark read from ${sender} to ${receiver}`);
    setTimeout(async () => {
      try {
        // 1️⃣ Update message statuses
        // await Message.updateMany(
        //   { sender, receiver, status: { $in: ["sent", "delivered"] } },
        //   { $set: { status: "read" } }
        // );

        await Message.updateMany(
          {
            _id: { $in: messageIds },
            status: { $in: ["sent", "delivered"] }
          },
          {
            $set: { status: "read" }
          }
        );

        // 2️⃣ Reset unread count for receiver in their connections
        await User.updateOne(
          { username: receiver, "connections.username": sender },

          { $set: { "connections.$.unread": 0 } }
        );

        // 3️⃣ Emit socket updates to both users
        const senderSocketId = onlineUsers.get(sender);
        // const receiverSocketId = onlineUsers.get(receiver);
        if (senderSocketId) io.to(senderSocketId).emit("messages-read", { receiver, messageIds });
        // if (receiverSocketId) io.to(receiverSocketId).emit("messages-read", { sender, receiver });
      } catch (err) {
        console.error("Error marking read:", err);
      }
    }, 200);
  });

  // ---------------------------------------------
  // PRO LEVEL: Update Reaction (add / update / remove)
  // ---------------------------------------------
  socket.on("update-reaction", async (data) => {
    try {
      console.log("⚡ Reaction event received:", data);

      let { messageId, user, emoji ,otherUser } = data;

      // ----------- Validate payload ----------
      if (!messageId || !user) {
        console.warn("❌ Invalid reaction payload:", data);
        return;
      }

      // Prevent multiple emojis in one payload
      if (emoji && typeof emoji === "string" && [...emoji].length > 2) {
        console.warn("❌ Multiple emojis not allowed");
        return;
      }

      // Fetch the message
      const msg = await Message.findById(messageId);
      if (!msg) {
        console.warn("❌ Message not found:", messageId);
        return;
      }

      // Check if user already reacted
      const prevReaction = msg.reactions.find((r) => r.user === user);

      // ===================================================
      //  RULE 2 — REMOVE reaction (null OR same emoji)
      // ===================================================
      if (!emoji || (prevReaction && prevReaction.emoji === emoji)) {
        const updatedMsg = await Message.findByIdAndUpdate(
          messageId,
          { $pull: { reactions: { user } } },
          { new: true }
        );
        emitReactionToUsers(updatedMsg,otherUser,user);
        console.log("🗑 Reaction removed");
        return;
      }

      let updatedMsg;

      // ===================================================
      //  RULE 4 — Update existing emoji (different emoji)
      // ===================================================
      if (prevReaction) {
        updatedMsg = await Message.findOneAndUpdate(
          { _id: messageId, "reactions.user": user },
          { $set: { "reactions.$.emoji": emoji } },
          { new: true }
        );
        emitReactionToUsers(updatedMsg,otherUser,user);
        console.log("🔄 Reaction updated");
        return;
      }

      // ===================================================
      //  RULE 5 — Add new reaction
      // ===================================================
      updatedMsg = await Message.findByIdAndUpdate(
        messageId,
        { $push: { reactions: { user, emoji } } },
        { new: true }
      );

      emitReactionToUsers(updatedMsg,otherUser,user);
      console.log("✨ Reaction added");

    } catch (err) {
      console.error("🔥 Reaction update error:", err);
    }
  });

  // ----------------------------------------------------
  // 📡 Helper: Emit updated reaction to the sender & receiver
  // ----------------------------------------------------
  function emitReactionToUsers(msg , otherUser,user) {
    // const senderSocket = onlineUsers.get(otherUser);
    const receiverSocket = onlineUsers.get(otherUser);
    // console.log("emitReactionToUsers is running ", receiverSocket,senderSocket)
    const payload = {
      messageId: msg._id,
      reactions: msg.reactions,
      sender: user,
      receiver: otherUser,
    };

    // if (senderSocket) io.to(senderSocket).emit("reaction-updated", payload);
    if (receiverSocket)
      io.to(receiverSocket).emit("reaction-updated", payload);
  }




  socket.on("disconnect", async () => {
    let timestamp = new Date();
    console.log(`Socket disconnected: ${username} (${socket.id})`);

    // remove from online users map
    onlineUsers.delete(username);

    // ✅ update nested onlineStatus fields
    await User.findOneAndUpdate({ username },
      { $set: { "onlineStatus.online": false, "onlineStatus.lastSeen": timestamp } });

    if (connectionlist.length > 0) {
      console.log("user-offline is emit and connectionlist is ", connectionlist)
      io.to(connectionlist).emit("user-offline", {

        payload: {
          username: username,
          lastSeen: timestamp,
        }
      });
    }

  });
});


// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
