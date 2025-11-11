import mongoose from "mongoose";

// import mongoose from "mongoose";

const connectionSchema = new mongoose.Schema(
  {
    // The other user's ObjectId
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    username: {
      type: String,
      required: true,
      trim: true,
    },

    // Who initiated the request
    direction: {
      type: String,
      enum: ["sent", "received"], // easy to filter
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "blocked"],
      default: "pending",
    },

    lastMessage: {
      message: { type: String, default: "" },
      time: { type: Date, default: null },
    },

    unread: {
      type: Number,
      default: 0,
      min: 0,
    },

    onlineStatus: {
      online: { type: Boolean, default: false },
      lastSeen: { type: Date, default: null },
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    }, // optional — useful for future personalization

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// export default connectionSchema;


const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    avatar: { type: String, default: "" },
    inviteCode: { type: String, required: true, unique: true },

    connections: [connectionSchema],

    onlineStatus: {
      online: { type: Boolean, default: false },
      lastSeen: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
