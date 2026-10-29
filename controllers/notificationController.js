
import DeviceToken from '../models/DeviceToken.js';

export const registerDeviceToken = async (req, res) => {
  try {
    const { token, platform } = req.body;

    if (!token || platform !== 'android') {
      return res.status(400).json({
        message: 'A valid Android device token is required.',
      });
    }

    await DeviceToken.findOneAndUpdate(
      { token },
      {
        $set: {
          userId: req.user.username,
          platform: 'android',
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    return res.status(200).json({
      message: 'Android device registered.',
    });
  } catch (error) {
    console.error('Device registration failed:', error);

    return res.status(500).json({
      message: 'Failed to register device.',
    });
  }
};
