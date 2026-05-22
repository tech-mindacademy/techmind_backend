import Enrollment from "../models/Enrollment.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { fillCertificate } from "../utils/fillCertificate.js";

// @route  GET /api/enrollments/:courseId/certificate
// @access Student
export const downloadCertificate = asyncHandler(async (req, res, next) => {
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: req.params.courseId,
  }).populate({
    path: "course",
    select: "title",
  });

  if (!enrollment) {
    return next(new AppError("You are not enrolled in this course.", 404));
  }

  if (!enrollment.certificateIssued) {
    return next(new AppError("Certificate has not been issued for this enrollment.", 403));
  }

  const pdfBytes = await fillCertificate(enrollment, req.user);

  const safeName = req.user.name.replace(/\s+/g, "_");
  res.set("Content-Type", "application/pdf");
  res.set("Content-Disposition", `attachment; filename="${safeName}_certificate.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

// @route  GET /api/enrollments/my-certificates
// @access Student
export const getMyCertificates = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({
    student: req.user._id,
    certificateIssued: true,
  })
    .populate({
      path: "course",
      select: "title slug thumbnail creator stats.totalLessons stats.totalDuration",
      populate: { path: "creator", select: "name avatar" },
    })
    .sort({ certificateIssuedAt: -1 });

  res.status(200).json({ success: true, enrollments });
});