import express from "express";
import {
  createLiveClass,
  getAllLiveClasses,
  getLiveClassById,
  updateLiveClass,
  cancelLiveClass,
  deleteLiveClass,
  startLiveClass,
  endLiveClass,
  joinLiveClass,
  leaveLiveClass,
  getAttendanceForClass,
  getMyLiveClasses,
} from "../controllers/Liveclass.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";
import { requireInternAccess } from "../middleware/Internaccess.middleware.js";
import { authLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

// ── Intern Portal — must come before "/:id" so it isn't swallowed by it ────
router.get("/my-classes", protect, requireInternAccess, getMyLiveClasses);

// ── Admin CRUD ───────────────────────────────────────────────────────────────
router.post("/", protect, authorizeRoles("admin"), createLiveClass);
router.get("/", protect, authorizeRoles("admin"), getAllLiveClasses);
router.put("/:id", protect, authorizeRoles("admin"), updateLiveClass);
router.post("/:id/cancel", protect, authorizeRoles("admin"), cancelLiveClass);
router.delete("/:id", protect, authorizeRoles("admin"), deleteLiveClass);
router.get("/:id/attendance", protect, authorizeRoles("admin"), getAttendanceForClass);

// ── Lifecycle (host = admin) ─────────────────────────────────────────────────
router.post("/:id/start", protect, authorizeRoles("admin"), startLiveClass);
router.post("/:id/end", protect, authorizeRoles("admin"), endLiveClass);

// ── Join / leave — open to any authenticated user; eligibility (payment,
// batch, shortlisted status) is verified INSIDE the controller per request,
// not by role, since both admins (host) and students (participants) use it.
router.post("/:id/join", protect, authLimiter, joinLiveClass);
router.post("/:id/leave", protect, leaveLiveClass);

// ── Detail — admin or an eligible participant (checked in controller) ──────
router.get("/:id", protect, getLiveClassById);

export default router;