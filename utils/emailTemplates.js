// Email template types
export const EmailType = {
    VERIFY_OTP: 'VERIFY_OTP',
    RESET_PASSWORD_OTP: 'RESET_PASSWORD_OTP',
    WELCOME: 'WELCOME',
    PASSWORD_CHANGED: 'PASSWORD_CHANGED'
};

// Email templates with ObjectX branding
export const EMAIL_TEMPLATES = (payload, key) => {
    const values = {
        [EmailType.VERIFY_OTP]: {
            subject: 'Verify Your Email - ObjectX Innovatech',
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email - ObjectX Innovatech</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; background: linear-gradient(135deg, #1e2a78 0%, #6b46c1 100%); margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 15px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1e2a78 0%, #6b46c1 100%); padding: 30px 20px; text-align: center; }
        .logo { color: #ffffff; font-size: 28px; font-weight: bold; margin-bottom: 10px; }
        .logo-accent { color: #fbbf24; }
        .tagline { color: #e5e7eb; font-size: 14px; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 24px; color: #1e2a78; margin-bottom: 20px; font-weight: 600; }
        .message { color: #4b5563; line-height: 1.6; margin-bottom: 30px; font-size: 16px; }
        .otp-container { background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border-radius: 12px; padding: 25px; text-align: center; margin: 30px 0; border: 2px dashed #6b46c1; }
        .otp-label { color: #6b46c1; font-size: 14px; font-weight: 600; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }
        .otp-code { font-size: 36px; font-weight: bold; color: #1e2a78; letter-spacing: 8px; font-family: 'Courier New', monospace; margin: 10px 0; }
        .otp-note { color: #6b7280; font-size: 12px; margin-top: 10px; }
        .warning { background: #fef3cd; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .warning-text { color: #92400e; font-size: 14px; }
        .footer { background: #f9fafb; padding: 25px; text-align: center; border-top: 1px solid #e5e7eb; }
        .footer-text { color: #6b7280; font-size: 14px; line-height: 1.5; }
        .support-link { color: #6b46c1; text-decoration: none; font-weight: 600; }
        .support-link:hover { color: #1e2a78; }
        .tech-elements { position: relative; }
        .tech-circle { position: absolute; width: 60px; height: 60px; border: 2px solid #e5e7eb; border-radius: 50%; opacity: 0.1; }
        .tech-circle-1 { top: -30px; right: -30px; }
        .tech-circle-2 { bottom: -30px; left: -30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="tech-elements">
                <div class="tech-circle tech-circle-1"></div>
                <div class="tech-circle tech-circle-2"></div>
            </div>
            <div class="logo">
                Object<span class="logo-accent">X</span> Innovatech
            </div>
            <div class="tagline">The Future of Virtual Reality</div>
        </div>
        
        <div class="content">
            <div class="greeting">
                Hello ${payload.name}! 👋
            </div>
            
            <div class="message">
                Welcome to ObjectX Innovatech! We're excited to have you join our community of innovators and VR enthusiasts. To complete your registration and unlock access to our cutting-edge virtual reality platform, please verify your email address.
            </div>
            
            <div class="otp-container">
                <div class="otp-label">Your Verification Code</div>
                <div class="otp-code">${payload.otp}</div>
                <div class="otp-note">This code will expire in 10 minutes</div>
            </div>
            
            <div class="message">
                Enter this verification code in your registration form to activate your account. Once verified, you'll have access to:
            </div>
            
            <ul style="color: #4b5563; margin-left: 20px; line-height: 1.8;">
                <li>Immersive VR experiences and simulations</li>
                <li>Educational and training modules</li>
                <li>AR-enhanced learning environments</li>
                <li>Cutting-edge technology resources</li>
            </ul>
            
            <div class="warning">
                <div class="warning-text">
                    <strong>Security Note:</strong> If you didn't request this verification code, please ignore this email. Never share your verification code with anyone.
                </div>
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-text">
                Need help? Our support team is here for you!<br>
                Contact us at <a href="mailto:support@objectx.in" class="support-link">support@objectx.in</a>
            </div>
            <div class="footer-text" style="margin-top: 15px; font-size: 12px;">
                <strong>ObjectX Innovatech</strong><br>
                Innovating Tomorrow's Virtual Experiences
            </div>
        </div>
    </div>
</body>
</html>`
        },

        [EmailType.RESET_PASSWORD_OTP]: {
            subject: 'Reset Your Password - ObjectX Innovatech',
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password - ObjectX Innovatech</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; background: linear-gradient(135deg, #1e2a78 0%, #6b46c1 100%); margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 15px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1e2a78 0%, #6b46c1 100%); padding: 30px 20px; text-align: center; }
        .logo { color: #ffffff; font-size: 28px; font-weight: bold; margin-bottom: 10px; }
        .logo-accent { color: #fbbf24; }
        .tagline { color: #e5e7eb; font-size: 14px; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 24px; color: #1e2a78; margin-bottom: 20px; font-weight: 600; }
        .message { color: #4b5563; line-height: 1.6; margin-bottom: 30px; font-size: 16px; }
        .otp-container { background: linear-gradient(135deg, #fef3cd 0%, #fed7aa 100%); border-radius: 12px; padding: 25px; text-align: center; margin: 30px 0; border: 2px solid #f59e0b; }
        .otp-label { color: #92400e; font-size: 14px; font-weight: 600; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }
        .otp-code { font-size: 36px; font-weight: bold; color: #92400e; letter-spacing: 8px; font-family: 'Courier New', monospace; margin: 10px 0; }
        .otp-note { color: #a16207; font-size: 12px; margin-top: 10px; }
        .warning { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .warning-text { color: #dc2626; font-size: 14px; }
        .footer { background: #f9fafb; padding: 25px; text-align: center; border-top: 1px solid #e5e7eb; }
        .footer-text { color: #6b7280; font-size: 14px; line-height: 1.5; }
        .support-link { color: #6b46c1; text-decoration: none; font-weight: 600; }
        .support-link:hover { color: #1e2a78; }
        .security-icon { font-size: 48px; margin-bottom: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                Object<span class="logo-accent">X</span> Innovatech
            </div>
            <div class="tagline">The Future of Virtual Reality</div>
        </div>
        
        <div class="content">
            <div style="text-align: center;">
                <div class="security-icon">🔐</div>
            </div>
            
            <div class="greeting">
                Password Reset Request
            </div>
            
            <div class="message">
                Hello ${payload.name},<br><br>
                We received a request to reset your password for your ObjectX Innovatech account. To proceed with resetting your password, please use the verification code below.
            </div>
            
            <div class="otp-container">
                <div class="otp-label">Password Reset Code</div>
                <div class="otp-code">${payload.otp}</div>
                <div class="otp-note">This code will expire in 10 minutes</div>
            </div>
            
            <div class="message">
                Enter this code in the password reset form to create a new password for your account.
            </div>
            
            <div class="warning">
                <div class="warning-text">
                    <strong>Important:</strong> If you didn't request this password reset, please ignore this email and contact our support team immediately. Your account security is our priority.
                </div>
            </div>
            
            <div class="message">
                For your security, this verification code can only be used once and will expire automatically.
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-text">
                Need help? Our support team is here for you!<br>
                Contact us at <a href="mailto:support@objectx.in" class="support-link">support@objectx.in</a>
            </div>
            <div class="footer-text" style="margin-top: 15px; font-size: 12px;">
                <strong>ObjectX Innovatech</strong><br>
                Innovating Tomorrow's Virtual Experiences
            </div>
        </div>
    </div>
</body>
</html>`
        },

        [EmailType.WELCOME]: {
            subject: 'Welcome to ObjectX Innovatech - Your VR Journey Begins!',
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ObjectX Innovatech</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; background: linear-gradient(135deg, #1e2a78 0%, #6b46c1 100%); margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 15px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1e2a78 0%, #6b46c1 100%); padding: 30px 20px; text-align: center; }
        .logo { color: #ffffff; font-size: 28px; font-weight: bold; margin-bottom: 10px; }
        .logo-accent { color: #fbbf24; }
        .tagline { color: #e5e7eb; font-size: 14px; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 24px; color: #1e2a78; margin-bottom: 20px; font-weight: 600; }
        .message { color: #4b5563; line-height: 1.6; margin-bottom: 20px; font-size: 16px; }
        .feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0; }
        .feature-item { background: #f8fafc; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #e2e8f0; }
        .feature-icon { font-size: 32px; margin-bottom: 10px; }
        .feature-title { color: #1e2a78; font-weight: 600; margin-bottom: 8px; }
        .feature-desc { color: #64748b; font-size: 14px; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #1e2a78 0%, #6b46c1 100%); color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
        .footer { background: #f9fafb; padding: 25px; text-align: center; border-top: 1px solid #e5e7eb; }
        .footer-text { color: #6b7280; font-size: 14px; line-height: 1.5; }
        .support-link { color: #6b46c1; text-decoration: none; font-weight: 600; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                Object<span class="logo-accent">X</span> Innovatech
            </div>
            <div class="tagline">The Future of Virtual Reality</div>
        </div>
        
        <div class="content">
            <div class="greeting">
                Welcome to the Future, ${payload.name}! 🚀
            </div>
            
            <div class="message">
                Congratulations! Your email has been verified and your ObjectX Innovatech account is now active. You're now part of an exclusive community that's shaping the future of virtual reality and immersive technologies.
            </div>
            
            <div class="feature-grid">
                <div class="feature-item">
                    <div class="feature-icon">🥽</div>
                    <div class="feature-title">VR Experiences</div>
                    <div class="feature-desc">Immersive virtual reality simulations</div>
                </div>
                <div class="feature-item">
                    <div class="feature-icon">🎓</div>
                    <div class="feature-title">Education</div>
                    <div class="feature-desc">AR-enhanced learning environments</div>
                </div>
                <div class="feature-item">
                    <div class="feature-icon">🏥</div>
                    <div class="feature-title">Healthcare</div>
                    <div class="feature-desc">Medical training simulations</div>
                </div>
                <div class="feature-item">
                    <div class="feature-icon">🏭</div>
                    <div class="feature-title">Industry</div>
                    <div class="feature-desc">Manufacturing & engineering solutions</div>
                </div>
            </div>
            
            <div class="message">
                Ready to explore endless possibilities? Start your journey into virtual worlds where innovation meets imagination.
            </div>
            
            <div style="text-align: center;">
                <a href="${payload.dashboardUrl || '#'}" class="cta-button">
                    Start Exploring VR
                </a>
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-text">
                Need help getting started?<br>
                Contact us at <a href="mailto:support@objectx.in" class="support-link">support@objectx.in</a>
            </div>
            <div class="footer-text" style="margin-top: 15px; font-size: 12px;">
                <strong>ObjectX Innovatech</strong><br>
                Innovating Tomorrow's Virtual Experiences
            </div>
        </div>
    </div>
</body>
</html>`
        },

        [EmailType.PASSWORD_CHANGED]: {
            subject: 'Password Successfully Changed - ObjectX Innovatech',
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Changed - ObjectX Innovatech</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; background: linear-gradient(135deg, #1e2a78 0%, #6b46c1 100%); margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 15px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1e2a78 0%, #6b46c1 100%); padding: 30px 20px; text-align: center; }
        .logo { color: #ffffff; font-size: 28px; font-weight: bold; margin-bottom: 10px; }
        .logo-accent { color: #fbbf24; }
        .content { padding: 40px 30px; }
        .success-icon { text-align: center; font-size: 64px; margin-bottom: 20px; }
        .greeting { font-size: 24px; color: #059669; margin-bottom: 20px; font-weight: 600; text-align: center; }
        .message { color: #4b5563; line-height: 1.6; margin-bottom: 20px; font-size: 16px; }
        .info-box { background: #d1fae5; border-left: 4px solid #059669; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .info-text { color: #065f46; font-size: 14px; }
        .footer { background: #f9fafb; padding: 25px; text-align: center; border-top: 1px solid #e5e7eb; }
        .footer-text { color: #6b7280; font-size: 14px; line-height: 1.5; }
        .support-link { color: #6b46c1; text-decoration: none; font-weight: 600; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                Object<span class="logo-accent">X</span> Innovatech
            </div>
        </div>
        
        <div class="content">
            <div class="success-icon">✅</div>
            
            <div class="greeting">
                Password Successfully Changed
            </div>
            
            <div class="message">
                Hello ${payload.name},<br><br>
                Your password has been successfully updated for your ObjectX Innovatech account. This change was made on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}.
            </div>
            
            <div class="info-box">
                <div class="info-text">
                    <strong>Security Tip:</strong> Keep your password secure and never share it with anyone. We recommend using a strong, unique password for your ObjectX account.
                </div>
            </div>
            
            <div class="message">
                If you didn't make this change, please contact our support team immediately at support@objectx.in.
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-text">
                Need help? Contact us at <a href="mailto:support@objectx.in" class="support-link">support@objectx.in</a>
            </div>
        </div>
    </div>
</body>
</html>`
        }
    };

    return values[key];
};