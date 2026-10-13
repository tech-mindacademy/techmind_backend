import express from "express";
import { body } from "express-validator";
import {
  apply,
  getMyAccess,
  listApplications,
  getApplication,
  updateStatus,
  sendPaymentLink,
  sendCredentials,
} from "../controllers/industrialTraining.controller.js";
import { protect, optionalAuth, authorizeRoles } from "../middleware/auth.middleware.js";
import { formLimiter } from "../middleware/rateLimiters.js";
import { validate } from "../middleware/validate.middleware.js";
import { DOMAINS, DURATIONS } from "../models/IndustrialTrainingApplication.model.js";

const router = express.Router();
const admin = [protect, authorizeRoles("admin")];

const required = (field, label, max = 120) =>
  body(field)
    .trim()
    .notEmpty().withMessage(`${label} is required`)
    .isLength({ max }).withMessage(`${label} is too long`);

const applyRules = [
  required("name", "Name", 80),
  body("email").trim().isEmail().withMessage("Enter a valid email"),
  body("phone").trim().matches(/^[+\d][\d\s-]{8,14}$/).withMessage("Enter a valid phone number"),
  required("college", "College"),
  required("course", "Course"),
  required("branch", "Branch"),
  required("semester", "Semester / year", 30),
  body("domain").isIn(DOMAINS).withMessage("Select a training domain"),
  body("duration").isIn(DURATIONS).withMessage("Select a training duration"),
  body("preferredStartDate").optional({ checkFalsy: true }).isISO8601().withMessage("Enter a valid start date"),
  body("resumeUrl").optional({ checkFalsy: true })
    .isURL({ require_protocol: true, protocols: ["http", "https"] }).withMessage("Resume link must be a valid URL"),
  body("linkedIn").optional({ checkFalsy: true }).isURL({ require_protocol: true }).withMessage("LinkedIn must be a valid URL"),
  body("github").optional({ checkFalsy: true }).isURL({ require_protocol: true }).withMessage("GitHub must be a valid URL"),
  body("skills").optional().isLength({ max: 300 }).withMessage("Skills is too long"),
  body("message").optional().isLength({ max: 1000 }).withMessage("Message is too long"),
];

router.post("/apply", formLimiter, optionalAuth, applyRules, validate, apply);
router.get("/my-access", protect, getMyAccess);

router.get("/applications", ...admin, listApplications);
router.get("/applications/:id", ...admin, getApplication);
router.patch("/applications/:id/status", ...admin, updateStatus);
router.post("/applications/:id/payment-link", ...admin, sendPaymentLink);
router.post("/applications/:id/send-credentials", ...admin, sendCredentials);

export default router;
