import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema({
  user: { type: String, required: true }, // username of reactor
  emoji: { type: String, required: true }, // e.g. "❤️", "😂", "👍"
  reactedAt: { type: Date, default: Date.now },
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  url: { type: String, required: true },
  type: { type: String, enum: ["image", "video", "file", "audio"], default: "file" },
  name: { type: String },
  size: { type: Number }, // in bytes
});

const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },   // username
  receiver: { type: String, required: true }, // username
  text: { type: String },
  timestamp: { type: Date, default: Date.now },

  // Message status: sent, delivered, read
  status: { 
    type: String, 
    enum: ["sent", "delivered", "read"],
    default: "sent",
  },

  // ✅ Delete support
  deletedFor: { type: [String], default: [] }, // users who deleted the message (only hidden for them)
  isDeletedForEveryone: { type: Boolean, default: false },

  // ✏️ Edit support
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },

  // 💬 Reply support
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },

  // 😍 Emoji reactions
  reactions: { type: [reactionSchema], default: [] },

  // 📎 Attachment support
  attachments: { type: [attachmentSchema], default: [] },

  // 📱 Forwarded messages
  isForwarded: { type: Boolean, default: false },

  // 👀 Group "seen by" tracking (optional)
  seenBy: { type: [String], default: [] },

  // 🔤 Message type (text, image, etc.)
  type: { type: String, default: "text" },
});

export default mongoose.model("Message", messageSchema);
