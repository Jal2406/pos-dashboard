// Default tab permissions for roles
// These are only seed values used by the /admin/access-control/sync endpoint.
// Admin and superadmin are treated as bypass roles by RBAC and tab-permission
// checks, so defaults here mainly target manager and cashier. You can freely
// adjust this structure to match your exact sidebar layout.

/**
 * Helper to build a permission set with custom CRUD flags.
 * @param {string} label - Display label for the tab
 * @param {string} id - Unique tab identifier
 * @param {{ create?: boolean, read?: boolean, update?: boolean, delete?: boolean }} perms
 */
function perm(label, id, perms = {}) {
  return {
    id,
    label,
    permissions: {
      create: Boolean(perms.create),
      read: Boolean(perms.read),
      update: Boolean(perms.update),
      delete: Boolean(perms.delete),
    },
  };
}

/**
 * Helper for read-only permission.
 */
function ro(label, id) {
  return perm(label, id, { read: true });
}

/**
 * Helper for CRU (Create, Read, Update) permission.
 */
function cru(label, id) {
  return perm(label, id, { create: true, read: true, update: true });
}

/**
 * Helper for full CRUD permission.
 */
function crud(label, id) {
  return perm(label, id, { create: true, read: true, update: true, delete: true });
}

/**
 * DEFAULT_TAB_PERMISSIONS
 *
 * Keys are role names, values are arrays of { id, label, permissions }.
 * Tab IDs should match the keys your frontend uses to render the sidebar.
 *
 * Permission Legend:
 * - ro()   = Read Only
 * - cru()  = Create, Read, Update
 * - crud() = Create, Read, Update, Delete
 * - perm() = Custom permissions
 */
export const DEFAULT_TAB_PERMISSIONS = {
  // Superadmin/admin are bypass roles; you can still store explicit configs
  // here if you want the frontend to use them, but RBAC will not restrict
  // them based on these values.
  superadmin: [],
  admin: [],

  // ============================================================================
  // MANAGER ROLE - Full access to most operational tabs
  // ============================================================================
  manager: [
    // Dashboard
    ro('Dashboard', 'dashboard'),
    cru('Store', 'store'),

    // HRM
    cru('Staff Management', 'hrm.staff'),
    cru('Attendance', 'hrm.attendance'),
    cru('Leaves', 'hrm.leaves'),
    ro('Holidays', 'hrm.holidays'),
    cru('Payroll', 'hrm.payroll'),

    // Inventory
    cru('Products', 'inventory.products'),
    cru('Category', 'inventory.category'),
    cru('Subcategory', 'inventory.subcategory'),
    perm('Expired Stock', 'inventory.expiredStock', { read: true, update: true }),
    ro('Low Stock', 'inventory.lowStock'),
    cru('Variations', 'inventory.variations'),
    cru('Units', 'inventory.units'),
    cru('Brands', 'inventory.brands'),
    cru('Warranty', 'inventory.warranty'),
    ro('Print Labels', 'inventory.printLabels'),

    // Stock
    cru('Stock Transfers', 'stock.transfers'),
    cru('Stock Adjustments', 'stock.adjustments'),

    // Purchase
    ro('Purchase Overview', 'purchase.overview'),
    cru('Purchase Order', 'purchase.order'),
    cru('Purchase Return', 'purchase.return'),
    cru('Suppliers', 'suppliers'),

    // Sales
    cru('Sales', 'sales.sales'),
    perm('POS Themes', 'sales.posTheme', { read: true, update: true }),
    cru('Sales Return', 'sales.salesReturn'),

    // Finance
    cru('Expense', 'finance.expense'),
    cru('Expense Category', 'finance.expenseCategory'),
    cru('Tax', 'finance.tax'),

    // People
    cru('Customers', 'people.customers'),

    // Promo
    cru('Gift Cards', 'promo.giftcards'),
    ro('Gift Card History', 'promo.giftCardHistory'),
    cru('Coupons', 'promo.coupons'),
    cru('Loyalty', 'promo.loyalty'),
    ro('Loyalty Point History', 'promo.loyaltyHistory'),

    // Reports (all read-only)
    ro('Sales Report', 'reports.sales'),
    ro('Daily Cashier Report', 'reports.dailyCashier'),
    ro('Transaction Report', 'reports.transaction'),
    ro('Purchase Report', 'reports.purchase'),
    ro('Expenses Report', 'reports.expenses'),
    ro('Stock History Report', 'reports.stockHistory'),
    ro('Payroll Report', 'reports.payroll'),
    ro('Customer Report', 'reports.customer'),
    ro('User Login Report', 'reports.userLogin'),
    ro('User Activity Report', 'reports.userActivity'),
    ro('Financial & Tax Report', 'reports.financialTax'),

    // POS Screens
    cru('POS 1', 'pos.pos1'),
    cru('POS 2', 'pos.pos2'),
    cru('POS 3', 'pos.pos3'),
    cru('POS 4', 'pos.pos4'),
    cru('POS 5', 'pos.pos5'),

    // Access Control
    cru('Role Permissions', 'access.roles'),
    cru('Notifications', 'access.notifications'),

    // Settings
    cru('General Settings', 'settings.general'),
    cru('Misc Settings', 'settings.misc'),
    cru('Mail Settings', 'settings.mail'),
    cru('Language Settings', 'settings.language'),
    cru('Payment Methods', 'settings.paymentMethods'),
    cru('Invoice Settings', 'settings.invoice'),
    cru('Currency Settings', 'settings.currency'),
    cru('Notification Settings', 'settings.notification'),
    cru('System Settings', 'settings.system'),
  ],

  // ============================================================================
  // CASHIER ROLE - Limited access, primarily for POS and sales operations
  // ============================================================================
  cashier: [
    // Dashboard
    ro('Dashboard', 'dashboard'),

    // HRM - Limited
    cru('Staff Management', 'hrm.staff'),
    cru('Attendance', 'hrm.attendance'),
    cru('Leaves', 'hrm.leaves'),
    ro('Holidays', 'hrm.holidays'),
    cru('Payroll', 'hrm.payroll'),

    // Inventory
    cru('Products', 'inventory.products'),
    cru('Category', 'inventory.category'),
    cru('Subcategory', 'inventory.subcategory'),
    perm('Expired Stock', 'inventory.expiredStock', { read: true, update: true }),
    ro('Low Stock', 'inventory.lowStock'),
    cru('Variations', 'inventory.variations'),
    cru('Units', 'inventory.units'),
    cru('Brands', 'inventory.brands'),
    cru('Warranty', 'inventory.warranty'),
    ro('Print Labels', 'inventory.printLabels'),

    // Stock
    cru('Stock Transfers', 'stock.transfers'),
    cru('Stock Adjustments', 'stock.adjustments'),

    // Purchase
    ro('Purchase Overview', 'purchase.overview'),
    cru('Purchase Order', 'purchase.order'),
    cru('Purchase Return', 'purchase.return'),
    cru('Suppliers', 'suppliers'),

    // Sales
    cru('Sales', 'sales.sales'),
    perm('POS Theme', 'sales.posTheme', { read: true, update: true }),
    cru('Sales Return', 'sales.salesReturn'),

    // Finance
    cru('Expense', 'finance.expense'),
    cru('Expense Category', 'finance.expenseCategory'),
    cru('Tax', 'finance.tax'),

    // People
    cru('Customers', 'people.customers'),

    // Promo
    cru('Gift Cards', 'promo.giftcards'),
    ro('Gift Card History', 'promo.giftCardHistory'),
    cru('Coupons', 'promo.coupons'),
    cru('Loyalty', 'promo.loyalty'),
    ro('Loyalty Point History', 'promo.loyaltyHistory'),

    // Reports (all read-only)
    ro('Sales Report', 'reports.sales'),
    ro('Daily Cashier Report', 'reports.dailyCashier'),
    ro('Transaction Report', 'reports.transaction'),
    ro('Purchase Report', 'reports.purchase'),
    ro('Expenses Report', 'reports.expenses'),
    ro('Stock History Report', 'reports.stockHistory'),
    ro('Payroll Report', 'reports.payroll'),
    ro('Customer Report', 'reports.customer'),
    ro('User Login Report', 'reports.userLogin'),
    ro('User Activity Report', 'reports.userActivity'),
    ro('Financial & Tax Report', 'reports.financialTax'),

    // POS Screens
    cru('POS 1', 'pos.pos1'),
    cru('POS 2', 'pos.pos2'),
    cru('POS 3', 'pos.pos3'),
    cru('POS 4', 'pos.pos4'),
    cru('POS 5', 'pos.pos5'),

    // Access Control
    cru('Role Permissions', 'access.roles'),
    cru('Notifications', 'access.notifications'),

    // Settings
    cru('General Settings', 'settings.general'),
    cru('Misc Settings', 'settings.misc'),
    cru('Mail Settings', 'settings.mail'),
    cru('Language Settings', 'settings.language'),
    cru('Payment Methods', 'settings.paymentMethods'),
    cru('Invoice Settings', 'settings.invoice'),
    cru('Currency Settings', 'settings.currency'),
    cru('Notification Settings', 'settings.notification'),
  ],
};

export default {
  DEFAULT_TAB_PERMISSIONS,
};
