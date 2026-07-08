import Razorpay from "razorpay";
import cron from "node-cron";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const INTERNSHIP_PAYMENT_AMOUNT = 100; // ₹1499 in paise — update if the price changes
const alreadyProcessed = new Set();

async function pollInternshipPayments() {
  try {
    const toTs = Math.floor(Date.now() / 1000);
    const fromTs = toTs - 60 * 60; // 1hr lookback, safely overlaps the 5-min poll interval

    const result = await razorpay.payments.all({ from: fromTs, to: toTs, count: 100 });

    const captured = result.items.filter(
      (p) => p.status === "captured" && p.amount === INTERNSHIP_PAYMENT_AMOUNT
    );

    for (const payment of captured) {
      if (alreadyProcessed.has(payment.id)) continue;

      const email = (payment.email || "").toLowerCase().trim();
      if (!email) continue;

      try {
        const res = await fetch(process.env.GOOGLE_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "internship_payment_verify",
            email,
            paymentId: payment.id,
            orderId: payment.order_id || "",
            status: "Paid",
          }),
        });
        const json = await res.json();

        alreadyProcessed.add(payment.id);
        console.log(
          json.matched
            ? `✅ Matched & marked Paid: ${email} (${payment.id})`
            : `⚠️ No unpaid row found for ${email} (${payment.id}) — check manually`
        );
      } catch (sheetErr) {
        console.error(`Sheet update failed for ${payment.id}:`, sheetErr.message);
      }
    }
  } catch (err) {
    console.error("Internship payment poll failed:", err.message);
  }
}

export function startInternshipPaymentPolling() {
  cron.schedule("*/5 * * * *", pollInternshipPayments);
  console.log("🔁 Internship payment polling started (every 5 min)");
}