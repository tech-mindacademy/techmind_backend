import mongoose from "mongoose";

const registrationSchema = new mongoose.Schema(
  {
    liveClass: { type: mongoose.Schema.Types.ObjectId, ref: "LiveClass", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amountPaid: { type: Number, required: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    joinedAt: Date,
    leftAt: Date,
  },
  { timestamps: true }
);

// one registration per student per live class — re-registering just updates it
registrationSchema.index({ liveClass: 1, student: 1 }, { unique: true });

export default mongoose.model("LiveClassRegistration", registrationSchema);