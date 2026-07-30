const nodemailer = require('nodemailer');

/**
 * Generate a 6-digit numerical OTP
 */
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP via Email using Nodemailer (with console fallback if SMTP is not configured)
 */
const sendOTPEmail = async (email, otp, purpose = 'Password Reset') => {
    const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_HOST;
    const smtpPort = process.env.SMTP_PORT || process.env.EMAIL_PORT || 465;
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    const fromEmail = process.env.EMAIL_FROM || smtpUser || '"Checklist App" <avinashmarbhal1994@outlook.com>';

    if (smtpHost && smtpUser && smtpPass) {
        try {
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: Number(smtpPort),
                // secure: Number(smtpPort) === 465,
                secure: true,
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                }
            });

            const mailOptions = {
                from: fromEmail,
                to: email,
                subject: `Your ${purpose} Verification Code`,
                html: `
                    <div style="font-family: Verdana, sans-serif; padding: 20px; color: #333; max-width: 500px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
                        <h2 style="color: #4F46E5; text-align: center;">Checklist App - ${purpose} Verification Code</h2>
                        <p>Hello,</p>
                        <p>You requested a verification code for <strong>${purpose}</strong>.</p>
                        <div style="background-color: #F3F4F6; padding: 15px; text-align: center; border-radius: 6px; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #1F2937; margin: 20px 0;">
                            ${otp}
                        </div>
                        <p style="color: #6B7280; font-size: 14px;">This code is valid for 10 minutes. Please do not share this code with anyone.</p>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            // console.log(`[OTP Service] Email sent successfully to ${email}`);
            return true;
        } catch (error) {
            console.error(`[OTP Service Error] Failed to send email to ${email}:`, error.message);
            // Fall back to logging OTP in console so user testing is not blocked
            // console.log(`[OTP Fallback Log] Email OTP for ${email} (${purpose}): ${otp}`);
            return false;
        }
    } else {
        // console.log(`[OTP Dev Log] SMTP credentials not configured. OTP for ${email} (${purpose}): ${otp}`);
        return true;
    }
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
    const emailSent = user.email ? await sendOTPEmail(user.email, otp, purpose) : false;
    const smsSent = user.mobileNumber ? await sendOTPSMS(user.mobileNumber, otp, purpose) : false;
    return { emailSent, smsSent };
};

module.exports = {
    generateOTP,
    sendOTPEmail,
    sendOTPSMS,
    sendOTP
};
