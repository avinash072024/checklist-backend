// utils/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Authorization denied, missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'secret123';

    try {
        const decoded = jwt.verify(token, secret);
        const userId = decoded?.id || decoded?.userId || decoded?._id;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Token is invalid or expired' });
        }

        const user = await User.findById(userId).select('-password -registrationOTP -registrationOTPExpires -resetPasswordOTP -resetPasswordOTPExpires -changePasswordOTP -changePasswordOTPExpires');
        if (!user) {
            return res.status(401).json({ success: false, message: 'User account no longer exists. Please sign in again.' });
        }

        req.user = {
            id: user._id,
            userId: user._id,
            _id: user._id,
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            email: user.email,
            mobileNumber: user.mobileNumber,
            isVerified: user.isVerified
        };
        req.userDoc = user;

        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Token is invalid or expired' });
    }
};

module.exports = authMiddleware;