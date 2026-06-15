

import { google } from "googleapis";

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

  // Always send multipart/alternative (HTML + plain text fallback)
  // This is one of the most important deliverability signals
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

// Strip HTML tags to generate plain text fallback automatically
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



const wrap = (content, preheader = "") => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Tech Mind Academy</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; }
    body { margin: 0 !important; padding: 0 !important; background-color: #f4f6f9; }
    a { color: #2563eb; }
    @media only screen and (max-width: 620px) {
      .email-wrapper { width: 100% !important; }
      .email-body { padding: 24px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f4f6f9;">${preheader}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f9;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" class="email-wrapper" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Logo / Brand header -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-size:18px;font-weight:700;color:#111827;letter-spacing:-0.3px;">Tech Mind Academy</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="email-body" style="padding:40px 40px 32px;">
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
                  <td style="text-align:center;font-size:12px;color:#9ca3af;line-height:1.6;">
                    <p style="margin:0 0 4px;">Tech Mind Academy &bull; <a href="${process.env.CLIENT_URL}" style="color:#9ca3af;text-decoration:underline;">techmindacademy.in</a></p>
                    <p style="margin:0;">You received this because you have an account with us. &copy; ${new Date().getFullYear()} Tech Mind Academy.</p>
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
  `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">${text}</h1>`;

const subheading = (text) =>
  `<h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#374151;">${text}</h2>`;

const body = (text) =>
  `<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.65;">${text}</p>`;

const small = (text) =>
  `<p style="margin:20px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">${text}</p>`;

const divider = () =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
    <tr><td style="border-top:1px solid #e5e7eb;"></td></tr>
  </table>`;

// Primary button — solid, no gradient
const btnPrimary = (text, url) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
    <tr>
      <td style="background-color:#2563eb;border-radius:6px;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.1px;">${text}</a>
      </td>
    </tr>
  </table>`;

// Info block — light gray, left-border accent
const infoBlock = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
    ${rows}
  </table>`;

const infoRow = (label, value, shade = false) =>
  `<tr style="${shade ? "background-color:#f9fafb;" : "background-color:#ffffff;"}">
    <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;width:40%;border-bottom:1px solid #f3f4f6;">${label}</td>
    <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${value}</td>
  </tr>`;

// Highlight callout (replaces colorful boxes)
const callout = (text) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:0 6px 6px 0;padding:16px 20px;">
        <p style="margin:0;font-size:14px;color:#1e40af;line-height:1.65;">${text}</p>
      </td>
    </tr>
  </table>`;

// Score / metric display
const metric = (label, value, sub = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:20px 24px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">${label}</p>
        <p style="margin:0;font-size:30px;font-weight:700;color:#111827;">${value}</p>
        ${sub ? `<p style="margin:6px 0 0;font-size:13px;color:#6b7280;">${sub}</p>` : ""}
      </td>
    </tr>
  </table>`;

// ─── Auth templates ───────────────────────────────────────────────────────────

export const verifyEmailTemplate = (name, verifyUrl) => wrap(
  heading("Verify your email address") +
  body(`Hi ${name}, welcome to Tech Mind Academy. Before you get started, we need to verify your email address.`) +
  btnPrimary("Verify Email Address", verifyUrl) +
  divider() +
  small(`This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.`),
  `Verify your email to activate your Tech Mind Academy account.`
);

export const resetPasswordTemplate = (name, resetUrl) => wrap(
  heading("Reset your password") +
  body(`Hi ${name}, we received a request to reset the password for your Tech Mind Academy account.`) +
  body(`If you made this request, click the button below. If you did not request a password reset, please ignore this email — your password will remain unchanged.`) +
  btnPrimary("Reset Password", resetUrl) +
  divider() +
  small(`This link expires in 30 minutes. For security, this link can only be used once.`),
  `Password reset requested for your Tech Mind Academy account.`
);

// ─── Enrollment ───────────────────────────────────────────────────────────────

export const enrollmentConfirmationTemplate = (studentName, courseTitle, courseUrl) => wrap(
  heading("You are now enrolled") +
  body(`Hi ${studentName}, your enrollment in the following course has been confirmed.`) +
  infoBlock(
    infoRow("Course", courseTitle, true) +
    infoRow("Status", "Active &mdash; ready to start") +
    infoRow("Access", "Lifetime access included", true)
  ) +
  body(`You can start learning right away. Your progress is saved automatically as you move through lessons.`) +
  btnPrimary("Go to Course", courseUrl) +
  divider() +
  small(`If you have any questions about your enrollment, reply to this email.`),
  `Your enrollment in "${courseTitle}" is confirmed.`
);

// ─── Assignment graded ────────────────────────────────────────────────────────

export const assignmentGradedTemplate = (studentName, courseTitle, lessonTitle, grade, maxMarks, feedback, courseUrl) => wrap(
  heading("Your assignment has been graded") +
  body(`Hi ${studentName}, your instructor has reviewed and graded your assignment.`) +
  infoBlock(
    infoRow("Course", courseTitle, true) +
    infoRow("Assignment", lessonTitle) +
    infoRow("Grade", `${grade} / ${maxMarks}`, true)
  ) +
  (feedback
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
        <tr>
          <td style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Instructor Feedback</p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.65;">${feedback}</p>
          </td>
        </tr>
      </table>`
    : "") +
  btnPrimary("View Submission", courseUrl) +
  divider() +
  small(`Keep up the good work. Continue learning at your own pace.`),
  `Your assignment in "${lessonTitle}" has been graded.`
);

// ─── Quiz passed ──────────────────────────────────────────────────────────────

export const quizPassedTemplate = (studentName, quizTitle, courseTitle, scorePercent, passMark, courseUrl) => wrap(
  heading("Quiz passed") +
  body(`Hi ${studentName}, congratulations on passing the quiz. Here is a summary of your result.`) +
  metric("Your Score", `${scorePercent}%`, `Pass mark was ${passMark}%`) +
  infoBlock(
    infoRow("Quiz", quizTitle, true) +
    infoRow("Course", courseTitle) +
    infoRow("Result", "Passed", true)
  ) +
  btnPrimary("Continue Learning", courseUrl) +
  divider() +
  small(`Well done. Keep going to complete the course and earn your certificate.`),
  `You passed the quiz: ${quizTitle}.`
);

// ─── Course completed ─────────────────────────────────────────────────────────

export const courseCompletedTemplate = (studentName, courseTitle, certUrl) => wrap(
  heading("Course completed") +
  body(`Hi ${studentName}, you have successfully completed the following course. This is a significant achievement and we hope you found the content valuable.`) +
  infoBlock(
    infoRow("Course", courseTitle, true) +
    infoRow("Status", "Completed") +
    infoRow("Certificate", "Issued and ready to download", true)
  ) +
  callout(`Your certificate of completion has been issued. Download it and share your achievement on LinkedIn or include it in your resume.`) +
  btnPrimary("Download Certificate", certUrl) +
  divider() +
  small(`Thank you for learning with Tech Mind Academy. We hope to see you in another course soon.`),
  `You have completed "${courseTitle}" — your certificate is ready.`
);

// ─── Creator: new enrollment ──────────────────────────────────────────────────

export const creatorNewEnrollmentTemplate = (creatorName, studentName, courseTitle, dashboardUrl) => wrap(
  heading("New student enrolled") +
  body(`Hi ${creatorName}, you have a new student enrolled in one of your courses.`) +
  infoBlock(
    infoRow("Student", studentName, true) +
    infoRow("Course", courseTitle) +
    infoRow("Enrolled On", new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), true)
  ) +
  btnPrimary("View Dashboard", dashboardUrl) +
  divider() +
  small(`You can view all enrollments and student progress from your creator dashboard.`),
  `${studentName} just enrolled in "${courseTitle}".`
);

// ─── Creator: assignment submitted ───────────────────────────────────────────

export const creatorSubmissionTemplate = (creatorName, studentName, assignmentTitle, courseTitle, submissionsUrl) => wrap(
  heading("New assignment submission") +
  body(`Hi ${creatorName}, a student has submitted an assignment that is waiting for your review.`) +
  infoBlock(
    infoRow("Student", studentName, true) +
    infoRow("Assignment", assignmentTitle) +
    infoRow("Course", courseTitle, true) +
    infoRow("Submitted On", new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }))
  ) +
  btnPrimary("Review Submission", submissionsUrl) +
  divider() +
  small(`Please review and grade this submission from your creator dashboard.`),
  `${studentName} submitted "${assignmentTitle}" — review required.`
);

// ─── Contact form (to admin) ──────────────────────────────────────────────────

export const contactFormTemplate = (name, email, message) => wrap(
  heading("New contact form message") +
  body(`Someone has submitted the contact form on Tech Mind Academy.`) +
  infoBlock(
    infoRow("Name", name, true) +
    infoRow("Email", `<a href="mailto:${email}" style="color:#2563eb;">${email}</a>`) +
    infoRow("Received On", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), true)
  ) +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Message</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.65;">${message.replace(/\n/g, "<br/>")}</p>
      </td>
    </tr>
  </table>` +
  small(`Reply directly to <a href="mailto:${email}" style="color:#9ca3af;">${email}</a> to respond to this enquiry.`),
  `New message from ${name} via the contact form.`
);

// ─── Contact form (confirmation to user) ─────────────────────────────────────

export const contactConfirmationTemplate = (name, message) => wrap(
  heading("We received your message") +
  body(`Hi ${name}, thank you for reaching out. We have received your message and will get back to you within 24 hours.`) +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="background-color:#f9fafb;border-left:4px solid #e5e7eb;border-radius:0 6px 6px 0;padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Your Message</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.65;">${message.replace(/\n/g, "<br/>")}</p>
      </td>
    </tr>
  </table>` +
  divider() +
  small(`If your query is urgent, you can also reach us at <a href="mailto:${process.env.SMTP_USER}" style="color:#9ca3af;">${process.env.SMTP_USER}</a>.`),
  `We received your message and will respond within 24 hours.`
);