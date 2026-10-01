// import express from "express";
// import {
//   getAllInternships,
//   getInternshipById,
//   createInternship,
//   updateInternship,
//   deleteInternship,
//   getAllInternshipsAdmin,
//   getApplicationsForInternship,
//   getAllApplications,
//   applyForInternship,
//   applyStatic,
// } from "../controllers/internship.controller.js";
// import { protect, authorizeRoles } from "../middleware/auth.middleware.js";
// import { updateApplicationStatus } from "../controllers/internship.controller.js";
// import { formLimiter } from "../middleware/rateLimiters.js";

// const router = express.Router();

// // ── Public ──────────────────────────────────────────────────────────────────
// router.post("/apply-static", formLimiter, applyStatic);
// router.get("/", getAllInternships);
// router.get("/:id", getInternshipById);
// // router.post("/apply-static", applyStatic);
// router.post("/:id/apply", formLimiter, applyForInternship);

// // ── Admin ────────────────────────────────────────────────────────────────────
// router.get("/admin/all", protect, authorizeRoles("admin"), getAllInternshipsAdmin);
// router.get("/admin/applications", protect, authorizeRoles("admin"), getAllApplications);
// router.get("/:id/applications", protect, authorizeRoles("admin"), getApplicationsForInternship);
// router.post("/", protect, authorizeRoles("admin"), createInternship);
// router.put("/:id", protect, authorizeRoles("admin"), updateInternship);
// router.delete("/:id", protect, authorizeRoles("admin"), deleteInternship);


// // Add this with the other admin routes
// router.put(
//   "/applications/:appId/status",
//   protect,
//   authorizeRoles("admin"),
//   updateApplicationStatus
// );

// export default router;
import express from "express";
import {
  getAllInternships,
  getInternshipById,
  createInternship,
  updateInternship,
  deleteInternship,
  getAllInternshipsAdmin,
  getApplicationsForInternship,
  getAllApplications,
  applyForInternship,
  applyStatic,
  updateApplicationStatus,
  getMyInternshipAccess,
} from "../controllers/internship.controller.js";
import {
  createInternshipCheckout,
  verifyInternshipPayment,
} from "../controllers/Internshippayment.conroller.js";
import { protect, optionalAuth, authorizeRoles } from "../middleware/auth.middleware.js";
import { formLimiter, authLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

// ── Public (optionally authenticated — links the application to an account
// when the applicant happens to be logged in, which is required for any
// future Live Class / Intern Portal access) ─────────────────────────────────
router.post("/apply-static", formLimiter, optionalAuth, applyStatic);
router.get("/", getAllInternships);
router.post("/:id/apply", formLimiter, optionalAuth, applyForInternship);

// ── Private — my access (drives Apply→Join button + Intern Portal gate) ────
router.get("/my-access", protect, getMyInternshipAccess);

// ── Private — application-fee payment (only the applicant's own account) ──
router.post(
  "/applications/:appId/checkout",
  protect,
  authLimiter,
  createInternshipCheckout
);
router.post(
  "/applications/:appId/verify-payment",
  protect,
  authLimiter,
  verifyInternshipPayment
);

// ── Admin ────────────────────────────────────────────────────────────────────
router.get("/admin/all", protect, authorizeRoles("admin"), getAllInternshipsAdmin);
router.get("/admin/applications", protect, authorizeRoles("admin"), getAllApplications);
router.get("/:id/applications", protect, authorizeRoles("admin"), getApplicationsForInternship);
router.post("/", protect, authorizeRoles("admin"), createInternship);
router.put("/:id", protect, authorizeRoles("admin"), updateInternship);
router.delete("/:id", protect, authorizeRoles("admin"), deleteInternship);

router.put(
  "/applications/:appId/status",
  protect,
  authorizeRoles("admin"),
  updateApplicationStatus
);

// ── Public — internship detail (must come after the more specific
// literal-prefix routes above so "/my-access", "/admin/all", etc. never
// get swallowed by the ":id" param route) ───────────────────────────────────
router.get("/:id", getInternshipById);

export default router;