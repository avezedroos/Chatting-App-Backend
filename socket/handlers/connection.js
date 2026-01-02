import User from "../../models/User.js";
import onlineUsers from "../onlineUsers.js";
import {
  getAcceptedConnectionUsernames,
  getConnectionUsernames
} from "../../utility/getConnectionList.js";

export default async function registerConnectionHandlers(io, socket) {
  const username = socket.username;

  socket.data.acceptedconnectionlist =
    await getAcceptedConnectionUsernames(username);

  const connectionlist = await getConnectionUsernames(
    socket.data.acceptedconnectionlist,
    onlineUsers
  );
  console.log(`Socket connected: ${username} (${socket.id})`);

  socket.join(username);
  onlineUsers.set(username, socket.id);

  await User.findOneAndUpdate(
    { username },
    { $set: { "onlineStatus.online": true, "onlineStatus.lastSeen": null } }
  );

  try {
    // console.log("connectionlist", connectionlist)
    if (connectionlist.length > 0) {
      
      io.to(connectionlist).emit("user-online", {
        payload: username
      });
    }
    io.to(username).emit("user-online", {
      payload: connectionlist
    })


  } catch (error) {
    console.log(error)
  }


  // 🔌 Disconnect
  socket.on("disconnect", async () => {
    const timestamp = new Date();
     console.log(`Socket disconnected: ${username} (${socket.id})`);
    onlineUsers.delete(username);

    await User.findOneAndUpdate(
      { username },
      { $set: { "onlineStatus.online": false, "onlineStatus.lastSeen": timestamp } }
    );

    const list = await getConnectionUsernames(
      socket.data.acceptedconnectionlist,
      onlineUsers
    );

    io.to(list).emit("user-offline", {
      payload: { username, lastseen: timestamp },
    });
  });
}
