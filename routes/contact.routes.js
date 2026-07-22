import express from "express";
import { sendContactMessage } from "../controllers/contact.controller.js";
import { formLimiter } from "../middleware/rateLimiters.js";


const router = express.Router();

router.post("/", formLimiter, sendContactMessage);

export default router; // ← this line is missing