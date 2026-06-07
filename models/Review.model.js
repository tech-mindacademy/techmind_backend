import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // What is being reviewed
    reviewType: {
      type: String,
      enum: ["course", "platform", "internship"],
      required: true,
    },

    // For course reviews — ref to the course
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },

    // For internship reviews — free text company name (or ref if you have an Internship model)
    internshipCompany: {
      type: String,
      trim: true,
      maxlength: [100, "Company name cannot exceed 100 characters"],
      default: "",
    },

    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },

    title: {
      type: String,
      required: [true, "Review title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },

    body: {
      type: String,
      required: [true, "Review body is required"],
      trim: true,
      maxlength: [1000, "Review cannot exceed 1000 characters"],
    },

    isApproved: {
      type: Boolean,
      default: false, // requires admin approval before showing publicly
    },

    // Admin can hide inappropriate reviews
    isVisible: {
      type: Boolean,
      default: true,
    },

    // Featured reviews appear on the landing page
    isFeatured: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// One review per user per subject
reviewSchema.index({ user: 1, reviewType: 1, course: 1 }, { unique: true });

// Populate user name + avatar automatically
reviewSchema.virtual("userInfo", {
  ref: "User",
  localField: "user",
  foreignField: "_id",
  justOne: true,
});

const Review = mongoose.model("Review", reviewSchema);
export default Review;
