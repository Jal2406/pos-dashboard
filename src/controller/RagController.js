import RagDocument from '../models/RagDocument.js';
import SuggestedQuestion from '../models/SuggestedQuestion.js';
import RagConfigModel from '../models/RagConfig.js';
import RagService from '../services/RagService.js';
import encryptionUtils from '../utils/encryption.utils.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ragService = new RagService();

// Track initialization state
let ragInitialized = false;
let ragInitializationPromise = null;
let connectionListenerSetup = false;

/**
 * Initialize RAG service with retry logic and connection checking
 */
async function initializeRagService() {
  if (ragInitialized) {
    return;
  }

  // If initialization is already in progress, return that promise
  if (ragInitializationPromise) {
    return ragInitializationPromise;
  }

  ragInitializationPromise = (async () => {
    try {
      // Wait for MongoDB connection to be ready
      const mongoose = await import('mongoose');
      let retries = 5;
      let delay = 2000; // Start with 2 seconds

      while (retries > 0) {
        if (mongoose.default.connection.readyState === 1) {
          // Connection is ready
          break;
        }

        if (mongoose.default.connection.readyState === 0) {
          // Not connected yet, wait and retry
          retries--;
          if (retries > 0) {
            console.log(
              `Waiting for MongoDB connection... (${retries} retries left)`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 1.5; // Exponential backoff
          }
        } else {
          // Connection state is 2 (connecting) or 3 (disconnecting), wait a bit
          await new Promise((resolve) => setTimeout(resolve, 1000));
          retries--;
        }
      }

      // Check if we have a valid connection
      if (mongoose.default.connection.readyState !== 1) {
        console.warn(
          '⚠️ MongoDB not connected. RAG service will initialize when connection is available.',
        );
        // Set up a listener to initialize when connection is ready (only once)
        if (!connectionListenerSetup) {
          connectionListenerSetup = true;
          mongoose.default.connection.once('connected', async () => {
            try {
              await ragService.initializeIndex();
              const config = await RagConfigModel.getMainConfig();
              await RagController.loadConfigIntoRagService(config);
              ragInitialized = true;
              console.log(
                '✅ RAG service initialized after MongoDB connection',
              );
            } catch (error) {
              console.error(
                'Error initializing RAG service after connection:',
                error,
              );
            }
          });
        }
        return;
      }

      // Initialize Elasticsearch index
      await ragService.initializeIndex();

      // Load config from database
      const config = await RagConfigModel.getMainConfig();
      await RagController.loadConfigIntoRagService(config);

      ragInitialized = true;
      console.log('✅ RAG service initialized successfully');
    } catch (error) {
      // Don't crash the app if RAG initialization fails
      if (
        error.name === 'MongoNetworkError' ||
        error.name === 'MongooseError'
      ) {
        console.warn(
          '⚠️ MongoDB connection issue during RAG initialization. RAG features may not be available until connection is established.',
        );
        // Set up listener for when connection is available (only once)
        if (!connectionListenerSetup) {
          connectionListenerSetup = true;
          const mongoose = await import('mongoose');
          mongoose.default.connection.once('connected', async () => {
            try {
              await ragService.initializeIndex();
              const config = await RagConfigModel.getMainConfig();
              await RagController.loadConfigIntoRagService(config);
              ragInitialized = true;
              console.log(
                '✅ RAG service initialized after MongoDB connection',
              );
            } catch (retryError) {
              console.error(
                'Error initializing RAG service after connection:',
                retryError,
              );
            }
          });
        }
      } else {
        console.error(
          'Error initializing RAG service:',
          error.message || error,
        );
      }
    } finally {
      ragInitializationPromise = null;
    }
  })();

  return ragInitializationPromise;
}

// Start initialization (non-blocking, won't crash app)
initializeRagService().catch((error) => {
  console.error('Failed to initialize RAG service:', error.message || error);
});

class RagController {
  /**
   * Upload and process document
   */
  static async uploadDocument(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
      }

      const {
        originalname,
        filename,
        mimetype,
        size,
        path: filePath,
      } = req.file;

      // CHECK ELASTICSEARCH AVAILABILITY FIRST - BEFORE ANY PROCESSING
      let isESAvailable = false;
      try {
        isESAvailable = await ragService.isElasticsearchAvailable();
      } catch (esCheckError) {
        // If check fails, assume ES is unavailable
        isESAvailable = false;
      }

      // If Elasticsearch is disabled, reject immediately
      if (!isESAvailable) {
        // Only try to delete local files (not Cloudinary URLs)
        if (!/^https?:\/\//i.test(filePath)) {
          try {
            await fs.unlink(filePath);
          } catch (unlinkError) {
            // Ignore unlink errors - file might already be deleted or doesn't exist
            console.warn(
              'Failed to delete uploaded file:',
              unlinkError.message,
            );
          }
        }
        return res.status(503).json({
          success: false,
          message:
            'Cannot upload file - Elastic Search is disabled. Please enable Elasticsearch first.',
        });
      }

      // Only proceed if Elasticsearch is available
      const fileExtension = path.extname(originalname);

      // Validate file type
      const allowedExtensions = [
        '.txt',
        '.pdf',
        '.doc',
        '.docx',
        '.json',
        '.csv',
      ];
      if (!allowedExtensions.includes(fileExtension.toLowerCase())) {
        // Delete uploaded file
        await fs.unlink(filePath);
        return res.status(400).json({
          success: false,
          message: `File type ${fileExtension} not allowed. Allowed: ${allowedExtensions.join(
            ', ',
          )}`,
        });
      }

      // Validate file size (10MB)
      const maxSize = 10 * 1024 * 1024;
      if (size > maxSize) {
        await fs.unlink(filePath);
        return res.status(400).json({
          success: false,
          message: 'File size exceeds 10MB limit',
        });
      }

      // Create database record (only if Elasticsearch is available)
      const ragDocument = new RagDocument({
        fileId: filename.split('.')[0], // Use multer filename without extension
        fileName: filename,
        originalName: originalname,
        fileSize: size,
        mimeType: mimetype,
        filePath,
        fileExtension,
        uploadedBy: req.user?._id, // From passport authentication
        status: 'processing',
      });

      await ragDocument.save();

      // Start indexing in background
      ragService
        .indexDocument(
          String(ragDocument._id),
          ragDocument.fileName,
          filePath,
          mimetype,
        )
        .then(async (result) => {
          ragDocument.status = 'indexed';
          ragDocument.indexingStatus = {
            isIndexed: true,
            indexedAt: new Date(),
            chunkCount: result.chunkCount,
          };
          await ragDocument.save();
          console.log(
            `✅ Document indexed successfully: ${ragDocument.fileName}`,
          );
        })
        .catch(async (error) => {
          console.error('Indexing error:', error);

          // Mark document as failed instead of deleting it
          // This allows users to retry later
          try {
            ragDocument.status = 'error';
            ragDocument.indexingStatus = {
              isIndexed: false,
              errorMessage:
                error.name === 'ElasticsearchConnectionError'
                  ? 'Indexing failed - Elastic Search disabled'
                  : error.message ||
                    'Indexing failed. Make sure Elasticsearch is running and try again.',
            };
            await ragDocument.save();

            console.log(
              `❌ Document indexing failed (marked as error): ${ragDocument.fileName}`,
            );
          } catch (updateError) {
            console.error(
              'Error updating failed document status:',
              updateError,
            );
            // If we can't update status, try cleanup as last resort
            try {
              if (!/^https?:\/\//i.test(ragDocument.filePath)) {
                await fs.unlink(ragDocument.filePath);
              }
              await RagDocument.findByIdAndDelete(ragDocument._id);
            } catch (cleanupError) {
              console.error('Error during cleanup:', cleanupError);
            }
          }
        });

      return res.status(200).json({
        success: true,
        message: 'File uploaded successfully and indexing started',
        data: {
          id: ragDocument._id,
          fileId: ragDocument.fileId,
          fileName: ragDocument.originalName,
          fileSize: ragDocument.fileSize,
          status: ragDocument.status,
          uploadedAt: ragDocument.createdAt,
        },
      });
    } catch (error) {
      console.error('Upload error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error uploading file',
        error: error.message,
      });
    }
  }

  /**
   * Get all uploaded documents
   */
  static async getDocuments(req, res) {
    try {
      const documents = await RagDocument.find()
        .select(
          'fileId fileName originalName fileSize status indexingStatus createdAt',
        )
        .sort({ createdAt: -1 });

      return res.status(200).json({
        success: true,
        data: documents.map((doc) => ({
          id: doc._id,
          fileId: doc.fileId,
          fileName: doc.originalName,
          fileSize: doc.fileSize,
          status: doc.status,
          isIndexed: doc.indexingStatus?.isIndexed || false,
          chunkCount: doc.indexingStatus?.chunkCount || 0,
          uploadedAt: doc.createdAt,
          indexingStatus: doc.indexingStatus,
          errorMessage:
            doc.status === 'error'
              ? doc.indexingStatus?.errorMessage || 'Indexing failed'
              : undefined,
        })),
      });
    } catch (error) {
      console.error('Get documents error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching documents',
        error: error.message,
      });
    }
  }

  /**
   * Delete document
   */
  static async deleteDocument(req, res) {
    try {
      const { id } = req.params;

      const document = await RagDocument.findById(id);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found',
        });
      }

      // Check if document is failed - allow deletion of failed documents even if ES is down
      const isFailedDocument = document.status === 'error';

      // Try to delete from Elasticsearch
      // For non-failed documents, we need Elasticsearch to be available
      try {
        const isESAvailable = await ragService.isElasticsearchAvailable();
        if (!isESAvailable && !isFailedDocument) {
          return res.status(503).json({
            success: false,
            message:
              'Cannot delete document - Elastic Search is disabled. Failed documents can be deleted even when Elasticsearch is disabled.',
          });
        }

        // If ES is available or it's a failed document, proceed with deletion
        if (isESAvailable) {
          await ragService.deleteDocument(String(document._id));
        } else if (isFailedDocument) {
          // For failed documents, try to delete from ES but don't fail if unavailable
          try {
            await ragService.deleteDocument(String(document._id));
          } catch (esError) {
            console.warn(
              `Elasticsearch unavailable during delete for failed document ${id}, continuing with database deletion:`,
              esError.message,
            );
          }
        }
      } catch (esError) {
        // If Elasticsearch is unavailable for failed documents, continue deletion
        if (
          isFailedDocument &&
          (esError.name === 'ElasticsearchConnectionError' ||
            esError.name === 'ConnectionError' ||
            esError.message?.includes('unavailable') ||
            esError.message?.includes('ECONNREFUSED'))
        ) {
          console.warn(
            `Elasticsearch unavailable during delete for failed document ${id}, continuing with database deletion:`,
            esError.message,
          );
        } else if (!isFailedDocument) {
          // For non-failed documents, ES must be available
          return res.status(503).json({
            success: false,
            message:
              'Cannot delete document - Elastic Search is disabled. Failed documents can be deleted even when Elasticsearch is disabled.',
          });
        } else {
          // For other errors with failed documents, log but continue
          console.warn(
            `Error deleting from Elasticsearch for failed document ${id}, continuing with database deletion:`,
            esError.message,
          );
        }
      }

      // Delete physical file if local; if Cloudinary URL, skip local unlink
      try {
        if (!/^https?:\/\//i.test(document.filePath)) {
          await fs.unlink(document.filePath);
        }
      } catch (err) {
        console.warn('File already deleted or not found:', err.message);
      }

      // Delete from database (always attempt this regardless of Elasticsearch status)
      await RagDocument.findByIdAndDelete(id);

      return res.status(200).json({
        success: true,
        message: 'Document deleted successfully',
      });
    } catch (error) {
      console.error('Delete error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error deleting document',
        error: error.message,
      });
    }
  }

  /**
   * Detect greetings and return appropriate response
   */
  static detectGreeting(question) {
    const lowerQuestion = question.toLowerCase().trim();

    // Remove punctuation for matching
    const cleanQuestion = lowerQuestion.replace(/[?!.,;:]/g, '').trim();

    // Greeting patterns
    const greetingPatterns = {
      // Simple greetings
      hi: '<p>Hello! Do you have any questions about our POS system?</p>',
      hello: '<p>Hello! Do you have any questions about our POS system?</p>',
      hey: '<p>Hello! Do you have any questions about our POS system?</p>',
      hii: '<p>Hello! Do you have any questions about our POS system?</p>',
      hiii: '<p>Hello! Do you have any questions about our POS system?</p>',
      hola: '<p>Hello! Do you have any questions about our POS system?</p>',
      greetings:
        '<p>Hello! Do you have any questions about our POS system?</p>',

      // Time-based greetings
      'good morning':
        '<p>Good morning! Do you have any questions about our POS system?</p>',
      'good afternoon':
        '<p>Good afternoon! Do you have any questions about our POS system?</p>',
      'good evening':
        '<p>Good evening! Do you have any questions about our POS system?</p>',
      'good night':
        '<p>Good night! Do you have any questions about our POS system?</p>',

      // How are you variations
      'how are you':
        "<p>I'm here to help! Do you have any questions about our POS system?</p>",
      'how are you doing':
        "<p>I'm here to help! Do you have any questions about our POS system?</p>",
      "how's it going":
        '<p>Hello! Do you have any questions about our POS system?</p>',
      'hows it going':
        '<p>Hello! Do you have any questions about our POS system?</p>',
      'whats up':
        '<p>Hello! Do you have any questions about our POS system?</p>',
      "what's up":
        '<p>Hello! Do you have any questions about our POS system?</p>',
      sup: '<p>Hello! Do you have any questions about our POS system?</p>',

      // Thanks and goodbye
      'thank you':
        "<p>You're welcome! Let me know if you need anything else.</p>",
      thanks: "<p>You're welcome! Let me know if you need anything else.</p>",
      'thank you so much':
        "<p>You're welcome! Feel free to ask more questions.</p>",
      'thanks a lot': "<p>You're welcome! Feel free to ask more questions.</p>",
      bye: '<p>Goodbye! Feel free to return if you have more questions.</p>',
      goodbye: '<p>Goodbye! Have a great day.</p>',
      'see you': '<p>See you! Feel free to return anytime.</p>',
      'see ya': '<p>See you! Feel free to return anytime.</p>',
    };

    // Check for exact matches
    if (greetingPatterns[cleanQuestion]) {
      return greetingPatterns[cleanQuestion];
    }

    // Check for partial matches (for variations like "hi there", "hello!", etc.)
    for (const [pattern, response] of Object.entries(greetingPatterns)) {
      if (
        cleanQuestion === pattern ||
        cleanQuestion.startsWith(pattern + ' ') ||
        cleanQuestion.endsWith(' ' + pattern)
      ) {
        return response;
      }
    }

    return null; // Not a greeting
  }

  /**
   * Ask question with RAG
   */
  static async askQuestion(req, res) {
    try {
      const { question, fileIds } = req.body;

      // Validate question input
      if (!question || typeof question !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Question is required',
        });
      }

      const trimmedQuestion = question.trim();

      // Validate minimum length
      if (trimmedQuestion.length < 3) {
        return res.status(400).json({
          success: false,
          message: 'Question must be at least 3 characters long',
        });
      }

      // Validate maximum length (prevent extremely long strings)
      if (trimmedQuestion.length > 1000) {
        return res.status(400).json({
          success: false,
          message:
            'Question is too long. Please limit your question to 1000 characters.',
        });
      }

      // Validate for potential malicious patterns (excessive special characters, control characters)
      // Allow normal punctuation and characters, but flag suspicious patterns
      const suspiciousPatterns = [
        /[\x00-\x08\x0E-\x1F\x7F]/g, // Control characters except tab, newline, carriage return
        /(.)\1{100,}/g, // Repeated characters more than 100 times (potential DoS)
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(trimmedQuestion)) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid characters detected in question. Please use only standard text.',
          });
        }
      }

      // Detect greetings and respond naturally without searching documents
      const greetingResponse = RagController.detectGreeting(question.trim());
      if (greetingResponse) {
        return res.status(200).json({
          success: true,
          data: {
            answer: greetingResponse,
            matchType: 'greeting',
            sources: [],
          },
        });
      }

      // Check for suggested questions BEFORE searching Elasticsearch
      // This returns pre-defined answers immediately without RAG search
      try {
        const normalizedQuestion = question.trim().toLowerCase();
        const suggestedQuestion = await SuggestedQuestion.findOne({
          isActive: true,
          $expr: {
            $eq: [
              { $toLower: { $trim: { input: '$question' } } },
              normalizedQuestion,
            ],
          },
        });

        if (suggestedQuestion) {
          console.log(
            `✨ Suggested Question Match Found: "${suggestedQuestion.question}"`,
          );

          // Format the pre-defined answer
          const formattedAnswer = suggestedQuestion.answer.startsWith('<')
            ? suggestedQuestion.answer
            : `<p>${suggestedQuestion.answer}</p>`;

          return res.status(200).json({
            success: true,
            data: {
              answer: formattedAnswer,
              matchType: 'suggested_question',
              matchedQuestion: suggestedQuestion.question,
              sources: [
                {
                  fileName: 'Suggested Question',
                  content: `Q: ${suggestedQuestion.question}\nA: ${suggestedQuestion.answer}`,
                  score: 2.0, // High score to indicate exact match
                },
              ],
            },
          });
        }
      } catch (error) {
        // Log error but continue with normal RAG flow
        console.error('Error checking suggested questions:', error);
      }

      // Search similar chunks (only if no suggested question matched)
      let similarChunks;
      try {
        similarChunks = await ragService.searchSimilarChunks(
          question,
          fileIds,
          5,
        );
      } catch (searchError) {
        // Handle Elasticsearch connection errors gracefully
        if (
          searchError.name === 'ElasticsearchConnectionError' ||
          searchError.message?.includes(
            'Elasticsearch is currently unavailable',
          ) ||
          searchError.message?.includes('unavailable')
        ) {
          console.warn(
            'Elasticsearch unavailable for search, returning helpful error message',
          );
          return res.status(503).json({
            success: false,
            message:
              'The search service is currently unavailable. Please try again later or contact support if the issue persists.',
            error: 'ElasticsearchConnectionError',
          });
        }
        // Re-throw other errors to be handled by outer catch
        throw searchError;
      }

      if (similarChunks.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            answer: 'No relevant information found in the uploaded documents.',
            sources: [],
          },
        });
      }

      // Check for exact FAQ match first
      const faqMatch = await ragService.findExactFAQMatch(
        question,
        similarChunks,
      );

      // If we found a high-confidence FAQ match, return it directly
      if (faqMatch && faqMatch.similarity >= 0.75) {
        console.log(
          `✨ FAQ Match Found (${Math.round(faqMatch.similarity * 100)}% similarity): ${faqMatch.question}`,
        );

        // Format the exact answer with simple HTML
        const formattedAnswer = faqMatch.answer.startsWith('<')
          ? faqMatch.answer
          : `<p>${faqMatch.answer}</p>`;

        return res.status(200).json({
          success: true,
          data: {
            answer: formattedAnswer,
            matchType: 'exact_faq',
            matchedQuestion: faqMatch.question,
            similarity: faqMatch.similarity,
            sources: [
              {
                fileName: faqMatch.source,
                content: `Q: ${faqMatch.question}\nA: ${faqMatch.answer}`,
                score: 2.0, // High score to indicate exact match
              },
            ],
          },
        });
      }

      // No exact match found, proceed with normal RAG generation
      console.log('No exact FAQ match found, using RAG generation...');

      // Build context from chunks
      const context = similarChunks.map((chunk) => chunk.content).join('\n\n');

      // Generate answer
      const answer = await ragService.generateAnswer(question, context);

      return res.status(200).json({
        success: true,
        data: {
          answer,
          matchType: 'rag_generated',
          sources: similarChunks.map((chunk) => ({
            fileName: chunk.fileName,
            content: chunk.content.substring(0, 200) + '...',
            score: chunk.score,
          })),
        },
      });
    } catch (error) {
      console.error('Ask question error:', error);

      // Handle Elasticsearch connection errors
      if (
        error.name === 'ElasticsearchConnectionError' ||
        error.message?.includes('Elasticsearch is currently unavailable') ||
        error.message?.includes('unavailable')
      ) {
        return res.status(503).json({
          success: false,
          message:
            'The search service is currently unavailable. Please try again later or contact support if the issue persists.',
          error: 'ElasticsearchConnectionError',
        });
      }

      // For other errors, return generic message without exposing internal details
      return res.status(500).json({
        success: false,
        message: 'Error processing question. Please try again later.',
      });
    }
  }

  /**
   * Get document details
   */
  static async getDocumentById(req, res) {
    try {
      const { id } = req.params;

      const document = await RagDocument.findById(id);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          id: document._id,
          fileId: document.fileId,
          fileName: document.originalName,
          fileSize: document.fileSize,
          mimeType: document.mimeType,
          status: document.status,
          indexingStatus: document.indexingStatus,
          uploadedAt: document.createdAt,
        },
      });
    } catch (error) {
      console.error('Get document error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching document',
        error: error.message,
      });
    }
  }

  /**
   * Download or view a document
   */
  static async downloadDocument(req, res) {
    try {
      const { id } = req.params;
      const { view } = req.query; // If view=true, open in browser; otherwise download

      const document = await RagDocument.findById(id);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found',
        });
      }

      const filePath = document.filePath;
      const fileName = document.originalName;

      // Check if file is stored in Cloudinary (URL)
      if (/^https?:\/\//i.test(filePath)) {
        // If it's a Cloudinary URL, return the URL in JSON response
        // Frontend will handle opening it directly to avoid CORS issues
        return res.status(200).json({
          success: true,
          isCloudinary: true,
          url: filePath,
          fileName: fileName,
          mimeType: document.mimeType,
        });
      }

      // For local files, check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        return res.status(404).json({
          success: false,
          message: 'File not found on server',
        });
      }

      // Set appropriate headers
      res.setHeader(
        'Content-Type',
        document.mimeType || 'application/octet-stream',
      );

      if (view === 'true') {
        // For viewing, set Content-Disposition to inline
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(fileName)}"`,
        );
        // Use sendFile for better handling
        return res.sendFile(path.resolve(filePath));
      } else {
        // For downloading, use res.download() which sets Content-Disposition: attachment
        return res.download(filePath, fileName, (err) => {
          if (err) {
            console.error('Download error:', err);
            if (!res.headersSent) {
              return res.status(500).json({
                success: false,
                message: 'Error downloading document',
                error: err.message,
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('Download document error:', error);
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: 'Error downloading document',
          error: error.message,
        });
      }
    }
  }

  /**
   * Get failed documents (for display in UI with retry options)
   */
  static async getFailedDocuments(req, res) {
    try {
      const failedDocuments = await RagDocument.find({ status: 'error' })
        .select(
          '_id fileId originalName fileSize status indexingStatus createdAt',
        )
        .sort({ createdAt: -1 });

      return res.status(200).json({
        success: true,
        data: failedDocuments.map((doc) => ({
          id: doc._id,
          fileId: doc.fileId,
          fileName: doc.originalName,
          fileSize: doc.fileSize,
          status: doc.status,
          errorMessage: doc.indexingStatus?.errorMessage || 'Indexing failed',
          uploadedAt: doc.createdAt,
        })),
      });
    } catch (error) {
      console.error('Get failed documents error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching failed documents',
        error: error.message,
      });
    }
  }

  /**
   * Retry indexing a failed document
   */
  static async retryIndexing(req, res) {
    try {
      const { id } = req.params;

      const document = await RagDocument.findById(id);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found',
        });
      }

      if (document.status !== 'error') {
        return res.status(400).json({
          success: false,
          message:
            'Document is not in error state. Only failed documents can be retried.',
        });
      }

      // Reset status to processing
      document.status = 'processing';
      document.indexingStatus = {
        isIndexed: false,
      };
      await document.save();

      // Start indexing in background
      ragService
        .indexDocument(
          String(document._id),
          document.fileName,
          document.filePath,
          document.mimeType,
        )
        .then(async (result) => {
          document.status = 'indexed';
          document.indexingStatus = {
            isIndexed: true,
            indexedAt: new Date(),
            chunkCount: result.chunkCount,
          };
          await document.save();
          console.log(
            `✅ Document re-indexed successfully: ${document.fileName}`,
          );
        })
        .catch(async (error) => {
          console.error('Re-indexing error:', error);

          // Mark as failed again with updated error message
          document.status = 'error';
          document.indexingStatus = {
            isIndexed: false,
            errorMessage:
              error.name === 'ElasticsearchConnectionError'
                ? 'Indexing failed - Elastic Search disabled. Please ensure Elasticsearch is running and try again.'
                : error.message || 'Indexing failed. Please try again.',
          };
          await document.save();

          console.log(`❌ Document re-indexing failed: ${document.fileName}`);
        });

      return res.status(200).json({
        success: true,
        message: 'Retry indexing started',
        data: {
          id: document._id,
          status: document.status,
        },
      });
    } catch (error) {
      console.error('Retry indexing error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrying indexing',
        error: error.message,
      });
    }
  }

  /**
   * Get AI configuration info
   */
  static async getAIConfig(req, res) {
    try {
      const config = {
        provider: ragService.aiProvider,
        models: {},
      };

      if (ragService.aiProvider === 'gemini') {
        config.models = {
          embedding: ragService.geminiEmbeddingModel,
          chat: ragService.geminiChatModel,
        };
        config.apiKeyConfigured = !!ragService.geminiApiKey;
      } else if (ragService.aiProvider === 'openai') {
        config.models = {
          embedding: ragService.openaiEmbeddingModel,
          chat: ragService.openaiChatModel,
        };
        config.apiKeyConfigured = !!ragService.openaiApiKey;
      }

      config.elasticsearchUrl =
        process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

      return res.status(200).json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error('Get AI config error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching AI configuration',
        error: error.message,
      });
    }
  }

  /**
   * Get detailed AI configuration (superadmin only)
   */
  static async getDetailedAIConfig(req, res) {
    try {
      // Load from database
      const config = await RagConfigModel.getMainConfig();

      // Return config without exposing API keys (only show if configured)
      const responseConfig = {
        provider: config.ai.provider,
        openai: {
          embeddingModel: config.ai.openai.embeddingModel,
          chatModel: config.ai.openai.chatModel,
          apiKeyConfigured: !!(
            config.ai.openai.apiKey && config.ai.openai.apiKey.trim() !== ''
          ),
        },
        gemini: {
          embeddingModel: config.ai.gemini.embeddingModel,
          chatModel: config.ai.gemini.chatModel,
          apiKeyConfigured: !!(
            config.ai.gemini.apiKey && config.ai.gemini.apiKey.trim() !== ''
          ),
        },
      };

      return res.status(200).json({
        success: true,
        data: responseConfig,
      });
    } catch (error) {
      console.error('Get detailed AI config error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching detailed AI configuration',
        error: error.message,
      });
    }
  }

  /**
   * Validate API key by making a test call
   */
  static async validateAPIKey(req, res) {
    try {
      const { provider, apiKey, model } = req.body;

      if (!provider || !apiKey) {
        return res.status(400).json({
          success: false,
          message: 'Provider and API key are required',
        });
      }

      let isValid = false;
      let errorMessage = '';

      if (provider === 'openai') {
        try {
          // Prefer validating against the provided model using chat completions
          const testModel = model || 'gpt-3.5-turbo';
          const response = await fetch(
            'https://api.openai.com/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: testModel,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1,
              }),
            },
          );

          if (response.ok) {
            isValid = true;
          } else {
            const errorData = await response.json().catch(() => ({}));
            errorMessage =
              errorData.error?.message ||
              `Invalid OpenAI API key or model '${testModel}'`;
          }
        } catch (error) {
          errorMessage = 'Failed to validate OpenAI API key: ' + error.message;
        }
      } else if (provider === 'gemini') {
        try {
          // Test Gemini API with the selected model
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(apiKey);
          const primaryModel =
            model && model !== 'default' ? model : 'gemini-2.5-flash';
          const candidates = [
            primaryModel,
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-flash-latest',
            'gemini-1.5-pro-latest',
            'gemini-1.5-flash',
            'gemini-pro',
          ];

          let validated = false;
          let lastErr = '';
          for (const candidate of candidates) {
            try {
              const gm = genAI.getGenerativeModel({ model: candidate });
              await gm.generateContent('ping');
              validated = true;
              break;
            } catch (e) {
              lastErr = e && e.message ? e.message : String(e);
              // try next candidate
            }
          }

          if (validated) {
            isValid = true;
          } else {
            errorMessage = lastErr || 'Invalid Gemini API key or model';
          }
        } catch (error) {
          errorMessage = error.message || 'Invalid Gemini API key or model';
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid provider. Must be "openai" or "gemini"',
        });
      }

      return res.status(200).json({
        success: true,
        valid: isValid,
        message: isValid ? 'API key is valid' : errorMessage,
      });
    } catch (error) {
      console.error('Validate API key error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error validating API key',
        error: error.message,
      });
    }
  }

  /**
   * Update AI configuration (superadmin only)
   */
  static async updateAIConfig(req, res) {
    try {
      const { provider, openai, gemini } = req.body;

      if (!provider || (provider !== 'openai' && provider !== 'gemini')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid provider. Must be "openai" or "gemini"',
        });
      }

      // Validate API keys if provided
      if (openai?.apiKey) {
        try {
          const testModel = openai?.chatModel || 'gpt-3.5-turbo';
          const response = await fetch(
            'https://api.openai.com/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${openai.apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: testModel,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1,
              }),
            },
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(400).json({
              success: false,
              message:
                'Invalid OpenAI API key or model: ' +
                (errorData.error?.message ||
                  `Model '${testModel}' not accessible`),
            });
          }
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Failed to validate OpenAI API key: ' + error.message,
          });
        }
      }

      if (gemini?.apiKey) {
        try {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(gemini.apiKey);
          const primaryModel =
            gemini?.chatModel && gemini.chatModel !== 'default'
              ? gemini.chatModel
              : 'gemini-2.5-flash';
          const candidates = [
            primaryModel,
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-flash-latest',
            'gemini-1.5-pro-latest',
            'gemini-1.5-flash',
            'gemini-pro',
          ];

          let validated = false;
          let lastErr = '';
          for (const candidate of candidates) {
            try {
              const gm = genAI.getGenerativeModel({ model: candidate });
              await gm.generateContent('ping');
              validated = true;
              break;
            } catch (e) {
              lastErr = e && e.message ? e.message : String(e);
            }
          }

          if (!validated) {
            return res.status(400).json({
              success: false,
              message: lastErr || 'Invalid Gemini API key or model',
            });
          }
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: error.message || 'Invalid Gemini API key or model',
          });
        }
      }

      // Load config from database
      let config = await RagConfigModel.getMainConfig();

      // Update provider if provided
      if (provider) {
        config.ai.provider = provider;
      }

      // Update OpenAI config
      if (openai) {
        if (openai.apiKey !== undefined) {
          // Encrypt API key before storing
          const encryptedKey = openai.apiKey
            ? encryptionUtils.encrypt(openai.apiKey)
            : '';
          config.ai.openai.apiKey = encryptedKey;
        }
        if (openai.embeddingModel) {
          config.ai.openai.embeddingModel = openai.embeddingModel;
        }
        if (openai.chatModel) {
          config.ai.openai.chatModel = openai.chatModel;
        }
      }

      // Update Gemini config
      if (gemini) {
        if (gemini.apiKey !== undefined) {
          // Encrypt API key before storing
          const encryptedKey = gemini.apiKey
            ? encryptionUtils.encrypt(gemini.apiKey)
            : '';
          config.ai.gemini.apiKey = encryptedKey;
        }
        if (gemini.embeddingModel) {
          config.ai.gemini.embeddingModel = gemini.embeddingModel;
        }
        if (gemini.chatModel) {
          // Allow 'default' sentinel to apply our preferred default
          config.ai.gemini.chatModel =
            gemini.chatModel === 'default'
              ? 'gemini-2.5-flash'
              : gemini.chatModel;
        }
      }

      // Save to database
      await config.save();

      // Reinitialize RAG service with new config (decrypt keys when loading)
      await RagController.loadConfigIntoRagService(config);

      // Return response without exposing API keys
      return res.status(200).json({
        success: true,
        message: 'AI configuration updated successfully. API key validated.',
        data: {
          provider: config.ai.provider,
          openai: {
            embeddingModel: config.ai.openai.embeddingModel,
            chatModel: config.ai.openai.chatModel,
            apiKeyConfigured: !!(
              config.ai.openai.apiKey && config.ai.openai.apiKey.trim() !== ''
            ),
          },
          gemini: {
            embeddingModel: config.ai.gemini.embeddingModel,
            chatModel: config.ai.gemini.chatModel,
            apiKeyConfigured: !!(
              config.ai.gemini.apiKey && config.ai.gemini.apiKey.trim() !== ''
            ),
          },
        },
      });
    } catch (error) {
      console.error('Update AI config error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating AI configuration',
        error: error.message,
      });
    }
  }

  /**
   * Remove API key for a specific provider (superadmin only)
   */
  static async removeAPIKey(req, res) {
    try {
      const { provider } = req.body;

      if (!provider || (provider !== 'openai' && provider !== 'gemini')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid provider. Must be "openai" or "gemini"',
        });
      }

      // Load config from database
      const config = await RagConfigModel.getMainConfig();

      // Remove API key for the specified provider
      if (provider === 'openai') {
        config.ai.openai.apiKey = '';
        ragService.openaiApiKey = '';
      } else if (provider === 'gemini') {
        config.ai.gemini.apiKey = '';
        ragService.geminiApiKey = '';
        ragService.genAI = null;
      }

      // Save to database
      await config.save();

      return res.status(200).json({
        success: true,
        message: `${provider === 'openai' ? 'OpenAI' : 'Gemini'} API key removed successfully`,
        data: {
          provider,
          apiKeyConfigured: false,
        },
      });
    } catch (error) {
      console.error('Remove API key error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error removing API key',
        error: error.message,
      });
    }
  }

  /**
   * Load config from database into RagService (decrypts API keys)
   */
  static async loadConfigIntoRagService(config) {
    try {
      ragService.aiProvider = config.ai.provider;

      if (config.ai.provider === 'openai') {
        // Decrypt API key when loading into service
        const decryptedKey = config.ai.openai.apiKey
          ? encryptionUtils.decrypt(config.ai.openai.apiKey)
          : process.env.OPENAI_API_KEY || '';
        ragService.openaiApiKey = decryptedKey;
        ragService.openaiEmbeddingModel = config.ai.openai.embeddingModel;
        ragService.openaiChatModel = config.ai.openai.chatModel;
      } else if (config.ai.provider === 'gemini') {
        // Decrypt API key when loading into service
        const decryptedKey = config.ai.gemini.apiKey
          ? encryptionUtils.decrypt(config.ai.gemini.apiKey)
          : process.env.GEMINI_API_KEY || '';
        ragService.geminiApiKey = decryptedKey;
        ragService.geminiEmbeddingModel = config.ai.gemini.embeddingModel;
        ragService.geminiChatModel = config.ai.gemini.chatModel;

        // Reinitialize Gemini client
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        if (ragService.geminiApiKey) {
          ragService.genAI = new GoogleGenerativeAI(ragService.geminiApiKey);
        }
      }
    } catch (error) {
      console.error('Error loading config into RagService:', error);
      throw error;
    }
  }

  /**
   * Get available models for a specific provider
   */
  static async getAvailableModels(req, res) {
    try {
      const { provider, apiKey } = req.body;

      if (!provider || !apiKey) {
        return res.status(400).json({
          success: false,
          message: 'Provider and API key are required',
        });
      }

      let models = { chatModels: [], embeddingModels: [] };

      if (provider === 'openai') {
        try {
          const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            throw new Error('Failed to fetch OpenAI models');
          }

          const data = await response.json();

          // Filter chat models (GPT models)
          models.chatModels = data.data
            .filter((m) => m.id.includes('gpt'))
            .map((m) => ({
              id: m.id,
              name: m.id,
              description: m.owned_by || 'OpenAI',
            }))
            .sort((a, b) => {
              // Prioritize newer models
              if (a.id.includes('gpt-4o')) return -1;
              if (b.id.includes('gpt-4o')) return 1;
              if (a.id.includes('gpt-4')) return -1;
              if (b.id.includes('gpt-4')) return 1;
              return a.id.localeCompare(b.id);
            });

          // Filter embedding models
          models.embeddingModels = data.data
            .filter((m) => m.id.includes('embedding'))
            .map((m) => ({
              id: m.id,
              name: m.id,
              description: m.owned_by || 'OpenAI',
            }))
            .sort((a, b) => {
              // Prioritize text-embedding-3-small
              if (a.id === 'text-embedding-3-small') return -1;
              if (b.id === 'text-embedding-3-small') return 1;
              return a.id.localeCompare(b.id);
            });
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Failed to fetch OpenAI models: ' + error.message,
          });
        }
      } else if (provider === 'gemini') {
        // Gemini models - curated for document-based RAG chatbots
        models.chatModels = [
          {
            id: 'gemini-2.5-flash',
            name: 'Gemini 2.5 Flash',
            description: '🌟 RECOMMENDED - Best for document Q&A (FREE)',
          },
          {
            id: 'gemini-2.5-flash-lite',
            name: 'Gemini 2.5 Flash Lite',
            description: 'Most cost-effective (FREE)',
          },
          {
            id: 'gemini-2.0-flash',
            name: 'Gemini 2.0 Flash',
            description: 'Balanced & reliable (FREE)',
          },
          {
            id: 'gemini-2.0-flash-lite',
            name: 'Gemini 2.0 Flash Lite',
            description: 'Lightweight (FREE)',
          },
          {
            id: 'gemini-2.5-pro',
            name: 'Gemini 2.5 Pro',
            description: 'Most advanced for complex queries (FREE)',
          },
        ];

        models.embeddingModels = [
          {
            id: 'text-embedding-004',
            name: 'text-embedding-004',
            description: 'Latest & Best (FREE)',
          },
          {
            id: 'embedding-001',
            name: 'embedding-001',
            description: 'Legacy (FREE)',
          },
        ];
      }

      return res.status(200).json({
        success: true,
        data: models,
      });
    } catch (error) {
      console.error('Get available models error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching available models',
        error: error.message,
      });
    }
  }
}

export default RagController;
