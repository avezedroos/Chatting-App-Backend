import express from "express";
import Message from "../models/Message.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get conversation for two users (sorted)
router.get("/:userA/:userB", verifyToken, async (req, res) => {
  console.log("i got hit in message routes for get massage");
  const { userA, userB } = req.params;
  console.log(userA, userB);
  try {
    const msgs = await Message.find({
      $or: [
        { sender: userA, receiver: userB },
        { sender: userB, receiver: userA }
      ]
    }).sort({ timestamp: 1 })
    .populate({
    path: "replyTo",
    select: "_id text sender", // only return these fields
  });
   
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark messages from sender->receiver as read
router.put("/mark-read", verifyToken, async (req, res) => {
  console.log("mark-read route hit", req.body);
  const { sender, receiver } = req.body;
  try {
    const result = await Message.updateMany(
      { sender, receiver, read: false },
      { $set: { read: true } }
    );
    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
