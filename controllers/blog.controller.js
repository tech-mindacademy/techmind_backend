import Blog from "../models/Blog.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { cloudinary } from "../config/cloudinary.js";

// ── GET /api/blogs  (public) ──────────────────────────────────────────────────
export const getBlogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 9, tag } = req.query;
  const filter = { isPublished: true };
  if (tag) filter.tags = tag;

  const blogs = await Blog.find(filter)
    .populate("author", "name avatar")
    .sort({ publishedAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Blog.countDocuments(filter);

  res.status(200).json({
    success: true,
    blogs,
    totalPages: Math.ceil(total / limit),
    currentPage: Number(page),
  });
});

// ── GET /api/blogs/:slug  (public) ───────────────────────────────────────────
export const getBlog = asyncHandler(async (req, res, next) => {
  const blog = await Blog.findOne({
    slug: req.params.slug,
    isPublished: true,
  }).populate("author", "name avatar");

  if (!blog) return next(new AppError("Blog not found.", 404));

  res.status(200).json({ success: true, blog });
});

// ── GET /api/blogs/admin/all  (admin) ─────────────────────────────────────────
export const getAllBlogsAdmin = asyncHandler(async (req, res) => {
  const blogs = await Blog.find()
    .populate("author", "name avatar")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, blogs });
});

// ── POST /api/blogs  (admin) ──────────────────────────────────────────────────
export const createBlog = asyncHandler(async (req, res) => {
  const { title, content, excerpt, tags, isPublished } = req.body;

  const blog = new Blog({
    title,
    content,
    excerpt,
    tags: tags ? JSON.parse(tags) : [],
    isPublished: isPublished === "true",
    author: req.user._id,
  });

  if (req.file) {
    blog.coverImage = { public_id: req.file.filename, url: req.file.path };
  }

  await blog.save();
  res.status(201).json({ success: true, message: "Blog created.", blog });
});

// ── PUT /api/blogs/:id  (admin) ───────────────────────────────────────────────
export const updateBlog = asyncHandler(async (req, res, next) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) return next(new AppError("Blog not found.", 404));

  const { title, content, excerpt, tags, isPublished } = req.body;

  if (title) blog.title = title;
  if (content) blog.content = content;
  if (excerpt !== undefined) blog.excerpt = excerpt;
  if (tags) blog.tags = JSON.parse(tags);
  if (isPublished !== undefined) blog.isPublished = isPublished === "true";

  if (req.file) {
    if (blog.coverImage?.public_id) {
      await cloudinary.uploader.destroy(blog.coverImage.public_id).catch(() => {});
    }
    blog.coverImage = { public_id: req.file.filename, url: req.file.path };
  }

  await blog.save();
  res.status(200).json({ success: true, message: "Blog updated.", blog });
});

// ── DELETE /api/blogs/:id  (admin) ────────────────────────────────────────────
export const deleteBlog = asyncHandler(async (req, res, next) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) return next(new AppError("Blog not found.", 404));

  if (blog.coverImage?.public_id) {
    await cloudinary.uploader.destroy(blog.coverImage.public_id).catch(() => {});
  }

  await blog.deleteOne();
  res.status(200).json({ success: true, message: "Blog deleted." });
});
// ── POST /api/blogs/upload-image  (admin) ─────────────────────────────────────
export const uploadBlogImage = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new AppError("No image provided.", 400));

  res.status(200).json({
    success: true,
    url: req.file.path,
    public_id: req.file.public_id,
  });
});