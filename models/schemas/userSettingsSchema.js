
import mongoose from "mongoose";

const userSettingsSchema = new mongoose.Schema(
  {
    appearance: {
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "light",
      },
      fontSize: {
        type: String,
        enum: ["small", "medium", "large"],
        default: "medium",
      },
      language: {
        type: String,
        enum: ["en", "hi", "mr"],
        default: "en",
      },
      compactMode: {
        type: Boolean,
        default: false,
      },
    },

    preferences: {
      enterToSendMessage: {
        type: Boolean,
        default: true,
      },
      showTypingIndicator: {
        type: Boolean,
        default: true,
      },
      showReadReceipts: {
        type: Boolean,
        default: true,
      },
    },

    privacy: {
      lastSeenVisibility: {
        type: String,
        enum: ["everyone", "connections", "nobody"],
        default: "everyone",
      },
      profilePhotoVisibility: {
        type: String,
        enum: ["everyone", "connections", "nobody"],
        default: "everyone",
      },
      statusVisibility: {
        type: String,
        enum: ["everyone", "connections", "nobody"],
        default: "connections",
      },
      allowMessagesFrom: {
        type: String,
        enum: ["everyone", "connections", "nobody"],
        default: "everyone",
      },
      blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
    },

    connection: {
      pinnedConnections: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      archivedConnections: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      mutedConnections: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      clearChatOnLogout: {
        type: Boolean,
        default: false,
      },
    },

    system: {
      lastSyncedAt: {
        type: Date,
        default: null,
      },
      version: {
        type: Number,
        default: 1,
      },
    },
  },
  {
    _id: false,
  }
);

export default userSettingsSchema;
