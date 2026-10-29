
import { getMessaging } from 'firebase-admin/messaging';
import firebaseApp from '../config/firebaseAdmin.js';
import DeviceToken from '../models/DeviceToken.js';

export async function sendPushNotification({
  recipientUsername,
  senderName,
  messageText,
}) {
  try {
    const devices = await DeviceToken.find({
      username: recipientUsername,
      platform: 'android',
    }).select('token');

    if (!devices.length) {
      console.log('No Android devices found:', recipientUsername);
      return;
    }

    const results = await Promise.allSettled(
      devices.map(device =>
        getMessaging(firebaseApp).send({
          token: device.token,

          notification: {
            title: senderName || 'New message',
            body: messageText || 'You received a message.',
          },

          data: {
            type: 'chat_message',
            senderName: String(senderName || ''),
          },

          android: {
            priority: 'high',
          },
        })
      )
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        console.log('Push notification sent:', result.value);
      } else {
        console.error('FCM send failed:', result.reason);
      }
    }
  } catch (error) {
    console.error('Push notification failed:', error);
  }
}
