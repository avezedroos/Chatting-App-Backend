// utils/validateEditMessage.js

const ONE_HOUR = 60 * 60 * 1000;

export function validateEditMessage({ msg, userId, newText, username}) {
  // 1. Message exists
  if (!msg) {
    return { ok: false, error: "Message does not exist." };
  }

  // 2. Sender must match
  if (msg.sender !== username) {
    return { ok: false, error: "You cannot edit this message." };
  }

  // 3. Time limit < 1 hour
  if (Date.now() - msg.createdAt > ONE_HOUR) {
    return { ok: false, error: "Edit time expired." };
  }

  // 4. Not deleted
  if (msg.isDeletedForEveryone) {
    return { ok: false, error: "Message is deleted." };
  }

  // 5. Content validity (basic)
  if (!newText || !newText.trim()) {
    return { ok: false, error: "Message cannot be empty." };
  }

  if (newText.trim() === msg.text) {
    return { ok: false, error: "Nothing changed." };
  }

  if (newText.length > 2000) {
    return { ok: false, error: "Message is too long." };
  }

  return { ok: true };
}
