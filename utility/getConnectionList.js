// controllers/userController.js

import User from "../models/User.js";

export  const getConnectionUsernames = async (userId, onlineUsers) => {
  try {
    // Find user
    const user = await User.findOne({ username: userId });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Filter: Only accepted connections
    const acceptedConnections = user.connections.filter(
      (conn) => conn.status === "accepted"
    );
    const allMyConnections = acceptedConnections.map((conn) => conn.username);
    // const allOnlineUsers = Array.from(onlineUsers.keys());
const allOnlineUsers = new Set(onlineUsers.keys());
// const onlineConnections = 


    // const intersection = allMyConnections.filter((item) => allOnlineUsers.has(item));
    // console.log(allMyConnections,allOnlineUsers,onlineConnections)
    // console.log(typeof allMyConnections,typeof allOnlineUsers)
    



    return allMyConnections.filter(u => allOnlineUsers.has(u));
    ;

  } catch (err) {
    console.error("Error fetching usernames:", err);
    // res.status(500).json({ message: "Server error", error: err.message });
    return{ success: false}
  }
};
