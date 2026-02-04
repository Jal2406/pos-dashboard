import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { upload, AuthMiddleware } from '../utils/index.js';
import RagController from '../controller/RagController.js';
import SuggestedQuestionController from '../controller/SuggestedQuestionController.js';
import { RagConfig } from '../config/rag-config.fallback.js';
import WidgetSettingsController from '../controller/WidgetSettingsController.js';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

const router = express.Router();

// RAG feature toggle middleware
const requireRagEnabled = (req, res, next) => {
  if (!RagConfig.enabled) {
    return res.status(503).json({ success: false, message: 'RAG is disabled' });
  }
  next();
};

// Admin endpoints to read/update RAG config (protected)
router.patch('/toggle', AuthMiddleware.requireSuperadmin(), (req, res) => {
  try {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'enabled must be boolean' });
    }
    RagConfig.enabled = enabled;
    return res.status(200).json({ success: true, enabled: RagConfig.enabled });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to update toggle' });
  }
});

// // Configure multer for file uploads
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     const uploadDir = path.join(__dirname, '../../uploads/rag-documents');
//     cb(null, uploadDir);
//   },
//   filename: (req, file, cb) => {
//     const uniqueId = crypto.randomBytes(16).toString('hex');
//     const extension = path.extname(file.originalname);
//     cb(null, `${uniqueId}${extension}`);
//   },
// });

// const fileFilter = (req, file, cb) => {
//   const allowedMimeTypes = [
//     'text/plain',
//     'application/pdf',
//     'application/json',
//     'text/csv',
//     'application/vnd.ms-excel',
//     'application/msword',
//     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
//   ];

//   if (allowedMimeTypes.includes(file.mimetype)) {
//     cb(null, true);
//   } else {
//     cb(new Error(`File type ${file.mimetype} not allowed`), false);
//   }
// };

// const upload = multer({
//   storage,
//   fileFilter,
//   limits: {
//     fileSize: 10 * 1024 * 1024, // 10MB
//   },
// });

// Public routes (accessible to everyone for landing page widget)
router.get('/toggle', (req, res) => {
  return res.status(200).json({ success: true, enabled: RagConfig.enabled });
});

// Widget settings (public GET for client, protected PUT for admin)
router.get('/widget', WidgetSettingsController.get);
router.put('/widget', AuthMiddleware.requireSuperadmin(), WidgetSettingsController.update);

router.post('/ask', requireRagEnabled, RagController.askQuestion);

// Protected routes (require superadmin authentication)
router.get('/config', AuthMiddleware.requireSuperadmin(), RagController.getAIConfig);
router.get('/config/detailed', AuthMiddleware.requireSuperadmin(), RagController.getDetailedAIConfig);
router.post('/config/validate', AuthMiddleware.requireSuperadmin(), RagController.validateAPIKey);
router.post('/config/remove-key', AuthMiddleware.requireSuperadmin(), RagController.removeAPIKey);
router.post('/config/models', AuthMiddleware.requireSuperadmin(), RagController.getAvailableModels);
router.put('/config', AuthMiddleware.requireSuperadmin(), RagController.updateAIConfig);
router.post('/upload', AuthMiddleware.requireSuperadmin(), requireRagEnabled, upload.single('ragDocument'), RagController.uploadDocument);
router.get('/documents', AuthMiddleware.requireSuperadmin(), requireRagEnabled, RagController.getDocuments);
router.get('/documents/:id', AuthMiddleware.requireSuperadmin(), requireRagEnabled, RagController.getDocumentById);
router.get('/documents/:id/download', AuthMiddleware.requireSuperadmin(), requireRagEnabled, RagController.downloadDocument);
// Delete document - allow deletion even if RAG is disabled (for cleaning up failed documents)
router.delete('/documents/:id', AuthMiddleware.requireSuperadmin(), RagController.deleteDocument);
// Failed documents management
router.get('/documents/failed', AuthMiddleware.requireSuperadmin(), requireRagEnabled, RagController.getFailedDocuments);
router.post('/documents/:id/retry', AuthMiddleware.requireSuperadmin(), requireRagEnabled, RagController.retryIndexing);

// Suggested Questions routes
router.get('/suggested-questions', SuggestedQuestionController.getAll); // Public for widget
router.get('/suggested-questions/admin', AuthMiddleware.requireSuperadmin(), SuggestedQuestionController.getAllAdmin); // Admin view
router.post('/suggested-questions', AuthMiddleware.requireSuperadmin(), SuggestedQuestionController.create);
router.put('/suggested-questions/:id', AuthMiddleware.requireSuperadmin(), SuggestedQuestionController.update);
router.delete('/suggested-questions/:id', AuthMiddleware.requireSuperadmin(), SuggestedQuestionController.delete);
router.post('/suggested-questions/reorder', AuthMiddleware.requireSuperadmin(), SuggestedQuestionController.reorder);
router.post('/suggested-questions/seed', AuthMiddleware.requireSuperadmin(), SuggestedQuestionController.seedDefault);

export default router;
