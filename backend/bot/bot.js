const TelegramBot = require("node-telegram-bot-api").default || require("node-telegram-bot-api");
const crypto = require("crypto");
const db = require("../src/db");
const {
    createLicense,
    getUserLicense,
    grantTrial,
    redeemLicense,
    isAdmin,
    checkOrGrantAccess
} = require("../src/license");
require("dotenv").config();

const bot = new TelegramBot(
    process.env.TELEGRAM_BOT_TOKEN,
    {
        polling: true
    }
);

function generateCode() {
    return crypto.randomBytes(8).toString("hex").toUpperCase();
}

function createLoginCode(telegramId) {
    const code = generateCode();
    const expires = Date.now() + (10 * 60 * 1000);

    db.prepare(`
        INSERT INTO login_codes (telegram_id, code, expires_at)
        VALUES (?, ?, ?)
    `).run(telegramId, code, expires);

    return code;
}

// Command: /start
bot.onText(/\/start/, (msg) => {
    const text = 
`⚡ *Welcome to Hollow.*

Available commands:
• /login - Get a 16-character website login code
• /trial - Claim your 1-day free trial
• /redeem <code> - Redeem a license key
• /payment - Purchase access options
• /status - Check your subscription status`;

    bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

// Command: /login
bot.onText(/\/login/, (msg) => {
    const telegramId = String(msg.from.id);

    const access = checkOrGrantAccess(telegramId);
    if (!access.allowed) {
        return bot.sendMessage(
            msg.chat.id,
            "🔴 *Account Access Expired*\n\nYour account access has expired. Please purchase a plan with /payment or redeem a code with /redeem <code>.",
            { parse_mode: "Markdown" }
        );
    }

    const code = createLoginCode(telegramId);

    let msgText = `🔑 *Your Hollow login code:*\n\n\`${code}\` \n\nExpires in 10 minutes.`;
    if (access.autoTrial) {
        msgText += `\n\n🎉 *1-Day Free Trial activated automatically!*`;
    }

    bot.sendMessage(msg.chat.id, msgText, { parse_mode: "Markdown" });
});

// Command: /trial
bot.onText(/\/trial/, (msg) => {
    const telegramId = String(msg.from.id);
    const result = grantTrial(telegramId);

    if (!result.success) {
        return bot.sendMessage(
            msg.chat.id,
            "❌ You have already claimed your 1-day free trial."
        );
    }

    const expiryDate = new Date(result.expiresAt).toUTCString();
    bot.sendMessage(
        msg.chat.id,
        `🎉 *Free Trial Activated!*\n\nYou have 1 day of full access.\n*Expires:* ${expiryDate}\n\nUse /login to get your website login code.`,
        { parse_mode: "Markdown" }
    );
});

// Command: /redeem <code>
bot.onText(/\/redeem(?:\s+(.+))?/, (msg, match) => {
    const rawKey = match[1];
    if (!rawKey) {
        return bot.sendMessage(
            msg.chat.id,
            "⚠️ Usage: `/redeem HOLLOW-XXXX-XXXX`",
            { parse_mode: "Markdown" }
        );
    }

    const telegramId = String(msg.from.id);
    const result = redeemLicense(telegramId, rawKey);

    if (!result.success) {
        if (result.reason === "INVALID_KEY") {
            return bot.sendMessage(msg.chat.id, "❌ Invalid license key. Please check the code and try again.");
        }
        if (result.reason === "ALREADY_USED") {
            return bot.sendMessage(msg.chat.id, "❌ This license key has already been redeemed.");
        }
        return bot.sendMessage(msg.chat.id, "❌ Failed to redeem license key.");
    }

    const expiryDate = new Date(result.expiresAt).toUTCString();
    bot.sendMessage(
        msg.chat.id,
        `✅ *License Redeemed Successfully!*\n\n• *Plan:* ${result.plan}\n• *Access valid until:* ${expiryDate}\n\nUse /login to get your website login code.`,
        { parse_mode: "Markdown" }
    );
});

// Command: /payment
bot.onText(/\/payment/, (msg) => {
    const text = 
`To purchase Hollow access:

DM @umbralead

Plans:
- Monthly
- Lifetime`;

    bot.sendMessage(msg.chat.id, text);
});

// Command: /status
bot.onText(/\/status/, (msg) => {
    const telegramId = String(msg.from.id);
    const access = getUserLicense(telegramId);

    if (access.active) {
        const expiryDate = new Date(access.expiresAt).toUTCString();
        const diffMs = access.expiresAt - Date.now();
        const daysLeft = (diffMs / (1000 * 60 * 60 * 24)).toFixed(1);
        bot.sendMessage(
            msg.chat.id,
            `🟢 *Subscription Active*\n\n• *Plan:* ${access.plan}\n• *Expires:* ${expiryDate}\n• *Time remaining:* ~${daysLeft} day(s)`,
            { parse_mode: "Markdown" }
        );
    } else {
        bot.sendMessage(
            msg.chat.id,
            `🔴 *No Active Subscription*\n\nYour access has expired or you don't have a plan.\n\n• Use /trial to claim a 1-day free trial.\n• Use /payment to purchase a plan.\n• Use /redeem <code> to redeem a license key.`,
            { parse_mode: "Markdown" }
        );
    }
});

// Admin Command: /logincode
bot.onText(/\/logincode/, (msg) => {
    const telegramId = String(msg.from.id);
    if (!isAdmin(telegramId)) {
        return bot.sendMessage(msg.chat.id, "❌ Unauthorized. Admin access required.");
    }

    const license = createLicense(1, "FREE");
    bot.sendMessage(
        msg.chat.id,
        `🔑 *1-Day License Key Created*\n\nCode: \`${license.key}\` \nValid for: 1 day\n\nUser redeems with:\n\`/redeem ${license.key}\``,
        { parse_mode: "Markdown" }
    );
});

// Admin Command: /createlicense <days>
bot.onText(/\/createlicense(?:\s+(\d+))?/, (msg, match) => {
    const telegramId = String(msg.from.id);
    if (!isAdmin(telegramId)) {
        return bot.sendMessage(msg.chat.id, "❌ Unauthorized. Admin access required.");
    }

    const days = match[1] ? parseInt(match[1], 10) : 30;
    if (isNaN(days) || days <= 0) {
        return bot.sendMessage(msg.chat.id, "⚠️ Usage: `/createlicense <days>` (e.g. `/createlicense 30`)", { parse_mode: "Markdown" });
    }

    const license = createLicense(days);
    bot.sendMessage(
        msg.chat.id,
        `🔑 *License Created*\n\nCode: \`${license.key}\` \nPlan: ${license.plan} (${days} days)\n\nUser redeems with:\n\`/redeem ${license.key}\``,
        { parse_mode: "Markdown" }
    );
});

console.log("Telegram bot running");