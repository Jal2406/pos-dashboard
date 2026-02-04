import express from 'express';
import { ShiftController, LeaveManageController, StoreController, AccessControlController } from '../controller/index.js';

const router = express.Router();


router.get('/stores/active', StoreController.getActiveStores);

// ===== LEAVE MANAGEMENT ROUTES =====
// Cashier can create leave requests for themselves
router.post('/leave', LeaveManageController.createLeaveRequest);

// Cashier can view their own leave requests
router.get('/leave/my-requests', LeaveManageController.getMyLeaveRequests);

// Cashier can update and cancel their own leave requests
router.put('/leave/:id', LeaveManageController.updateLeaveRequest);
router.patch('/leave/:id/cancel', LeaveManageController.cancelLeaveRequest);

// ===== ACCESS CONTROL (CASHIER SELF-PERMISSIONS) =====
// Cashier can only see their own effective tab permissions
router.get('/access-control/me', AccessControlController.getMyPermissions);

export default router;
