import User from "../models/User.js";
import onlineUsers from "../socket/onlineUsers.js";

export const safeEmit = async (
  io,
  {
    // event,
    senderId,
    receiverUsername,
    // data,
    permission = "message",
  }
) => {
  try {
    console.log(" i am running")
    console.log(senderId,receiverUsername)
    if (!senderId || !receiverUsername) return false;

    // Fetch sender and receiver
    const [sender, receiver] = await Promise.all([
      User.findById(senderId)
        .select("_id settings.privacy settings.preferences")
        .lean(),

      User.findOne({ username: receiverUsername })
        .select("_id username settings.privacy settings.preferences")
        .lean(),
    ]);

    if (!sender || !receiver) return false;

    const senderIdString = sender._id.toString();
    const receiverIdString = receiver._id.toString();

    // Check whether either user has blocked the other
    // const isBlocked =
    //   sender.settings?.privacy?.blockedUsers?.some(
    //     (u) => u.id?.toString() === receiverIdString
    //   ) ||
    //   receiver.settings?.privacy?.blockedUsers?.some(
    //     (u) => u.id?.toString() === senderIdString
    //   );
    // if (isBlocked)return false;
// console.log("isBlocked",isBlocked)

const senderBlockedReceiver =
  sender.settings?.privacy?.blockedUsers?.some(
    (u) => u.id?.toString() === receiverIdString
  ) || false;

const receiverBlockedSender =
  receiver.settings?.privacy?.blockedUsers?.some(
    (u) => u.id?.toString() === senderIdString
  ) || false;

  if (senderBlockedReceiver){
    return {allow:false,blockedBy:"sender"}
  }

   if (receiverBlockedSender){
    return {allow:false,blockedBy:"receiver"}
  }



    // Check receiver's feature permissions
    // if (
    //   permission === "typing" &&
    //   receiver.settings?.preferences?.showTypingIndicator === false
    // ) {
    //   return false;
    // }

    // if (
    //   permission === "readReceipt" &&
    //   receiver.settings?.preferences?.showReadReceipts === false
    // ) {
    //   return false;
    // }

    // Find receiver's active socket
    // const receiverSocketId = onlineUsers.get(receiver.username);

    // if (!receiverSocketId) return false;

    // Emit after authorization
    // io.to(receiverSocketId).emit(event, data);

    return {allow:true};

  } catch (error) {
    console.error("Safe emit error:", error);
    return false;
  }
};