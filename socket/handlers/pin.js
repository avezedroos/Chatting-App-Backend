
import mongoose from "mongoose";
import Message from "../../models/Message.js";
import User from "../../models/User.js";

export default function registerPinHandlers(io, socket) {
  socket.on("pinMessage", async (data, ack) => {
    const respond = (result) => {
      if (typeof ack === "function") ack(result);
    };

    try {
      const { msgId, otherUser, type } = data || {};
      const currentUserId = socket.userId;

      // 1. Validate payload
      if (!msgId || !otherUser || !type || !currentUserId) {
        return respond({
          success: false,
          message: "Missing required information.",
        });
      }

      // 2. Validate IDs and type
      if (
        !mongoose.isValidObjectId(msgId) ||
        !mongoose.isValidObjectId(currentUserId)
      ) {
        return respond({
          success: false,
          message: "Invalid ID.",
        });
      }

      if (!["personal", "shared"].includes(type)) {
        return respond({
          success: false,
          message: "Invalid pin type.",
        });
      }

      if (typeof otherUser !== "string" || !otherUser.trim()) {
        return respond({
          success: false,
          message: "Invalid username.",
        });
      }

      // 3. Find current user
      const currentUser = await User.findById(currentUserId)
        .select("_id username")
        .lean();

      if (!currentUser) {
        return respond({
          success: false,
          message: "Current user not found.",
        });
      }

      // 4. Find other user using username
      const otherUserData = await User.findOne({
        username: otherUser.trim(),
      })
        .select("_id username")
        .lean();

      if (!otherUserData) {
        return respond({
          success: false,
          message: "Other user not found.",
        });
      }

      const otherUserId = otherUserData._id;

      if (String(currentUserId) === String(otherUserId)) {
        return respond({
          success: false,
          message: "Invalid connection.",
        });
      }

      // 5. Find message
      const message = await Message.findById(msgId).lean();

      if (!message) {
        return respond({
          success: false,
          message: "Message not found.",
        });
      }

      // 6. Validate message participants
      // senderId and receiverId contain usernames
      const sender = String(message.sender);
      const receiver = String(message.receiver);

      const currentUsername = currentUser.username;
      const otherUsername = otherUserData.username;

      const isValidConversation =
        (sender === currentUsername && receiver === otherUsername) ||
        (sender === otherUsername && receiver === currentUsername);

      if (!isValidConversation) {
        return respond({
          success: false,
          message: "You are not authorized to pin this message.",
        });
      }

      // 7. Validate original message timestamp
      // Never generate a timestamp for a pin
      const originalTimestamp = message.timestamp;

      if (
        !originalTimestamp ||
        !Number.isFinite(new Date(originalTimestamp).getTime())
      ) {
        return respond({
          success: false,
          message: "Message timestamp is missing or invalid.",
        });
      }

      // 8. Prepare pin data
      const pinData = {
        msgId: message._id,
        type,
        timestamp: new Date(originalTimestamp),
      };

      const isShared = type === "shared";

      let currentUpdated = false;
      let otherUpdated = false;

      // 9. Update database atomically
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {

          // Check current user's connection
          const currentConnection = await User.exists({
            _id: currentUserId,
            "connections.userId": otherUserId,
          }).session(session);

          if (!currentConnection) {
            throw new Error(
              "Current user's connection not found."
            );
          }

          // Check other user's connection for shared pins
          if (isShared) {
            const otherConnection = await User.exists({
              _id: otherUserId,
              "connections.userId": currentUserId,
            }).session(session);

            if (!otherConnection) {
              throw new Error(
                "Other user's connection not found."
              );
            }
          }

          // Add pin to current user's connection
          const currentResult = await User.updateOne(
            {
              _id: currentUserId,
              connections: {
                $elemMatch: {
                  userId: otherUserId,
                  pin: {
                    $not: {
                      $elemMatch: {
                        msgId: message._id,
                      },
                    },
                  },
                },
              },
            },
            {
              $push: {
                "connections.$.pin": pinData,
              },
            },
            { session }
          );

          currentUpdated = currentResult.modifiedCount > 0;

          // Add pin to other user's connection if shared
          if (isShared) {
            const otherResult = await User.updateOne(
              {
                _id: otherUserId,
                connections: {
                  $elemMatch: {
                    userId: currentUserId,
                    pin: {
                      $not: {
                        $elemMatch: {
                          msgId: message._id,
                        },
                      },
                    },
                  },
                },
              },
              {
                $push: {
                  "connections.$.pin": pinData,
                },
              },
              { session }
            );

            otherUpdated = otherResult.modifiedCount > 0;
          }
        });
      } finally {
        await session.endSession();
      }

      // 10. Check duplicate
      if (!currentUpdated && !otherUpdated) {
        return respond({
          success: false,
          duplicate: true,
          message: "Message is already pinned.",
        });
      }

      // 11. Emit to other user if shared
      if (isShared && otherUpdated) {
        io.to(String(otherUsername)).emit("pinMessageUpdated", {
        //   userId: String(currentUserId),
          otherUser: currentUsername,
          pin: pinData,
        });
      }

      // 12. Success response
      return respond({
        success: true,
        pin: pinData,
        // message: "Message pinned successfully.",
        // type,
        // shared: isShared,
      });

    } catch (error) {
      console.error("pinMessage error:", error);

      return respond({
        success: false,
        message: error.message || "Unable to pin message.",
      });
    }
  });

  
socket.on("unpinMessage", async (data, ack) => {
  const respond = (result) => {
    if (typeof ack === "function") ack(result);
  };

  try {
    const { msgId, otherUser } = data || {};
    const currentUserId = socket.userId;

    // 1. Validate payload
    if (!msgId || !otherUser || !currentUserId) {
      return respond({
        success: false,
        message: "Missing required information.",
      });
    }

    // 2. Validate ID
    if (
      !mongoose.isValidObjectId(msgId) ||
      !mongoose.isValidObjectId(currentUserId)
    ) {
      return respond({
        success: false,
        message: "Invalid ID.",
      });
    }

    if (typeof otherUser !== "string" || !otherUser.trim()) {
      return respond({
        success: false,
        message: "Invalid username.",
      });
    }

    // 3. Find users
    const currentUser = await User.findById(currentUserId)
      .select("_id username")
      .lean();

    if (!currentUser) {
      return respond({
        success: false,
        message: "Current user not found.",
      });
    }

    const otherUserData = await User.findOne({
      username: otherUser.trim(),
    })
      .select("_id username")
      .lean();

    if (!otherUserData) {
      return respond({
        success: false,
        message: "Other user not found.",
      });
    }

    const otherUserId = otherUserData._id;

    if (String(currentUserId) === String(otherUserId)) {
      return respond({
        success: false,
        message: "Invalid connection.",
      });
    }

    // 4. Validate message
    const message = await Message.findById(msgId).lean();

    if (!message) {
      return respond({
        success: false,
        message: "Message not found.",
      });
    }

    // 5. Validate conversation participants
    const sender = String(message.sender);
    const receiver = String(message.receiver);

    const currentUsername = currentUser.username;
    const otherUsername = otherUserData.username;

    const isValidConversation =
      (sender === currentUsername && receiver === otherUsername) ||
      (sender === otherUsername && receiver === currentUsername);

    if (!isValidConversation) {
      return respond({
        success: false,
        message: "You are not authorized to unpin this message.",
      });
    }

    // 6. Start transaction
    const session = await mongoose.startSession();

    let pinType = null;
    let currentUpdated = false;
    let otherUpdated = false;

    try {
      await session.withTransaction(async () => {

        // 7. Find current user's connection and pin
        const currentUserData = await User.findOne({
          _id: currentUserId,
          "connections.userId": otherUserId,
        })
          .select("connections")
          .session(session)
          .lean();

        if (!currentUserData) {
          throw new Error("Current user's connection not found.");
        }

        const currentConnection = currentUserData.connections.find(
          (c) => String(c.userId) === String(otherUserId)
        );

        const existingPin = currentConnection?.pin?.find(
          (p) => String(p.msgId) === String(message._id)
        );

        if (!existingPin) {
          throw new Error("Pinned message not found.");
        }

        // 8. Get actual pin type from database
        pinType = existingPin.type;

        // 9. Check other user's connection if shared
        if (pinType === "shared") {
          const otherConnection = await User.exists({
            _id: otherUserId,
            "connections.userId": currentUserId,
          }).session(session);

          if (!otherConnection) {
            throw new Error("Other user's connection not found.");
          }
        } else if (pinType !== "personal") {
          throw new Error("Invalid pin type.");
        }

        // 10. Remove pin from current user's connection
        const currentResult = await User.updateOne(
          {
            _id: currentUserId,
            connections: {
              $elemMatch: {
                userId: otherUserId,
                "pin.msgId": message._id,
              },
            },
          },
          {
            $pull: {
              "connections.$.pin": {
                msgId: message._id,
              },
            },
          },
          { session }
        );

        currentUpdated = currentResult.modifiedCount > 0;

        if (!currentUpdated) {
          throw new Error("Unable to remove pin.");
        }

        // 11. Remove from other user's connection if shared
        if (pinType === "shared") {
          const otherResult = await User.updateOne(
            {
              _id: otherUserId,
              connections: {
                $elemMatch: {
                  userId: currentUserId,
                },
              },
            },
            {
              $pull: {
                "connections.$.pin": {
                  msgId: message._id,
                },
              },
            },
            { session }
          );

          otherUpdated = otherResult.modifiedCount > 0;
        }
      });

    } finally {
      await session.endSession();
    }

    // 12. Notify other user if shared
    if (pinType === "shared") {
      io.to(String(otherUsername)).emit("unpinMessageUpdated", {
        otherUser: currentUsername,
        msgId: String(message._id),
      });
    }

    // 13. Success
    return respond({
      success: true,
      msgId: String(message._id),
    });

  } catch (error) {
    console.error("unpinMessage error:", error);

    return respond({
      success: false,
      message: error.message || "Unable to unpin message.",
    });
  }
});


  
}
