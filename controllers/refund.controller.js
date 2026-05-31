import Refund from "../models/Refund.model.js";
import Enrollment from "../models/Enrollment.model.js";
import Course from "../models/Course.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import {
  sendRefundRequestedEmailToStudent,
  sendRefundAlertEmailToAdmin,
  sendRefundApprovedEmailToStudent,
  sendRefundRejectedEmailToStudent,
} from "../utils/refundEmail.util.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MAX_PROGRESS_FOR_REFUND = 20; // cannot have completed ≥ 20% of course
const ADMIN_EMAIL = process.env.ADMIN_EMAIL; // e.g. "admin@techmindacademy.com"

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// @route  POST /api/refunds
// @access Student
export const requestRefund = asyncHandler(async (req, res, next) => {
  const { courseId, reason } = req.body;

  if (!courseId) return next(new AppError("courseId is required.", 400));
  if (!reason || !reason.trim())
    return next(new AppError("Please provide a reason for your refund request.", 400));

  // 1. Confirm enrollment exists
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId,
  });
  if (!enrollment) return next(new AppError("You are not enrolled in this course.", 404));

  // 2. Progress threshold
  if (enrollment.progressPercent >= MAX_PROGRESS_FOR_REFUND) {
    return next(
      new AppError(
        `Refund not eligible: you have completed ${enrollment.progressPercent}% of this course. Refunds are only available when progress is below ${MAX_PROGRESS_FOR_REFUND}%.`,
        400
      )
    );
  }

  // 3. Free course
  if (enrollment.amountPaid === 0) {
    return next(new AppError("Free course enrollments are not eligible for refunds.", 400));
  }

  // 4. Already completed
  if (enrollment.isCompleted) {
    return next(new AppError("Completed courses are not eligible for refunds.", 400));
  }

  // 5. No duplicate pending/approved
  const existing = await Refund.findOne({
    enrollment: enrollment._id,
    status: { $in: ["pending", "approved"] },
  });
  if (existing) {
    return next(
      new AppError(
        existing.status === "pending"
          ? "You already have a pending refund request for this course."
          : "Your refund for this course has already been approved.",
        400
      )
    );
  }

  // 6. Create refund
  const refund = await Refund.create({
    student: req.user._id,
    course: courseId,
    enrollment: enrollment._id,
    amountPaid: enrollment.amountPaid,
    paymentId: enrollment.paymentId || "",
    paymentMethod: enrollment.paymentMethod || "",
    progressPercentAtRequest: enrollment.progressPercent,
    reason: reason.trim(),
    refundAmount: enrollment.amountPaid,
  });

  await refund.populate([
    { path: "course", select: "title thumbnail" },
    { path: "student", select: "name email" },
  ]);

  // ── Emails (fire-and-forget — never block the response) ──────────────────
  const emailPayload = {
    studentEmail: req.user.email,
    studentName:  req.user.name,
    courseName:   refund.course?.title || "the course",
    courseThumbnail: refund.course?.thumbnail?.url || "",
    amountPaid:   enrollment.amountPaid,
    progressPercent: enrollment.progressPercent,
    reason:       reason.trim(),
    refundId:     refund._id.toString(),
  };

  Promise.allSettled([
    // To student — confirmation
    sendRefundRequestedEmailToStudent(emailPayload),
    // To admin — action alert
    ADMIN_EMAIL
      ? sendRefundAlertEmailToAdmin({ ...emailPayload, adminEmail: ADMIN_EMAIL })
      : Promise.resolve(),
  ]).catch(() => {}); // swallow email errors silently

  res.status(201).json({
    success: true,
    message: "Refund request submitted. We'll review it within 2 business days.",
    refund,
  });
});

// @route  GET /api/refunds/my
// @access Student
export const getMyRefunds = asyncHandler(async (req, res) => {
  const refunds = await Refund.find({ student: req.user._id })
    .populate("course", "title thumbnail slug")
    .populate("resolvedBy", "name")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, refunds });
});

// @route  DELETE /api/refunds/:refundId
// @access Student
export const cancelRefund = asyncHandler(async (req, res, next) => {
  const refund = await Refund.findOne({
    _id: req.params.refundId,
    student: req.user._id,
  });

  if (!refund) return next(new AppError("Refund request not found.", 404));
  if (refund.status !== "pending")
    return next(new AppError("Only pending requests can be cancelled.", 400));

  await refund.deleteOne();
  res.status(200).json({ success: true, message: "Refund request cancelled." });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/refunds/admin
// @access Admin
export const getAllRefunds = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const query = {};
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    query.status = status;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [refunds, total] = await Promise.all([
    Refund.find(query)
      .populate("student", "name email avatar")
      .populate("course", "title thumbnail slug price")
      .populate("resolvedBy", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Refund.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    refunds,
    pagination: {
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// @route  GET /api/refunds/admin/:refundId
// @access Admin
export const getRefundById = asyncHandler(async (req, res, next) => {
  const refund = await Refund.findById(req.params.refundId)
    .populate("student", "name email avatar")
    .populate("course", "title thumbnail slug price")
    .populate(
      "enrollment",
      "progressPercent completedLessons amountPaid paymentId paymentMethod isCompleted createdAt"
    )
    .populate("resolvedBy", "name");

  if (!refund) return next(new AppError("Refund request not found.", 404));

  res.status(200).json({ success: true, refund });
});

// @route  PATCH /api/refunds/admin/:refundId/resolve
// @access Admin
export const resolveRefund = asyncHandler(async (req, res, next) => {
  const { action, adminNote, refundAmount } = req.body;

  if (!["approve", "reject"].includes(action)) {
    return next(new AppError('action must be "approve" or "reject".', 400));
  }

  const refund = await Refund.findById(req.params.refundId);
  if (!refund) return next(new AppError("Refund request not found.", 404));
  if (refund.status !== "pending") {
    return next(new AppError("This request has already been resolved.", 400));
  }

  refund.status    = action === "approve" ? "approved" : "rejected";
  refund.adminNote = adminNote?.trim() || "";
  refund.resolvedBy = req.user._id;
  refund.resolvedAt = new Date();

  // ✅ Fix — delete enrollment + decrement student count
if (action === "approve") {
  refund.refundAmount =
    refundAmount !== undefined
      ? Math.min(Number(refundAmount), refund.amountPaid)
      : refund.amountPaid;

  // Delete the enrollment entirely
  await Enrollment.findByIdAndDelete(refund.enrollment);

  // Decrement course student count
  await Course.findByIdAndUpdate(refund.course, {
    $inc: { "stats.totalStudents": -1 },
  });
}

  await refund.save();

  // Populate for response + email
  await refund.populate([
    { path: "student", select: "name email" },
    { path: "course",  select: "title thumbnail" },
  ]);

  // ── Email the student about the decision ─────────────────────────────────
  const studentEmail = refund.student?.email;
  const studentName  = refund.student?.name;
  const courseName   = refund.course?.title || "your course";

  if (studentEmail) {
    const sharedPayload = {
      studentEmail,
      studentName,
      courseName,
      adminNote:       refund.adminNote,
      progressPercent: refund.progressPercentAtRequest,
      refundId:        refund._id.toString(),
    };

    if (action === "approve") {
      sendRefundApprovedEmailToStudent({
        ...sharedPayload,
        refundAmount:  refund.refundAmount,
        paymentMethod: refund.paymentMethod,
      }).catch(() => {});
    } else {
      sendRefundRejectedEmailToStudent(sharedPayload).catch(() => {});
    }
  }

  res.status(200).json({
    success: true,
    message: `Refund ${refund.status}.`,
    refund,
  });
});

// @route  GET /api/refunds/admin/stats
// @access Admin
export const getRefundStats = asyncHandler(async (req, res) => {
  const [pending, approved, rejected, totalRefunded] = await Promise.all([
    Refund.countDocuments({ status: "pending" }),
    Refund.countDocuments({ status: "approved" }),
    Refund.countDocuments({ status: "rejected" }),
    Refund.aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: null, total: { $sum: "$refundAmount" } } },
    ]),
  ]);

  res.status(200).json({
    success: true,
    stats: {
      pending,
      approved,
      rejected,
      totalRefunded: totalRefunded[0]?.total || 0,
    },
  });
});