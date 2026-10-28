import mongoose from "mongoose";

export const STATUSES = [
  "APPLIED", "CONTACTED", "PAYMENT_PENDING", "PAID",
  "CREDENTIALS_SENT", "ACTIVE", "COMPLETED", "REJECTED",
];

export const DOMAINS = [
  "Full Stack Development (MERN)",
  "Frontend Development",
  "Backend Development",
  "Mobile App Development (React Native)",
  "AI/ML",
  "Data Science",
  "Digital Marketing",
  "Cyber Security",
  "Cloud Computing",
  "DevOps",
  "UI/UX Design",
  "Graphic Design",
];

export const DURATIONS = ["1 Month", "2 Months", "3 Months", "6 Months", "1 Year"];

// Transitions an admin can trigger directly. PAYMENT_PENDING, PAID and
// CREDENTIALS_SENT are only reachable through the payment-link, webhook and
// send-credentials actions.
export const MANUAL_TRANSITIONS = {
  APPLIED: ["CONTACTED", "REJECTED"],
  CONTACTED: ["REJECTED"],
  PAYMENT_PENDING: ["REJECTED"],
  CREDENTIALS_SENT: ["ACTIVE"],
  ACTIVE: ["COMPLETED"],
};

export const STATUS_TIMESTAMP = {
  CONTACTED: "contactedAt",
  ACTIVE: "startedAt",
  COMPLETED: "completedAt",
  REJECTED: "rejectedAt",
};

const paymentSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["none", "link_sent", "paid", "expired", "cancelled"],
      default: "none",
    },
    linkId: String,
    linkUrl: String,
    amount: Number, // paise
    currency: { type: String, default: "INR" },
    paymentId: String,
    method: String,
    paidAt: Date,
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true },
    college: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    branch: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },

    domain: { type: String, required: true, enum: DOMAINS },
    duration: { type: String, required: true, enum: DURATIONS },
    preferredStartDate: Date,

    resumeUrl: String,
    skills: String,
    linkedIn: String,
    github: String,
    message: { type: String, maxlength: 1000 },

    status: { type: String, enum: STATUSES, default: "APPLIED" },
    payment: { type: paymentSchema, default: () => ({}) },

    contactedAt: Date,
    paymentLinkSentAt: Date,
    credentialsSentAt: Date,
    credentialsSendCount: { type: Number, default: 0 },
    credentialsLockAt: Date,
    startedAt: Date,
    completedAt: Date,
    rejectedAt: Date,
  },
  { timestamps: true }
);

schema.index({ status: 1, createdAt: -1 });
schema.index({ "payment.linkId": 1 }, { sparse: true });

export default mongoose.model("IndustrialTrainingApplication", schema);
