const crypto = require("crypto");
const db = require("./db");

function generateKey() {
    const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    return `HOLLOW-${p1}-${p2}`;
}

function daysToMs(days) {
    return days * 24 * 60 * 60 * 1000;
}

function getPlanName(days) {
    if (days === 1) return "FREE";
    if (days === 30) return "MONTHLY";
    if (days >= 9999) return "LIFETIME";
    return `${days} DAYS`;
}

/**
 * Admin creates a license key valid for X days.
 */
function createLicense(days, customPlan) {
    const key = generateKey();
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
 * Check user's current license status.
 */
function getUserLicense(telegramId) {
    const now = Date.now();
    const activeLicense = db.prepare(`
        SELECT * FROM licenses
        WHERE telegram_id = ? AND used = 1 AND expires_at > ?
        ORDER BY expires_at DESC
        LIMIT 1
    `).get(String(telegramId), now);

    if (activeLicense) {
        return {
            active: true,
            license: activeLicense,
            expiresAt: activeLicense.expires_at,
            plan: activeLicense.plan
        };
    }

    const expiredLicense = db.prepare(`
        SELECT * FROM licenses
        WHERE telegram_id = ? AND used = 1
        ORDER BY expires_at DESC
        LIMIT 1
    `).get(String(telegramId));

    return {
        active: false,
        license: expiredLicense || null,
        expiresAt: expiredLicense ? expiredLicense.expires_at : null,
        plan: expiredLicense ? expiredLicense.plan : null
    };
}

/**
 * Check if user has ever claimed a trial.
 */
function hasClaimedTrial(telegramId) {
    const record = db.prepare(`
        SELECT * FROM licenses
        WHERE telegram_id = ? AND plan = 'FREE'
    `).get(String(telegramId));

    return !!record;
}

/**
 * Grant a 1-day free trial to a user.
 */
function grantTrial(telegramId) {
    const tid = String(telegramId);
    if (hasClaimedTrial(tid)) {
        return { success: false, reason: "ALREADY_CLAIMED" };
    }

    const key = `HOLLOW-TRIAL-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const expiresAt = Date.now() + daysToMs(1);

    db.prepare(`
        INSERT INTO licenses (license_key, telegram_id, plan, expires_at, used)
        VALUES (?, ?, 'FREE', ?, 1)
    `).run(key, tid, expiresAt);

    return {
        success: true,
        expiresAt,
        plan: "FREE"
    };
}

/**
 * Redeem a license key for a user.
 */
function redeemLicense(telegramId, rawKey) {
    if (!rawKey) return { success: false, reason: "MISSING_KEY" };
    const key = rawKey.trim().toUpperCase();
    const tid = String(telegramId);

    const license = db.prepare(`
        SELECT * FROM licenses WHERE license_key = ?
    `).get(key);

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

    const current = getUserLicense(tid);
    let newExpiresAt = Date.now() + durationMs;
    if (current.active && current.expiresAt > Date.now()) {
        newExpiresAt = current.expiresAt + durationMs;
    }

    db.prepare(`
        UPDATE licenses
        SET used = 1, telegram_id = ?, expires_at = ?
        WHERE id = ?
    `).run(tid, newExpiresAt, license.id);

    return {
        success: true,
        plan: license.plan,
        expiresAt: newExpiresAt
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

/**
 * Check user access. Auto-grant trial if first login and eligible.
 */
function checkOrGrantAccess(telegramId) {
    const tid = String(telegramId);
    const current = getUserLicense(tid);

    if (current.active) {
        return { allowed: true, plan: current.plan, expiresAt: current.expiresAt };
    }

    if (!hasClaimedTrial(tid)) {
        const trialResult = grantTrial(tid);
        if (trialResult.success) {
            return { allowed: true, plan: "FREE", expiresAt: trialResult.expiresAt, autoTrial: true };
        }
    }

    return { allowed: false, reason: "EXPIRED" };
}

module.exports = {
    generateKey,
    createLicense,
    getUserLicense,
    hasClaimedTrial,
    grantTrial,
    redeemLicense,
    isAdmin,
    checkOrGrantAccess
};
