
import mongoose from "mongoose";

const MAX_PINS = 3;

const handlePinConnection = (existingIds = [], incomingIds = []) => {
  // 1. Validate existing IDs array
  if (!Array.isArray(existingIds)) {
    return {
      ids: [],
      error: "INVALID_EXISTING_IDS",
    };
  }

  // 2. Validate incoming IDs array
  if (!Array.isArray(incomingIds)) {
    return {
      ids: existingIds,
      error: "INVALID_SELECTION",
    };
  }

  // 3. Prevent empty selection
  if (incomingIds.length === 0) {
    return {
      ids: existingIds,
      error: "NO_SELECTION",
    };
  }

  // 4. Validate MongoDB ObjectIds
  const isValidObjectId = (id) => {
    return (
      typeof id === "string" &&
      mongoose.Types.ObjectId.isValid(id) &&
      new mongoose.Types.ObjectId(id).toString() === id.toLowerCase()
    );
  };

  // 5. Validate all incoming IDs
  if (!incomingIds.every(isValidObjectId)) {
    return {
      ids: existingIds,
      error: "INVALID_CONNECTION_ID",
    };
  }

  // 6. Validate existing IDs
  if (!existingIds.every(isValidObjectId)) {
    return {
      ids: existingIds,
      error: "INVALID_EXISTING_ID",
    };
  }

  // 7. Remove duplicate IDs
  const uniqueIncoming = [
    ...new Set(incomingIds.map(id => id.toLowerCase())),
  ];

  const uniqueExisting = [
    ...new Set(existingIds.map(id => id.toLowerCase())),
  ];

  // 8. Maximum incoming selection validation
  if (uniqueIncoming.length > MAX_PINS) {
    return {
      ids: existingIds,
      error: "MAX_SELECTION_EXCEEDED",
    };
  }

  // 9. Separate already pinned and new IDs
  const alreadyPinned = uniqueIncoming.filter(id =>
    uniqueExisting.includes(id)
  );
console.log("alreadyPinned",alreadyPinned)
  const newIds = uniqueIncoming.filter(id =>
    !uniqueExisting.includes(id)
  );

  // 10. Unpin existing connections
  // If all selected IDs are already pinned, remove them
  if (newIds.length === 0) {
    return {
      ids: uniqueExisting.filter(id =>
        !alreadyPinned.includes(id)
      ),
      error: null,
    };
  }

  // 11. Check maximum total pin limit
  if (uniqueExisting.length + newIds.length > MAX_PINS) {
    return {
      ids: existingIds,
      error: "PIN_LIMIT_REACHED",
    };
  }

  // 12. Add new connections at the beginning
  return {
    ids: [...newIds, ...uniqueExisting],
    error: null,
  };
};

export default handlePinConnection;
