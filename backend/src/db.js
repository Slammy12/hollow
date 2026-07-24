const Database = require("better-sqlite3");

const db = new Database("hollow.db");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    account_code TEXT UNIQUE,
    expires_at INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS coins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    ticker TEXT NOT NULL,
    description TEXT,
    image TEXT,
    dev_buy REAL DEFAULT 0,
    slippage REAL DEFAULT 0,
    bundled_buy REAL DEFAULT 0,
    bundled_wallets INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT UNIQUE NOT NULL,
    telegram_id TEXT,
    plan TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

try { db.exec("ALTER TABLE users ADD COLUMN account_code TEXT UNIQUE;"); } catch(e){}
try { db.exec("ALTER TABLE users ADD COLUMN expires_at INTEGER DEFAULT 0;"); } catch(e){}
try { db.exec("ALTER TABLE coins ADD COLUMN mint TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE coins ADD COLUMN signature TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE coins ADD COLUMN status TEXT DEFAULT 'live';"); } catch(e){}

module.exports = db;