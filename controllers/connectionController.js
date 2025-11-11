import User from "../models/User.js";


export const addConnection = async (req, res) => {
  console.log("Add connection request received");
  console.log(req.body);

  try {
    const { senderCode, receiverCode } = req.body; // invite codes of both users

    if (!senderCode || !receiverCode) {
      return res
        .status(400)
        .json({ message: "Both invite codes are required" });
    }

    // 🟣 Fetch both users by inviteCode instead of _id
    const sender = await User.findOne({ inviteCode: senderCode });
    const receiver = await User.findOne({ inviteCode: receiverCode });

    if (!sender || !receiver) {
      return res
        .status(404)
        .json({ message: "User not found with given invite code(s)" });
    }

    // 🚫 Prevent self connection
    if (sender._id.equals(receiver._id)) {
      return res
        .status(400)
        .json({ message: "You cannot send a request to yourself" });
    }

    // 🚫 Prevent duplicate or existing connections
    const senderExisting = sender.connections.some(
      (conn) =>
        conn.userId.toString() === receiver._id.toString() &&
        ["pending", "accepted"].includes(conn.status)
    );

    if (senderExisting) {
      return res
        .status(400)
        .json({ message: "Connection request already exists or accepted" });
    }

    // ✅ Add in sender’s list
    sender.connections.push({
      userId: receiver._id,
      username: receiver.username,
      direction: "sent",
      status: "pending",
      createdAt: new Date(),
    });

    // ✅ Add in receiver’s list
    receiver.connections.push({
      userId: sender._id,
      username: sender.username,
      direction: "received",
      status: "pending",
      createdAt: new Date(),
    });

    await sender.save();
    await receiver.save();

    return res.status(200).json({
      message: "Connection request sent successfully",
      sender: sender.username,
      receiver: receiver.username,
    });
  } catch (err) {
    console.error("Error adding connection:", err);
    res.status(500).json({ message: "Server error" });
  }
};



// Controller to fetch multiple types of connection requests in one request
// import User from "../models/User.js"; // adjust path as needed

export const getConnectionRequests = async (req, res) => {
  console.log("📩 [getConnectionRequests] Advanced direction-based filter request");

  try {
    const { username, filters } = req.body;

    // ✅ Step 1: Validation
    if (!username || !filters?.directions) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: 'username' and 'filters.directions'.",
      });
    }

    // ✅ Step 2: Extract filters safely
    const directionsFilter = filters.directions || {};

    // ✅ Step 3: Find the user
    const user = await User.findOne({ username }).lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const allConnections = user.connections || [];
    const results = { received: [], sent: [] };

    // ✅ Step 4: Process each direction dynamically
    for (const direction of Object.keys(directionsFilter)) {
      const statuses = directionsFilter[direction] || [];

      // Filter by direction
      let filtered = allConnections.filter((c) => c.direction === direction);

      // If no statuses provided → include all
      if (statuses.length > 0 && !statuses.includes("all")) {
        filtered = filtered.filter((c) => statuses.includes(c.status));
      }

      results[direction] = filtered.map((conn) => ({
        userId: conn.userId,
        username: conn.username,
        status: conn.status,
        direction: conn.direction,
        lastMessage: conn.lastMessage,
        unread: conn.unread,
        onlineStatus: conn.onlineStatus,
        notes: conn.notes,
        createdAt: conn.createdAt,
      }));
    }

    // ✅ Step 5: Summary
    const summary = {
      total: Object.values(results).flat().length,
      received: results.received.length,
      sent: results.sent.length,
    };

    // ✅ Step 6: Respond
    return res.status(200).json({
      success: true,
      username,
      filters: directionsFilter,
      summary,
      results,
    });
  } catch (error) {
    console.error("❌ [getConnectionRequests] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

/**
 * Update connection status between two users
 * Supported actions: accepted, rejected, blocked, cancel
 */
export const updateConnectionStatus = async (req, res) => {
  console.log("🔄 [updateConnectionStatus] Request received:", req.body);

  try {
    const { username, targetUsername, action } = req.body;

    if (!username || !targetUsername || !action) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: username, targetUsername, or action",
      });
    }

    const validActions = ["accepted", "rejected", "blocked", "cancel"];
    if (!validActions.includes(action.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Must be one of: accepted, rejected, blocked, cancel",
      });
    }

    // ✅ Find both users
    const [user, targetUser] = await Promise.all([
      User.findOne({ username }),
      User.findOne({ username: targetUsername }),
    ]);

    if (!user || !targetUser) {
      return res.status(404).json({
        success: false,
        message: "One or both users not found.",
      });
    }

    // ✅ Helper function to update connection in user's array
    const updateConnection = (userDoc, targetId, updates) => {
      const index = userDoc.connections.findIndex(
        (c) => c.userId.toString() === targetId.toString()
      );
      if (index >= 0) {
        userDoc.connections[index] = {
          ...userDoc.connections[index]._doc,
          ...updates,
        };
      }
    };

    // ✅ Handle actions
    if (action === "cancel" || action === "rejected") {
      // Remove the pending connection from both users
      user.connections = user.connections.filter(
        (c) => c.userId.toString() !== targetUser._id.toString()
      );
      targetUser.connections = targetUser.connections.filter(
        (c) => c.userId.toString() !== user._id.toString()
      );
    } else if (action === "blocked") {
      // Update or create a blocked status
      updateConnection(user, targetUser._id, {
        status: "blocked",
      });

      // Optional: targetUser might keep record of this as "blockedBy"
      updateConnection(targetUser, user._id, {
        status: "blocked",
      });
    } else if (action === "accepted") {
      // ✅ Update both users’ connection statuses
      updateConnection(user, targetUser._id, { status: "accepted" });
      updateConnection(targetUser, user._id, { status: "accepted" });
    }

    // ✅ Save both users
    await Promise.all([user.save(), targetUser.save()]);

    console.log("✅ [updateConnectionStatus] Action completed successfully");
    res.status(200).json({
      success: true,
      message: `Connection ${action} successfully.`,
    });
  } catch (error) {
    console.error("❌ [updateConnectionStatus] Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};


