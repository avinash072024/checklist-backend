const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email address is required'],
        unique: true,
        lowercase: true,
        trim: true
    },
    mobileNumber: {
        type: Number,
        required: [true, 'Mobile number is required'],
        trim: true
    },
    password: {
        type: String,
        required: [true, 'Password is required']
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    registrationOTP: {
        type: String,
        default: null
    },
    registrationOTPExpires: {
        type: Date,
        default: null
    },
    resetPasswordOTP: {
        type: String,
        default: null
    },
    resetPasswordOTPExpires: {
        type: Date,
        default: null
    },
    changePasswordOTP: {
        type: String,
        default: null
    },
    changePasswordOTPExpires: {
        type: Date,
        default: null
    }
}, { timestamps: true });

userSchema.virtual('fullname').get(function () {
    return `${this.firstName || ''} ${this.lastName || ''}`.trim();
});

// Ensure virtual fields are serialized when converting mongoose docs to JSON/Object
userSchema.set('toObject', { virtuals: true });
userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', userSchema);