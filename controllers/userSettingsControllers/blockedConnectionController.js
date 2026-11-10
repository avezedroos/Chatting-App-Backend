import mongoose from "mongoose";
import User from "../../models/User.js";

export const blockConnection = async (req, res) => {
    console.log("i got hit on blockConnection")
  try {
    const blockerId = req.userId;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (blockerId.toString() === userId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot block yourself",
      });
    }

    // Check whether target user exists
    const targetUser = await User.exists({ _id: userId });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Add user only if not already blocked
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: blockerId,
        "settings.privacy.blockedUsers.id": { $ne: userId },
      },
      {
        $push: {
          "settings.privacy.blockedUsers": {
            id: userId,
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    ).select("settings.privacy.blockedUsers");

    if (!updatedUser) {
      return res.status(409).json({
        success: false,
        message: "User already blocked or account not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User blocked successfully",
      blockedUsers: updatedUser.settings.privacy.blockedUsers,
    });

  } catch (error) {
    console.error("Block connection error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to block user",
    });
  }
};


export const unblockConnection = async (req, res) => {
  try {
    const blockerId = req.userId;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: blockerId,
        "settings.privacy.blockedUsers.id": userId,
      },
      {
        $pull: {
          "settings.privacy.blockedUsers": {
            id: userId,
          },
        },
      },
      { new: true }
    ).select("settings.privacy.blockedUsers");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "Blocked user not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User unblocked successfully",
      blockedUsers: updatedUser.settings.privacy.blockedUsers,
    });

  } catch (error) {
    console.error("Unblock connection error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to unblock user",
    });
  }
};