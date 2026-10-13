import crypto from "crypto";
import mongoose from "mongoose";
import Internship from "../models/Internship.model.js";
import InternshipApplication from "../models/InternshipApplication.model.js";
import InternshipEnrollment, { ACCESS_STATUSES } from "../models/InternshipEnrollment.model.js";
import InternshipPayment from "../models/InternshipPayment.model.js";
import User from "../models/User.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import {
  sendEmail,
  FROM,
  internshipOfferTemplate,
  internshipCredentialsTemplate,
  internshipStatusRejectedTemplate,
} from "../utils/email.utils.js";
import { updateApplicationStatusInSheet } from "../utils/sheets.utils.js";
import { generateToken, generateId, escapeRegex } from "../utils/internshipToken.utils.js";
import { buildOfferPdf } from "../utils/internshipOffer.utils.js";
import { deriveDisplayStatus } from "../utils/internshipStatus.utils.js";

const clientUrl = () => process.env.CLIENT_URL || "";
const isId = (v) => mongoose.isValidObjectId(v);
const paging = (q) => {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

// ─────────────────────────────────────────────────────────────────────────────
// APPLICATIONS
// ─────────────────────────────────────────────────────────────────────────────

// @route GET /api/admin/internship-applications
export const listApplications = asyncHandler(async (req, res, next) => {
  const { status, internship, search, payment } = req.query;
  const { page, limit, skip } = paging(req.query);
  const q = {};
  if (internship) {
    if (!isId(internship)) return next(new AppError("Invalid internship.", 400));
    q.internship = internship;
  }
  if (status) q.status = status;
  if (payment) q.paymentStatus = payment;
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    q.$or = [{ name: rx }, { email: rx }, { phone: rx }, { college: rx }];
  }

  const [apps, total] = await Promise.all([
    InternshipApplication.find(q).populate("internship", "title company applicationFee startDate endDate")
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    InternshipApplication.countDocuments(q),
  ]);

  const ids = apps.map((a) => a._id);
  const [enrollments, payments] = await Promise.all([
    InternshipEnrollment.find({ application: { $in: ids } })
      .select("application enrollmentId status accessGrantedAt credentialsSendCount"),
    InternshipPayment.find({ application: { $in: ids } })
      .sort({ createdAt: -1 }).select("application status amount paidAt razorpayPaymentId isDuplicate"),
  ]);
  const enrollByApp = new Map(enrollments.map((e) => [String(e.application), e]));
  const payByApp = new Map();
  for (const p of payments) if (!payByApp.has(String(p.application))) payByApp.set(String(p.application), p);

  const items = apps.map((a) => {
    const enrollment = enrollByApp.get(String(a._id)) || null;
    const latestPayment = payByApp.get(String(a._id)) || null;
    return { ...a.toObject(), displayStatus: deriveDisplayStatus(a, enrollment, latestPayment), enrollment, latestPayment };
  });

  res.json({ success: true, applications: items, pagination: { total, page, pages: Math.ceil(total / limit) } });
});

// @route GET /api/admin/internship-applications/:id
export const getApplication = asyncHandler(async (req, res, next) => {
  if (!isId(req.params.id)) return next(new AppError("Application not found.", 404));
  const application = await InternshipApplication.findById(req.params.id).populate("internship");
  if (!application) return next(new AppError("Application not found.", 404));

  const [enrollment, payments] = await Promise.all([
    InternshipEnrollment.findOne({ application: application._id }),
    InternshipPayment.find({ application: application._id }).sort({ createdAt: -1 }),
  ]);
  res.json({
    success: true,
    application,
    enrollment,
    payments,
    displayStatus: deriveDisplayStatus(application, enrollment, payments[0]),
  });
});

const LEGACY_STATUS = { pending: "applied", reviewed: "under_review", shortlisted: "selected" };
const ADMIN_SETTABLE = ["applied", "under_review", "selected", "rejected", "cancelled"];

// @route PATCH /api/admin/internship-applications/:id/status
// @route PUT   /api/internships/applications/:appId/status  (legacy alias)
export const updateApplicationStatus = asyncHandler(async (req, res, next) => {
  const id = req.params.id || req.params.appId;
  if (!isId(id)) return next(new AppError("Application not found.", 404));

  const status = LEGACY_STATUS[req.body.status] || req.body.status;
  if (!ADMIN_SETTABLE.includes(status)) {
    return next(new AppError("Invalid status. Use Send Offer to move an application to Offer Sent.", 400));
  }

  const application = await InternshipApplication.findById(id).populate("internship", "title company batches");
  if (!application) return next(new AppError("Application not found.", 404));

  if (await InternshipEnrollment.exists({ application: application._id })) {
    return next(new AppError("This application already has an enrollment. Manage it from Enrollments.", 409));
  }
  if (application.status === "offer_sent" && !["rejected", "cancelled"].includes(status)) {
    return next(new AppError("An offer has already been sent. Cancel or reject the application instead.", 409));
  }

  const { batch } = req.body;
  if (typeof batch === "string") {
    if (batch !== "" && !application.internship.batches?.includes(batch)) {
      return next(new AppError("Invalid batch for this internship.", 400));
    }
    application.batch = batch;
  }

  const previous = application.status;
  application.status = status;
  if (["rejected", "cancelled"].includes(status)) {
    application.enrollTokenHash = undefined; // kills any outstanding enrollment link
    application.enrollTokenExpires = undefined;
  }
  await application.save();

  try { await updateApplicationStatusInSheet(application._id.toString(), status); }
  catch (e) { console.error("Sheet update failed:", e.message); }

  if (status === "rejected" && previous !== "rejected") {
    sendEmail({
      from: FROM.internship,
      to: application.email,
      subject: `Application update: ${application.internship.title}`,
      html: internshipStatusRejectedTemplate({ application }),
    }).catch((e) => console.error("Rejection email failed:", e.message));
  }

  res.json({ success: true, application });
});

// @route POST /api/admin/internship-applications/:id/offer
// Body: { startDate?, endDate?, resend? }
export const sendOffer = asyncHandler(async (req, res, next) => {
  if (!isId(req.params.id)) return next(new AppError("Application not found.", 404));
  const application = await InternshipApplication.findById(req.params.id)
    .select("+enrollTokenHash")
    .populate("internship");
  if (!application) return next(new AppError("Application not found.", 404));
  const internship = application.internship;
  if (!internship) return next(new AppError("Internship not found.", 404));

  if (!["selected", "shortlisted", "offer_sent"].includes(application.status)) {
    return next(new AppError("Mark the applicant as Selected before sending an offer.", 400));
  }
  if (await InternshipEnrollment.exists({ application: application._id })) {
    return next(new AppError("This applicant is already enrolled.", 409));
  }
  if (application.status === "offer_sent" && req.body.resend !== true) {
    return next(new AppError("Offer already sent. Use Resend Offer to send it again.", 409));
  }

  const startDate = req.body.startDate || application.offer?.startDate || internship.startDate;
  const endDate = req.body.endDate || application.offer?.endDate || internship.endDate || null;
  if (!startDate || Number.isNaN(new Date(startDate).getTime())) {
    return next(new AppError("A start date is required. Set it on the internship or enter it here.", 400));
  }
  if (endDate && new Date(endDate) < new Date(startDate)) {
    return next(new AppError("End date can't be before the start date.", 400));
  }

  // New token on every send: a resend invalidates the previous link.
  const { raw, hash } = generateToken();
  const days = Number(process.env.ENROLL_LINK_DAYS) || 14;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const offer = {
    offerId: application.offer?.offerId || generateId("TMA-INT"),
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : undefined,
    sentAt: new Date(),
    sentBy: req.user._id,
    sendCount: (application.offer?.sendCount || 0) + 1,
  };

  let pdf;
  try {
    pdf = await buildOfferPdf({ application, internship, offer });
  } catch (e) {
    console.error("Offer letter generation failed:", e.message);
    return next(new AppError("Could not generate the offer letter. Nothing was sent.", 502));
  }

  const enrollUrl = `${clientUrl()}/internship/enroll/${raw}`;
  try {
    await sendEmail({
      from: FROM.internship,
      to: application.email,
      subject: "Internship Offer — Tech Mind Academy",
      html: internshipOfferTemplate({ name: application.name, internship, offer, enrollUrl, expiresAt: expires }),
      attachments: [{ filename: `Offer_Letter_${offer.offerId}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
  } catch (e) {
    console.error("Offer email failed:", e.message);
    return next(new AppError("The offer email could not be sent. Nothing was changed, please try again.", 502));
  }

  application.offer = offer;
  application.status = "offer_sent";
  application.enrollTokenHash = hash;
  application.enrollTokenExpires = expires;
  await application.save();

  try { await updateApplicationStatusInSheet(application._id.toString(), "offer_sent"); }
  catch (e) { console.error("Sheet update failed:", e.message); }

  res.json({ success: true, message: "Offer sent.", offerId: offer.offerId, expiresAt: expires });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────

// @route GET /api/admin/internship-payments
export const listPayments = asyncHandler(async (req, res, next) => {
  const { status, internship } = req.query;
  const { page, limit, skip } = paging(req.query);
  const q = {};
  if (status) q.status = status;
  if (internship) {
    if (!isId(internship)) return next(new AppError("Invalid internship.", 400));
    q.internship = internship;
  }
  const [payments, total] = await Promise.all([
    InternshipPayment.find(q)
      .populate("internship", "title")
      .populate("application", "name email")
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    InternshipPayment.countDocuments(q),
  ]);
  res.json({ success: true, payments, pagination: { total, page, pages: Math.ceil(total / limit) } });
});

// ─────────────────────────────────────────────────────────────────────────────
// ENROLLMENTS
// ─────────────────────────────────────────────────────────────────────────────

// @route GET /api/admin/internship-enrollments
export const listEnrollments = asyncHandler(async (req, res, next) => {
  const { status, internship, search, access } = req.query;
  const { page, limit, skip } = paging(req.query);
  const q = {};
  if (status) q.status = status;
  if (internship) {
    if (!isId(internship)) return next(new AppError("Invalid internship.", 400));
    q.internship = internship;
  }
  if (access === "pending") q.accessGrantedAt = null;
  if (access === "granted") q.accessGrantedAt = { $ne: null };
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    q.$or = [{ name: rx }, { email: rx }, { enrollmentId: rx }];
  }
  const [enrollments, total] = await Promise.all([
    InternshipEnrollment.find(q)
      .populate("internship", "title company")
      .populate("payment", "status amount paidAt isDuplicate")
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    InternshipEnrollment.countDocuments(q),
  ]);
  res.json({ success: true, enrollments, pagination: { total, page, pages: Math.ceil(total / limit) } });
});

// @route GET /api/admin/internship-enrollments/:id
export const getEnrollment = asyncHandler(async (req, res, next) => {
  if (!isId(req.params.id)) return next(new AppError("Enrollment not found.", 404));
  const enrollment = await InternshipEnrollment.findById(req.params.id)
    .populate("internship")
    .populate("payment")
    .populate("user", "name email isVerified lastLogin isActive");
  if (!enrollment) return next(new AppError("Enrollment not found.", 404));
  const application = await InternshipApplication.findById(enrollment.application);
  res.json({ success: true, enrollment, application });
});

// @route POST /api/admin/internship-enrollments/:id/send-credentials
// Body: { resend?: boolean }
//
// The ONLY thing that grants portal access. Requires an authenticated admin JWT
// (see the route), verified payment, and, for a repeat send, an explicit resend flag.
// No passwords are generated or emailed: new accounts get a random unusable
// password and a 72h password-setup link (same token mechanism as password reset).
export const sendCredentials = asyncHandler(async (req, res, next) => {
  if (!isId(req.params.id)) return next(new AppError("Enrollment not found.", 404));
  const resend = req.body?.resend === true;

  // Short lock so a double-click can't send two emails / create two accounts.
  const enrollment = await InternshipEnrollment.findOneAndUpdate(
    {
      _id: req.params.id,
      $or: [{ credentialsLockAt: null }, { credentialsLockAt: { $lt: new Date(Date.now() - 60 * 1000) } }],
    },
    { $set: { credentialsLockAt: new Date() } },
    { new: true }
  );
  if (!enrollment) {
    const exists = await InternshipEnrollment.exists({ _id: req.params.id });
    return next(new AppError(exists ? "A send is already in progress. Please wait a moment." : "Enrollment not found.", exists ? 409 : 404));
  }

  try {
    if (!ACCESS_STATUSES.includes(enrollment.status)) {
      return next(new AppError("This enrollment is not active, so credentials can't be sent.", 409));
    }

    // Payment must be verified by the backend (never inferred from the frontend).
    if (enrollment.amountPaid > 0) {
      const payment = await InternshipPayment.findById(enrollment.payment);
      if (!payment || payment.status !== "paid" || payment.isDuplicate) {
        return next(new AppError("Payment has not been verified for this enrollment.", 402));
      }
    }

    if (enrollment.accessGrantedAt && !resend) {
      return next(new AppError("Credentials already sent. Use Resend Access Email to send them again.", 409));
    }

    const [internship, application] = await Promise.all([
      Internship.findById(enrollment.internship).select("title company"),
      InternshipApplication.findById(enrollment.application).select("offer name"),
    ]);
    if (!internship) return next(new AppError("Internship not found.", 404));

    let user = await User.findOne({ email: enrollment.email });
    const isNew = !user;
    if (isNew) {
      user = new User({
        name: (enrollment.name || "Intern").slice(0, 50),
        email: enrollment.email,
        password: crypto.randomBytes(32).toString("hex"), // never disclosed; hashed by the pre-save hook
        role: "student",
        isVerified: false,
      });
    }
    if (!user.isActive) {
      return next(new AppError("The linked user account is deactivated. Reactivate it first.", 409));
    }

    // Send a setup link to brand-new accounts, and to accounts that were never
    // verified and never logged in (they can't sign in yet).
    const needsSetup = isNew || (!user.isVerified && !user.lastLogin);
    let setupUrl = null;
    if (needsSetup) setupUrl = `${clientUrl()}/reset-password/${user.generatePasswordSetupToken()}`;
    await user.save();

    try {
      await sendEmail({
        from: FROM.internship,
        to: enrollment.email,
        subject: `Your Tech Mind Academy Internship Portal access: ${internship.title}`,
        html: internshipCredentialsTemplate({
          name: enrollment.name,
          email: enrollment.email,
          internship,
          offerId: application?.offer?.offerId,
          enrollmentId: enrollment.enrollmentId,
          portalUrl: `${clientUrl()}/intern/dashboard`,
          loginUrl: `${clientUrl()}/auth`,
          setupUrl,
        }),
      });
    } catch (e) {
      console.error("Credentials email failed:", e.message);
      return next(new AppError("The email could not be sent. Access was not granted, please try again.", 502));
    }

    const now = new Date();
    try {
      await InternshipEnrollment.updateOne(
        { _id: enrollment._id },
        {
          $set: {
            user: user._id,
            accessGrantedAt: enrollment.accessGrantedAt || now,
            credentialsSentAt: now,
            credentialsSentBy: req.user._id,
          },
          $inc: { credentialsSendCount: 1 },
        }
      );
    } catch (e) {
      if (e?.code === 11000) {
        return next(new AppError("This user already has an enrollment for this internship.", 409));
      }
      throw e;
    }
    await InternshipApplication.updateOne({ _id: enrollment.application }, { $set: { user: user._id } });

    res.json({
      success: true,
      message: resend ? "Access email resent." : "Credentials sent.",
      accountCreated: isNew,
      sentAt: now,
    });
  } finally {
    await InternshipEnrollment.updateOne({ _id: enrollment._id }, { $unset: { credentialsLockAt: 1 } });
  }
});

// @route POST /api/admin/internship-enrollments/:id/suspend   Body: { reason? }
export const suspendEnrollment = asyncHandler(async (req, res, next) => {
  if (!isId(req.params.id)) return next(new AppError("Enrollment not found.", 404));
  const enrollment = await InternshipEnrollment.findById(req.params.id);
  if (!enrollment) return next(new AppError("Enrollment not found.", 404));
  if (enrollment.status === "suspended") return next(new AppError("Already suspended.", 409));
  if (!ACCESS_STATUSES.includes(enrollment.status)) {
    return next(new AppError("Only active enrollments can be suspended.", 409));
  }
  enrollment.statusBeforeSuspend = enrollment.status;
  enrollment.status = "suspended";
  enrollment.suspendedAt = new Date();
  enrollment.suspendReason = String(req.body?.reason || "").slice(0, 500);
  await enrollment.save();
  res.json({ success: true, enrollment });
});

// @route POST /api/admin/internship-enrollments/:id/reinstate
export const reinstateEnrollment = asyncHandler(async (req, res, next) => {
  if (!isId(req.params.id)) return next(new AppError("Enrollment not found.", 404));
  const enrollment = await InternshipEnrollment.findById(req.params.id);
  if (!enrollment) return next(new AppError("Enrollment not found.", 404));
  if (enrollment.status !== "suspended") return next(new AppError("Enrollment is not suspended.", 409));
  enrollment.status = ACCESS_STATUSES.includes(enrollment.statusBeforeSuspend) ? enrollment.statusBeforeSuspend : "active";
  enrollment.statusBeforeSuspend = undefined;
  enrollment.suspendedAt = undefined;
  enrollment.suspendReason = "";
  await enrollment.save();
  res.json({ success: true, enrollment });
});