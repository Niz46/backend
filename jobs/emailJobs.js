// backend/jobs/emailJobs.js
require("dotenv").config();
const agenda = require("../config/agenda");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const LOGO_URL = "https://uaacaiinternational.org/logo.ico";
const BRAND_COLOR = "#007bff";
const REPLY_EMAIL = "support@uaacaiinternational.org"; // no more no-reply!

async function safeSend({ jobName, params }) {
  const { to } = params;
  const recipients = Array.isArray(to)
    ? to.filter(Boolean)
    : [to].filter(Boolean);
  if (!recipients.length) {
    console.warn(`⚠️ [${jobName}] no valid recipients—skipping.`);
    return;
  }
  try {
    console.log(`➡️ [${jobName}] sending to:`, recipients);
    const res = await resend.emails.send({ ...params, to: recipients });
    console.log(`✅ [${jobName}] sent (id=${res.id})`);
  } catch (err) {
    console.error(`❌ [${jobName}] failed:`, err);
  }
}

// 1) Welcome email
agenda.define("send-welcome-email", async (job) => {
  const { to, name } = job.attrs.data;
  await safeSend({
    jobName: "send-welcome-email",
    params: {
      from: `UAACAI <${REPLY_EMAIL}>`,
      to,
      subject: `Welcome aboard, ${name}!`,
      text: `Hey ${name}, welcome aboard!

We're delighted you've joined UAACAI International. Together, we'll work toward a transparent, just world.

• Set up your profile: add a photo + bio so fellow members can connect.
• Explore our latest blog posts on journals and events strategies.
• Engage in discussions on our community forum.

Log in now: https://uaacaiinternational.org/login

If you have any questions, just reply to this email!`,
      html: `
        <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
        <title>Welcome to UAACAI</title><style>
          body{margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;}
          .container{max-width:600px;margin:0 auto;background:#fff;padding:20px;}
          h1{color:${BRAND_COLOR};font-size:24px;margin-bottom:10px;}
          p{color:#333;line-height:1.5;margin-bottom:15px;}
          ul{padding-left:20px;margin-bottom:20px;}
          li{margin-bottom:8px;}
          .btn{display:inline-block;padding:10px 20px;background:${BRAND_COLOR};color:#fff;text-decoration:none;border-radius:4px;}
        </style></head><body>
        <div class="container">
          <h1>Hey ${name}, welcome aboard!</h1>
          <p>We're delighted you've joined UAACAI International. Together, we'll work toward a transparent, just world.</p>
          <ul>
            <li><strong>Set up your profile:</strong> Add a photo and bio so fellow members can connect.</li>
            <li><strong>Explore:</strong> Read our latest blog posts on journals and events strategies.</li>
            <li><strong>Engage:</strong> Jump into discussions in our community forum.</li>
          </ul>
          <a href="https://uaacaiinternational.org/login" class="btn">Get Started</a>
        </div>
        </body></html>
      `,
    },
  });
});

// 2) “We miss you” nudge
agenda.define("send-nudge-email", async (job) => {
  const { to, name } = job.attrs.data;
  await safeSend({
    jobName: "send-nudge-email",
    params: {
      from: `UAACAI <${REPLY_EMAIL}>`,
      to,
      subject: `👋 Hey ${name}, we’ve missed you!`,
      text: `Hi ${name},

It's been a few days since you last visited UAACAI. We've added new resources, blog posts, and community discussions we think you'll love.

Come back and pick up where you left off:
https://uaacaiinternational.org/dashboard

If you need anything, just reply—happy to help!`,
      html: `
        <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
        <title>We Miss You</title><style>
          body{margin:0;padding:0;font-family:Arial,sans-serif;background:#fafafa;}
          .container{max-width:600px;margin:0 auto;background:#fff;padding:20px;}
          h2{color:#28a745;font-size:22px;margin-bottom:10px;}
          p{color:#333;line-height:1.5;margin-bottom:15px;}
          .btn{display:inline-block;padding:10px 20px;background:#28a745;color:#fff;text-decoration:none;border-radius:4px;}
        </style></head><body>
        <div class="container">
          <h2>Hello ${name},</h2>
          <p>It's been a few days since you last visited UAACAI. We've added new resources, blog posts, and community discussions we think you'll love.</p>
          <p>Come back and pick up where you left off!</p>
          <a href="https://uaacaiinternational.org/dashboard" class="btn">Return Now</a>
        </div>
        </body></html>
      `,
    },
  });
});

// 3) Monthly reminder
agenda.define("send-monthly-reminder", async (job) => {
  const { to, name } = job.attrs.data;
  await safeSend({
    jobName: "send-monthly-reminder",
    params: {
      from: `UAACAI <${REPLY_EMAIL}>`,
      to,
      subject: `🔔 Your monthly UAACAI update`,
      text: `Hello ${name},

Here’s what’s new this month at UAACAI:
• 5 in-depth articles on journals & events trends
• Member Spotlight: how Jane Doe is making an impact
• Upcoming Webinar “Justice Reform in Practice” on August 10

Manage preferences or unsubscribe: https://uaacaiinternational.org/preferences`,
      html: `
        <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
        <title>Monthly Update</title><style>
          body{margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f0f0;}
          .container{max-width:600px;margin:0 auto;background:#fff;padding:20px;}
          h2{color:#333;font-size:20px;margin-bottom:10px;}
          ul{padding-left:20px;color:#333;line-height:1.5;margin-bottom:15px;}
          li{margin-bottom:8px;}
          .footer{font-size:12px;color:#777;text-align:center;margin-top:20px;}
        </style></head><body>
        <div class="container">
          <h2>What’s new this month:</h2>
          <ul>
            <li>🔍 Blog in‑depth articles on journals & events trends.</li>
            <li>👤 Member Spotlight: See how Jane Doe is making an impact.</li>
            <li>📅 Upcoming Webinar: “Justice Reform in Practice” Is Around the corner Please we will like you to attend.</li>
          </ul>
          <p class="footer">UAACAI International • <a href="https://uaacaiinternational.org/preferences" style="color:#777;text-decoration:none;">Manage Preferences</a> • <a href="https://uaacaiinternational.org/unsubscribe" style="color:#777;text-decoration:none;">Unsubscribe</a></p>
        </div>
        </body></html>
      `,
    },
  });
});

// 4) Broadcast new blog post
agenda.define("broadcast-new-post", async (job) => {
  const { emails, postTitle, postUrl } = job.attrs.data;
  await safeSend({
    jobName: "broadcast-new-post",
    params: {
      from: `UAACAI Blog <${REPLY_EMAIL}>`,
      to: emails,
      subject: `New post: ${postTitle}`,
      text: `New post: ${postTitle}

We've just published a new article on our blog. Dive in to get the latest insights and analysis:
${postUrl}`,
      html: `
        <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
        <title>${postTitle}</title><style>
          body{margin:0;padding:0;font-family:Arial,sans-serif;background:#eef2f5;}
          .container{max-width:600px;margin:0 auto;background:#fff;padding:20px;}
          h1{color:#dc3545;font-size:22px;margin-bottom:10px;}
          p{color:#333;line-height:1.5;margin-bottom:15px;}
          .btn{display:inline-block;padding:10px 20px;background:#dc3545;color:#fff;text-decoration:none;border-radius:4px;}
        </style></head><body>
        <div class="container">
          <h1>${postTitle}</h1>
          <p>We've just published a new article on our blog. Dive in to get the latest insights and analysis.</p>
          <a href="${postUrl}" class="btn">Read the Post</a>
        </div>
        </body></html>
      `,
    },
  });
});

// 5) Login notification email
agenda.define("send-login-email", async (job) => {
  const { to, name, ip, userAgent } = job.attrs.data;
  await safeSend({
    jobName: "send-login-email",
    params: {
      from: `UAACAI <${REPLY_EMAIL}>`,
      to,
      subject: `👋 Hey ${name}, you’ve just signed in`,
      text: `Hi ${name},

We noticed a sign‑in to your UAACAI account just now.

IP address: ${ip || "Unknown"}
Device: ${userAgent || "Unknown"}
Time: ${new Date().toLocaleString()}

If this was you, great! If not, reset your password immediately: https://uaacaiinternational.org/reset-password`,
      html: `
        <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
        <title>Login Alert</title><style>
          body{margin:0;padding:0;font-family:Arial,sans-serif;background:#f9f9f9;}
          .container{max-width:600px;margin:0 auto;background:#fff;padding:20px;}
          h1{color:#007bff;font-size:22px;margin-bottom:10px;}
          p{color:#333;line-height:1.5;margin-bottom:15px;}
          .details{background:#f1f1f1;padding:10px;border-radius:4px;margin-bottom:20px;}
          .footer{font-size:12px;color:#777;text-align:center;}
        </style></head><body>
        <div class="container">
          <h1>Hi ${name}, you’re in!</h1>
          <p>We noticed a sign‑in to your UAACAI account just now. Here are the details:</p>
          <div class="details">
            <p><strong>IP address:</strong> ${ip || "Unknown"}</p>
            <p><strong>Device:</strong> ${userAgent || "Unknown"}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p>If this wasn’t you, please <a href="https://uaacaiinternational.org/reset-password">reset your password</a> immediately.</p>
        </div>
        <div class="footer">
          UAACAI International • <a href="https://uaacaiinternational.org/unsubscribe" style="color:#777;text-decoration:none;">Unsubscribe</a>
        </div>
        </body></html>
      `,
    },
  });
});
