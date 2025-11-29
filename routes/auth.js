import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import dotenv from "dotenv";
import { connect } from "http2";
import { verifyToken } from "../middleware/authMiddleware.js";
dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Helper to generate a simple invite code
function generateInviteCode(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}


// Register
router.post("/register", async (req, res) => {
  try {
    const { username, password, inviteToken } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Missing fields" });

    // --------- CHECK IF USERNAME EXISTS ---------
    const existing = await User.findOne({ username });
    if (existing)
      return res.status(400).json({ error: "Username already taken" });

    const hash = await bcrypt.hash(password, 10);

    // --------- GENERATE UNIQUE INVITE CODE ---------
    let inviteCode = generateInviteCode();
    let user;
    let attempt = 0;

    while (true) {
      try {
        user = new User({ username, password: hash, inviteCode });
        await user.save();
        break;
      } catch (err) {
        if (err.code === 11000 && attempt < 3) {
          inviteCode = generateInviteCode();
          attempt++;
        } else {
          throw err;
        }
      }
    }

    // -----------------------------------------------------
    //   🟣 IF INVITE TOKEN EXISTS — CREATE CONNECTION
    // -----------------------------------------------------

    if (inviteToken) {
      const inviter = await User.findOne({ inviteCode: inviteToken });

      if (inviter) {
        // Prevent self linking (rare case)
        if (!inviter._id.equals(user._id)) {
          // Add to inviter's list
          inviter.connections.push({
            userId: user._id,
            username: user.username,
            direction: "sent",
            status: "accepted",  // or "pending"
            createdAt: new Date(),
          });

          // Add to new user's list
          user.connections.push({
            userId: inviter._id,
            username: inviter.username,
            direction: "received",
            status: "accepted",  // or "pending"
            createdAt: new Date(),
          });

          await inviter.save();
          await user.save();
        }
      }
    }

    // -----------------------------------------------------
    // CREATE JWT
    // -----------------------------------------------------
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });

    // Filter accepted connections only
    const acceptedConnections = (user.connections || []).filter(
      (conn) => conn.status === "accepted"
    );

    const userdata = {
      connections: acceptedConnections,
      username: user.username,
      inviteCode: user.inviteCode,
    };

    res.json({ token, userdata });

  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: err.message });
  }
});



// Login
router.post("/login", async (req, res) => {
  console.log("login route hit");
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const user = await User.findOne({ username })
    .populate("connections.onlineStatus");
    // console.log(user)
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });
     // ✅ Filter accepted connections
    const acceptedConnections = (user.connections || []).filter(
      (conn) => conn.status === "accepted"
    );
    const userdata ={
      connections: acceptedConnections,
      username: user.username,
      inviteCode: user.inviteCode,
    } 
    res.json({ token, userdata: userdata });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/verify", verifyToken, async (req, res) => {
  // console.log("verify route hit", req.body);
  try {
    console.log("req.user.id:", req.userId);
    const user = await User.findById(req.userId)
    .populate("connections.onlineStatus");
    // console.log(user)
    if (!user) return res.status(404).json({ error: "User not found" });

    const acceptedConnections = (user.connections || []).filter(
      (conn) => conn.status === "accepted"
    );
    const userdata ={
      connections: acceptedConnections,
      username: user.username,
      inviteCode: user.inviteCode,
    }
    res.json({ userdata });
  } catch (e) {
    console.error("Verify token error:", e);
    res.status(401).json({ message: "Invalid token" });

  }
});

export default router;
