import { google } from "googleapis";

// ─────────────────────────────────────────────────────────────────────────────
// GMAIL OAUTH TRANSPORT
// ─────────────────────────────────────────────────────────────────────────────

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

export const sendEmail = async ({ to, subject, html, text, attachments = [] }) => {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const plainText = text || stripHtml(html);
  const boundary  = `boundary_${Date.now()}`;

  let rawParts = [
    `From: "Tech Mind Academy" <${process.env.SMTP_USER}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
  ];

  if (attachments.length === 0) {
    rawParts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    rawParts.push(``);
    rawParts.push(`--${boundary}`);
    rawParts.push(`Content-Type: text/plain; charset=UTF-8`);
    rawParts.push(`Content-Transfer-Encoding: quoted-printable`);
    rawParts.push(``);
    rawParts.push(plainText);
    rawParts.push(`--${boundary}`);
    rawParts.push(`Content-Type: text/html; charset=UTF-8`);
    rawParts.push(`Content-Transfer-Encoding: quoted-printable`);
    rawParts.push(``);
    rawParts.push(html);
    rawParts.push(`--${boundary}--`);
  } else {
    const outerBoundary = `outer_${Date.now()}`;
    rawParts.push(`Content-Type: multipart/mixed; boundary="${outerBoundary}"`);
    rawParts.push(``);
    rawParts.push(`--${outerBoundary}`);
    rawParts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    rawParts.push(``);
    rawParts.push(`--${boundary}`);
    rawParts.push(`Content-Type: text/plain; charset=UTF-8`);
    rawParts.push(``);
    rawParts.push(plainText);
    rawParts.push(`--${boundary}`);
    rawParts.push(`Content-Type: text/html; charset=UTF-8`);
    rawParts.push(``);
    rawParts.push(html);
    rawParts.push(`--${boundary}--`);

    for (const attachment of attachments) {
      const fileData = Buffer.isBuffer(attachment.content)
        ? attachment.content.toString("base64")
        : Buffer.from(attachment.content).toString("base64");

      rawParts.push(`--${outerBoundary}`);
      rawParts.push(`Content-Type: ${attachment.contentType || "application/octet-stream"}; name="${attachment.filename}"`);
      rawParts.push(`Content-Transfer-Encoding: base64`);
      rawParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
      rawParts.push(``);
      rawParts.push(fileData.match(/.{1,76}/g).join("\r\n"));
    }
    rawParts.push(`--${outerBoundary}--`);
  }

  const raw = Buffer.from(rawParts.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
};

const stripHtml = (html) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();

// ─────────────────────────────────────────────────────────────────────────────
// BASE LAYOUT
// Inline styles only. No gradients. No web fonts. No background images.
// Table-based layout for maximum Gmail compatibility.
// ─────────────────────────────────────────────────────────────────────────────

const layout = (preheader, content) => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <title>Tech Mind Academy</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#f5f5f5;">${preheader}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>` : ""}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Outer card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #dddddd;">

          <!-- Header bar -->
          <tr>
            <td style="background-color:#1a1a2e;padding:24px 36px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">Tech Mind Academy</p>
              <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#aaaacc;letter-spacing:0.3px;">techmindacademy.in</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#333333;line-height:1.6;">
              ${content}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #eeeeee;"></td></tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px 28px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#999999;line-height:1.6;">
                This email was sent by Tech Mind Academy. If you have any questions, reply to this email or visit
                <a href="${process.env.CLIENT_URL}" style="color:#555555;text-decoration:underline;">techmindacademy.in</a>.
              </p>
              <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#bbbbbb;">
                &copy; ${new Date().getFullYear()} Tech Mind Academy. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Outer card -->

      </td>
    </tr>
  </table>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// SHARED BUILDING BLOCKS
// ─────────────────────────────────────────────────────────────────────────────

const h1 = (text) =>
  `<h1 style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#1a1a2e;line-height:1.3;">${text}</h1>`;

const h2 = (text) =>
  `<h2 style="margin:24px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1a1a2e;">${text}</h2>`;

const p = (text) =>
  `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#444444;line-height:1.65;">${text}</p>`;

const small = (text) =>
  `<p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#999999;line-height:1.6;">${text}</p>`;

const divider = () =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr><td style="border-top:1px solid #eeeeee;"></td></tr>
  </table>`;

// Solid button — no border-radius for better Outlook rendering
const btn = (text, url) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td style="background-color:#1a1a2e;">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">${text}</a>
      </td>
    </tr>
  </table>`;

// Info table — two-column key/value rows
const infoTable = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border:1px solid #dddddd;">
    ${rows}
  </table>`;

const infoRow = (label, value, shade = false) =>
  `<tr style="${shade ? "background-color:#f9f9f9;" : "background-color:#ffffff;"}">
    <td style="padding:11px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#555555;width:38%;border-bottom:1px solid #eeeeee;">${label}</td>
    <td style="padding:11px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222222;border-bottom:1px solid #eeeeee;">${value}</td>
  </tr>`;

// Callout / notice box — plain left border, no color backgrounds
const notice = (text, type = "info") => {
  const borderColor = { info: "#1a1a2e", success: "#2d6a4f", warning: "#b45309", danger: "#991b1b" }[type] || "#1a1a2e";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="border-left:4px solid ${borderColor};padding:14px 18px;background-color:#f9f9f9;">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333333;line-height:1.65;">${text}</p>
      </td>
    </tr>
  </table>`;
};

// Score / metric block
const metric = (label, value, sub = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="border:1px solid #dddddd;padding:20px 24px;background-color:#f9f9f9;">
        <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;color:#888888;text-transform:uppercase;letter-spacing:1px;">${label}</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:bold;color:#1a1a2e;">${value}</p>
        ${sub ? `<p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#777777;">${sub}</p>` : ""}
      </td>
    </tr>
  </table>`;

// Status badge — inline text, no background color
const statusLabel = (text, type = "neutral") => {
  const color = { success: "#2d6a4f", warning: "#b45309", danger: "#991b1b", neutral: "#444444" }[type] || "#444444";
  return `<strong style="color:${color};">${text}</strong>`;
};

// Quoted block — for displaying user-submitted text like messages, reasons
const quoteBlock = (label, text) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="border:1px solid #dddddd;border-left:4px solid #1a1a2e;padding:16px 20px;background-color:#f9f9f9;">
        <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;color:#888888;text-transform:uppercase;letter-spacing:1px;">${label}</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333333;line-height:1.65;">${text}</p>
      </td>
    </tr>
  </table>`;

const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

// ─────────────────────────────────────────────────────────────────────────────
// AUTH TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/register  →  verify email
export const verifyEmailTemplate = (name, verifyUrl) => layout(
  `Verify your email to activate your Tech Mind Academy account.`,
  h1("Verify Your Email Address") +
  p(`Hi ${name},`) +
  p(`Thank you for registering with Tech Mind Academy. To complete your registration and activate your account, please verify your email address by clicking the button below.`) +
  btn("Verify Email Address", verifyUrl) +
  divider() +
  p(`If the button does not work, copy and paste the following link into your browser:`) +
  `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#555555;word-break:break-all;"><a href="${verifyUrl}" style="color:#1a1a2e;">${verifyUrl}</a></p>` +
  small(`This link will expire in 24 hours. If you did not create an account with Tech Mind Academy, you can safely ignore this email.`)
);

// POST /api/auth/forgot-password  →  reset password
export const resetPasswordTemplate = (name, resetUrl) => layout(
  `Reset your Tech Mind Academy password.`,
  h1("Password Reset Request") +
  p(`Hi ${name},`) +
  p(`We received a request to reset the password for your Tech Mind Academy account. If you made this request, click the button below to choose a new password.`) +
  btn("Reset Your Password", resetUrl) +
  divider() +
  p(`If the button does not work, copy and paste the following link into your browser:`) +
  `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#555555;word-break:break-all;"><a href="${resetUrl}" style="color:#1a1a2e;">${resetUrl}</a></p>` +
  notice(`This link will expire in 30 minutes. For your security, this link can only be used once. If you did not request a password reset, no action is required and your password will remain unchanged.`, "warning")
);

// ─────────────────────────────────────────────────────────────────────────────
// ENROLLMENT TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/courses/:courseId/enroll  |  POST /api/payments/verify  →  student confirmed
export const enrollmentConfirmationTemplate = (studentName, courseTitle, courseUrl) => layout(
  `Your enrollment in "${courseTitle}" is confirmed.`,
  h1("Enrollment Confirmed") +
  p(`Hi ${studentName},`) +
  p(`Your enrollment has been confirmed and you now have full access to the course. You can start learning right away — your progress is saved automatically as you move through each lesson.`) +
  infoTable(
    infoRow("Course", courseTitle, false) +
    infoRow("Status", statusLabel("Active", "success"), true) +
    infoRow("Access", "Lifetime access", false) +
    infoRow("Enrolled On", fmtDate(new Date()), true)
  ) +
  btn("Go to Your Course", courseUrl) +
  divider() +
  small(`If you have any questions about your enrollment, reply to this email and our team will assist you.`)
);

// POST /api/payments/verify  →  creator notification of new sale
export const creatorNewEnrollmentTemplate = (creatorName, studentName, courseTitle, dashboardUrl) => layout(
  `${studentName} enrolled in your course "${courseTitle}".`,
  h1("New Student Enrolled") +
  p(`Hi ${creatorName},`) +
  p(`A new student has enrolled in one of your courses. Here are the details:`) +
  infoTable(
    infoRow("Student Name", studentName, false) +
    infoRow("Course", courseTitle, true) +
    infoRow("Enrolled On", fmtDate(new Date()), false)
  ) +
  p(`You can view all enrollments, track student progress, and manage your course from your creator dashboard.`) +
  btn("Go to Creator Dashboard", dashboardUrl) +
  divider() +
  small(`You are receiving this notification because you are a course creator on Tech Mind Academy.`)
);

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENT TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// PATCH /api/assignments/:id/submissions/:sid/grade  →  student graded
export const assignmentGradedTemplate = (studentName, courseTitle, assignmentTitle, grade, maxMarks, feedback, courseUrl) => layout(
  `Your assignment "${assignmentTitle}" has been graded.`,
  h1("Assignment Graded") +
  p(`Hi ${studentName},`) +
  p(`Your instructor has reviewed and graded your assignment submission. Here is a summary of your result:`) +
  infoTable(
    infoRow("Assignment", assignmentTitle, false) +
    infoRow("Course", courseTitle, true) +
    infoRow("Grade", `${grade} / ${maxMarks}`, false) +
    infoRow("Graded On", fmtDate(new Date()), true)
  ) +
  (feedback ? quoteBlock("Instructor Feedback", feedback) : "") +
  btn("View Your Submission", courseUrl) +
  divider() +
  small(`Continue working through your course to complete all assignments and earn your certificate.`)
);

// POST /api/assignments/:id/submit  →  creator notified of new submission
export const creatorSubmissionTemplate = (creatorName, studentName, assignmentTitle, courseTitle, submissionsUrl) => layout(
  `${studentName} submitted "${assignmentTitle}" — review required.`,
  h1("New Assignment Submission") +
  p(`Hi ${creatorName},`) +
  p(`A student has submitted an assignment that is waiting for your review and grading.`) +
  infoTable(
    infoRow("Student", studentName, false) +
    infoRow("Assignment", assignmentTitle, true) +
    infoRow("Course", courseTitle, false) +
    infoRow("Submitted On", fmtDate(new Date()), true)
  ) +
  p(`Please log in to your dashboard to review the submission, provide feedback, and assign a grade.`) +
  btn("Review Submission", submissionsUrl) +
  divider() +
  small(`Timely feedback helps students improve and stay engaged with your course.`)
);

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/quizzes/:quizId/submit  →  student passed quiz
export const quizPassedTemplate = (studentName, quizTitle, courseTitle, scorePercent, passMark, courseUrl) => layout(
  `You passed the quiz: ${quizTitle} with ${scorePercent}%.`,
  h1("Quiz Passed") +
  p(`Hi ${studentName},`) +
  p(`Congratulations on passing your quiz. Here is a summary of your result:`) +
  metric("Your Score", `${scorePercent}%`, `The passing mark was ${passMark}%.`) +
  infoTable(
    infoRow("Quiz", quizTitle, false) +
    infoRow("Course", courseTitle, true) +
    infoRow("Result", statusLabel("Passed", "success"), false) +
    infoRow("Completed On", fmtDate(new Date()), true)
  ) +
  btn("Continue Learning", courseUrl) +
  divider() +
  small(`Well done. Keep progressing through your course to complete all lessons and earn your certificate.`)
);

// ─────────────────────────────────────────────────────────────────────────────
// COURSE COMPLETION TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/quizzes/:quizId/submit (final quiz pass)  →  student completed course
export const courseCompletedTemplate = (studentName, courseTitle, certUrl) => layout(
  `You have completed "${courseTitle}" — your certificate is ready.`,
  h1("Course Completed") +
  p(`Hi ${studentName},`) +
  p(`You have successfully completed the course. This is a significant achievement and we hope you found the learning experience valuable.`) +
  infoTable(
    infoRow("Course", courseTitle, false) +
    infoRow("Status", statusLabel("Completed", "success"), true) +
    infoRow("Completed On", fmtDate(new Date()), false) +
    infoRow("Certificate", "Issued and ready to download", true)
  ) +
  notice(`Your certificate of completion has been issued. Download it from your dashboard and add it to your resume or LinkedIn profile to showcase your achievement.`, "success") +
  btn("Download Your Certificate", certUrl) +
  divider() +
  small(`Thank you for learning with Tech Mind Academy. We look forward to seeing you in another course.`)
);

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT FORM TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/contact  →  admin notification
export const contactFormTemplate = (name, email, message) => layout(
  `New contact form message from ${name}.`,
  h1("New Contact Form Message") +
  p(`A visitor has submitted the contact form on Tech Mind Academy.`) +
  infoTable(
    infoRow("Name", name, false) +
    infoRow("Email", `<a href="mailto:${email}" style="color:#1a1a2e;">${email}</a>`, true) +
    infoRow("Received On", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), false)
  ) +
  quoteBlock("Message", message.replace(/\n/g, "<br/>")) +
  small(`Reply directly to <a href="mailto:${email}" style="color:#999999;">${email}</a> to respond to this enquiry.`)
);

// POST /api/contact  →  user confirmation
export const contactConfirmationTemplate = (name, message) => layout(
  `We received your message and will respond within 24 hours.`,
  h1("We Received Your Message") +
  p(`Hi ${name},`) +
  p(`Thank you for reaching out to Tech Mind Academy. We have received your message and a member of our team will get back to you within 24 hours during business days.`) +
  quoteBlock("Your Message", message.replace(/\n/g, "<br/>")) +
  divider() +
  small(`If your matter is urgent, you can also reach us directly at <a href="mailto:${process.env.SMTP_USER}" style="color:#999999;">${process.env.SMTP_USER}</a>.`)
);

// ─────────────────────────────────────────────────────────────────────────────
// REFUND TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/refunds  →  student confirmation
export const refundRequestedStudentTemplate = ({ studentName, courseName, amountPaid, progressPercent, reason, refundId }) => layout(
  `Your refund request for "${courseName}" has been received.`,
  h1("Refund Request Received") +
  p(`Hi ${studentName},`) +
  p(`We have received your refund request for the course below. Our team will review your request within 2 business days and you will be notified of the outcome by email.`) +
  infoTable(
    infoRow("Course", courseName, false) +
    infoRow("Amount Paid", `Rs. ${Number(amountPaid).toLocaleString("en-IN")}`, true) +
    infoRow("Progress at Request", `${progressPercent}%`, false) +
    infoRow("Request Reference", refundId, true) +
    infoRow("Status", statusLabel("Pending Review", "warning"), false)
  ) +
  quoteBlock("Your Reason", reason) +
  notice(`Once approved, refunds are processed to the original payment method within 5 to 10 business days. UPI refunds typically arrive within 3 to 5 business days. International cards may take up to 15 business days.`, "info") +
  btn("View My Refund Requests", `${process.env.CLIENT_URL}/student/refunds`) +
  divider() +
  small(`If you did not submit this request, please contact us immediately by replying to this email.`)
);

// POST /api/refunds  →  admin alert
export const refundAlertAdminTemplate = ({ studentName, studentEmail, courseName, amountPaid, progressPercent, reason, refundId }) => layout(
  `Action required: New refund request from ${studentName} for "${courseName}".`,
  h1("New Refund Request — Action Required") +
  p(`A student has submitted a refund request that requires your review.`) +
  infoTable(
    infoRow("Student Name", studentName, false) +
    infoRow("Student Email", `<a href="mailto:${studentEmail}" style="color:#1a1a2e;">${studentEmail}</a>`, true) +
    infoRow("Course", courseName, false) +
    infoRow("Amount Paid", `Rs. ${Number(amountPaid).toLocaleString("en-IN")}`, true) +
    infoRow("Progress at Request", `${progressPercent}%`, false) +
    infoRow("Request Reference", refundId, true) +
    infoRow("Status", statusLabel("Pending Review", "warning"), false)
  ) +
  quoteBlock("Student's Reason", reason) +
  btn("Review in Admin Panel", `${process.env.CLIENT_URL}/admin/refunds`) +
  divider() +
  small(`Log in to the admin panel to approve or reject this request. The student will be notified automatically when a decision is made.`)
);

// PATCH /api/refunds/admin/:id/resolve (approve)  →  student approved
export const refundApprovedStudentTemplate = ({ studentName, courseName, refundAmount, paymentMethod, adminNote, refundId }) => layout(
  `Your refund of Rs. ${Number(refundAmount).toLocaleString("en-IN")} for "${courseName}" has been approved.`,
  h1("Refund Approved") +
  p(`Hi ${studentName},`) +
  p(`Your refund request has been reviewed and approved. Here are the details of your refund:`) +
  infoTable(
    infoRow("Course", courseName, false) +
    infoRow("Refund Amount", `Rs. ${Number(refundAmount).toLocaleString("en-IN")}`, true) +
    infoRow("Refund Method", paymentMethod || "Original payment method", false) +
    infoRow("Request Reference", refundId, true) +
    infoRow("Status", statusLabel("Approved", "success"), false)
  ) +
  (adminNote ? quoteBlock("Message from Our Team", adminNote) : "") +
  notice(`Refunds typically appear in your account within 5 to 10 business days depending on your bank or payment provider. UPI refunds are usually faster at 3 to 5 business days. If you do not see the refund after 15 business days, please contact your bank with the reference number above.`, "info") +
  p(`Your access to ${courseName} has been removed as part of the refund process.`) +
  btn("Explore Other Courses", `${process.env.CLIENT_URL}/courses`) +
  divider() +
  small(`Thank you for your patience during the review process. We hope to see you back on Tech Mind Academy.`)
);

// PATCH /api/refunds/admin/:id/resolve (reject)  →  student rejected
export const refundRejectedStudentTemplate = ({ studentName, courseName, adminNote, progressPercent, refundId }) => layout(
  `Update on your refund request for "${courseName}".`,
  h1("Refund Request Update") +
  p(`Hi ${studentName},`) +
  p(`Thank you for your patience while we reviewed your refund request. After careful consideration, we are unable to process a refund for this course at this time.`) +
  infoTable(
    infoRow("Course", courseName, false) +
    infoRow("Progress at Request", `${progressPercent}%`, true) +
    infoRow("Request Reference", refundId, false) +
    infoRow("Status", statusLabel("Not Approved", "danger"), true)
  ) +
  (adminNote ? quoteBlock("Reason from Our Team", adminNote) : "") +
  notice(`If you believe this decision was made in error or have additional information to share, please reply to this email with your request reference number and we will look into your case again.`, "warning") +
  p(`Your access to ${courseName} remains fully active. We encourage you to continue with the course.`) +
  btn("Continue Learning", `${process.env.CLIENT_URL}/student/learn`) +
  divider() +
  small(`Our support team is always available to help. Reply to this email if you have any questions.`)
);

// ─────────────────────────────────────────────────────────────────────────────
// INTERNSHIP APPLICATION TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/internships/:id/apply  →  admin notification
export const internshipAdminTemplate = ({ name, email, phone, college, degree, year, skills, linkedIn, github, whyApply, internship, application }) => layout(
  `New internship application from ${name} for ${internship.title} at ${internship.company}.`,
  h1("New Internship Application") +
  p(`A new application has been received and automatically shortlisted.`) +
  h2("Position Details") +
  infoTable(
    infoRow("Position", internship.title, false) +
    infoRow("Company", internship.company, true) +
    infoRow("Location", internship.location, false) +
    infoRow("Application ID", application._id, true)
  ) +
  h2("Applicant Details") +
  infoTable(
    infoRow("Full Name", name, false) +
    infoRow("Email", `<a href="mailto:${email}" style="color:#1a1a2e;">${email}</a>`, true) +
    infoRow("Phone", phone, false) +
    infoRow("College", college, true) +
    infoRow("Degree and Year", `${degree} — ${year}`, false) +
    (skills ? infoRow("Skills", skills, true) : "") +
    (linkedIn ? infoRow("LinkedIn", `<a href="${linkedIn}" style="color:#1a1a2e;">${linkedIn}</a>`, false) : "") +
    (github ? infoRow("GitHub", `<a href="${github}" style="color:#1a1a2e;">${github}</a>`, true) : "") +
    infoRow("Status", statusLabel("Auto-Shortlisted", "success"), false)
  ) +
  quoteBlock("Applicant's Motivation", whyApply) +
  divider() +
  small(`Log in to the admin panel to review this application and update the status.`)
);

// POST /api/internships/:id/apply  →  applicant shortlisted confirmation
export const internshipApplicantTemplate = ({ name, internship, application }) => layout(
  `You have been shortlisted for ${internship.title} at ${internship.company}.`,
  h1("Your Application Has Been Received") +
  p(`Hi ${name},`) +
  p(`Thank you for applying for the internship position at Tech Mind Academy. We have reviewed your application and are pleased to inform you that you have been shortlisted for the next stage of the process.`) +
  infoTable(
    infoRow("Position", internship.title, false) +
    infoRow("Company", internship.company, true) +
    infoRow("Location", internship.location, false) +
    infoRow("Duration", internship.duration, true) +
    infoRow("Status", statusLabel("Shortlisted", "success"), false) +
    infoRow("Application Reference", application._id.toString(), true)
  ) +
  notice(`Our team will review your profile in detail and reach out to you within 2 to 3 business days with the next steps. Please keep an eye on this email address for further communication.`, "info") +
p(`Your offer letter is attached to this email. Please download it, sign it, and submit it using the link below.`) +
btn("Submit Signed Offer Letter", "https://docs.google.com/forms/d/e/1FAIpQLSfOTYuJISYC4225bcVQlyWoCJVbeoUbFF9jkVd2nMUosuCdbg/viewform?usp=publish-editor") +
  divider() +
  small(`If you have any questions, reply to this email with your application reference number and our team will assist you.`)
);

// PUT /api/internships/applications/:appId/status (reviewed)


// PUT /api/internships/applications/:appId/status (shortlisted)
export const internshipStatusShortlistedTemplate = ({ application }) => layout(
  `You have been shortlisted for ${application.internship.title}.`,
  h1("You Have Been Shortlisted") +
  p(`Hi ${application.name},`) +
  p(`We are pleased to inform you that after reviewing your application, you have been shortlisted for the internship position below. Our team will be reaching out to you shortly with the next steps.`) +
  infoTable(
    infoRow("Position", application.internship.title, false) +
    infoRow("Company", application.internship.company, true) +
    infoRow("Application Reference", application._id.toString(), false) +
    infoRow("Status", statusLabel("Shortlisted", "success"), true)
  ) +
  notice(`Please ensure that you are available and responsive on this email address. We will contact you within 2 to 3 business days with further details.`, "info") +
  divider() +
  small(`If you have any questions, reply to this email with your application reference number.`)
);

// PUT /api/internships/applications/:appId/status (rejected)
export const internshipStatusRejectedTemplate = ({ application }) => layout(
  `Update on your application for ${application.internship.title}.`,
  h1("Application Status Update") +
  p(`Hi ${application.name},`) +
  p(`Thank you for taking the time to apply for the ${application.internship.title} position at ${application.internship.company} and for your interest in Tech Mind Academy.`) +
  p(`After carefully reviewing all applications, we regret to inform you that we will not be moving forward with your application at this time. This decision was difficult given the number of strong candidates who applied.`) +
  infoTable(
    infoRow("Position", application.internship.title, false) +
    infoRow("Company", application.internship.company, true) +
    infoRow("Application Reference", application._id.toString(), false) +
    infoRow("Status", statusLabel("Not Selected", "danger"), true)
  ) +
  notice(`We encourage you to apply to future internship opportunities that match your skills. We keep all applications on file and may reach out if a suitable position becomes available.`, "info") +
  divider() +
  small(`Thank you again for your interest in Tech Mind Academy. We wish you the very best in your career journey.`)
);

// ─────────────────────────────────────────────────────────────────────────────
// CERTIFICATE PURCHASE TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/certificates/verify-payment  →  admin notification
export const certificatePurchaseAdminTemplate = ({ certOrder, certNumber, razorpay_order_id, razorpay_payment_id }) => layout(
  `Certificate purchase received from ${certOrder.name} — Rs. ${certOrder.amount}.`,
  h1("New Certificate Purchase") +
  p(`A student has completed payment for a certificate. Please issue the certificate and send it to the student.`) +
  infoTable(
    infoRow("Student Name", certOrder.name, false) +
    infoRow("Email", `<a href="mailto:${certOrder.email}" style="color:#1a1a2e;">${certOrder.email}</a>`, true) +
    infoRow("Phone", certOrder.phone, false) +
    infoRow("Course Name", certOrder.courseName, true) +
    infoRow("Certificate Type", certOrder.certificateType.charAt(0).toUpperCase() + certOrder.certificateType.slice(1), false) +
    infoRow("Start Date", certOrder.startDate, true) +
    infoRow("Completion Date", certOrder.completionDate, false) +
    infoRow("Amount Paid", `Rs. ${certOrder.amount}`, true) +
    infoRow("Certificate Number", certNumber, false) +
    infoRow("Razorpay Order ID", razorpay_order_id, true) +
    infoRow("Payment ID", razorpay_payment_id, false) +
    infoRow("Status", statusLabel("Payment Received", "success"), true)
  ) +
  notice(`Please send the issued certificate to the student at ${certOrder.email} as soon as possible.`, "warning") +
  divider() +
  small(`This is an automated notification from the Tech Mind Academy payment system.`)
);

// POST /api/certificates/verify-payment  →  student payment confirmed
export const certificatePurchaseStudentTemplate = ({ certOrder, certNumber, pdfAttached }) => layout(
  `Your certificate payment has been confirmed — ${certOrder.courseName}.`,
  h1("Payment Confirmed") +
  p(`Hi ${certOrder.name},`) +
  p(`Your payment of Rs. ${certOrder.amount} has been received successfully. Your certificate is now being processed.`) +
  infoTable(
    infoRow("Course", certOrder.courseName, false) +
    infoRow("Certificate Type", certOrder.certificateType.charAt(0).toUpperCase() + certOrder.certificateType.slice(1), true) +
    infoRow("Amount Paid", `Rs. ${certOrder.amount}`, false) +
    infoRow("Certificate Number", certNumber, true) +
    infoRow("Status", statusLabel(pdfAttached ? "Issued" : "Processing", pdfAttached ? "success" : "warning"), false)
  ) +
  (pdfAttached
    ? p(`Your certificate is attached to this email. Download it and save it for your records. You can also add it to your LinkedIn profile or include it in your resume.`)
    : notice(`Your certificate will be sent to this email address within 1 to 2 business days. If you do not receive it within that time, please reply to this email with your certificate number above.`, "info")
  ) +
  divider() +
  small(`Please keep your certificate number for future reference. If you have any questions, reply to this email.`)
);

// POST /api/certificates/admin/issue  →  admin manually issued to student
export const certificateAdminIssuedTemplate = ({ certOrder, certNumber, certLabel }) => layout(
  `Your ${certLabel} for ${certOrder.courseName} has been issued.`,
  h1("Your Certificate Has Been Issued") +
  p(`Hi ${certOrder.name},`) +
  p(`Your certificate for completing ${certOrder.courseName} has been issued by Tech Mind Academy and is attached to this email.`) +
  infoTable(
    infoRow("Course", certOrder.courseName, false) +
    infoRow("Certificate Type", certLabel, true) +
    infoRow("Certificate Number", certNumber, false) +
    infoRow("Issued On", fmtDate(new Date()), true) +
    infoRow("Status", statusLabel("Issued", "success"), false)
  ) +
  p(`Your certificate is attached to this email as a PDF file. Please download and save it. You can use it on your resume, LinkedIn profile, or share it with potential employers.`) +
  divider() +
  small(`Please keep your certificate number for verification purposes. If you have any questions, reply to this email.`)
);

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/payments/refund/:orderId (admin refund)  →  student notification
export const paymentRefundedTemplate = (studentName, courseTitle, refundAmount, razorpayPaymentId) => layout(
  `Your refund of Rs. ${refundAmount} for "${courseTitle}" has been processed.`,
  h1("Refund Processed") +
  p(`Hi ${studentName},`) +
  p(`A refund has been issued for your purchase of ${courseTitle}. The amount will be returned to your original payment method.`) +
  infoTable(
    infoRow("Course", courseTitle, false) +
    infoRow("Refund Amount", `Rs. ${Number(refundAmount).toLocaleString("en-IN")}`, true) +
    infoRow("Payment Reference", razorpayPaymentId, false) +
    infoRow("Refunded On", fmtDate(new Date()), true) +
    infoRow("Status", statusLabel("Refunded", "success"), false)
  ) +
  notice(`Refunds typically appear in your account within 5 to 10 business days. UPI refunds are usually faster at 3 to 5 business days. International cards may take up to 15 business days. If you do not see the refund after 15 business days, please contact your bank with the payment reference number above.`, "info") +
  p(`Your enrollment in ${courseTitle} has been removed as part of this refund.`) +
  divider() +
  small(`If you have any questions about this refund, reply to this email with the payment reference number.`)
);