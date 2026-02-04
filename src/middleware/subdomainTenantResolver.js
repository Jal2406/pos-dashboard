import { StatusCodes } from 'http-status-codes';
import { Business } from '../models/index.js';
import { ResponseService } from '../utils/index.js';


const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'admin',
  'auth',
  'static',
  'pos-dashboard-2lt5',
  'pos-dashboard-1'
]);

// simple in-memory cache (replaceable with Redis later)
const tenantCache = new Map();
// TTL in ms (short by design)
const TENANT_CACHE_TTL = 60 * 1000;

export const resolveTenantFromSubdomain = async (req, res, next) => {
  try {
    if (req.businessId) {
      return next();
    }

    const hostHeader = req.headers.host;
    if (!hostHeader) {
      return next();
    }
    
    const hostname = hostHeader.split(':')[0].toLowerCase();
    
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      return next();
    }

    const parts = hostname.split('.');
    if (parts.length < 3) {
        return next();
    }
    if (hostname === 'localhost') {
      return next();
    }
    
    const subdomain = parts[0];

    if (RESERVED_SUBDOMAINS.has(subdomain)) {
        return next();
    }
    if (!/^[a-z0-9]([a-z0-9-]{1,30})$/.test(subdomain)) {
        return ResponseService.send(
            res,
            StatusCodes.BAD_REQUEST,
            'Invalid tenant subdomain',
        );
    }
    
    const cached = tenantCache.get(subdomain);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      req.businessId = cached.businessId;
      return next();
    }

    const business = await Business.findOne({
      subdomain,
      isActive: true,
    })
      .select('_id')
      .lean();

    if (!business) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        'Tenant not found or inactive',
      );
    }

    tenantCache.set(subdomain, {
      businessId: business._id,
      expiresAt: now + TENANT_CACHE_TTL,
    });

    // 9️⃣ Attach tenant context
    req.businessId = business._id;
    return next();
  } catch (err) {
    console.error('[TenantResolver] Fatal error', {
      error: err.message,
      host: req.headers.host,
    });

    return ResponseService.send(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Tenant resolution failed',
    );
  }
};
