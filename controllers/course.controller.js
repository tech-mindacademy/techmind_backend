import Course from "../models/Course.model.js";
import Enrollment from "../models/Enrollment.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { cloudinary } from "../config/cloudinary.js";
import streamifier from "streamifier";
import fetch from "node-fetch";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/courses
// @access Public — browse published courses with search/filter/pagination
export const getCourses = asyncHandler(async (req, res) => {
  const {
    search,
    category,
    level,
    language,
    minPrice,
    maxPrice,
    free,
    sort = "newest",
    page = 1,
    limit = 12,
  } = req.query;

  const query = { isPublished: true, approvalStatus: "approved" };

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  if (category) query.category = { $regex: category, $options: "i" };
  if (level) query.level = level;
  if (language) query.language = { $regex: language, $options: "i" };
  if (free === "true") query.isFree = true;
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  const sortOptions = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    "price-low": { price: 1 },
    "price-high": { price: -1 },
    popular: { "stats.totalStudents": -1 },
    rating: { "stats.avgRating": -1 },
  };

  const skip = (Number(page) - 1) * Number(limit);
  const [courses, total] = await Promise.all([
    Course.find(query)
      .populate("creator", "name avatar")
      .select("-sections")
      .sort(sortOptions[sort] || sortOptions.newest)
      .skip(skip)
      .limit(Number(limit)),
    Course.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    courses,
    pagination: {
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      limit: Number(limit),
    },
  });
});

// @route  GET /api/courses/:slug
// @access Public — full course detail (sections shown but lesson videos hidden unless enrolled)
export const getCourseBySlug = asyncHandler(async (req, res, next) => {
  const param = req.params.slug;

  const isObjectId = /^[a-f\d]{24}$/i.test(param);

  // Admins can see any course regardless of publish/approval state
  const isAdmin = req.user && req.user.role === "admin";

  let query;
  if (isObjectId) {
    query = { _id: param };
    // Non-admins still can't see unpublished courses by ID
    if (!isAdmin) query.isPublished = true;
  } else {
    query = { slug: param };
    // Non-admins only see approved + published courses
    if (!isAdmin) {
      query.isPublished = true;
      query.approvalStatus = "approved";
    }
  }

  const course = await Course.findOne(query).populate(
    "creator",
    "name avatar bio",
  );

  if (!course) return next(new AppError("Course not found.", 404));

  let isEnrolled = false;
  let enrollment = null;
  if (req.user) {
    enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: course._id,
    });
    isEnrolled = !!enrollment;
  }

  const isOwner =
    req.user &&
    (course.creator._id.toString() === req.user._id.toString() || isAdmin);

  const courseObj = course.toObject();
  if (!isEnrolled && !isOwner) {
    courseObj.sections = courseObj.sections.map((sec) => ({
      ...sec,
      lessons: sec.lessons.map((lesson) => ({
        ...lesson,
        video: lesson.isFreePreview
          ? lesson.video
          : { url: "", duration: lesson.video.duration },
        notes: [],
      })),
    }));
  }
  if (isEnrolled || isOwner) {
  courseObj.sections = courseObj.sections.map((sec) => ({
    ...sec,
    lessons: sec.lessons.map((lesson) => ({
      ...lesson,
      video: {
        public_id: lesson.video?.public_id || "",
        duration: lesson.video?.duration || 0,
        url: "", // signed URL fetched fresh per-lesson via /stream endpoint
      },
    })),
  }));
}

  res.status(200).json({
    success: true,
    course: courseObj,
    isEnrolled,
    enrollment: enrollment
      ? {
          amountPaid: enrollment.amountPaid,
          progressPercent: enrollment.progressPercent,
          paymentMethod: enrollment.paymentMethod,
        }
      : null,
    progress: enrollment
      ? {
          completedLessons: enrollment.completedLessons.length,
          progressPercent: enrollment.progressPercent,
          lastAccessedLesson: enrollment.lastAccessedLesson,
        }
      : null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PREVIEW — bypasses approval, publish state, and enrollment gates
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/admin/courses/:courseId/preview
// @access Admin only
export const getAdminCoursePreview = asyncHandler(async (req, res, next) => {
  const param = req.params.courseId;
  const isObjectId = /^[a-f\d]{24}$/i.test(param);

  // Accept both MongoDB ObjectId and slug — frontend passes whatever is in the URL
  const course = await Course.findOne(
    isObjectId ? { _id: param } : { slug: param }
  ).populate("creator", "name avatar bio");

  if (!course) return next(new AppError("Course not found.", 404));

  const courseObj = course.toObject();

  // Give admin full signed video URLs for every lesson
  courseObj.sections = courseObj.sections.map((sec) => ({
  ...sec,
  lessons: sec.lessons.map((lesson) => ({
    ...lesson,
    video: {
      public_id: lesson.video?.public_id || "",
      duration: lesson.video?.duration || 0,
      url: "",
    },
  })),
}));

  res.status(200).json({ success: true, course: courseObj });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATOR ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/courses/creator/my-courses
// @access Creator
export const getMyCoursesAsCreator = asyncHandler(async (req, res) => {
  const courses = await Course.find({ creator: req.user._id })
    .select(
      "title slug thumbnail isPublished stats.totalStudents stats.avgRating price createdAt",
    )
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, courses });
});

// @route  POST /api/courses
// @access Creator
export const createCourse = asyncHandler(async (req, res, next) => {
  const {
    title,
    description,
    shortDescription,
    category,
    tags,
    language,
    level,
    price,
    discountPrice,
    isFree,
    requirements,
    whatYouLearn,
  } = req.body;

  const course = await Course.create({
    title,
    description,
    shortDescription,
    category,
    tags: tags ? JSON.parse(tags) : [],
    language,
    level,
    price: isFree === "true" ? 0 : Number(price) || 0,
    discountPrice: Number(discountPrice) || 0,
    isFree: isFree === "true",
    requirements: requirements ? JSON.parse(requirements) : [],
    whatYouLearn: whatYouLearn ? JSON.parse(whatYouLearn) : [],
    creator: req.user._id,
    thumbnail: req.file
      ? {
          public_id: req.file.public_id || req.file.filename,
          url: req.file.path || req.file.secure_url,
        }
      : { public_id: "", url: "" },
  });

  course.sections.push({ title: "Final Quiz", order: 0, lessons: [] });
await course.save();

  res.status(201).json({ success: true, message: "Course created.", course });
});

// @route  GET /api/courses/:courseId/manage
// @access Creator (own course) | Admin
export const getCourseForEdit = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  const isOwner = course.creator.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "admin") {
    return next(new AppError("Not authorised to edit this course.", 403));
  }

  res.status(200).json({ success: true, course });
});

// @route  PUT /api/courses/:courseId
// @access Creator (own course) | Admin
export const updateCourse = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  const isOwner = course.creator.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const fields = [
    "title", "description", "shortDescription", "category",
    "language", "level", "price", "discountPrice", "isFree",
  ];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) course[f] = req.body[f];
  });

  if (req.body.tags) course.tags = JSON.parse(req.body.tags);
  if (req.body.requirements) course.requirements = JSON.parse(req.body.requirements);
  if (req.body.whatYouLearn) course.whatYouLearn = JSON.parse(req.body.whatYouLearn);

  if (req.file) {
    if (course.thumbnail?.public_id) {
      await cloudinary.uploader.destroy(course.thumbnail.public_id);
    }
    course.thumbnail = {
      public_id: req.file.public_id || req.file.filename,
      url: req.file.path || req.file.secure_url,
    };
  }

  await course.save();
  res.status(200).json({ success: true, message: "Course updated.", course });
});

// @route  DELETE /api/courses/:courseId
// @access Creator (own course) | Admin
export const deleteCourse = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  const isOwner = course.creator.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const destroyPromises = [];
  if (course.thumbnail.public_id)
    destroyPromises.push(cloudinary.uploader.destroy(course.thumbnail.public_id));
  if (course.previewVideo.public_id)
    destroyPromises.push(
      cloudinary.uploader.destroy(course.previewVideo.public_id, { resource_type: "video" }),
    );
  course.sections.forEach((sec) => {
    sec.lessons.forEach((lesson) => {
      if (lesson.video?.public_id)
        destroyPromises.push(
          cloudinary.uploader.destroy(lesson.video.public_id, { resource_type: "video" }),
        );
      lesson.notes.forEach((note) => {
        if (note.public_id)
          destroyPromises.push(
            cloudinary.uploader.destroy(note.public_id, { resource_type: "raw" }),
          );
      });
    });
  });

  await Promise.allSettled(destroyPromises);
  await course.deleteOne();

  res.status(200).json({ success: true, message: "Course deleted." });
});

// @route  PATCH /api/courses/:courseId/publish
// @access Creator (own course)
export const togglePublish = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  if (course.creator.toString() !== req.user._id.toString()) {
    return next(new AppError("Not authorised.", 403));
  }

  const hasContent = course.sections.some((s) => s.lessons.length > 0);
  if (!course.isPublished && !hasContent) {
    return next(new AppError("Add at least one lesson before publishing.", 400));
  }
  const FINAL_SECTION_PATTERN = /final\s*(quiz|assessment|exam|test)/i;

// Only validate when publishing (not unpublishing)
if (!course.isPublished) {
  const finalSection = course.sections.find(s => FINAL_SECTION_PATTERN.test(s.title));

  if (!finalSection) {
    return next(new AppError("A 'Final Quiz' section is required before publishing.", 400));
  }

  const hasQuizLesson = finalSection.lessons.some(l => l.quiz);
  if (!hasQuizLesson) {
    return next(new AppError("The Final Quiz section must have at least one lesson with a quiz attached before publishing.", 400));
  }
}

  course.isPublished = !course.isPublished;
  if (course.isPublished) {
    course.publishedAt = new Date();
    course.approvalStatus = "pending";
    course.approvalNote = "";
  }
  await course.save();

  res.status(200).json({
    success: true,
    message: course.isPublished
      ? "Course submitted for admin approval."
      : "Course unpublished.",
    isPublished: course.isPublished,
    approvalStatus: course.approvalStatus,
  });
});

export const uploadPreviewVideo = asyncHandler(async (req, res, next) => {
  console.log(JSON.stringify(req.file, null, 2));

  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  if (course.creator.toString() !== req.user._id.toString()) {
    return next(new AppError("Not authorised.", 403));
  }

  if (!req.file) return next(new AppError("No video file uploaded.", 400));

  course.previewVideo = {
    public_id: req.file.public_id || req.file.filename,
    url: req.file.path,
    duration: req.file.duration || 0,
  };

  await course.save();

  res.status(200).json({
    success: true,
    message: "Preview video uploaded.",
    previewVideo: course.previewVideo,
  });
});

export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Course.distinct("category", {
    isPublished: true,
    approvalStatus: "approved",
  });

  res.status(200).json({ success: true, categories: categories.sort() });
});
// @route  GET /api/courses/:courseId/sections/:sectionId/lessons/:lessonId/stream
// @access Enrolled student | Creator | Admin
export const getLessonStreamUrl = asyncHandler(async (req, res, next) => {
  const { courseId, sectionId, lessonId } = req.params;

  const course = await Course.findById(courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  const isOwner = course.creator.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin) {
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: courseId,
    });
    if (!enrollment) return next(new AppError("Not enrolled.", 403));
  }

  const section = course.sections.id(sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  const lesson = section.lessons.id(lessonId);
  if (!lesson) return next(new AppError("Lesson not found.", 404));

  if (!lesson.video?.public_id) {
    return next(new AppError("No video for this lesson.", 404));
  }

  const timestamp = Date.now();
const signedUrl = cloudinary.url(lesson.video.public_id, {
  resource_type: "video",
  type: "authenticated",
  secure: true,
  sign_url: true,
  streaming_profile: "full_hd",
  format: "m3u8",
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 2,
});

// DON'T append anything to the signed URL — just send it as-is
res.set({
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
});

res.json({ success: true, url: signedUrl, expiresIn: 7200 });
});
export const proxyLessonVideo = asyncHandler(async (req, res, next) => {
  const { courseId, sectionId, lessonId } = req.params;

  const course = await Course.findById(courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  const isOwner = course.creator.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin) {
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: courseId,
    });
    if (!enrollment) return next(new AppError("Not enrolled.", 403));
  }

  const section = course.sections.id(sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  const lesson = section.lessons.id(lessonId);
  if (!lesson) return next(new AppError("Lesson not found.", 404));

  if (!lesson.video?.public_id) {
    return next(new AppError("No video for this lesson.", 404));
  }

  const signedUrl = cloudinary.url(lesson.video.public_id, {
    resource_type: "video",
    type: "authenticated",
    secure: true,
    sign_url: true,
    streaming_profile: "full_hd",
    format: "m3u8",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 2,
  });

  // Fetch the m3u8 manifest from Cloudinary
  const cloudinaryRes = await fetch(signedUrl);

  if (!cloudinaryRes.ok) {
    console.error("Cloudinary manifest fetch failed:", cloudinaryRes.status, await cloudinaryRes.text());
    return next(new AppError("Failed to fetch video stream.", 502));
  }

  const manifest = await cloudinaryRes.text();

  // Log manifest to debug
  console.log("Original manifest:\n", manifest);

  // Get base URL for resolving relative segment URLs
  const urlObj = new URL(signedUrl);
  const basePath = urlObj.origin + urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf("/") + 1);
  const baseQuery = urlObj.search; // preserve the signature query params

  // Rewrite every non-comment line (segments, sub-playlists)
  const rewritten = manifest.split("\n").map((line) => {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) return line;

    // Build absolute Cloudinary URL
    const absoluteUrl = trimmed.startsWith("http")
      ? trimmed
      : basePath + trimmed + (baseQuery && !trimmed.includes("?") ? baseQuery : "");

    const encoded = encodeURIComponent(absoluteUrl);
    return `/api/courses/proxy-segment?url=${encoded}`;
  }).join("\n");

  console.log("Rewritten manifest:\n", rewritten);

  res.set({
  "Content-Type": "application/vnd.apple.mpegurl",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "ETag": `"${Date.now()}"`, // unique every request
  "Last-Modified": new Date().toUTCString(),
  "Access-Control-Allow-Origin": process.env.FRONTEND_URL,
  "Access-Control-Allow-Credentials": "true",
});

  res.send(rewritten);
});

// Proxy individual .ts segments
export const proxySegment = asyncHandler(async (req, res, next) => {
  const { url } = req.query;
  if (!url) return next(new AppError("No URL provided.", 400));

  // req.user is already set by protect middleware — no token needed
  const segmentUrl = decodeURIComponent(url);

  const segmentRes = await fetch(segmentUrl);
  if (!segmentRes.ok) {
    return next(new AppError("Failed to fetch segment.", 502));
  }

  res.set({
    "Content-Type": "video/mp2t",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
  });

  segmentRes.body.pipe(res);
});