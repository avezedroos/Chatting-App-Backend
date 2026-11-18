
import Message from "../models/Message.js";
import User from "../models/User.js";

export const clearchat = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("username")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const username = user.username;

    const { otherUserNames } = req.body;

    if (
      !Array.isArray(otherUserNames) ||
      otherUserNames.length < 1
    ) {
      return res.status(400).json({
        message: "Please provide valid usernames",
      });
    }

    // Step 1: Update messages
    const result = await Message.updateMany(
      {
        $or: [
          // My messages: include all statuses
          {
            sender: username,
            receiver: { $in: otherUserNames },
          },

          // Other user's messages: exclude status sent
          {
            sender: { $in: otherUserNames },
            receiver: username,
            status: { $in: ["delivered", "read"] },
          },
        ],
        deletedFor: { $ne: username },
      },
      {
        $addToSet: {
          deletedFor: username,
        },
      }
    );

    console.log("Message update result:", result);

    // Step 2: Update lastMessage only if messages were modified
    if (result.modifiedCount > 0) {
      const connectionResult = await User.updateOne(
        { _id: req.userId },
        {
          $set: {
            "connections.$[conn].lastMessage": {
              msgId: null,
              message: "",
              time: null,
            },
          },
        },
        {
          arrayFilters: [
            {
              "conn.username": { $in: otherUserNames },
            },
          ],
        }
      );

      console.log("Connection update result:", connectionResult);
    }

    return res.status(200).json({
      success: true,
      message: "Chat cleared successfully",
      modifiedMessages: result.modifiedCount,
    });

  } catch (error) {
    console.error("Clear chat error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};
