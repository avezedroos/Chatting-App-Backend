
import mongoose from "mongoose";
import User from "../../models/User.js";
import handlePinConnection from "../../utility/handlePinConnection.js";

// Pin / Unpin connections
export const updatePinnedConnections = async (req, res) => {
  try {
    const userId = req.userId;
    const { incomingIds } = req.body;

    // 2. Find authenticated user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 3. Get existing pinned connections
    const existingIds =
      user.settings?.connection?.pinnedConnections?.map(String) || [];

    // 4. Run pin/unpin validation and business logic
    const result = handlePinConnection(existingIds, incomingIds);
    console.log("result",result)

    if (result.error) {
      const statusCodes = {
        NO_SELECTION: 400,
        INVALID_SELECTION: 400,
        INVALID_EXISTING_IDS: 500,
        INVALID_CONNECTION_ID: 400,
        INVALID_EXISTING_ID: 500,
        MAX_SELECTION_EXCEEDED: 400,
        PIN_LIMIT_REACHED: 409,
      };

      return res.status(statusCodes[result.error] || 400).json({
        success: false,
        message: result.error,
        pinnedConnections: existingIds,
      });
    }

    // 5. Verify that every incoming ID belongs to this user's connections
    const connectedUserIds = new Set(
      (user.connections || []).map(connection =>
        String(connection.userId).toLowerCase()
      )
    );

    const unauthorizedIds = incomingIds.filter(
      id => !connectedUserIds.has(id.toLowerCase())
    );

    if (unauthorizedIds.length > 0) {
      return res.status(403).json({
        success: false,
        error: "INVALID_CONNECTION",
        message: "One or more users are not your connections",
      });
    }

    // 6. Save updated pins with optimistic version checking
    const updateResult = await User.updateOne(
      {
        _id: user._id,
        __v: user.__v,
      },
      {
        $set: {
          "settings.connection.pinnedConnections": result.ids,
        },
        $inc: {
          __v: 1,
        },
      }
    );

    console.log("updateResult",updateResult)

    
    // 7. Handle simultaneous update conflict
    if (updateResult.matchedCount === 0) {
      return res.status(409).json({
        success: false,
        error: "CONCURRENT_UPDATE",
        message: "Your data changed. Please try again.",
      });
    }

    // 8. Success response
    return res.status(200).json({
      success: true,
      message: "Pinned connections updated successfully",
      pinnedConnections: result.ids,
    });

  } catch (error) {
    console.error("Update pinned connections error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
