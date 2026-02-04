import { InvoiceSetting } from '../models/index.js';
import cloudinary from '../config/cloudinaryConfig.js';
import PDFDocument from 'pdfkit';

class InvoiceService {
  constructor() {
    this.cloudinary = cloudinary;
  }

  /**
   * Generate invoice number using invoice settings
   */
  async generateInvoiceNumber() {
    let setting = await InvoiceSetting.findOne();

    // Create default settings if none exist
    if (!setting) {
      setting = await InvoiceSetting.create({
        invoicePrefix: 'INV',
        invoiceNumberFormat: 'INV-{YEAR}-{NUMBER}',
        invoiceFooterNotes: '',
        includeTermsAndConditions: false,
        orderStart: 0,
        template: 'template1',
      });
    }

    setting.orderStart += 1;
    await setting.save();

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePart = `${year}${month}${day}`;
    const sequentialPart = String(setting.orderStart).padStart(4, '0');

    return `${setting.invoicePrefix}-${datePart}-${sequentialPart}`;
  }

  /**
   * Generate invoice data from subscription with populated data
   * @param {Object} subscription - Subscription with populated plan and user
   * @param {Object} payment - Payment data (optional)
   * @returns {Object} Invoice data
   */
  async generateInvoiceData(subscription, payment = null) {
    try {
      // Validate subscription data
      if (!subscription) {
        throw new Error('Subscription data is required');
      }

      // Get invoice settings (will create default if none exist)
      const invoiceSettings = await this.getInvoiceSettings();

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();

      // Calculate amounts with fallbacks
      const amount = subscription.amount || subscription.planName?.price || 0;
      const rawDiscount = subscription.planName?.discount || 0;
      const discountType = subscription.planName?.discountType || 'fixed';
      const planDiscount =
        discountType === 'percentage'
          ? Math.min(amount, (amount * rawDiscount) / 100)
          : rawDiscount;
      const discountedAmount = Math.max(0, amount - planDiscount);

      // Check for coupon discount from payment metadata
      let couponDiscount = 0;
      let couponCode = null;
      let taxAmount = 0;
      let finalAmount = discountedAmount;

      if (payment && payment.metadata && payment.metadata.couponCode) {
        // Use coupon discount and tax from payment metadata (already calculated correctly)
        couponCode = payment.metadata.couponCode;
        couponDiscount = payment.metadata.discountAmountMainUnit || 0;
        taxAmount = payment.metadata.taxAmountMainUnit || 0;
        finalAmount = Math.max(0, discountedAmount - couponDiscount);
      } else {
        // No coupon applied, calculate tax on the discounted amount
        taxAmount = this.calculateTax(finalAmount, subscription.planName?.taxes);
      }

      const totalAmount = Math.max(0, finalAmount + taxAmount);

      // Prepare billing address from user data with fallbacks
      const billingAddress = {
        name: subscription.user?.name || 'Customer',
        email: subscription.user?.email || 'customer@example.com',
        phone: subscription.user?.phone || '',
        address: {
          street: '',
          city: '',
          state: '',
          postalCode: '',
          country: '',
        },
      };

      // Prepare plan details for invoice with fallbacks
      const planDetails = {
        name: subscription.planName?.name || 'Plan',
        type: subscription.planName?.type || 'monthly',
        duration: subscription.planName?.duration || subscription.duration || 1,
        modules: subscription.planName?.modules || [],
        description: subscription.planName?.description || '',
      };

      // Create invoice data
      const invoiceData = {
        invoiceNumber,
        user: subscription.user?._id || subscription.user,
        plan: subscription.planName?._id || subscription.planName,
        subscription: subscription._id,
        payment: payment?._id || null,
        currency: subscription.planName?.currencyId || null,
        amount,
        taxAmount,
        discountAmount: planDiscount,
        discountType,
        couponDiscount,
        couponCode,
        totalAmount,
        paymentMethod: payment?.method || 'unknown',
        status: payment
          ? payment.status === 'captured'
            ? 'paid'
            : 'pending'
          : 'pending',
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        billingAddress,
        planDetails,
        notes: subscription.notes || '',
        termsAndConditions: invoiceSettings.includeTermsAndConditions
          ? 'Please refer to our terms and conditions for detailed information.'
          : '',
        template: invoiceSettings.template || 'template1',
        invoiceSettings: {
          prefix: invoiceSettings.invoicePrefix,
          format: invoiceSettings.invoiceNumberFormat,
          footerNotes: invoiceSettings.invoiceFooterNotes,
          includeTermsAndConditions: invoiceSettings.includeTermsAndConditions,
        },
        metadata: {
          generatedBy: 'system',
          subscriptionType: subscription.isTrial ? 'trial' : 'paid',
          planType: subscription.planName?.type || 'N/A',
        },
      };

      return invoiceData;
    } catch (error) {
      throw new Error(`Failed to generate invoice data: ${error.message}`);
    }
  }

  /**
   * Generate invoice PDF using PDFKit with template support
   * @param {Object} invoiceData - Invoice data
   * @returns {Buffer} PDF buffer
   */
  async generateInvoicePDF(invoiceData) {
    const template = invoiceData.template || 'template1';

    switch (template) {
      case 'template1':
        return await this.generateTemplate1(invoiceData);
      case 'template2':
        return await this.generateTemplate2(invoiceData);
      case 'template3':
        return await this.generateTemplate3(invoiceData);
      case 'template4':
        return await this.generateTemplate4(invoiceData);
      default:
        return await this.generateTemplate1(invoiceData);
    }
  }

  /**
   * Template 1: Classic Blue Theme
   */
  async generateTemplate1(invoiceData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: `Invoice ${invoiceData.invoiceNumber}`,
            Author: 'POS System',
            Subject: 'Invoice',
            Creator: 'POS Backend System',
          },
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Header with blue theme
        doc.rect(0, 0, 595, 100).fill('#2c3e50');
        doc.fontSize(24).fillColor('white').text('INVOICE', 50, 30);

        doc
          .fontSize(12)
          .fillColor('white')
          .text(`Invoice #: ${invoiceData.invoiceNumber}`, 50, 60)
          .text(
            `Date: ${invoiceData.invoiceDate.toLocaleDateString()}`,
            50,
            80,
          );

        // Bill To Section
        doc.fontSize(14).fillColor('#2c3e50').text('Bill To:', 50, 120);

        doc
          .fontSize(12)
          .fillColor('#34495e')
          .text(invoiceData.billingAddress.name, 50, 150)
          .text(invoiceData.billingAddress.email, 50, 170)
          .text(invoiceData.billingAddress.phone, 50, 190);

        // Plan Details
        doc.fontSize(14).fillColor('#2c3e50').text('Plan Details:', 50, 290);

        doc
          .fontSize(12)
          .fillColor('#34495e')
          .text(`Plan: ${invoiceData.planDetails.name}`, 50, 320)
          .text(`Type: ${invoiceData.planDetails.type}`, 50, 340)
          .text(`Duration: ${invoiceData.planDetails.duration}`, 50, 360);

        // Amount Details
        doc.fontSize(14).fillColor('#2c3e50').text('Amount Details:', 50, 410);

        const amountY = 440;
        doc
          .fontSize(12)
          .fillColor('#34495e')
          .text(`Amount: $${invoiceData.amount}`, 50, amountY)
          .text(`Discount: $${invoiceData.discountAmount}`, 50, amountY + 20)
          .text(`Tax: $${invoiceData.taxAmount}`, 50, amountY + 40)
          .text(`Total: $${invoiceData.totalAmount}`, 50, amountY + 60);

        // Status and Payment Method
        doc
          .fontSize(12)
          .fillColor('#7f8c8d')
          .text(`Status: ${invoiceData.status}`, 50, amountY + 100)
          .text(
            `Payment Method: ${invoiceData.paymentMethod}`,
            50,
            amountY + 120,
          );

        // Footer
        const footerY = doc.page.height - 100;
        doc
          .fontSize(10)
          .fillColor('#95a5a6')
          .text('Thank you for your business!', 50, footerY)
          .text(
            'This is an automated invoice generated by POS System',
            50,
            footerY + 20,
          );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Template 2: Modern Green Theme
   */
  async generateTemplate2(invoiceData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: `Invoice ${invoiceData.invoiceNumber}`,
            Author: 'POS System',
            Subject: 'Invoice',
            Creator: 'POS Backend System',
          },
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Header with green theme
        doc.rect(0, 0, 595, 80).fill('#27ae60');
        doc.fontSize(28).fillColor('white').text('INVOICE', 50, 25);

        doc
          .fontSize(11)
          .fillColor('white')
          .text(`#${invoiceData.invoiceNumber}`, 450, 30)
          .text(
            `Date: ${invoiceData.invoiceDate.toLocaleDateString()}`,
            450,
            50,
          );

        // Bill To Section with green accent
        doc.rect(40, 100, 515, 2).fill('#27ae60');
        doc.fontSize(16).fillColor('#27ae60').text('BILL TO', 50, 120);

        doc
          .fontSize(12)
          .fillColor('#2c3e50')
          .text(invoiceData.billingAddress.name, 50, 150)
          .text(invoiceData.billingAddress.email, 50, 170)
          .text(invoiceData.billingAddress.phone, 50, 190);

        // Plan Details in a box
        doc.rect(40, 220, 515, 100).stroke('#27ae60');
        doc.fontSize(14).fillColor('#27ae60').text('PLAN DETAILS', 60, 240);

        doc
          .fontSize(11)
          .fillColor('#2c3e50')
          .text(`Plan: ${invoiceData.planDetails.name}`, 60, 265)
          .text(`Type: ${invoiceData.planDetails.type}`, 60, 285)
          .text(`Duration: ${invoiceData.planDetails.duration}`, 60, 305);

        // Amount table
        const tableY = 350;
        doc.rect(40, tableY, 515, 120).stroke('#27ae60');

        // Table headers
        doc
          .fontSize(12)
          .fillColor('#27ae60')
          .text('Description', 60, tableY + 20)
          .text('Amount', 400, tableY + 20);

        // Table rows
        doc
          .fontSize(11)
          .fillColor('#2c3e50')
          .text('Plan Subscription', 60, tableY + 45)
          .text(`$${invoiceData.amount}`, 400, tableY + 45)
          .text('Discount', 60, tableY + 65)
          .text(`-$${invoiceData.discountAmount}`, 400, tableY + 65)
          .text('Tax', 60, tableY + 85)
          .text(`$${invoiceData.taxAmount}`, 400, tableY + 85);

        // Total row
        doc.rect(40, tableY + 100, 515, 20).fill('#27ae60');
        doc
          .fontSize(14)
          .fillColor('white')
          .text('TOTAL', 60, tableY + 110)
          .text(`$${invoiceData.totalAmount}`, 400, tableY + 110);

        // Footer
        const footerY = doc.page.height - 80;
        doc
          .fontSize(10)
          .fillColor('#7f8c8d')
          .text('Thank you for choosing our service!', 50, footerY)
          .text('Generated by POS System', 50, footerY + 15);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Template 3: Elegant Purple Theme
   */
  async generateTemplate3(invoiceData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: `Invoice ${invoiceData.invoiceNumber}`,
            Author: 'POS System',
            Subject: 'Invoice',
            Creator: 'POS Backend System',
          },
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Header with purple gradient effect
        doc.rect(0, 0, 595, 120).fill('#8e44ad');
        doc.fontSize(32).fillColor('white').text('INVOICE', 50, 40);

        doc
          .fontSize(14)
          .fillColor('white')
          .text(`Invoice Number: ${invoiceData.invoiceNumber}`, 50, 80)
          .text(
            `Date: ${invoiceData.invoiceDate.toLocaleDateString()}`,
            50,
            100,
          );

        // Bill To Section
        doc.fontSize(18).fillColor('#8e44ad').text('Bill To', 50, 160);

        doc
          .fontSize(13)
          .fillColor('#2c3e50')
          .text(invoiceData.billingAddress.name, 50, 190)
          .text(invoiceData.billingAddress.email, 50, 210)
          .text(invoiceData.billingAddress.phone, 50, 230);

        // Plan Details
        doc.fontSize(18).fillColor('#8e44ad').text('Plan Information', 50, 270);

        doc
          .fontSize(12)
          .fillColor('#34495e')
          .text(`Plan: ${invoiceData.planDetails.name}`, 50, 300)
          .text(`Type: ${invoiceData.planDetails.type}`, 50, 320)
          .text(`Duration: ${invoiceData.planDetails.duration}`, 50, 340);

        // Amount Details with purple accent
        doc.rect(40, 380, 515, 80).stroke('#8e44ad');
        doc.fontSize(16).fillColor('#8e44ad').text('Amount Breakdown', 60, 400);

        doc
          .fontSize(12)
          .fillColor('#2c3e50')
          .text(`Base Amount: $${invoiceData.amount}`, 60, 425)
          .text(`Discount: -$${invoiceData.discountAmount}`, 60, 445)
          .text(`Tax (10%): $${invoiceData.taxAmount}`, 60, 465);

        // Total with purple background
        doc.rect(40, 480, 515, 30).fill('#8e44ad');
        doc
          .fontSize(16)
          .fillColor('white')
          .text(`Total Amount: $${invoiceData.totalAmount}`, 60, 495);

        // Footer
        const footerY = doc.page.height - 60;
        doc
          .fontSize(10)
          .fillColor('#95a5a6')
          .text('Thank you for your business!', 50, footerY)
          .text(
            'This invoice was generated automatically by POS System',
            50,
            footerY + 15,
          );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Template 4: Professional Orange Theme
   */
  async generateTemplate4(invoiceData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: `Invoice ${invoiceData.invoiceNumber}`,
            Author: 'POS System',
            Subject: 'Invoice',
            Creator: 'POS Backend System',
          },
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Header with orange theme
        doc.rect(0, 0, 595, 90).fill('#e67e22');
        doc.fontSize(26).fillColor('white').text('INVOICE', 50, 30);

        doc
          .fontSize(12)
          .fillColor('white')
          .text(`Invoice #: ${invoiceData.invoiceNumber}`, 50, 60)
          .text(
            `Date: ${invoiceData.invoiceDate.toLocaleDateString()}`,
            450,
            60,
          );

        // Bill To Section
        doc.fontSize(16).fillColor('#e67e22').text('Bill To:', 50, 120);

        doc
          .fontSize(12)
          .fillColor('#2c3e50')
          .text(invoiceData.billingAddress.name, 50, 150)
          .text(invoiceData.billingAddress.email, 50, 170)
          .text(invoiceData.billingAddress.phone, 50, 190);

        // Plan Details
        doc.fontSize(16).fillColor('#e67e22').text('Plan Details:', 50, 230);

        doc
          .fontSize(12)
          .fillColor('#34495e')
          .text(`Plan: ${invoiceData.planDetails.name}`, 50, 260)
          .text(`Type: ${invoiceData.planDetails.type}`, 50, 280)
          .text(`Duration: ${invoiceData.planDetails.duration}`, 50, 300);

        // Amount Details in a professional table
        const tableY = 340;
        doc.rect(40, tableY, 515, 140).stroke('#e67e22');

        // Table headers
        doc.rect(40, tableY, 515, 25).fill('#e67e22');
        doc
          .fontSize(12)
          .fillColor('white')
          .text('Description', 60, tableY + 8)
          .text('Amount', 450, tableY + 8);

        // Table content
        doc
          .fontSize(11)
          .fillColor('#2c3e50')
          .text('Plan Subscription', 60, tableY + 35)
          .text(`$${invoiceData.amount}`, 450, tableY + 35)
          .text('Discount', 60, tableY + 55)
          .text(`-$${invoiceData.discountAmount}`, 450, tableY + 55)
          .text('Tax', 60, tableY + 75)
          .text(`$${invoiceData.taxAmount}`, 450, tableY + 75);

        // Total row
        doc.rect(40, tableY + 115, 515, 25).fill('#e67e22');
        doc
          .fontSize(14)
          .fillColor('white')
          .text('TOTAL', 60, tableY + 128)
          .text(`$${invoiceData.totalAmount}`, 450, tableY + 128);

        // Status and Payment Method
        doc
          .fontSize(12)
          .fillColor('#7f8c8d')
          .text(`Status: ${invoiceData.status}`, 50, tableY + 160)
          .text(
            `Payment Method: ${invoiceData.paymentMethod}`,
            50,
            tableY + 180,
          );

        // Footer
        const footerY = doc.page.height - 60;
        doc
          .fontSize(10)
          .fillColor('#95a5a6')
          .text('Thank you for your business!', 50, footerY)
          .text('Generated by POS System', 50, footerY + 15);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Upload PDF to Cloudinary
   * @param {Buffer} pdfBuffer - PDF buffer
   * @param {String} invoiceNumber - Invoice number
   * @returns {Object} Upload result
   */
  async uploadToCloudinary(pdfBuffer, invoiceNumber) {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: 'invoices',
          public_id: `invoice_${invoiceNumber}`,
          format: 'pdf',
        },
        (error, result) => {
          if (error) {
            return reject(error);
          }
          resolve(result);
        },
      );

      uploadStream.end(pdfBuffer);
    });
  }

  /**
   * Generate and upload complete invoice
   * @param {Object} subscription - Subscription with populated data
   * @param {Object} payment - Payment data (optional)
   * @returns {Object} Invoice result with PDF URL
   */
  async generateAndUploadInvoice(subscription, payment = null) {
    try {
      // Generate invoice data
      const invoiceData = await this.generateInvoiceData(subscription, payment);

      // Generate PDF
      const pdfBuffer = await this.generateInvoicePDF(invoiceData);

      // Upload to Cloudinary
      const uploadResult = await this.uploadToCloudinary(
        pdfBuffer,
        invoiceData.invoiceNumber,
      );

      return {
        ...invoiceData,
        pdfUrl: uploadResult.secure_url,
        cloudinaryId: uploadResult.public_id,
      };
    } catch (error) {
      console.error('Error in generateAndUploadInvoice:', error);
      throw new Error(
        `Failed to generate and upload invoice: ${error.message}`,
      );
    }
  }

  /**
   * Get invoice settings
   * @returns {Object} Invoice settings
   */
  async getInvoiceSettings() {
    let settings = await InvoiceSetting.findOne();

    if (!settings) {
      // Create default settings if none exist
      settings = await InvoiceSetting.create({
        invoicePrefix: 'INV',
        invoiceNumberFormat: 'INV-{YEAR}-{NUMBER}',
        invoiceFooterNotes: '',
        includeTermsAndConditions: false,
        orderStart: 0,
        template: 'template1',
      });
    }

    return settings;
  }

  /**
   * Calculate tax amount
   * @param {Number} amount - Base amount
   * @param {Object} tax - Tax object
   * @returns {Number} Tax amount
   */
  calculateTax(amount, taxes) {
    if (!amount || amount <= 0) {
      return 0;
    }

    const taxList = Array.isArray(taxes)
      ? taxes
      : taxes
        ? [taxes]
        : [];

    if (taxList.length === 0) {
      return 0;
    }

    return taxList.reduce((sum, tax) => {
      if (!tax?.value) {
        return sum;
      }
      const taxValue = Number(tax.value) || 0;
      const type = (tax.type || '').toLowerCase();
      if (type === 'percentage') {
        return sum + (amount * taxValue) / 100;
      }
      return sum + taxValue;
    }, 0);
  }
}

export default InvoiceService;
