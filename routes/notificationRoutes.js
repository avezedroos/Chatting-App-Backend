
import express from 'express';
// import authMiddleware from '../middleware/authMiddleware.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { registerDeviceToken } from '../controllers/notificationController.js';

const router = express.Router();

router.post('/register', verifyToken, registerDeviceToken);

export default router;
