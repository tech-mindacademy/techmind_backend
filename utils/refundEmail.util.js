import { sendEmail } from "./email.utils.js"; // your existing Gmail OAuth sender

// ─── Shared helpers (mirrors your email.utils.js style) ──────────────────────
const wrap = (content) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px">Tech Vidya</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px">${content}</td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">
            © ${new Date().getFullYear()} Tech Vidya. You're receiving this because you have an account with us.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const btn = (text, url) =>
  `<a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:10px;margin:20px 0">${text}</a>`;

const h1 = (text) =>
  `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b">${text}</h1>`;

const p = (text) =>
  `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">${text}</p>`;

const small = (text) =>
  `<p style="margin:12px 0 0;font-size:12px;color:#94a3b8">${text}</p>`;

// Info table row — for refund detail cards
const row = (label, value) => `
  <tr>
    <td style="padding:10px 14px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;width:45%">${label}</td>
    <td style="padding:10px 14px;font-size:13px;color:#1e293b;font-weight:600;border-bottom:1px solid #f1f5f9">${value}</td>
  </tr>`;

const infoTable = (rows) => `
  <table width="100%" cellpadding="0" cellspacing="0"
    style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 20px">
    ${rows}
  </table>`;

const statusBadge = (status) => {
  const map = {
    pending:  { bg: "#fef9c3", color: "#854d0e", label: "Pending Review" },
    approved: { bg: "#dcfce7", color: "#166534", label: "Approved" },
    rejected: { bg: "#fee2e2", color: "#991b1b", label: "Rejected" },
  };
  const s = map[status] || map.pending;
  return `<span style="display:inline-block;background:${s.bg};color:${s.color};font-size:12px;font-weight:600;padding:3px 12px;border-radius:999px">${s.label}</span>`;
};

const noteBox = (text, variant = "info") => {
  const styles = {
    info:    { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af" },
    success: { bg: "#f0fdf4", border: "#bbf7d0", color: "#166534" },
    warning: { bg: "#fffbeb", border: "#fde68a", color: "#92400e" },
    danger:  { bg: "#fef2f2", border: "#fecaca", color: "#991b1b" },
  };
  const s = styles[variant] || styles.info;
  return `
    <div style="background:${s.bg};border:1px solid ${s.border};border-radius:10px;padding:14px 16px;margin:0 0 20px">
      <p style="margin:0;font-size:13px;color:${s.color};line-height:1.6">${text}</p>
    </div>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 1 — Student: refund request received
// ─────────────────────────────────────────────────────────────────────────────
const refundRequestedStudentTemplate = ({
  studentName, courseName, amountPaid, progressPercent, reason, refundId,
}) => wrap(`
  ${h1("Refund Request Received 📩")}
  ${p(`Hi <strong>${studentName}</strong>, we've received your refund request for the course below. Our team will review it within <strong>2 business days</strong>.`)}

  ${infoTable(
    row("Course", courseName) +
    row("Amount Paid", `₹${Number(amountPaid).toLocaleString("en-IN")}`) +
    row("Your Progress", `${progressPercent}%`) +
    row("Request ID", `<code style="font-size:11px;color:#6366f1">${refundId}</code>`) +
    row("Status", statusBadge("pending"))
  )}

  <div style="background:#f8fafc;border-left:4px solid #6366f1;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 20px">
    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#374151">Your reason</p>
    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">${reason}</p>
  </div>

  ${noteBox(
    "⏱ <strong>What happens next?</strong><br/>Our support team will review your request and respond within 2 business days. If approved, the refund will be processed to your original payment method within 5–10 business days.",
    "warning"
  )}

  ${btn("View My Refund Requests", `${process.env.CLIENT_URL}/student/refunds`)}
  ${small("If you didn't submit this request, please contact us immediately.")}
`);

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 2 — Admin: new refund request alert
// ─────────────────────────────────────────────────────────────────────────────
const refundAlertAdminTemplate = ({
  studentName, studentEmail, courseName, amountPaid, progressPercent, reason, refundId,
}) => wrap(`
  ${h1("New Refund Request ⚠️")}
  ${p("A student has submitted a refund request that requires your review.")}

  ${infoTable(
    row("Student", `${studentName}<br/><span style="font-weight:400;color:#64748b;font-size:12px">${studentEmail}</span>`) +
    row("Course", courseName) +
    row("Amount Paid", `₹${Number(amountPaid).toLocaleString("en-IN")}`) +
    row("Progress at Request", `${progressPercent}%`) +
    row("Request ID", `<code style="font-size:11px;color:#6366f1">${refundId}</code>`) +
    row("Status", statusBadge("pending"))
  )}

  <div style="background:#f8fafc;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 20px">
    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#374151">Student's reason</p>
    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">${reason}</p>
  </div>

  ${btn("Review in Admin Panel", `${process.env.CLIENT_URL}/admin/refunds`)}
  ${small("Log in to the admin panel to approve or reject this request.")}
`);

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 3 — Student: refund approved
// ─────────────────────────────────────────────────────────────────────────────
const refundApprovedStudentTemplate = ({
  studentName, courseName, refundAmount, paymentMethod, adminNote, refundId,
}) => wrap(`
  ${h1("Refund Approved! ✅")}
  ${p(`Great news, <strong>${studentName}</strong> — your refund request has been approved.`)}

  ${infoTable(
    row("Course", courseName) +
    row("Refund Amount", `<span style="color:#16a34a;font-size:15px">₹${Number(refundAmount).toLocaleString("en-IN")}</span>`) +
    row("Payment Method", paymentMethod) +
    row("Request ID", `<code style="font-size:11px;color:#6366f1">${refundId}</code>`) +
    row("Status", statusBadge("approved"))
  )}

  ${adminNote ? noteBox(`<strong>Message from our team:</strong><br/>${adminNote}`, "success") : ""}

  ${noteBox(
    "💳 <strong>When will I receive the money?</strong><br/>Refunds typically appear within <strong>5–10 business days</strong> depending on your bank. UPI refunds are usually faster (3–5 days). International cards may take up to 15 days.",
    "info"
  )}

  ${p(`Your access to <strong>${courseName}</strong> has been removed. We hope to see you back on Tech Vidya for your next learning journey! 🚀`)}

  ${btn("Explore More Courses", `${process.env.CLIENT_URL}/courses`)}
  ${small("Thank you for giving Tech Vidya a try. We'd love to have you back.")}
`);

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 4 — Student: refund rejected
// ─────────────────────────────────────────────────────────────────────────────
const refundRejectedStudentTemplate = ({
  studentName, courseName, adminNote, progressPercent, refundId,
}) => wrap(`
  ${h1("Refund Request Update")}
  ${p(`Hi <strong>${studentName}</strong>, after reviewing your request we're unable to process this refund.`)}

  ${infoTable(
    row("Course", courseName) +
    row("Progress at Request", `${progressPercent}%`) +
    row("Request ID", `<code style="font-size:11px;color:#6366f1">${refundId}</code>`) +
    row("Status", statusBadge("rejected"))
  )}

  ${adminNote ? noteBox(`<strong>Reason from our team:</strong><br/>${adminNote}`, "danger") : ""}

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:0 0 20px">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#374151">Not satisfied with this decision?</p>
    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">
      If you believe this was made in error, email us at
      <a href="mailto:${process.env.SMTP_USER}" style="color:#6366f1;text-decoration:none">${process.env.SMTP_USER}</a>
      with your Request ID and we'll look into it promptly.
    </p>
  </div>

  ${p(`Your access to <strong>${courseName}</strong> remains active. Keep learning! 🎓`)}

  ${btn("Continue Learning", `${process.env.CLIENT_URL}/student/learn`)}
  ${small("We're always here to help — reach out if you have any questions.")}
`);

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED SENDERS — drop-in replacements for refund.controller.js
// ─────────────────────────────────────────────────────────────────────────────

export const sendRefundRequestedEmailToStudent = ({ studentEmail, ...rest }) =>
  sendEmail({
    to: studentEmail,
    subject: `Refund Request Received — ${rest.courseName}`,
    html: refundRequestedStudentTemplate(rest),
  });

export const sendRefundAlertEmailToAdmin = ({ adminEmail, ...rest }) =>
  sendEmail({
    to: adminEmail,
    subject: `[Action Required] New Refund Request from ${rest.studentName} — ${rest.courseName}`,
    html: refundAlertAdminTemplate(rest),
  });

export const sendRefundApprovedEmailToStudent = ({ studentEmail, ...rest }) =>
  sendEmail({
    to: studentEmail,
    subject: `Refund Approved — ₹${Number(rest.refundAmount).toLocaleString("en-IN")} for ${rest.courseName}`,
    html: refundApprovedStudentTemplate(rest),
  });

export const sendRefundRejectedEmailToStudent = ({ studentEmail, ...rest }) =>
  sendEmail({
    to: studentEmail,
    subject: `Refund Request Update — ${rest.courseName}`,
    html: refundRejectedStudentTemplate(rest),
  });