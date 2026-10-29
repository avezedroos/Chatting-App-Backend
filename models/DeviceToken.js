
import mongoose from 'mongoose';

const deviceTokenSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    platform: {
      type: String,
      enum: ['android'],
      default: 'android',
    },
  },
  { timestamps: true }
);

export default mongoose.model('DeviceToken', deviceTokenSchema);
