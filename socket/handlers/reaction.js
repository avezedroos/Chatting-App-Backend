import Message from "../../models/Message.js";


export default function registerReactionHandlers(io, socket) {
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
}

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


