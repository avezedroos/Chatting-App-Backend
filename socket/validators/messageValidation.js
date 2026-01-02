

/**
 * Validate send-message payload
 */
export function validateSendMessage(data) {
  if (!data) return "Payload is missing";

  const { sender, receiver, text, type } = data;

  if (!sender) return "Sender is required";
  if (!receiver) return "Receiver is required";

  if (type === "text" && (!text || !text.trim())) {
    return "Message text is required";
  }

  return null; // ✅ valid
}

/**
 * Validate message-received payload
 */
export function validateMessageReceived(payload) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return "Payload must be a non-empty array";
  }

  for (const item of payload) {
    if (!item.Sender) return "Sender missing in payload";
    
  }

  return null;
}

/**
 * Validate mark-read payload
 */
export function validateMarkRead({ sender, receiver, messageIds }) {
  if (!sender || !receiver) return "Sender and receiver are required";

  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return "messageIds must be a non-empty array";
  }

  return null;
}
