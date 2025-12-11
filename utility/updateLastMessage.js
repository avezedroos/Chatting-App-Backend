import User from "../models/User.js";

/**
 * Update lastMessage for sender/receiver.
 *
 * @param {String} senderUsername
 * @param {String} receiverUsername
 * @param {String} text
 * @param {String|Array} msgId
 * @param {Boolean} match  -> if true = update only if msgId matches (NO unread increment)
 */
export const updateLastMessage = async (
  senderUsername,
  receiverUsername,
  text,
  msgId,
  match
) => {
  try {
    const now = new Date();

    // -------------------------------------
    // Normalize msgId to array of strings
    // -------------------------------------
    const msgIdStrings = (Array.isArray(msgId) ? msgId : [msgId]).map((id) =>
      id?.toString()
    );

    // ------------------------------------------------
    // 🚀 If match = true → validate existing lastMessage
    // ------------------------------------------------
    if (match === true) {
      const senderDoc = await User.findOne(
        {
          username: senderUsername,
          "connections.username": receiverUsername,
        },
        {
          "connections.$": 1,
        }
      );

      if (!senderDoc || !senderDoc.connections?.length) {
        console.log("❌ Sender connection not found.");
        return;
      }

      const existingMsgId = senderDoc.connections[0].lastMessage?.msgId;

      // Normalize existing msgId
      const existingIdStrings = Array.isArray(existingMsgId)
        ? existingMsgId.map((id) => id?.toString())
        : [existingMsgId?.toString()];

      console.log("🔍 Existing msgId:", existingIdStrings);
      console.log("🔍 Allowed msgIds:", msgIdStrings);

      // Check for any match
      const isMatch = existingIdStrings.some((id) =>
        msgIdStrings.includes(id)
      );

      console.log("🔍 Match result:", isMatch);

      if (!isMatch) {
        console.log("⛔ msgId mismatch → update skipped.");
        return;
      }
    }

    // -------------------------------------
    // 🟢 Update sender lastMessage
    // -------------------------------------
    await User.updateOne(
      {
        username: senderUsername,
        "connections.username": receiverUsername,
      },
      {
        $set: {
          "connections.$.lastMessage.message": text,
          "connections.$.lastMessage.time": now,
          "connections.$.lastMessage.msgId": msgId,
        },
      }
    );

    // -------------------------------------
    // 🟢 Update receiver lastMessage
    //    (Only increase unread if match = false)
    // -------------------------------------
    const receiverUpdate = {
      $set: {
        "connections.$.lastMessage.message": text,
        "connections.$.lastMessage.time": now,
        "connections.$.lastMessage.msgId": msgId,
      },
    };

    // Only unread increment when match === false
    if (match !== true) {
      receiverUpdate.$inc = { "connections.$.unread": 1 };
    }

    await User.updateOne(
      {
        username: receiverUsername,
        "connections.username": senderUsername,
      },
      receiverUpdate
    );

    console.log(
      `✅ Last message updated between ${senderUsername} and ${receiverUsername} (match: ${match})`
    );
  } catch (err) {
    console.error("❌ Error updating last message:", err);
  }
};
