
import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { updatePinnedConnections } from '../controllers/userSettingsControllers/pinnedConnectionController.js';


const router = express.Router();
router.put('/pinConnectionToggle', verifyToken, updatePinnedConnections);

export default router;
