import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.model.js";
import { sendTokens, generateAccessToken } from "../utils/jwt.utils.js";
import {
  sendVerifyEmail,
  sendResetPasswordEmail,
} from "../utils/email.utils.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { cloudinary } from "../config/cloudinary.js";

// ─── @route  POST /api/auth/register ─────────────────────────────────────────
export const register = asyncHandler(async (req, res, next) => {
  const { name, email, password, role } = req.body;

  const safeRole = role === "creator" ? "creator" : "student";
  const creatorRequestStatus = "none";

  const existingUser = await User.findOne({ email });
  if (existingUser) return next(new AppError("Email already registered.", 400));

  const user = await User.create({ name, email, password, role: safeRole, creatorRequestStatus });

  const verifyToken = user.generateEmailVerifyToken();
  await user.save({ validateBeforeSave: false });

  const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${verifyToken}`;
  try {
    await sendVerifyEmail(user.email, user.name, verifyUrl);
  } catch (err) {
    user.emailVerifyToken = undefined;
    user.emailVerifyExpire = undefined;
    await user.save({ validateBeforeSave: false });
    console.error("Email send failed:", err.message);
  }

  res.status(201).json({
    success: true,
    message: "Registration successful. Please check your email to verify your account.",
  });
});

// ─── @route  GET /api/auth/verify-email/:token ───────────────────────────────
export const verifyEmail = asyncHandler(async (req, res, next) => {
  const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

  const user = await User.findOne({
    emailVerifyToken: hashedToken,
    emailVerifyExpire: { $gt: Date.now() },
  });

  if (!user) return next(new AppError("Invalid or expired verification token.", 400));

  user.isVerified = true;
  user.emailVerifyToken = undefined;
  user.emailVerifyExpire = undefined;
  await user.save({ validateBeforeSave: false });

  sendTokens(res, user, 200, "Email verified successfully!");
});

// ─── @route  POST /api/auth/login ────────────────────────────────────────────
export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return next(new AppError("Email and password are required.", 400));

  const user = await User.findOne({ email }).select("+password +refreshToken");
  if (!user) return next(new AppError("Invalid email or password.", 401));

  const isMatch = await user.comparePassword(password);
  if (!isMatch) return next(new AppError("Invalid email or password.", 401));

  if (!user.isActive) return next(new AppError("Your account has been deactivated.", 403));

  user.lastLogin = Date.now();
  await user.save({ validateBeforeSave: false });

  sendTokens(res, user, 200, "Login successful.");
});

// ─── @route  POST /api/auth/refresh-token ────────────────────────────────────
export const refreshToken = asyncHandler(async (req, res, next) => {
  const token = req.cookies.refreshToken;
  if (!token) return next(new AppError("No refresh token found.", 401));

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    return next(new AppError("Invalid or expired refresh token.", 401));
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) return next(new AppError("User not found or deactivated.", 401));

  const newAccessToken = generateAccessToken(user._id, user.role);
  res.status(200).json({ success: true, accessToken: newAccessToken });
});

// ─── @route  POST /api/auth/logout ───────────────────────────────────────────
export const logout = asyncHandler(async (req, res, next) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure:   true,
    sameSite: "none",
    path:     "/",
  });
  res.status(200).json({ success: true, message: "Logged out successfully." });
});

// ─── @route  POST /api/auth/forgot-password ──────────────────────────────────
export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.status(200).json({
      success: true,
      message: "If that email exists, a reset link has been sent.",
    });
  }

  const resetToken = user.generatePasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
  try {
    await sendResetPasswordEmail(user.email, user.name, resetUrl);
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError("Email could not be sent.", 500));
  }

  res.status(200).json({
    success: true,
    message: "If that email exists, a reset link has been sent.",
  });
});

// ─── @route  POST /api/auth/reset-password/:token ────────────────────────────
export const resetPassword = asyncHandler(async (req, res, next) => {
  const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

  const user = await User.findOne({
    passwordResetToken:  hashedToken,
    passwordResetExpire: { $gt: Date.now() },
  });

  if (!user) return next(new AppError("Invalid or expired reset token.", 400));

  const { password } = req.body;
  if (!password || password.length < 8) {
    return next(new AppError("Password must be at least 8 characters.", 400));
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpire = undefined;
  await user.save();

  sendTokens(res, user, 200, "Password reset successful.");
});

// ─── @route  GET /api/auth/me ─────────────────────────────────────────────────
export const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  res.status(200).json({ success: true, user });
});

// ─── @route  PUT /api/auth/profile ───────────────────────────────────────────
export const updateProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) return next(new AppError("User not found.", 404));

  if (req.body.name)              user.name = req.body.name.trim().slice(0, 50);
  if (req.body.bio !== undefined) user.bio  = req.body.bio.slice(0, 500);

  if (req.file) {
    if (user.avatar?.public_id) {
      await cloudinary.uploader.destroy(user.avatar.public_id).catch(() => {});
    }
    user.avatar = { public_id: req.file.public_id, url: req.file.path };
  }

  await user.save({ validateBeforeSave: false });
  res.status(200).json({ success: true, message: "Profile updated.", user });
});

// ─── @route  PUT /api/auth/change-password ───────────────────────────────────
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return next(new AppError("Both current and new password are required.", 400));
  }
  if (newPassword.length < 8) {
    return next(new AppError("New password must be at least 8 characters.", 400));
  }

  const user = await User.findById(req.user._id).select("+password");
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) return next(new AppError("Current password is incorrect.", 401));

  user.password = newPassword;
  await user.save();

  res.status(200).json({ success: true, message: "Password changed successfully." });
});