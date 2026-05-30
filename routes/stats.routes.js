// routes/statsRoutes.js
import express from "express";
import User from "../models/User.model.js";
import Course from "../models/Course.model.js";

const router = express.Router();

router.get("/public", async (req, res) => {
  try {
    const [students, creators, courses] = await Promise.all([
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "creator" }),
      Course.countDocuments({ status: "published" }),
    ]);

    res.json({ students, creators, courses });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});

export default router;