import Course from "../models/Course.model.js";
import Enrollment from "../models/Enrollment.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { cloudinary } from "../config/cloudinary.js";
import fetch from "node-fetch";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/courses
// @access Public
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
// @access Public
export const getCourseBySlug = asyncHandler(async (req, res, next) => {
  const param = req.params.slug;
  const isObjectId = /^[a-f\d]{24}$/i.test(param);
  const isAdmin = req.user && req.user.role === "admin";

  let query;
  if (isObjectId) {
    query = { _id: param };
    if (!isAdmin) query.isPublished = true;
  } else {
    query = { slug: param };
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
          url: "",
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
// ADMIN PREVIEW
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/courses/preview/:courseId
// @access Admin only
export const getAdminCoursePreview = asyncHandler(async (req, res, next) => {
  const param = req.params.courseId;
  const isObjectId = /^[a-f\d]{24}$/i.test(param);

  const course = await Course.findOne(
    isObjectId ? { _id: param } : { slug: param },
  ).populate("creator", "name avatar bio");

  if (!course) return next(new AppError("Course not found.", 404));

  const courseObj = course.toObject();
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
// @access Creator | Admin
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
// @access Creator | Admin
export const updateCourse = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  const isOwner = course.creator.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const fields = [
    "title",
    "description",
    "shortDescription",
    "category",
    "language",
    "level",
    "price",
    "discountPrice",
    "isFree",
  ];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) course[f] = req.body[f];
  });

  if (req.body.tags) course.tags = JSON.parse(req.body.tags);
  if (req.body.requirements)
    course.requirements = JSON.parse(req.body.requirements);
  if (req.body.whatYouLearn)
    course.whatYouLearn = JSON.parse(req.body.whatYouLearn);

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
// @access Creator | Admin
export const deleteCourse = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  const isOwner = course.creator.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const destroyPromises = [];
  if (course.thumbnail.public_id)
    destroyPromises.push(
      cloudinary.uploader.destroy(course.thumbnail.public_id),
    );
  if (course.previewVideo.public_id)
    destroyPromises.push(
      cloudinary.uploader.destroy(course.previewVideo.public_id, {
        resource_type: "video",
      }),
    );
  course.sections.forEach((sec) => {
    sec.lessons.forEach((lesson) => {
      if (lesson.video?.public_id)
        destroyPromises.push(
          cloudinary.uploader.destroy(lesson.video.public_id, {
            resource_type: "video",
          }),
        );
      lesson.notes.forEach((note) => {
        if (note.public_id)
          destroyPromises.push(
            cloudinary.uploader.destroy(note.public_id, {
              resource_type: "raw",
            }),
          );
      });
    });
  });

  await Promise.allSettled(destroyPromises);
  await course.deleteOne();

  res.status(200).json({ success: true, message: "Course deleted." });
});

// @route  PATCH /api/courses/:courseId/publish
// @access Creator
export const togglePublish = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  if (course.creator.toString() !== req.user._id.toString()) {
    return next(new AppError("Not authorised.", 403));
  }

  const hasContent = course.sections.some((s) => s.lessons.length > 0);
  if (!course.isPublished && !hasContent) {
    return next(
      new AppError("Add at least one lesson before publishing.", 400),
    );
  }

  const FINAL_SECTION_PATTERN = /final\s*(quiz|assessment|exam|test)/i;

  if (!course.isPublished) {
    const finalSection = course.sections.find((s) =>
      FINAL_SECTION_PATTERN.test(s.title),
    );
    if (!finalSection) {
      return next(
        new AppError(
          "A 'Final Quiz' section is required before publishing.",
          400,
        ),
      );
    }
    const hasQuizLesson = finalSection.lessons.some((l) => l.quiz);
    if (!hasQuizLesson) {
      return next(
        new AppError(
          "The Final Quiz section must have at least one lesson with a quiz attached before publishing.",
          400,
        ),
      );
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

// @route  POST /api/courses/:courseId/preview-video
// @access Creator
export const uploadPreviewVideo = asyncHandler(async (req, res, next) => {
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

// @route  GET /api/courses/categories
// @access Public
export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Course.distinct("category", {
    isPublished: true,
    approvalStatus: "approved",
  });

  res.status(200).json({ success: true, categories: categories.sort() });
});

// ─────────────────────────────────────────────────────────────────────────────
// STREAM URL (legacy — kept for backwards compat)
// ─────────────────────────────────────────────────────────────────────────────

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

  const signedUrl = cloudinary.url(lesson.video.public_id, {
    resource_type: "video",
    type: "authenticated",
    secure: true,
    sign_url: true,
    streaming_profile: "hd",
    format: "m3u8",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 2,
  });

  res.set({
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });

  res.json({ success: true, url: signedUrl, expiresIn: 7200 });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROXY LESSON VIDEO (master manifest)
// @route  GET /api/courses/:courseId/sections/:sectionId/lessons/:lessonId/proxy
// @access Enrolled student | Creator | Admin  (protect middleware on route)
// ─────────────────────────────────────────────────────────────────────────────
export const proxyLessonVideo = asyncHandler(async (req, res, next) => {
  const { courseId, sectionId, lessonId } = req.params;

  // ── 1. Load course ──────────────────────────────────────────────────────────
  const course = await Course.findById(courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  // ── 2. Auth check ───────────────────────────────────────────────────────────
  const isOwner = course.creator.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin) {
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: courseId,
    });
    if (!enrollment) return next(new AppError("Not enrolled.", 403));
  }

  // ── 3. Locate lesson ────────────────────────────────────────────────────────
  const section = course.sections.id(sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  const lesson = section.lessons.id(lessonId);
  if (!lesson) return next(new AppError("Lesson not found.", 404));

  if (!lesson.video?.public_id) {
    return next(new AppError("No video for this lesson.", 404));
  }

  // ── 4. Guard env vars ───────────────────────────────────────────────────────
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    console.error("[proxyLessonVideo] Missing Cloudinary env vars");
    return next(new AppError("Server configuration error.", 500));
  }

  // ── 5. Build Cloudinary signed HLS master manifest URL ──────────────────────
  const signedUrl = cloudinary.url(lesson.video.public_id, {
    resource_type: "video",
    type: "authenticated",
    secure: true,
    sign_url: true,
    streaming_profile: "hd",
    format: "m3u8",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 2,
  });

  if (!signedUrl || !signedUrl.startsWith("http")) {
    console.error(
      "[proxyLessonVideo] Cloudinary returned invalid URL:",
      signedUrl,
    );
    return next(new AppError("Video URL generation failed.", 500));
  }

  console.log("[proxyLessonVideo] signedUrl:", signedUrl.slice(0, 100));

  // ── 6. Fetch master manifest from Cloudinary ────────────────────────────────
  const cloudinaryRes = await fetch(signedUrl);
  if (!cloudinaryRes.ok) {
    console.error(
      "[proxyLessonVideo] Cloudinary fetch failed:",
      cloudinaryRes.status,
      await cloudinaryRes.text(),
    );
    return next(new AppError("Failed to fetch video stream.", 502));
  }

  const manifest = await cloudinaryRes.text();

  // ── 7. Rewrite manifest lines to route through our proxy ────────────────────
  // No JWT token — auth is handled by the session cookie via protect middleware.
  const urlObj = new URL(signedUrl);
  const basePath =
    urlObj.origin +
    urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf("/") + 1);
  // NOTE: do NOT append urlObj.search (signature params) to sub-playlist URLs —
  // each Cloudinary sub-playlist URL already carries its own s--signature--.

  const rewritten = manifest
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;

      let absoluteUrl;
      if (trimmed.startsWith("http")) {
        // Already absolute — use as-is
        absoluteUrl = trimmed;
      } else if (trimmed.startsWith("/")) {
        absoluteUrl = urlObj.origin + trimmed;
      } else {
        // Relative — resolve against basePath, no extra query params
        absoluteUrl = basePath + trimmed;
      }

      return `/api/courses/proxy-segment?url=${encodeURIComponent(absoluteUrl)}`;
    })
    .join("\n");

  // ── 8. Send rewritten manifest ──────────────────────────────────────────────
  res.set({
    "Content-Type": "application/vnd.apple.mpegurl",
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    ETag: `"${Date.now()}"`,
    "Last-Modified": new Date().toUTCString(),
    "Access-Control-Allow-Origin": process.env.FRONTEND_URL,
    "Access-Control-Allow-Credentials": "true",
  });

  res.send(rewritten);
});

// ─────────────────────────────────────────────────────────────────────────────
// PROXY SEGMENT (sub-playlists + .ts byte-range segments)
// @route  GET /api/courses/proxy-segment?url=...
// @access protect middleware on route (session cookie — no token needed)
// ─────────────────────────────────────────────────────────────────────────────
export const proxySegment = asyncHandler(async (req, res, next) => {
  const { url } = req.query;
  if (!url) return next(new AppError("No URL provided.", 400));

  const segmentUrl = decodeURIComponent(url);

  if (!segmentUrl.startsWith("https://res.cloudinary.com/")) {
    return next(new AppError("Invalid segment URL.", 400));
  }

  const fetchHeaders = {};
  if (req.headers.range) {
    fetchHeaders["Range"] = req.headers.range;
  }

  if (segmentUrl.includes("/authenticated/") || segmentUrl.includes("s--")) {
    const credentials = Buffer.from(
      `${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`
    ).toString("base64");
    fetchHeaders["Authorization"] = `Basic ${credentials}`;
  }

  const segmentRes = await fetch(segmentUrl, { headers: fetchHeaders });

  console.log(
    "[proxySegment] fetch status:",
    segmentRes.status,
    segmentUrl.slice(0, 120)
  );

  if (!segmentRes.ok && segmentRes.status !== 206) {
    console.error("[proxySegment] fetch failed:", segmentRes.status, segmentUrl.slice(0, 120));
    return next(new AppError("Failed to fetch segment.", 502));
  }

  const contentType = segmentRes.headers.get("content-type") || "";
  const isPlaylist =
    contentType.includes("mpegurl") ||
    contentType.includes("x-mpegURL") ||
    segmentUrl.includes(".m3u8");

  // ── Sub-playlist (.m3u8) ────────────────────────────────────────────────────
  if (isPlaylist) {
    const text = await segmentRes.text();
    console.log("[proxySegment] sub-playlist raw:\n", text.slice(0, 600));

    const urlObj = new URL(segmentUrl);
    const basePath =
      urlObj.origin +
      urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf("/") + 1);

    // Use absolute backend URL so HLS.js resolves segment URLs correctly
    // regardless of which URL it considers the "base" for relative paths.
    const backendOrigin =
      process.env.BACKEND_URL || "https://api.techmindacademy.in";

    const lines = text.split("\n");
    const output = [];
    let pendingExtinf = null;
    let pendingByterange = null;
    let currentByteOffset = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        output.push(line);
        continue;
      }

      if (trimmed.startsWith("#EXTINF:")) {
        pendingExtinf = line;
        continue;
      }

      if (trimmed.startsWith("#EXT-X-BYTERANGE:")) {
        pendingByterange = line;
        const match = trimmed.match(/#EXT-X-BYTERANGE:(\d+)@(\d+)/);
        if (match) currentByteOffset = match[2];
        continue;
      }

      if (trimmed.startsWith("#")) {
        if (pendingExtinf)    { output.push(pendingExtinf);    pendingExtinf = null; }
        if (pendingByterange) { output.push(pendingByterange); pendingByterange = null; }
        output.push(line);
        continue;
      }

      // Segment URI
      let absoluteUrl;
      if (trimmed.startsWith("http")) {
        absoluteUrl = trimmed;
      } else if (trimmed.startsWith("/")) {
        absoluteUrl = urlObj.origin + trimmed;
      } else {
        absoluteUrl = basePath + trimmed;
      }

      const uniqueSuffix =
        currentByteOffset !== null ? `&_br=${currentByteOffset}` : "";
      currentByteOffset = null;

      // Absolute URL so HLS.js never misresolves relative paths
      const proxyLine = `${backendOrigin}/api/courses/proxy-segment?url=${encodeURIComponent(absoluteUrl)}${uniqueSuffix}`;

      if (pendingByterange) { output.push(pendingByterange); pendingByterange = null; }
      if (pendingExtinf)    { output.push(pendingExtinf);    pendingExtinf = null; }
      output.push(proxyLine);
    }

    const rewritten = output.join("\n");
    console.log("[proxySegment] rewritten sub-playlist:\n", rewritten.slice(0, 800));

    res.set({
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    });
    return res.send(rewritten);
  }

  // ── Binary .ts segment ──────────────────────────────────────────────────────
  const responseHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };

  const forwardHeaders = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
  ];
  for (const h of forwardHeaders) {
    const val = segmentRes.headers.get(h);
    if (val) responseHeaders[h] = val;
  }

  if (!responseHeaders["content-type"]) {
    responseHeaders["content-type"] = "video/mp2t";
  }

  res.status(segmentRes.status).set(responseHeaders);
  segmentRes.body.pipe(res);
});