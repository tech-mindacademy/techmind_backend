import TrainingApplication from "../models/IndustrialTrainingApplication.model.js";

// Gates the training portal. Must run after `protect`.
// Access requires a verified payment and a credentials email sent by an admin.
export const requireTrainingAccess = async (req, res, next) => {
  try {
    const apps = await TrainingApplication.find({
      user: req.user._id,
      status: { $in: ["CREDENTIALS_SENT", "ACTIVE"] },
      "payment.status": "paid",
    });

    if (!apps.length) {
      return res.status(403).json({
        success: false,
        message: "You don't have an active Industrial Training enrollment.",
        code: "TRAINING_ACCESS_DENIED",
      });
    }

    req.trainingApplications = apps;
    next();
  } catch (error) {
    console.error("requireTrainingAccess error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};
