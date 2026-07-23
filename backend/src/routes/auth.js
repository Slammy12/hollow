const express = require("express");
const router = express.Router();

const db = require("../db");
const { createToken, verifyToken } = require("../auth");
const { checkOrGrantAccess, getUserLicense } = require("../license");

router.post("/redeem", (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({
            error: "Missing login code"
        });
    }

    const loginCode = db.prepare(`
        SELECT *
        FROM login_codes
        WHERE code = ?
    `).get(code);

    if (!loginCode) {
        return res.status(400).json({
            error: "Invalid code"
        });
    }

    if (loginCode.used === 1) {
        return res.status(400).json({
            error: "Code already used"
        });
    }

    if (Date.now() > loginCode.expires_at) {
        return res.status(400).json({
            error: "Code expired"
        });
    }

    const telegramId = loginCode.telegram_id;

    // Check or grant license access
    const access = checkOrGrantAccess(telegramId);
    if (!access.allowed) {
        return res.status(403).json({
            error: "Account expired. Please purchase a plan via Telegram bot.",
            expired: true
        });
    }

    let user = db.prepare(`
        SELECT *
        FROM users
        WHERE telegram_id = ?
    `).get(telegramId);

    if (!user) {
        const result = db.prepare(`
            INSERT INTO users (telegram_id)
            VALUES (?)
        `).run(telegramId);

        user = db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(result.lastInsertRowid);
    }

    db.prepare(`
        UPDATE login_codes
        SET used = 1
        WHERE id = ?
    `).run(loginCode.id);

    const token = createToken(user);

    res.json({
        token,
        user,
        license: {
            plan: access.plan,
            expiresAt: access.expiresAt
        }
    });
});

// Alias POST /api/auth/login to support /login endpoint as well
router.post("/login", (req, res, next) => {
    req.url = "/redeem";
    router.handle(req, res, next);
});

// Status check endpoint
router.get("/status", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = verifyToken(token);
        const licenseStatus = getUserLicense(decoded.telegram_id);
        res.json({
            user: decoded,
            license: licenseStatus
        });
    } catch (err) {
        res.status(401).json({ error: "Invalid or expired token" });
    }
});

module.exports = router;