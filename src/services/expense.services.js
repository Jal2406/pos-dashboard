import { BaseService } from '../utils/index.js';
import { applyStoreScope, validateStoreAccess } from '../utils/serviceGuard.js';
import {
  ExpenseSchema,
  ExpenseCategorySchema,
  StoreSchema,
  User,
  Business,
} from '../models/index.js';

const EXPENSE_STATUSES = ['approved', 'pending', 'rejected'];
const ALLOWED_SORT_FIELDS = [
  'expenseDate',
  'amount',
  'paymentMethod',
  'status',
  'createdAt',
  'updatedAt',
];
const REQUIRED_CREATE_FIELDS = [
  'expenseDate',
  'category',
  'description',
  'amount',
  'amount',
  'paymentMethod',
];

const PAYMENT_FIELD_GROUPS = {
  Cheque: ['chequeNumber'],
  'Bank Transfer': ['bankName', 'branchName', 'accountNumber', 'ifscCode'],
  'Credit Card': [
    'cardNumber',
    'cardHolderName',
    'cardType',
    'expiryMonth',
    'expiryYear',
  ],
  'Debit Card': [
    'cardNumber',
    'cardHolderName',
    'cardType',
    'expiryMonth',
    'expiryYear',
  ],
};

const ALL_PAYMENT_FIELDS = [
  'chequeNumber',
  'bankName',
  'branchName',
  'accountNumber',
  'ifscCode',
  'cardNumber',
  'cardHolderName',
  'cardType',
  'expiryMonth',
  'expiryYear',
];

class ExpenseServices extends BaseService {
  constructor(businessId = null) {
    if (!businessId) {
      throw new Error('ProductServices initialized without businessId');
    }
    super({
      modelName: 'Expense',
      schema: ExpenseSchema,
      collection: 'expenses',
      businessId,
    });
    
    // RBAC: Expenses are store-scoped
    this.rbacConfig.storeScoped = true;
    this.rbacConfig.storeIdField = 'store';
    
    this._referenceModelsReady = false;
  }

  async _ensureReferenceModels() {
    if (this._referenceModelsReady) {
      return;
    }

    await Promise.all([
      this.getModel('ExpenseCategory', ExpenseCategorySchema, 'expensecategories'),
      this.getModel('Store', StoreSchema, 'stores'),
    ]);
    this._referenceModelsReady = true;
  }

  async _getExpenseModel() {
    const ExpenseModel = await this.getModel();
    await this._ensureReferenceModels();
    return ExpenseModel;
  }

  async _populateUsers(data, fields = ['createdBy', 'approvedBy']) {
    if (!data) {
      return data;
    }

    const isArray = Array.isArray(data);
    const items = isArray ? data : [data];
    const ids = new Set();

    items.forEach((item) => {
      fields.forEach((field) => {
        if (item?.[field]) {
          ids.add(item[field].toString());
        }
      });
    });

    let usersMap = {};
    if (ids.size > 0) {
      const users = await User.find({ _id: { $in: Array.from(ids) } })
        .select('email')
        .lean();
      usersMap = users.reduce((acc, user) => {
        acc[user._id.toString()] = user;
        return acc;
      }, {});
    }

    items.forEach((item) => {
      fields.forEach((field) => {
        if (item?.[field]) {
          const userId = item[field].toString();
          item[field] = usersMap[userId] || item[field];
        }
      });
    });

    return isArray ? items : items[0];
  }

  async _ensureCategoryExists(categoryId) {
    if (!categoryId) {
      throw new Error('Category is required');
    }

    this.validateObjectId(categoryId);
    const CategoryModel = await this.getModel(
      'ExpenseCategory',
      ExpenseCategorySchema,
      'expensecategories',
    );

    const exists = await CategoryModel.exists({ _id: categoryId });
    if (!exists) {
      throw new Error('Expense category not found');
    }
  }

  _normalizeAmount(value, fieldName) {
    const amount = Number(value);
    if (Number.isNaN(amount) || amount < 0) {
      throw new Error(`${fieldName} must be a positive number`);
    }
    return amount;
  }

  _validatePaymentDetails(paymentMethod, data) {
    const allowed = PAYMENT_FIELD_GROUPS[paymentMethod] || [];
    const forbidden = ALL_PAYMENT_FIELDS.filter(
      (field) => !allowed.includes(field),
    );

    for (const field of forbidden) {
      if (
        data[field] !== undefined &&
        data[field] !== null &&
        data[field] !== ''
      ) {
        throw new Error(
          `Field '${field}' is not allowed for payment method '${paymentMethod}'`,
        );
      }
    }
  }

  _cleanPaymentFields(payload, paymentMethod) {
    const allowed = PAYMENT_FIELD_GROUPS[paymentMethod] || [];
    const forbidden = ALL_PAYMENT_FIELDS.filter(
      (field) => !allowed.includes(field),
    );

    forbidden.forEach((field) => {
      payload[field] = null;
    });
  }

  async create(data = {}, businessId, userId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }
      if (!userId) {
        throw new Error('User ID is required');
      }

      this.validateRequiredFields(data, REQUIRED_CREATE_FIELDS);
      this._validatePaymentDetails(data.paymentMethod, data);
      await this._ensureCategoryExists(data.category);

      const amount = this._normalizeAmount(data.amount, 'Amount');
      const payload = {
        ...data,
        amount,
        expenseDate: new Date(data.expenseDate),
        createdBy: userId,
        updatedBy: userId,
      };

      const Model = await this._getExpenseModel();
      const created = await Model.create(payload);
      await created.populate({ path: 'store', select: 'name' });
      const plain = created.toObject ? created.toObject() : created;

      return await this._populateUsers(plain);
    } catch (error) {
      throw new Error(`Error creating expense: ${error.message}`);
    }
  }

  _shouldFetchAll(all) {
    if (typeof all === 'string') {
      return all.toLowerCase() === 'true';
    }
    return Boolean(all);
  }

  async list(queryParams = {}, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      await this._ensureReferenceModels();

      const {
        page = 1,
        limit = 10,
        search = '',
        sortBy = 'createdAt',
        sortOrder = 'desc',
        status,
        categoryId,
        paymentMethod,
        minAmount,
        maxAmount,
        startDate,
        endDate,
        includeCategory = 'true',
        all,
      } = queryParams;

      const filters = {};

      if (status && EXPENSE_STATUSES.includes(status)) {
        filters.status = status;
      }

      if (categoryId) {
        this.validateObjectId(categoryId);
        filters.category = categoryId;
      }

      if (paymentMethod) {
        filters.paymentMethod = paymentMethod;
      }

      if (startDate || endDate) {
        filters.expenseDate = {};
        if (startDate) {
          filters.expenseDate.$gte = new Date(startDate);
        }
        if (endDate) {
          filters.expenseDate.$lte = new Date(endDate);
        }
      }

      if (minAmount || maxAmount) {
        filters.amount = {};
        if (minAmount) {
          filters.amount.$gte = this._normalizeAmount(minAmount, 'minAmount');
        }
        if (maxAmount) {
          filters.amount.$lte = this._normalizeAmount(maxAmount, 'maxAmount');
        }
      }

      const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy)
        ? sortBy
        : 'createdAt';

      const populate = [{ path: 'store', select: 'name' }];
      if (includeCategory !== 'false') {
        populate.push({
          path: 'category',
          select: 'name',
        });
      }

      const shouldFetchAll = this._shouldFetchAll(all);

      if (shouldFetchAll) {
        const Model = await this._getExpenseModel();
        const searchFields = ['description', 'reference', 'category.name'];
        let finalFilter = { ...filters };

        // RBAC: Apply store scoping if entity is store-scoped
        if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
          applyStoreScope(finalFilter, this.rbacConfig.storeIdField);
        }

        if (search && searchFields.length > 0) {
          finalFilter.$or = searchFields.map((field) => ({
            [field]: { $regex: search, $options: 'i' },
          }));
        }

        const sort = {};
        sort[safeSortBy] = sortOrder === 'desc' ? -1 : 1;

        const data = await Model.find(finalFilter)
          .sort(sort)
          .populate(populate)
          .lean({ virtuals: true });

        const items = data.map((doc) => (doc.toObject ? doc.toObject() : doc));
        const populatedItems = await this._populateUsers(items);

        return {
          data: populatedItems,
          total: data.length,
        };
      }

      const result = await super.list({
        page,
        limit,
        search,
        searchFields: ['description', 'reference', 'category.name'],
        sortBy: safeSortBy,
        sortOrder,
        filters,
        populate,
      });

      const items = result.data.map((doc) =>
        doc.toObject ? doc.toObject() : doc,
      );

      const populatedItems = await this._populateUsers(items);

      return {
        data: populatedItems,
        pagination: result.pagination,
      };
    } catch (error) {
      throw new Error(`Error listing expenses: ${error.message}`);
    }
  }

  async getById(id, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      this.validateObjectId(id);
      const Model = await this._getExpenseModel();
      const expense = await Model.findById(id)
        .populate({ path: 'category', select: 'name description status' })
        .populate({ path: 'store', select: 'name' })
        .lean();

      if (!expense) {
        throw new Error(`Expense with id ${id} not found`);
      }

      // RBAC: Validate store access if entity is store-scoped
      if (this.rbacConfig.enabled && this.rbacConfig.storeScoped && expense.store) {
        const storeId = typeof expense.store === 'object' ? expense.store._id : expense.store;
        validateStoreAccess(storeId);
      }

      return await this._populateUsers(expense);
    } catch (error) {
      throw new Error(`Error retrieving expense: ${error.message}`);
    }
  }

  async updateById(id, data = {}, businessId, userId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }
      if (!userId) {
        throw new Error('User ID is required');
      }

      this.validateObjectId(id);
      const Model = await this._getExpenseModel();
      const expense = await Model.findById(id);

      if (!expense) {
        throw new Error(`Expense with id ${id} not found`);
      }

      if (expense.status === 'approved') {
        throw new Error('Cannot update an approved expense');
      }

      const allowedFields = [
        'expenseDate',
        'category',
        'description',
        'amount',
        'paymentMethod',
        'reference',
        'bankName',
        'branchName',
        'accountNumber',
        'ifscCode',
        'chequeNumber',
        'cardNumber',
        'cardHolderName',
        'cardType',
        'expiryMonth',
        'expiryYear',
      ];
      const payload = {};

      allowedFields.forEach((field) => {
        if (data[field] !== undefined) {
          payload[field] = data[field];
        }
      });

      if (!Object.keys(payload).length) {
        throw new Error('No valid fields provided for update');
      }

      if (payload.category) {
        await this._ensureCategoryExists(payload.category);
      }

      if (payload.expenseDate) {
        payload.expenseDate = new Date(payload.expenseDate);
      }

      if (payload.amount !== undefined) {
        payload.amount = this._normalizeAmount(payload.amount, 'Amount');
      }

      payload.updatedBy = userId;
      payload.updatedAt = new Date();

      const targetPaymentMethod = payload.paymentMethod || expense.paymentMethod;
      this._validatePaymentDetails(targetPaymentMethod, data);

      if (
        payload.paymentMethod &&
        payload.paymentMethod !== expense.paymentMethod
      ) {
        this._cleanPaymentFields(payload, payload.paymentMethod);
      }

      const updated = await Model.findOneAndUpdate({ _id: id }, payload, {
        new: true,
        runValidators: true,
      })
        .populate({ path: 'category', select: 'name description status' })
        .populate({ path: 'store', select: 'name' })
        .lean();

      return await this._populateUsers(updated);
    } catch (error) {
      throw new Error(`Error updating expense: ${error.message}`);
    }
  }

  async deleteById(id, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      this.validateObjectId(id);
      const Model = await this._getExpenseModel();
      const expense = await Model.findById(id);

      if (!expense) {
        throw new Error(`Expense with id ${id} not found`);
      }

      if (expense.status === 'approved') {
        throw new Error('Cannot delete an approved expense');
      }

      const deleted = await Model.findOneAndDelete({ _id: id }).lean();

      return deleted;
    } catch (error) {
      throw new Error(`Error deleting expense: ${error.message}`);
    }
  }

  async approveExpense(id, businessId, userId) {
    try {
      if (!businessId) throw new Error('Business ID is required');
      if (!userId) throw new Error('User ID is required');

      this.validateObjectId(id);
      const Model = await this._getExpenseModel();
      const expense = await Model.findById(id);

      if (!expense) throw new Error(`Expense with id ${id} not found`);

      if (expense.status !== 'pending') {
        throw new Error('Only pending expenses can be approved');
      }

      expense.status = 'approved';
      expense.updatedBy = userId;
      expense.updatedAt = new Date();
      expense.approvedBy = userId;
      expense.approvedAt = new Date();
      expense.rejectionReason = null;

      const saved = await expense.save();
      const plain = saved.toObject ? saved.toObject() : saved;

      return await this._populateUsers(plain);
    } catch (error) {
      throw new Error(`Error approving expense: ${error.message}`);
    }
  }

  async rejectExpense(id, reason, businessId, userId) {
    try {
      if (!businessId) throw new Error('Business ID is required');
      if (!userId) throw new Error('User ID is required');

      this.validateObjectId(id);
      const Model = await this._getExpenseModel();
      const expense = await Model.findById(id);

      if (!expense) throw new Error(`Expense with id ${id} not found`);

      if (expense.status !== 'pending') {
        throw new Error('Only pending expenses can be rejected');
      }

      expense.status = 'rejected';
      expense.updatedBy = userId;
      expense.updatedAt = new Date();
      expense.approvedBy = null;
      expense.approvedAt = null;
      expense.rejectionReason = reason || null;

      const saved = await expense.save();
      const plain = saved.toObject ? saved.toObject() : saved;

      return await this._populateUsers(plain);
    } catch (error) {
      throw new Error(`Error rejecting expense: ${error.message}`);
    }
  }

  async pendingExpense(id, businessId, userId) {
    try {
      if (!businessId) throw new Error('Business ID is required');
      if (!userId) throw new Error('User ID is required');

      this.validateObjectId(id);
      const Model = await this._getExpenseModel();
      const expense = await Model.findById(id);

      if (!expense) throw new Error(`Expense with id ${id} not found`);

      if (expense.status === 'approved') {
        throw new Error('Cannot change status of approved expense to pending');
      }

      if (expense.status === 'pending') {
        throw new Error('Expense is already pending');
      }

      expense.status = 'pending';
      expense.updatedBy = userId;
      expense.updatedAt = new Date();
      expense.approvedBy = null;
      expense.approvedAt = null;
      expense.rejectionReason = null;

      const saved = await expense.save();
      const plain = saved.toObject ? saved.toObject() : saved;

      return await this._populateUsers(plain);
    } catch (error) {
      throw new Error(`Error changing expense status to pending: ${error.message}`);
    }
  }

  async bulkGet(payload, businessId) {
    try {
      if (!businessId) throw new Error('Business ID is required');
      const { ids } = payload;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs must be a non-empty array');
      }

      const Model = await this._getExpenseModel();
      const expenses = await Model.find({ _id: { $in: ids } })
        .populate({ path: 'category', select: 'name' })
        .populate({ path: 'store', select: 'name' })
        .lean();

      const populated = await this._populateUsers(expenses);
      return { data: populated };
    } catch (error) {
      throw new Error(`Error fetching bulk expenses: ${error.message}`);
    }
  }

  async bulkUpdateStatus(payload, businessId, userId) {
    try {
      if (!businessId) throw new Error('Business ID is required');
      if (!userId) throw new Error('User ID is required');

      const { ids, status, reason } = payload;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs must be a non-empty array');
      }

      if (!['approved', 'rejected', 'pending'].includes(status)) {
        throw new Error('Invalid status');
      }

      const Model = await this._getExpenseModel();

      const query = { _id: { $in: ids }, status: 'pending' };

      const updateData = {
        status,
        updatedBy: userId,
        updatedAt: new Date(),
      };

      if (status === 'approved') {
        updateData.approvedBy = userId;
        updateData.approvedAt = new Date();
        updateData.rejectionReason = null;
      } else if (status === 'rejected') {
        updateData.approvedBy = null;
        updateData.approvedAt = null;
        updateData.rejectionReason = reason || null;
      } else if (status === 'pending') {
        updateData.approvedBy = null;
        updateData.approvedAt = null;
        updateData.rejectionReason = null;
      }

      const result = await Model.updateMany(query, { $set: updateData });

      return {
        updatedCount: result.modifiedCount,
        matchedCount: result.matchedCount,
        message: `Successfully updated ${result.modifiedCount} expenses`,
      };
    } catch (error) {
      throw new Error(`Error updating bulk expenses status: ${error.message}`);
    }
  }

  async bulkDelete(payload, businessId) {
    try {
      if (!businessId) throw new Error('Business ID is required');
      const { ids } = payload;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs must be a non-empty array');
      }

      const results = [];

      for (const id of ids) {
        try {
          this.validateObjectId(id);
          // deleteById handles the status check (throws if approved) and existence check
          await this.deleteById(id, businessId);
          results.push({
            id,
            success: true,
            message: 'Deleted successfully',
          });
        } catch (error) {
          results.push({
            id,
            success: false,
            message: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Error deleting bulk expenses: ${error.message}`);
    }
  }

  async generateApprovedExpenseReport(filters = {}, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      const {
        categoryName,
        storeName,
        fromDate,
        toDate,
        minAmount,
        maxAmount,
        page = 1,
        limit = 10,
      } = filters;

      const Model = await this._getExpenseModel();

      const pageNum = Math.max(Number(page), 1);
      const limitNum = Math.max(Number(limit), 1);
      const skip = (pageNum - 1) * limitNum;

      /** -------------------------
       * DERIVED DATES
       * -------------------------
       */
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const effectiveFromDate = fromDate ? new Date(fromDate) : today;
      const effectiveToDate = toDate ? new Date(toDate) : null;

      /** -------------------------
       * BASE MATCH
       * -------------------------
       */
      const matchStage = {
        status: { $regex: /^approved$/i },
        expenseDate: { $gte: effectiveFromDate },
        amount: {
          $gte:
            minAmount !== undefined && minAmount !== null
              ? this._normalizeAmount(minAmount, 'minAmount')
              : 0,
        },
      };

      if (effectiveToDate) {
        matchStage.expenseDate.$lte = effectiveToDate;
      }

      if (maxAmount !== undefined && maxAmount !== null) {
        matchStage.amount.$lte = this._normalizeAmount(maxAmount, 'maxAmount');
      }

      /** =================================================
       * COMMON LOOKUP PIPELINE
       * =================================================
       */
      const baseLookupPipeline = [
        { $match: matchStage },

        // Category
        {
          $lookup: {
            from: 'expensecategories',
            localField: 'category',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: '$category' },

        // Store
        {
          $lookup: {
            from: 'stores',
            localField: 'store',
            foreignField: '_id',
            as: 'store',
          },
        },
        { $unwind: '$store' },

        // Expense By (User)
        {
          $lookup: {
            from: 'users',
            localField: 'createdBy',
            foreignField: '_id',
            as: 'createdBy',
          },
        },
        {
          $unwind: {
            path: '$createdBy',
            preserveNullAndEmptyArrays: true,
          },
        },
      ];

      if (categoryName) {
        baseLookupPipeline.push({
          $match: {
            'category.name': { $regex: `^${categoryName}$`, $options: 'i' },
          },
        });
      }

      if (storeName) {
        baseLookupPipeline.push({
          $match: {
            'store.name': { $regex: `^${storeName}$`, $options: 'i' },
          },
        });
      }

      /** =================================================
       * CATEGORY BREAKDOWN
       * =================================================
       */
      const categoryBreakdown = await Model.aggregate([
        ...baseLookupPipeline,
        {
          $group: {
            _id: '$category._id',
            categoryName: { $first: '$category.name' },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]);

      /** =================================================
       * PAGINATED EXPENSES (FINAL REPORT DATA)
       * =================================================
       */
      /** =================================================
       * PAGINATED EXPENSES (FINAL REPORT DATA)
       * =================================================
       */
      const expenses = await Model.aggregate([
        ...baseLookupPipeline,
        { $sort: { createdAt: -1 } }, // Apply FILO (LIFO) sort based on creation
        {
          $project: {
            _id: 0,
            expenseName: {
              $ifNull: ['$expenseName', '$description'],
            },
            expenseCategory: '$category.name', // Changed from category to expenseCategory
            description: '$description',
            amount: '$amount',
            approvedDate: '$expenseDate',
            status: '$status', // Added status to projection
            expenseBy: {
              $ifNull: ['$createdBy.name', 'Admin'],
            },
            store: '$store.name',
          },
        },
        { $skip: skip },
        { $limit: limitNum },
      ]);

      /** =================================================
       * PAGINATED SUMMARY
       * =================================================
       */
      const paginatedSummaryAgg = await Model.aggregate([
        ...baseLookupPipeline,
        { $sort: { createdAt: -1 } }, // Match sort order for summary calculation
        { $skip: skip },
        { $limit: limitNum },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            totalExpenses: { $sum: 1 },
          },
        },
      ]);

      const summary = paginatedSummaryAgg[0] || {
        totalAmount: 0,
        totalExpenses: 0,
      };

      /** =================================================
       * TOTAL COUNT
       * =================================================
       */
      const totalCountAgg = await Model.aggregate([
        ...baseLookupPipeline,
        { $count: 'count' },
      ]);

      const totalRecords = totalCountAgg[0]?.count || 0;
      const totalPages = Math.ceil(totalRecords / limitNum);

      /** -------------------------
       * FINAL RESPONSE
       * -------------------------
       */
      return {
        filters: {
          categoryName: categoryName || null,
          storeName: storeName || null,
          fromDate: effectiveFromDate,
          toDate: effectiveToDate,
          minAmount: minAmount ?? 0,
          maxAmount: maxAmount ?? null,
          page: pageNum,
          limit: limitNum,
        },
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: totalRecords,
          itemsPerPage: limitNum,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
        summary,
        categoryBreakdown,
        expenses,
      };

    } catch (error) {
      throw new Error(`Error generating expense report: ${error.message}`);
    }
  }

  /**
   * ===============================
   * BUSINESS / ROLE CONTEXT HELPERS
   * ===============================
   */

  async getBusinessIdForUser(currentUser) {
    const userRole = currentUser.roleId?.name;

    if (userRole === 'admin') {
      const business = await Business.findOne({ owner: currentUser._id })
        .select('_id')
        .lean()
        .exec();

      if (!business) {
        throw new Error('Business not found for admin user');
      }

      return business._id;
    }

    if (userRole === 'manager') {
      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
      const store = await StoreModel.findOne({ manager: currentUser._id })
        .select('owner')
        .lean()
        .exec();

      if (!store) {
        throw new Error('Store not found for manager user');
      }

      const business = await Business.findOne({ owner: store.owner })
        .select('_id')
        .lean()
        .exec();

      if (!business) {
        throw new Error('Business not found for store owner');
      }

      return business._id;
    }

    throw new Error('Unable to determine business for user role: ' + userRole);
  }

  async _getManagerStoreId(currentUser) {
    const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
    const store = await StoreModel.findOne({ manager: currentUser._id })
      .select('_id')
      .lean()
      .exec();

    return store?._id || null;
  }

  async _validateExpenseStoreAccess(expense, currentUser, businessId) {
    const userRole = currentUser.roleId?.name;

    // Superadmin (if present) can access everything
    if (userRole === 'superadmin') {
      return;
    }

    // Admin: must belong to their business if businessId is present on expense
    if (userRole === 'admin') {
      if (
        expense.businessId &&
        expense.businessId.toString() !== businessId.toString()
      ) {
        throw new Error(
          'Unauthorized: You can only manage expenses in your business',
        );
      }
      return;
    }

    // Manager: must be manager of the store on the expense
    if (userRole === 'manager') {
      if (!expense.store) {
        throw new Error('Unauthorized: Expense is not linked to a store');
      }

      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
      const store = await StoreModel.findById(expense.store)
        .select('manager')
        .lean()
        .exec();

      if (!store) {
        throw new Error('Store not found for expense');
      }

      if (store.manager.toString() !== currentUser._id.toString()) {
        throw new Error(
          'Unauthorized: You can only manage expenses for your own store',
        );
      }
      return;
    }

    throw new Error(
      'Unauthorized: Only admin and manager can manage expenses',
    );
  }

  /**
   * ===============================
   * BUSINESS CONTEXT OPERATIONS
   * ===============================
   */

  /**
   * List expenses with business / role context.
   * - Admin: all expenses in their business.
   * - Manager: only expenses for the store they manage.
   */
  async listWithBusinessContext(queryParams = {}, currentUser) {
    const userRole = currentUser.roleId?.name;

    if (userRole !== 'admin' && userRole !== 'manager') {
      throw new Error(
        'Unauthorized: Only admin and manager can view expenses',
      );
    }

    const businessId = await this.getBusinessIdForUser(currentUser);
    const shouldFetchAll = this._shouldFetchAll(queryParams.all);

    // Manager: force store filter to manager's own store
    if (userRole === 'manager') {
      const managerStoreId = await this._getManagerStoreId(currentUser);

      if (!managerStoreId) {
        // No store assigned – return empty result in correct shape
        if (shouldFetchAll) {
          return { data: [], total: 0 };
        }

        const pageNum = Number(queryParams.page) || 1;
        const limitNum = Number(queryParams.limit) || 10;

        return {
          data: [],
          pagination: {
            currentPage: pageNum,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: limitNum,
            hasNext: false,
            hasPrev: false,
          },
        };
      }

      // If caller passed a store filter, ensure it matches manager store
      if (
        queryParams.storeId &&
        queryParams.storeId.toString() !== managerStoreId.toString()
      ) {
        if (shouldFetchAll) {
          return { data: [], total: 0 };
        }

        const pageNum = Number(queryParams.page) || 1;
        const limitNum = Number(queryParams.limit) || 10;

        return {
          data: [],
          pagination: {
            currentPage: pageNum,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: limitNum,
            hasNext: false,
            hasPrev: false,
          },
        };
      }

      // Inject manager's store filter (service list will map it to filters.store)
      queryParams = {
        ...queryParams,
        storeId: managerStoreId.toString(),
      };
    }

    return this.list(queryParams, businessId);
  }

  /**
   * Approve expense with business / role context.
   */
  async approveExpenseWithBusinessContext(id, currentUser) {
    try {
      const businessId = await this.getBusinessIdForUser(currentUser);
      const userId = currentUser._id;

      this.validateObjectId(id);

      const Model = await this._getExpenseModel();
      const expense = await Model.findById(id).lean();

      if (!expense) {
        throw new Error(`Expense with id ${id} not found`);
      }

      await this._validateExpenseStoreAccess(expense, currentUser, businessId);

      return this.approveExpense(id, businessId, userId);
    } catch (error) {
      throw new Error(
        `Error approving expense with business context: ${error.message}`,
      );
    }
  }

  /**
   * Reject expense with business / role context.
   */
  async rejectExpenseWithBusinessContext(id, reason, currentUser) {
    try {
      const businessId = await this.getBusinessIdForUser(currentUser);
      const userId = currentUser._id;

      this.validateObjectId(id);

      const Model = await this._getExpenseModel();
      const expense = await Model.findById(id).lean();

      if (!expense) {
        throw new Error(`Expense with id ${id} not found`);
      }

      await this._validateExpenseStoreAccess(expense, currentUser, businessId);

      return this.rejectExpense(id, reason, businessId, userId);
    } catch (error) {
      throw new Error(
        `Error rejecting expense with business context: ${error.message}`,
      );
    }
  }

  /**
   * Mark expense as pending with business / role context.
   */
  async pendingExpenseWithBusinessContext(id, currentUser) {
    try {
      const businessId = await this.getBusinessIdForUser(currentUser);
      const userId = currentUser._id;

      this.validateObjectId(id);

      const Model = await this._getExpenseModel();
      const expense = await Model.findById(id).lean();

      if (!expense) {
        throw new Error(`Expense with id ${id} not found`);
      }

      await this._validateExpenseStoreAccess(expense, currentUser, businessId);

      return this.pendingExpense(id, businessId, userId);
    } catch (error) {
      throw new Error(
        `Error changing expense status to pending with business context: ${error.message}`,
      );
    }
  }

}

export default ExpenseServices;
