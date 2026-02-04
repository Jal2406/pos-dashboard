import mongoose from 'mongoose';

const ragDocumentSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileExtension: {
      type: String,
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Optional for now, can be required later
    },
    status: {
      type: String,
      enum: ['uploading', 'processing', 'indexed', 'error'],
      default: 'uploading',
    },
    indexingStatus: {
      isIndexed: {
        type: Boolean,
        default: false,
      },
      indexedAt: {
        type: Date,
      },
      chunkCount: {
        type: Number,
        default: 0,
      },
      errorMessage: {
        type: String,
      },
    },
    metadata: {
      textContent: {
        type: String,
      },
      wordCount: {
        type: Number,
      },
      pageCount: {
        type: Number,
      },
    },
    elasticsearchIndex: {
      type: String,
      default: 'rag_documents',
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
ragDocumentSchema.index({ createdAt: -1 });
ragDocumentSchema.index({ status: 1 });
ragDocumentSchema.index({ 'indexingStatus.isIndexed': 1 });

const RagDocument = mongoose.model('RagDocument', ragDocumentSchema);

export default RagDocument;
