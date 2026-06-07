import Course from "../models/Course.model.js";
import Enrollment from "../models/Enrollment.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { notifyEnrollment } from "../utils/notifications.utils.js";
const FINAL_SECTION_PATTERN = /final\s*(quiz|assessment|exam|test)/i;

// ─── Helper: recalculate progress against current course structure ─────────────
// Strips out completedLessons that no longer exist in the course,
// then recomputes progressPercent. Mutates the enrollment doc in-place.
// Call this any time the course structure may have changed.
const syncProgress = (enrollment, course) => {
  const validLessonIds = new Set(
    course.sections.flatMap((sec) => sec.lessons.map((l) => l._id.toString())),
  );

  const totalLessons = validLessonIds.size;

  enrollment.completedLessons = enrollment.completedLessons.filter((cl) =>
    validLessonIds.has(cl.lesson.toString()),
  );

  enrollment.progressPercent =
    totalLessons > 0
      ? Math.round((enrollment.completedLessons.length / totalLessons) * 100)
      : 0;

  const hasFinalQuizSection = course.sections.some((sec) =>
    FINAL_SECTION_PATTERN.test(sec.title),
  );

  // If course has a final quiz section, completion is ONLY allowed via quiz pass.
  // So if certificate hasn't been issued yet, never let isCompleted be true.
  if (hasFinalQuizSection && !enrollment.certificateIssued) {
    enrollment.isCompleted = false;
    enrollment.completedAt = null;
  }

  // For non-final-quiz courses: un-complete if progress dropped below 100
  if (
    !hasFinalQuizSection &&
    enrollment.progressPercent < 100 &&
    !enrollment.certificateIssued
  ) {
    enrollment.isCompleted = false;
    enrollment.completedAt = null;
  }
};

// @route  POST /api/courses/:courseId/enroll
// @access Student (free courses only — paid handled by Stripe)
export const enrollFree = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId).populate(
    "creator",
    "name email",
  );
  if (!course) return next(new AppError("Course not found.", 404));
  if (!course.isPublished)
    return next(new AppError("Course is not available.", 404));

  if (!course.isFree && course.price > 0) {
    return next(
      new AppError(
        "This is a paid course. Use the checkout flow to enroll.",
        400,
      ),
    );
  }

  const existing = await Enrollment.findOne({
    student: req.user._id,
    course: course._id,
  });
  if (existing) {
    return res.status(200).json({
      success: true,
      message: "Already enrolled.",
      enrollment: existing,
    });
  }

  const enrollment = await Enrollment.create({
    student: req.user._id,
    course: course._id,
    amountPaid: 0,
    paymentMethod: "free",
  });

  await Course.findByIdAndUpdate(course._id, {
    $inc: { "stats.totalStudents": 1 },
  });

  const courseForNotify = {
    _id: course._id,
    title: course.title,
    creatorEmail: course.creator?.email,
    creatorName: course.creator?.name,
  };
  notifyEnrollment(req.user, courseForNotify);

  res
    .status(201)
    .json({ success: true, message: "Enrolled successfully.", enrollment });
});

// @route  GET /api/enrollments/my
// @access Student
export const getMyEnrollments = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({ student: req.user._id })
    .populate({
      path: "course",
      select:
        "title slug thumbnail creator stats.totalLessons stats.totalDuration category level isFree price sections",
      populate: { path: "creator", select: "name avatar" },
    })
    .sort({ createdAt: -1 });

  const savePromises = [];
  for (const enrollment of enrollments) {
    if (!enrollment.course) continue;
    const beforeProgress = enrollment.progressPercent;
    const beforeCompleted = enrollment.isCompleted;
    const beforeCert = enrollment.certificateIssued;

    syncProgress(enrollment, enrollment.course);

    if (
      enrollment.progressPercent !== beforeProgress ||
      enrollment.isCompleted !== beforeCompleted ||
      enrollment.certificateIssued !== beforeCert
    ) {
      savePromises.push(enrollment.save());
    }
  }
  if (savePromises.length) await Promise.all(savePromises);

  res.status(200).json({ success: true, enrollments });
});

// @route  GET /api/enrollments/:courseId
// @access Student
// Also heals stale progress on every fetch so the UI never shows > 100%
export const getEnrollment = asyncHandler(async (req, res, next) => {
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: req.params.courseId,
  });
  if (!enrollment)
    return next(new AppError("Not enrolled in this course.", 404));

  const course = await Course.findById(req.params.courseId).select("sections");
  if (course) {
    const beforeProgress = enrollment.progressPercent;
    const beforeCompleted = enrollment.isCompleted;
    const beforeCert = enrollment.certificateIssued;

    syncProgress(enrollment, course);

    if (
      enrollment.progressPercent !== beforeProgress ||
      enrollment.isCompleted !== beforeCompleted ||
      enrollment.certificateIssued !== beforeCert
    ) {
      await enrollment.save();
    }
  }

  res.status(200).json({ success: true, enrollment });
});

// @route  PATCH /api/enrollments/:courseId/complete-lesson
// @access Student
export const markLessonComplete = asyncHandler(async (req, res, next) => {
  const { lessonId } = req.body;
  if (!lessonId) return next(new AppError("lessonId is required.", 400));

  // Load course first so we can validate the lesson exists and sync progress
  const course = await Course.findById(req.params.courseId).select(
    "sections title",
  );
  if (!course) return next(new AppError("Course not found.", 404));

  // Verify the lesson actually exists in the current course structure
  const validLessonIds = new Set(
    course.sections.flatMap((sec) => sec.lessons.map((l) => l._id.toString())),
  );
  if (!validLessonIds.has(lessonId.toString())) {
    return next(new AppError("Lesson not found in this course.", 404));
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: req.params.courseId,
  });
  if (!enrollment)
    return next(new AppError("Not enrolled in this course.", 404));

  // Sync first — prune any stale completed lessons from deleted content
  syncProgress(enrollment, course);

  const alreadyDone = enrollment.completedLessons.some(
    (cl) => cl.lesson.toString() === lessonId.toString(),
  );

  if (!alreadyDone) {
    enrollment.completedLessons.push({ lesson: lessonId });
    enrollment.lastAccessedLesson = lessonId;

    // Recalculate against the validated total (syncProgress already pruned the list)
    const totalLessons = validLessonIds.size;
    enrollment.progressPercent =
      totalLessons > 0
        ? Math.round((enrollment.completedLessons.length / totalLessons) * 100)
        : 0;

    // Cap at 100 defensively
    if (enrollment.progressPercent > 100) enrollment.progressPercent = 100;
    // WITH THIS:
    const hasFinalQuizSection = course.sections.some((sec) =>
      FINAL_SECTION_PATTERN.test(sec.title),
    );

    if (
      enrollment.progressPercent === 100 &&
      !enrollment.isCompleted &&
      !hasFinalQuizSection // ← this MUST be here
    ) {
      enrollment.isCompleted = true;
      enrollment.completedAt = new Date();
      enrollment.certificateIssued = true;
      enrollment.certificateIssuedAt = new Date();
    }

    // if (enrollment.progressPercent === 100 && !enrollment.isCompleted) {
    //   enrollment.isCompleted = true;
    //   enrollment.completedAt = new Date();
    // }
  }

  await enrollment.save();

  res.status(200).json({
    success: true,
    message: alreadyDone ? "Already completed." : "Lesson marked complete.",
    progressPercent: enrollment.progressPercent,
    isCompleted: enrollment.isCompleted,
    certificateIssued: enrollment.certificateIssued,
  });
});

// @route  PATCH /api/enrollments/:courseId/last-accessed
// @access Student
export const updateLastAccessed = asyncHandler(async (req, res, next) => {
  const { lessonId } = req.body;
  if (!lessonId) return next(new AppError("lessonId is required.", 400));

  const enrollment = await Enrollment.findOneAndUpdate(
    { student: req.user._id, course: req.params.courseId },
    { lastAccessedLesson: lessonId },
    { new: true },
  );
  if (!enrollment) return next(new AppError("Not enrolled.", 404));
  res.status(200).json({ success: true });
});

// @route  GET /api/courses/:courseId/enrollments
// @access Creator
export const getCourseEnrollments = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  if (
    course.creator.toString() !== req.user._id.toString() &&
    req.user.role !== "admin"
  ) {
    return next(new AppError("Not authorised.", 403));
  }

  const enrollments = await Enrollment.find({ course: course._id })
    .populate("student", "name email avatar")
    .sort({ createdAt: -1 });

  res
    .status(200)
    .json({ success: true, count: enrollments.length, enrollments });
});

// @route  GET /api/enrollments/:courseId/students
// @access Creator (own course) | Admin
export const getCourseStudents = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId).select(
    "creator title",
  );
  if (!course) return next(new AppError("Course not found.", 404));
  if (
    req.user.role !== "admin" &&
    course.creator.toString() !== req.user._id.toString()
  ) {
    return next(new AppError("Not authorized.", 403));
  }

  const enrollments = await Enrollment.find({ course: req.params.courseId })
    .populate("student", "name email avatar")
    .select(
      "student progressPercent isCompleted certificateIssued certificateIssuedAt completedAt createdAt",
    )
    .sort({ createdAt: -1 });

  res
    .status(200)
    .json({ success: true, count: enrollments.length, enrollments });
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
      select:
        "title slug thumbnail creator stats.totalLessons stats.totalDuration",
      populate: { path: "creator", select: "name avatar" },
    })
    .sort({ certificateIssuedAt: -1 });

  res.status(200).json({ success: true, enrollments });
});
