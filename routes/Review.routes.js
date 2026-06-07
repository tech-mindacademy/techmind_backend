import express from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.middleware.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";
import {
  createReview,
  getMyReviews,
  updateReview,
  deleteReview,
  getFeaturedReviews,
  getCourseReviews,
  getPendingReviews,   // ← add
  approveReview,       // ← add
} from "../controllers/Review.controller.js";

const router = express.Router();

// ─── Validation ───────────────────────────────────────────────────────────────
const reviewRules = [
  body("reviewType")
    .isIn(["course", "platform", "internship"])
    .withMessage("reviewType must be course, platform, or internship"),
  body("rating")
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ max: 100 })
    .withMessage("Title cannot exceed 100 characters"),
  body("body")
    .trim()
    .notEmpty()
    .withMessage("Review body is required")
    .isLength({ max: 1000 })
    .withMessage("Review cannot exceed 1000 characters"),
];

const updateRules = [
  body("rating")
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),
  body("title")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Title cannot exceed 100 characters"),
  body("body")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Review cannot exceed 1000 characters"),
];

// ─── Public ───────────────────────────────────────────────────────────────────
router.get("/featured", getFeaturedReviews);
router.get("/course/:courseId", getCourseReviews);

// ─── Private (any logged-in user) ────────────────────────────────────────────
router.use(protect);

router.get("/my", getMyReviews);
router.post("/", reviewRules, validate, createReview);
router.put("/:id", updateRules, validate, updateReview);
router.delete("/:id", deleteReview);
router.get(
  "/admin/pending",
  protect,
  authorizeRoles("admin"),
  getPendingReviews
);

router.patch(
  "/:id/approve",
  protect,
  authorizeRoles("admin"),
  approveReview
);

export default router;