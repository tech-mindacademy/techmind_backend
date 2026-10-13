import crypto from "crypto";
import mongoose from "mongoose";
import Application, {
  STATUSES,
  MANUAL_TRANSITIONS,
  STATUS_TIMESTAMP,
} from "../models/IndustrialTrainingApplication.model.js";
import User from "../models/User.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { getRazorpay } from "../utils/Razorpay.utils.js";
import {
  sendEmail,
  FROM,
  industrialTrainingReceivedTemplate,
  industrialTrainingAdminTemplate,
  industrialTrainingPaymentLinkTemplate,
  industrialTrainingCredentialsTemplate,
} from "../utils/email.utils.js";

const clientUrl = () => process.env.CLIENT_URL || "";
const adminEmail = () => process.env.ADMIN_NOTIFY_EMAIL || process.env.SMTP_USER;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const findApplication = async (id) =>
  mongoose.isValidObjectId(id) ? Application.findById(id) : null;

const toContact = (phone = "") => {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  return /^\+\d{10,15}$/.test(cleaned) ? cleaned : undefined;
};

const mailPaymentLink = (application) =>
  sendEmail({
    from: FROM.training,
    to: application.email,
    subject: "Industrial Training Payment Link",
    html: industrialTrainingPaymentLinkTemplate({ application }),
  });

// ─── Public ──────────────────────────────────────────────────────────────────

// @route POST /api/industrial-training/apply
export const apply = asyncHandler(async (req, res, next) => {
  const b = req.body;
  const email = String(b.email).toLowerCase().trim();

  const open = await Application.exists({
    email,
    status: { $nin: ["REJECTED", "COMPLETED"] },
  });
  if (open) {
    return next(new AppError("An application with this email is already in progress.", 409));
  }

  const application = await Application.create({
    user: req.user?._id || null,
    name: b.name,
    email,
    phone: b.phone,
    college: b.college,
    course: b.course,
    branch: b.branch,
    semester: b.semester,
    domain: b.domain,
    duration: b.duration,
    preferredStartDate: b.preferredStartDate || undefined,
    resumeUrl: b.resumeUrl || undefined,
    skills: b.skills || undefined,
    linkedIn: b.linkedIn || undefined,
    github: b.github || undefined,
    message: b.message || undefined,
  });

  sendEmail({
    from: FROM.training,
    to: application.email,
    subject: "Industrial Training application received",
    html: industrialTrainingReceivedTemplate({ application }),
  }).catch((e) => console.error("Applicant email failed:", e.message));

  sendEmail({
    from: FROM.training,
    to: adminEmail(),
    subject: `New Industrial Training application: ${application.name}`,
    html: industrialTrainingAdminTemplate({
      application,
      reviewUrl: `${clientUrl()}/admin/industrial-training`,
    }),
  }).catch((e) => console.error("Admin email failed:", e.message));

  res.status(201).json({
    success: true,
    message: "Application received. Our team will contact you on the phone number provided.",
    applicationId: application._id,
  });
});

// @route GET /api/industrial-training/my-access   (private)
// The first portal visit after credentials were sent marks the training as started.
export const getMyAccess = asyncHandler(async (req, res) => {
  await Application.updateMany(
    { user: req.user._id, status: "CREDENTIALS_SENT", "payment.status": "paid" },
    { $set: { status: "ACTIVE", startedAt: new Date() } }
  );

  const applications = await Application.find({
    user: req.user._id,
    status: { $in: ["CREDENTIALS_SENT", "ACTIVE", "COMPLETED"] },
    "payment.status": "paid",
  }).sort({ createdAt: -1 });

  res.json({
    success: true,
    access: applications.map((a) => ({
      applicationId: a._id,
      title: `Industrial Training: ${a.domain}`,
      domain: a.domain,
      duration: a.duration,
      status: a.status,
      canJoinPortal: a.status !== "COMPLETED",
    })),
  });
});

// ─── Admin ───────────────────────────────────────────────────────────────────

// @route GET /api/industrial-training/applications
export const listApplications = asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const q = {};
  if (STATUSES.includes(status)) q.status = status;
  if (search) {
    const rx = { $regex: escapeRegex(String(search)), $options: "i" };
    q.$or = [{ name: rx }, { email: rx }, { phone: rx }, { college: rx }];
  }

  const [applications, total, grouped, paid] = await Promise.all([
    Application.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Application.countDocuments(q),
    Application.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Application.countDocuments({ "payment.status": "paid" }),
  ]);

  const by = Object.fromEntries(grouped.map((g) => [g._id, g.n]));
  const stats = {
    total: grouped.reduce((sum, g) => sum + g.n, 0),
    applied: by.APPLIED || 0,
    paymentPending: by.PAYMENT_PENDING || 0,
    paid,
    active: by.ACTIVE || 0,
    completed: by.COMPLETED || 0,
  };

  res.json({
    success: true,
    applications,
    stats,
    defaultFee: Number(process.env.INDUSTRIAL_TRAINING_FEE) || 0,
    pagination: { total, page, pages: Math.ceil(total / limit) },
  });
});

// @route GET /api/industrial-training/applications/:id
export const getApplication = asyncHandler(async (req, res, next) => {
  const application = await findApplication(req.params.id);
  if (!application) return next(new AppError("Application not found.", 404));
  res.json({ success: true, application });
});

// @route PATCH /api/industrial-training/applications/:id/status
export const updateStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  const application = await findApplication(req.params.id);
  if (!application) return next(new AppError("Application not found.", 404));

  if (!(MANUAL_TRANSITIONS[application.status] || []).includes(status)) {
    return next(new AppError(`Cannot change status from ${application.status} to ${status}.`, 409));
  }

  if (status === "REJECTED" && application.payment.status === "link_sent") {
    try {
      await getRazorpay().paymentLink.cancel(application.payment.linkId);
    } catch (e) {
      console.error("Payment link cancel failed:", e?.error?.description || e.message);
    }
    application.payment.status = "cancelled";
  }

  application.status = status;
  application[STATUS_TIMESTAMP[status]] = new Date();
  await application.save();

  res.json({ success: true, application });
});

// @route POST /api/industrial-training/applications/:id/payment-link
// Body: { amount?: number (INR), resend?: boolean }
export const sendPaymentLink = asyncHandler(async (req, res, next) => {
  const resend = req.body?.resend === true;
  const application = await findApplication(req.params.id);
  if (!application) return next(new AppError("Application not found.", 404));

  if (application.status === "PAYMENT_PENDING") {
    if (!resend || !application.payment.linkUrl) {
      return next(new AppError("A payment link has already been sent. Use Resend to email it again.", 409));
    }
    try {
      await mailPaymentLink(application);
    } catch (e) {
      console.error("Payment link email failed:", e.message);
      return next(new AppError("Unable to send the email. Please try again.", 502));
    }
    return res.json({ success: true, message: "Payment link resent." });
  }

  if (application.status !== "CONTACTED") {
    return next(new AppError("Mark the applicant as contacted before sending a payment link.", 409));
  }

  const rupees = Number(req.body?.amount ?? process.env.INDUSTRIAL_TRAINING_FEE);
  if (!Number.isFinite(rupees) || rupees < 1 || rupees > 500000) {
    return next(new AppError("Enter a valid training fee.", 400));
  }
  const amount = Math.round(rupees * 100);

  // Claim the transition first so a double click can't create two links.
  const claimed = await Application.findOneAndUpdate(
    { _id: application._id, status: "CONTACTED" },
    { $set: { status: "PAYMENT_PENDING" } },
    { new: true }
  );
  if (!claimed) return next(new AppError("This application was just updated. Refresh and try again.", 409));

  let link;
  try {
    link = await getRazorpay().paymentLink.create({
      amount,
      currency: "INR",
      accept_partial: false,
      reference_id: `ita_${claimed._id}_${Date.now().toString(36)}`,
      description: `Industrial Training: ${claimed.domain} (${claimed.duration})`,
      customer: { name: claimed.name, email: claimed.email, contact: toContact(claimed.phone) },
      notify: { sms: false, email: false },
      reminder_enable: false,
      expire_by: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      notes: { applicationId: String(claimed._id) },
    });
  } catch (e) {
    console.error("Payment link creation failed:", e?.error?.description || e.message);
    await Application.updateOne({ _id: claimed._id }, { $set: { status: "CONTACTED" } });
    return next(new AppError("Unable to create the payment link. Please try again.", 502));
  }

  claimed.payment = {
    status: "link_sent",
    linkId: link.id,
    linkUrl: link.short_url,
    amount,
    currency: "INR",
  };
  await claimed.save();

  try {
    await mailPaymentLink(claimed);
  } catch (e) {
    console.error("Payment link email failed:", e.message);
    return next(new AppError("The payment link was created but the email failed. Use Resend to send it again.", 502));
  }
  await Application.updateOne({ _id: claimed._id }, { $set: { paymentLinkSentAt: new Date() } });

  res.json({ success: true, message: "Payment link sent." });
});

// @route POST /api/industrial-training/payment/webhook   (Razorpay -> server)
// Needs the raw request body for signature verification (see server.js).
export const razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.get("x-razorpay-signature");
  if (!secret || !signature || !req.rawBody) {
    return res.status(400).json({ success: false });
  }

  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  const valid =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!valid) return res.status(400).json({ success: false });

  const { event, payload } = req.body;
  const link = payload?.payment_link?.entity;
  if (!link?.id) return res.json({ received: true });

  try {
    if (event === "payment_link.paid") {
      const payment = payload.payment?.entity;

      // Filtering on payment.status makes repeated deliveries a no-op.
      const updated = await Application.findOneAndUpdate(
        {
          "payment.linkId": link.id,
          "payment.status": { $ne: "paid" },
          "payment.amount": link.amount_paid,
        },
        {
          $set: {
            "payment.status": "paid",
            "payment.paymentId": payment?.id,
            "payment.method": payment?.method,
            "payment.paidAt": new Date(),
          },
        },
        { new: true }
      );

      if (updated) {
        await Application.updateOne(
          { _id: updated._id, status: "PAYMENT_PENDING" },
          { $set: { status: "PAID" } }
        );
      } else {
        const existing = await Application.findOne({ "payment.linkId": link.id }).select("payment");
        if (existing && existing.payment.status !== "paid") {
          console.error(
            `Razorpay amount mismatch for link ${link.id}: paid ${link.amount_paid}, expected ${existing.payment.amount}`
          );
        }
      }
    } else if (event === "payment_link.expired" || event === "payment_link.cancelled") {
      await Application.updateOne(
        { "payment.linkId": link.id, "payment.status": "link_sent" },
        { $set: { "payment.status": event === "payment_link.expired" ? "expired" : "cancelled" } }
      );
    }
    res.json({ received: true });
  } catch (e) {
    console.error("Razorpay webhook failed:", e.message);
    res.status(500).json({ success: false }); // Razorpay retries
  }
};

// @route POST /api/industrial-training/applications/:id/send-credentials
// Body: { resend?: boolean }
// Creates the portal account if needed and emails the access details. No
// password is generated or emailed: new accounts get a random unusable password
// and a 72 hour set-password link.
export const sendCredentials = asyncHandler(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next(new AppError("Application not found.", 404));
  const resend = req.body?.resend === true;

  // Short lock so a double click can't send two emails or create two accounts.
  const application = await Application.findOneAndUpdate(
    {
      _id: req.params.id,
      $or: [{ credentialsLockAt: null }, { credentialsLockAt: { $lt: new Date(Date.now() - 60 * 1000) } }],
    },
    { $set: { credentialsLockAt: new Date() } },
    { new: true }
  );
  if (!application) {
    const exists = await Application.exists({ _id: req.params.id });
    return next(new AppError(exists ? "A send is already in progress." : "Application not found.", exists ? 409 : 404));
  }

  try {
    if (application.payment.status !== "paid") {
      return next(new AppError("Payment has not been verified for this application.", 402));
    }
    if (!["PAID", "CREDENTIALS_SENT", "ACTIVE"].includes(application.status)) {
      return next(new AppError("Credentials can't be sent for this application.", 409));
    }
    if (application.status !== "PAID" && !resend) {
      return next(new AppError("Credentials were already sent. Use Resend to send them again.", 409));
    }

    let user = await User.findOne({ email: application.email });
    const isNew = !user;
    if (isNew) {
      user = new User({
        name: application.name.slice(0, 50),
        email: application.email,
        password: crypto.randomBytes(32).toString("hex"),
        role: "student",
        isVerified: true,
      });
    }
    if (!user.isActive) return next(new AppError("The linked user account is deactivated.", 409));

    const needsSetup = isNew || !user.lastLogin;
    const setupUrl = needsSetup ? `${clientUrl()}/reset-password/${user.generatePasswordSetupToken()}` : null;
    await user.save();

    try {
      await sendEmail({
        from: FROM.training,
        to: application.email,
        subject: "Industrial Training Portal Credentials",
        html: industrialTrainingCredentialsTemplate({
          name: application.name,
          email: application.email,
          portalUrl: `${clientUrl()}/training/dashboard`,
          setupUrl,
        }),
      });
    } catch (e) {
      console.error("Credentials email failed:", e.message);
      return next(new AppError("Unable to send the email. Please try again.", 502));
    }

    await Application.updateOne(
      { _id: application._id },
      {
        $set: {
          user: user._id,
          status: application.status === "PAID" ? "CREDENTIALS_SENT" : application.status,
          credentialsSentAt: new Date(),
        },
        $inc: { credentialsSendCount: 1 },
      }
    );

    res.json({ success: true, message: resend ? "Credentials resent." : "Credentials sent.", accountCreated: isNew });
  } finally {
    await Application.updateOne({ _id: application._id }, { $unset: { credentialsLockAt: 1 } });
  }
});
