// import InternshipApplication from "../models/InternshipApplication.model.js";
// import InternshipEnrollment from "../models/InternshipEnrollment.model.js";
// import InternshipPayment from "../models/InternshipPayment.model.js";
// import { asyncHandler, AppError } from "../middleware/error.middleware.js";
// import { getRazorpay } from "../utils/Razorpay.utils.js";
// import { hashToken } from "../utils/internshipToken.utils.js";
// import { buildOfferPdf } from "../utils/internshipOffer.utils.js";
// import {
//   verifyCheckoutSignature,
//   finalizePayment,
//   activateFreeEnrollment,
//   assertCapacity,
// } from "../services/internshipPayment.service.js";

// // These routes are reached with a personal, unguessable link from the offer
// // email (no login yet, the account doesn't exist until admin sends credentials).
// // The token is a 256-bit random value; only its hash is stored. It can load the
// // form, save it, create an order and verify a payment for THAT application
// // only, and grants no login or portal access.

// const INVALID_LINK = "This link is invalid or has expired. Please contact support for a new enrollment link.";

// async function loadByToken(rawToken) {
//   if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 128) {
//     throw new AppError(INVALID_LINK, 404);
//   }
//   const application = await InternshipApplication.findOne({
//     enrollTokenHash: hashToken(rawToken),
//     enrollTokenExpires: { $gt: new Date() },
//   }).populate("internship");
//   if (!application || !application.internship) throw new AppError(INVALID_LINK, 404);
//   return application;
// }

// const stageOf = (application, enrollment) => {
//   if (enrollment) return "enrolled";
//   if (application.status !== "offer_sent") return "closed";
//   return application.enrollForm?.submittedAt ? "payment" : "form";
// };

// const maskEmail = (e = "") => e.replace(/^(.).*(@.*)$/, (_, a, b) => `${a}***${b}`);

// const FORM_FIELDS = [
//   "fullName", "phone", "college", "degree", "graduationYear",
//   "preferredTrack", "additionalInfo", "resumeUrl",
// ];

// // @route GET /api/internships/enroll/:token
// export const getEnrollSummary = asyncHandler(async (req, res) => {
//   const application = await loadByToken(req.params.token);
//   const internship = application.internship;
//   const enrollment = await InternshipEnrollment.findOne({ application: application._id })
//     .select("enrollmentId status accessGrantedAt");
//   const f = application.enrollForm || {};

//   res.json({
//     success: true,
//     stage: stageOf(application, enrollment),
//     applicant: { name: application.name, email: maskEmail(application.email) },
//     internship: {
//       title: internship.title,
//       company: internship.company,
//       domain: internship.domain,
//       duration: internship.duration,
//       location: internship.location,
//       type: internship.type,
//       terms: internship.terms,
//       fee: internship.applicationFee || 0,
//     },
//     offer: {
//       offerId: application.offer?.offerId,
//       startDate: application.offer?.startDate,
//       endDate: application.offer?.endDate,
//     },
//     form: {
//       fullName: f.fullName || application.name,
//       phone: f.phone || application.phone,
//       college: f.college || application.college,
//       degree: f.degree || application.degree,
//       graduationYear: f.graduationYear || "",
//       preferredTrack: f.preferredTrack || "",
//       additionalInfo: f.additionalInfo || "",
//       resumeUrl: f.resumeUrl || "",
//       consentAccepted: !!f.consentAccepted,
//     },
//     enrollment: enrollment
//       ? { enrollmentId: enrollment.enrollmentId, status: enrollment.status, accessGranted: !!enrollment.accessGrantedAt }
//       : null,
//     expiresAt: application.enrollTokenExpires,
//   });
// });

// // @route PUT /api/internships/enroll/:token/form
// export const saveEnrollForm = asyncHandler(async (req, res, next) => {
//   const application = await loadByToken(req.params.token);
//   const enrollment = await InternshipEnrollment.exists({ application: application._id });
//   if (enrollment) return next(new AppError("You are already enrolled in this internship.", 409));
//   if (application.status !== "offer_sent") return next(new AppError("This offer is no longer active.", 409));

//   const form = {};
//   for (const key of FORM_FIELDS) if (req.body[key] !== undefined) form[key] = String(req.body[key]).trim();
//   if (req.body.consentAccepted !== true) {
//     return next(new AppError("You must accept the terms to continue.", 400));
//   }

//   const now = new Date();
//   application.enrollForm = {
//     ...form,
//     consentAccepted: true,
//     consentAcceptedAt: application.enrollForm?.consentAcceptedAt || now,
//     consentIp: req.ip,
//     submittedAt: now,
//   };
//   await application.save();

//   // Free internship: no payment step, enrollment is created now.
//   if (!(application.internship.applicationFee > 0)) {
//     await assertCapacity(application.internship);
//     const created = await activateFreeEnrollment(application._id);
//     return res.json({ success: true, stage: "enrolled", enrollmentId: created.enrollmentId });
//   }

//   res.json({ success: true, stage: "payment" });
// });

// // @route POST /api/internships/enroll/:token/order
// export const createEnrollOrder = asyncHandler(async (req, res, next) => {
//   const application = await loadByToken(req.params.token);
//   const internship = application.internship;

//   if (await InternshipEnrollment.exists({ application: application._id })) {
//     return next(new AppError("You are already enrolled in this internship.", 409));
//   }
//   if (application.status !== "offer_sent") return next(new AppError("This offer is no longer active.", 409));
//   if (!application.enrollForm?.submittedAt || !application.enrollForm?.consentAccepted) {
//     return next(new AppError("Please complete the enrollment form first.", 400));
//   }
//   if (!(internship.applicationFee > 0)) return next(new AppError("This internship does not require payment.", 400));

//   // A payment already went through but the enrollment step didn't finish (e.g. a
//   // crash between the two). Complete it instead of charging the student again.
//   const alreadyPaid = await InternshipPayment.findOne({ application: application._id, status: "paid" });
//   if (alreadyPaid) {
//     await finalizePayment({
//       razorpayOrderId: alreadyPaid.razorpayOrderId,
//       razorpayPaymentId: alreadyPaid.razorpayPaymentId,
//       via: "checkout",
//     });
//     return next(new AppError("Payment was already received. Your enrollment is now confirmed.", 409));
//   }

//   await assertCapacity(internship);

//   const amount = Math.round(internship.applicationFee * 100);

//   // Reuse a recent open order so repeated clicks don't pile up orders that could
//   // later be paid out of sync with what we're tracking.
//   let payment = await InternshipPayment.findOne({
//     application: application._id,
//     status: { $in: ["created", "pending", "failed"] },
//     amount,
//     createdAt: { $gt: new Date(Date.now() - 30 * 60 * 1000) },
//   }).sort({ createdAt: -1 });

//   if (!payment) {
//     const order = await getRazorpay().orders.create({
//       amount,
//       currency: "INR",
//       receipt: `int_${String(application._id).slice(-12)}_${Date.now().toString(36)}`, // Razorpay caps receipts at 40 chars
//       notes: { applicationId: String(application._id), internshipId: String(internship._id) },
//     });
//     payment = await InternshipPayment.create({
//       application: application._id,
//       internship: internship._id,
//       email: application.email,
//       razorpayOrderId: order.id,
//       amount,
//       currency: "INR",
//       status: "created",
//     });
//   }

//   res.json({
//     success: true,
//     keyId: process.env.RAZORPAY_KEY_ID,
//     orderId: payment.razorpayOrderId,
//     amount: payment.amount,
//     currency: payment.currency,
//     description: `Internship enrollment: ${internship.title}`,
//     prefill: {
//       name: application.enrollForm.fullName || application.name,
//       email: application.email,
//       contact: application.enrollForm.phone || application.phone,
//     },
//   });
// });

// // @route POST /api/internships/enroll/:token/verify
// export const verifyEnrollPayment = asyncHandler(async (req, res, next) => {
//   const application = await loadByToken(req.params.token);
//   const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
//   if (![razorpay_order_id, razorpay_payment_id, razorpay_signature].every((v) => typeof v === "string" && v)) {
//     return next(new AppError("Missing payment details.", 400));
//   }

//   if (!verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
//     return next(new AppError("Payment verification failed.", 400));
//   }

//   // The order must belong to THIS application, so a valid payment for someone
//   // else's order can't be replayed against this link.
//   const payment = await InternshipPayment.findOne({ razorpayOrderId: razorpay_order_id, application: application._id });
//   if (!payment) return next(new AppError("Payment verification failed.", 400));

//   const result = await finalizePayment({
//     razorpayOrderId: razorpay_order_id,
//     razorpayPaymentId: razorpay_payment_id,
//     razorpaySignature: razorpay_signature,
//     via: "checkout",
//   });

//   res.json({
//     success: true,
//     enrolled: !result.duplicate,
//     duplicate: !!result.duplicate,
//     enrollmentId: result.enrollment.enrollmentId,
//     message: result.duplicate
//       ? "You were already enrolled. Our team will refund this extra payment."
//       : "Payment received. Your enrollment is confirmed and portal access details will be emailed to you.",
//   });
// });

// // @route GET /api/internships/enroll/:token/offer-letter
// export const downloadOfferLetter = asyncHandler(async (req, res, next) => {
//   const application = await loadByToken(req.params.token);
//   if (!application.offer?.offerId) return next(new AppError("Offer letter not available.", 404));

//   const pdf = await buildOfferPdf({ application, internship: application.internship, offer: application.offer });
//   res.set({
//     "Content-Type": "application/pdf",
//     "Content-Disposition": `attachment; filename="Offer_Letter_${application.offer.offerId}.pdf"`,
//     "Cache-Control": "no-store",
//   });
//   res.send(pdf);
// });