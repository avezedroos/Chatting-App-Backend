// controllers/userController.js

import User from "../models/User.js";

// export const getConnectionUsernames = async (userId, onlineUsers) => {
//   try {
//     // Find user
//     const user = await User.findOne({ username: userId });

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // Filter: Only accepted connections
//     const acceptedConnections = user.connections.filter(
//       (conn) => conn.status === "accepted"
//     );
//     const allMyConnections = acceptedConnections.map((conn) => conn.username);
//     const allOnlineUsers = new Set(onlineUsers.keys());
//     return allMyConnections.filter(u => allOnlineUsers.has(u));
//     ;

//   } catch (err) {
//     console.error("Error fetching usernames:", err);
//     // res.status(500).json({ message: "Server error", error: err.message });
//     return { success: false }
//   }
// };


// import User from "../models/User.js";

/**
 * 1) Get ALL accepted connections (only usernames)
 * Does NOT check online status
 */
export const getAcceptedConnectionUsernames = async (username) => {
  try {
    const user = await User.findOne({ username });

    if (!user) return [];

    const acceptedConnections = user.connections.filter(
      (conn) => conn.status === "accepted"
    );

    // return list of usernames
    return acceptedConnections.map((conn) => conn.username);

  } catch (err) {
    console.error("Error fetching accepted connections:", err);
    return [];
  }
};


/**
 * 2) Get ONLY online accepted connections
 * Uses the above function + onlineUsers Map
 */
export const getConnectionUsernames = async (acceptedUsers, onlineUsers) => {
  try {
    // 1) Get all accepted usernames
    // const acceptedUsers = await getAcceptedConnectionUsernames(username);

    // 2) Convert onlineUsers map to a Set for quick lookup
    const onlineSet = new Set(onlineUsers.keys());

    // 3) Return only those that are online
    return acceptedUsers.filter((u) => onlineSet.has(u));

  } catch (err) {
    console.error("Error fetching online connections:", err);
    return [];
  }
};
