const crypto = require("crypto");
const db = require("./db");

function generateCode() {
    const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    return `HOLLOW-${p1}-${p2}`;
}

function daysToMs(days) {
    return days * 24 * 60 * 60 * 1000;
}

function getPlanName(days) {
    if (days === 1) return "1 DAY";
    if (days === 30) return "MONTHLY";
    if (days >= 9999) return "LIFETIME";
    return `${days} DAYS`;
}

/**
 * Get or create user record by Telegram ID.
 * Assigns a permanent account_code if user doesn't have one yet.
 */
function getOrCreateUser(telegramId) {
    const tid = String(telegramId);
    let user = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(tid);

    if (!user) {
        let code = generateCode();
        while (db.prepare(`SELECT id FROM users WHERE account_code = ?`).get(code)) {
            code = generateCode();
        }
        db.prepare(`
            INSERT INTO users (telegram_id, account_code, expires_at)
            VALUES (?, ?, 0)
        `).run(tid, code);

        user = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(tid);
    } else if (!user.account_code) {
        let code = generateCode();
        while (db.prepare(`SELECT id FROM users WHERE account_code = ?`).get(code)) {
            code = generateCode();
        }
        db.prepare(`UPDATE users SET account_code = ? WHERE id = ?`).run(code, user.id);
        user.account_code = code;
    }

    return user;
}

/**
 * Check if user has ever claimed a trial.
 */
function hasClaimedTrial(telegramId) {
    const tid = String(telegramId);
    const record = db.prepare(`
        SELECT * FROM licenses
        WHERE telegram_id = ? AND plan = 'FREE'
    `).get(tid);

    return !!record;
}

/**
 * Grant 1-day free trial to user.
 */
function grantTrial(telegramId) {
    const tid = String(telegramId);
    const user = getOrCreateUser(tid);

    if (hasClaimedTrial(tid)) {
        return { success: false, reason: "ALREADY_CLAIMED" };
    }

    const key = `HOLLOW-TRIAL-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const durationMs = daysToMs(1);
    const now = Date.now();
    const newExpiresAt = (user.expires_at > now ? user.expires_at : now) + durationMs;

    db.prepare(`UPDATE users SET expires_at = ? WHERE id = ?`).run(newExpiresAt, user.id);
    db.prepare(`
        INSERT INTO licenses (license_key, telegram_id, plan, expires_at, used)
        VALUES (?, ?, 'FREE', ?, 1)
    `).run(key, tid, newExpiresAt);

    return {
        success: true,
        expiresAt: newExpiresAt,
        plan: "FREE"
    };
}

/**
 * Check user access. Auto-grant trial if first login and eligible.
 */
function checkOrGrantAccess(telegramId) {
    const tid = String(telegramId);
    const user = getOrCreateUser(tid);
    const now = Date.now();

    if (user.expires_at > now) {
        return { allowed: true, expiresAt: user.expires_at, accountCode: user.account_code };
    }

    if (!hasClaimedTrial(tid)) {
        const trialResult = grantTrial(tid);
        if (trialResult.success) {
            return {
                allowed: true,
                expiresAt: trialResult.expiresAt,
                accountCode: user.account_code,
                autoTrial: true
            };
        }
    }

    return { allowed: false, reason: "EXPIRED", accountCode: user.account_code, expiresAt: user.expires_at };
}

/**
 * Admin creates a license key valid for X days.
 */
function createLicense(days, customPlan) {
    const key = generateCode();
    const plan = customPlan || getPlanName(days);
    const durationMs = daysToMs(days);

    db.prepare(`
        INSERT INTO licenses (license_key, plan, expires_at, used)
        VALUES (?, ?, ?, 0)
    `).run(key, plan, durationMs);

    return {
        key,
        plan,
        days
    };
}

/**
 * Redeem a license key for a user.
 * Adds the duration directly to the user's account expires_at time!
 */
function redeemLicense(telegramId, rawKey) {
    if (!rawKey) return { success: false, reason: "MISSING_KEY" };
    const key = rawKey.trim().toUpperCase();
    const tid = String(telegramId);
    const user = getOrCreateUser(tid);

    const license = db.prepare(`SELECT * FROM licenses WHERE license_key = ?`).get(key);

    if (!license) {
        return { success: false, reason: "INVALID_KEY" };
    }

    if (license.used === 1) {
        return { success: false, reason: "ALREADY_USED" };
    }

    let durationMs = license.expires_at;
    if (durationMs > 315360000000) {
        durationMs = daysToMs(30);
    }

    const now = Date.now();
    let newExpiresAt = now + durationMs;

    if (user.expires_at && user.expires_at > now) {
        newExpiresAt = user.expires_at + durationMs;
    }

    db.prepare(`UPDATE users SET expires_at = ? WHERE id = ?`).run(newExpiresAt, user.id);
    db.prepare(`
        UPDATE licenses
        SET used = 1, telegram_id = ?, expires_at = ?
        WHERE id = ?
    `).run(tid, newExpiresAt, license.id);

    return {
        success: true,
        plan: license.plan,
        expiresAt: newExpiresAt,
        daysAdded: Math.round(durationMs / (1000 * 60 * 60 * 24))
    };
}

/**
 * Check if telegram ID is admin.
 */
function isAdmin(telegramId) {
    const adminEnv = process.env.ADMIN_TELEGRAM_ID;
    if (!adminEnv) return false;
    const adminIds = adminEnv.split(",").map(id => id.trim());
    return adminIds.includes(String(telegramId));
}

module.exports = {
    generateCode,
    getOrCreateUser,
    getUserLicense: (tid) => {
        const u = getOrCreateUser(tid);
        const active = u.expires_at > Date.now();
        return { active, expiresAt: u.expires_at, accountCode: u.account_code };
    },
    hasClaimedTrial,
    grantTrial,
    redeemLicense,
    isAdmin,
    checkOrGrantAccess,
    createLicense
};
