import rateLimit from "express-rate-limit";

// General baseline for all routes
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300, // generous, just stops abusive scraping/DoS
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict — auth attempts (brute force / credential stuffing risk)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many attempts, please try again later." },
});

// Very strict — password reset / email-sending endpoints (email bombing risk)
export const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { success: false, message: "Too many requests. Please try again in an hour." },
});

// Moderate — public form submissions (spam risk)
export const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many submissions. Please try again later." },
});

// Payment endpoints — prevent order-spam / abuse against Razorpay
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many payment attempts. Please slow down." },
});