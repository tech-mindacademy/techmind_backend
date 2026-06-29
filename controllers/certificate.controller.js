import Razorpay from "razorpay";
import crypto from "crypto";
import CertificateOrder from "../models/CertificateOrder.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import {
  sendEmail,
  FROM,
  certificatePurchaseAdminTemplate,
  certificatePurchaseStudentTemplate,
} from "../utils/email.utils.js";
import { certificateAdminIssuedTemplate } from "../utils/email.utils.js";
import { fillCertificate } from "../utils/fillCertificate.js";
import https from "https";
import http from "http";
import { URL } from "url";

const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new AppError(
      "Payment gateway not configured. Please contact support.",
      503,
    );
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const CERTIFICATE_PRICES = {
  completion: 299,
  excellence: 499,
  participation: 199,
};

const logToSheet = (payload) => {
  fetch(process.env.GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => console.error("Sheet log failed:", err.message));
};

// ─────────────────────────────────────────────────────────────────────────────
// GET RAZORPAY KEY
// @route  GET /api/certificates/key
// ─────────────────────────────────────────────────────────────────────────────
export const getRazorpayKey = asyncHandler(async (req, res) => {
  res.json({ success: true, key: process.env.RAZORPAY_KEY_ID });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE ORDER
// @route  POST /api/certificates/create-order
// @access Public
// ─────────────────────────────────────────────────────────────────────────────
export const createCertificateOrder = asyncHandler(async (req, res, next) => {
  const {
    name,
    email,
    phone,
    courseName,
    courseType,
    startDate,
    completionDate,
    certificateType,
  } = req.body;

  if (
    !name ||
    !email ||
    !phone ||
    !courseName ||
    !courseType ||
    !startDate ||
    !completionDate ||
    !certificateType
  ) {
    return next(new AppError("All required fields must be provided.", 400));
  }

  const amount = CERTIFICATE_PRICES[certificateType] || 299;

  const razorpay = getRazorpay();
  const razorpayOrder = await razorpay.orders.create({
    amount: amount * 100,
    currency: "INR",
    receipt: `cert_${Date.now()}`,
    notes: { name, email, courseName, certificateType },
  });

  const certOrder = await CertificateOrder.create({
    name,
    email,
    phone,
    courseName,
    courseType,
    startDate,
    completionDate,
    certificateType,
    amount,
    razorpayOrderId: razorpayOrder.id,
    paymentStatus: "pending",
  });

  res.status(201).json({
    success: true,
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    certOrderId: certOrder._id,
    key: process.env.RAZORPAY_KEY_ID,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY PAYMENT
// @route  POST /api/certificates/verify-payment
// @access Public
// ─────────────────────────────────────────────────────────────────────────────
export const verifyCertificatePayment = asyncHandler(async (req, res, next) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    certOrderId,
  } = req.body;

  if (
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature ||
    !certOrderId
  ) {
    return next(new AppError("Invalid payment verification data.", 400));
  }

  // Verify signature
  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSig !== razorpay_signature) {
    await CertificateOrder.findByIdAndUpdate(certOrderId, {
      paymentStatus: "failed",
    });
    return next(
      new AppError("Payment verification failed. Invalid signature.", 400),
    );
  }

  const certNumber = `TV-CERT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  const certOrder = await CertificateOrder.findByIdAndUpdate(
    certOrderId,
    {
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      paymentStatus: "paid",
      certificateStatus: "processing",
      certificateNumber: certNumber,
    },
    { new: true },
  );

  if (!certOrder) return next(new AppError("Certificate order not found.", 404));

  let pdfBytes = null;
  try {
    const fakeEnrollment = {
      course: { title: certOrder.courseName },
      createdAt: new Date(certOrder.startDate),
      certificateIssuedAt: new Date(certOrder.completionDate),
      _id: certOrder._id,
    };
    pdfBytes = await fillCertificate(fakeEnrollment, { name: certOrder.name });
    await CertificateOrder.findByIdAndUpdate(certOrderId, {
      certificateStatus: "issued",
    });
  } catch (err) {
    console.error("PDF generation failed:", err.message);
  }

  // ── Log to Sheet3 (paid purchases) ──
  logToSheet({
    type:                  "certificate",
    "Submitted At":        new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    "Certificate Number":  certNumber,
    "Name":                certOrder.name,
    "Email":               certOrder.email,
    "Phone":               certOrder.phone,
    "Course Name":         certOrder.courseName,
    "Course Type":         certOrder.courseType,
    "Start Date":          certOrder.startDate,
    "Completion Date":     certOrder.completionDate,
    "Certificate Type":    certOrder.certificateType,
    "Amount":              certOrder.amount,
    "Payment Status":      "paid",
    "Razorpay Order ID":   razorpay_order_id,
    "Razorpay Payment ID": razorpay_payment_id,
  });

  // ── Notify admin ──
  try {
    await sendEmail({
      from: FROM.info,
  to: process.env.SMTP_USER,
  subject: `Certificate Purchase: ${certOrder.name} — Rs. ${certOrder.amount} — ${certOrder.courseName}`,
  html: certificatePurchaseAdminTemplate({
    certOrder, certNumber, razorpay_order_id, razorpay_payment_id,
  }),
});

    const safeName  = certOrder.name.replace(/\s+/g, "_");
const certLabel = {
  completion:    "Certificate of Completion",
  excellence:    "Certificate of Excellence",
  participation: "Certificate of Participation",
}[certOrder.certificateType] || "Certificate";
 
await sendEmail({
  from: FROM.info,
  to: certOrder.email,
  subject: pdfBytes
    ? `Your Certificate is Ready: ${certOrder.courseName}`
    : `Payment Confirmed: ${certOrder.courseName} Certificate Being Processed`,
  html: certificatePurchaseStudentTemplate({
    certOrder,
    certNumber,
    pdfAttached: !!pdfBytes,
  }),
  attachments: pdfBytes ? [{
    filename:    `${safeName}_${certLabel.replace(/\s+/g, "_")}.pdf`,
    content:     Buffer.from(pdfBytes),
    contentType: "application/pdf",
  }] : [],
});
  } catch (err) {
    console.error("Email error after payment:", err.message);
  }

  res.json({
    success: true,
    message: "Payment verified! Your certificate is being processed.",
    certificateNumber: certNumber,
    certOrder,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — Get all certificate orders
// @route  GET /api/certificates/admin/orders
// ─────────────────────────────────────────────────────────────────────────────
export const getAllCertificateOrders = asyncHandler(async (req, res) => {
  const orders = await CertificateOrder.find().sort({ createdAt: -1 });
  res.json({ success: true, count: orders.length, orders });
});

// @route  PATCH /api/certificates/admin/orders/:id/status
export const updateCertificateStatus = asyncHandler(async (req, res, next) => {
  const { certificateStatus, certificateUrl } = req.body;
  const order = await CertificateOrder.findByIdAndUpdate(
    req.params.id,
    { certificateStatus, ...(certificateUrl && { certificateUrl }) },
    { new: true },
  );
  if (!order) return next(new AppError("Order not found.", 404));
  res.json({ success: true, order });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — Issue certificate (free / manual)
// @route  POST /api/certificates/admin/issue
// ─────────────────────────────────────────────────────────────────────────────
export const adminIssueCertificate = asyncHandler(async (req, res, next) => {
  const {
    name,
    email,
    phone,
    courseName,
    courseType,
    startDate,
    completionDate,
    certificateType,
  } = req.body;

  if (
    !name ||
    !email ||
    !phone ||
    !courseName ||
    !courseType ||
    !startDate ||
    !completionDate ||
    !certificateType
  ) {
    return next(new AppError("All fields are required.", 400));
  }

  const certNumber = `TV-CERT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  const certOrder = await CertificateOrder.create({
    name,
    email,
    phone,
    courseName,
    courseType,
    startDate,
    completionDate,
    certificateType,
    amount: 0,
    paymentStatus: "paid",
    certificateStatus: "processing",
    certificateNumber: certNumber,
  });

  let pdfBytes;
  try {
    const fakeEnrollment = {
      course:              { title: certOrder.courseName },
      createdAt:           new Date(certOrder.startDate),
      certificateIssuedAt: new Date(certOrder.completionDate),
      _id:                 certOrder._id,
    };
    pdfBytes = await fillCertificate(fakeEnrollment, { name: certOrder.name });
    await CertificateOrder.findByIdAndUpdate(certOrder._id, {
      certificateStatus: "issued",
    });
  } catch (err) {
    console.error("PDF generation failed:", err.message);
    return next(new AppError("Certificate generation failed.", 500));
  }

  // ── Log to Sheet4 (admin-issued / free) ──
  logToSheet({
    type:                 "admin_certificate",
    "Issued At":          new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    "Certificate Number": certNumber,
    "Name":               certOrder.name,
    "Email":              certOrder.email,
    "Phone":              certOrder.phone,
    "Course Name":        certOrder.courseName,
    "Course Type":        certOrder.courseType,
    "Start Date":         certOrder.startDate,
    "Completion Date":    certOrder.completionDate,
    "Certificate Type":   certOrder.certificateType,
  });

  const certLabel = {
  completion:    "Certificate of Completion",
  excellence:    "Certificate of Excellence",
  participation: "Certificate of Participation",
}[certificateType] || "Certificate";
  const safeName = name.replace(/\s+/g, "_");

  try {
    await sendEmail({
      from: FROM.info,
  to:      email,
  subject: `Your ${certLabel}: ${courseName}`,
  html:    certificateAdminIssuedTemplate({ certOrder, certNumber, certLabel }),
  attachments: [{
    filename:    `${safeName}_${certLabel.replace(/\s+/g, "_")}.pdf`,
    content:     Buffer.from(pdfBytes),
    contentType: "application/pdf",
  }],
});
  } catch (err) {
    console.error("Email delivery failed:", err.message);
  }

  res.status(201).json({ success: true, certificateNumber: certNumber });
});