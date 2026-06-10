import jwt from "jsonwebtoken";
import User from "../models/User.model.js";

// ─── Protect: verify access token, attach user to req ────────────────────────
export const protect = async (req, res, next) => {
  try {
    // 1. Get token from Authorization header
    let token;
    let isRefreshToken = false;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    } else if (req.cookies?.refreshToken) {
      token = req.cookies.refreshToken;
      isRefreshToken = true;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. No token provided.",
      });
    }

    let decoded;
    try {
      const secret = isRefreshToken
        ? process.env.JWT_REFRESH_SECRET
        : process.env.JWT_ACCESS_SECRET;
      decoded = jwt.verify(token, secret);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Access token expired. Please refresh.",
          code: "TOKEN_EXPIRED",
        });
      }
      return res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
    }

    // 3. Fetch user (confirm still exists and is active)
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists.",
      });
    }
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated.",
      });
    }

    // 4. Attach to request
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// ─── Authorize: restrict to specific roles ────────────────────────────────────
// Usage: authorizeRoles("admin")  or  authorizeRoles("creator", "admin")
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not allowed to access this resource.`,
        allowedRoles: roles,
      });
    }
    next();
  };
};

// ─── Verify email required ────────────────────────────────────────────────────
export const requireVerified = (req, res, next) => {
  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: "Please verify your email before accessing this resource.",
      code: "EMAIL_NOT_VERIFIED",
    });
  }
  next();
};

// ─── Creator must be approved by admin ───────────────────────────────────────
export const requireApprovedCreator = (req, res, next) => {
  if (req.user.role === "creator" && !req.user.isApprovedCreator) {
    return res.status(403).json({
      success: false,
      message: "Your creator account is pending admin approval.",
      code: "CREATOR_NOT_APPROVED",
    });
  }
  next();
};
