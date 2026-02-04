# POS Backend

A comprehensive Point of Sale (POS) backend system built with Node.js, Express, and MongoDB.

## Enhanced BaseService

The project now includes an enhanced `BaseService` class that provides common CRUD operations and advanced listing functionality. This helps reduce code duplication and provides consistent behavior across all services.

### BaseService Features

#### Core CRUD Operations

- `create(data)` - Create new documents
- `getById(id)` - Get document by ID
- `getAll(query)` - Get all documents with optional query
- `updateById(id, data)` - Update document by ID
- `deleteById(id)` - Delete document by ID
- `softDeleteById(id)` - Soft delete (sets isDeleted flag)
- `restoreById(id)` - Restore soft deleted document

#### Advanced Listing with `list()` Method

The enhanced `list()` method provides:

- **Pagination** - Page-based navigation with configurable limits
- **Search** - Text search across multiple fields
- **Filtering** - Custom filters for specific fields
- **Sorting** - Configurable sort order and fields
- **Population** - Automatic field population
- **Validation** - Built-in parameter validation

### Usage Example

```javascript
import { BaseService } from '../utils/index.js';
import { YourModel } from '../models/index.js';

class YourService extends BaseService {
  constructor() {
    super(YourModel);
  }

  async list(queryParams = {}) {
    const { customFilter, ...otherParams } = queryParams;

    // Define search fields for your model
    const searchFields = ['name', 'description', 'email'];

    // Build filters object
    const filters = {};
    if (customFilter) {
      filters.customField = customFilter;
    }

    // Use BaseService list method with your specific configuration
    return await super.list({
      ...otherParams,
      searchFields,
      filters,
      populate: 'relatedField', // Optional population
    });
  }
}
```

### Query Parameters for `list()` Method

| Parameter      | Type          | Default     | Description                              |
| -------------- | ------------- | ----------- | ---------------------------------------- |
| `page`         | Number        | 1           | Page number for pagination               |
| `limit`        | Number        | 10          | Items per page (max 100)                 |
| `search`       | String        | ''          | Search term to find in searchFields      |
| `searchFields` | Array         | []          | Fields to search in (defined in service) |
| `sortBy`       | String        | 'createdAt' | Field to sort by                         |
| `sortOrder`    | String        | 'desc'      | Sort order ('asc' or 'desc')             |
| `filters`      | Object        | {}          | Additional filters (defined in service)  |
| `populate`     | String/Object | null        | Fields to populate                       |

### Benefits

1. **Consistent API** - All services return the same pagination structure
2. **Reduced Code** - Eliminates repetitive pagination/search logic
3. **Better Performance** - Optimized queries with parallel execution
4. **Easy Maintenance** - Centralized logic for common operations
5. **Flexible** - Supports custom filters and population per service

### Migration Guide

To migrate existing services to use the enhanced BaseService:

1. **Extract search fields** - Identify which fields should be searchable
2. **Define filters** - Map query parameters to database filters
3. **Replace custom logic** - Replace pagination/search code with `super.list()`
4. **Test thoroughly** - Ensure all existing functionality works correctly

### Example Migration

**Before:**

```javascript
async list(queryParams = {}) {
  const { page = 1, limit = 10, search = '', sortBy = 'createdAt', sortOrder = 'desc' } = queryParams;

  const filter = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [items, total] = await Promise.all([
    Model.find(filter).sort(sort).skip(skip).limit(parseInt(limit)),
    Model.countDocuments(filter)
  ]);

  return {
    data: items,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalItems: total,
      itemsPerPage: parseInt(limit)
    }
  };
}
```

**After:**

```javascript
async list(queryParams = {}) {
  const searchFields = ['name', 'description'];

  return await super.list({
    ...queryParams,
    searchFields
  });
}
```

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up environment variables:

   ```bash
   cp .env.example .env
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## API Documentation

The API documentation is available in the Postman collection: `POS.postman_collection.json`

## Contributing

1. Follow the existing code structure
2. Use the enhanced BaseService for new services
3. Ensure all tests pass
4. Update documentation as needed
