export async function appendApplicationToSheet(application, internship) {
  try {
    await fetch(process.env.GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "Submitted At": new Date().toLocaleString("en-IN"),
        "Application ID": application._id.toString(),
        "Internship Title": internship.title,
        "Company": internship.company,
        "Name": application.name,
        "Email": application.email,
        "Phone": application.phone,
        "College": application.college,
        "Degree": application.degree,
        "Year": application.year,
        "Skills": application.skills || "",
        "Why Apply": application.whyApply,
        "LinkedIn": application.linkedIn || "",
        "GitHub": application.github || "",
        "Status": "pending",
      }),
    });
  } catch (err) {
    console.error("❌ Sheet append failed:", err.message);
  }
}

export async function updateApplicationStatusInSheet(applicationId, newStatus) {
  try {
    await fetch(
      `${process.env.GOOGLE_SCRIPT_URL}?appId=${applicationId}&status=${newStatus}`
    );
  } catch (err) {
    console.error("❌ Sheet status update failed:", err.message);
  }
}