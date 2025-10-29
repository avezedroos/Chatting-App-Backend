import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Register
router.post("/register", async (req, res) => {
  try {
    const { username, password, avatar } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: "Username already taken" });

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hash, avatar });
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: "1d" });

    res.json({ token, username: user.username, avatar: user.avatar });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: "1d" });
    res.json({ token, username: user.username, avatar: user.avatar });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
