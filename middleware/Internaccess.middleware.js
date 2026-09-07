import InternshipApplication from "../models/InternshipApplication.model.js";

/**
 * Gates the Intern Portal. Must run AFTER `protect`.
 * Attaches req.internApplications = the caller's eligible applications
 * (populated with internship) so downstream handlers don't re-query.
 *
 * Eligible = status "shortlisted" AND internship still active AND
 * (internship.applicationFee === 0 OR application.paymentStatus === "paid").
 * Payment status is only ever set server-side after a verified Razorpay
 * signature (see internshipPayment.controller.js) — never trust a client flag.
 */
export const requireInternAccess = async (req, res, next) => {
  try {
    const apps = await InternshipApplication.find({
      user: req.user._id,
      status: "shortlisted",
    }).populate("internship");

    const eligible = apps.filter((a) => {
      if (!a.internship || !a.internship.isActive) return false;
      const feeRequired = a.internship.applicationFee > 0;
      return !feeRequired || a.paymentStatus === "paid";
    });

    if (eligible.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have an active internship enrollment yet.",
        code: "INTERN_ACCESS_DENIED",
      });
    }

    req.internApplications = eligible;
    next();
  } catch (error) {
    console.error("requireInternAccess error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};