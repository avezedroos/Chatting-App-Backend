import Message from "../../models/Message.js";
import { updateLastMessage } from "../../utility/updateLastMessage.js";


export default function registerDeleteHandlers(io, socket) {

  socket.on("deleteMessageForMeBulk", async ({ messageIds }) => { 
    try {
        const username = socket.username;
        await Message.updateMany(
          { _id: { $in: messageIds } },
          { $addToSet: { deletedFor: username } }
        );
    // i want build the validation for this event too but later
    
      } catch (err) {
        console.error("Bulk delete error:", err);
      }

   });

   socket.on("deleteMessageForEveryoneBulk", async ({ messageIds }) => {
     try {
       const currentTime = Date.now();
       const requestorName = socket.username; // sender
       const LIMIT_MINUTES = 90;
       const LIMIT_MS = LIMIT_MINUTES * 60 * 1000;
   
       // Fetch all messages at once
       const messages = await Message.find({ _id: { $in: messageIds } });
       if (!messages.length) return;
   
       const validIds = [];
   
       for (const msg of messages) {
         if (!msg) continue;
   
         // 1️⃣ Only allow sender to delete for everyone
         if (msg.sender !== requestorName) continue;
   
         // 2️⃣ Enforce 90 minute delete window
         const sentTime = msg.timestamp.getTime();
         if (Date.now() - sentTime > LIMIT_MS) continue;
   
         // 3️⃣ Skip already deleted messages
         if (msg.isDeletedForEveryone) continue;
   
         // 4️⃣ Optional tighter window for media
         if (["image", "video"].includes(msg.type)) {
           if (Date.now() - sentTime > 30 * 60 * 1000) continue; // 30 min
         }
   
         validIds.push(msg._id.toString());
       }
   
       if (!validIds.length) return;
   
       // 🔥 Update all valid messages in DB
       await Message.updateMany(
         { _id: { $in: validIds } },
         {
           text: "This message was deleted",
           attachments: [],
           reactions: [],
           isDeletedForEveryone: true,
           isEdited: false,
           editedAt: currentTime,
         }
       );
   
       // 🔥 Fetch updated messages (only receivers needed)
       const finalMessages = await Message.find({ _id: { $in: validIds } });
   
       // 🔥 Group messages by receiver
       const receiverGroups = {}; 
       for (const msg of finalMessages) {
         const receiver = msg.receiver;
   
         if (!receiverGroups[receiver]) receiverGroups[receiver] = [];
         receiverGroups[receiver].push(msg._id.toString());
       }
   
       // 🔥 Notify each receiver once with only their message IDs
       for (const receiver in receiverGroups) {
         await updateLastMessage(requestorName, receiver, "This message was deleted",receiverGroups[receiver], true );
         io.to(receiver).emit("messagesDeletedForEveryoneBulk", {
          
           messageIds: receiverGroups[receiver],  // only relevant ids
           sender: requestorName,
           timestamp: currentTime,
          
         });
       }
   
     } catch (err) {
       console.log("Delete for everyone error:", err);
     }
   });
}
