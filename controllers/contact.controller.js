import fetch from "node-fetch";
import { sendEmail, contactFormTemplate, contactConfirmationTemplate } from "../utils/email.utils.js";

const appendToSheet = async (name, email, message) => {
  const SHEET_URL = process.env.GOOGLE_SCRIPT_URL;

  if (!SHEET_URL) {
    console.warn("GOOGLE_SCRIPT_URL not set — skipping sheet append");
    return;
  }

  try {
    const payload = JSON.stringify({
      type: "contact",
      "Submitted At": new Date().toLocaleString("en-IN"),
      "Name": name,
      "Email": email,
      "Message": message,
    });

    const response = await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" }, // ← changed from application/json
      body: payload,
      redirect: "follow",                         // ← added
    });

    const text = await response.text();
    console.log("Sheet response:", text); // ← will show success/error from Apps Script
  } catch (err) {
    console.error("Google Sheet append failed:", err.message);
  }
};

export const sendContactMessage = async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    // Emails first — these are critical
    await Promise.all([
      sendEmail({
        to: process.env.SMTP_USER,
        subject: `📬 New Contact Message from ${name}`,
        html: contactFormTemplate(name, email, message),
      }),
      sendEmail({
        to: email,
        subject: `✅ We received your message, ${name}!`,
        html: contactConfirmationTemplate(name, message),
      }),
    ]);

    // Sheet is non-critical — fire and forget, never awaited
    appendToSheet(name, email, message);

    res.status(200).json({ message: "Message sent successfully." });
  } catch (err) {
    console.error("Contact form error:", err.message);
    res.status(500).json({ message: "Failed to send message. Please try again." });
  }
};