const nodemailer = require('nodemailer');

/**
 * Generate a 6-digit numerical OTP
 */
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const getSmtpConfig = () => {
    const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_HOST;
    const smtpPort = process.env.SMTP_PORT || process.env.EMAIL_PORT || 465;
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    const fromEmail = process.env.EMAIL_FROM || smtpUser || '"CheckList App" <avinashmarbhal1994@outlook.com>';

    return { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail };
};

const sendEmail = async (to, subject, html) => {
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail } = getSmtpConfig();

    if (smtpHost && smtpUser && smtpPass) {
        try {
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: Number(smtpPort),
                secure: Number(smtpPort) === 465,
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                }
            });

            await transporter.sendMail({
                from: fromEmail,
                to,
                subject,
                html
            });

            return true;
        } catch (error) {
            console.error(`[Email Service Error] Failed to send email to ${to}:`, error.message);
            return false;
        }
    }

    console.log(`[Email Service Dev Log] SMTP not configured. Email to ${to} with subject "${subject}" was skipped.`);
    return true;
};

/**
 * Send OTP via Email using Nodemailer (with console fallback if SMTP is not configured)
 */
const sendOTPEmail = async (email, otp, purpose = 'Password Reset', firstName = '') => {
    const subject = `${purpose} Verification Code`;
    const greetingName = firstName ? ` ${firstName}` : '';
    const html = `
        <div style="font-family: Calibri, sans-serif; padding: 20px; color: #333; max-width: 500px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #4F46E5; text-align: center;">CheckList App</h2>
            <h3 style="color: #4F46E5; text-align: center;">${purpose} Verification Code</h3>
            <p>Hello${greetingName},</p>
            <p>You requested a verification code for <strong>${purpose}</strong>.</p>
            <div style="background-color: #F3F4F6; padding: 15px; text-align: center; border-radius: 6px; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #1F2937; margin: 20px 0;">
                ${otp}
            </div>
            <p style="color: #6B7280; font-size: 14px;">This code is valid for 10 minutes. Please do not share this code with anyone.</p>
        </div>
    `;

    return await sendEmail(email, subject, html);
};

const sendRegistrationSuccessEmail = async (user, password) => {
    if (!user.email) {
        return false;
    }

    const subject = 'Registration Successful - CheckList App';
    const passwordSection = password
        ? `<li><strong>Password:</strong> ${password}</li>`
        : `<li><strong>Password:</strong> ${password}</li>`;

    const html = `
        <div style="font-family: Calibri, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #4F46E5; text-align: center;">CheckList App</h2>
            <h3 style="color: #4F46E5; text-align: center;">Registration Successful</h3>
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Thank you for registering with CheckList App. Your account has been verified successfully.</p>
            <h4>Your login details</h4>
            <ul style="color: #374151; font-size: 15px;">
                <li><strong>Email:</strong> ${user.email}</li>
                <li><strong>Mobile:</strong> ${user.mobileNumber || 'Not provided'}</li>
                ${passwordSection}
            </ul>
            <p>Please keep this email safe. Use these credentials to sign in to CheckList App.</p>
            <p style="color: #6B7280; font-size: 14px;">If you did not sign up for this account, please contact support immediately.</p>
        </div>
    `;

    return await sendEmail(user.email, subject, html);
};

/**
 * Send OTP via SMS (Logs to console for dev/testing, ready for Twilio/SMS API)
 */
const sendOTPSMS = async (mobileNumber, otp, purpose = 'Password Reset') => {
    // In production, integrate Twilio, Fast2SMS, MSG91, or your SMS provider here
    // console.log(`[OTP SMS Log] Mobile: ${mobileNumber} | Purpose: ${purpose} | OTP: ${otp}`);
    return true;
};

/**
 * Dispatch OTP via registered Email and Mobile
 */
const sendOTP = async (user, otp, purpose = 'Password Reset') => {
    const emailSent = user.email ? await sendOTPEmail(user.email, otp, purpose, user.firstName) : false;
    const smsSent = user.mobileNumber ? await sendOTPSMS(user.mobileNumber, otp, purpose) : false;
    return { emailSent, smsSent };
};

module.exports = {
    generateOTP,
    sendEmail,
    sendOTPEmail,
    sendOTPSMS,
    sendOTP,
    sendRegistrationSuccessEmail
};
