import Message from "../../models/Message.js";
import { updateLastMessage } from "../../utility/updateLastMessage.js";
import { validateEditMessage } from "../../validations/validateEditMessage.js";


export default function registerEditHandlers(io, socket) {
  socket.on("edit-Message", async ({ messageId, newText }) => { 

    try {
          console.log("Edit message event received:", { messageId, newText });
          const msg = await Message.findById(messageId);
          // Run validation
          const check = validateEditMessage({
            msg,
            userId: socket.userId,
            newText,
            username: socket.username
          });
    
          if (!check.ok) {
            // return socket.emit("editError", check.error);
            console.log("Edit message validation failed:", check.error);
            //send ack with error (as a callback )
          }
    
          // Final re-fetch (optional but safe)
          const freshMsg = await Message.findById(messageId);
          if (!freshMsg || freshMsg.isDeletedForEveryone) {
            // return socket.emit("editError", "Message no longer available.");
            console.log("Edit message validation failed:", check.error);
            //send ack with error (as a callback )
          }
    
          // Save update
          freshMsg.text = newText;
          freshMsg.isEdited = true;
          await freshMsg.save();
          const payload = {
            username: freshMsg.sender,
            messageId: freshMsg._id,
            newText: freshMsg.text,
            isEdited: freshMsg.isEdited,
            editedAt: freshMsg.editedAt,
          };
    
           await updateLastMessage(freshMsg.sender, freshMsg.receiver, newText,freshMsg._id, true);
          io.to(msg.receiver).emit("messageUpdated", payload);
    
        } catch (error) {
          console.log(error);
          socket.emit("editError", "Internal error.");
        }
  });
}
