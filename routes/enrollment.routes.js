import express from "express";
import {
  getMyEnrollments,
  getEnrollment,
  markLessonComplete,
  updateLastAccessed,
  getCourseStudents,
  getAdminCoursePreview
} from "../controllers/enrollment.controller.js";
import { downloadCertificate, getMyCertificates } from "../controllers/certiicate1.controller.js";

import {
  protect,
  authorizeRoles,
  requireVerified,
} from "../middleware/auth.middleware.js";

const router = express.Router();

// ───────── STUDENT ROUTES ─────────
router.get(
  "/my",
  protect,
  authorizeRoles("student"),
  requireVerified,
  getMyEnrollments
);

router.get(
  "/my-certificates",
  protect,
  authorizeRoles("student"),
  requireVerified,
  getMyCertificates
);

router.get("/:courseId/certificate", protect, authorizeRoles("student"), requireVerified, downloadCertificate);

router.get(
  "/:courseId/admin-preview",
  protect,
  authorizeRoles("admin"),
  getAdminCoursePreview   // new controller below
);

router.get(
  "/:courseId",
  protect,
  authorizeRoles("student"),
  requireVerified,
  getEnrollment
);

router.patch(
  "/:courseId/complete-lesson",
  protect,
  authorizeRoles("student"),
  requireVerified,
  markLessonComplete
);

router.patch(
  "/:courseId/last-accessed",
  protect,
  authorizeRoles("student"),
  requireVerified,
  updateLastAccessed
);

// ───────── CREATOR / ADMIN ROUTES ─────────
router.get(
  "/:courseId/students",
  protect,
  authorizeRoles("creator", "admin"),
  getCourseStudents
);

export default router;