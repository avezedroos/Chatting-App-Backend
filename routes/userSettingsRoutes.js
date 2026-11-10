
import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { updatePinnedConnections } from '../controllers/userSettingsControllers/pinnedConnectionController.js';
import { blockConnection, unblockConnection } from '../controllers/userSettingsControllers/blockedConnectionController.js';


const router = express.Router();
router.put('/pinConnectionToggle', verifyToken, updatePinnedConnections);
router.patch("/block", verifyToken, blockConnection);
router.patch("/unblock", verifyToken, unblockConnection);

export default router;
