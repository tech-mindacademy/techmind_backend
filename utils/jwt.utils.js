import jwt from "jsonwebtoken";

// ─── Generate short-lived access token (15min) ────────────────────────────────
export const generateAccessToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRE || "15m",
  });
};

// ─── Generate long-lived refresh token (7d) ───────────────────────────────────
export const generateRefreshToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || "1d",
  });
};

// ─── Send tokens: access in JSON body, refresh in httpOnly cookie ─────────────
export const sendTokens = (res, user, statusCode, message) => {
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);

  // Requests are now proxied through Vercel → same-site, so sameSite:"lax"
  // works and is not blocked by browser privacy settings unlike "none"
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 1 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  const userData = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    isVerified: user.isVerified,
    isApprovedCreator: user.isApprovedCreator,
  };

  res.status(statusCode).json({
    success: true,
    message,
    accessToken,
    user: userData,
  });
};