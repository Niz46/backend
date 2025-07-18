// backend/jobs/emailJobs.js
require("dotenv").config();
const agenda = require("../config/agenda");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const LOGO_URL = "https://uaacaiinternational.org/logo.ico";
const BRAND_COLOR = "#007bff";

// 1) Welcome email
agenda.define("send-welcome-email", async (job) => {
  const { to, name } = job.attrs.data;
  await resend.emails.send({
    from: "UAACAI <no-reply@uaacaiinternational.org>",
    to,
    subject: "Welcome aboard!",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Welcome</title>
        <style>
          body { margin:0; padding:0; font-family:Arial,sans-serif; background:#f4f4f4; }
          .container { max-width:600px; margin:0 auto; background:#fff; }
          .header { padding:20px; text-align:center; }
          .header img { max-height:50px; }
          .content { padding:40px 20px; text-align:center; }
          .content h1 { color:#333; font-size:24px; margin-bottom:10px; }
          .content p { color:#555; font-size:16px; line-height:1.5; }
          .btn { display:inline-block; margin-top:20px; padding:12px 24px; background:${BRAND_COLOR}; color:#fff; text-decoration:none; border-radius:4px; }
          .footer { padding:20px; text-align:center; font-size:12px; color:#aaa; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${LOGO_URL}" alt="UAACAI Logo" />
          </div>
          <div class="content">
            <h1>Welcome, ${name}!</h1>
            <p>Thanks for joining UAACAI. We’re excited to have you on board.</p>
            <a href="https://uaacaiinternational.org/login" class="btn">Get Started</a>
          </div>
          <div class="footer">
            UAACAI International • <a href="#" style="color:#aaa;text-decoration:none;">Unsubscribe</a>
          </div>
        </div>
      </body>
      </html>
    `,
  });
});

// 2) 3‑day “we miss you” nudge
agenda.define("send-nudge-email", async (job) => {
  const { to, name } = job.attrs.data;
  await resend.emails.send({
    from: "UAACAI <no-reply@uaacaiinternational.org>",
    to,
    subject: "👋 We miss you!",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>We Miss You</title>
        <style>
          body { margin:0; padding:0; font-family:Arial,sans-serif; background:#fafafa; }
          .container { max-width:600px; margin:0 auto; background:#fff; }
          .header { padding:20px; text-align:center; }
          .header img { max-height:40px; }
          .content { padding:40px 20px; }
          .content h2 { color:#333; font-size:22px; margin-bottom:10px; }
          .content p { color:#555; font-size:16px; line-height:1.5; }
          .btn { display:inline-block; margin-top:20px; padding:12px 24px; background:#28a745; color:#fff; text-decoration:none; border-radius:4px; }
          .footer { padding:20px; text-align:center; font-size:12px; color:#aaa; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${LOGO_URL}" alt="UAACAI Logo" />
          </div>
          <div class="content">
            <h2>Hey ${name}, we’ve missed you!</h2>
            <p>It’s been a few days since you last visited. Come back to see what’s new.</p>
            <a href="https://uaacaiinternational.org/dashboard" class="btn">Return Now</a>
          </div>
          <div class="footer">
            You’re receiving this because you joined UAACAI.<br/>
            <a href="#" style="color:#aaa;text-decoration:none;">Unsubscribe</a>
          </div>
        </div>
      </body>
      </html>
    `,
  });
});

// 3) Monthly reminder
agenda.define("send-monthly-reminder", async (job) => {
  const { to, name } = job.attrs.data;
  await resend.emails.send({
    from: "UAACAI <no-reply@uaacaiinternational.org>",
    to,
    subject: "🔔 Don’t miss out!",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Monthly Update</title>
        <style>
          body { margin:0; padding:0; font-family:Arial,sans-serif; background:#f0f0f0; }
          .container { max-width:600px; margin:0 auto; background:#fff; }
          .header { padding:20px; text-align:center; }
          .header img { max-height:40px; }
          .content { padding:30px 20px; }
          .content h2 { color:#333; font-size:20px; margin-bottom:10px; }
          .content ul { padding-left:20px; color:#555; font-size:16px; }
          .content ul li { margin-bottom:8px; }
          .footer { padding:20px; text-align:center; font-size:12px; color:#aaa; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${LOGO_URL}" alt="UAACAI Logo" />
          </div>
          <div class="content">
            <h2>What’s new at UAACAI</h2>
            <ul>
              <li>🔍 5 new anti‑corruption blog posts</li>
              <li>👥 Member spotlight: Meet Jane Doe</li>
              <li>📅 Upcoming webinar on justice reforms</li>
            </ul>
          </div>
          <div class="footer">
            UAACAI International • <a href="#" style="color:#aaa;text-decoration:none;">View on web</a><br/>
            <a href="#" style="color:#aaa;text-decoration:none;">Unsubscribe</a>
          </div>
        </div>
      </body>
      </html>
    `,
  });
});

// 4) Broadcast new blog post
agenda.define("broadcast-new-post", async (job) => {
  const { emails, postTitle, postUrl } = job.attrs.data;
  await resend.emails.send({
    from: "UAACAI Blog <no-reply@uaacaiinternational.org>",
    to: emails,
    subject: `New post: ${postTitle}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>New Blog Post</title>
        <style>
          body { margin:0; padding:0; font-family:Arial,sans-serif; background:#eef2f5; }
          .container { max-width:600px; margin:0 auto; background:#fff; }
          .header { padding:20px; text-align:center; }
          .header img { max-height:40px; }
          .content { padding:40px 20px; }
          .content h1 { color:#222; font-size:24px; margin-bottom:10px; }
          .content p { color:#555; font-size:16px; line-height:1.5; }
          .btn { display:inline-block; margin-top:20px; padding:12px 24px; background:#dc3545; color:#fff; text-decoration:none; border-radius:4px; }
          .footer { padding:20px; text-align:center; font-size:12px; color:#888; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${LOGO_URL}" alt="UAACAI Logo" />
          </div>
          <div class="content">
            <h1>New post: ${postTitle}</h1>
            <p>We've just published a new article. Click below to read it now:</p>
            <a href="${postUrl}" class="btn">Read the Post</a>
          </div>
          <div class="footer">
            Thank you for being part of our community.<br/>
            <a href="#" style="color:#888;text-decoration:none;">Unsubscribe</a>
          </div>
        </div>
      </body>
      </html>
    `,
  });
});
