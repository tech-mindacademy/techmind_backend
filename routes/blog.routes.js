import express from "express";
import {
  getBlogs,
  getBlog,
  getAllBlogsAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
  uploadBlogImage,
} from "../controllers/blog.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/auth.middleware.js";
import { uploadImage } from "../config/cloudinary.js";

const router = express.Router();

// Public
router.get("/", getBlogs);
router.get("/:slug", getBlog);

// Admin only
router.get("/admin/all", protect, authorizeRoles("admin"), getAllBlogsAdmin);
router.post("/", protect, authorizeRoles("admin"), uploadImage.single("coverImage"), createBlog);
router.put("/:id", protect, authorizeRoles("admin"), uploadImage.single("coverImage"), updateBlog);
router.delete("/:id", protect, authorizeRoles("admin"), deleteBlog);
router.post(
  "/upload-image",
  protect,
  authorizeRoles("admin"),
  uploadImage.single("image"),
  uploadBlogImage
);

export default router;