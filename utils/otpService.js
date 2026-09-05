const nodemailer = require('nodemailer');

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const getSmtpConfig = () => {
    const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_HOST;
    const smtpPort = process.env.SMTP_PORT || process.env.EMAIL_PORT || 465;
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    const fromEmail = process.env.EMAIL_FROM || smtpUser || '"CheckList App" <avinashmarbhal1994@gmail.com>';

    return { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail };
};

const sendEmail = async (to, subject, html) => {
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail } = getSmtpConfig();

    if (smtpHost && smtpUser && smtpPass) {
        // Strip any surrounding quotes that dotenv may include on Windows
        const sanitizedFrom = fromEmail.replace(/^"|"$/g, '').trim();

        try {
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: Number(smtpPort),
                secure: Number(smtpPort) === 465,
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            // Verify SMTP connection/auth before sending
            await transporter.verify();

            await transporter.sendMail({
                from: sanitizedFrom,
                to,
                subject,
                html
            });

            console.log(`[Email Service] Email sent successfully to ${to}`);
            return true;
        } catch (error) {
            console.error(`[Email Service Error] Failed to send email to ${to}:`, error.message || error);
            console.error(`[Email Service Error] SMTP Config — Host: ${smtpHost}, Port: ${smtpPort}, User: ${smtpUser}`);
            return false;
        }
    }

    console.log(`[Email Service Dev Log] SMTP not configured. Email to ${to} with subject "${subject}" was skipped.`);
    return true;
};

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

const sendOTPSMS = async (mobileNumber, otp, purpose = 'Password Reset') => {
    return true;
};

const sendOTP = async (user, otp, purpose = 'Password Reset') => {
    const emailSent = user.email ? await sendOTPEmail(user.email, otp, purpose, user.firstName) : false;
    const smsSent = user.mobileNumber ? await sendOTPSMS(user.mobileNumber, otp, purpose) : false;
    return { emailSent, smsSent };
};

// Helper to safely extract a display name from a user object or Mongoose document
const getUserName = (userRef, fallback = 'Unknown') => {
    if (!userRef) return fallback;
    // If it's a Mongoose document, convert to plain object with virtuals
    const u = typeof userRef.toObject === 'function'
        ? userRef.toObject({ virtuals: true })
        : userRef;
    // Resolve fullname: virtual field (if present), or concatenate first+last, or email
    const fullname = u.fullname
        || `${u.firstName || ''} ${u.lastName || ''}`.trim()
        || u.email
        || fallback;
    return fullname || fallback;
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendChecklistDeletionEmail = async (user, checklist) => {
    // Resolve recipient email — handle both Mongoose doc and plain object
    const recipientEmail = (user && typeof user.toObject === 'function'
        ? user.toObject({ virtuals: true })
        : user
    )?.email;

    if (!recipientEmail) {
        console.warn(`[Email Service] Cannot send checklist deletion email: recipient email is missing.`);
        return false;
    }

    // Resolve names from the ORIGINAL Mongoose-populated docs BEFORE calling toObject(),
    // because nested populated docs inside array subdocuments (listItems.createdBy / completedBy)
    // may not carry the 'fullname' virtual after serialization in all Mongoose versions.
    const frozenByName = getUserName(checklist.frozenBy, 'System');

    // Pre-resolve each list-item's user display names while still Mongoose documents
    const resolvedItems = Array.isArray(checklist.listItems)
        ? checklist.listItems.map(item => ({
            text: item.text,
            completed: item.completed,
            createdByName: getUserName(item.createdBy, 'Unknown'),
            completedByName: item.completedBy
                ? getUserName(item.completedBy, 'System')
                : (item.completed ? 'System' : 'Pending')
        }))
        : [];

    // Now safely convert to a plain object for metadata fields
    const checklistData = typeof checklist.toObject === 'function'
        ? checklist.toObject({ virtuals: true })
        : checklist;

    const title = checklistData.title || 'Untitled checklist';
    const subject = `Checklist Deleted: ${title}`;

    const createdDate = checklistData.createdAt
        ? new Date(checklistData.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'N/A';
    const frozenDate = checklistData.frozenAt
        ? new Date(checklistData.frozenAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'N/A';

    let itemsHtml = '';
    if (resolvedItems.length > 0) {
        itemsHtml = `
            <style>
                @media (prefers-color-scheme: dark) {
                    .email-wrapper { background-color: #111827 !important; }
                    .email-table { background-color: #111827 !important; border-color: #374151 !important; }
                    .email-th { background-color: #1F2937 !important; color: #F9FAFB !important; border-color: #374151 !important; }
                    .email-th th { border-color: #374151 !important; color: #F9FAFB !important; }
                    .email-tr-even { background-color: #1F2937 !important; border-bottom: 1px solid #374151 !important; }
                    .email-tr-odd { background-color: #111827 !important; border-bottom: 1px solid #374151 !important; }
                    .email-td { border-color: #374151 !important; }
                    .email-td-text { color: #F3F4F6 !important; }
                    .email-td-sub { color: #9CA3AF !important; }
                    .email-td-completed { color: #9CA3AF !important; }
                    .email-td-pending { color: #F87171 !important; }
                }
            </style>
            <div class="email-wrapper" style="width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 15px;">
                <table class="email-table" style="width: 100%; min-width: 320px; table-layout: fixed; border-collapse: collapse; background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 6px; overflow: hidden;">
                    <thead>
                        <tr class="email-th" style="background-color: #F3F4F6; border-bottom: 2px solid #E5E7EB; text-align: left;">
                            <th style="width: 40%; padding: 10px; color: #374151; font-size: 13px; font-weight: 600; border-right: 1px solid #E5E7EB;">Item&nbsp;Name</th>
                            <th style="width: 30%; padding: 10px; color: #374151; font-size: 13px; font-weight: 600; border-right: 1px solid #E5E7EB;">Created&nbsp;By</th>
                            <th style="width: 30%; padding: 10px; color: #374151; font-size: 13px; font-weight: 600;">Completed&nbsp;By</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        resolvedItems.forEach((item, index) => {
            const rowColor = index % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
            const rowClass = index % 2 === 0 ? 'email-tr-even' : 'email-tr-odd';

            const { createdByName, completedByName } = item;

            const isPending = completedByName === 'Pending';
            const completedClass = isPending ? 'email-td-pending' : 'email-td-completed';
            const completedColor = isPending ? '#EF4444' : '#6B7280';

            itemsHtml += `
                <tr class="${rowClass}" style="background-color: ${rowColor}; border-bottom: 1px solid #E5E7EB;">
                    <td class="email-td email-td-text" style="width: 40%; padding: 10px; color: #111827; font-size: 13px; word-break: break-word; overflow-wrap: break-word; border-right: 1px solid #E5E7EB;">${escapeHtml(item.text || 'Untitled item')}</td>
                    <td class="email-td email-td-sub" style="width: 30%; padding: 10px; color: #6B7280; font-size: 13px; word-break: break-word; overflow-wrap: break-word; border-right: 1px solid #E5E7EB;">${escapeHtml(createdByName)}</td>
                    <td class="email-td ${completedClass}" style="width: 30%; padding: 10px; color: ${completedColor}; font-size: 13px; word-break: break-word; overflow-wrap: break-word;">${escapeHtml(completedByName)}</td>
                </tr>
            `;
        });
        itemsHtml += `
                    </tbody>
                </table>
            </div>
        `;
    } else {
        itemsHtml = `<p style="color: #6B7280; font-size: 14px;">No items found in this checklist.</p>`;
    }

    const firstName = getUserName(user, 'there').split(' ')[0];

    const html = `
        <div style="font-family: Calibri, sans-serif; padding: 10px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #4F46E5; text-align: center;">CheckList App</h2>
            
            <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                <h3 style="color: #B91C1C; margin: 0 0 5px 0; font-size: 18px;">Automated Deletion Notice</h3>
                <p style="margin: 0; color: #7F1D1D; font-size: 14px;">Your checklist has been automatically deleted after reaching its 30-day retention period.</p>
            </div>

            <p>Hello <strong>${escapeHtml(firstName)}</strong>,</p>
            <p>This is an automated notification to inform you that your checklist <strong>"${escapeHtml(title)}"</strong> has been permanently deleted from our system.</p>
            
            <div style="background-color: #F9FAFB; padding: 10px; border-radius: 8px; margin: 25px 0; border: 1px solid #E5E7EB;">
                <h4 style="margin: 0 0 15px 0; color: #374151; font-size: 16px; border-bottom: 1px solid #E5E7EB; padding-bottom: 10px;">Checklist Summary</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 6px 0; color: #6B7280; width: 140px; font-size: 14px;">Title:</td>
                        <td style="padding: 6px 0; color: #111827; font-weight: bold; font-size: 14px;">${escapeHtml(title)}${checklistData.isPrivate ? ' (Private)' : ''}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #6B7280; font-size: 14px;">Created Date:</td>
                        <td style="padding: 6px 0; color: #111827; font-weight: bold; font-size: 14px;">${createdDate}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #6B7280; font-size: 14px;">Completed Date:</td>
                        <td style="padding: 6px 0; color: #111827; font-weight: bold; font-size: 14px;">${frozenDate}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #6B7280; font-size: 14px;">Completed By:</td>
                        <td style="padding: 6px 0; color: #111827; font-weight: bold; font-size: 14px;">${escapeHtml(frozenByName)}</td>
                    </tr>
                </table>

                <h4 style="margin: 25px 0 10px 0; color: #374151; font-size: 16px;">Checklist Items</h4>
                ${itemsHtml}
            </div>

            <p style="color: #6B7280; font-size: 14px; text-align: center;">
                Checklists are automatically removed 30 days after they are marked as completed to keep your workspace tidy.
            </p>
            
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
            
            <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
                &copy; ${new Date().getFullYear()} CheckList App. All rights reserved.
            </p>
        </div>
    `;

    return await sendEmail(recipientEmail, subject, html);
};

// Build the shared checklist-items HTML table used by both the frozen and deletion emails
const buildChecklistItemsHtml = (resolvedItems) => {
    if (!resolvedItems || resolvedItems.length === 0) {
        return `<p style="color: #6B7280; font-size: 14px;">No items found in this checklist.</p>`;
    }

    let itemsHtml = `
        <style>
            @media (prefers-color-scheme: dark) {
                .email-wrapper { background-color: #111827 !important; }
                .email-table { background-color: #111827 !important; border-color: #374151 !important; }
                .email-th { background-color: #1F2937 !important; color: #F9FAFB !important; border-color: #374151 !important; }
                .email-th th { border-color: #374151 !important; color: #F9FAFB !important; }
                .email-tr-even { background-color: #1F2937 !important; border-bottom: 1px solid #374151 !important; }
                .email-tr-odd { background-color: #111827 !important; border-bottom: 1px solid #374151 !important; }
                .email-td { border-color: #374151 !important; }
                .email-td-text { color: #F3F4F6 !important; }
                .email-td-sub { color: #9CA3AF !important; }
                .email-td-completed { color: #9CA3AF !important; }
                .email-td-pending { color: #F87171 !important; }
            }
        </style>
        <div class="email-wrapper" style="width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 15px;">
            <table class="email-table" style="width: 100%; min-width: 320px; table-layout: fixed; border-collapse: collapse; background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 6px; overflow: hidden;">
                <thead>
                    <tr class="email-th" style="background-color: #F3F4F6; border-bottom: 2px solid #E5E7EB; text-align: left;">
                        <th style="width: 40%; padding: 10px; color: #374151; font-size: 13px; font-weight: 600; border-right: 1px solid #E5E7EB;">Item&nbsp;Name</th>
                        <th style="width: 30%; padding: 10px; color: #374151; font-size: 13px; font-weight: 600; border-right: 1px solid #E5E7EB;">Created&nbsp;By</th>
                        <th style="width: 30%; padding: 10px; color: #374151; font-size: 13px; font-weight: 600;">Completed&nbsp;By</th>
                    </tr>
                </thead>
                <tbody>
    `;

    resolvedItems.forEach((item, index) => {
        const rowColor = index % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
        const rowClass = index % 2 === 0 ? 'email-tr-even' : 'email-tr-odd';

        const { createdByName, completedByName } = item;

        const isPending = completedByName === 'Pending';
        const completedClass = isPending ? 'email-td-pending' : 'email-td-completed';
        const completedColor = isPending ? '#EF4444' : '#6B7280';

        itemsHtml += `
            <tr class="${rowClass}" style="background-color: ${rowColor}; border-bottom: 1px solid #E5E7EB;">
                <td class="email-td email-td-text" style="width: 40%; padding: 10px; color: #111827; font-size: 13px; word-break: break-word; overflow-wrap: break-word; border-right: 1px solid #E5E7EB;">${escapeHtml(item.text || 'Untitled item')}</td>
                <td class="email-td email-td-sub" style="width: 30%; padding: 10px; color: #6B7280; font-size: 13px; word-break: break-word; overflow-wrap: break-word; border-right: 1px solid #E5E7EB;">${escapeHtml(createdByName)}</td>
                <td class="email-td ${completedClass}" style="width: 30%; padding: 10px; color: ${completedColor}; font-size: 13px; word-break: break-word; overflow-wrap: break-word;">${escapeHtml(completedByName)}</td>
            </tr>
        `;
    });

    itemsHtml += `
                </tbody>
            </table>
        </div>
    `;

    return itemsHtml;
};

// Resolve creator/frozen-by names and per-item names from a populated (Mongoose) checklist doc,
// BEFORE calling toObject(), so nested populated subdocuments keep their 'fullname' virtual.
const resolveChecklistEmailData = (checklist) => {
    const createdByName = getUserName(checklist.createdBy, 'Unknown');
    const frozenByName = getUserName(checklist.frozenBy, 'System');

    const resolvedItems = Array.isArray(checklist.listItems)
        ? checklist.listItems.map(item => ({
            text: item.text,
            completed: item.completed,
            createdByName: getUserName(item.createdBy, 'Unknown'),
            completedByName: item.completedBy
                ? getUserName(item.completedBy, 'System')
                : (item.completed ? 'System' : 'Pending')
        }))
        : [];

    const checklistData = typeof checklist.toObject === 'function'
        ? checklist.toObject({ virtuals: true })
        : checklist;

    return { createdByName, frozenByName, resolvedItems, checklistData };
};

// Send checklist details to the checklist creator's email when the checklist is frozen (marked completed)
const sendChecklistFrozenEmail = async (user, checklist) => {
    // Resolve recipient email — handle both Mongoose doc and plain object
    const recipientEmail = (user && typeof user.toObject === 'function'
        ? user.toObject({ virtuals: true })
        : user
    )?.email;

    if (!recipientEmail) {
        console.warn(`[Email Service] Cannot send checklist frozen email: creator email is missing.`);
        return false;
    }

    const { createdByName, frozenByName, resolvedItems, checklistData } = resolveChecklistEmailData(checklist);

    const title = checklistData.title || 'Untitled checklist';
    const subject = `Checklist Completed: ${title}`;
    const totalItems = resolvedItems.length;

    const frozenDate = checklistData.frozenAt
        ? new Date(checklistData.frozenAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'N/A';

    const itemsHtml = buildChecklistItemsHtml(resolvedItems);
    const firstName = getUserName(user, 'there').split(' ')[0];

    const html = `
        <div style="font-family: Calibri, sans-serif; padding: 10px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #4F46E5; text-align: center;">CheckList App</h2>

            <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                <h3 style="color: #047857; margin: 0 0 5px 0; font-size: 18px;">Checklist Completed</h3>
                <p style="margin: 0; color: #065F46; font-size: 14px;">Your checklist has been marked as completed and is now frozen.</p>
            </div>

            <p>Hello <strong>${escapeHtml(firstName)}</strong>,</p>
            <p>Here are the details of your checklist <strong>"${escapeHtml(title)}"</strong>.</p>

            <div style="background-color: #F9FAFB; padding: 10px; border-radius: 8px; margin: 25px 0; border: 1px solid #E5E7EB;">
                <h4 style="margin: 0 0 15px 0; color: #374151; font-size: 16px; border-bottom: 1px solid #E5E7EB; padding-bottom: 10px;">Checklist Summary</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 6px 0; color: #6B7280; width: 160px; font-size: 14px;">Checklist Name:</td>
                        <td style="padding: 6px 0; color: #111827; font-weight: bold; font-size: 14px;">${escapeHtml(title)}${checklistData.isPrivate ? ' (Private)' : ''}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #6B7280; font-size: 14px;">Created By:</td>
                        <td style="padding: 6px 0; color: #111827; font-weight: bold; font-size: 14px;">${escapeHtml(createdByName)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #6B7280; font-size: 14px;">Total Items:</td>
                        <td style="padding: 6px 0; color: #111827; font-weight: bold; font-size: 14px;">${totalItems}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #6B7280; font-size: 14px;">Frozen By:</td>
                        <td style="padding: 6px 0; color: #111827; font-weight: bold; font-size: 14px;">${escapeHtml(frozenByName)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #6B7280; font-size: 14px;">Frozen Date:</td>
                        <td style="padding: 6px 0; color: #111827; font-weight: bold; font-size: 14px;">${frozenDate}</td>
                    </tr>
                </table>

                <h4 style="margin: 25px 0 10px 0; color: #374151; font-size: 16px;">Checklist Items</h4>
                ${itemsHtml}
            </div>

            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">

            <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
                &copy; ${new Date().getFullYear()} CheckList App. All rights reserved.
            </p>
        </div>
    `;

    return await sendEmail(recipientEmail, subject, html);
};

module.exports = {
    generateOTP,
    sendEmail,
    sendOTPEmail,
    sendOTPSMS,
    sendOTP,
    sendRegistrationSuccessEmail,
    sendChecklistDeletionEmail,
    sendChecklistFrozenEmail
};