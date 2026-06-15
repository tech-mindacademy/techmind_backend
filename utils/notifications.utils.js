// notifications.utils.js
// Fire-and-forget email wrappers — drop-in replacement.
// Import and call these from your controllers; they never throw.

import {
  sendEmail,
  enrollmentConfirmationTemplate,
  creatorNewEnrollmentTemplate,
  assignmentGradedTemplate,
  creatorSubmissionTemplate,
  quizPassedTemplate,
  courseCompletedTemplate,
  internshipStatusShortlistedTemplate,
} from "./email.utils.js";

// ─── Enrollment ───────────────────────────────────────────────────────────────
// Called from: enrollment.controller.js (enrollFree) and payment.controller.js (verifyPayment)

export const notifyEnrollment = (student, course) => {
  const courseUrl = `${process.env.CLIENT_URL}/student/learn/${course._id}`;

  sendEmail({
    to: student.email,
    subject: `Enrollment confirmed: ${course.title}`,
    html: enrollmentConfirmationTemplate(student.name, course.title, courseUrl),
  }).catch((e) => console.error("[email] enrollment student:", e.message));

  if (course.creatorEmail && course.creatorName) {
    const dashUrl = `${process.env.CLIENT_URL}/creator/dashboard`;
    sendEmail({
      to: course.creatorEmail,
      subject: `New enrollment in: ${course.title}`,
      html: creatorNewEnrollmentTemplate(course.creatorName, student.name, course.title, dashUrl),
    }).catch((e) => console.error("[email] enrollment creator:", e.message));
  }
};

// ─── Assignment graded ────────────────────────────────────────────────────────
// Called from: assignment.controller.js (gradeSubmission)

export const notifyAssignmentGraded = (student, course, assignmentTitle, grade, maxMarks, feedback) => {
  const courseUrl = `${process.env.CLIENT_URL}/student/learn/${course._id}`;
  sendEmail({
    to: student.email,
    subject: `Assignment graded: ${grade}/${maxMarks} — ${assignmentTitle}`,
    html: assignmentGradedTemplate(student.name, course.title, assignmentTitle, grade, maxMarks, feedback, courseUrl),
  }).catch((e) => console.error("[email] assignment graded:", e.message));
};

// ─── Assignment submitted ─────────────────────────────────────────────────────
// Called from: assignment.controller.js (submitAssignment)

export const notifyAssignmentSubmitted = (creator, student, assignmentTitle, courseTitle) => {
  const submissionsUrl = `${process.env.CLIENT_URL}/creator/submissions`;
  sendEmail({
    to: creator.email,
    subject: `New submission: ${assignmentTitle} — ${student.name}`,
    html: creatorSubmissionTemplate(creator.name, student.name, assignmentTitle, courseTitle, submissionsUrl),
  }).catch((e) => console.error("[email] assignment submitted:", e.message));
};

// ─── Quiz passed ──────────────────────────────────────────────────────────────
// Called from: quiz.controller.js (submitQuizAttempt)

export const notifyQuizPassed = (student, quizTitle, course, scorePercent, passMark) => {
  const courseUrl = `${process.env.CLIENT_URL}/student/learn/${course._id}`;
  sendEmail({
    to: student.email,
    subject: `Quiz passed: ${quizTitle} — ${scorePercent}%`,
    html: quizPassedTemplate(student.name, quizTitle, course.title, scorePercent, passMark, courseUrl),
  }).catch((e) => console.error("[email] quiz passed:", e.message));
};

// ─── Course completed ─────────────────────────────────────────────────────────
// Called from: quiz.controller.js (submitQuizAttempt — final quiz pass)

export const notifyCourseCompleted = (student, course) => {
  const certUrl = `${process.env.CLIENT_URL}/student/certificate/${course._id}`;
  sendEmail({
    to: student.email,
    subject: `Course completed: ${course.title} — Certificate ready`,
    html: courseCompletedTemplate(student.name, course.title, certUrl),
  }).catch((e) => console.error("[email] course completed:", e.message));
};

// ─── Internship status updates ────────────────────────────────────────────────
// Called from: internship.controller.js (updateApplicationStatus)