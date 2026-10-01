import LiveClass from "../models/Liveclass.model.js";
import Attendance from "../models/Attendance.model.js";
import Internship from "../models/Internship.model.js";
import InternshipApplication from "../models/InternshipApplication.model.js";
import User from "../models/User.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { sendEmail, FROM } from "../utils/email.utils.js";
import {
  liveClassScheduledTemplate,
  liveClassLiveTemplate,
} from "../utils/Liveclassemail.template.js";
import {
  createLiveKitToken,
  ensureRoom,
  closeRoom,
} from "../utils/Livekit.utils.js";

const LATE_GRACE_MINUTES = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Applications eligible for a given internship/batch: shortlisted + (paid or free) + linked to an account. */
async function getEligibleApplications(internship, batch) {
  const feeRequired = internship.applicationFee > 0;
  const filter = {
    internship: internship._id,
    status: "shortlisted",
    user: { $ne: null },
  };
  if (feeRequired) filter.paymentStatus = "paid";
  if (batch) filter.batch = { $in: [batch, ""] }; // batch-open apps (batch:"") always included
  return InternshipApplication.find(filter);
}

/** Verifies the given user may join this specific live class as a participant. Throws AppError if not. */
async function verifyParticipantEligibility(liveClass, internship, userId) {
  const application = await InternshipApplication.findOne({
    internship: internship._id,
    user: userId,
    status: "shortlisted",
  });

  if (!application) {
    throw new AppError(
      "You are not enrolled in this internship, or your application hasn't been shortlisted.",
      403
    );
  }

  const feeRequired = internship.applicationFee > 0;
  if (feeRequired && application.paymentStatus !== "paid") {
    throw new AppError(
      "Please complete your internship application payment to access live classes.",
      402
    );
  }

  if (liveClass.batch && application.batch && liveClass.batch !== application.batch) {
    throw new AppError("This live class is for a different batch.", 403);
  }
  if (liveClass.batch && !application.batch) {
    throw new AppError("Your batch hasn't been assigned yet. Contact support.", 403);
  }

  return application;
}

async function notifyEligibleStudents(liveClass, internship, type) {
  try {
    const apps = await getEligibleApplications(internship, liveClass.batch);
    const template = type === "live" ? liveClassLiveTemplate : liveClassScheduledTemplate;
    await Promise.all(
      apps.map((application) =>
        sendEmail({
          from: FROM.internship,
          to: application.email,
          subject:
            type === "live"
              ? `🔴 Live Now: ${liveClass.title}`
              : `📅 Live Class Scheduled: ${liveClass.title}`,
          html: template({ application, internship, liveClass }),
        }).catch((e) => console.error("Live class email failed:", e.message))
      )
    );
  } catch (e) {
    console.error("notifyEligibleStudents failed:", e.message);
  }
}

function computeAttendanceStatus(attendance, liveClass) {
  const totalSeconds = attendance.totalDurationSeconds || 0;
  const minSeconds = (liveClass.minAttendanceMinutes || 0) * 60;

  if (!attendance.firstJoinedAt || totalSeconds < minSeconds) return "absent";

  const referenceStart = liveClass.actualStartTime || liveClass.scheduledDate;
  const lateThreshold = new Date(referenceStart).getTime() + LATE_GRACE_MINUTES * 60 * 1000;
  if (new Date(attendance.firstJoinedAt).getTime() > lateThreshold) return "late";

  return "present";
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — CRUD
// ─────────────────────────────────────────────────────────────────────────────

// @route POST /api/live-classes   @access Admin
export const createLiveClass = asyncHandler(async (req, res, next) => {
  const {
    title, description, internship: internshipId, batch,
    mentor, scheduledDate, scheduledStartTime, scheduledEndTime,
    recordingEnabled, settings, minAttendanceMinutes,
  } = req.body;

  const internship = await Internship.findById(internshipId);
  if (!internship) return next(new AppError("Internship not found.", 404));

  if (batch && !internship.batches?.includes(batch)) {
    return next(new AppError("Invalid batch for this internship.", 400));
  }

  const mentorUser = await User.findById(mentor || req.user._id);
  if (!mentorUser || mentorUser.role !== "admin") {
    return next(new AppError("The assigned host must be an admin account.", 400));
  }

  const liveClass = await LiveClass.create({
    title,
    description,
    internship: internship._id,
    batch: batch || "",
    mentor: mentorUser._id,
    scheduledDate,
    scheduledStartTime,
    scheduledEndTime,
    recordingEnabled: !!recordingEnabled,
    settings: settings || undefined,
    minAttendanceMinutes,
    createdBy: req.user._id,
  });

  notifyEligibleStudents(liveClass, internship, "scheduled"); // fire-and-forget

  res.status(201).json({ success: true, liveClass });
});

// @route GET /api/live-classes   @access Admin
export const getAllLiveClasses = asyncHandler(async (req, res) => {
  const { internship, status, batch } = req.query;
  const filter = {};
  if (internship) filter.internship = internship;
  if (status) filter.status = status;
  if (batch) filter.batch = batch;

  const liveClasses = await LiveClass.find(filter)
    .populate("internship", "title company")
    .populate("mentor", "name email")
    .sort({ scheduledDate: -1 });

  res.json({ success: true, count: liveClasses.length, liveClasses });
});

// @route GET /api/live-classes/:id   @access Admin or eligible participant (checked below)
export const getLiveClassById = asyncHandler(async (req, res, next) => {
  const liveClass = await LiveClass.findById(req.params.id)
    .populate("internship", "title company applicationFee batches")
    .populate("mentor", "name email");
  if (!liveClass) return next(new AppError("Live class not found.", 404));

  if (req.user.role !== "admin") {
    try {
      await verifyParticipantEligibility(liveClass, liveClass.internship, req.user._id);
    } catch (err) {
      return next(err);
    }
  }

  res.json({ success: true, liveClass });
});

// @route PUT /api/live-classes/:id   @access Admin
export const updateLiveClass = asyncHandler(async (req, res, next) => {
  const liveClass = await LiveClass.findById(req.params.id);
  if (!liveClass) return next(new AppError("Live class not found.", 404));
  if (liveClass.status === "completed")
    return next(new AppError("Cannot edit a completed class.", 400));

  const allowedFields = [
    "title", "description", "batch", "mentor", "scheduledDate",
    "scheduledStartTime", "scheduledEndTime", "recordingEnabled",
    "settings", "minAttendanceMinutes",
  ];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) liveClass[field] = req.body[field];
  }
  await liveClass.save();

  res.json({ success: true, liveClass });
});

// @route POST /api/live-classes/:id/cancel   @access Admin
export const cancelLiveClass = asyncHandler(async (req, res, next) => {
  const liveClass = await LiveClass.findById(req.params.id);
  if (!liveClass) return next(new AppError("Live class not found.", 404));
  if (["completed", "cancelled"].includes(liveClass.status))
    return next(new AppError(`Class is already ${liveClass.status}.`, 400));

  liveClass.status = "cancelled";
  liveClass.cancelReason = req.body.reason || "Cancelled by admin";
  await liveClass.save();

  try { await closeRoom(liveClass.liveKitRoomName); } catch { /* room may not exist yet */ }

  res.json({ success: true, liveClass });
});

// @route DELETE /api/live-classes/:id   @access Admin
export const deleteLiveClass = asyncHandler(async (req, res, next) => {
  const liveClass = await LiveClass.findById(req.params.id);
  if (!liveClass) return next(new AppError("Live class not found.", 404));
  if (liveClass.status === "live")
    return next(new AppError("Cannot delete a class that is currently live.", 400));

  await Attendance.deleteMany({ liveClass: liveClass._id });
  await liveClass.deleteOne();

  res.json({ success: true, message: "Live class deleted." });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE — start / end
// ─────────────────────────────────────────────────────────────────────────────

// @route POST /api/live-classes/:id/start   @access Admin (host)
export const startLiveClass = asyncHandler(async (req, res, next) => {
  const liveClass = await LiveClass.findById(req.params.id).populate("internship");
  if (!liveClass) return next(new AppError("Live class not found.", 404));
  if (liveClass.status === "cancelled")
    return next(new AppError("This class was cancelled.", 400));
  if (liveClass.status === "completed")
    return next(new AppError("This class already ended.", 400));

  if (liveClass.status !== "live") {
    await ensureRoom(liveClass.liveKitRoomName, liveClass.settings?.maxParticipants);
    liveClass.status = "live";
    liveClass.actualStartTime = new Date();
    await liveClass.save();
    notifyEligibleStudents(liveClass, liveClass.internship, "live"); // fire-and-forget
  }

  res.json({ success: true, liveClass });
});

// @route POST /api/live-classes/:id/end   @access Admin (host)
export const endLiveClass = asyncHandler(async (req, res, next) => {
  const liveClass = await LiveClass.findById(req.params.id).populate("internship");
  if (!liveClass) return next(new AppError("Live class not found.", 404));
  if (liveClass.status !== "live")
    return next(new AppError("This class is not currently live.", 400));

  liveClass.status = "completed";
  liveClass.actualEndTime = new Date();
  await liveClass.save();

  try { await closeRoom(liveClass.liveKitRoomName); } catch (e) {
    console.error("closeRoom failed:", e.message);
  }

  await finalizeAttendance(liveClass);

  res.json({ success: true, liveClass });
});

async function finalizeAttendance(liveClass) {
  const now = new Date();

  // Close any still-open session windows.
  const openAttendances = await Attendance.find({
    liveClass: liveClass._id,
    "sessions.leftAt": null,
  });
  for (const att of openAttendances) {
    let changed = false;
    for (const session of att.sessions) {
      if (!session.leftAt) {
        session.leftAt = now;
        att.totalDurationSeconds += Math.max(
          0,
          Math.round((session.leftAt - session.joinedAt) / 1000)
        );
        changed = true;
      }
    }
    if (changed) {
      att.lastLeftAt = now;
      if (att.role === "participant") att.status = computeAttendanceStatus(att, liveClass);
      await att.save();
    }
  }

  // Ensure every eligible participant (even those who never joined) gets a
  // finalized attendance record — defaulting to "absent" if none exists.
  const eligibleApps = await getEligibleApplications(liveClass.internship, liveClass.batch);
  for (const app of eligibleApps) {
    if (!app.user) continue;
    const exists = await Attendance.findOne({ liveClass: liveClass._id, user: app.user });
    if (!exists) {
      await Attendance.create({
        liveClass: liveClass._id,
        user: app.user,
        role: "participant",
        sessions: [],
        status: "absent",
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JOIN / LEAVE — the security-critical path
// ─────────────────────────────────────────────────────────────────────────────

// @route POST /api/live-classes/:id/join   @access Private
export const joinLiveClass = asyncHandler(async (req, res, next) => {
  const liveClass = await LiveClass.findById(req.params.id).populate("internship");
  if (!liveClass) return next(new AppError("Live class not found.", 404));
  if (liveClass.status === "cancelled")
    return next(new AppError("This class was cancelled.", 400));
  if (liveClass.status === "completed")
    return next(new AppError("This class has already ended.", 400));

  const isHost = req.user.role === "admin";
  let role = "participant";

  if (isHost) {
    role = "host";
  } else {
    // Throws AppError (403/402) if not eligible — never falls through silently.
    await verifyParticipantEligibility(liveClass, liveClass.internship, req.user._id);

    if (liveClass.status !== "live") {
      return next(new AppError("The class hasn't started yet. Please wait for the host.", 400));
    }

    const maxParticipants = liveClass.settings?.maxParticipants || 100;
    const currentCount = await Attendance.countDocuments({
      liveClass: liveClass._id,
      role: "participant",
      "sessions.leftAt": null,
    });
    if (currentCount >= maxParticipants) {
      return next(new AppError("This class has reached its participant limit.", 400));
    }
  }

  // Host joining before the class is live auto-starts it (same effect as
  // calling /start explicitly — kept for a smoother "click Join to go live" UX).
  if (isHost && liveClass.status === "scheduled") {
    await ensureRoom(liveClass.liveKitRoomName, liveClass.settings?.maxParticipants);
    liveClass.status = "live";
    liveClass.actualStartTime = new Date();
    await liveClass.save();
    notifyEligibleStudents(liveClass, liveClass.internship, "live");
  }

  const token = await createLiveKitToken({
    roomName: liveClass.liveKitRoomName,
    identity: req.user._id.toString(), // derived from the verified JWT — never client-supplied
    name: req.user.name,
    role,
    allowScreenShare: role === "host" || !!liveClass.settings?.allowStudentScreenShare,
    maxParticipants: liveClass.settings?.maxParticipants,
  });

  // Attendance: upsert + append a new session window (dedupes reconnects —
  // one Attendance doc per user per class, many session windows inside it).
  const now = new Date();
  let attendance = await Attendance.findOne({ liveClass: liveClass._id, user: req.user._id });
  if (!attendance) {
    attendance = new Attendance({
      liveClass: liveClass._id,
      user: req.user._id,
      role,
      firstJoinedAt: now,
      sessions: [{ joinedAt: now, leftAt: null }],
    });
  } else {
    // Close any dangling open session before opening a new one (covers a
    // client that crashed without calling /leave).
    const openSession = attendance.sessions.find((s) => !s.leftAt);
    if (openSession) {
      openSession.leftAt = now;
      attendance.totalDurationSeconds += Math.max(
        0,
        Math.round((openSession.leftAt - openSession.joinedAt) / 1000)
      );
    }
    attendance.sessions.push({ joinedAt: now, leftAt: null });
    if (!attendance.firstJoinedAt) attendance.firstJoinedAt = now;
  }
  await attendance.save();

  res.json({
    success: true,
    token,
    url: process.env.LIVEKIT_URL,
    roomName: liveClass.liveKitRoomName,
    role,
    liveClass: {
      _id: liveClass._id,
      title: liveClass.title,
      status: liveClass.status,
      settings: liveClass.settings,
    },
  });
});

// @route POST /api/live-classes/:id/leave   @access Private
// Best-effort — called on unmount/beforeunload via fetch(keepalive) or sendBeacon.
export const leaveLiveClass = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findOne({
    liveClass: req.params.id,
    user: req.user._id,
  });
  if (!attendance) return res.json({ success: true }); // nothing to close

  const openSession = attendance.sessions.find((s) => !s.leftAt);
  if (openSession) {
    const now = new Date();
    openSession.leftAt = now;
    attendance.totalDurationSeconds += Math.max(
      0,
      Math.round((openSession.leftAt - openSession.joinedAt) / 1000)
    );
    attendance.lastLeftAt = now;
    await attendance.save();
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE (admin view)
// ─────────────────────────────────────────────────────────────────────────────

// @route GET /api/live-classes/:id/attendance   @access Admin
export const getAttendanceForClass = asyncHandler(async (req, res, next) => {
  const liveClass = await LiveClass.findById(req.params.id);
  if (!liveClass) return next(new AppError("Live class not found.", 404));

  const attendance = await Attendance.find({ liveClass: liveClass._id })
    .populate("user", "name email")
    .sort({ role: 1, firstJoinedAt: 1 });

  res.json({ success: true, count: attendance.length, attendance });
});

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT — Intern Portal listing
// ─────────────────────────────────────────────────────────────────────────────

// @route GET /api/live-classes/my-classes   @access Private (requireInternAccess)
export const getMyLiveClasses = asyncHandler(async (req, res) => {
  const internshipIds = req.internApplications.map((a) => a.internship._id);
  const batchByInternship = new Map(
    req.internApplications.map((a) => [a.internship._id.toString(), a.batch])
  );

  const liveClasses = await LiveClass.find({
    internship: { $in: internshipIds },
    status: { $ne: "cancelled" },
  })
    .populate("internship", "title company")
    .populate("mentor", "name")
    .sort({ scheduledDate: 1 });

  // Filter out classes scoped to a batch the student isn't part of.
  const visible = liveClasses.filter((lc) => {
    const myBatch = batchByInternship.get(lc.internship._id.toString());
    return !lc.batch || lc.batch === myBatch;
  });

  const grouped = {
    live: visible.filter((c) => c.status === "live"),
    upcoming: visible.filter((c) => c.status === "scheduled"),
    completed: visible.filter((c) => c.status === "completed"),
  };

  res.json({ success: true, ...grouped });
});