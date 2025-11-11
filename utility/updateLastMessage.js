import User from "../models/User.js";

/**
 * Updates the last message info for both sender and receiver
 * inside their connections array.
 *
 * @param {String} senderUsername - Username of the sender
 * @param {String} receiverUsername - Username of the receiver
 * @param {String} text - Message text
 */
export const updateLastMessage = async (senderUsername, receiverUsername, text) => {
  try {
    const now = new Date();

    // Update sender's lastMessage for the receiver connection
    await User.updateOne(
      {
        username: senderUsername,
        "connections.username": receiverUsername,
      },
      {
        $set: {
          "connections.$.lastMessage.message": text,
          "connections.$.lastMessage.time": now,
        },
      }
    );

    // Update receiver's lastMessage and unread count for the sender connection
    await User.updateOne(
      {
        username: receiverUsername,
        "connections.username": senderUsername,
      },
      {
        $set: {
          "connections.$.lastMessage.message": text,
          "connections.$.lastMessage.time": now,
        },
        $inc: { "connections.$.unread": 1 },
      }
    );

    console.log(`✅ Last message updated between ${senderUsername} and ${receiverUsername}`);
  } catch (err) {
    console.error("❌ Error updating last message:", err);
  }
};
