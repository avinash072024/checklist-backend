const express = require('express');
const router = express.Router();
const {
    register,
    signIn,
    forgotPassword,
    verifyOTP,
    resetPassword,
    verifyRegistrationOTP,
    resendRegistrationOTP,
    sendChangePasswordOTP,
    changePassword
} = require('../controllers/authController');
const authMiddleware = require('../utils/authMiddleware');

router.post('/register', register);
router.post('/signin', signIn);

// Forgot Password Flow (Unauthenticated)
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOTP);
router.post('/reset-password', resetPassword);

// Registration OTP verification
router.post('/verify-registration-otp', verifyRegistrationOTP);
router.post('/resend-registration-otp', resendRegistrationOTP);

// Change Password Flow (Authenticated)
router.post('/send-change-password-otp', authMiddleware, sendChangePasswordOTP);
router.post('/change-password', authMiddleware, changePassword);

module.exports = router;