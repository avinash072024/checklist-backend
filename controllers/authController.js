const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (id, name, email, mobileNumber) => {
    return jwt.sign({ id, name, email, mobileNumber }, process.env.JWT_SECRET || 'secret123', {
        expiresIn: '30d',
    });
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
            return res.status(400).json({ success: false, message: 'Password number is required' });
        }

        // Check if email & mobileNumber already exists
        const existingUser = await User.findOne({
            $or: [
                { email },
                { mobileNumber }
            ]
        });

        if (existingUser) {
            if (existingUser.email === email) {
                return res.status(400).json({
                    success: false,
                    message: 'User with this email already exists'
                });
            }

            if (existingUser.mobileNumber === mobileNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'User with this mobile number already exists'
                });
            }
        }

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Save to DB
        const user = await User.create({
            firstName,
            lastName,
            email,
            mobileNumber,
            password: hashedPassword
        });

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token: generateToken(user._id, `${user.firstName} ${user.lastName}`, user.email, user.mobileNumber)
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

        const user = await User.findOne({ mobileNumber });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid credentials. Please try again' });
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