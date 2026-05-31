import mongoose from "mongoose";

const refundSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    enrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enrollment",
      required: true,
    },

    // Payment details (snapshotted at request time)
    amountPaid: { type: Number, required: true },
    paymentId: { type: String, default: "" },
    paymentMethod: { type: String, default: "" },

    // Progress at the time of request (snapshotted so it can't change after)
    progressPercentAtRequest: { type: Number, required: true },

    // Student's reason
    reason: {
      type: String,
      required: [true, "Please provide a reason for the refund"],
      trim: true,
      maxlength: [1000, "Reason too long"],
    },

    // Admin decision
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminNote: { type: String, default: "" },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },

    // Refund amount after admin decision (may differ if partial)
    refundAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One active (pending/approved) refund per enrollment at a time
refundSchema.index({ enrollment: 1 });
refundSchema.index({ student: 1 });
refundSchema.index({ course: 1 });
refundSchema.index({ status: 1, createdAt: -1 });

const Refund = mongoose.model("Refund", refundSchema);
export default Refund;