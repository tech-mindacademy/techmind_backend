// New templates for the Live Internship Classroom feature. These are
// intentionally kept in their own file rather than merged into the existing
// email.utils.js (whose current contents weren't part of the uploaded set),
// so nothing there risks being overwritten. Import `sendEmail` and `FROM`
// from the existing ../utils/email.utils.js as usual — only the HTML
// builders live here.

const CLIENT_URL = process.env.CLIENT_URL || "";

export function internshipPaymentConfirmedTemplate({ application, internship }) {
  const portalUrl = `${CLIENT_URL}/intern/dashboard`;
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
      <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 32px">
        <p style="margin:0;font-size:20px;font-weight:700;color:#fff">Tech Vidya — Internship Portal</p>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1e293b">Payment Confirmed ✅</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">
          Hi ${application.name}, your payment for the <strong>${internship.title}</strong> internship at
          <strong>${internship.company}</strong> has been verified. Your Internship Portal access is now unlocked.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:20px">
          <p style="margin:0;font-size:14px;color:#166534;line-height:1.6">
            Amount paid: <strong>₹${application.amountPaid}</strong><br/>
            Reference: ${application.razorpayPaymentId}
          </p>
        </div>
        <a href="${portalUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;font-size:14px">
          Go to Internship Portal
        </a>
      </td></tr>
      <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
        <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">© ${new Date().getFullYear()} Tech Vidya. All rights reserved.</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

export function liveClassScheduledTemplate({ application, internship, liveClass }) {
  const joinUrl = `${CLIENT_URL}/intern/live-classes/${liveClass._id}`;
  const dateStr = new Date(liveClass.scheduledDate).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
      <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 32px">
        <p style="margin:0;font-size:20px;font-weight:700;color:#fff">📅 New Live Class Scheduled</p>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1e293b">${liveClass.title}</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">
          Hi ${application.name}, a live class has been scheduled for your <strong>${internship.title}</strong> internship.
        </p>
        <table width="100%" style="border-collapse:collapse;font-size:14px;margin-bottom:20px">
          <tr style="background:#f8fafc"><td style="padding:9px 14px;font-weight:600;color:#1e293b;width:38%;border-bottom:1px solid #e2e8f0">Date</td><td style="padding:9px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${dateStr}</td></tr>
          <tr><td style="padding:9px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Time</td><td style="padding:9px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${liveClass.scheduledStartTime} — ${liveClass.scheduledEndTime}</td></tr>
        </table>
        <a href="${joinUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;font-size:14px">
          View in Internship Portal
        </a>
        <p style="margin-top:16px;font-size:12px;color:#94a3b8">The Join button will activate once the class goes live and you're logged in to your account.</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

export function liveClassLiveTemplate({ application, internship, liveClass }) {
  const joinUrl = `${CLIENT_URL}/intern/live-classes/${liveClass._id}`;
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
      <tr><td style="background:linear-gradient(135deg,#dc2626,#ea580c);padding:24px 32px">
        <p style="margin:0;font-size:20px;font-weight:700;color:#fff">🔴 Your Live Class Has Started</p>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1e293b">${liveClass.title}</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6">
          Hi ${application.name}, <strong>${internship.title}</strong> is live right now. Join from your Internship Portal.
        </p>
        <a href="${joinUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;font-size:14px">
          Join Live Class Now
        </a>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}