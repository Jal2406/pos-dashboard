// services/email.service.js
import nodemailer from 'nodemailer';
import { MailSetting } from '../models/index.js';

class EmailService {
  // Check if mail settings are verified and available
  static async isMailConfigured() {
    try {
      const setting = await MailSetting.findOne({ isVerified: true }).lean();
      return !!(
        setting &&
        setting.host &&
        setting.port &&
        setting.email &&
        setting.password
      );
    } catch (error) {
      console.error('Error checking mail configuration:', error);
      return false;
    }
  }

  // Get mail settings status for debugging/admin purposes
  static async getMailStatus() {
    try {
      const setting = await MailSetting.findOne({}).lean();
      if (!setting) {
        return {
          configured: false,
          verified: false,
          message: 'No mail settings found',
        };
      }

      const isComplete = !!(
        setting.host &&
        setting.port &&
        setting.email &&
        setting.password
      );
      return {
        configured: isComplete,
        verified: setting.isVerified || false,
        lastVerified: setting.lastVerifiedAt || null,
        message: isComplete
          ? setting.isVerified
            ? 'Mail settings are verified and ready'
            : 'Mail settings configured but not verified'
          : 'Mail settings incomplete',
      };
    } catch (error) {
      console.error('Error getting mail status:', error);
      return {
        configured: false,
        verified: false,
        message: 'Error checking mail status',
      };
    }
  }

  static async sendEmail(to, subject, htmlContent) {
    try {
      // Get verified mail settings from database
      const setting = await MailSetting.findOne({ isVerified: true }).lean();

      // Check if verified mail settings exist
      if (!setting) {
        throw new Error(
          'No verified mail settings found. Please configure and verify your mail settings first.',
        );
      }

      // Verify all required fields are present
      if (
        !setting.host ||
        !setting.port ||
        !setting.email ||
        !setting.password
      ) {
        throw new Error(
          'Incomplete mail settings. Please ensure all required fields are configured.',
        );
      }

      // Use verified database configuration
      const useSSL = setting.encryption === 'ssl';
      const useTLS = setting.encryption === 'tls';

      const transporterConfig = {
        host: setting.host,
        port: Number(setting.port),
        secure: useSSL, // true for 465, false for 587/25 STARTTLS
        auth: {
          user: setting.email,
          pass: setting.password,
        },
        requireTLS: useTLS || undefined,
        tls:
          setting.encryption === 'none'
            ? { rejectUnauthorized: false }
            : undefined,
      };

      const transporter = nodemailer.createTransport(transporterConfig);

      const mailOptions = {
        from: setting.email,
        to,
        subject,
        html: htmlContent,
      };

      await transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully to:', to);
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  static registrationTemplate(name, email, password) {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
            <!-- Header Section -->
            <div style="background-color: #4AC0F0; color: #ffffff; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">Welcome to Our Platform!</h1>
            </div>
            
            <!-- Body Section -->
            <div style="padding: 20px; color: #333; line-height: 1.6; background-color: #ffffff;">
                <p style="font-size: 16px;">Hello <strong>${name}</strong>,</p>
                <p style="font-size: 14px;">Congratulations! Your registration was successful. Below are your login details:</p>
                <table style="width: 100%; margin: 20px 0; border-collapse: collapse; font-size: 14px;">
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; background-color: #f1f9ff; font-weight: bold; width: 30%;">Email:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${email}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; background-color: #f1f9ff; font-weight: bold;">Password:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${password}</td>
                    </tr>
                </table>
                <p style="font-size: 13px; color: #888;">* For your security, please change your password after logging in for the first time.</p>
                <p style="margin-top: 20px; font-size: 14px;">If you have any questions or need help, feel free to contact our support team. We're here to assist you.</p>
            </div>
            
            <!-- Footer Section -->
            <div style="background-color: #f4f9ff; color: #666; text-align: center; padding: 15px; font-size: 12px; border-top: 1px solid #ddd;">
                <p style="margin: 0;">&copy; 2024 Team 1. All rights reserved.</p>
                <p style="margin: 0;">1234 Street, City, State, 56789</p>
            </div>
        </div>`;
  }

  static otptamplate(name, email, otp) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset OTP</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f4f4f4;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 2px solid #f1f1f1; border-radius: 20px; overflow: hidden;">
                            <tr>
                                <td style="background-color: #4AC0F0; color: white; padding: 30px; text-align: center;">
                                    <h1 style="margin: 0; font-size: 36px; font-weight: 700;">Reset Your Password</h1>
                                    <p style="font-size: 18px; font-weight: 400; margin: 10px 0 0 0;">We just need to verify your identity!</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 40px; color: #333; text-align: center; font-size: 18px; line-height: 1.8;">
                                    <p style="margin: 0 0 20px 0;"><span style="font-weight: 600;">Hello ${name},</span></p>
                                    <p style="margin: 0 0 30px 0;">Here is your OTP to reset your password:</p>
                                    <div style="font-size: 36px; font-weight: 700; color: #ffffff; background-color: #4AC0F0; padding: 20px 40px; display: inline-block; border-radius: 10px; margin: 20px 0;">
                                        ${otp}
                                    </div>
                                    <p style="margin: 30px 0 0 0;">Use the OTP above to proceed with your password reset.</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 20px; background-color: #f9f9f9; text-align: center;">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0;">
                                        <tr>
                                            <td style="padding: 10px; font-weight: 600; color: #4AC0F0; background-color: #f1f1f1; border-top-left-radius: 10px; width: 30%;">Email</td>
                                            <td style="padding: 10px; background-color: #f1f1f1; color: #333;">${email}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 10px; font-weight: 600; color: #4AC0F0; background-color: #f1f1f1;">OTP</td>
                                            <td style="padding: 10px; background-color: #f1f1f1; color: #333;">${otp}</td>
                                        </tr>
                                    </table>
                                    <p style="font-size: 14px; color: #888; margin: 20px 0 0 0;">If you did not request this, please ignore this message.</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="background-color: #4AC0F0; color: white; text-align: center; padding: 10px; font-size: 14px;">
                                    <p style="margin: 5px 0;">&copy; 2025 Team 1 | All Rights Reserved</p>
                                    <p style="margin: 5px 0;">Contact us: 1234 Street, City, State, 56789</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>`;
  }

  /**
   * Order confirmation email template
   * @param {Object} orderData - Order details
   * @returns {string} HTML email template
   */
  static orderConfirmationTemplate(orderData) {
    const {
      customerName,
      customerEmail,
      orderId,
      planName,
      planType,
      duration,
      amount,
      currencySymbol,
      currencyCode,
      startDate,
      endDate,
      paymentMethod,
      paymentId,
      purchaseDate,
      invoiceDownloadUrl,
      invoiceNumber,
    } = orderData;

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Order Confirmation - ${planName}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f4f4f4;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 2px solid #f1f1f1; border-radius: 20px; overflow: hidden;">
                            <!-- Header -->
                            <tr>
                                <td style="background-color: #4AC0F0; color: white; padding: 30px; text-align: center;">
                                    <h1 style="margin: 0; font-size: 28px; font-weight: 700;">Order Confirmation</h1>
                                    <p style="font-size: 16px; font-weight: 400; margin: 10px 0 0 0;">Thank you for your purchase!</p>
                                </td>
                            </tr>
                            
                            <!-- Order Details -->
                            <tr>
                                <td style="padding: 30px; color: #333;">
                                    <p style="font-size: 16px; margin: 0 0 20px 0;"><strong>Hello ${customerName},</strong></p>
                                    <p style="font-size: 14px; margin: 0 0 25px 0; color: #666;">Your subscription has been successfully activated. Here are the details of your order:</p>
                                    
                                    <!-- Order Summary -->
                                    <div style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                        <h3 style="margin: 0 0 15px 0; color: #4AC0F0; font-size: 18px;">Order Summary</h3>
                                        <table style="width: 100%; border-collapse: collapse;">
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057;">Order ID:</td>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; color: #495057;">${orderId}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057;">Plan:</td>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; color: #495057;">${planName} (${planType})</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057;">Duration:</td>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; color: #495057;">${duration} ${planType}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057;">Amount:</td>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; color: #495057; font-weight: 600;">${currencySymbol}${amount} ${currencyCode}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057;">Payment Method:</td>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; color: #495057;">${paymentMethod}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057;">Purchase Date:</td>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; color: #495057;">${purchaseDate}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057;">Subscription Start:</td>
                                                <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; color: #495057;">${startDate}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; font-weight: 600; color: #495057;">Subscription End:</td>
                                                <td style="padding: 8px 0; color: #495057;">${endDate}</td>
                                            </tr>
                                        </table>
                                    </div>
                                    
                                    <!-- Next Steps -->
                                    <div style="background-color: #e8f5e8; border: 1px solid #c3e6c3; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                        <h3 style="margin: 0 0 10px 0; color: #155724; font-size: 16px;">What's Next?</h3>
                                        <ul style="margin: 0; padding-left: 20px; color: #155724; font-size: 14px;">
                                            <li style="margin-bottom: 5px;">Your subscription is now active and ready to use</li>
                                            <li style="margin-bottom: 5px;">You can access all features included in your plan</li>
                                            <li style="margin-bottom: 5px;">We'll send you a reminder before your subscription expires</li>
                                            <li>Contact our support team if you need any assistance</li>
                                        </ul>
                                    </div>
                                    
                                    ${invoiceDownloadUrl
        ? `
                                    <!-- Invoice Download -->
                                    <div style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                        <h3 style="margin: 0 0 15px 0; color: #4AC0F0; font-size: 18px;">📄 Invoice</h3>
                                        <p style="margin: 0 0 15px 0; color: #495057; font-size: 14px;">
                                            Your invoice${invoiceNumber
          ? ` #${invoiceNumber}`
          : ''
        } is ready for download.
                                        </p>
                                        <a href="${invoiceDownloadUrl}" 
                                           style="display: inline-block; background-color: #4AC0F0; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                                            📥 Download Invoice PDF
                                        </a>
                                        <p style="margin: 10px 0 0 0; color: #6c757d; font-size: 12px;">
                                            Click the button above to download your invoice. The PDF will open in a new tab.
                                        </p>
                                    </div>
                                    `
        : ''
      }
                                    
                                    <p style="font-size: 14px; margin: 20px 0 0 0; color: #666;">If you have any questions about your order, please don't hesitate to contact our support team.</p>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #4AC0F0; color: white; text-align: center; padding: 20px; font-size: 14px;">
                                    <p style="margin: 5px 0;">&copy; 2025 Team 1 | All Rights Reserved</p>
                                    <p style="margin: 5px 0;">Contact us: 1234 Street, City, State, 56789</p>
                                    <p style="margin: 5px 0;">Email: support@example.com</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>`;
  }
}

export default EmailService;
