import { google } from "googleapis";

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPORT
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
  const boundary = `boundary_${Date.now()}`;

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
    .replace(/&mdash;/g, "--")
    .replace(/&bull;/g, "*")
    .trim();

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

const wrap = (content, preheader = "") => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Tech Mind Academy</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    body{margin:0!important;padding:0!important;background-color:#f4f6f9}
    a{color:#1A56DB}
    @media only screen and (max-width:620px){
      .email-wrapper{width:100%!important}
      .email-body{padding:24px 20px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f4f6f9;">${preheader}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f9;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" class="email-wrapper" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Brand header -->
          <tr>
            <td style="padding-bottom:20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-bottom:3px solid #1A56DB;padding-bottom:16px;">
                    <span style="font-size:20px;font-weight:800;color:#0D1B3E;letter-spacing:-0.5px;">Tech Mind Academy</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="email-body" style="padding:40px 40px 36px;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="text-align:center;font-size:12px;color:#9ca3af;line-height:1.7;">
                    <p style="margin:0 0 4px;">
                      Tech Mind Academy &bull;
                      <a href="${process.env.CLIENT_URL}" style="color:#9ca3af;text-decoration:underline;">techmindacademy.in</a>
                    </p>
                    <p style="margin:0 0 4px;">
                      You received this email because you have an account with Tech Mind Academy.
                    </p>
                    <p style="margin:0;">
                      &copy; ${new Date().getFullYear()} Tech Mind Academy. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// ─── Type helpers ─────────────────────────────────────────────────────────────

const heading = (text) =>
  `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0D1B3E;line-height:1.3;">${text}</h1>`;

const subheading = (text) =>
  `<h2 style="margin:24px 0 10px;font-size:16px;font-weight:600;color:#0D1B3E;">${text}</h2>`;

const body = (text) =>
  `<p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.7;">${text}</p>`;

const small = (text) =>
  `<p style="margin:20px 0 0;font-size:13px;color:#9ca3af;line-height:1.65;">${text}</p>`;

const divider = () =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
    <tr><td style="border-top:1px solid #e5e7eb;"></td></tr>
  </table>`;

const btn = (text, url) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
    <tr>
      <td style="background-color:#1A56DB;border-radius:6px;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:13px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">${text}</a>
      </td>
    </tr>
  </table>`;

const infoRow = (label, value, shade = false) =>
  `<tr style="${shade ? "background-color:#f9fafb;" : "background-color:#ffffff;"}">
    <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;width:38%;border-bottom:1px solid #f3f4f6;">${label}</td>
    <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${value}</td>
  </tr>`;

const infoTable = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">${rows}</table>`;

const callout = (text, variant = "info") => {
  const v = {
    info:    { bg: "#eff6ff", border: "#1A56DB", text: "#1e40af" },
    success: { bg: "#f0fdf4", border: "#16a34a", text: "#166534" },
    warning: { bg: "#fffbeb", border: "#d97706", text: "#92400e" },
    danger:  { bg: "#fef2f2", border: "#dc2626", text: "#991b1b" },
  }[variant] || { bg: "#eff6ff", border: "#1A56DB", text: "#1e40af" };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="background-color:${v.bg};border-left:4px solid ${v.border};border-radius:0 6px 6px 0;padding:16px 20px;">
        <p style="margin:0;font-size:14px;color:${v.text};line-height:1.7;">${text}</p>
      </td>
    </tr>
  </table>`;
};

const noteBox = (label, text) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">${label}</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">${text}</p>
      </td>
    </tr>
  </table>`;

const metric = (label, value, sub = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:20px 24px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">${label}</p>
        <p style="margin:0;font-size:32px;font-weight:700;color:#0D1B3E;">${value}</p>
        ${sub ? `<p style="margin:6px 0 0;font-size:13px;color:#6b7280;">${sub}</p>` : ""}
      </td>
    </tr>
  </table>`;

const statusBadge = (status, map) => {
  const label = map[status] || status;
  return `<span style="font-size:13px;font-weight:600;color:#374151;">${label}</span>`;
};

const formatINR = (amount) =>
  `Rs. ${Number(amount).toLocaleString("en-IN")}`;

const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTH TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export const verifyEmailTemplate = (name, verifyUrl) => wrap(
  heading("Please verify your email address") +
  body(`Hello ${name},`) +
  body(`Thank you for registering with Tech Mind Academy. Before you can access your account and start learning, we need to confirm that this email address belongs to you.`) +
  body(`Click the button below to verify your email address. This link is valid for 24 hours and can only be used once.`) +
  btn("Verify My Email Address", verifyUrl) +
  divider() +
  body(`If you did not create a Tech Mind Academy account, you can safely ignore this email. No account will be activated without clicking the link above.`) +
  small(`For your security, this link expires in 24 hours. If you need a new verification link, please register again or contact us at <a href="mailto:${process.env.SMTP_USER}" style="color:#9ca3af;">${process.env.SMTP_USER}</a>.`),
  `Verify your email to activate your Tech Mind Academy account.`
);

export const resetPasswordTemplate = (name, resetUrl) => wrap(
  heading("Reset your account password") +
  body(`Hello ${name},`) +
  body(`We received a request to reset the password for the Tech Mind Academy account associated with this email address. If you made this request, click the button below to choose a new password.`) +
  body(`This reset link is valid for 30 minutes. After it expires, you will need to submit a new password reset request.`) +
  btn("Reset My Password", resetUrl) +
  divider() +
  body(`If you did not request a password reset, please ignore this email. Your current password will remain unchanged and your account is safe. However, if you are concerned that someone else requested this, we recommend reviewing your account security.`) +
  small(`For security reasons, this link can only be used once and expires in 30 minutes. Do not share this link with anyone.`),
  `Password reset requested for your Tech Mind Academy account.`
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. ENROLLMENT TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// To student — enrollment confirmed
export const enrollmentConfirmationTemplate = (studentName, courseTitle, courseUrl) => wrap(
  heading("Your enrollment is confirmed") +
  body(`Hello ${studentName},`) +
  body(`Congratulations and welcome. Your enrollment in the course below has been successfully confirmed. You now have full access to all course materials, including lessons, quizzes, and assignments.`) +
  infoTable(
    infoRow("Course", courseTitle, true) +
    infoRow("Enrollment Status", "Active &mdash; ready to start") +
    infoRow("Access Type", "Lifetime access included", true) +
    infoRow("Enrolled On", formatDate(new Date()))
  ) +
  body(`Your progress is saved automatically as you move through each lesson. You can resume at any time from where you left off. We recommend setting aside a consistent study schedule to get the most out of this course.`) +
  callout(`Start with the first lesson and work through each section in order. Completing lessons in sequence ensures you build a solid foundation before advancing to more complex topics.`, "info") +
  btn("Go to My Course", courseUrl) +
  divider() +
  body(`If you have any questions about your enrollment or need assistance navigating the platform, our support team is here to help. Reply to this email or reach us at <a href="mailto:${process.env.SMTP_USER}" style="color:#1A56DB;">${process.env.SMTP_USER}</a>.`) +
  small(`This email confirms your enrollment in "${courseTitle}" on Tech Mind Academy.`),
  `Your enrollment in "${courseTitle}" is confirmed and ready to begin.`
);

// To creator — new student enrolled
export const creatorNewEnrollmentTemplate = (creatorName, studentName, courseTitle, dashboardUrl) => wrap(
  heading("A new student has enrolled in your course") +
  body(`Hello ${creatorName},`) +
  body(`Great news. A new student has just enrolled in one of your courses on Tech Mind Academy. Your course is growing and making an impact.`) +
  infoTable(
    infoRow("Student Name", studentName, true) +
    infoRow("Course", courseTitle) +
    infoRow("Enrolled On", formatDate(new Date()), true)
  ) +
  body(`You can view this student's progress, review any assignments they submit, and track overall course performance from your creator dashboard.`) +
  callout(`Engaging with your students early makes a significant difference in course completion rates. Consider reaching out if you notice a student has not accessed the course within the first few days.`, "info") +
  btn("Go to Creator Dashboard", dashboardUrl) +
  divider() +
  body(`Thank you for creating quality content on Tech Mind Academy. Your work helps students build real skills and advance their careers.`) +
  small(`You are receiving this notification because you are a course creator on Tech Mind Academy.`),
  `${studentName} just enrolled in "${courseTitle}".`
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. ASSIGNMENT TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// To student — assignment graded
export const assignmentGradedTemplate = (studentName, courseTitle, lessonTitle, grade, maxMarks, feedback, courseUrl) => wrap(
  heading("Your assignment has been graded") +
  body(`Hello ${studentName},`) +
  body(`Your instructor has reviewed your assignment submission and a grade has been recorded. Please find the details of your result below.`) +
  infoTable(
    infoRow("Course", courseTitle, true) +
    infoRow("Assignment", lessonTitle) +
    infoRow("Grade Received", `<strong style="font-size:15px;color:#0D1B3E;">${grade} out of ${maxMarks}</strong>`, true) +
    infoRow("Percentage", `${Math.round((grade / maxMarks) * 100)}%`) +
    infoRow("Graded On", formatDate(new Date()), true)
  ) +
  (feedback
    ? noteBox("Instructor Feedback", feedback)
    : callout(`Your instructor has not added specific feedback for this submission. If you have questions about your grade, you can contact your instructor directly.`, "info")
  ) +
  body(`Reviewing your instructor's feedback carefully is one of the most effective ways to improve. Take time to understand the comments before moving on to the next lesson.`) +
  btn("View My Submission", courseUrl) +
  divider() +
  body(`Keep up the effort and continue building on what you have learned. Every assignment completed brings you one step closer to finishing the course and earning your certificate.`) +
  small(`If you believe there is an error in your grade, please contact your instructor or reach out to us at <a href="mailto:${process.env.SMTP_USER}" style="color:#9ca3af;">${process.env.SMTP_USER}</a>.`),
  `Your assignment in "${lessonTitle}" has been graded: ${grade}/${maxMarks}.`
);

// To creator — new submission received
export const creatorSubmissionTemplate = (creatorName, studentName, assignmentTitle, courseTitle, submissionsUrl) => wrap(
  heading("A student has submitted an assignment") +
  body(`Hello ${creatorName},`) +
  body(`One of your students has submitted an assignment that is now waiting for your review and grading. Timely feedback helps students stay motivated and on track.`) +
  infoTable(
    infoRow("Student", studentName, true) +
    infoRow("Assignment", assignmentTitle) +
    infoRow("Course", courseTitle, true) +
    infoRow("Submitted On", formatDate(new Date()))
  ) +
  body(`Once you have reviewed the submission, you can assign a grade and leave written feedback directly from your creator dashboard. Students receive an email notification when their work has been graded.`) +
  callout(`We recommend grading submissions within 48 hours of receipt. Students who receive prompt feedback are significantly more likely to complete the course.`, "warning") +
  btn("Review This Submission", submissionsUrl) +
  divider() +
  body(`Thank you for your continued dedication to your students. Your feedback shapes their learning experience and helps them develop practical skills.`) +
  small(`You are receiving this notification because you are a course creator on Tech Mind Academy. You can manage notification preferences from your account settings.`),
  `${studentName} submitted "${assignmentTitle}" and is waiting for your review.`
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. QUIZ TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// To student — quiz passed
export const quizPassedTemplate = (studentName, quizTitle, courseTitle, scorePercent, passMark, courseUrl) => wrap(
  heading("You passed the quiz") +
  body(`Hello ${studentName},`) +
  body(`Well done. You have successfully passed the quiz and met the required pass mark. Here is a summary of your performance.`) +
  metric("Your Score", `${scorePercent}%`, `Required pass mark was ${passMark}%`) +
  infoTable(
    infoRow("Quiz", quizTitle, true) +
    infoRow("Course", courseTitle) +
    infoRow("Result", "Passed", true) +
    infoRow("Completed On", formatDate(new Date()))
  ) +
  body(`Passing this quiz demonstrates that you have understood the material covered in this section of the course. Continue working through the remaining lessons to complete the course and earn your certificate.`) +
  callout(`If the quiz covered topics you found challenging, we recommend revisiting the relevant lessons before proceeding. A strong understanding of foundational concepts will help you succeed in later sections.`, "info") +
  btn("Continue Learning", courseUrl) +
  divider() +
  body(`Each quiz you pass brings you closer to completing the course. Stay consistent with your study sessions and you will be earning your certificate before you know it.`) +
  small(`If you have questions about any of the quiz topics, review the lesson material or contact your instructor for clarification.`),
  `You passed the quiz: ${quizTitle} with a score of ${scorePercent}%.`
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. COURSE COMPLETION TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// To student — course completed, certificate ready
export const courseCompletedTemplate = (studentName, courseTitle, certUrl) => wrap(
  heading("You have completed the course") +
  body(`Hello ${studentName},`) +
  body(`This is a significant achievement. You have successfully completed all the lessons, assessments, and requirements for the course below. Your commitment and hard work have paid off.`) +
  infoTable(
    infoRow("Course", courseTitle, true) +
    infoRow("Completion Status", "Fully Completed") +
    infoRow("Certificate", "Issued and available for download", true) +
    infoRow("Completed On", formatDate(new Date()))
  ) +
  callout(`Your certificate of completion has been generated and is ready to download. You can add it to your LinkedIn profile, include it in your resume, or share it with employers to demonstrate your skills.`, "success") +
  body(`Your certificate serves as formal recognition of the skills and knowledge you have acquired. We encourage you to share your achievement and put your new skills to practical use.`) +
  btn("Download My Certificate", certUrl) +
  divider() +
  body(`Thank you for choosing Tech Mind Academy as your learning partner. We hope this course has been valuable and we look forward to supporting your continued growth. Explore our full course catalogue to keep building on what you have learned.`) +
  small(`Your certificate is permanently associated with your Tech Mind Academy account and can be downloaded at any time from your student dashboard.`),
  `You have completed "${courseTitle}". Your certificate is ready to download.`
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. REFUND TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const refundStatusLabel = (status) => statusBadge(status, {
  pending:  "Pending Review",
  approved: "Approved",
  rejected: "Not Approved",
});

// To student — refund request received
export const refundRequestedStudentTemplate = ({ studentName, courseName, amountPaid, progressPercent, reason, refundId }) => wrap(
  heading("Your refund request has been received") +
  body(`Hello ${studentName},`) +
  body(`We have received your refund request for the course listed below. Our support team will review your request against our refund policy and respond within 2 business days. You will receive an email once a decision has been made.`) +
  infoTable(
    infoRow("Course", courseName, true) +
    infoRow("Amount Paid", formatINR(amountPaid)) +
    infoRow("Progress at Request", `${progressPercent}% completed`, true) +
    infoRow("Reference ID", `<span style="font-family:monospace;font-size:12px;">${refundId}</span>`) +
    infoRow("Current Status", refundStatusLabel("pending"), true) +
    infoRow("Request Date", formatDate(new Date()))
  ) +
  noteBox("Your Stated Reason", reason) +
  callout(`If your request is approved, the refund will be credited to your original payment method. Please allow 5 to 10 business days for the amount to appear in your account after approval, depending on your bank or payment provider. UPI refunds are typically processed faster, within 3 to 5 business days.`, "warning") +
  body(`While your request is under review, you will continue to have access to the course. If your refund is approved, your access will be removed at that time.`) +
  btn("Check Refund Status", `${process.env.CLIENT_URL}/student/refunds`) +
  divider() +
  body(`Please keep your Reference ID for your records. You may need it if you follow up with our support team. If you did not submit this request, please contact us immediately.`) +
  small(`If you have questions about our refund policy or your request, reply to this email or contact us at <a href="mailto:${process.env.SMTP_USER}" style="color:#9ca3af;">${process.env.SMTP_USER}</a> with your Reference ID.`),
  `Your refund request for "${courseName}" has been received and is under review.`
);

// To admin — new refund request alert
export const refundAlertAdminTemplate = ({ studentName, studentEmail, courseName, amountPaid, progressPercent, reason, refundId }) => wrap(
  heading("A new refund request requires your attention") +
  body(`Hello,`) +
  body(`A student has submitted a refund request through the platform. Please review the details below and take appropriate action within the standard 2 business day response window.`) +
  infoTable(
    infoRow("Student", `${studentName} &mdash; <a href="mailto:${studentEmail}" style="color:#1A56DB;">${studentEmail}</a>`, true) +
    infoRow("Course", courseName) +
    infoRow("Amount Paid", formatINR(amountPaid), true) +
    infoRow("Progress at Request", `${progressPercent}% completed`) +
    infoRow("Reference ID", `<span style="font-family:monospace;font-size:12px;">${refundId}</span>`, true) +
    infoRow("Status", refundStatusLabel("pending")) +
    infoRow("Submitted On", formatDate(new Date()), true)
  ) +
  noteBox("Student's Stated Reason", reason) +
  callout(`Review the student's course progress and payment history before making a decision. Refunds are eligible only when the student has completed less than 20% of the course and the course was paid. The refund amount should not exceed the original payment.`, "warning") +
  body(`You can approve or reject this request directly from the admin panel. The student will automatically receive an email notification informing them of your decision.`) +
  btn("Review in Admin Panel", `${process.env.CLIENT_URL}/admin/refunds`) +
  divider() +
  small(`This alert was generated automatically by Tech Mind Academy. You are receiving this because you are an administrator on the platform.`),
  `Refund request from ${studentName} for "${courseName}" requires your review.`
);

// To student — refund approved
export const refundApprovedStudentTemplate = ({ studentName, courseName, refundAmount, paymentMethod, adminNote, refundId }) => wrap(
  heading("Your refund has been approved") +
  body(`Hello ${studentName},`) +
  body(`We have reviewed your refund request and are pleased to inform you that it has been approved. The refund details are listed below for your records.`) +
  infoTable(
    infoRow("Course", courseName, true) +
    infoRow("Refund Amount", `<strong style="color:#0D1B3E;font-size:15px;">${formatINR(refundAmount)}</strong>`) +
    infoRow("Payment Method", paymentMethod || "Original payment method", true) +
    infoRow("Reference ID", `<span style="font-family:monospace;font-size:12px;">${refundId}</span>`) +
    infoRow("Status", refundStatusLabel("approved"), true) +
    infoRow("Resolved On", formatDate(new Date()))
  ) +
  (adminNote ? noteBox("Note from Our Team", adminNote) : "") +
  callout(`Refunds are typically credited to your original payment method within 5 to 10 business days, depending on your bank. UPI refunds are usually faster and may appear within 3 to 5 business days. If you do not see the refund within this timeframe, please contact your bank before reaching out to us.`, "info") +
  body(`Please note that your access to <strong>${courseName}</strong> has been removed following this refund. If you wish to re-enroll in this course in the future, you are welcome to do so at any time.`) +
  body(`We hope your experience with Tech Mind Academy has been positive overall, and we would be glad to help you find a course that better suits your current learning goals.`) +
  btn("Explore Other Courses", `${process.env.CLIENT_URL}/courses`) +
  divider() +
  body(`If you have any questions about this refund or if you do not receive the credited amount within the expected timeframe, please reply to this email with your Reference ID and we will look into it promptly.`) +
  small(`Reference ID: ${refundId}. Keep this for your records in case you need to follow up with your payment provider.`),
  `Your refund of ${formatINR(refundAmount)} for "${courseName}" has been approved.`
);

// To student — refund rejected
export const refundRejectedStudentTemplate = ({ studentName, courseName, adminNote, progressPercent, refundId }) => wrap(
  heading("An update on your refund request") +
  body(`Hello ${studentName},`) +
  body(`Thank you for your patience while we reviewed your refund request. After careful consideration, we are unable to approve the refund for the course listed below at this time.`) +
  infoTable(
    infoRow("Course", courseName, true) +
    infoRow("Progress Completed", `${progressPercent}%`) +
    infoRow("Reference ID", `<span style="font-family:monospace;font-size:12px;">${refundId}</span>`, true) +
    infoRow("Status", refundStatusLabel("rejected")) +
    infoRow("Reviewed On", formatDate(new Date()), true)
  ) +
  (adminNote ? noteBox("Reason from Our Team", adminNote) : "") +
  callout(`Our refund policy allows refunds only for students who have completed less than 20% of a course and paid for the enrollment. If you believe this decision was made in error or if your situation is unique, please contact us with your Reference ID and we will review your case further.`, "warning") +
  body(`Your access to <strong>${courseName}</strong> remains fully active. You can continue learning at any time and work towards completing the course and earning your certificate.`) +
  body(`If the course is not meeting your expectations, we would genuinely like to hear why. Your feedback helps us improve the learning experience for all students.`) +
  btn("Continue Learning", `${process.env.CLIENT_URL}/student/learn`) +
  divider() +
  body(`If you would like to appeal this decision or have additional information to share, please reply to this email with your Reference ID and a brief explanation. We will take another look within 2 business days.`) +
  small(`Reference ID: ${refundId}. Please include this in any follow-up correspondence. You can also reach us at <a href="mailto:${process.env.SMTP_USER}" style="color:#9ca3af;">${process.env.SMTP_USER}</a>.`),
  `Update on your refund request for "${courseName}".`
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. CONTACT FORM TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// To admin — incoming contact form message
export const contactFormTemplate = (name, email, message) => wrap(
  heading("New message received via contact form") +
  body(`Hello,`) +
  body(`A visitor has submitted a message through the contact form on Tech Mind Academy. The details of their enquiry are included below. Please respond to them directly at the email address provided.`) +
  infoTable(
    infoRow("Sender Name", name, true) +
    infoRow("Email Address", `<a href="mailto:${email}" style="color:#1A56DB;">${email}</a>`) +
    infoRow("Received On", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), true)
  ) +
  noteBox("Message Content", message.replace(/\n/g, "<br/>")) +
  body(`To respond to this enquiry, reply directly to <a href="mailto:${email}" style="color:#1A56DB;">${email}</a>. Aim to respond within 24 hours to maintain a good experience for people reaching out to the platform.`) +
  divider() +
  small(`This message was submitted through the contact form at techmindacademy.in. You are receiving this because you are an administrator on Tech Mind Academy.`),
  `New contact message from ${name} via the website.`
);

// To user — confirmation that their message was received
export const contactConfirmationTemplate = (name, message) => wrap(
  heading("We have received your message") +
  body(`Hello ${name},`) +
  body(`Thank you for getting in touch with Tech Mind Academy. We want to confirm that your message has been received and a member of our team will get back to you as soon as possible. We typically respond to all enquiries within 24 hours on business days.`) +
  noteBox("Your Message", message.replace(/\n/g, "<br/>")) +
  body(`You do not need to take any further action. If your query is urgent or time-sensitive, you can contact us directly at <a href="mailto:${process.env.SMTP_USER}" style="color:#1A56DB;">${process.env.SMTP_USER}</a> and reference this message for faster handling.`) +
  callout(`If you have a question about a specific course, enrollment, payment, or certificate, including those details in any follow-up message will help us resolve your enquiry more quickly.`, "info") +
  divider() +
  body(`While you wait for our response, feel free to browse our course catalogue or check our frequently asked questions. Many common queries are answered there.`) +
  small(`If you did not submit a contact form message, please ignore this email. No action is required on your part.`),
  `We received your message and will respond within 24 hours.`
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. CERTIFICATE PURCHASE TEMPLATES (paid via Razorpay)
// ─────────────────────────────────────────────────────────────────────────────

// To student — payment confirmed, certificate processing or attached
export const certPaymentStudentTemplate = ({ name, courseName, certificateType, amount, certNumber, pdfReady }) => wrap(
  heading("Payment confirmed and certificate processing") +
  body(`Hello ${name},`) +
  body(`We have received your payment successfully. Your certificate order has been confirmed and ${pdfReady ? "your certificate is attached to this email" : "your certificate is now being processed and will be sent to you within 1 to 2 business days"}.`) +
  infoTable(
    infoRow("Course Name", courseName, true) +
    infoRow("Certificate Type", certificateType.charAt(0).toUpperCase() + certificateType.slice(1)) +
    infoRow("Amount Paid", formatINR(amount), true) +
    infoRow("Certificate Number", `<span style="font-family:monospace;font-size:12px;">${certNumber}</span>`) +
    infoRow("Payment Status", "Confirmed", true) +
    infoRow("Order Date", formatDate(new Date()))
  ) +
  (pdfReady
    ? callout(`Your certificate is attached to this email as a PDF file. Download it and save a copy for your records. You can use this certificate on your resume or LinkedIn profile to demonstrate your achievement.`, "success")
    : callout(`Your certificate will be sent to this email address within 1 to 2 business days. If you do not receive it within this timeframe, please contact us with your Certificate Number.`, "warning")
  ) +
  body(`Keep your Certificate Number safe. You may need it to verify your certificate or for any follow-up enquiries. This number is unique to your certificate and serves as its official identifier.`) +
  divider() +
  body(`Thank you for choosing Tech Mind Academy. If you have any questions about your certificate order, please reply to this email with your Certificate Number and we will assist you promptly.`) +
  small(`Certificate Number: ${certNumber}. Issued by Tech Mind Academy.`),
  `Your certificate payment has been confirmed. Certificate Number: ${certNumber}.`
);

// To admin — new certificate purchase alert
export const certPaymentAdminTemplate = ({ name, email, phone, courseName, courseType, certificateType, amount, certNumber, completionDate, razorpayOrderId, razorpayPaymentId }) => wrap(
  heading("New certificate purchase received") +
  body(`Hello,`) +
  body(`A student has completed a certificate purchase on Tech Mind Academy. Please review the order details below and ensure the certificate has been generated and delivered to the student.`) +
  infoTable(
    infoRow("Student Name", name, true) +
    infoRow("Email Address", `<a href="mailto:${email}" style="color:#1A56DB;">${email}</a>`) +
    infoRow("Phone Number", phone, true) +
    infoRow("Course Name", courseName) +
    infoRow("Course Type", courseType, true) +
    infoRow("Certificate Type", certificateType.charAt(0).toUpperCase() + certificateType.slice(1)) +
    infoRow("Amount Received", `<strong style="color:#0D1B3E;">${formatINR(amount)}</strong>`, true) +
    infoRow("Certificate Number", `<span style="font-family:monospace;font-size:12px;">${certNumber}</span>`) +
    infoRow("Completion Date", completionDate, true) +
    infoRow("Razorpay Order ID", `<span style="font-family:monospace;font-size:12px;">${razorpayOrderId}</span>`) +
    infoRow("Razorpay Payment ID", `<span style="font-family:monospace;font-size:12px;">${razorpayPaymentId}</span>`, true) +
    infoRow("Received On", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))
  ) +
  callout(`Action required: If the certificate PDF was not automatically generated and attached to the student's confirmation email, please generate it manually and send it to ${email} as soon as possible.`, "danger") +
  btn("View Certificate Orders", `${process.env.CLIENT_URL}/admin/certificates`) +
  divider() +
  small(`This alert was generated automatically following a successful Razorpay payment. You are receiving this because you are an administrator on Tech Mind Academy.`),
  `New certificate purchase from ${name} for "${courseName}" &mdash; ${formatINR(amount)}.`
);

// ─────────────────────────────────────────────────────────────────────────────
// 9. ADMIN-ISSUED CERTIFICATE TEMPLATES (free / manual)
// ─────────────────────────────────────────────────────────────────────────────

// To student — admin-issued certificate delivery
export const certAdminIssuedStudentTemplate = ({ name, courseName, certificateType, certNumber }) => {
  const certLabel = {
    completion:    "Certificate of Completion",
    excellence:    "Certificate of Excellence",
    participation: "Certificate of Participation",
  }[certificateType] || "Certificate";

  return wrap(
    heading(`Your ${certLabel} is ready`) +
    body(`Hello ${name},`) +
    body(`We are pleased to inform you that your certificate for the course below has been officially issued by Tech Mind Academy. Your certificate is attached to this email as a PDF file.`) +
    infoTable(
      infoRow("Course Name", courseName, true) +
      infoRow("Certificate Type", certLabel) +
      infoRow("Certificate Number", `<span style="font-family:monospace;font-size:12px;">${certNumber}</span>`, true) +
      infoRow("Issued On", formatDate(new Date()))
    ) +
    callout(`Download the attached PDF and save it to a safe location. This certificate is a permanent record of your achievement and can be shared with employers, added to your LinkedIn profile, or included in your professional portfolio.`, "success") +
    body(`Your Certificate Number is <strong>${certNumber}</strong>. This unique identifier can be used to verify the authenticity of your certificate. Employers or institutions can contact Tech Mind Academy at <a href="mailto:${process.env.SMTP_USER}" style="color:#1A56DB;">${process.env.SMTP_USER}</a> to verify your certificate using this number.`) +
    body(`We hope this certificate reflects the effort and dedication you have put into your learning journey with us. We wish you every success in applying your new skills.`) +
    divider() +
    body(`If you experience any issues with the attached PDF or if the file is missing, please reply to this email with your Certificate Number and we will resend it promptly.`) +
    small(`This certificate was issued by Tech Mind Academy. Certificate Number: ${certNumber}.`),
    `Your ${certLabel} for "${courseName}" has been issued and is attached to this email.`
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE SENDERS
// All wrappers below are fire-and-forget safe (call .catch where needed)
// ─────────────────────────────────────────────────────────────────────────────

// Auth
export const sendVerifyEmail = (to, name, verifyUrl) =>
  sendEmail({ to, subject: "Verify your Tech Mind Academy account", html: verifyEmailTemplate(name, verifyUrl) });

export const sendResetPasswordEmail = (to, name, resetUrl) =>
  sendEmail({ to, subject: "Reset your Tech Mind Academy password", html: resetPasswordTemplate(name, resetUrl) });

// Enrollment
export const sendEnrollmentConfirmation = (to, studentName, courseTitle, courseUrl) =>
  sendEmail({ to, subject: `Enrollment confirmed: ${courseTitle}`, html: enrollmentConfirmationTemplate(studentName, courseTitle, courseUrl) });

export const sendCreatorEnrollmentAlert = (to, creatorName, studentName, courseTitle, dashboardUrl) =>
  sendEmail({ to, subject: `New enrollment in "${courseTitle}"`, html: creatorNewEnrollmentTemplate(creatorName, studentName, courseTitle, dashboardUrl) });

// Assignment
export const sendAssignmentGradedEmail = (to, studentName, courseTitle, lessonTitle, grade, maxMarks, feedback, courseUrl) =>
  sendEmail({ to, subject: `Assignment graded: ${grade}/${maxMarks} &mdash; ${lessonTitle}`, html: assignmentGradedTemplate(studentName, courseTitle, lessonTitle, grade, maxMarks, feedback, courseUrl) });

export const sendSubmissionAlertToCreator = (to, creatorName, studentName, assignmentTitle, courseTitle, submissionsUrl) =>
  sendEmail({ to, subject: `New submission: "${assignmentTitle}" from ${studentName}`, html: creatorSubmissionTemplate(creatorName, studentName, assignmentTitle, courseTitle, submissionsUrl) });

// Quiz
export const sendQuizPassedEmail = (to, studentName, quizTitle, courseTitle, scorePercent, passMark, courseUrl) =>
  sendEmail({ to, subject: `Quiz passed: ${quizTitle} (${scorePercent}%)`, html: quizPassedTemplate(studentName, quizTitle, courseTitle, scorePercent, passMark, courseUrl) });

// Course completion
export const sendCourseCompletedEmail = (to, studentName, courseTitle, certUrl) =>
  sendEmail({ to, subject: `Course completed: ${courseTitle} &mdash; your certificate is ready`, html: courseCompletedTemplate(studentName, courseTitle, certUrl) });

// Refund
export const sendRefundRequestedEmailToStudent = ({ studentEmail, ...rest }) =>
  sendEmail({ to: studentEmail, subject: `Refund request received: ${rest.courseName} (Ref: ${rest.refundId})`, html: refundRequestedStudentTemplate(rest) });

export const sendRefundAlertEmailToAdmin = ({ adminEmail, ...rest }) =>
  sendEmail({ to: adminEmail, subject: `Refund request from ${rest.studentName}: ${rest.courseName}`, html: refundAlertAdminTemplate(rest) });

export const sendRefundApprovedEmailToStudent = ({ studentEmail, ...rest }) =>
  sendEmail({ to: studentEmail, subject: `Refund approved: ${formatINR(rest.refundAmount)} for ${rest.courseName}`, html: refundApprovedStudentTemplate(rest) });

export const sendRefundRejectedEmailToStudent = ({ studentEmail, ...rest }) =>
  sendEmail({ to: studentEmail, subject: `Update on your refund request: ${rest.courseName}`, html: refundRejectedStudentTemplate(rest) });

// Contact form
export const sendContactFormToAdmin = (to, name, email, message) =>
  sendEmail({ to, subject: `Contact form message from ${name}`, html: contactFormTemplate(name, email, message) });

export const sendContactConfirmationToUser = (to, name, message) =>
  sendEmail({ to, subject: `We received your message, ${name}`, html: contactConfirmationTemplate(name, message) });

// Paid certificate
export const sendCertPaymentConfirmationToStudent = (to, data, attachments = []) =>
  sendEmail({ to, subject: data.pdfReady ? `Your certificate is ready: ${data.courseName}` : `Payment confirmed: certificate being processed`, html: certPaymentStudentTemplate(data), attachments });

export const sendCertPaymentAlertToAdmin = (to, data) =>
  sendEmail({ to, subject: `Certificate purchase: ${data.name} | ${formatINR(data.amount)}`, html: certPaymentAdminTemplate(data) });

// Admin-issued certificate
export const sendAdminIssuedCertToStudent = (to, data, attachments = []) => {
  const certLabel = { completion: "Certificate of Completion", excellence: "Certificate of Excellence", participation: "Certificate of Participation" }[data.certificateType] || "Certificate";
  return sendEmail({ to, subject: `Your ${certLabel}: ${data.courseName}`, html: certAdminIssuedStudentTemplate(data), attachments });
};