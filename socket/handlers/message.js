import Message from "../../models/Message.js";
import User from "../../models/User.js";
import onlineUsers from "../onlineUsers.js";
import { updateLastMessage } from "../../utility/updateLastMessage.js";
import { validateMarkRead, validateMessageReceived, validateSendMessage } from "../validators/messageValidation.js";
import { sendPushNotification } from "../../services/sendPushNotification.js";

export default function registerMessageHandlers(io, socket) {

    // Typing (with safety timeout)
  const typingTimeouts = new Map();

  socket.on("send-message", async (data, callback) => {
    console.log("Send message event is hit:", data);

    try {

      const error = validateSendMessage(data);
      if (error) {
        return callback({ status: false, error });
      }

      const msg = new Message({
        sender: data.sender,
        receiver: data.receiver,
        text: data.text,
        timestamp: Date.now(),
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

      const recvSocketId = onlineUsers.get(data.receiver);

      if (recvSocketId) io.to(recvSocketId).emit("receive-message", msg);
    
    
     // Find the sender's username for the notification title.
    // This assumes your User model uses the field "username".
    const senderUser = await User.findById(data.sender)
      .select("username")
      .lean();

    // Send the push notification to the receiver's registered Android devices.
    // Keep notification failures separate from message delivery.
    try {
      await sendPushNotification({
        recipientId: data.receiver,
        senderName: senderUser?.username || "New message",
        messageText:
          data.type === "text"
            ? data.text
            : `Sent you a ${data.type || "message"}`,
        senderId: String(data.sender),
      });
    } catch (pushError) {
      console.error("Push notification failed:", pushError);
    }
  
    
   } catch (err) {
      console.error("Send message error:", err);
      callback({ status: false, error: "Internal server error" });
    }

  });

  socket.on("typing", ({ from, to, isTyping }) => {
    // ⬅️ typing logic unchanged
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

  socket.on("message-received", async ({ payload }) => {
    console.log("message-received runing")
     try {
          const error = validateMessageReceived(payload);
      if (error) return;

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

  socket.on("mark-read", async (data) => {
    
 const error = validateMarkRead(data);
    if (error) return;

    const { sender, receiver, messageIds } = data;
    setTimeout(async () => {     
          try {
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
}
