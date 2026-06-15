

import { sendEmail } from "./email.utils.js";
const wrap = (content, preheader = "") => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Tech Mind Academy</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    body{margin:0!important;padding:0!important;background-color:#f4f6f9}
    a{color:#2563eb}
    @media only screen and (max-width:620px){.email-wrapper{width:100%!important}.email-body{padding:24px 20px!important}}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f4f6f9;">${preheader}&zwnj;&nbsp;&zwnj;</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f9;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" class="email-wrapper" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td style="padding-bottom:24px;">
          <span style="font-size:18px;font-weight:700;color:#111827;letter-spacing:-0.3px;">Tech Mind Academy</span>
        </td></tr>
        <tr><td style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="email-body" style="padding:40px 40px 32px;">${content}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding-top:28px;text-align:center;font-size:12px;color:#9ca3af;line-height:1.6;">
          <p style="margin:0 0 4px;">Tech Mind Academy &bull; techmindacademy.in</p>
          <p style="margin:0;">You received this because you have an account with us. &copy; ${new Date().getFullYear()} Tech Mind Academy.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const h = (t) => `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">${t}</h1>`;
const p = (t) => `<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.65;">${t}</p>`;
const small = (t) => `<p style="margin:20px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">${t}</p>`;
const divider = () => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;"><tr><td style="border-top:1px solid #e5e7eb;"></td></tr></table>`;

const btn = (text, url) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
    <tr><td style="background-color:#2563eb;border-radius:6px;">
      <a href="${url}" target="_blank" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${text}</a>
    </td></tr>
  </table>`;

const infoRow = (label, value, shade = false) =>
  `<tr style="${shade ? "background-color:#f9fafb;" : "background-color:#ffffff;"}">
    <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;width:40%;border-bottom:1px solid #f3f4f6;">${label}</td>
    <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${value}</td>
  </tr>`;

const infoTable = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">${rows}</table>`;

const callout = (text, variant = "info") => {
  const v = {
    info:    { bg: "#eff6ff", border: "#2563eb", text: "#1e40af" },
    success: { bg: "#f0fdf4", border: "#16a34a", text: "#166534" },
    warning: { bg: "#fffbeb", border: "#d97706", text: "#92400e" },
    danger:  { bg: "#fef2f2", border: "#dc2626", text: "#991b1b" },
  }[variant] || { bg: "#eff6ff", border: "#2563eb", text: "#1e40af" };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr><td style="background-color:${v.bg};border-left:4px solid ${v.border};border-radius:0 6px 6px 0;padding:16px 20px;">
      <p style="margin:0;font-size:14px;color:${v.text};line-height:1.65;">${text}</p>
    </td></tr>
  </table>`;
};

const refundStatusBadge = (status) => {
  const s = {
    pending:  "Pending Review",
    approved: "Approved",
    rejected: "Not Approved",
  }[status] || status;
  return `<span style="font-size:13px;font-weight:600;color:#374151;">${s}</span>`;
};

// ─── Template 1: Student — refund request received ────────────────────────────

const refundRequestedStudentTemplate = ({ studentName, courseName, amountPaid, progressPercent, reason, refundId }) =>
  wrap(
    h("Refund request received") +
    p(`Hi ${studentName}, we have received your refund request. Our support team will review it within 2 business days and notify you of the outcome.`) +
    infoTable(
      infoRow("Course", courseName, true) +
      infoRow("Amount Paid", `Rs. ${Number(amountPaid).toLocaleString("en-IN")}`) +
      infoRow("Progress Completed", `${progressPercent}%`, true) +
      infoRow("Reference ID", `<span style="font-family:monospace;font-size:12px;">${refundId}</span>`) +
      infoRow("Status", refundStatusBadge("pending"), true)
    ) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
      <tr><td style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Your reason</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.65;">${reason}</p>
      </td></tr>
    </table>` +
    callout(`Once reviewed, if your request is approved, the refund will be processed to your original payment method within 5 to 10 business days.`, "warning") +
    btn("View Refund Status", `${process.env.CLIENT_URL}/student/refunds`) +
    divider() +
    small(`If you did not submit this request, please contact us immediately at <a href="mailto:${process.env.SMTP_USER}" style="color:#9ca3af;">${process.env.SMTP_USER}</a>.`),
    `Your refund request for "${courseName}" has been received.`
  );

// ─── Template 2: Admin — new refund alert ────────────────────────────────────

const refundAlertAdminTemplate = ({ studentName, studentEmail, courseName, amountPaid, progressPercent, reason, refundId }) =>
  wrap(
    h("New refund request — action required") +
    p(`A student has submitted a refund request. Please review and process it within the standard 2 business day window.`) +
    infoTable(
      infoRow("Student", `${studentName} &lt;${studentEmail}&gt;`, true) +
      infoRow("Course", courseName) +
      infoRow("Amount Paid", `Rs. ${Number(amountPaid).toLocaleString("en-IN")}`, true) +
      infoRow("Progress at Request", `${progressPercent}%`) +
      infoRow("Reference ID", `<span style="font-family:monospace;font-size:12px;">${refundId}</span>`, true) +
      infoRow("Status", refundStatusBadge("pending"))
    ) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
      <tr><td style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Student's reason</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.65;">${reason}</p>
      </td></tr>
    </table>` +
    btn("Review in Admin Panel", `${process.env.CLIENT_URL}/admin/refunds`) +
    divider() +
    small(`Log in to the admin panel to approve or reject this request.`),
    `Refund request from ${studentName} — ${courseName}.`
  );

// ─── Template 3: Student — refund approved ────────────────────────────────────

const refundApprovedStudentTemplate = ({ studentName, courseName, refundAmount, paymentMethod, adminNote, refundId }) =>
  wrap(
    h("Your refund has been approved") +
    p(`Hi ${studentName}, we have reviewed your request and approved a refund for the course below.`) +
    infoTable(
      infoRow("Course", courseName, true) +
      infoRow("Refund Amount", `<strong style="color:#111827;">Rs. ${Number(refundAmount).toLocaleString("en-IN")}</strong>`) +
      infoRow("Payment Method", paymentMethod, true) +
      infoRow("Reference ID", `<span style="font-family:monospace;font-size:12px;">${refundId}</span>`) +
      infoRow("Status", refundStatusBadge("approved"), true)
    ) +
    (adminNote
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
          <tr><td style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Note from our team</p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.65;">${adminNote}</p>
          </td></tr>
        </table>`
      : "") +
    callout(`Refunds typically appear in your account within 5 to 10 business days depending on your bank. UPI refunds are usually faster (3 to 5 days).`, "info") +
    p(`Your access to <strong>${courseName}</strong> has been removed. We hope to welcome you back to Tech Mind Academy for your next course.`) +
    btn("Explore Other Courses", `${process.env.CLIENT_URL}/courses`) +
    divider() +
    small(`Thank you for giving Tech Mind Academy a try. If you have questions, reply to this email.`),
    `Your refund of Rs. ${Number(refundAmount).toLocaleString("en-IN")} for "${courseName}" has been approved.`
  );

// ─── Template 4: Student — refund rejected ────────────────────────────────────

const refundRejectedStudentTemplate = ({ studentName, courseName, adminNote, progressPercent, refundId }) =>
  wrap(
    h("Update on your refund request") +
    p(`Hi ${studentName}, we have reviewed your refund request and are unable to approve it at this time.`) +
    infoTable(
      infoRow("Course", courseName, true) +
      infoRow("Progress Completed", `${progressPercent}%`) +
      infoRow("Reference ID", `<span style="font-family:monospace;font-size:12px;">${refundId}</span>`, true) +
      infoRow("Status", refundStatusBadge("rejected"))
    ) +
    (adminNote
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
          <tr><td style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Reason from our team</p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.65;">${adminNote}</p>
          </td></tr>
        </table>`
      : "") +
    callout(`If you believe this decision was made in error, please email us at <a href="mailto:${process.env.SMTP_USER}" style="color:#1e40af;">${process.env.SMTP_USER}</a> with your Reference ID and we will look into it promptly.`, "warning") +
    p(`Your access to <strong>${courseName}</strong> remains active. You can continue learning at any time.`) +
    btn("Continue Learning", `${process.env.CLIENT_URL}/student/learn`) +
    divider() +
    small(`We are always here to help. Reply to this email with any questions.`),
    `Update on your refund request for "${courseName}".`
  );

// ─── Exported senders ────────────────────────────────────────────────────────

export const sendRefundRequestedEmailToStudent = ({ studentEmail, ...rest }) =>
  sendEmail({
    to: studentEmail,
    subject: `Refund request received: ${rest.courseName} (Ref: ${rest.refundId})`,
    html: refundRequestedStudentTemplate(rest),
  });

export const sendRefundAlertEmailToAdmin = ({ adminEmail, ...rest }) =>
  sendEmail({
    to: adminEmail,
    subject: `Refund request from ${rest.studentName}: ${rest.courseName}`,
    html: refundAlertAdminTemplate(rest),
  });

export const sendRefundApprovedEmailToStudent = ({ studentEmail, ...rest }) =>
  sendEmail({
    to: studentEmail,
    subject: `Refund approved: Rs. ${Number(rest.refundAmount).toLocaleString("en-IN")} for ${rest.courseName}`,
    html: refundApprovedStudentTemplate(rest),
  });

export const sendRefundRejectedEmailToStudent = ({ studentEmail, ...rest }) =>
  sendEmail({
    to: studentEmail,
    subject: `Update on your refund request: ${rest.courseName}`,
    html: refundRejectedStudentTemplate(rest),
  });