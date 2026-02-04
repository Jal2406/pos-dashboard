import { NotificationTemplate } from '../models/index.js';

/**
 * Fixed notification templates - only these 6 types are allowed:
 * 1. subscription_cancel
 * 2. order_placed
 * 3. payment_received
 * 4. low_stock_alert
 * 5. subscription_expiring
 * 6. new_subscription
 */
const templates = [
  {
    type: 'subscription_cancel',
    label: 'Subscription Cancelled',
    to: ['superadmin', 'admin'],
    status: true,
    templates: [
      {
        userType: 'superadmin',
        notification: {
          subject: 'Subscription Cancelled',
          content:
            'Subscription has been cancelled for {{planName}} by {{userName}}',
        },
        email: {
          subject: 'Subscription Cancelled - {{planName}}',
          content:
            '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #f44336;">Subscription Cancelled</h1><p>Dear {{superAdminName}},</p><p>A subscription has been cancelled.</p><div style="background: #ffebee; padding: 20px; margin: 20px 0; border-radius: 5px;"><p><strong>Plan:</strong> {{planName}}</p><p><strong>User:</strong> {{userName}}</p><p><strong>User Email:</strong> {{userEmail}}</p><p><strong>Date:</strong> {{currentDate}}</p></div><p>Best regards,<br>{{companyName}} Team</p></div>',
        },
      },
      {
        userType: 'admin',
        notification: {
          subject: 'Subscription Cancelled',
          content: 'Your subscription for {{planName}} has been cancelled',
        },
        email: {
          subject: 'Subscription Cancellation Confirmation',
          content:
            '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #f44336;">Subscription Cancelled</h1><p>Dear {{userName}},</p><p>Your subscription has been successfully cancelled.</p><div style="background: #ffebee; padding: 20px; margin: 20px 0; border-radius: 5px;"><p><strong>Plan:</strong> {{planName}}</p><p><strong>Date:</strong> {{currentDate}}</p></div><p>If you have any questions, please contact us at {{supportEmail}}.</p><p>Best regards,<br>{{companyName}} Team</p></div>',
        },
      },
    ],
  },
  {
    type: 'order_placed',
    label: 'Order Placed',
    to: ['admin', 'manager'],
    status: true,
    templates: [
      {
        userType: 'admin',
        notification: {
          subject: 'Order Placed',
          content:
            'New order {{orderID}} has been placed. Total amount: {{totalAmount}}',
        },
        email: {
          subject: 'New Order - {{orderID}}',
          content:
            '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #2196F3;">New Order Placed</h1><p>Dear {{adminName}},</p><p>A new order has been placed.</p><div style="background: #e3f2fd; padding: 20px; margin: 20px 0; border-radius: 5px;"><p><strong>Order ID:</strong> {{orderID}}</p><p><strong>Order Date:</strong> {{orderDate}}</p><p><strong>Total Amount:</strong> {{totalAmount}}</p><p><strong>Quantity:</strong> {{quantity}}</p><p><strong>Items:</strong> {{itemList}}</p></div><p>Best regards,<br>{{companyName}} System</p></div>',
        },
      },
      {
        userType: 'manager',
        notification: {
          subject: 'Order Placed',
          content:
            'New order {{orderID}} has been placed. Amount: {{totalAmount}}',
        },
        email: {
          subject: 'New Order - {{orderID}}',
          content:
            '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #2196F3;">New Order</h1><p>Dear {{managerName}},</p><p>A new order has been placed.</p><div style="background: #e3f2fd; padding: 20px; margin: 20px 0; border-radius: 5px;"><p><strong>Order ID:</strong> {{orderID}}</p><p><strong>Order Date:</strong> {{orderDate}}</p><p><strong>Total Amount:</strong> {{totalAmount}}</p></div><p>Best regards,<br>{{companyName}} System</p></div>',
        },
      },
    ],
  },
  {
    type: 'payment_received',
    label: 'Payment Received',
    to: ['admin'],
    status: true,
    templates: [
      {
        userType: 'admin',
        notification: {
          subject: 'Payment Received',
          content: 'Payment of {{amountPaid}} received for order {{orderID}}',
        },
        email: {
          subject: 'Payment Received - {{orderID}}',
          content:
            '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #4CAF50;">Payment Received</h1><p>Dear {{adminName}},</p><p>A payment has been received.</p><div style="background: #e8f5e9; padding: 20px; margin: 20px 0; border-radius: 5px;"><p><strong>Amount Paid:</strong> {{amountPaid}}</p><p><strong>Payment Method:</strong> {{paymentMethod}}</p><p><strong>Payment Date:</strong> {{paymentDate}}</p><p><strong>Transaction ID:</strong> {{transactionID}}</p><p><strong>Order ID:</strong> {{orderID}}</p><p><strong>Payment Status:</strong> {{paymentStatus}}</p></div><p>Best regards,<br>{{companyName}} System</p></div>',
        },
      },
    ],
  },
  {
    type: 'subscription_expiring',
    label: 'Subscription Expiring',
    to: ['admin'],
    status: true,
    templates: [
      {
        userType: 'admin',
        notification: {
          subject: 'Subscription Expiring',
          content:
            'Your subscription for {{planName}} will expire on {{planExpiryDate}}. Days remaining: {{daysRemaining}}',
        },
        email: {
          subject: 'Subscription Expiring - {{planName}}',
          content:
            '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #f44336;">Subscription Expiring Soon</h1><p>Dear {{userName}},</p><p>Your subscription is expiring soon.</p><div style="background: #ffebee; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #f44336;"><p><strong>Plan Name:</strong> {{planName}}</p><p><strong>Plan Start Date:</strong> {{planStartDate}}</p><p><strong>Plan Expiry Date:</strong> {{planExpiryDate}}</p><p><strong>Days Remaining:</strong> {{daysRemaining}}</p></div><p>Please renew your subscription to continue enjoying our services.</p><p>If you have any questions, please contact us at {{supportEmail}}.</p><p>Best regards,<br>{{companyName}} Team</p></div>',
        },
      },
    ],
  },
  {
    type: 'new_subscription',
    label: 'New Subscription',
    to: ['admin', 'manager'],
    status: true,
    templates: [
      {
        userType: 'admin',
        notification: {
          subject: 'New Subscription',
          content:
            'A new subscription has been created for {{planName}}. Start date: {{planStartDate}}',
        },
        email: {
          subject: 'New Subscription - {{planName}}',
          content:
            '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #4CAF50;">New Subscription Created</h1><p>Dear {{userName}},</p><p>A new subscription has been successfully created.</p><div style="background: #e8f5e9; padding: 20px; margin: 20px 0; border-radius: 5px;"><p><strong>Plan Name:</strong> {{planName}}</p><p><strong>Plan Start Date:</strong> {{planStartDate}}</p><p><strong>Plan Expiry Date:</strong> {{planExpiryDate}}</p></div><p>Thank you for your subscription!</p><p>If you have any questions, please contact us at {{supportEmail}}.</p><p>Best regards,<br>{{companyName}} Team</p></div>',
        },
      },
      {
        userType: 'manager',
        notification: {
          subject: 'New Subscription',
          content: 'A new subscription has been created for {{planName}}',
        },
        email: {
          subject: 'New Subscription - {{planName}}',
          content:
            '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #4CAF50;">New Subscription</h1><p>Dear {{managerName}},</p><p>A new subscription has been created.</p><div style="background: #e8f5e9; padding: 20px; margin: 20px 0; border-radius: 5px;"><p><strong>Plan Name:</strong> {{planName}}</p><p><strong>Plan Start Date:</strong> {{planStartDate}}</p></div><p>Best regards,<br>{{companyName}} System</p></div>',
        },
      },
    ],
  },
];

const templateTypes = templates.map((t) => t.type);

export const seedNotificationTemplates = async () => {
  try {
    const forceSeed = process.env.FORCE_NOTIFICATION_TEMPLATE_SEED === 'true';

    let existingTypes = [];

    if (forceSeed) {
      // Allow developers to explicitly force a fresh seed when needed
      try {
        await NotificationTemplate.collection.dropIndex('type_1_to_1');
      } catch (error) {
        if (error?.codeName !== 'IndexNotFound') {
          console.warn(
            '⚠️  Unable to drop legacy NotificationTemplate index type_1_to_1:',
            error.message,
          );
          throw error;
        }
      }
      await NotificationTemplate.deleteMany({ type: { $in: templateTypes } });
    } else {
      existingTypes = await NotificationTemplate.distinct('type', {
        type: { $in: templateTypes },
      });

      if (existingTypes.length === templateTypes.length) {
        console.log('✅ Notification templates already seeded. Skipping.');
        return;
      }
    }

    const existingTypesSet = forceSeed ? new Set() : new Set(existingTypes);

    const templatesToInsert = templates.filter(
      (template) => !existingTypesSet.has(template.type),
    );

    if (!templatesToInsert.length) {
      console.log('✅ Notification templates already seeded. Skipping.');
      return;
    }

    await NotificationTemplate.insertMany(templatesToInsert);

    for (const template of templatesToInsert) {
      console.log(`Seeded NotificationTemplate: ${template.type}`);
    }
  } catch (error) {
    console.error('Error seeding notification templates:', error);
  }
};
