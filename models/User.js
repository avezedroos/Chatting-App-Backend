import mongoose from "mongoose";

// import mongoose from "mongoose";

const connectionSchema = new mongoose.Schema(
  {
    // The other user's ObjectId (1)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
// the other user's username (2)
    username: {
      type: String,
      required: true,
      trim: true,
    },

    // Who initiated the request (3)
    direction: {
      type: String,
      enum: ["sent", "received"], // easy to filter
      required: true,
    },
//(4)
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "blocked"],
      default: "pending",
    },

    //(5)
    lastMessage: {
      message: { type: String, default: "" },
      time: { type: Date, default: null },
    },

    //(6)
    unread: {
      type: Number,
      default: 0,
      min: 0,
    },

    // onlineStatus: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "User",
    //   required: true,
    // },

    //(7)
    notes: {
      type: String,
      trim: true,
      default: "",
    }, // optional — useful for future personalization

    // (8)
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
 {
    _id: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

//
// ⭐ VIRTUAL FIELD: onlineStatus
//
// This will add "connection.onlineStatus" without storing it in DB.
//
connectionSchema.virtual("onlineStatus", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
  options: { select: "onlineStatus" }, // only fetch online + lastSeen
});

//
// ⭐ FIX TRANSFORM — remove extra nesting + remove _id,id
//
function cleanOnlineStatus(_, ret) {
  // If virtual returned whole user → extract only the real onlineStatus
  if (ret.onlineStatus && ret.onlineStatus.onlineStatus) {
    ret.onlineStatus = ret.onlineStatus.onlineStatus;
  }

  // Remove unwanted _id / id from the virtual
  if (ret.onlineStatus && ret.onlineStatus._id) {
    delete ret.onlineStatus._id;
    delete ret.onlineStatus.id;
  }

  return ret;
}

connectionSchema.set("toJSON", {
  virtuals: true,
  transform: cleanOnlineStatus,
});

connectionSchema.set("toObject", {
  virtuals: true,
  transform: cleanOnlineStatus,
});



//
// USER SCHEMA
//

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
