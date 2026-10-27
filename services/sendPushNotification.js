
import admin from '../config/firebaseAdmin.js';
import DeviceToken from '../models/DeviceToken.js';

export async function sendPushNotification({
  recipientId,
  senderName,
  messageText,
  senderId,
}) {
  const devices = await DeviceToken.find({
    userId: recipientId,
    platform: 'android',
  }).select('token');

  if (!devices.length) return;

  const results = await Promise.allSettled(
    devices.map(device =>
      admin.messaging().send({
        token: device.token,

        notification: {
          title: senderName || 'New message',
          body: messageText || 'You received a message.',
        },

        data: {
          type: 'chat_message',
          senderId: String(senderId),
        },

        android: {
          priority: 'high',
        },
      })
    )
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    if (result.status === 'rejected') {
      console.error('FCM send failed:', result.reason);
    }
  }
}
