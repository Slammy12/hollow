const jwt = require("jsonwebtoken");

function createToken(user) {
    return jwt.sign(
        {
            id: user.id,
            telegram_id: user.telegram_id
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );
}

function verifyToken(token) {
    return jwt.verify(
        token,
        process.env.JWT_SECRET
    );
}

module.exports = {
    createToken,
    verifyToken
};