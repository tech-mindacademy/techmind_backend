// email.notifications.js — fire-and-forget wrappers
// No change in API — drop-in replacement

import {
  sendEmail,
  enrollmentConfirmationTemplate,
  assignmentGradedTemplate,
  quizPassedTemplate,
  courseCompletedTemplate,
  creatorNewEnrollmentTemplate,
  creatorSubmissionTemplate,
} from "./email.utils.js";

export const notifyEnrollment = (student, course) => {
  const courseUrl = `${process.env.CLIENT_URL}/student/learn/${course._id}`;

  sendEmail({
    to: student.email,
    subject: `Enrollment confirmed: ${course.title}`,
    html: enrollmentConfirmationTemplate(student.name, course.title, courseUrl),
  }).catch((e) => console.error("[email] enrollment:", e.message));

  if (course.creatorEmail && course.creatorName) {
    const dashUrl = `${process.env.CLIENT_URL}/creator/dashboard`;
    sendEmail({
      to: course.creatorEmail,
      subject: `New enrollment in "${course.title}"`,
      html: creatorNewEnrollmentTemplate(course.creatorName, student.name, course.title, dashUrl),
    }).catch((e) => console.error("[email] creator enrollment:", e.message));
  }
};

export const notifyAssignmentGraded = (student, course, lessonTitle, grade, maxMarks, feedback) => {
  const courseUrl = `${process.env.CLIENT_URL}/student/learn/${course._id}`;
  sendEmail({
    to: student.email,
    subject: `Assignment graded: ${grade}/${maxMarks} — ${lessonTitle}`,
    html: assignmentGradedTemplate(student.name, course.title, lessonTitle, grade, maxMarks, feedback, courseUrl),
  }).catch((e) => console.error("[email] assignment graded:", e.message));
};

export const notifyAssignmentSubmitted = (creator, student, assignmentTitle, courseTitle) => {
  const submissionsUrl = `${process.env.CLIENT_URL}/creator/submissions`;
  sendEmail({
    to: creator.email,
    subject: `Assignment submitted: "${assignmentTitle}" by ${student.name}`,
    html: creatorSubmissionTemplate(creator.name, student.name, assignmentTitle, courseTitle, submissionsUrl),
  }).catch((e) => console.error("[email] submission notify:", e.message));
};

export const notifyQuizPassed = (student, quizTitle, course, scorePercent, passMark) => {
  const courseUrl = `${process.env.CLIENT_URL}/student/learn/${course._id}`;
  sendEmail({
    to: student.email,
    subject: `Quiz passed: ${quizTitle} (${scorePercent}%)`,
    html: quizPassedTemplate(student.name, quizTitle, course.title, scorePercent, passMark, courseUrl),
  }).catch((e) => console.error("[email] quiz passed:", e.message));
};

export const notifyCourseCompleted = (student, course) => {
  const certUrl = `${process.env.CLIENT_URL}/student/certificate/${course._id}`;
  sendEmail({
    to: student.email,
    subject: `Course completed: ${course.title} — Certificate ready`,
    html: courseCompletedTemplate(student.name, course.title, certUrl),
  }).catch((e) => console.error("[email] course completed:", e.message));
};