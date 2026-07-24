const express = require("express");
const cors = require("cors");
require("dotenv").config();

require("./db");

const authRoutes = require("./routes/auth");
const coinRoutes = require("./routes/coins");

const app = express();

app.use(cors());
app.use(express.json({ limit: "8mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/coins", coinRoutes);

app.get("/", (req, res) => {
    res.json({
        status: "Hollow backend online"
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Hollow backend running on port ${PORT}`);
    
    // Auto-start Telegram Bot when deployed
    if (process.env.START_BOT !== "false" && process.env.TELEGRAM_BOT_TOKEN) {
        try {
            require("../bot/bot");
        } catch (err) {
            console.log("Bot already initialized or failed to start:", err.message);
        }
    }
});