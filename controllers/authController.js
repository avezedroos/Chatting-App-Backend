import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import dotenv from "dotenv";
import { generateInviteCode } from "../utility/generateInviteCode.js";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

// =======================
// REGISTER CONTROLLER
// =======================
export const registerUser = async (req, res) => {
  try {
    const { username, password, inviteToken } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Missing fields" });

    // Check existing user
    const existing = await User.findOne({ username });
    if (existing)
      return res.status(400).json({ error: "Username already taken" });

    const hash = await bcrypt.hash(password, 10);

    // Generate unique invite code
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

    // 🔗 Invite-based connection
    if (inviteToken) {
      const inviter = await User.findOne({ inviteCode: inviteToken });

      if (inviter && !inviter._id.equals(user._id)) {
        inviter.connections.push({
          userId: user._id,
          username: user.username,
          direction: "sent",
          status: "accepted",
          createdAt: new Date(),
        });

        user.connections.push({
          userId: inviter._id,
          username: inviter.username,
          direction: "received",
          status: "accepted",
          createdAt: new Date(),
        });

        await inviter.save();
        await user.save();
      }
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, {
      expiresIn: "1d",
    });

    const acceptedConnections = (user.connections || []).filter(
      (c) => c.status === "accepted"
    );

    res.json({
      token,
      userdata: {
        username: user.username,
        inviteCode: user.inviteCode,
        connections: acceptedConnections,
      },
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: err.message });
  }
};

// =======================
// LOGIN CONTROLLER
// =======================
export const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log("password is" , password)

    if (!username || !password)
      return res.status(400).json({ error: "Missing fields" });

    const user = await User.findOne({ username }).populate(
      "connections.onlineStatus"
    );

    if (!user)
      return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, {
      expiresIn: "1d",
    });

   const acceptedConnections = (user.connections || [])
  .filter((c) => c.status === "accepted")
  .sort((a, b) => {
  const tA = new Date(a.lastMessage?.time || a.createdAt || 0).getTime();
  const tB = new Date(b.lastMessage?.time || b.createdAt || 0).getTime();
  return tB - tA;
});



    res.json({
      token,
      userdata: {
        username: user.username,
        inviteCode: user.inviteCode,
        connections: acceptedConnections,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// =======================
// VERIFY CONTROLLER
// =======================
export const verifyUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate(
      "connections.onlineStatus"
    );

    if (!user)
      return res.status(404).json({ error: "User not found" });

    const acceptedConnections = (user.connections || [])
    .filter((c) => c.status === "accepted")
    .sort((a, b) => {
  const tA = new Date(a.lastMessage?.time || a.createdAt || 0).getTime();
  const tB = new Date(b.lastMessage?.time || b.createdAt || 0).getTime();
  return tB - tA;
});

    res.json({
      userdata: {
        username: user.username,
        inviteCode: user.inviteCode,
        connections: acceptedConnections,
      },
    });
  } catch (err) {
    console.error("Verify error:", err);
    res.status(401).json({ message: "Invalid token" });
  }
};
