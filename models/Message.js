import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },   // username
  receiver: { type: String, required: true }, // username
  text: { type: String },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },
  type: { type: String, default: "text" } // extendable: image, file etc.
});

export default mongoose.model("Message", messageSchema);
