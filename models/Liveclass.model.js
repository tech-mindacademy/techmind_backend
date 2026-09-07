import mongoose from "mongoose";
import crypto from "crypto";

// ─── Embedded recording metadata ──────────────────────────────────────────────
// Kept as a subdocument array (not a separate model) since recordings only ever
// make sense in the context of a single LiveClass and are always fetched with it.
const recordingSchema = new mongoose.Schema(
  {
    egressId: { type: String }, // LiveKit Egress ID, set once egress starts
    status: {
      type: String,
      enum: ["pending", "recording", "processing", "completed", "failed"],
      default: "pending",
    },
    storageProvider: {
      type: String,
      enum: ["s3", "gcs", "azure", "cloudinary", "none"],
      default: "none",
    },
    url: { type: String, default: "" }, // final playable URL once uploaded
    fileKey: { type: String, default: "" }, // bucket/object key if applicable
    startedAt: { type: Date },
    endedAt: { type: Date },
    durationSeconds: { type: Number, default: 0 },
    errorMessage: { type: String },
  },
  { _id: true, timestamps: true }
);

const liveClassSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [150, "Title cannot exceed 150 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
      default: "",
    },

    internship: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Internship",
      required: [true, "Internship is required"],
      index: true,
    },
    // Free-text batch label. Must match Internship.batches (validated in controller)
    // or be empty (meaning: open to all shortlisted applicants of this internship).
    batch: { type: String, trim: true, default: "" },

    // No separate mentor/instructor role exists in this project — any admin can be
    // assigned as the class host. Enforced to role "admin" at controller level.
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A host (admin) must be assigned"],
    },

    // Unique LiveKit room name, generated once and never reused across classes.
    liveKitRoomName: {
      type: String,
      unique: true,
      required: true,
      default: () => `tv-live-${crypto.randomBytes(8).toString("hex")}`,
    },

    scheduledDate: { type: Date, required: [true, "Scheduled date is required"] },
    scheduledStartTime: { type: String, required: [true, "Start time is required"] }, // "HH:mm"
    scheduledEndTime: { type: String, required: [true, "End time is required"] }, // "HH:mm"

    actualStartTime: { type: Date, default: null },
    actualEndTime: { type: Date, default: null },

    status: {
      type: String,
      enum: ["scheduled", "live", "completed", "cancelled"],
      default: "scheduled",
      index: true,
    },
    cancelReason: { type: String, default: "" },

    // ── Participant/session settings ────────────────────────────────────────
    settings: {
      micOnJoin: { type: Boolean, default: false },
      cameraOnJoin: { type: Boolean, default: false },
      allowStudentScreenShare: { type: Boolean, default: false },
      allowChat: { type: Boolean, default: true },
      allowRaiseHand: { type: Boolean, default: true },
      maxParticipants: { type: Number, default: 100, min: 2, max: 500 },
    },

    // ── Attendance business rule ─────────────────────────────────────────────
    // Minimum minutes connected within the session window to count as "present"
    // rather than "late"/"absent". Used by the attendance finalization job.
    minAttendanceMinutes: { type: Number, default: 10, min: 0 },

    // ── Recording ─────────────────────────────────────────────────────────────
    recordingEnabled: { type: Boolean, default: false },
    recordings: [recordingSchema],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

liveClassSchema.index({ internship: 1, scheduledDate: -1 });
liveClassSchema.index({ mentor: 1, status: 1 });

export default mongoose.model("LiveClass", liveClassSchema);