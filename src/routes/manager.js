import express from 'express';
import {
  EmployeeController,
  SubCategoryController,
  ShiftController,
  AttendanceController,
  LeaveManageController,
  AccessControlController,
} from '../controller/index.js';

const router = express.Router();

// ===== EMPLOYEE ROUTES =====
// Register specific routes BEFORE generic "/employee/:id" to avoid conflicts
// Employee queries and management (specific paths)
router.post('/employee', EmployeeController.createEmployee);
router.get('/employee/manager-stores', EmployeeController.getManagerStores);
// Remaining employee routes

router.put(
  '/employee/:employeeId/assign/:storeId',
  EmployeeController.assignEmployeeToStore,
);
router.put(
  '/employee/:employeeId/unassign',
  EmployeeController.unassignEmployeeFromStore,
);

// Basic CRUD operations (generic path after specifics)
router.get('/employee/:id', EmployeeController.getEmployeeById);
router.put('/employee/:id', EmployeeController.updateEmployee);
router.delete('/employee/:id', EmployeeController.deleteEmployee);
router.patch('/employee/toggle/:id', EmployeeController.toggleEmployeeStatus);

// ===== SUB-CATEGORY ROUTES =====
router.get('/subcategory', SubCategoryController.list);
router.get(
  '/subcategory/inventory',
  SubCategoryController.getSubcategoriesForInventory,
);
router.get('/subcategory/active', SubCategoryController.getActiveSubcategories);
router.get(
  '/subcategory/category/:categoryId',
  SubCategoryController.getByCategory,
);
router.get(
  '/subcategory/category/:categoryId/with-count',
  SubCategoryController.getSubcategoriesByCategoryWithCount,
);
router.get('/subcategory/:id', SubCategoryController.getById);

// ===== SHIFT ASSIGNMENT ROUTES =====
// Manager can manage shift assignments for their stores
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
// Manager can view attendance records for employees in their managed stores
router.get('/attendance', AttendanceController.getAllAttendanceRecords);
router.get('/attendance/:id', AttendanceController.getAttendanceById);

// Manager can only clock in/out for themselves (not create attendance for others)
router.post(
  '/attendance/shift/:shiftId/clock-in',
  AttendanceController.clockIn,
);
router.post(
  '/attendance/shift/:shiftId/clock-out',
  AttendanceController.clockOut,
);
router.post('/attendance/shift/:shiftId/break', AttendanceController.addBreak);

// Manager can mark attendance status for employees in their managed stores
router.post(
  '/attendance/shift/:shiftId/no-show',
  AttendanceController.markAsNoShow,
);
router.post(
  '/attendance/shift/:shiftId/leave',
  AttendanceController.markAsLeave,
);

// Manager can query attendance records for their stores
router.get(
  '/attendance/employee/:employeeId',
  AttendanceController.getAttendanceByEmployee,
);
router.get(
  '/attendance/store/:storeId',
  AttendanceController.getAttendanceByStoreAndDate,
);
router.get('/attendance/no-shows', AttendanceController.getNoShows);

// ===== LEAVE MANAGEMENT ROUTES =====
// Manager can create leave requests for themselves
router.post('/leave', LeaveManageController.createLeaveRequest);

// Manager can create approved leave requests for employees in their managed stores
router.post('/leave/approved', LeaveManageController.createApprovedLeave);

// Manager can view their own leave requests
router.get('/leave/my-requests', LeaveManageController.getMyLeaveRequests);

// Manager can update and cancel their own leave requests
router.put('/leave/:id', LeaveManageController.updateLeaveRequest);
router.patch('/leave/:id/cancel', LeaveManageController.cancelLeaveRequest);

// Manager can approve and reject leave requests for employees in their managed stores
router.patch('/leave/:id/approve', LeaveManageController.approveLeaveRequest);
router.patch('/leave/:id/reject', LeaveManageController.rejectLeaveRequest);

// Manager can view all leave requests with filtering (restricted to their managed stores)
router.get('/leave', LeaveManageController.getAllLeaveRequests);

// Manager can view all leave requests for all their managed stores
router.get('/leave/manager/all', LeaveManageController.getManagerLeaveRequests);

// Manager can view pending leave requests for all their managed stores
router.get(
  '/leave/manager/pending',
  LeaveManageController.getManagerPendingLeaveRequests,
);

// ===== ACCESS CONTROL (MANAGER SELF-PERMISSIONS) =====
// Manager can only see their own effective tab permissions
router.get('/access-control/me', AccessControlController.getMyPermissions);

export default router;
