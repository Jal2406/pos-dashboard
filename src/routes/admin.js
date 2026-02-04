import express from 'express';
import {
  SubscriptionController,
  StoreController,
  EmployeeController,
  ProductCategoryController,
  WarrantyController,
  UnitController,
  ProductController,
  SubCategoryController,
  BrandController,
  VariantController,
  ShiftController,
  AttendanceController,
  UnifiedPaymentController,
  PaymentGatewayController,
  CouponController,
  LeaveTypeController,
  LeaveManageController,
  LoyaltyPointController,
  LoyaltyRedemptionRuleController,
  ShiftTypeController,
  SupplierController,
  HolidayController,
  ExpenseCategoryController,
  ExpenseController,
  TenantTaxController,
  PurchaseOrderController,
  PurchaseReturnController,
  CustomerController,
  UploadController,
  TenantCouponController,
  TenantMailSettingController,
  TenantMailTemplateController,
  TenantMiscSettingController,
  PayrollController,
  GiftCardController,
  StockController,
  StockAdjustmentController,
  SalesController,
  SalesReturnController,
  TenantCurrencySettingController,
  BusinessController,
  LoginHistoryController,
  POSController,
  AccessControlController,
  CustomerLoyaltyPointController,
} from '../controller/index.js';
import { upload, validateAdminSubscription } from '../utils/index.js';

const router = express.Router();

// ===== PAYMENT2 ROUTES =====
router.post('/payment2/create', UnifiedPaymentController.createPayment);
router.post('/payment2/finalize', UnifiedPaymentController.finalizePayment);

// ===== PAYMENT GATEWAY ROUTES =====
router.get('/payment-gateways', PaymentGatewayController.getActiveGateways);

// ===== SUBSCRIPTION ROUTES =====
router.post('/subscription', SubscriptionController.createPendingSubscription);
router.post(
  '/subscription/trial',
  SubscriptionController.createTrialSubscription,
);
router.get('/subscription/:id', SubscriptionController.getById);



// ===== COUPON ROUTES =====
router.get('/coupons/:planId', CouponController.getCouponsByPlan);

// ===== COUPON FLOW ROUTES =====
router.post(
  '/subscription/:subscriptionId/coupon/apply',
  CouponController.applyCoupon,
);
router.get(
  '/subscription/:subscriptionId/coupon/effective-total',
  CouponController.getEffectiveTotal,
);
router.delete(
  '/subscription/:subscriptionId/coupon',
  CouponController.removeCoupon,
);
router.get(
  '/subscription/:subscriptionId/coupon/history',
  CouponController.getSubscriptionCouponHistory,
);
router.get(
  '/payment/:paymentId/coupon/reconcile',
  CouponController.reconcilePaymentWithCoupon,
);

// ===== BUSINESS SETTINGS ROUTES =====
router.post('/business/assign-subdomain', BusinessController.AssignSubdomain);
router.get('/business/me', BusinessController.GetMyBusiness);

router.use(validateAdminSubscription);
// ===== LOGIN HISTORY ROUTES =====
router.get('/login-history', LoginHistoryController.list);

// ===== POS ROUTES =====
router.get('/pos-screen', POSController.getInitData);

// ===== TENANT MAIL SETTINGS ROUTES =====
router.get('/mail-setting', TenantMailSettingController.get);
router.get('/mail-setting/status', TenantMailSettingController.getStatus);
router.post('/mail-setting', TenantMailSettingController.createOrUpdate);
router.put('/mail-setting', TenantMailSettingController.createOrUpdate);
router.post('/mail-setting/verify', TenantMailSettingController.verify);
router.delete('/mail-setting', TenantMailSettingController.delete);

// ===== TENANT MAIL TEMPLATE ROUTES =====
router.get('/mail-templates', TenantMailTemplateController.list);
router.get('/mail-templates/:id', TenantMailTemplateController.getById);
router.post('/mail-templates', TenantMailTemplateController.create);
router.put('/mail-templates/:id', TenantMailTemplateController.update);
router.delete('/mail-templates/:id', TenantMailTemplateController.delete);
router.patch(
  '/mail-templates/:id/toggle',
  TenantMailTemplateController.toggleStatus,
);

// ===== TENANT MISC SETTINGS ROUTES =====
router.get('/misc-setting', TenantMiscSettingController.get);
router.get('/misc-setting/status', TenantMiscSettingController.getStatus);
router.get(
  '/misc-setting/format-options',
  TenantMiscSettingController.getFormatOptions,
);
router.post('/misc-setting', TenantMiscSettingController.createOrUpdate);
router.put('/misc-setting', TenantMiscSettingController.update);
router.patch(
  '/misc-setting/dark-mode',
  TenantMiscSettingController.toggleDarkMode,
);
router.post('/misc-setting/reset', TenantMiscSettingController.resetToDefaults);
router.delete('/misc-setting', TenantMiscSettingController.delete);

// ===== STORE ROUTES =====
router.post('/store', upload.single('storeImage'), StoreController.create);
router.get('/store', StoreController.list);
router.get('/store/active', StoreController.getActiveStores);
router.post('/store/bulk-get', StoreController.bulkGet);
router.patch('/store/bulk-status', StoreController.bulkUpdateStatus);
router.delete('/store/bulk-delete', StoreController.bulkDelete);
router.get('/store/:id', StoreController.getById);
router.put('/store/:id', upload.single('storeImage'), StoreController.update);
router.delete('/store/:id', StoreController.remove);
router.post('/store/:storeId/assign-manager', StoreController.assignManager);

// ===== SHIFT TYPE ROUTES =====
// Shift type management routes (admin level access)
// Bulk operations (must come before :id routes)
router.post('/shiftType/bulk-get', ShiftTypeController.bulkGet);
router.patch('/shiftType/bulk-status', ShiftTypeController.bulkUpdateStatus);
router.delete('/shiftType/bulk-delete', ShiftTypeController.bulkDelete);

router.post('/shiftType', ShiftTypeController.createShiftType);
router.get('/shiftType', ShiftTypeController.getAllShiftTypes);
router.get('/shiftType/:id', ShiftTypeController.getShiftTypeById);
router.put('/shiftType/:id', ShiftTypeController.updateShiftType);
router.delete('/shiftType/:id', ShiftTypeController.deleteShiftType);
router.patch(
  '/shiftType/toggle/:id',
  ShiftTypeController.toggleShiftTypeStatus,
);

// ===== SHIFT ASSIGNMENT ROUTES =====
// Shift assignment management routes (admin level access)
router.post('/shifts', ShiftController.createShiftAssignment);
router.get('/shifts', ShiftController.getAllShiftAssignments);
router.get('/shifts/:id', ShiftController.getShiftAssignmentById);
router.put('/shifts/:id', ShiftController.updateShiftAssignment);
router.delete('/shifts/:id', ShiftController.deleteShiftAssignment);
router.patch('/shifts/:id/cancel', ShiftController.cancelShift);

// Shift queries
router.get('/shifts/employee/:employeeId', ShiftController.getShiftsByEmployee);
router.get('/shifts/store/:storeId', ShiftController.getShiftsByStoreAndDate);
router.get('/shifts/scheduled', ShiftController.getScheduledShifts);

// ===== ATTENDANCE ROUTES =====
// Admin can manage all attendance records for their business
router.post('/attendance', AttendanceController.createAttendanceRecord);
router.get('/attendance', AttendanceController.getAllAttendanceRecords);
router.get('/attendance/:id', AttendanceController.getAttendanceById);
router.put('/attendance/:id/correct', AttendanceController.correctAttendance);

// Admin can clock in/out for any employee
router.post(
  '/attendance/shift/:shiftId/clock-in',
  AttendanceController.clockIn,
);
router.post(
  '/attendance/shift/:shiftId/clock-out',
  AttendanceController.clockOut,
);
router.post('/attendance/shift/:shiftId/break', AttendanceController.addBreak);

// Admin can mark attendance status for any employee
router.post(
  '/attendance/shift/:shiftId/no-show',
  AttendanceController.markAsNoShow,
);
router.post(
  '/attendance/shift/:shiftId/leave',
  AttendanceController.markAsLeave,
);

// Admin can query attendance records
router.get(
  '/attendance/employee/:employeeId',
  AttendanceController.getAttendanceByEmployee,
);
router.get(
  '/attendance/store/:storeId',
  AttendanceController.getAttendanceByStoreAndDate,
);
router.get('/attendance/no-shows', AttendanceController.getNoShows);

// ===== EMPLOYEE ROUTES =====
// Core CRUD
router.post('/employees', EmployeeController.createEmployee);
router.get('/employees', EmployeeController.getEmployees); // supports filters

// Bulk operations (must come before :id routes)
router.post('/employees/bulk-get', EmployeeController.bulkGet);
router.patch('/employees/bulk-status', EmployeeController.bulkUpdateStatus);
router.delete('/employees/bulk-delete', EmployeeController.bulkDelete);

router.get('/employees/:id', EmployeeController.getEmployeeById);
router.put('/employees/:id', EmployeeController.updateEmployee);
router.patch('/employees/:id/toggle', EmployeeController.toggleEmployeeStatus);
router.delete('/employees/:id', EmployeeController.deleteEmployee);

// Assignment
router.put(
  '/employees/:id/assign/:storeId',
  EmployeeController.assignEmployeeToStore,
);
router.put(
  '/employees/:id/unassign/:storeId',
  EmployeeController.unassignEmployeeFromStore,
);

// Manager-specific
router.get('/employees/:id/stores', EmployeeController.getManagerStores);

// ===== PRODUCT CATEGORY ROUTES =====
router.post('/product-category', ProductCategoryController.create);
router.get('/product-category', ProductCategoryController.list);
router.get(
  '/product-category/active',
  ProductCategoryController.getActiveCategories,
);

// Bulk operations (must come before :id routes)
router.post('/product-category/bulk-get', ProductCategoryController.bulkGet);
router.patch(
  '/product-category/bulk-status',
  ProductCategoryController.bulkUpdateStatus,
);
router.delete(
  '/product-category/bulk-delete',
  ProductCategoryController.bulkDelete,
);

router.get('/product-category/:id', ProductCategoryController.getById);
router.put(
  '/product-category/:id',

  ProductCategoryController.update,
);
router.delete('/product-category/:id', ProductCategoryController.remove);
router.patch(
  '/product-category/toggle/:id',
  ProductCategoryController.toggleStatus,
);

// ===== SUB-CATEGORY ROUTES =====
router.post(
  '/subcategory',
  upload.single('subCategoryImage'),
  SubCategoryController.create,
);
router.get('/subcategory', SubCategoryController.list);
router.get(
  '/subcategory/inventory',
  SubCategoryController.getSubcategoriesForInventory,
);
router.get('/subcategory/active', SubCategoryController.getActiveSubcategories);

// Bulk operations (must come before :id routes)
router.post('/subcategory/bulk-get', SubCategoryController.bulkGet);
router.patch(
  '/subcategory/bulk-status',
  SubCategoryController.bulkUpdateStatus,
);
router.delete('/subcategory/bulk-delete', SubCategoryController.bulkDelete);

router.get(
  '/subcategory/category/:categoryId',
  SubCategoryController.getByCategory,
);
router.get(
  '/subcategory/category/:categoryId/with-count',
  SubCategoryController.getSubcategoriesByCategoryWithCount,
);
router.get('/subcategory/:id', SubCategoryController.getById);
router.put(
  '/subcategory/:id',
  upload.single('subCategoryImage'),
  SubCategoryController.update,
);
router.delete('/subcategory/:id', SubCategoryController.remove);
router.patch('/subcategory/toggle/:id', SubCategoryController.toggleStatus);

// ===== PRODUCT ROUTES =====
router.post('/product', ProductController.create);
router.get('/product', ProductController.list);
router.get('/product/expired', ProductController.expired);
router.get('/product/active', ProductController.active);

// Bulk operations (must come before :id routes)
router.post('/product/bulk-get', ProductController.bulkGet);
router.delete('/product/bulk-delete', ProductController.bulkDelete);
router.patch('/product/bulk-status', ProductController.bulkUpdateStatus);

router.get('/product/:id', ProductController.get);
router.put('/product/:id', ProductController.update);
router.delete('/product/:id', ProductController.remove);
router.patch('/product/toggle/:id', ProductController.toggleStatus);
router.patch(
  '/product/:id/regenerate-barcode',
  ProductController.regenerateBarcode,
);

// ===== PRODUCT BARCODE SEARCH ROUTES =====
// Optimized routes for barcode scanning with enterprise-level performance
router.get('/product/barcode/:barcode', ProductController.findByBarcode);
router.get(
  '/product/barcode/active/:barcode',
  ProductController.findActiveBarcodeByBarcode,
);
router.post('/product/barcode/batch', ProductController.findByBarcodes);

// ===== PRODUCT VARIANT ROUTES REMOVED =====
// Variant inventory and images are now handled directly in product creation/update

// ===== PRODUCT STATISTICS ROUTES =====
router.get('/product-stats', ProductController.getProductStats);
router.get('/low-stock', ProductController.getLowStockProducts);

// ===== WARRANTY ROUTES =====
router.post('/warranty', WarrantyController.create);
router.get('/warranty', WarrantyController.list);
router.get('/warranty/active', WarrantyController.getActive);

router.post('/warranty/bulk-get', WarrantyController.bulkGet);
router.patch('/warranty/bulk-status', WarrantyController.bulkUpdateStatus);
router.delete('/warranty/bulk-delete', WarrantyController.bulkDelete);

router.get('/warranty/:id', WarrantyController.get);
router.put('/warranty/:id', WarrantyController.update);
router.delete('/warranty/:id', WarrantyController.remove);
router.patch('/warranty/toggle/:id', WarrantyController.toggleStatus);

// ===== UNIT ROUTES =====
router.post('/unit', UnitController.create);
router.get('/unit', UnitController.list);
router.get('/unit/active', UnitController.getActiveUnits);

// Bulk operations (must come before :id routes)
router.post('/unit/bulk-get', UnitController.bulkGet);
router.patch('/unit/bulk-status', UnitController.bulkUpdateStatus);
router.delete('/unit/bulk-delete', UnitController.bulkSoftDelete);

router.get('/unit/:id', UnitController.get);
router.put('/unit/:id', UnitController.update);
router.delete('/unit/:id', UnitController.softDelete);
router.patch('/unit/toggle/:id', UnitController.toggleStatus);

// ===== BRAND ROUTES =====
router.post('/brand', upload.single('brandImage'), BrandController.create);
router.get('/brand', BrandController.list);
router.get('/brand/active', BrandController.getActiveBrands);

// Bulk operations (must come before :id routes)
router.post('/brand/bulk-get', BrandController.bulkGet);
router.patch('/brand/bulk-status', BrandController.bulkUpdateStatus);
router.delete('/brand/bulk-delete', BrandController.bulkSoftDelete);

router.get('/brand/:id', BrandController.get);
router.put('/brand/:id', upload.single('brandImage'), BrandController.update);
router.delete('/brand/:id', BrandController.softDelete);
router.patch('/brand/toggle/:id', BrandController.toggleStatus);

// ===== VARIANT ROUTES =====
router.post('/variant', VariantController.create);
router.get('/variant', VariantController.list);
router.get('/variant/active', VariantController.getActive);

router.post('/variant/bulk-get', VariantController.bulkGet);
router.patch('/variant/bulk-status', VariantController.bulkUpdateStatus);
router.delete('/variant/bulk-delete', VariantController.bulkDelete);

router.get('/variant/:id', VariantController.get);
router.put('/variant/:id', VariantController.update);
router.delete('/variant/:id', VariantController.remove);
router.patch('/variant/toggle/:id', VariantController.toggleStatus);

router.get('/product-data', ProductController.getInitialProductData);
// ===== LEAVE TYPE ROUTES =====
router.post('/leave-type', LeaveTypeController.create);
router.get('/leave-type', LeaveTypeController.list);
router.get('/leave-type/active', LeaveTypeController.getActive);
router.put('/leave-type/:id', LeaveTypeController.update);
router.delete('/leave-type/:id', LeaveTypeController.delete);
router.patch('/leave-type/toggle/:id', LeaveTypeController.toggleStatus);

// ===== LOYALTY POINT ROUTES =====
// Core CRUD operations
router.post('/loyalty-point', LoyaltyPointController.create);
router.get('/loyalty-point', LoyaltyPointController.list);
router.get('/loyalty-point/all', LoyaltyPointController.getAll);
router.get('/loyalty-point/active', LoyaltyPointController.getActive);
// Bulk operations (must come before :id routes)
router.post('/loyalty-point/bulk-get', LoyaltyPointController.bulkGet);
router.patch(
  '/loyalty-point/bulk-status',
  LoyaltyPointController.bulkUpdateStatus,
);
router.delete('/loyalty-point/bulk-delete', LoyaltyPointController.bulkSoftDelete);
router.get('/loyalty-point/:id', LoyaltyPointController.getById);
router.put('/loyalty-point/:id', LoyaltyPointController.update);
// router.delete('/loyalty-point/:id', LoyaltyPointController.delete);

// Soft delete operations
router.delete('/loyalty-point/:id', LoyaltyPointController.softDelete);
router.patch('/loyalty-point/:id/restore', LoyaltyPointController.restore);

// Status management
router.patch('/loyalty-point/:id/status', LoyaltyPointController.updateStatus);
router.patch(
  '/loyalty-point/:id/toggle-status',
  LoyaltyPointController.toggleStatus,
);

// ===== CUSTOMER LOYALTY POINT ROUTES =====
router.get(
  '/customer-loyalty-point/history',
  CustomerLoyaltyPointController.getHistory,
);

// ===== LOYALTY REDEMPTION RULE ROUTES =====
// Core CRUD operations
router.post('/redemption-rule', LoyaltyRedemptionRuleController.create);
router.get('/redemption-rule', LoyaltyRedemptionRuleController.list);
router.get('/redemption-rule/all', LoyaltyRedemptionRuleController.getAll);
router.get(
  '/redemption-rule/active',
  LoyaltyRedemptionRuleController.getActive,
);
// Bulk operations (must come before :id routes)
router.post(
  '/redemption-rule/bulk-get',
  LoyaltyRedemptionRuleController.bulkGet,
);
router.patch(
  '/redemption-rule/bulk-status',
  LoyaltyRedemptionRuleController.bulkUpdateStatus,
);
router.delete(
  '/redemption-rule/bulk-delete',
  LoyaltyRedemptionRuleController.bulkSoftDelete,
);
// Find rule by points (must come before :id routes)
router.get(
  '/redemption-rule/points/:points',
  LoyaltyRedemptionRuleController.findByPoints,
);
router.get('/redemption-rule/:id', LoyaltyRedemptionRuleController.getById);
router.put('/redemption-rule/:id', LoyaltyRedemptionRuleController.update);

// Soft delete operations
router.delete(
  '/redemption-rule/:id',
  LoyaltyRedemptionRuleController.softDelete,
);
router.patch(
  '/redemption-rule/:id/restore',
  LoyaltyRedemptionRuleController.restore,
);

// Status management
router.patch(
  '/redemption-rule/:id/status',
  LoyaltyRedemptionRuleController.updateStatus,
);
router.patch(
  '/redemption-rule/:id/toggle-status',
  LoyaltyRedemptionRuleController.toggleStatus,
);

// ===== LEAVE MANAGEMENT ROUTES =====
// Admin can create approved leave for employees
router.post(
  '/leave/create-approved',
  LeaveManageController.createApprovedLeave,
);

// Admin can view all leave requests with pagination and filtering
router.get('/leave', LeaveManageController.getAllLeaveRequests);

// Admin can approve/reject leave requests
router.patch('/leave/:id/approve', LeaveManageController.approveLeaveRequest);
router.patch('/leave/:id/reject', LeaveManageController.rejectLeaveRequest);

// Admin can update and cancel any leave request
router.put('/leave/:id', LeaveManageController.updateLeaveRequest);
router.patch('/leave/:id/cancel', LeaveManageController.cancelLeaveRequest);

// ===== PAYROLL ROUTES =====
// Payroll generation
router.post(
  '/payroll/generate/employee/:employeeId',
  PayrollController.generatePayrollForEmployee,
);
router.post('/payroll/generate/bulk', PayrollController.generateBulkPayroll);
router.post(
  '/payroll/generate/store/:storeId',
  PayrollController.generatePayrollForStore,
);

// Payroll CRUD operations
router.get('/payroll', PayrollController.getPayrolls);
router.get('/payroll/:id', PayrollController.getPayrollById);
router.patch(
  '/payroll/:id/deduction',
  PayrollController.updatePayrollDeduction,
);
router.delete('/payroll/:id', PayrollController.deletePayroll);

// Payroll summary and analytics
router.get(
  '/payroll/summary/:month/:year',
  PayrollController.getPayrollSummary,
);

// ===== SUPPLIER ROUTES =====
// Core CRUD operations
router.post(
  '/supplier',
  upload.single('supplierImage'),
  SupplierController.create,
);
router.get('/supplier', SupplierController.list);
router.get('/supplier/active', SupplierController.getActiveSuppliers);
// Bulk operations
router.post('/supplier/bulk-delete', SupplierController.bulkDelete);
router.patch('/supplier/bulk-status', SupplierController.bulkUpdateStatus);
router.get('/supplier/stats', SupplierController.getSupplierStats);
router.get('/supplier/:id', SupplierController.get);
router.put(
  '/supplier/:id',
  upload.single('supplierImage'),
  SupplierController.update,
);
router.delete('/supplier/:id', SupplierController.remove);

// Status management
router.patch('/supplier/:id/toggle', SupplierController.toggleStatus);
router.patch('/supplier/:id/status', SupplierController.updateStatus);

// Search and filtering
router.get('/supplier/search', SupplierController.search);
router.get('/supplier/location', SupplierController.getByLocation);
router.get('/supplier/status/:status', SupplierController.getByStatus);

// ===== HOLIDAY ROUTES =====

// Basic CRUD operations
router.post('/holiday', HolidayController.createHoliday);
router.get('/holiday', HolidayController.getHolidays);
router.get('/holiday/active', HolidayController.getActiveHolidays);
router.get('/holiday/recurring', HolidayController.getRecurringHolidays);
router.get('/holiday/statistics', HolidayController.getHolidayStatistics);
router.get('/holiday/year/:year', HolidayController.getHolidaysByYear);
router.get('/holiday/date-range', HolidayController.getHolidaysByDateRange);
router.get('/holiday/:id', HolidayController.getHolidayById);
router.put('/holiday/:id', HolidayController.updateHoliday);
router.delete('/holiday/:id', HolidayController.deleteHoliday);

// Bulk operations
router.post('/holiday/bulk-create', HolidayController.bulkCreateHolidays);
router.patch('/holiday/bulk-update', HolidayController.bulkUpdateHolidays);
router.post('/holiday/bulk-delete', HolidayController.bulkDeleteHolidays);

// Status management
router.patch('/holiday/:id/toggle', HolidayController.toggleHolidayStatus);

// ===== EXPENSE CATEGORY ROUTES =====

// Basic CRUD operations
router.post('/expense-category', ExpenseCategoryController.create);
router.get('/expense-category', ExpenseCategoryController.list);
router.get(
  '/expense-category/active',
  ExpenseCategoryController.getActiveCategories,
);
router.get(
  '/expense-category/statistics',
  ExpenseCategoryController.getStatistics,
);

// Bulk operations (must come before :id routes)
router.post('/expense-category/bulk-get', ExpenseCategoryController.bulkGet);
router.patch(
  '/expense-category/bulk-status',
  ExpenseCategoryController.bulkUpdateStatus,
);
router.delete(
  '/expense-category/bulk-delete',
  ExpenseCategoryController.bulkDelete,
);

router.get('/expense-category/:id', ExpenseCategoryController.get);
router.put('/expense-category/:id', ExpenseCategoryController.update);
router.delete('/expense-category/:id', ExpenseCategoryController.remove);

// Status management
router.patch(
  '/expense-category/:id/toggle',
  ExpenseCategoryController.toggleStatus,
);

// ===== EXPENSE ROUTES =====
router.post('/expenses', ExpenseController.create);
router.get('/expenses', ExpenseController.list);
router.post('/expenses/bulk-get', ExpenseController.bulkGet);
router.patch('/expenses/bulk-status', ExpenseController.bulkUpdateStatus);
router.delete('/expenses/bulk-delete', ExpenseController.bulkDelete);
//====== EXPENSE REPORT ROUTES =====
router.get('/expenses/report', ExpenseController.approvedExpenseReport);
router.get('/expenses/:id', ExpenseController.get);
router.put('/expenses/:id', ExpenseController.update);
router.delete('/expenses/:id', ExpenseController.remove);
router.patch('/expenses/:id/approve', ExpenseController.approve);
router.patch('/expenses/:id/reject', ExpenseController.reject);
router.patch('/expenses/:id/pending', ExpenseController.pending);


// ===== TENANT TAX ROUTES =====
router.post('/taxes', TenantTaxController.create);
router.get('/taxes', TenantTaxController.list);
router.post('/taxes/bulk-get', TenantTaxController.bulkGet);
router.delete('/taxes/bulk-delete', TenantTaxController.bulkSoftDelete);
router.patch('/taxes/bulk-status', TenantTaxController.bulkUpdateStatus);
router.get('/taxes/active', TenantTaxController.getActiveTaxes);
router.get('/taxes/:id', TenantTaxController.getById);
router.put('/taxes/:id', TenantTaxController.update);
router.delete('/taxes/:id', TenantTaxController.softDelete);

// ===== TENANT COUPON ROUTES =====
// Core CRUD operations
router.post('/coupon', TenantCouponController.create);
router.get('/coupon', TenantCouponController.list);

// Statistics and analytics (must come before :id routes)
router.get('/coupon/stats', TenantCouponController.getCouponStats);
router.get('/coupon/analytics', TenantCouponController.getCouponAnalytics);
router.get('/coupon/cache-stats', TenantCouponController.getCacheStats);

// Maintenance operations (must come before :id routes)
router.post(
  '/coupon/cleanup-expired',
  TenantCouponController.cleanupExpiredCoupons,
);

// Bulk operations (must come before :id routes)
router.post('/coupon/bulk-get', TenantCouponController.bulkGet);
router.patch('/coupon/bulk-status', TenantCouponController.bulkUpdateStatus);
router.delete('/coupon/bulk-delete', TenantCouponController.bulkDelete);

// Coupon code operations (must come before :id routes)
router.get('/coupon/code/:code', TenantCouponController.getByCode);
router.post('/coupon/validate', TenantCouponController.validateCoupon);
router.get('/coupon/active', TenantCouponController.getActive);

// Discount calculation (must come before :id routes)
router.post(
  '/coupon/:couponId/calculate-discount',
  TenantCouponController.calculateDiscount,
);

// Generic :id routes (must come after all specific routes)
router.get('/coupon/:id', TenantCouponController.get);
router.put('/coupon/:id', TenantCouponController.update);
router.delete('/coupon/:id', TenantCouponController.remove);

// Status management
router.patch('/coupon/:id/toggle-status', TenantCouponController.toggleStatus);

// ===== PURCHASE ORDER ROUTES =====
// More specific routes must come before generic :id routes
// ===== PURCHASE ORDER ROUTES =====
router.post('/purchase-order', PurchaseOrderController.create);
router.get('/purchase-order', PurchaseOrderController.list);
router.post('/purchase-order/bulk-get', PurchaseOrderController.bulkGet);
router.patch('/purchase-order/bulk-status', PurchaseOrderController.bulkUpdateStatus);
router.delete('/purchase-order/bulk-delete', PurchaseOrderController.bulkDelete);

// Specific routes before parameterized ones
router.get('/purchase-order/report-data', PurchaseOrderController.getPurchaseReportData);

// Parameterized routes
router.patch('/purchase-order/:id/status', PurchaseOrderController.changeStatus);
router.post('/purchase-order/:id/invoice', PurchaseOrderController.generateInvoice);
router.get('/purchase-order/:id/send-email', PurchaseOrderController.sendEmail);
router.get('/purchase-order/:id', PurchaseOrderController.get);
router.put('/purchase-order/:id', PurchaseOrderController.update);
router.delete('/purchase-order/:id', PurchaseOrderController.remove);
router.get('/purchase-order-form', PurchaseOrderController.getInitialData)

// ===== PURCHASE RETURN ROUTES =====
router.get('/purchase-return', PurchaseReturnController.list);
router.post('/purchase-return/bulk-get', PurchaseReturnController.bulkGet);
router.delete(
  '/purchase-return/bulk-delete',
  PurchaseReturnController.bulkDelete,
);
router.get('/purchase-return/:id', PurchaseReturnController.getById);
router.post('/purchase-return', PurchaseReturnController.createDraft);
router.patch(
  '/purchase-return/:id/status',
  PurchaseReturnController.changeStatus,
);
router.get('/purchase-return/:id/invoice', PurchaseReturnController.downloadInvoice);
router.put('/purchase-return/:id', PurchaseReturnController.update);
router.delete('/purchase-return/:id', PurchaseReturnController.remove);
router.patch('/purchase-return/bulk-status', PurchaseReturnController.bulkUpdateStatus);

// ===== CUSTOMER ROUTES =====
// Core CRUD operations (specific routes first)
router.post('/customer', CustomerController.create);
router.get('/customer', CustomerController.list);
router.get('/customer/active', CustomerController.getActive);
router.get('/customer/stats', CustomerController.getStatistics);
router.get('/customer/count', CustomerController.getCount);

// Search and filtering (must come before :id routes)
router.get('/customer/search', CustomerController.search);
router.get('/customer/find/email', CustomerController.findByEmail);
router.get('/customer/find/phone', CustomerController.findByPhone);
router.get('/customer/status/:status', CustomerController.getByStatus);
router.get('/customer/gender/:gender', CustomerController.getByGender);
router.get('/customer/location', CustomerController.getByLocation);

// Bulk operations (must come before :id routes)
router.post('/customer/bulk-get', CustomerController.bulkGet);
router.patch('/customer/bulk-status', CustomerController.bulkUpdateStatus);
router.patch('/customer/bulk-soft-delete', CustomerController.bulkSoftDelete);

// Generic :id routes (must come after all specific routes)
router.get('/customer/:id', CustomerController.getById);
router.put('/customer/:id', CustomerController.update);
router.delete('/customer/:id', CustomerController.remove);

// Soft delete operations
router.patch('/customer/:id/soft-delete', CustomerController.softDelete);
router.patch('/customer/:id/restore', CustomerController.restore);

// Status managementstop
router.patch('/customer/:id/toggle', CustomerController.toggleStatus);

// ===== SALES ROUTES =====
// Preview/calculation endpoints (must come before CRUD routes)
router.post('/sales/preview-billing', SalesController.previewBilling);
router.get('/sales/:saleId/preview-billing', SalesController.previewBilling); // GET route for preview by saleId
router.post('/sales/validate-loyalty-redemption', SalesController.validateLoyaltyRedemption);
router.post('/redemption-rule/validate', SalesController.getBestRedemptionRule);

// Core CRUD operations
router.post('/sales', SalesController.create);
router.get('/sales', SalesController.list);

// Report route
router.get('/sales/report', SalesController.getReportData);

// Statistics and analytics (must come before :id routes)
router.get('/sales/stats', SalesController.getStatistics);
router.get('/sales/revenue', SalesController.getRevenue);
router.get('/sales/count', SalesController.getCount);

// Filtering routes (must come before :id routes)
router.get('/sales/store/:storeId', SalesController.getByStore);
router.get('/sales/customer/:customerId', SalesController.getByCustomer);
router.get('/sales/date-range', SalesController.getByDateRange);
router.get('/sales/payment-status/:status', SalesController.getByPaymentStatus);
router.get(
  '/sales/fulfillment-status/:status',
  SalesController.getByFulfillmentStatus,
);

// Invoice number lookup (must come before :id routes)
router.get('/sales/invoice/:invoiceNumber', SalesController.getByInvoiceNumber);

// Bulk operations (must come before :id routes)
router.post('/sales/bulk-get', SalesController.bulkGet);
router.patch('/sales/bulk-status', SalesController.bulkUpdateStatus);
router.patch('/sales/bulk-soft-delete', SalesController.bulkSoftDelete);

// Domain-specific operations with :id (must come before generic :id routes)
router.patch('/sales/:id/payment-status', SalesController.updatePaymentStatus);
router.post('/sales/:id/payment-detail', SalesController.addPaymentDetail);
router.post('/sales/:id/approve-payment', SalesController.approvePayment);
router.patch(
  '/sales/:id/fulfillment-status',
  SalesController.updateFulfillmentStatus,
);
router.patch('/sales/:id/restore', SalesController.restore);
router.patch('/sales/:id/soft-delete', SalesController.softDelete);

// Generic :id routes (must come after all specific routes)
router.get('/sales/:id', SalesController.getById);
router.put('/sales/:id', SalesController.update);
router.delete('/sales/:id', SalesController.remove);

// ===== SALES RETURN ROUTES =====
router.post('/sales-return', SalesReturnController.createDraft);
router.get('/sales-return', SalesReturnController.list);
router.get('/sales-return/:id', SalesReturnController.getById);
router.put('/sales-return/:id', SalesReturnController.update);
router.delete('/sales-return/:id', SalesReturnController.remove);
router.patch('/sales-return/:id/status', SalesReturnController.changeStatus);
router.post('/sales-return/:id/complete', SalesReturnController.complete);
router.post('/sales-return/:id/refund', SalesReturnController.recordRefund);

// ===== GIFT CARD ROUTES =====
// CRUD Operations
router.post('/gift-card', GiftCardController.create);
router.get('/gift-card', GiftCardController.list);

// Validation and query routes (must come before :id routes)
router.post('/gift-card/validate', GiftCardController.validate);
router.get(
  '/gift-card/by-customer/:customerId',
  GiftCardController.getByCustomer,
);
router.get('/gift-card/active', GiftCardController.getActive);
router.get('/gift-card/by-value-range', GiftCardController.getByValueRange);

// Reporting routes (must come before :id routes)
router.get('/gift-card/expired', GiftCardController.getExpired);
router.get('/gift-card/expiring-soon', GiftCardController.getExpiringSoon);

// Bulk operations (must come before :id routes)
router.post('/gift-card/bulk-get', GiftCardController.bulkGet);
router.patch('/gift-card/bulk-status', GiftCardController.bulkUpdateStatus);
router.delete('/gift-card/bulk-delete', GiftCardController.bulkDelete);

// Domain-specific operations with :id (must come before generic :id routes)
router.post('/gift-card/:id/activate', GiftCardController.activate);
router.post('/gift-card/:id/deactivate', GiftCardController.deactivate);
router.post(
  '/gift-card/:id/assign-customers',
  GiftCardController.assignCustomers,
);
router.post(
  '/gift-card/:id/remove-customer',
  GiftCardController.removeCustomer,
);

// Generic :id routes (must come after all specific routes)
router.get('/gift-card/:id', GiftCardController.getById);
router.put('/gift-card/:id', GiftCardController.update);
router.delete('/gift-card/:id', GiftCardController.delete);

// ===== STOCK TRANSFER ROUTES =====
// Statistics and query routes (must come before :id routes)
router.get('/stock-transfer/stats', StockController.getTransferStats);
router.get('/stock-transfer/pending', StockController.getPendingTransfers);
router.get(
  '/stock-transfer/requiring-action',
  StockController.getTransfersRequiringAction,
);
router.get(
  '/stock-transfer/date-range',
  StockController.getTransfersByDateRange,
);

// Bulk operations (must come before :id routes)
router.post(
  '/stock-transfer/bulk-get',
  StockController.bulkGetTransfers,
);
router.patch(
  '/stock-transfer/bulk-status',
  StockController.bulkUpdateTransferStatus,
);
router.delete(
  '/stock-transfer/bulk-delete',
  StockController.bulkDeleteTransfers,
);

// Core CRUD operations
router.post('/stock-transfer', StockController.createTransfer);
router.get('/stock-transfer', StockController.getTransfers);

// Domain-specific operations with :id (must come before generic :id routes)
router.patch('/stock-transfer/:id/pending', StockController.pendingTransfer);
router.patch('/stock-transfer/:id/approve', StockController.approveTransfer);
router.patch('/stock-transfer/:id/complete', StockController.completeTransfer);
router.patch('/stock-transfer/:id/cancel', StockController.cancelTransfer);

// Generic :id routes (must come after all specific routes)
router.get('/stock-transfer/:id', StockController.getTransfer);
router.put('/stock-transfer/:id', StockController.updateTransfer);
router.delete('/stock-transfer/:id', StockController.deleteTransfer);

// ===== STOCK ADJUSTMENT ROUTES =====
// Statistics and query routes (must come before :id routes)
router.get(
  '/stock-adjustment/stats',
  StockAdjustmentController.getAdjustmentStats,
);
router.get(
  '/stock-adjustment/pending',
  StockAdjustmentController.getPendingAdjustments,
);
router.get(
  '/stock-adjustment/recent',
  StockAdjustmentController.getRecentAdjustments,
);
router.get(
  '/stock-adjustment/by-store',
  StockAdjustmentController.getAdjustmentsByStore,
);
router.get(
  '/stock-adjustment/date-range',
  StockAdjustmentController.getAdjustmentsByDateRange,
);
router.get(
  '/stock-adjustment/product-summary',
  StockAdjustmentController.getProductAdjustmentSummary,
);
router.get(
  '/stock-adjustment/product-history',
  StockAdjustmentController.getProductAdjustmentHistory,
);

// Bulk operations (must come before :id routes)
router.post(
  '/stock-adjustment/bulk-get',
  StockAdjustmentController.bulkGetAdjustments,
);
router.patch(
  '/stock-adjustment/bulk-status',
  StockAdjustmentController.bulkUpdateAdjustmentStatus,
);
router.delete(
  '/stock-adjustment/bulk-delete',
  StockAdjustmentController.bulkDeleteAdjustments,
);

// Core CRUD operations
router.post('/stock-adjustment', StockAdjustmentController.createAdjustment);
router.get('/stock-adjustment', StockAdjustmentController.getAdjustments);

// Domain-specific operations with :id (must come before generic :id routes)
router.patch(
  '/stock-adjustment/:id/pending',
  StockAdjustmentController.pendingAdjustment,
);
router.patch(
  '/stock-adjustment/:id/approve',
  StockAdjustmentController.approveAdjustment,
);
router.patch(
  '/stock-adjustment/:id/cancel',
  StockAdjustmentController.cancelAdjustment,
);
router.patch(
  '/stock-adjustment/:id/complete',
  StockAdjustmentController.completeAdjustment,
);

// Generic :id routes (must come after all specific routes)
router.get('/stock-adjustment/:id', StockAdjustmentController.getAdjustment);
router.put('/stock-adjustment/:id', StockAdjustmentController.updateAdjustment);
router.delete(
  '/stock-adjustment/:id',
  StockAdjustmentController.deleteAdjustment,
);

router.post('/currencies', TenantCurrencySettingController.createCurrency);
router.get('/currencies', TenantCurrencySettingController.getAllCurrencies);
router.get('/currencies/primary', TenantCurrencySettingController.getPrimaryCurrency);
router.put('/currencies/:id', TenantCurrencySettingController.updateCurrency);
router.patch('/currencies/:id/set-primary', TenantCurrencySettingController.setAsPrimary);
router.delete('/currencies/:id', TenantCurrencySettingController.deleteCurrency);


// ===== UPLOAD ROUTES =====
router.post('/upload', upload.any(), UploadController.uploadSingle);
router.post('/upload/multiple', upload.any(), UploadController.uploadMultiple);

// ===== ACCESS CONTROL ROUTES (TAB-BASED) =====
router.post('/access-control/sync', AccessControlController.syncDefaultTabs);
router.get('/access-control', AccessControlController.getAllPermissions);
router.get('/access-control/me', AccessControlController.getMyPermissions);
router.get('/access-control/role/:roleName', AccessControlController.getRolePermissions);
router.put('/access-control/role/:roleName', AccessControlController.updateRolePermissions);

export default router;
