import Review from "../models/Review.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";

// ─── @route  POST /api/reviews ────────────────────────────────────────────────
// @access Private (student)
export const createReview = asyncHandler(async (req, res, next) => {
  const { reviewType, course, internshipCompany, rating, title, body } = req.body;

  if (!["course", "platform", "internship"].includes(reviewType)) {
    return next(new AppError("Invalid review type.", 400));
  }

  if (reviewType === "course" && !course) {
    return next(new AppError("Course ID is required for course reviews.", 400));
  }

  if (reviewType === "internship" && !internshipCompany?.trim()) {
    return next(new AppError("Company name is required for internship reviews.", 400));
  }

  // Check for duplicate (one review per user per subject)
  const existing = await Review.findOne({
    user: req.user._id,
    reviewType,
    course: reviewType === "course" ? course : null,
  });

  if (existing) {
    return next(new AppError("You have already reviewed this.", 409));
  }

  const review = await Review.create({
    user: req.user._id,
    reviewType,
    course: reviewType === "course" ? course : null,
    internshipCompany: reviewType === "internship" ? internshipCompany.trim() : "",
    rating,
    title,
    body,
  });

  await review.populate("user", "name avatar");

  res.status(201).json({ success: true, review });
});

// ─── @route  GET /api/reviews/my ─────────────────────────────────────────────
// @access Private (student) — returns the logged-in user's own reviews
export const getMyReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ user: req.user._id })
    .populate("course", "title thumbnail")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, reviews });
});

// ─── @route  PUT /api/reviews/:id ────────────────────────────────────────────
// @access Private (review owner)
export const updateReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);

  if (!review) return next(new AppError("Review not found.", 404));

  if (review.user.toString() !== req.user._id.toString()) {
    return next(new AppError("Not authorised to edit this review.", 403));
  }

  const { rating, title, body } = req.body;

  if (rating !== undefined) review.rating = rating;
  if (title !== undefined) review.title = title.trim().slice(0, 100);
  if (body !== undefined) review.body = body.trim().slice(0, 1000);

  await review.save();
  await review.populate("user", "name avatar");

  res.status(200).json({ success: true, review });
});

// ─── @route  DELETE /api/reviews/:id ─────────────────────────────────────────
// @access Private (review owner or admin)
export const deleteReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);

  if (!review) return next(new AppError("Review not found.", 404));

  const isOwner = review.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin) {
    return next(new AppError("Not authorised to delete this review.", 403));
  }

  await review.deleteOne();

  res.status(200).json({ success: true, message: "Review deleted." });
});

// ─── @route  GET /api/reviews/featured ───────────────────────────────────────
// @access Public — for the landing page (featured or latest visible reviews)
export const getFeaturedReviews = asyncHandler(async (req, res) => {
  let reviews = await Review.find({ isVisible: true, isFeatured: true, isApproved: true })
    .populate("user", "name avatar")
    .populate("course", "title")
    .sort({ createdAt: -1 })
    .limit(12);

  if (reviews.length < 6) {
    reviews = await Review.find({ isVisible: true, isApproved: true })
      .populate("user", "name avatar")
      .populate("course", "title")
      .sort({ createdAt: -1 })
      .limit(12);
  }

  res.status(200).json({ success: true, reviews });
});

// ─── @route  GET /api/reviews/course/:courseId ───────────────────────────────
// @access Public
export const getCourseReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({
    reviewType: "course",
    course: req.params.courseId,
    isVisible: true,
  })
    .populate("user", "name avatar")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, reviews });
});
// @route  GET /api/reviews/admin/pending
// @access Admin
export const getPendingReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ isApproved: false, isVisible: true })
    .populate("user", "name avatar email")
    .populate("course", "title")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, reviews });
});

// @route  PATCH /api/reviews/:id/approve
// @access Admin
export const approveReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) return next(new AppError("Review not found.", 404));

  const { approved } = req.body; // true = approve, false = reject (hide)

  review.isApproved = approved === true;
  review.isVisible = approved !== false; // rejected reviews get hidden too
  await review.save();

  res.status(200).json({
    success: true,
    message: approved ? "Review approved." : "Review rejected.",
    review,
  });
});