// backend/jobs/emailJobs.js
require("dotenv").config();
const agenda = require("../config/agenda");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const LOGO_URL = "https://uaacaiinternational.org/logo.ico";
const BRAND_COLOR = "#007bff";

// Helper to actually send (with guard + logging)
async function safeSend({ jobName, params }) {
  const { to } = params;
  // Normalize to-array
  const recipients = Array.isArray(to)
    ? to.filter(Boolean)
    : [to].filter(Boolean);

  if (recipients.length === 0) {
    console.warn(`⚠️ [${jobName}] no valid recipients—skipping send.`);
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
      from: `UAACAI <no-reply@uaacaiinternational.org>`,
      to,
      subject: `Welcome aboard, ${name}!`,
      html: `
        <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
        <title>Welcome to UAACAI</title><style>
          body{margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;}
          .container{max-width:600px;margin:0 auto;background:#fff;padding:20px;}
          h1{color:#007bff;font-size:24px;margin-bottom:10px;}
          p{color:#333;line-height:1.5;margin-bottom:15px;}
          ul{padding-left:20px;margin-bottom:20px;}
          li{margin-bottom:8px;}
          .btn{display:inline-block;padding:10px 20px;background:#007bff;color:#fff;text-decoration:none;border-radius:4px;}
        </style></head><body>
        <div class="container">
          <h1>Hey ${name}, welcome aboard!</h1>
          <p>We're delighted you've joined UAACAI International. Together, we'll work toward a transparent, just world.</p>
          <ul>
            <li><strong>Set up your profile:</strong> Add a photo and bio so fellow members can connect.</li>
            <li><strong>Explore:</strong> Read our latest blog posts on our journals and Events strategies.</li>
            <li><strong>Engage:</strong> Jump into discussions in our community forum.</li>
          </ul>
          <a href="https://uaacaiinternational.org/login" class="btn">Get Started</a>
        </div>
        </body></html>
      `,
    },
  });
});

// 2) “We miss you” nudge (3 days later)
agenda.define("send-nudge-email", async (job) => {
  const { to, name } = job.attrs.data;
  await safeSend({
    jobName: "send-nudge-email",
    params: {
      from: `UAACAI <no-reply@uaacaiinternational.org>`,
      to,
      subject: `👋 Hey ${name}, we’ve missed you!`,
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
          <a href="https://uaacaiinternational.org" class="btn">Return Now</a>
        </div>
        </body></html>
      `,
    },
  });
});

// 3) Monthly reminder (every 30 days)
agenda.define("send-monthly-reminder", async (job) => {
  const { to, name } = job.attrs.data;
  await safeSend({
    jobName: "send-monthly-reminder",
    params: {
      from: `UAACAI <no-reply@uaacaiinternational.org>`,
      to,
      subject: `🔔 Monthly Update from UAACAI`,
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
            <li>🔍 Blog in-depth articles on journals or Events trends.</li>
            <li>👤 Member Spotlight: See how Jane Doe is making an impact.</li>
            <li>📅 Upcoming Webinar: “Justice Reform in Practice” on August 10.</li>
          </ul>
          <p class="footer">UAACAI International • <a href="#" style="color:#777;text-decoration:none;">Manage Preferences</a> • <a href="#" style="color:#777;text-decoration:none;">Unsubscribe</a></p>
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
      from: `UAACAI Blog <no-reply@uaacaiinternational.org>`,
      to: emails,
      subject: `New post: ${postTitle}`,
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
