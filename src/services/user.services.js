import { BaseService, PasswordUtils, calculateExpiryDate } from '../utils/index.js';
import { User, Role, Business, Subscription, Payment, Plan, Tax } from '../models/index.js';

class UserServices extends BaseService {
  constructor() {
    super(User);
  }

  async register(data) {
    try {
      const {
        name,
        email,
        password,
        phone,
        roleName,
        roleId,
        profilePicture,
        businessName,
        businessCategory,
        isActive,
      } = data;

      if (!email) {
        throw new Error('Email is required.');
      }

      const existing = await this.model.findOne({ email });
      if (existing) {
        throw new Error('User with this email already exists.');
      }

      const hashedPassword = await PasswordUtils.hashPassword(password);
      let roleObjectId = 2;
      if (roleId) {
        if (typeof roleId === 'string') {
          roleObjectId = parseInt(roleId, 10);
        }
      } else if (roleName) {
        roleObjectId = (await Role.findOne({ name: roleName }))._id;
      }

      const userData = {
        name,
        email,
        password: hashedPassword,
        phone,
        roleId: roleObjectId,
        profilePicture,
        isActive,
      };
      const createdUser = await this.create(userData);

      const business = await Business.create({
        businessName,
        businessCategoryId: businessCategory,
        owner: createdUser._id,
        isActive,
      });

      // Now populate roleId
      const user = await this.getByIdQuery(createdUser._id).populate('roleId');
      return user;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async getAllUsers(queryParams = {}) {
    const { roleId, all, isActive, categoryId, ...otherParams } = queryParams;

    // Define search fields for User
    const searchFields = ['name', 'email', 'phone'];

    // Build filters object
    const filters = {};
    if (roleId) {
      filters.roleId = roleId;
    }

    // Add isActive filter if provided
    if (isActive !== undefined && isActive !== null && isActive !== '') {
      filters.isActive =
        typeof isActive === 'string'
          ? isActive.toLowerCase() === 'true'
          : Boolean(isActive);
    }

    // Handle categoryId filter - users don't have businessCategoryId directly
    // We need to find businesses with this category, then filter users who own them
    if (categoryId) {
      const businesses = await Business.find({ businessCategoryId: categoryId }).select('owner').lean();
      const userIds = businesses.map(b => b.owner);

      if (userIds.length > 0) {
        filters._id = { $in: userIds };
      } else {
        // No businesses found with this category, return empty result
        filters._id = { $in: [] };
      }
    }

    // Check if non-paginated mode is requested
    if (all === 'true' || all === true) {
      // Non-paginated mode: return all data with filters and search
      const {
        search = '',
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = otherParams;

      // Build filter object
      const filter = { ...filters };

      // Add search functionality
      if (search && searchFields.length > 0) {
        filter.$or = searchFields.map((field) => ({
          [field]: { $regex: search, $options: 'i' },
        }));
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Get all users without pagination
      const Model = await this.getModel();
      const users = await Model.find(filter)
        .sort(sort)
        .populate([
          'roleId',
          {
            path: 'businesses',
            populate: {
              path: 'businessCategoryId',
              model: 'BusinessCategory',
            },
          },
        ])
        .exec();

      return {
        data: users,
        total: users.length,
      };
    }

    // Paginated mode: use BaseService list method
    return await super.list({
      ...otherParams,
      searchFields,
      filters,
      populate: [
        'roleId',
        {
          path: 'businesses',
          populate: {
            path: 'businessCategoryId',
            model: 'BusinessCategory',
          },
        },
      ],
    });
  }

  async updateUser(userId, data) {
    try {
      const {
        name,
        email,
        password,
        phone,
        roleId,
        roleName,
        profilePicture,
        businessName,
        businessCategory,
        isActive,
      } = data;

      // 1️⃣ Find the user
      const user = await this.model.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // 2️⃣ Handle unique email update
      if (email && email !== user.email) {
        const existing = await this.model.findOne({ email });
        if (existing) {
          throw new Error('Another user with this email already exists.');
        }
        user.email = email;
      }

      // 3️⃣ Update role if provided
      if (roleId) {
        const newRoleId =
          typeof roleId === 'string' ? parseInt(roleId, 10) : roleId;
        user.roleId = newRoleId;
      } else if (roleName) {
        const role = await Role.findOne({ name: roleName });
        if (!role) {
          throw new Error('Invalid role name');
        }
        user.roleId = role._id;
      }

      // 4️⃣ Update password if provided
      if (password) {
        user.password = await PasswordUtils.hashPassword(password);
      }

      // 5️⃣ Update other user fields
      if (name) {
        user.name = name;
      }
      if (phone) {
        user.phone = phone;
      }
      if (profilePicture) {
        user.profilePicture = profilePicture;
      }
      if (typeof isActive !== 'undefined') {
        user.isActive =
          typeof isActive === 'string'
            ? isActive.toLowerCase() === 'true'
            : Boolean(isActive);
      }
      // 6️⃣ Save updated user
      await user.save();

      // 7️⃣ Update associated business if business fields provided
      // ...existing code...
      if (businessName || businessCategory) {
        let business = await Business.findOne({ owner: user._id });
        if (!business) {
          // Create new business if not found
          business = new Business({
            businessName: businessName || 'Unnamed Business',
            businessCategoryId: businessCategory,
            owner: user._id,
            isActive: true, // or false, depending on your logic
          });
        } else {
          if (businessName) {
            business.businessName = businessName;
          }
          if (businessCategory) {
            business.businessCategoryId = businessCategory;
          }
        }
        await business.save();
      }

      // 8️⃣ Return updated user populated with role + businesses
      const updatedUser = await this.getByIdQuery(user._id)
        .populate('roleId')
        .populate({
          path: 'businesses',
          populate: {
            path: 'businessCategoryId',
            model: 'BusinessCategory',
          },
        });

      return updatedUser;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async toggleIsActive(userIds) {
    try {
      const idsInput = Array.isArray(userIds) ? userIds : [userIds];
      const ids = Array.from(new Set((idsInput || []).map((id) => String(id))));
      if (ids.length === 0) {
        return {
          matchedCount: 0,
          modifiedCount: 0,
          updatedIds: [],
          skippedIds: [],
          notFoundIds: [],
        };
      }

      // Fetch only required fields, lean for performance
      const users = await this.model
        .find({ _id: { $in: ids } })
        .select({ _id: 1, roleId: 1 })
        .lean();

      const foundIdsSet = new Set(users.map((u) => String(u._id)));
      const notFoundIds = ids.filter((id) => !foundIdsSet.has(String(id)));

      const superadminIds = users
        .filter((u) => u.roleId === 1)
        .map((u) => String(u._id));

      const updatableIds = users
        .filter((u) => u.roleId !== 1)
        .map((u) => u._id);

      let modifiedCount = 0;
      if (updatableIds.length > 0) {
        // Try server-side pipeline toggle (MongoDB 4.2+)
        try {
          const result = await this.model.updateMany(
            { _id: { $in: updatableIds } },
            [{ $set: { isActive: { $not: ['$isActive'] } } }],
          );
          modifiedCount = result.modifiedCount || 0;
        } catch (e) {
          // Fallback to chunked bulkWrite with pipeline update
          const CHUNK_SIZE = 1000;
          for (let i = 0; i < updatableIds.length; i += CHUNK_SIZE) {
            const chunk = updatableIds.slice(i, i + CHUNK_SIZE);
            const ops = chunk.map((id) => ({
              updateOne: {
                filter: { _id: id },
                update: [{ $set: { isActive: { $not: ['$isActive'] } } }],
              },
            }));
            const res = await this.model.bulkWrite(ops, { ordered: false });
            modifiedCount += res.modifiedCount || 0;
          }
        }
      }

      return {
        matchedCount: updatableIds.length,
        modifiedCount,
        updatedIds: updatableIds.map(String),
        skippedIds: superadminIds,
        notFoundIds,
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Action-wise bulk status setter. Accepts raw body in multiple shapes and normalizes.
  async bulkSetIsActive(actionsInput = []) {
    try {
      // Normalize payload into an array of { userIds: string[], isActive: boolean }
      let normalized = [];
      if (Array.isArray(actionsInput)) {
        normalized = actionsInput;
      } else if (Array.isArray(actionsInput?.actions)) {
        normalized = actionsInput.actions;
      } else if (
        Array.isArray(actionsInput?.userIds) &&
        Object.prototype.hasOwnProperty.call(actionsInput, 'isActive')
      ) {
        normalized = [
          { userIds: actionsInput.userIds, isActive: actionsInput.isActive },
        ];
      }

      // Coerce isActive to boolean; drop invalid entries
      const actions = (normalized || [])
        .filter(
          (a) =>
            Array.isArray(a?.userIds) &&
            a.userIds.length > 0 &&
            Object.prototype.hasOwnProperty.call(a, 'isActive'),
        )
        .map((a) => ({
          userIds: a.userIds,
          isActive:
            typeof a.isActive === 'string'
              ? a.isActive.toLowerCase() === 'true'
              : Boolean(a.isActive),
        }));

      if (!Array.isArray(actions) || actions.length === 0) {
        throw new Error('No valid actions provided');
      }

      // Merge actions by desired state to minimize DB operations
      // Expected payload: [{ userIds: [...], isActive: true/false }, ...]
      const byState = new Map();
      for (const action of actions) {
        const desired = !!action.isActive;
        const list = byState.get(desired) || [];
        if (Array.isArray(action.userIds) && action.userIds.length > 0) {
          list.push(...action.userIds.map((id) => String(id)));
        }
        byState.set(desired, list);
      }

      let matchedCount = 0;
      let modifiedCount = 0;
      const updatedIds = [];
      const skippedIds = [];
      const notFoundIds = [];

      // Helper: validate ObjectId strings (treat invalid as notFound)
      const isValidObjectId = (id) => {
        try {
          // Avoid importing mongoose here; rely on 24-hex format for speed
          return /^[a-fA-F0-9]{24}$/.test(String(id));
        } catch {
          return false;
        }
      };

      for (const [desiredState, idsRaw] of byState.entries()) {
        const ids = Array.from(new Set(idsRaw));
        if (ids.length === 0) continue;

        // Split invalid and candidate ids early
        const invalidIds = ids.filter((id) => !isValidObjectId(id));
        const candidateIds = ids.filter((id) => isValidObjectId(id));
        notFoundIds.push(...invalidIds);
        if (candidateIds.length === 0) continue;

        // Get roleId for filtering superadmin out and existence check
        const users = await this.model
          .find({ _id: { $in: candidateIds } })
          .select({ _id: 1, roleId: 1 })
          .lean();

        const foundSet = new Set(users.map((u) => String(u._id)));
        const notFound = candidateIds.filter((id) => !foundSet.has(String(id)));
        notFoundIds.push(...notFound);

        const superadmins = users
          .filter((u) => u.roleId === 1)
          .map((u) => String(u._id));
        skippedIds.push(...superadmins);

        const updatable = users.filter((u) => u.roleId !== 1).map((u) => u._id);
        matchedCount += updatable.length;
        if (updatable.length === 0) continue;

        // Single updateMany to set the exact state regardless of previous value
        const res = await this.model.updateMany(
          { _id: { $in: updatable } },
          { $set: { isActive: desiredState } },
        );
        modifiedCount += res.modifiedCount || 0;
        updatedIds.push(...updatable.map(String));
      }

      return {
        matchedCount,
        modifiedCount,
        updatedIds,
        skippedIds,
        notFoundIds,
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async toggleIsActiveSingle(userId) {
    try {
      const user = await this.model
        .findById(userId)
        .select({ _id: 1, roleId: 1 })
        .lean();

      if (!user) {
        throw new Error('User not found');
      }

      if (user.roleId === 1) {
        throw new Error('Cannot change activation status for superadmin');
      }

      // Toggle using pipeline update (preferred) with fallback
      try {
        await this.model.updateOne({ _id: userId }, [
          { $set: { isActive: { $not: ['$isActive'] } } },
        ]);
      } catch (e) {
        // Fallback: read current and invert
        const current = await this.model
          .findById(userId)
          .select({ isActive: 1 });
        await this.model.updateOne(
          { _id: userId },
          { $set: { isActive: !current.isActive } },
        );
      }

      const updatedUser = await this.getByIdQuery(userId)
        .populate('roleId')
        .populate({
          path: 'businesses',
          populate: { path: 'businessCategoryId', model: 'BusinessCategory' },
        });

      return updatedUser;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get Business Owner Subscription Report
   * Retrieves subscription information for users with roleId 2 (Business Owners)
   * @param {Object} queryParams - Query parameters for filtering, searching, and pagination
   * @returns {Object} - Paginated subscription report data
   */
  async getBusinessOwnerSubscriptionReport(queryParams = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        sortBy = 'createdAt',
        sortOrder = 'desc',
        status,
        isActive,
        planId,
        paymentMethod,
        startDate,
        endDate,
        export: exportData = false,
      } = queryParams;

      // Build match filters
      const matchFilters = { roleId: 2 };

      // Search filter - search across user name, email, and business name
      if (search) {
        matchFilters.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ];
      }

      // Get users with roleId 2
      const users = await User.find(matchFilters)
        .select('_id name email phone profilePicture isActive')
        .lean();

      const userIds = users.map((u) => u._id);

      if (userIds.length === 0) {
        const validatedPage = parseInt(page);
        const validatedLimit = parseInt(limit);
        return {
          data: [],
          pagination: {
            currentPage: validatedPage,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: validatedLimit,
            hasNext: false,
            hasPrev: false,
          },
        };
      }

      // Build subscription filters
      const subscriptionFilters = {
        user: { $in: userIds },
        payment: { $ne: null }, // Filter to only display data where an invoice exists
      };

      // Determine effective status
      const filterStatus = status !== undefined ? status : isActive;

      // Filter by status 
      if (filterStatus !== undefined && filterStatus !== null && filterStatus !== '') {
        subscriptionFilters.status =
          typeof filterStatus === 'string'
            ? filterStatus.toLowerCase() === 'true'
            : Boolean(filterStatus);
      }

      // Filter by plan
      if (planId) {
        subscriptionFilters.planName = planId;
      }

      // Filter by date range
      if (startDate || endDate) {
        subscriptionFilters.purchaseDate = {};
        if (startDate) {
          subscriptionFilters.purchaseDate.$gte = new Date(startDate);
        }
        if (endDate) {
          subscriptionFilters.purchaseDate.$lte = new Date(endDate);
        }
      }

      // Get total count for pagination
      const total = await Subscription.countDocuments(subscriptionFilters);

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const totalPages = Math.ceil(total / parseInt(limit));

      // Sort configuration
      const sortConfig = {};
      sortConfig[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Get subscriptions with populated data
      let subscriptionsQuery = Subscription.find(subscriptionFilters)
        .populate({
          path: 'planName',
          populate: {
            path: 'taxes',
            model: 'Tax',
          },
        })
        .populate('payment')
        .populate('currencyId')
        .sort(sortConfig)
        .lean();

      // Apply pagination only if not exporting
      if (!exportData) {
        subscriptionsQuery = subscriptionsQuery.skip(skip).limit(parseInt(limit));
      }

      const subscriptions = await subscriptionsQuery;

      // Get businesses for all users
      const businesses = await Business.find({ owner: { $in: userIds } })
        .populate('businessCategoryId')
        .lean();

      // Create a map of userId to business
      const businessMap = {};
      businesses.forEach((business) => {
        businessMap[business.owner.toString()] = business;
      });

      // Create a map of userId to user
      const userMap = {};
      users.forEach((user) => {
        userMap[user._id.toString()] = user;
      });

      // Format the data
      let reportData = subscriptions.map((subscription) => {
        const user = userMap[subscription.user.toString()];
        const business = businessMap[subscription.user.toString()];
        const plan = subscription.planName;
        const payment = subscription.payment;

        // Calculate discount amount
        let discountAmount = 0;
        if (plan && !plan.isTrial) {
          const basePrice = Number(plan.price) || 0;
          let discountValue = Number(plan.discount) || 0;

          if (plan.discountType === 'percentage') {
            discountAmount = (basePrice * discountValue) / 100;
          } else {
            discountAmount = discountValue;
          }

          if (discountAmount > basePrice) {
            discountAmount = basePrice;
          }
        }

        // Calculate tax amount
        let taxAmount = 0;
        let taxItems = [];
        if (plan && !plan.isTrial) {
          const priceAfterDiscount = Number(plan.price) - discountAmount;
          const taxesArray = Array.isArray(plan.taxes)
            ? plan.taxes
            : plan.tax
              ? [plan.tax]
              : [];
          taxItems = taxesArray.map((taxDoc) => ({
            _id: taxDoc?._id,
            name: taxDoc?.name,
            type: taxDoc?.type,
            value: taxDoc?.value,
            amount:
              (taxDoc?.type || '').toLowerCase() === 'percentage'
                ? (priceAfterDiscount * Number(taxDoc?.value || 0)) / 100
                : Number(taxDoc?.value || 0),
          }));
          taxAmount = taxItems.reduce(
            (sum, item) => sum + (Number(item.amount) || 0),
            0,
          );
        }

        // Calculate expiryDate if missing
        let expiryDate = subscription.expiryDate;
        if (!expiryDate && subscription.purchaseDate && subscription.duration && plan?.type) {
          expiryDate = calculateExpiryDate(
            subscription.purchaseDate,
            subscription.duration,
            plan.type
          );
        }

        return {
          subscriptionId: subscription._id,
          businessOwner: {
            id: user?._id,
            name: user?.name,
            email: user?.email,
            phone: user?.phone,
            profilePicture: user?.profilePicture,
            isActive: user?.isActive,
          },
          business: {
            id: business?._id,
            name: business?.businessName,
            category: business?.businessCategoryId?.name,
            isActive: business?.isActive,
          },
          plan: {
            id: plan?._id,
            name: plan?.name,
            type: plan?.type,
            price: plan?.price,
            isTrial: plan?.isTrial,
          },
          paymentMethod: payment?.method || 'N/A',
          paymentProvider: payment?.provider || 'N/A',
          paymentStatus: payment?.status || 'N/A',
          duration: subscription.duration,
          durationUnit: plan?.type || 'N/A',
          discount: {
            value: plan?.discount || 0,
            type: plan?.discountType || 'fixed',
            amount: discountAmount,
          },
          tax: {
            amount: taxAmount,
            breakdown: taxItems,
          },
          amount: subscription.amount,
          totalAmount: subscription.totalAmount,
          currency: {
            code: subscription.currencyId?.currencyCode || 'N/A',
            symbol: subscription.currencyId?.currencySymbol || '',
          },
          subscribeDate: subscription.purchaseDate,
          expiryDate: expiryDate,
          status: subscription.status ? 'Active' : 'Inactive',
          isTrial: subscription.isTrial,
          invoice: {
            paymentId: payment?._id,
            providerOrderId: payment?.providerOrderId,
            providerPaymentId: payment?.providerPaymentId,
          },
          createdAt: subscription.createdAt,
          updatedAt: subscription.updatedAt,
        };
      });

      // Apply payment method filter if specified
      if (paymentMethod) {
        reportData = reportData.filter(
          (item) =>
            item.paymentMethod.toLowerCase() ===
            paymentMethod.toLowerCase(),
        );
      }

      // If exporting, return all data without pagination
      if (exportData) {
        return {
          data: reportData,
          total: reportData.length,
        };
      }
      
      const validatedPage = parseInt(page);
      const validatedLimit = parseInt(limit);

      return {
        data: reportData,
        pagination: {
          currentPage: validatedPage,
          totalPages,
          totalItems: total,
          itemsPerPage: validatedLimit,
          hasNext: validatedPage * validatedLimit < total,
          hasPrev: validatedPage > 1,
        },
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Bulk get users by IDs with populated fields
   * @param {Array<string>} ids - Array of user IDs to retrieve
   * @param {Object} options - Optional configuration
   * @param {Boolean} options.includeBusinesses - Include business information (default: true)
   * @param {Boolean} options.includeRole - Include role information (default: true)
   * @param {Boolean} options.throwOnNotFound - Throw error if any ID not found (default: false)
   * @returns {Promise<Object>} Object containing:
   *   - users: Array of found users with populated fields
   *   - found: Number of users found
   *   - notFound: Array of IDs that were not found
   *   - totalRequested: Total number of IDs requested
   */
  async bulkGetUsers(ids, options = {}) {
    try {
      // Validate input
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('User IDs array is required and must not be empty');
      }

      // Extract options with defaults
      const {
        includeBusinesses = true,
        includeRole = true,
        throwOnNotFound = false,
      } = options;

      // Build populate configuration
      const populateFields = [];

      if (includeRole) {
        populateFields.push('roleId');
      }

      if (includeBusinesses) {
        populateFields.push({
          path: 'businesses',
          populate: {
            path: 'businessCategoryId',
            model: 'BusinessCategory',
          },
        });
      }

      // Use BaseService bulkGetByIds with user-specific populate
      const result = await this.bulkGetByIds(ids, {
        populate: populateFields.length > 0 ? populateFields : null,
        lean: true,
        throwOnNotFound,
      });

      // Return with renamed 'documents' to 'users' for clarity
      return {
        data: result.documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get users failed: ${error.message}`);
    }
  }
  /**
   * Format user data for export/download
   * @param {Object} user - User object
   * @returns {Object} - Formatted user object
   */
  formatUserForExport(user) {
    const business =
      user.businesses && user.businesses[0] ? user.businesses[0] : {};
    const category = business.businessCategoryId
      ? business.businessCategoryId.name
      : 'N/A';

    return {
      'User ID': user._id,
      Name: user.name,
      Email: user.email,
      Phone: user.phone || 'N/A',
      Role: user.roleId ? user.roleId.name : 'N/A',
      Status: user.isActive ? 'Active' : 'Inactive',
      'Business Name': business.businessName || 'N/A',
      'Business Category': category,
      'Joined Date': user.createdAt
        ? new Date(user.createdAt).toISOString().split('T')[0]
        : 'N/A',
    };
  }

  /**
   * Bulk get subscriptions for download/export (Business Owner Report)
   * accepts Subscription IDs (preferred) or User IDs
   * @param {Array<string>} ids - Array of Subscription IDs or User IDs
   * @returns {Object} - Object containing data array
   */
  async bulkGetSelectDownload(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs array is required');
      }

      // Fetch subscriptions by ID, ensuring they have an invoice
      const subscriptions = await Subscription.find({
        _id: { $in: ids },
        payment: { $ne: null },
      })
        .populate({
          path: 'planName',
          populate: {
            path: 'taxes',
            model: 'Tax',
          },
        })
        .populate('payment')
        .populate('currencyId')
        .lean();

      if (subscriptions.length === 0) {
        return { data: [] };
      }

      const userIds = [
        ...new Set(
          subscriptions.map((s) => s.user?.toString()).filter(Boolean),
        ),
      ];

      // Fetch related Users and Businesses
      const [users, businesses] = await Promise.all([
        User.find({ _id: { $in: userIds } }).lean(),
        Business.find({ owner: { $in: userIds } })
          .populate('businessCategoryId')
          .lean(),
      ]);

      const userMap = users.reduce(
        (acc, u) => ({ ...acc, [u._id.toString()]: u }),
        {},
      );
      const businessMap = businesses.reduce(
        (acc, b) => ({ ...acc, [b.owner.toString()]: b }),
        {},
      );

      const formattedData = subscriptions.map((subscription) => {
        const userId = subscription.user?.toString();
        const user = userMap[userId];
        const business = businessMap[userId];
        const plan = subscription.planName;
        const payment = subscription.payment;

        // Calculate discount amount
        let discountAmount = 0;
        if (plan && !plan.isTrial) {
          const basePrice = Number(plan.price) || 0;
          let discountValue = Number(plan.discount) || 0;

          if (plan.discountType === 'percentage') {
            discountAmount = (basePrice * discountValue) / 100;
          } else {
            discountAmount = discountValue;
          }

          if (discountAmount > basePrice) {
            discountAmount = basePrice;
          }
        }

        // Calculate tax amount
        let taxAmount = 0;
        let taxItems = [];
        if (plan && !plan.isTrial) {
          const priceAfterDiscount = Number(plan.price) - discountAmount;
          const taxesArray = Array.isArray(plan.taxes)
            ? plan.taxes
            : plan.tax
              ? [plan.tax]
              : [];
          taxItems = taxesArray.map((taxDoc) => ({
            _id: taxDoc?._id,
            name: taxDoc?.name,
            type: taxDoc?.type,
            value: taxDoc?.value,
            amount:
              (taxDoc?.type || '').toLowerCase() === 'percentage'
                ? (priceAfterDiscount * Number(taxDoc?.value || 0)) / 100
                : Number(taxDoc?.value || 0),
          }));
          taxAmount = taxItems.reduce(
            (sum, item) => sum + (Number(item.amount) || 0),
            0,
          );
        }

        // Calculate expiryDate if missing
        let expiryDate = subscription.expiryDate;
        if (
          !expiryDate &&
          subscription.purchaseDate &&
          subscription.duration &&
          plan?.type
        ) {
          expiryDate = calculateExpiryDate(
            subscription.purchaseDate,
            subscription.duration,
            plan.type,
          );
        }

        return {
          subscriptionId: subscription._id,
          businessOwner: {
            id: user?._id,
            name: user?.name,
            email: user?.email,
            phone: user?.phone,
            profilePicture: user?.profilePicture,
            isActive: user?.isActive,
          },
          business: {
            id: business?._id,
            name: business?.businessName,
            category: business?.businessCategoryId?.name,
            isActive: business?.isActive,
          },
          plan: {
            id: plan?._id,
            name: plan?.name,
            type: plan?.type,
            price: plan?.price,
            isTrial: plan?.isTrial,
          },
          paymentMethod: payment?.method || 'N/A',
          paymentProvider: payment?.provider || 'N/A',
          paymentStatus: payment?.status || 'N/A',
          duration: subscription.duration,
          durationUnit: plan?.type || 'N/A',
          discount: {
            value: plan?.discount || 0,
            type: plan?.discountType || 'fixed',
            amount: discountAmount,
          },
          tax: {
            amount: taxAmount,
            breakdown: taxItems,
          },
          amount: subscription.amount,
          totalAmount: subscription.totalAmount,
          currency: {
            code: subscription.currencyId?.currencyCode || 'N/A',
            symbol: subscription.currencyId?.currencySymbol || '',
          },
          subscribeDate: subscription.purchaseDate,
          expiryDate: expiryDate,
          status: subscription.status ? 'Active' : 'Inactive',
          isTrial: subscription.isTrial,
          invoice: {
            paymentId: payment?._id,
            providerOrderId: payment?.providerOrderId,
            providerPaymentId: payment?.providerPaymentId,
          },
          createdAt: subscription.createdAt,
          updatedAt: subscription.updatedAt,
        };
      });

      return { data: formattedData };
    } catch (error) {
      throw new Error(`Bulk download failed: ${error.message}`);
    }
  }
}

export default UserServices;

