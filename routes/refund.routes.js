import express from "express";
import {
  requestRefund,
  getMyRefunds,
  cancelRefund,
  getAllRefunds,
  getRefundById,
  resolveRefund,
  getRefundStats,
} from "../controllers/refund.controller.js";
import { protect, authorizeRoles, requireVerified } from "../middleware/auth.middleware.js";

const router = express.Router();

// ───────── STUDENT ─────────────────────────────────────────────────────────
router.post(
  "/",
  protect,
  authorizeRoles("student"),
  requireVerified,
  requestRefund
);

router.get(
  "/my",
  protect,
  authorizeRoles("student"),
  requireVerified,
  getMyRefunds
);

router.delete(
  "/:refundId",
  protect,
  authorizeRoles("student"),
  requireVerified,
  cancelRefund
);

// ───────── ADMIN ────────────────────────────────────────────────────────────
router.get(
  "/admin/stats",
  protect,
  authorizeRoles("admin"),
  getRefundStats
);

router.get(
  "/admin",
  protect,
  authorizeRoles("admin"),
  getAllRefunds
);

router.get(
  "/admin/:refundId",
  protect,
  authorizeRoles("admin"),
  getRefundById
);

router.patch(
  "/admin/:refundId/resolve",
  protect,
  authorizeRoles("admin"),
  resolveRefund
);

export default router;