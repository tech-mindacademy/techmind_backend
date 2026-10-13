import crypto from "crypto";
import InternshipPayment from "../models/InternshipPayment.model.js";
import { AppError } from "../middleware/error.middleware.js";
import { finalizePayment, safeEqualHex } from "../services/internshipPayment.service.js";

/**
 * POST /api/webhooks/razorpay
 * Mounted with express.raw() BEFORE express.json() in server.js: the signature
 * is computed over the exact bytes Razorpay sent, so the body must not be parsed first.
 *
 * The webhook is account-wide, so course-order events arrive here too. Anything
 * that isn't one of our internship orders is acknowledged and ignored.
 */
export const razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] RAZORPAY_WEBHOOK_SECRET is not set");
    return res.status(503).json({ success: false });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ success: false, message: "Expected raw body." });
  }

  const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
  if (!safeEqualHex(expected, req.headers["x-razorpay-signature"])) {
    return res.status(400).json({ success: false, message: "Invalid signature." });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({ success: false, message: "Invalid payload." });
  }

  try {
    const entity = event.payload?.payment?.entity;

    if ((event.event === "payment.captured" || event.event === "order.paid") && entity?.order_id && entity?.id) {
      const ours = await InternshipPayment.exists({ razorpayOrderId: entity.order_id });
      if (ours) {
        await finalizePayment({
          razorpayOrderId: entity.order_id,
          razorpayPaymentId: entity.id,
          via: "webhook",
        });
      }
    } else if (event.event === "payment.failed" && entity?.order_id) {
      await InternshipPayment.updateOne(
        { razorpayOrderId: entity.order_id, status: { $in: ["created", "pending"] } },
        { $set: { status: "failed", failureReason: entity.error_description || "Payment failed" } }
      );
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    // 4xx-class problems (mismatch, not captured) won't fix themselves on retry,
    // so acknowledge them. Anything else returns 500 and Razorpay retries.
    if (err instanceof AppError && err.statusCode < 500) {
      console.warn("[webhook] ignored:", err.message);
      return res.status(200).json({ success: true });
    }
    console.error("[webhook] processing failed:", err);
    return res.status(500).json({ success: false });
  }
};