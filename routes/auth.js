import express from "express";
import { registerUser, loginUser, verifyUser} from "../controllers/authController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/verify", verifyToken, verifyUser);

export default router;
