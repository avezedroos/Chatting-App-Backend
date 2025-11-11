import express from "express";
import { addConnection, getConnectionRequests, updateConnectionStatus } from "../controllers/connectionController.js";

const router = express.Router();

// POST /api/connections/add
router.post("/add", addConnection);
router.post("/getrequests",getConnectionRequests);
router.post("/updateconnection",updateConnectionStatus);


export default router;
