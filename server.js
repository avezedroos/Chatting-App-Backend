import express from "express";
import http from "http";
import { Server } from "socket.io";
// import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import messageRoutes from "./routes/messageRoutes.js";
import connectionRoutes from "./routes/connectionRoutes.js";
import User from "./models/User.js";
import Message from "./models/Message.js";
import connectDB from "./config/db.js";
import { updateLastMessage } from "./utility/updateLastMessage.js";
// ---- Socket auth helper ----
import jwt from "jsonwebtoken";
import { getAcceptedConnectionUsernames, getConnectionUsernames } from "./utility/getConnectionList.js";
import { validateEditMessage } from "./validations/validateEditMessage.js";


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
app.use(express.urlencoded({ extended: true }));

// DB connect
connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/connections", connectionRoutes);


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
  socket.data.acceptedconnectionlist = await getAcceptedConnectionUsernames(username)
  let connectionlist = await getConnectionUsernames(socket.data.acceptedconnectionlist, onlineUsers)// this is array of usernames who is in user connection list (only accepted connections) + online at the time of creation of socket 
  console.log(`Socket connected: ${username} (${socket.id})`);
  socket.join(username);
  onlineUsers.set(username, socket.id);
  await User.findOneAndUpdate({ username }, { $set: { "onlineStatus.online": true, "onlineStatus.lastSeen": null } });
  
  try {
    // console.log("connectionlist", connectionlist)
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

      await updateLastMessage(data.sender, data.receiver, data.text,msg._id, false);
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

      let { messageId, user, emoji, otherUser } = data;

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
        emitReactionToUsers(updatedMsg, otherUser, user);
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
        emitReactionToUsers(updatedMsg, otherUser, user);
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

      emitReactionToUsers(updatedMsg, otherUser, user);
      console.log("✨ Reaction added");

    } catch (err) {
      console.error("🔥 Reaction update error:", err);
    }
  });

  // ----------------------------------------------------
  // 📡 Helper: Emit updated reaction to the sender & receiver
  // ----------------------------------------------------
  function emitReactionToUsers(msg, otherUser, user) {
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

  // ---------------------------------------------
  // ✏️ Edit Message
  // ---------------------------------------------

  socket.on("edit-Message", async ({ messageId, newText }) => {
    try {
      console.log("Edit message event received:", { messageId, newText });
      const msg = await Message.findById(messageId);
      // Run validation
      const check = validateEditMessage({
        msg,
        userId: socket.userId,
        newText,
        username: socket.username
      });

      if (!check.ok) {
        // return socket.emit("editError", check.error);
        console.log("Edit message validation failed:", check.error);
        //send ack with error (as a callback )
      }

      // Final re-fetch (optional but safe)
      const freshMsg = await Message.findById(messageId);
      if (!freshMsg || freshMsg.isDeletedForEveryone) {
        // return socket.emit("editError", "Message no longer available.");
        console.log("Edit message validation failed:", check.error);
        //send ack with error (as a callback )
      }

      // Save update
      freshMsg.text = newText;
      freshMsg.isEdited = true;
      await freshMsg.save();
      const payload = {
        username: freshMsg.sender,
        messageId: freshMsg._id,
        newText: freshMsg.text,
        isEdited: freshMsg.isEdited,
        editedAt: freshMsg.editedAt,
      };

       await updateLastMessage(freshMsg.sender, freshMsg.receiver, newText,freshMsg._id, true);
      io.to(msg.receiver).emit("messageUpdated", payload);

    } catch (error) {
      console.log(error);
      socket.emit("editError", "Internal error.");
    }
  }
  );

socket.on("deleteMessageForMeBulk", async ({ messageIds }) => {
  try {
    const username = socket.username;
    await Message.updateMany(
      { _id: { $in: messageIds } },
      { $addToSet: { deletedFor: username } }
    );
// i want build the validation for this event too but later

  } catch (err) {
    console.error("Bulk delete error:", err);
  }
});


socket.on("deleteMessageForEveryoneBulk", async ({ messageIds }) => {
  try {
    const currentTime = Date.now();
    const requestorName = socket.username; // sender
    const LIMIT_MINUTES = 90;
    const LIMIT_MS = LIMIT_MINUTES * 60 * 1000;

    // Fetch all messages at once
    const messages = await Message.find({ _id: { $in: messageIds } });
    if (!messages.length) return;

    const validIds = [];

    for (const msg of messages) {
      if (!msg) continue;

      // 1️⃣ Only allow sender to delete for everyone
      if (msg.sender !== requestorName) continue;

      // 2️⃣ Enforce 90 minute delete window
      const sentTime = msg.timestamp.getTime();
      if (Date.now() - sentTime > LIMIT_MS) continue;

      // 3️⃣ Skip already deleted messages
      if (msg.isDeletedForEveryone) continue;

      // 4️⃣ Optional tighter window for media
      if (["image", "video"].includes(msg.type)) {
        if (Date.now() - sentTime > 30 * 60 * 1000) continue; // 30 min
      }

      validIds.push(msg._id.toString());
    }

    if (!validIds.length) return;

    // 🔥 Update all valid messages in DB
    await Message.updateMany(
      { _id: { $in: validIds } },
      {
        text: "This message was deleted",
        attachments: [],
        reactions: [],
        isDeletedForEveryone: true,
        isEdited: false,
        editedAt: currentTime,
      }
    );

    // 🔥 Fetch updated messages (only receivers needed)
    const finalMessages = await Message.find({ _id: { $in: validIds } });

    // 🔥 Group messages by receiver
    const receiverGroups = {}; 
    for (const msg of finalMessages) {
      const receiver = msg.receiver;

      if (!receiverGroups[receiver]) receiverGroups[receiver] = [];
      receiverGroups[receiver].push(msg._id.toString());
    }

    // 🔥 Notify each receiver once with only their message IDs
    for (const receiver in receiverGroups) {
      await updateLastMessage(requestorName, receiver, "This message was deleted",receiverGroups[receiver], true );
      io.to(receiver).emit("messagesDeletedForEveryoneBulk", {
       
        messageIds: receiverGroups[receiver],  // only relevant ids
        sender: requestorName,
        timestamp: currentTime,
       
      });
    }

  } catch (err) {
    console.log("Delete for everyone error:", err);
  }
});





      



  socket.on("disconnect", async () => {
    let timestamp = new Date();
    console.log(`Socket disconnected: ${username} (${socket.id})`);

    // remove from online users map
    onlineUsers.delete(username);
    let connectionlist = await getConnectionUsernames(socket.data.acceptedconnectionlist, onlineUsers)// this is array of usernames who is in user connection list (only accepted connections) + online at the time of creation of socket

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
