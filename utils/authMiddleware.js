// utils/authMiddleware.js
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization denied, missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'secret123';

    try {
        const decoded = jwt.verify(token, secret);

        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token is invalid or expired' });
    }
};

module.exports = authMiddleware;