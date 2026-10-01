import mongoose from "mongoose";

// A single connect/disconnect window within one live class for one user.
// Multiple entries handle reconnects (network drop, tab refresh, etc.) without
// creating duplicate top-level Attendance documents.
const sessionWindowSchema = new mongoose.Schema(
  {
    joinedAt: { type: Date, required: true },
    leftAt: { type: Date, default: null }, // null while still connected
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    liveClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveClass",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // "host" or "participant" — recorded at first join, doesn't change even if
    // the mentor briefly drops and rejoins.
    role: {
      type: String,
      enum: ["host", "participant"],
      required: true,
    },

    sessions: { type: [sessionWindowSchema], default: [] },

    firstJoinedAt: { type: Date, default: null },
    lastLeftAt: { type: Date, default: null },

    // Sum of all (leftAt - joinedAt) windows, recomputed on every leave event
    // and finalized when the class ends. Open windows are excluded until closed.
    totalDurationSeconds: { type: Number, default: 0 },

    // Only meaningful for participants — hosts are never marked absent/late.
    // Finalized (not just guessed) once the class status becomes "completed".
    status: {
      type: String,
      enum: ["present", "late", "absent", "pending"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// One attendance document per (liveClass, user) — reconnects append to `sessions`,
// they never create a second document.
attendanceSchema.index({ liveClass: 1, user: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema);