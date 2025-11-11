import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import dotenv from "dotenv";
import { connect } from "http2";
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
    const { username, password, avatar } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Missing fields" });

    const existing = await User.findOne({ username });
    if (existing)
      return res.status(400).json({ error: "Username already taken" });

    const hash = await bcrypt.hash(password, 10);

    let inviteCode = generateInviteCode();

    // ✅ attempt saving until unique code is accepted
    let user;
    let attempt = 0;
    while (true) {
      try {
        user = new User({ username, password: hash, avatar, inviteCode });
        await user.save();
        break;
      } catch (err) {
        // if duplicate key error (code 11000), regenerate once
        if (err.code === 11000 && attempt < 3) {
          inviteCode = generateInviteCode();
          attempt++;
        } else {
          throw err;
        }
      }
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

     // ✅ Filter accepted connections
    const acceptedConnections = (user.connections || []).filter(
      (conn) => conn.status === "accepted"
    );
    const userdata ={
      connections: acceptedConnections,
      username: user.username,
      inviteCode: user.inviteCode,
    } 

    res.json({
      token,
      userdata: userdata,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Login
router.post("/login", async (req, res) => {
  console.log("login route hit");
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: "1d" });
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

export default router;
