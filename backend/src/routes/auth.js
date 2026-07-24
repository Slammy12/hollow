const express = require("express");
const router = express.Router();

const db = require("../db");
const { createToken, verifyToken } = require("../auth");
const { checkOrGrantAccess, getOrCreateUser } = require("../license");

router.post("/redeem", (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({
            error: "Missing account code"
        });
    }

    const trimmedCode = code.trim().toUpperCase();

    // 1. Check persistent user account_code
    let user = db.prepare(`SELECT * FROM users WHERE account_code = ?`).get(trimmedCode);

    // 2. Fallback: check login_codes table for temporary code
    if (!user) {
        const loginCodeRecord = db.prepare(`SELECT * FROM login_codes WHERE code = ?`).get(trimmedCode);
        if (loginCodeRecord) {
            user = getOrCreateUser(loginCodeRecord.telegram_id);
        }
    }

    if (!user) {
        return res.status(400).json({
            error: "Invalid account code. Message the Telegram bot to get your code."
        });
    }

    const telegramId = user.telegram_id;

    // Check or grant license access
    const access = checkOrGrantAccess(telegramId);
    if (!access.allowed) {
        return res.status(403).json({
            error: "Account expired. Please purchase a plan via Telegram bot (@umbralead).",
            expired: true
        });
    }

    user = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(telegramId);

    const token = createToken(user);

    res.json({
        token,
        user: {
            id: user.id,
            telegram_id: user.telegram_id,
            account_code: user.account_code
        },
        license: {
            expiresAt: user.expires_at,
            active: user.expires_at > Date.now()
        }
    });
});

router.post("/login", (req, res, next) => {
    req.url = "/redeem";
    router.handle(req, res, next);
});

router.get("/status", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = verifyToken(token);
        const user = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(decoded.telegram_id);
        const active = user && user.expires_at > Date.now();
        res.json({
            user: decoded,
            license: {
                active,
                expiresAt: user ? user.expires_at : 0,
                accountCode: user ? user.account_code : null
            }
        });
    } catch (err) {
        res.status(401).json({ error: "Invalid or expired token" });
    }
});

module.exports = router;