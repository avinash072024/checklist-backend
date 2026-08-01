const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateOTP, sendOTP } = require('../utils/otpService');

// Helper to find user by email, mobile number, or identifier
const findUserByIdentifier = async (identifier) => {
    if (!identifier) return null;
    const isNumeric = !isNaN(identifier) && !isNaN(parseFloat(identifier));
    if (isNumeric) {
        return await User.findOne({
            $or: [
                { mobileNumber: Number(identifier) },
                { email: String(identifier).toLowerCase().trim() }
            ]
        });
    }
    return await User.findOne({ email: String(identifier).toLowerCase().trim() });
};

// Generate JWT token
const generateToken = (id, name, email, mobileNumber) => {
    return jwt.sign({ id, name, email, mobileNumber }, process.env.JWT_SECRET || 'secret123', {
        expiresIn: '30d',
    });
};

const sendRegistrationOTP = async (user) => {
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.registrationOTP = otp;
    user.registrationOTPExpires = otpExpires;
    await user.save();

    await sendOTP(user, otp, 'Registration');
};

// Register User
exports.register = async (req, res) => {
    try {
        const { firstName, lastName, email, mobileNumber, password } = req.body;

        if (!firstName) {
            return res.status(400).json({ success: false, message: 'Firstname is required' });
        }

        if (!lastName) {
            return res.status(400).json({ success: false, message: 'Lastname is required' });
        }

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        if (!mobileNumber) {
            return res.status(400).json({ success: false, message: 'Mobile number is required' });
        }

        if (!password) {
            return res.status(400).json({ success: false, message: 'Password is required' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const normalizedMobile = Number(mobileNumber);

        // Check if email & mobileNumber already exists
        const existingUser = await User.findOne({
            $or: [
                { email: normalizedEmail },
                { mobileNumber: normalizedMobile }
            ]
        });

        if (existingUser) {
            if (!existingUser.isVerified) {
                return res.status(400).json({
                    success: false,
                    message: 'An account already exists with this email or mobile number but is not verified. Please verify your account or request a new OTP.'
                });
            }

            if (existingUser.email === normalizedEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'User with this email already exists'
                });
            }

            if (existingUser.mobileNumber === normalizedMobile) {
                return res.status(400).json({
                    success: false,
                    message: 'User with this mobile number already exists'
                });
            }
        }

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            firstName,
            lastName,
            email: normalizedEmail,
            mobileNumber: normalizedMobile,
            password: hashedPassword,
            isVerified: false
        });

        await sendRegistrationOTP(user);

        res.status(201).json({
            success: true,
            message: 'Registration successful. Please verify your account with the OTP sent to your email/mobile.',
            data: {
                email: user.email ? user.email.replace(/(.{2})(.*)(?=@)/, '$1***') : null,
                mobileNumber: user.mobileNumber ? String(user.mobileNumber).slice(-4).padStart(String(user.mobileNumber).length, '*') : null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Sign In User
exports.signIn = async (req, res) => {
    try {
        const { mobileNumber, password } = req.body;

        if (!mobileNumber) {
            return res.status(400).json({ success: false, message: 'Please provide mobile number' });
        }

        if (!password) {
            return res.status(400).json({ success: false, message: 'Please provide password' });
        }

        const user = await User.findOne({ mobileNumber: Number(mobileNumber) });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid credentials. Please try again' });
        }

        if (!user.isVerified) {
            return res.status(403).json({
                success: false,
                message: 'Account is not verified. Please verify your account using the OTP sent during registration.'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials. Please try again' });
        }

        res.status(200).json({
            success: true,
            message: 'Signed in successfully',
            token: generateToken(user._id, `${user.firstName} ${user.lastName}`, user.email, user.mobileNumber)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Forgot Password - Send OTP
exports.forgotPassword = async (req, res) => {
    try {
        const { identifier, email, mobileNumber } = req.body;
        const searchVal = identifier || email || mobileNumber;

        if (!searchVal) {
            return res.status(400).json({
                success: false,
                message: 'Please provide registered email or mobile number'
            });
        }

        const user = await findUserByIdentifier(searchVal);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'No account found with the provided email or mobile number'
            });
        }

        // Generate OTP and 10-minute expiry
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        user.resetPasswordOTP = otp;
        user.resetPasswordOTPExpires = otpExpires;
        await user.save();

        // Dispatch OTP via Email & SMS
        await sendOTP(user, otp, 'Forgot Password');

        res.status(200).json({
            success: true,
            message: 'OTP has been sent to your registered email',
            // Masked details for UI confirmation
            data: {
                email: user.email ? user.email.replace(/(.{2})(.*)(?=@)/, '$1***') : null,
                mobileNumber: user.mobileNumber ? String(user.mobileNumber).slice(-4).padStart(String(user.mobileNumber).length, '*') : null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Verify Forgot Password OTP
exports.verifyOTP = async (req, res) => {
    try {
        const { identifier, email, mobileNumber, otp } = req.body;
        const searchVal = identifier || email || mobileNumber;

        if (!searchVal) {
            return res.status(400).json({ success: false, message: 'Please provide email or mobile number' });
        }

        if (!otp) {
            return res.status(400).json({ success: false, message: 'Please provide OTP' });
        }

        const user = await findUserByIdentifier(searchVal);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
            return res.status(400).json({ success: false, message: 'No OTP request found. Please request a new OTP' });
        }

        if (new Date() > new Date(user.resetPasswordOTPExpires)) {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP' });
        }

        if (user.resetPasswordOTP !== String(otp).trim()) {
            return res.status(400).json({ success: false, message: 'Invalid OTP. Please check and try again' });
        }

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Verify Registration OTP
exports.verifyRegistrationOTP = async (req, res) => {
    try {
        const { identifier, email, mobileNumber, otp } = req.body;
        const searchVal = identifier || email || mobileNumber;

        if (!searchVal) {
            return res.status(400).json({ success: false, message: 'Please provide email or mobile number' });
        }

        if (!otp) {
            return res.status(400).json({ success: false, message: 'Please provide OTP' });
        }

        const user = await findUserByIdentifier(searchVal);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.isVerified) {
            return res.status(400).json({ success: false, message: 'Account is already verified' });
        }

        if (!user.registrationOTP || !user.registrationOTPExpires) {
            return res.status(400).json({ success: false, message: 'No registration OTP found. Please request a new OTP' });
        }

        if (new Date() > new Date(user.registrationOTPExpires)) {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP' });
        }

        if (user.registrationOTP !== String(otp).trim()) {
            return res.status(400).json({ success: false, message: 'Invalid OTP. Please check and try again' });
        }

        user.isVerified = true;
        user.registrationOTP = null;
        user.registrationOTPExpires = null;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Account verified successfully. You can now sign in.'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Resend Registration OTP
exports.resendRegistrationOTP = async (req, res) => {
    try {
        const { identifier, email, mobileNumber } = req.body;
        const searchVal = identifier || email || mobileNumber;

        if (!searchVal) {
            return res.status(400).json({ success: false, message: 'Please provide email or mobile number' });
        }

        const user = await findUserByIdentifier(searchVal);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.isVerified) {
            return res.status(400).json({ success: false, message: 'Account is already verified' });
        }

        await sendRegistrationOTP(user);

        res.status(200).json({
            success: true,
            message: 'A new registration OTP has been sent to your registered email/mobile.'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Reset Password using OTP
exports.resetPassword = async (req, res) => {    try {
        const { identifier, email, mobileNumber, otp, newPassword } = req.body;
        const searchVal = identifier || email || mobileNumber;

        if (!searchVal) {
            return res.status(400).json({ success: false, message: 'Please provide email or mobile number' });
        }

        if (!otp) {
            return res.status(400).json({ success: false, message: 'Please provide OTP' });
        }

        if (!newPassword) {
            return res.status(400).json({ success: false, message: 'Please provide new password' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
        }

        const user = await findUserByIdentifier(searchVal);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
            return res.status(400).json({ success: false, message: 'No active OTP found. Please request a new OTP' });
        }

        if (new Date() > new Date(user.resetPasswordOTPExpires)) {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP' });
        }

        if (user.resetPasswordOTP !== String(otp).trim()) {
            return res.status(400).json({ success: false, message: 'Invalid OTP. Please check and try again' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        // Clear OTP fields
        user.resetPasswordOTP = null;
        user.resetPasswordOTPExpires = null;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password reset successfully. You can now sign in with your new password'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Authenticated: Send OTP for Change Password
exports.sendChangePasswordOTP = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Generate OTP and 10-minute expiry
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        user.changePasswordOTP = otp;
        user.changePasswordOTPExpires = otpExpires;
        await user.save();

        // Dispatch OTP via Email & SMS
        await sendOTP(user, otp, 'Change Password');

        res.status(200).json({
            success: true,
            message: 'OTP sent to your registered email for password change'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Authenticated: Change Password (with Current Password and/or OTP Verification)
exports.changePassword = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
        const { currentPassword, newPassword, otp } = req.body;

        if (!newPassword) {
            return res.status(400).json({ success: false, message: 'Please provide new password' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Validate identity via Current Password or OTP
        if (currentPassword) {
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'Current password is incorrect' });
            }
        } else if (otp || user.changePasswordOTP) {
            if (!otp) {
                return res.status(400).json({ success: false, message: 'Please provide the OTP sent to your email/mobile' });
            }

            if (!user.changePasswordOTP || !user.changePasswordOTPExpires) {
                return res.status(400).json({ success: false, message: 'No active OTP found. Please request a new OTP' });
            }

            if (new Date() > new Date(user.changePasswordOTPExpires)) {
                return res.status(400).json({ success: false, message: 'Change password OTP has expired. Please request a new OTP' });
            }

            if (user.changePasswordOTP !== String(otp).trim()) {
                return res.status(400).json({ success: false, message: 'Invalid OTP' });
            }
        } else {
            return res.status(400).json({ success: false, message: 'Please provide current password or request an OTP to change password' });
        }

        // Hash and update new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        // Clear Change Password OTP fields
        user.changePasswordOTP = null;
        user.changePasswordOTPExpires = null;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};