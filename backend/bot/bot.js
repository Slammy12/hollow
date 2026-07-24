const TelegramBot = require("node-telegram-bot-api").default || require("node-telegram-bot-api");
const db = require("../src/db");
const {
    getOrCreateUser,
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

// Command: /start
bot.onText(/\/start/, (msg) => {
    const text = 
`⚡ *Welcome to Hollow.*

Available commands:
• /login - View your permanent website account code
• /trial - Claim your 1-day free trial
• /redeem <code> - Redeem a purchased license key
• /payment - Purchase access options
• /status - Check your subscription status`;

    bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

// Command: /login
bot.onText(/\/login/, (msg) => {
    const telegramId = String(msg.from.id);
    const user = getOrCreateUser(telegramId);
    const access = checkOrGrantAccess(telegramId);

    if (!access.allowed) {
        return bot.sendMessage(
            msg.chat.id,
            `🔴 *Account Access Expired*\n\nYour account code:\n\`${user.account_code}\` \n\nAccess has expired. Use /payment to purchase a plan or /redeem <code> to add time.`,
            { parse_mode: "Markdown" }
        );
    }

    const expiryDate = new Date(access.expiresAt).toUTCString();
    let msgText = `🔑 *Your Hollow Account Code:*\n\n\`${user.account_code}\` \n\n*Access Valid Until:* ${expiryDate}\n\nEnter this code on the website to sign in.`;

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

    const user = getOrCreateUser(telegramId);
    const expiryDate = new Date(result.expiresAt).toUTCString();
    bot.sendMessage(
        msg.chat.id,
        `🎉 *Free Trial Activated!*\n\nYou have 1 day of full access.\n*Account Code:* \`${user.account_code}\` \n*Expires:* ${expiryDate}\n\nEnter your code on the website to sign in.`,
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

    const user = getOrCreateUser(telegramId);
    const expiryDate = new Date(result.expiresAt).toUTCString();
    bot.sendMessage(
        msg.chat.id,
        `✅ *License Redeemed Successfully!*\n\n• *Time Added:* +${result.daysAdded} day(s)\n• *Account Code:* \`${user.account_code}\` \n• *New Access Expiration:* ${expiryDate}\n\nEnter your code on the website to sign in.`,
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
    const user = getOrCreateUser(telegramId);
    const access = getUserLicense(telegramId);

    if (access.active) {
        const expiryDate = new Date(access.expiresAt).toUTCString();
        const diffMs = access.expiresAt - Date.now();
        const daysLeft = (diffMs / (1000 * 60 * 60 * 24)).toFixed(1);
        bot.sendMessage(
            msg.chat.id,
            `🟢 *Subscription Active*\n\n• *Account Code:* \`${user.account_code}\` \n• *Expires:* ${expiryDate}\n• *Time remaining:* ~${daysLeft} day(s)`,
            { parse_mode: "Markdown" }
        );
    } else {
        bot.sendMessage(
            msg.chat.id,
            `🔴 *No Active Subscription*\n\n• *Account Code:* \`${user.account_code}\` \n\nYour access has expired or you don't have a plan.\n\n• Use /trial to claim a 1-day free trial.\n• Use /payment to purchase a plan.\n• Use /redeem <code> to redeem a key.`,
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

    const license = createLicense(1, "1 DAY");
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