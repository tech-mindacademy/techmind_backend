import express from "express";
import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";


import connectDB from "./config/db.js";
import { errorHandler } from "./middleware/error.middleware.js";

import authRoutes       from "./routes/auth.routes.js";
import courseRoutes     from "./routes/course.routes.js";
import enrollmentRoutes from "./routes/enrollment.routes.js";
import quizRoutes       from "./routes/quiz.routes.js";
import assignmentRoutes from "./routes/assignment.routes.js";
import adminRoutes      from "./routes/admin.routes.js";
import walletRoutes     from "./routes/wallet.routes.js";
import couponRoutes     from "./routes/coupon.routes.js";
import paymentRoutes    from "./routes/payment.routes.js";
import internshipRoutes from "./routes/internship.routes.js";
import certificateRoutes from "./routes/certificate.routes.js";
import heroImageRoutes from "./routes/HeroSlide.routes.js";
import reviewRoutes from "./routes/Review.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import refundRoutes from "./routes/refund.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import blogRoutes from "./routes/blog.routes.js";

connectDB();

const app = express();
app.set("trust proxy", 1);

app.use(helmet({
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: [
    process.env.CLIENT_URL,
    "http://localhost:5173"
  ],
  credentials: true,
}));

// server.js
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 200 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.set("etag", false);
// Stripe webhook needs raw body — mount BEFORE express.json()
// ✅ FIRST parse JSON
app.use(express.json({ limit: "10mb" }));

app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// THEN routes
app.use("/api/payments", paymentRoutes);


if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

app.use("/api/auth",        authLimiter, authRoutes);
app.use("/api/courses",     courseRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/quizzes",     quizRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/admin",       adminRoutes);
app.use("/api/wallet",      walletRoutes);
app.use("/api/coupons",     couponRoutes);
app.use("/api/internships", internshipRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/hero-images", heroImageRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/blogs", blogRoutes);
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Tech Vidya API running",
    phase: "Phase 4 complete",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/test-email", async (req, res) => {
  try {
    const { sendEmail } = await import("./utils/email.utils.js");
    await sendEmail({
      to: "techmindacademy70@gmail.com",
      subject: "OAuth2 Test",
      html: "<p>Gmail OAuth2 is working!</p>",
    });
    res.json({ success: true, message: "Email sent!" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.use("*", (req, res) => res.status(404).json({ success: false, message: "Route not found." }));
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Tech Vidya running in ${process.env.NODE_ENV} mode on port ${PORT}`));

export default app;
