import { Client } from '@elastic/elasticsearch';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { RagConfig } from '../config/rag-config.fallback.js';

// PDF parsing handled via pdf-parse

class RagService {
  constructor() {
    this.esClient = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: {
        apiKey: process.env.ELASTICSEARCH_KEY,
      },
    });
    this.indexName = 'rag_documents';

    // Logging control
    this.verboseLog =
      (process.env.RAG_VERBOSE_LOG || 'true').toLowerCase() !== 'false';

    // AI Provider Configuration - prioritize config file, fallback to env vars
    this.aiProvider =
      RagConfig.ai.provider || process.env.AI_PROVIDER || 'gemini';

    // OpenAI Configuration
    this.openaiApiKey =
      RagConfig.ai.openai.apiKey || process.env.OPENAI_API_KEY;
    this.openaiEmbeddingModel =
      RagConfig.ai.openai.embeddingModel ||
      process.env.OPENAI_EMBEDDING_MODEL ||
      'text-embedding-ada-002';
    this.openaiChatModel =
      RagConfig.ai.openai.chatModel ||
      process.env.OPENAI_CHAT_MODEL ||
      'gpt-3.5-turbo';

    // Gemini Configuration
    this.geminiApiKey =
      RagConfig.ai.gemini.apiKey || process.env.GEMINI_API_KEY;
    this.geminiEmbeddingModel =
      RagConfig.ai.gemini.embeddingModel ||
      process.env.GEMINI_EMBEDDING_MODEL ||
      'text-embedding-004';
    this.geminiChatModel =
      RagConfig.ai.gemini.chatModel ||
      process.env.GEMINI_CHAT_MODEL ||
      'gemini-2.5-flash';

    // Initialize Gemini client if using Gemini
    if (this.aiProvider === 'gemini' && this.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
    }
  }

  // Internal helper: structured log
  log(event, data = {}) {
    if (!this.verboseLog) return;
    try {
      const safe = JSON.parse(
        JSON.stringify(data, (key, value) => {
          if (typeof value === 'string' && value.length > 500) {
            return value.slice(0, 500) + '...';
          }
          return value;
        }),
      );
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({ ts: new Date().toISOString(), event, ...safe }),
      );
    } catch (_) {
      // ignore logging serialization errors
    }
  }

  /**
   * Initialize Elasticsearch index with proper mappings
   */
  async initializeIndex() {
    try {
      const indexExists = await this.esClient.indices.exists({
        index: this.indexName,
      });

      if (!indexExists) {
        await this.esClient.indices.create({
          index: this.indexName,
          body: {
            // settings: {
            //   number_of_shards: 1,
            //   number_of_replicas: 0,
            // },
            mappings: {
              properties: {
                fileId: { type: 'keyword' },
                fileName: { type: 'text' },
                chunkId: { type: 'keyword' },
                chunkIndex: { type: 'integer' },
                content: {
                  type: 'text',
                  analyzer: 'standard',
                },
                embedding: {
                  type: 'dense_vector',
                  dims: 1536, // OpenAI ada-002 embedding size
                },
                metadata: {
                  type: 'object',
                  enabled: true,
                },
                createdAt: { type: 'date' },
              },
            },
          },
        });
        console.log(`✅ Elasticsearch index '${this.indexName}' created`);
      } else {
        console.log(
          `ℹ️ Elasticsearch index '${this.indexName}' already exists`,
        );
      }
    } catch (error) {
      console.error('Error initializing Elasticsearch index:', error);
      throw error;
    }
  }

  /**
   * Extract text from file based on type
   */
  async extractTextFromFile(filePath, mimeType) {
    try {
      this.log('file.read.start', {
        filePath,
        mimeType,
        isUrl: /^https?:\/\//i.test(String(filePath)),
      });
      // Support Cloudinary/HTTP URLs as well as local filesystem paths
      let fileBuffer;
      if (typeof filePath === 'string' && /^https?:\/\//i.test(filePath)) {
        const resp = await this.fetchWithTimeout(filePath, {}, 15000);
        if (!resp.ok) {
          throw new Error(
            `Failed to download file from URL: ${resp.status} ${resp.statusText}`,
          );
        }
        fileBuffer = Buffer.from(await resp.arrayBuffer());
      } else {
        fileBuffer = await fs.readFile(filePath);
      }
      this.log('file.read.done', {
        bytes: fileBuffer?.byteLength || fileBuffer?.length || 0,
      });

      // Handle PDF files
      if (mimeType === 'application/pdf' || path.extname(filePath) === '.pdf') {
        try {
          // Use pdf-parse for server-side PDF parsing
          const pdfData = await pdfParse(fileBuffer);
          
          let fullText = '';
          
          // Extract text from each page
          if (pdfData.text) {
            fullText = pdfData.text;
          } else if (pdfData.version) {
            // Fallback: iterate through pages if available
            fullText = pdfData.text || '';
          }

          const text = fullText.trim();
          if (!text) {
            console.warn('PDF contains no extractable text');
            return '';
          }

          this.log('text.extracted', { kind: 'pdf', length: text.length });
          return text;
        } catch (error) {
          console.error('PDF parsing error:', error);
          throw new Error(`Failed to parse PDF: ${error.message}`);
        }
      }

      // Handle Word (.docx)
      if (
        mimeType ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        path.extname(filePath).toLowerCase() === '.docx'
      ) {
        try {
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          const text = (result.value || '').trim();
          this.log('text.extracted', { kind: 'docx', length: text.length });
          return text;
        } catch (error) {
          console.error('DOCX parsing error:', error);
          throw new Error(`Failed to parse DOCX: ${error.message}`);
        }
      }

      // Handle text files
      if (
        mimeType.startsWith('text/') ||
        ['.txt', '.json', '.csv', '.md'].includes(path.extname(filePath))
      ) {
        const text = fileBuffer.toString('utf-8');
        this.log('text.extracted', {
          kind: 'text-like',
          length: text?.length || 0,
        });
        return text;
      }

      // Handle JSON
      if (
        mimeType === 'application/json' ||
        path.extname(filePath) === '.json'
      ) {
        const jsonData = JSON.parse(fileBuffer.toString('utf-8'));
        const text = JSON.stringify(jsonData, null, 2);
        this.log('text.extracted', { kind: 'json', length: text?.length || 0 });
        return text;
      }

      throw new Error(`Unsupported file type: ${mimeType}`);
    } catch (error) {
      console.error('Error extracting text from file:', error);
      throw error;
    }
  }

  /**
   * Split text into chunks (sentence-aware with small word overlap)
   */
  splitIntoChunks(text, chunkSize = 1000, overlap = 200) {
    // Normalize whitespace
    const normalized = (text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    // Split into sentences (simple heuristic)
    const sentences = normalized.split(/(?<=[.!?])\s+/);

    const chunks = [];
    let current = '';
    for (const sentence of sentences) {
      if ((current + ' ' + sentence).trim().length <= chunkSize) {
        current = (current ? current + ' ' : '') + sentence;
      } else {
        if (current) {
          chunks.push(current.trim());
        }
        // start new with small overlap of last 5 words from previous
        const prevWords = current.split(' ').slice(-5).join(' ').trim();
        current = (prevWords ? prevWords + ' ' : '') + sentence;
        // ensure max length
        if (current.length > chunkSize) {
          current = current.slice(0, chunkSize).trim();
        }
      }
    }
    if (current) {
      chunks.push(current.trim());
    }

    // Fallback if sentence split yielded nothing
    if (chunks.length === 0) {
      const safeChunkSize = Math.max(1, chunkSize);
      const safeOverlap = Math.max(0, Math.min(overlap, safeChunkSize - 1));
      let startIndex = 0;
      while (startIndex < normalized.length) {
        const endIndex = Math.min(
          startIndex + safeChunkSize,
          normalized.length,
        );
        const chunk = normalized.substring(startIndex, endIndex).trim();
        if (chunk.length > 0) chunks.push(chunk);
        if (endIndex === normalized.length) break;
        const nextStart = endIndex - safeOverlap;
        startIndex = nextStart <= startIndex ? endIndex : nextStart;
      }
    }

    // Filter very small fragments
    const filtered = chunks.filter((c) => c.length >= 30);
    const totalChars = filtered.reduce((a, b) => a + b.length, 0);
    this.log('chunking.done', {
      chunks: filtered.length,
      avgLen: filtered.length ? Math.round(totalChars / filtered.length) : 0,
      chunkSize,
      overlap,
    });
    return filtered;
  }

  /**
   * Generate embedding using OpenAI or Gemini
   */
  async generateEmbedding(text) {
    try {
      if (this.aiProvider === 'gemini') {
        return await this.generateGeminiEmbedding(text);
      } else if (this.aiProvider === 'openai') {
        return await this.generateOpenAIEmbedding(text);
      } else {
        throw new Error(`Unsupported AI provider: ${this.aiProvider}`);
      }
    } catch (error) {
      console.error('Error generating embedding:', error);
      // Fallback to dummy embedding if API fails
      console.warn('⚠️ Falling back to dummy embedding');
      return Array(1536)
        .fill(0)
        .map(() => Math.random());
    }
  }

  /**
   * Generate embedding using Gemini API
   */
  async generateGeminiEmbedding(text) {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    const model = this.genAI.getGenerativeModel({
      model: this.geminiEmbeddingModel,
    });
    // Add timeout wrapper to prevent hangs
    const result = await Promise.race([
      model.embedContent(text),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout')), 10000),
      ),
    ]);
    const embedding = result.embedding.values;

    // Gemini embeddings are 768 dimensions, pad to 1536 for consistency
    if (embedding.length < 1536) {
      return [...embedding, ...Array(1536 - embedding.length).fill(0)];
    }
    return embedding.slice(0, 1536);
  }

  /**
   * Generate embedding using OpenAI API
   */
  async generateOpenAIEmbedding(text) {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Fetch with timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.openaiEmbeddingModel,
        input: text,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  async fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        ...(options || {}),
        signal: controller.signal,
      });
      return resp;
    } finally {
      clearTimeout(id);
    }
  }

  /**
   * Index document in Elasticsearch
   */
  async indexDocument(fileId, fileName, filePath, mimeType) {
    try {
      this.log('index.start', { fileId, fileName, mimeType });

      // Check if Elasticsearch is available BEFORE processing
      const isAvailable = await this.isElasticsearchAvailable();
      if (!isAvailable) {
        const error = new Error(
          'Elasticsearch is currently unavailable. Please ensure Elasticsearch is running and accessible.',
        );
        error.name = 'ElasticsearchConnectionError';
        throw error;
      }

      // Extract text
      const text = await this.extractTextFromFile(filePath, mimeType);
      this.log('index.textReady', { length: text?.length || 0 });
      // Split into chunks
      const chunks = this.splitIntoChunks(text);

      console.log(`📄 Indexing ${chunks.length} chunks for file: ${fileName}`);
      this.log('index.chunkSummary', {
        fileId,
        fileName,
        chunks: chunks.length,
        firstChunkPreview: chunks[0]?.slice(0, 200),
      });

      // If no chunks, check Elasticsearch one more time before returning success
      if (chunks.length === 0) {
        console.warn(`No text content found in file: ${fileName}`);
        // Even if no chunks, verify Elasticsearch is still available before marking as success
        const stillAvailable = await this.isElasticsearchAvailable();
        if (!stillAvailable) {
          const error = new Error(
            'Elasticsearch is currently unavailable. Please ensure Elasticsearch is running and accessible.',
          );
          error.name = 'ElasticsearchConnectionError';
          throw error;
        }
        return {
          success: true,
          chunkCount: 0,
          wordCount: 0,
        };
      }

      // Index each chunk
      const bulkOperations = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = `${fileId}_chunk_${i}`;
        if (i === 0)
          this.log('embedding.request', {
            fileId,
            chunkIndex: i,
            textLen: chunks[i].length,
          });
        const embedding = await this.generateEmbedding(chunks[i]);
        if (i === 0)
          this.log('embedding.response', {
            fileId,
            chunkIndex: i,
            dims: Array.isArray(embedding) ? embedding.length : undefined,
          });

        bulkOperations.push(
          { index: { _index: this.indexName, _id: chunkId } },
          {
            fileId: String(fileId),
            fileName,
            chunkId,
            chunkIndex: i,
            content: chunks[i],
            embedding,
            metadata: {
              chunkCount: chunks.length,
              chunkLength: chunks[i].length,
            },
            createdAt: new Date().toISOString(),
          },
        );
      }

      // Bulk index
      if (bulkOperations.length > 0) {
        // Double-check Elasticsearch availability before bulk indexing
        const isAvailableBeforeBulk = await this.isElasticsearchAvailable();
        if (!isAvailableBeforeBulk) {
          const error = new Error(
            'Elasticsearch is currently unavailable. Please ensure Elasticsearch is running and accessible.',
          );
          error.name = 'ElasticsearchConnectionError';
          throw error;
        }

        try {
          const bulkResponse = await this.esClient.bulk({
            refresh: true,
            body: bulkOperations,
          });

          if (bulkResponse.errors) {
            console.error('Bulk indexing had errors:', bulkResponse.errors);
            throw new Error('Some chunks failed to index');
          }
          this.log('index.bulkDone', {
            items: bulkOperations.length / 2,
            errors: !!bulkResponse.errors,
          });
        } catch (bulkError) {
          // Check if it's a connection error
          if (
            bulkError.name === 'ConnectionError' ||
            bulkError.name === 'ElasticsearchConnectionError' ||
            bulkError.message?.includes('ECONNREFUSED') ||
            bulkError.message?.includes('unavailable') ||
            bulkError.constructor?.name === 'ConnectionError'
          ) {
            const connectionError = new Error(
              'Elasticsearch is currently unavailable. Please ensure Elasticsearch is running and accessible.',
            );
            connectionError.name = 'ElasticsearchConnectionError';
            throw connectionError;
          }
          throw bulkError;
        }
      }

      return {
        success: true,
        chunkCount: chunks.length,
        wordCount: text ? text.split(/\s+/).length : 0,
      };
    } catch (error) {
      console.error('Error indexing document:', error);
      this.log('index.error', { message: error?.message });

      // Check if it's a connection or response error (both indicate ES is unavailable)
      const errorType = error.constructor?.name || error.name || '';
      if (
        errorType === 'ConnectionError' ||
        errorType === 'ResponseError' ||
        error.name === 'ConnectionError' ||
        error.name === 'ResponseError' ||
        error.name === 'ElasticsearchConnectionError' ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('unavailable')
      ) {
        const connectionError = new Error(
          'Elasticsearch is currently unavailable. Please ensure Elasticsearch is running and accessible.',
        );
        connectionError.name = 'ElasticsearchConnectionError';
        throw connectionError;
      }

      throw error;
    }
  }

  /**
   * Calculate text similarity using a simple but effective method
   */
  calculateTextSimilarity(text1, text2) {
    // Normalize both texts
    const normalize = (text) =>
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim();
    const normalized1 = normalize(text1);
    const normalized2 = normalize(text2);

    // If texts are identical after normalization, return perfect match
    if (normalized1 === normalized2) return 1.0;

    // Split into words
    const words1 = new Set(normalized1.split(/\s+/));
    const words2 = new Set(normalized2.split(/\s+/));

    // Calculate Jaccard similarity (intersection over union)
    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Extract FAQ pairs from content (supports JSON and text formats)
   */
  extractFAQPairs(content) {
    const faqPairs = [];

    try {
      // Try parsing as JSON first
      const jsonContent = JSON.parse(content);

      // Handle nested FAQ structure
      const extractFromObject = (obj) => {
        if (typeof obj === 'string') {
          return; // Skip string values at top level
        }

        Object.entries(obj).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            // This is a category, iterate through its questions
            Object.entries(value).forEach(([question, answer]) => {
              if (typeof answer === 'string') {
                faqPairs.push({ question, answer });
              }
            });
          } else if (typeof value === 'string') {
            // Direct question-answer pair
            faqPairs.push({ question: key, answer: value });
          }
        });
      };

      extractFromObject(jsonContent);
    } catch (e) {
      // Not JSON, try parsing as text with question-answer pattern
      // Common patterns: "Q: ... A: ...", "Question: ... Answer: ...", etc.
      const lines = content.split('\n');
      let currentQuestion = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect question patterns
        if (line.endsWith('?') || line.match(/^(Q:|Question:|query:)/i)) {
          currentQuestion = line
            .replace(/^(Q:|Question:|query:)\s*/i, '')
            .trim();
        } else if (currentQuestion && line.match(/^(A:|Answer:|response:)/i)) {
          const answer = line.replace(/^(A:|Answer:|response:)\s*/i, '').trim();
          if (answer) {
            faqPairs.push({ question: currentQuestion, answer });
            currentQuestion = null;
          }
        } else if (currentQuestion && line && line.length > 10) {
          // Assume this is the answer
          faqPairs.push({ question: currentQuestion, answer: line });
          currentQuestion = null;
        }
      }
    }

    return faqPairs;
  }

  /**
   * Search for exact FAQ match before doing semantic search
   */
  async findExactFAQMatch(queryText, chunks) {
    try {
      this.log('faq.match.start', {
        queryLen: (queryText || '').length,
        chunksCount: chunks?.length || 0,
      });

      const threshold = 0.75; // 75% similarity required for exact match
      let bestMatch = null;
      let bestScore = 0;

      for (const chunk of chunks) {
        const faqPairs = this.extractFAQPairs(chunk.content);

        for (const pair of faqPairs) {
          const similarity = this.calculateTextSimilarity(
            queryText,
            pair.question,
          );

          if (similarity > bestScore && similarity >= threshold) {
            bestScore = similarity;
            bestMatch = {
              question: pair.question,
              answer: pair.answer,
              similarity: similarity,
              source: chunk.fileName,
            };
          }
        }
      }

      if (bestMatch) {
        this.log('faq.match.found', {
          matchedQuestion: bestMatch.question,
          similarity: bestMatch.similarity,
          source: bestMatch.source,
        });
      } else {
        this.log('faq.match.notfound', { threshold });
      }

      return bestMatch;
    } catch (error) {
      console.error('Error finding FAQ match:', error);
      this.log('faq.match.error', { message: error?.message });
      return null;
    }
  }

  /**
   * Check if Elasticsearch is available
   */
  async isElasticsearchAvailable() {
    try {
      // Use ping with a short timeout to quickly detect if ES is down
      // ping() returns true if successful, throws error if not
      // Try a simple request that doesn't require authentication or index
      const response = await this.esClient.ping({ requestTimeout: 2000 });
      return true;
    } catch (error) {
      // Log the error for debugging
      const errorType = error.constructor?.name || error.name || 'UnknownError';
      const errorMessage = error.message || String(error);
      const statusCode =
        error.statusCode ||
        error.meta?.statusCode ||
        error.meta?.body?.error?.status;

      console.warn('Elasticsearch ping failed:', errorType);
      console.warn('Error message:', errorMessage);
      console.warn('Status code:', statusCode);

      this.log('elasticsearch.ping.failed', {
        error: errorMessage,
        type: errorType,
        statusCode: statusCode,
        fullError: error.meta || error,
      });

      // ResponseError means ES is running but returned an error
      if (errorType === 'ResponseError' || error.name === 'ResponseError') {
        // Check status code to determine the issue
        if (statusCode === 401 || statusCode === 403) {
          // Authentication failed - ES is running but auth is wrong
          console.error(
            'Elasticsearch authentication failed (401/403). Please check your ELASTICSEARCH_KEY configuration.',
          );
          return false; // ES is technically running but not usable due to auth
        } else if (statusCode === 404) {
          // 404 on ping might mean ES is starting up or endpoint doesn't exist
          // Try a simpler check - just try to connect without ping
          try {
            // Try to get cluster info instead of ping
            await this.esClient.cluster.health({ timeout: '1s' });
            console.warn(
              'Elasticsearch ping failed but cluster health check passed. ES might be starting up.',
            );
            return true; // ES is up, just ping might have issues
          } catch (healthError) {
            console.warn(
              'Elasticsearch ping and health check both failed. ES might still be starting up.',
            );
            return false;
          }
        } else if (statusCode >= 500) {
          // 5xx errors - ES is running but having issues (might be starting up)
          console.warn(
            `Elasticsearch returned ${statusCode}. ES might still be starting up or having issues.`,
          );
          // Try cluster health as fallback
          try {
            await this.esClient.cluster.health({ timeout: '1s' });
            console.warn(
              'Elasticsearch ping failed but cluster is accessible. ES might be starting up.',
            );
            return true; // ES is accessible, might be starting up
          } catch (healthError) {
            return false; // ES is not ready
          }
        } else {
          // Other ResponseErrors (4xx) - ES is running but something is wrong
          console.warn(
            `Elasticsearch responded with error ${statusCode}. Trying cluster health check...`,
          );
          // Try cluster health as fallback to see if ES is actually accessible
          try {
            await this.esClient.cluster.health({ timeout: '1s' });
            console.warn(
              'Elasticsearch ping failed but cluster is accessible. Proceeding with indexing.',
            );
            return true; // ES is accessible despite ping failure
          } catch (healthError) {
            console.warn(
              `Cluster health check also failed. ES might be misconfigured.`,
            );
            return false;
          }
        }
      }

      // ConnectionError means ES is completely down or unreachable
      if (errorType === 'ConnectionError' || error.name === 'ConnectionError') {
        return false;
      }

      // For other errors, consider ES unavailable
      return false;
    }
  }

  /**
   * Search similar documents using vector similarity
   */
  async searchSimilarChunks(queryText, fileIds = null, topK = 5) {
    try {
      this.log('search.start', {
        queryLen: (queryText || '').length,
        fileIds,
        topK,
      });

      // Check if Elasticsearch is available before attempting search
      const isAvailable = await this.isElasticsearchAvailable();
      if (!isAvailable) {
        const error = new Error(
          'Elasticsearch is currently unavailable. Please ensure Elasticsearch is running and accessible.',
        );
        error.name = 'ElasticsearchConnectionError';
        throw error;
      }

      const queryEmbedding = await this.generateEmbedding(queryText);

      const query = {
        script_score: {
          query:
            Array.isArray(fileIds) && fileIds.length > 0
              ? { terms: { fileId: fileIds.map(String) } }
              : { match_all: {} },
          script: {
            source: "cosineSimilarity(params.query_vector, 'embedding') + 1.0",
            params: { query_vector: queryEmbedding },
          },
        },
      };

      const response = await this.esClient.search({
        index: this.indexName,
        body: {
          size: topK,
          query,
          _source: ['fileId', 'fileName', 'content', 'chunkIndex'],
        },
      });

      const hits = response.hits.hits.map((hit) => ({
        fileId: hit._source.fileId,
        fileName: hit._source.fileName,
        content: hit._source.content,
        score: hit._score,
        chunkIndex: hit._source.chunkIndex,
      }));
      this.log('search.done', {
        total: hits.length,
        top: hits[0]
          ? {
              fileId: hits[0].fileId,
              fileName: hits[0].fileName,
              score: hits[0].score,
            }
          : null,
      });
      return hits;
    } catch (error) {
      console.error('Error searching similar chunks:', error);
      this.log('search.error', { message: error?.message });

      // Check if it's a connection error
      if (
        error.name === 'ConnectionError' ||
        error.name === 'ElasticsearchConnectionError' ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('unavailable')
      ) {
        const connectionError = new Error(
          'Elasticsearch is currently unavailable. Please ensure Elasticsearch is running and accessible.',
        );
        connectionError.name = 'ElasticsearchConnectionError';
        throw connectionError;
      }

      throw error;
    }
  }

  /**
   * Format AI response with proper HTML structure
   */
  formatResponse(rawResponse) {
    try {
      let formatted = rawResponse.trim();

      // Remove markdown code blocks if present
      formatted = formatted.replace(/```html\n?/g, '').replace(/```\n?/g, '');

      // Convert markdown-style bold (**text**) to HTML
      formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

      // Convert markdown-style lists to HTML
      // Handle unordered lists (lines starting with -, *, or •)
      const lines = formatted.split('\n');
      const processedLines = [];
      let inList = false;
      let listType = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect list items (-, *, •) or numbered (1., 2.)
        const isUnorderedItem = /^[-*•]\s+(.+)/.test(line);
        const isOrderedItem = /^\d+\.\s+(.+)/.test(line);

        if (isUnorderedItem || isOrderedItem) {
          const content = line
            .replace(/^[-*•]\s+/, '')
            .replace(/^\d+\.\s+/, '');
          const newListType = isUnorderedItem ? 'ul' : 'ol';

          // Start new list or continue existing
          if (!inList) {
            processedLines.push(`<${newListType}>`);
            inList = true;
            listType = newListType;
          } else if (listType !== newListType) {
            // Close previous list and start new one
            processedLines.push(`</${listType}>`);
            processedLines.push(`<${newListType}>`);
            listType = newListType;
          }

          processedLines.push(`<li>${content}</li>`);
        } else {
          // Not a list item
          if (inList) {
            processedLines.push(`</${listType}>`);
            inList = false;
            listType = null;
          }

          if (line) {
            processedLines.push(line);
          }
        }
      }

      // Close any open list
      if (inList) {
        processedLines.push(`</${listType}>`);
      }

      formatted = processedLines.join('\n');

      // Wrap standalone text (not in tags) in <p> tags
      formatted = formatted.replace(
        /^(?!<[hpu]|<li|<ol|<ul|<strong)(.+)$/gm,
        (match, text) => {
          const trimmed = text.trim();
          if (trimmed && !trimmed.startsWith('<')) {
            return `<p>${trimmed}</p>`;
          }
          return match;
        },
      );

      // Detect and format headings from plain text
      // Pattern: Text followed by a colon at the end of line
      formatted = formatted.replace(
        /<p>([^<>]+?):<\/p>\n(<ul>|<ol>|<p>)/g,
        '<h3>$1</h3>\n$2',
      );

      // Convert ## Heading to <h3>
      formatted = formatted.replace(/##\s+(.+?)(?=\n|$)/g, '<h3>$1</h3>');

      // Ensure proper spacing around block elements
      formatted = formatted.replace(
        /(<\/ul>|<\/ol>|<\/h3>|<\/p>)\n?(<ul>|<ol>|<h3>|<p>)/g,
        '$1\n\n$2',
      );

      // Remove excessive blank lines
      formatted = formatted.replace(/\n{3,}/g, '\n\n');

      // Clean up any malformed tags
      formatted = formatted.replace(/<p>\s*<\/p>/g, '');
      formatted = formatted.replace(/<li>\s*<\/li>/g, '');

      // Remove extra spaces
      formatted = formatted.replace(/\s+/g, ' ').trim();

      // Add line breaks between elements for readability
      formatted = formatted
        .replace(/(<\/p>)/g, '$1\n')
        .replace(/(<\/h3>)/g, '$1\n')
        .replace(/(<ul>)/g, '\n$1')
        .replace(/(<\/ul>)/g, '$1\n')
        .replace(/(<ol>)/g, '\n$1')
        .replace(/(<\/ol>)/g, '$1\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      this.log('format.response', {
        inputLength: rawResponse.length,
        outputLength: formatted.length,
        hasLists: formatted.includes('<ul>') || formatted.includes('<ol>'),
        hasHeadings: formatted.includes('<h3>'),
        hasParagraphs: formatted.includes('<p>'),
      });

      return formatted;
    } catch (error) {
      console.error('Error formatting response:', error);
      // Return original response if formatting fails
      return rawResponse;
    }
  }

  /**
   * Generate answer using retrieved context (Gemini or OpenAI)
   */
  async generateAnswer(question, context) {
    try {
      this.log('chat.generate.start', {
        questionLen: (question || '').length,
        contextLen: (context || '').length,
        provider: this.aiProvider,
      });

      let rawAnswer;
      if (this.aiProvider === 'gemini') {
        rawAnswer = await this.generateGeminiAnswer(question, context);
      } else if (this.aiProvider === 'openai') {
        rawAnswer = await this.generateOpenAIAnswer(question, context);
      } else {
        throw new Error(`Unsupported AI provider: ${this.aiProvider}`);
      }

      // Apply formatting post-processing
      const formattedAnswer = this.formatResponse(rawAnswer);

      return formattedAnswer;
    } catch (error) {
      console.error('Error generating answer:', error);
      this.log('chat.generate.error', { message: error?.message });
      return `<p>I apologize, but I encountered an error while generating the answer. Error: ${error.message}</p>`;
    }
  }

  /**
   * Generate answer using Gemini API
   */
  async generateGeminiAnswer(question, context) {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }
    this.log('chat.gemini.context.preview', {
      contextPreview: String(context || '').slice(0, 300),
    });
    const model = this.genAI.getGenerativeModel({
      model: this.geminiChatModel,
    });

    // Prompt adapted from PHP RagService with formatting and strict grounding
    const prompt = `You are a professional AI assistant. Provide clear, well-structured, and direct answers.

CRITICAL RULES:
1. Answer ONLY using information from the context below - do not make up information
2. Keep responses SHORT and SIMPLE - get straight to the point
3. Never use phrases like: "The document mentions", "According to the document", "The provided document", etc.
4. Present information directly as if you have expert knowledge
5. If information is missing, simply say: "The specific details about [topic] aren't available."

TONE EXAMPLES:
❌ BAD: "The provided document mentions payment methods can be configured..."
✅ GOOD: "Payment methods can be configured in System Settings."

❌ BAD: "However, the document does not specify the available payment options..."
✅ GOOD: "The specific payment options aren't detailed."

FORMATTING RULES (IMPORTANT):
1. Use <h3> for section headings if needed
2. Use <p> tags for paragraphs
3. Use <strong> for emphasis on key terms
4. For lists, ALWAYS use proper HTML bullet points:
   - Wrap list in <ul> tags
   - Each item in <li> tags
   - Example: <ul><li>First item</li><li>Second item</li></ul>
5. For numbered lists, use <ol> instead of <ul>
6. Use <br> sparingly for line breaks within paragraphs
7. Keep structure clean and well-organized

FORMATTING EXAMPLES:

Good List Format:
<p>The system supports multiple payment methods:</p>
<ul>
<li><strong>Cash</strong> - Physical currency payments</li>
<li><strong>Card</strong> - Credit and debit card processing</li>
<li><strong>UPI</strong> - Unified Payments Interface</li>
<li><strong>Digital Wallets</strong> - E-wallet integrations</li>
</ul>

Good with Heading:
<h3>Payment Features</h3>
<p>The system provides comprehensive payment options:</p>
<ul>
<li>Multiple payment methods support</li>
<li>Automatic receipt generation</li>
<li>Transaction history tracking</li>
</ul>

Short Answer:
<p>Payment methods can be configured in System Settings. The system tracks payment information for all subscriptions.</p>

Context:
${context}

Question: ${question}

Provide a well-formatted, direct answer:`;

    this.log('chat.gemini.prompt', { promptLen: prompt.length });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    this.log('chat.gemini.response', { length: text?.length || 0 });
    return text;
  }

  /**
   * Generate answer using OpenAI API
   */
  async generateOpenAIAnswer(question, context) {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Build the SAME prompt we use for Gemini to keep outputs consistent
    const prompt = `You are a professional AI assistant. Provide clear, well-structured, and direct answers.

CRITICAL RULES:
1. Answer ONLY using information from the context below - do not make up information
2. Keep responses SHORT and SIMPLE - get straight to the point
3. Never use phrases like: "The document mentions", "According to the document", "The provided document", etc.
4. Present information directly as if you have expert knowledge
5. If information is missing, simply say: "The specific details about [topic] aren't available."

TONE EXAMPLES:
❌ BAD: "The provided document mentions payment methods can be configured..."
✅ GOOD: "Payment methods can be configured in System Settings."

❌ BAD: "However, the document does not specify the available payment options..."
✅ GOOD: "The specific payment options aren't detailed."

FORMATTING RULES (IMPORTANT):
1. Use <h3> for section headings if needed
2. Use <p> tags for paragraphs
3. Use <strong> for emphasis on key terms
4. For lists, ALWAYS use proper HTML bullet points:
   - Wrap list in <ul> tags
   - Each item in <li> tags
   - Example: <ul><li>First item</li><li>Second item</li></ul>
5. For numbered lists, use <ol> instead of <ul>
6. Use <br> sparingly for line breaks within paragraphs
7. Keep structure clean and well-organized

FORMATTING EXAMPLES:

Good List Format:
<p>The system supports multiple payment methods:</p>
<ul>
<li><strong>Cash</strong> - Physical currency payments</li>
<li><strong>Card</strong> - Credit and debit card processing</li>
<li><strong>UPI</strong> - Unified Payments Interface</li>
<li><strong>Digital Wallets</strong> - E-wallet integrations</li>
</ul>

Good with Heading:
<h3>Payment Features</h3>
<p>The system provides comprehensive payment options:</p>
<ul>
<li>Multiple payment methods support</li>
<li>Automatic receipt generation</li>
<li>Transaction history tracking</li>
</ul>

Short Answer:
<p>Payment methods can be configured in System Settings. The system tracks payment information for all subscriptions.</p>

Context:
${context}

Question: ${question}

Provide a well-formatted, direct answer:`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.openaiChatModel,
        messages: [
          {
            role: 'system',
            content:
              'You are a professional, precise POS-domain assistant. Follow the user message instructions exactly.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        top_p: 0.9,
        presence_penalty: 0,
        frequency_penalty: 0,
        max_tokens: 700,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Delete document from Elasticsearch
   */
  async deleteDocument(fileId) {
    try {
      await this.esClient.deleteByQuery({
        index: this.indexName,
        body: {
          query: {
            term: { fileId },
          },
        },
      });

      console.log(`🗑️ Deleted all chunks for fileId: ${fileId}`);
      this.log('index.deleteByFile', { fileId });
      return { success: true };
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }
}

export default RagService;
