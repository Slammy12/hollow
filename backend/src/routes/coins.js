const express = require("express");
const router = express.Router();

const db = require("../db");
const { verifyToken } = require("../auth");
const { Connection, Keypair, VersionedTransaction } = require("@solana/web3.js");
const bs58 = require("bs58");

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

// 1x1 transparent PNG used when the user uploads no image (pump.fun IPFS requires a file)
const FALLBACK_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
);

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        req.user = verifyToken(authHeader.split(" ")[1]);
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid or expired token" });
    }
}

function getDevWallet() {
    const key = process.env.DEV_WALLET_PRIVATE_KEY;
    if (!key) throw new Error("DEV_WALLET_PRIVATE_KEY is not set");
    const decode = bs58.decode || bs58.default.decode;
    return Keypair.fromSecretKey(decode(key.trim()));
}

function dataUrlToBuffer(dataUrl) {
    const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl || "");
    if (!match) return { buffer: FALLBACK_PNG, type: "image/png" };
    return { buffer: Buffer.from(match[2], "base64"), type: match[1] };
}

// POST /api/coins/create — creates a real coin on pump.fun
router.post("/create", requireAuth, async (req, res) => {
    const { name, ticker, description, image, slippage } = req.body;

    if (!name || !ticker) {
        return res.status(400).json({ error: "Name and ticker are required" });
    }

    try {
        const wallet = getDevWallet();
        const mintKeypair = Keypair.generate();

        // 1. Upload metadata + image to pump.fun IPFS
        const { buffer, type } = dataUrlToBuffer(image);
        const formData = new FormData();
        formData.append("file", new Blob([buffer], { type }), "coin" + (type === "image/png" ? ".png" : ".img"));
        formData.append("name", String(name).slice(0, 32));
        formData.append("symbol", String(ticker).toUpperCase().slice(0, 10));
        formData.append("description", String(description || "").slice(0, 500));
        formData.append("showName", "true");

        const ipfsRes = await fetch("https://pump.fun/api/ipfs", { method: "POST", body: formData });
        if (!ipfsRes.ok) {
            const text = await ipfsRes.text();
            throw new Error("IPFS upload failed: " + text.slice(0, 200));
        }
        const ipfs = await ipfsRes.json();

        // 2. Build the create transaction via PumpPortal (local signing — key never leaves this server)
        const txRes = await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                publicKey: wallet.publicKey.toBase58(),
                action: "create",
                tokenMetadata: {
                    name: ipfs.metadata.name,
                    symbol: ipfs.metadata.symbol,
                    uri: ipfs.metadataUri
                },
                mint: mintKeypair.publicKey.toBase58(),
                denominatedInSol: "true",
                amount: 0, // dev buy handled as a UI prop only
                slippage: Number(slippage) || 5,
                priorityFee: 0.0005,
                pool: "pump"
            })
        });
        if (!txRes.ok) {
            const text = await txRes.text();
            throw new Error("PumpPortal error: " + text.slice(0, 200));
        }

        // 3. Sign with mint + dev wallet, send to the chain
        const txBytes = new Uint8Array(await txRes.arrayBuffer());
        const tx = VersionedTransaction.deserialize(txBytes);
        tx.sign([mintKeypair, wallet]);

        const connection = new Connection(RPC_URL, "confirmed");
        const signature = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });

        const mint = mintKeypair.publicKey.toBase58();

        db.prepare(`
            INSERT INTO coins (user_id, name, ticker, description, image, dev_buy, slippage, bundled_buy, bundled_wallets, mint, signature, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live')
        `).run(
            req.user.id, name, String(ticker).toUpperCase(), description || "", image || null,
            Number(req.body.devBuy) || 0, Number(slippage) || 0,
            Number(req.body.bundleBuy) || 0, Number(req.body.bundleWallets) || 0,
            mint, signature
        );

        res.json({
            mint,
            signature,
            pumpUrl: "https://pump.fun/coin/" + mint,
            explorer: "https://solscan.io/tx/" + signature
        });
    } catch (err) {
        console.error("Coin creation failed:", err.message);
        res.status(500).json({ error: "Launch failed: " + err.message });
    }
});

// GET /api/coins — list this user's coins
router.get("/", requireAuth, (req, res) => {
    const rows = db.prepare(
        `SELECT id, name, ticker, description, image, mint, signature, status, created_at
         FROM coins WHERE user_id = ? ORDER BY id DESC`
    ).all(req.user.id);
    res.json(rows);
});

module.exports = router;
