import crypto from "crypto";
import InternshipApplication from "../models/InternshipApplication.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { getRazorpay } from "../utils/Razorpay.utils.js";
import { sendEmail, FROM } from "../utils/email.utils.js";
import { internshipPaymentConfirmedTemplate } from "../utils/Liveclassemail.template.js";

// POST /api/internships/applications/:appId/checkout
// @access Private (the applicant's own account)
export const createInternshipCheckout = asyncHandler(async (req, res, next) => {
  const application = await InternshipApplication.findById(req.params.appId).populate("internship");
  if (!application) return next(new AppError("Application not found.", 404));

  if (!application.user || application.user.toString() !== req.user._id.toString())
    return next(new AppError("You are not authorized to pay for this application.", 403));

  const internship = application.internship;
  if (!internship || !internship.isActive)
    return next(new AppError("Internship not found or no longer active.", 404));

  if (!internship.applicationFee || internship.applicationFee <= 0)
    return next(new AppError("This internship does not require payment.", 400));

  if (application.paymentStatus === "paid")
    return res.status(200).json({ success: true, alreadyPaid: true, message: "Already paid." });

  const amountInPaise = Math.round(internship.applicationFee * 100);

  const razorpayOrder = await getRazorpay().orders.create({
    amount: amountInPaise,
    currency: "INR",
    receipt: `intern_${application._id}`,
    notes: {
      applicationId: application._id.toString(),
      internshipId: internship._id.toString(),
      userId: req.user._id.toString(),
    },
  });

  application.paymentStatus = "pending";
  application.razorpayOrderId = razorpayOrder.id;
  await application.save();

  res.status(200).json({
    success: true,
    orderId: razorpayOrder.id,
    amount: amountInPaise,
    currency: "INR",
    keyId: process.env.RAZORPAY_KEY_ID,
    internshipTitle: internship.title,
    applicationId: application._id,
    studentName: req.user.name,
    studentEmail: req.user.email,
  });
});

// POST /api/internships/applications/:appId/verify-payment
// @access Private (the applicant's own account)
export const verifyInternshipPayment = asyncHandler(async (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    return next(new AppError("Missing payment details.", 400));

  // Server-side HMAC verification — this is the ONLY thing that can ever
  // flip paymentStatus to "paid". The frontend cannot set this itself.
  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSig !== razorpay_signature)
    return next(new AppError("Payment verification failed. Invalid signature.", 400));

  const application = await InternshipApplication.findById(req.params.appId).populate("internship");
  if (!application) return next(new AppError("Application not found.", 404));
  if (!application.user || application.user.toString() !== req.user._id.toString())
    return next(new AppError("Not authorized.", 403));
  if (application.razorpayOrderId !== razorpay_order_id)
    return next(new AppError("Order mismatch.", 400));

  if (application.paymentStatus === "paid") {
    return res.status(200).json({
      success: true,
      message: "Already verified.",
      internshipId: application.internship._id,
    });
  }

  application.paymentStatus = "paid";
  application.razorpayPaymentId = razorpay_payment_id;
  application.amountPaid = application.internship.applicationFee;
  application.paidAt = new Date();
  await application.save();

  try {
    await sendEmail({
      from: FROM.internship,
      to: application.email,
      subject: `Payment Confirmed — ${application.internship.title} Internship Portal Unlocked`,
      html: internshipPaymentConfirmedTemplate({ application, internship: application.internship }),
    });
  } catch (e) {
    console.error("Payment confirmation email failed:", e.message);
  }

  res.status(200).json({
    success: true,
    message: "Payment verified! You can now access the Internship Portal.",
    internshipId: application.internship._id,
  });
});