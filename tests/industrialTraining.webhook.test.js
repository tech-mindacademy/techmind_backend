import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import Application from "../models/IndustrialTrainingApplication.model.js";

const secret = "webhook-test-secret";
process.env.RESEND_API_KEY ||= "re_test_key";
const { razorpayWebhook } = await import("../controllers/industrialTraining.controller.js");
const { razorpayWebhook: accountWebhook } = await import("../controllers/razorpaywebhook.controller.js");
const originalFindOneAndUpdate = Application.findOneAndUpdate;
const originalFindOne = Application.findOne;
const originalUpdateOne = Application.updateOne;
const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
const originalConsoleError = console.error;

beforeEach(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET = secret;
});

afterEach(() => {
  Application.findOneAndUpdate = originalFindOneAndUpdate;
  Application.findOne = originalFindOne;
  Application.updateOne = originalUpdateOne;
  console.error = originalConsoleError;
  if (originalSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
  else process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
});

const makeRequest = (body, { signature, raw = true } = {}) => {
  const bytes = Buffer.from(body);
  const signed = signature ?? crypto.createHmac("sha256", secret).update(bytes).digest("hex");
  return {
    req: {
      body: raw ? bytes : JSON.parse(body),
      get: (name) => name === "x-razorpay-signature" ? signed : undefined,
    },
    res: {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(value) {
        this.body = value;
        return this;
      },
    },
  };
};

const paidEvent = (amount = 125000) => JSON.stringify({
  event: "payment_link.paid",
  payload: {
    payment_link: { entity: { id: "plink_test", amount_paid: amount } },
    payment: { entity: { id: "pay_test", method: "upi" } },
  },
});

const capturedPaymentEvent = (amount = 125000) => JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_test",
        method: "upi",
        amount,
        payment_link_id: "plink_test",
      },
    },
  },
});

test("valid paid event atomically records payment and advances application", async () => {
  let query;
  let update;
  Application.findOneAndUpdate = async (...args) => {
    [query, update] = args;
    return { _id: "application-id" };
  };
  const { req, res } = makeRequest(paidEvent());

  await razorpayWebhook(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.received, true);
  assert.deepEqual(query, {
    "payment.linkId": "plink_test",
    "payment.status": { $ne: "paid" },
    "payment.amount": 125000,
  });
  assert.equal(update.$set["payment.status"], "paid");
  assert.equal(update.$set["payment.paymentId"], "pay_test");
  assert.equal(update.$set["payment.method"], "upi");
  assert.equal(update.$set.status, "PAID");
  assert.ok(update.$set["payment.paidAt"] instanceof Date);
});

test("account-wide webhook endpoint handler accepts industrial-training payment links", async () => {
  let update;
  Application.findOneAndUpdate = async (_query, updateDocument) => {
    update = updateDocument;
    return { _id: "application-id" };
  };
  const { req, res } = makeRequest(paidEvent());

  await accountWebhook(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.received, true);
  assert.equal(update.$set["payment.status"], "paid");
  assert.equal(update.$set.status, "PAID");
});

test("payment.captured event also verifies a linked industrial-training payment", async () => {
  let query;
  let update;
  Application.findOneAndUpdate = async (...args) => {
    [query, update] = args;
    return { _id: "application-id" };
  };
  const { req, res } = makeRequest(capturedPaymentEvent());

  await razorpayWebhook(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.received, true);
  assert.equal(query["payment.linkId"], "plink_test");
  assert.equal(query["payment.amount"], 125000);
  assert.equal(update.$set["payment.paymentId"], "pay_test");
  assert.equal(update.$set.status, "PAID");
});

test("invalid signatures are rejected without touching the application", async () => {
  let called = false;
  Application.findOneAndUpdate = async () => {
    called = true;
  };
  const { req, res } = makeRequest(paidEvent(), { signature: "z".repeat(64) });

  await razorpayWebhook(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test("requires the unparsed raw request body", async () => {
  const { req, res } = makeRequest(paidEvent(), { raw: false });

  await razorpayWebhook(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Expected raw body.");
});

test("rejects malformed JSON after validating the signature", async () => {
  const { req, res } = makeRequest("{");

  await razorpayWebhook(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid payload.");
});

test("expired payment links return pending applications to the contacted state", async () => {
  let query;
  let update;
  Application.updateOne = async (...args) => {
    [query, update] = args;
    return { matchedCount: 1 };
  };
  const body = JSON.stringify({
    event: "payment_link.expired",
    payload: { payment_link: { entity: { id: "plink_test" } } },
  });
  const { req, res } = makeRequest(body);

  await razorpayWebhook(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(query, {
    "payment.linkId": "plink_test",
    "payment.status": "link_sent",
    status: "PAYMENT_PENDING",
  });
  assert.equal(update.$set["payment.status"], "expired");
  assert.equal(update.$set.status, "CONTACTED");
});

test("acknowledges a duplicate paid delivery without applying it twice", async () => {
  Application.findOneAndUpdate = async () => null;
  Application.findOne = () => ({
    select: async () => ({ payment: { status: "paid", amount: 125000 } }),
  });
  const { req, res } = makeRequest(paidEvent());

  await razorpayWebhook(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.received, true);
});

test("acknowledges amount mismatches without marking the payment paid", async () => {
  Application.findOneAndUpdate = async () => null;
  Application.findOne = () => ({
    select: async () => ({ payment: { status: "link_sent", amount: 125000 } }),
  });
  console.error = () => {};
  const { req, res } = makeRequest(paidEvent(124999));

  await razorpayWebhook(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.received, true);
});

test("reports a missing webhook secret as a server configuration error", async () => {
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  console.error = () => {};
  const { req, res } = makeRequest(paidEvent());

  await razorpayWebhook(req, res);

  assert.equal(res.statusCode, 503);
});
