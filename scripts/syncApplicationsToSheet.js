import mongoose from "mongoose";
import dotenv from "dotenv";
import "../models/Internship.model.js"; // 👈 Add this — registers the model
import InternshipApplication from "../models/InternshipApplication.model.js";
import { appendApplicationToSheet } from "../utils/sheets.utils.js";

dotenv.config();

const syncAll = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const applications = await InternshipApplication.find()
      .populate("internship", "title company");

    // console.log(`📦 Found ${applications.length} applications to sync...`);

    let success = 0;
    let failed = 0;

    for (const app of applications) {
      if (!app.internship) {
        console.warn(`⚠️  Skipping ${app._id} — internship deleted`);
        failed++;
        continue;
      }

      await appendApplicationToSheet(app, app.internship);
      await new Promise((r) => setTimeout(r, 500));

      success++;
      console.log(`✅ Synced [${success}/${applications.length}] — ${app.name}`);
    }

    console.log(`\n🎉 Done! ${success} synced, ${failed} skipped.`);
    process.exit(0);

  } catch (err) {
    console.error("❌ Sync failed:", err.message);
    process.exit(1);
  }
};

syncAll();