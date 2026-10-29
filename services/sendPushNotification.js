
import admin from '../config/firebaseAdmin.js';
import DeviceToken from '../models/DeviceToken.js';

export async function sendPushNotification({
  recipientUsername,
  senderName,
  messageText,
}) {
  const devices = await DeviceToken.find({
   username: recipientUsername,
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
          senderName: senderName,
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
