// import mongoose from "mongoose";

// const internshipApplicationSchema = new mongoose.Schema(
//   {
//     internship: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Internship",
//       required: true,
//     },
//     // Personal Info
//     name: { type: String, required: true, trim: true },
//     email: { type: String, required: true, lowercase: true, trim: true },
//     phone: { type: String, required: true, trim: true },
//     college: { type: String, required: true, trim: true },
//     degree: { type: String, required: true, trim: true },
//     year: { type: String, required: true },
//     // Application details
//     whyApply: { type: String, required: true, maxlength: 1000 },
//     skills: { type: String },
//     linkedIn: { type: String },
//     github: { type: String },
//     resumeUrl: { type: String },
//     status: {
//       type: String,
//       enum: ["pending", "reviewed", "shortlisted", "rejected"],
//       default: "pending",
//     },
//   },
//   { timestamps: true }
// );

// export default mongoose.model("InternshipApplication", internshipApplicationSchema);
import mongoose from "mongoose";

const internshipApplicationSchema = new mongoose.Schema(
  {
    internship: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Internship",
      required: true,
    },
    // ── NEW: links this application to a real account when the applicant was
    // logged in at the time of applying. Optional so the existing public,
    // no-login apply flow keeps working unchanged. Only applications with a
    // `user` set can be granted access to Live Classes.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // ── NEW: free-text batch label assigned by admin (e.g. "Batch A - July").
    // Empty string means "no specific batch" — treated as open to all
    // shortlisted applicants of the internship when matching Live Classes.
    batch: { type: String, trim: true, default: "" },

    // ── NEW: payment gate for Live Class access ──────────────────────────
    // Only ever set to "paid" by verifyInternshipPayment() after a server-side
    // Razorpay HMAC signature check — never trust a client-supplied flag here.
    paymentStatus: {
      type: String,
      enum: ["not_required", "unpaid", "pending", "paid", "refunded"],
      default: "unpaid",
      index: true,
    },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    amountPaid: { type: Number, default: 0 },
    paidAt: { type: Date, default: null },

    // Personal Info
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    college: { type: String, required: true, trim: true },
    degree: { type: String, required: true, trim: true },
    year: { type: String, required: true },
    // Application details
    whyApply: { type: String, required: true, maxlength: 1000 },
    skills: { type: String },
    linkedIn: { type: String },
    github: { type: String },
    resumeUrl: { type: String },
    status: {
      type: String,
      enum: ["pending", "reviewed", "shortlisted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

internshipApplicationSchema.index({ internship: 1, user: 1 });

export default mongoose.model("InternshipApplication", internshipApplicationSchema);