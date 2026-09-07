import Razorpay from "razorpay";
import { AppError } from "../middleware/error.middleware.js";

let _razorpay = null;

/**
 * Single shared Razorpay client. Both course checkout (payment.controller.js)
 * and internship application-fee checkout (internshipPayment.controller.js)
 * should import from here rather than instantiating their own client.
 */
export function getRazorpay() {
  if (!_razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new AppError(
        "Payment is not configured yet. Please contact support.",
        503
      );
    }
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
}