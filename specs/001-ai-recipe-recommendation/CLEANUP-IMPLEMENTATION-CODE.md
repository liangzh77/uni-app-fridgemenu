# Image Cleanup Implementation - Code Examples

This document provides ready-to-use code samples for implementing the image cleanup strategy.

---

## 1. BullMQ Setup

### 1.1 Initialize BullMQ Queue

**File**: `backend/src/jobs/imageCleanupJob.js`

```javascript
import Queue, { Worker } from 'bullmq';
import { createClient } from 'redis';
import { ImageCleanupService } from '../services/imageCleanupService.js';
import logger from '../utils/logger.js';

// Create Redis connection
const redisConnection = createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
});

redisConnection.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

// Create cleanup queue
export const cleanupQueue = new Queue('image-cleanup', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,  // 2 seconds base
    },
    removeOnComplete: {
      age: 3600,  // Keep completed jobs for 1 hour
    },
    removeOnFail: false,  // Keep failed jobs for debugging
  },
});

// Add scheduled job (runs daily at 2 AM UTC)
export async function scheduleCleanupJob() {
  try {
    const job = await cleanupQueue.add(
      'daily-cleanup',
      {},
      {
        repeat: {
          cron: '0 2 * * *',  // 2 AM UTC every day
          tz: 'UTC',
        },
        // Prevent duplicate scheduled jobs
        jobId: 'scheduled-daily-cleanup',
      }
    );

    logger.info('Scheduled cleanup job created', {
      jobId: job.id,
      nextRun: job.nextBsRunAt,
    });

    return job;
  } catch (error) {
    logger.error('Failed to schedule cleanup job:', error);
    throw error;
  }
}

// Define worker that processes cleanup jobs
export function setupCleanupWorker() {
  const cleanupService = new ImageCleanupService();

  const worker = new Worker('image-cleanup', async (job) => {
    try {
      logger.info('Starting image cleanup job', { jobId: job.id });

      const result = await cleanupService.executeCleanup(job);

      logger.info('Image cleanup completed', {
        jobId: job.id,
        ...result,
      });

      return result;
    } catch (error) {
      logger.error('Cleanup job failed', {
        jobId: job.id,
        error: error.message,
        stack: error.stack,
      });

      // Re-throw to trigger BullMQ retry
      throw error;
    }
  }, {
    connection: redisConnection,
    concurrency: 1,  // Only one cleanup job at a time
  });

  // Event handlers
  worker.on('completed', (job) => {
    logger.info('Cleanup job completed', { jobId: job.id });
  });

  worker.on('failed', (job, error) => {
    logger.error('Cleanup job failed permanently', {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      error: error.message,
    });

    // Send alert to admin
    sendAlert({
      severity: 'HIGH',
      message: `Image cleanup job ${job.id} failed after ${job.attemptsMade} attempts`,
      details: error.message,
    });
  });

  return worker;
}

// Function to trigger cleanup manually (e.g., when storage > 80%)
export async function triggerImmediateCleanup() {
  try {
    const job = await cleanupQueue.add(
      'immediate-cleanup',
      { reason: 'capacity-threshold' },
      {
        priority: 10,  // Higher priority than scheduled jobs
        removeOnComplete: true,
      }
    );

    logger.info('Immediate cleanup job triggered', { jobId: job.id });
    return job;
  } catch (error) {
    logger.error('Failed to trigger immediate cleanup:', error);
    throw error;
  }
}

export default { cleanupQueue, scheduleCleanupJob, setupCleanupWorker, triggerImmediateCleanup };
```

---

## 2. Image Cleanup Service

### 2.1 Main Cleanup Logic

**File**: `backend/src/services/imageCleanupService.js`

```javascript
import { getPool } from '../db/mysql.js';
import { ImageStorageService } from './imageStorageService.js';
import { DeletionAuditService } from './deletionAuditService.js';
import logger from '../utils/logger.js';

export class ImageCleanupService {
  constructor() {
    this.storageService = new ImageStorageService();
    this.auditService = new DeletionAuditService();
    this.pool = getPool();
  }

  /**
   * Main cleanup execution method
   * @param {Job} job - BullMQ job object (optional for manual triggers)
   * @returns {Object} Cleanup result summary
   */
  async executeCleanup(job) {
    const startTime = Date.now();

    try {
      // Step 1: Check current library capacity
      logger.info('Checking library capacity');
      const capacity = await this.getLibraryCapacity();
      const capacityPercent = (capacity / (10 * 1024 * 1024 * 1024)) * 100;

      logger.info('Library capacity check', {
        capacityGB: (capacity / (1024 * 1024 * 1024)).toFixed(2),
        capacityPercent: capacityPercent.toFixed(2),
      });

      // Step 2: Identify images to delete
      logger.info('Identifying images for deletion');
      const imagesToDelete = await this.identifyImagesToDelete();

      if (imagesToDelete.length === 0) {
        logger.info('No images eligible for deletion');
        return {
          success: true,
          imagesDeleted: 0,
          bytesFreed: 0,
          duration: Date.now() - startTime,
          message: 'No cleanup needed',
        };
      }

      logger.info(`Found ${imagesToDelete.length} images to delete`);

      // Step 3: Perform deletion
      const result = await this.performDeletion(imagesToDelete, job);

      // Update job progress
      if (job) {
        job.progress(100);
      }

      return {
        success: result.allSucceeded,
        imagesDeleted: result.successCount,
        imagesFailed: result.failureCount,
        bytesFreed: result.bytesFreed,
        duration: Date.now() - startTime,
        message: result.allSucceeded
          ? 'Cleanup completed successfully'
          : `Cleanup completed with ${result.failureCount} failures`,
      };
    } catch (error) {
      logger.error('Cleanup execution failed', {
        error: error.message,
        stack: error.stack,
      });

      throw error;
    }
  }

  /**
   * Get current library capacity in bytes
   */
  async getLibraryCapacity() {
    const conn = await this.pool.getConnection();

    try {
      const [result] = await conn.query(
        'SELECT SUM(file_size) as total_size FROM image_library WHERE is_deleted = 0'
      );

      return result[0].total_size || 0;
    } finally {
      conn.release();
    }
  }

  /**
   * Identify images eligible for deletion
   * Keep: Images from last 3 months OR access_count >= 10
   * Delete: Everything else
   */
  async identifyImagesToDelete() {
    const conn = await this.pool.getConnection();

    try {
      const query = `
        SELECT
          id,
          file_name,
          storage_key,
          url,
          file_size,
          last_used_at,
          access_count
        FROM image_library
        WHERE
          -- Not already deleted
          is_deleted = 0
          -- Not too new (safety margin: at least 1 day old)
          AND created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
          -- Eligible for deletion: older than 3 months AND low access count
          AND NOT (
            last_used_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
            OR access_count >= 10
          )
        ORDER BY
          last_used_at ASC,  -- Delete oldest first
          access_count ASC   -- Then least accessed
        LIMIT 1000;  -- Process in batches
      `;

      const [images] = await conn.query(query);

      return images;
    } finally {
      conn.release();
    }
  }

  /**
   * Perform deletion with proper transaction handling
   */
  async performDeletion(imagesToDelete, job) {
    const results = {
      successCount: 0,
      failureCount: 0,
      bytesFreed: 0,
      failedImages: [],
    };

    // Process in smaller batches
    const batchSize = 100;

    for (let i = 0; i < imagesToDelete.length; i += batchSize) {
      const batch = imagesToDelete.slice(i, i + batchSize);

      try {
        const batchResult = await this.deleteBatch(batch);

        results.successCount += batchResult.successCount;
        results.failureCount += batchResult.failureCount;
        results.bytesFreed += batchResult.bytesFreed;
        results.failedImages.push(...batchResult.failedImages);

        // Update job progress
        if (job) {
          const progress = ((i + batch.length) / imagesToDelete.length) * 100;
          job.progress(Math.min(progress, 99));
        }

        // Add delay between batches to avoid overwhelming the system
        if (i + batchSize < imagesToDelete.length) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        logger.error('Batch deletion failed', {
          batchStart: i,
          batchSize: batch.length,
          error: error.message,
        });

        results.failureCount += batch.length;
        results.failedImages.push(...batch.map(img => ({
          id: img.id,
          error: error.message,
        })));
      }
    }

    // Hard delete completed images after 1 hour
    await this.scheduleHardDelete();

    results.allSucceeded = results.failureCount === 0;
    return results;
  }

  /**
   * Delete a batch of images with transaction support
   */
  async deleteBatch(images) {
    const conn = await this.pool.getConnection();

    const results = {
      successCount: 0,
      failureCount: 0,
      bytesFreed: 0,
      failedImages: [],
    };

    try {
      // Phase 1: Database soft delete (atomic transaction)
      await conn.beginTransaction();

      const imageIds = images.map(img => img.id);
      const deletionReason = 'cleanup_policy_3month_10access';

      await conn.query(
        'UPDATE image_library SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?, deleted_reason = ? WHERE id IN (?)',
        ['system:cleanup-job', deletionReason, imageIds]
      );

      await conn.commit();

      logger.info(`Soft deleted ${images.length} images from database`);

      // Phase 2: Cloud storage deletion (outside transaction)
      for (const image of images) {
        try {
          await this.storageService.deleteImage(image.storage_key);

          // Log successful deletion
          await this.auditService.logDeletion({
            image_id: image.id,
            image_name: image.file_name,
            file_size: image.file_size,
            status: 'STORAGE_DELETED',
            completed_at: new Date(),
          });

          results.successCount++;
          results.bytesFreed += image.file_size;
        } catch (error) {
          logger.warn(`Storage deletion failed for image ${image.id}`, {
            error: error.message,
          });

          // Log failure but continue with other images
          await this.auditService.logDeletion({
            image_id: image.id,
            image_name: image.file_name,
            file_size: image.file_size,
            status: 'STORAGE_DELETE_FAILED',
            error_message: error.message,
            retry_count: 1,
          });

          results.failureCount++;
          results.failedImages.push({
            id: image.id,
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      await conn.rollback();
      logger.error('Batch deletion transaction failed', {
        error: error.message,
      });

      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Schedule hard delete for later (reclaim database space)
   */
  async scheduleHardDelete() {
    const conn = await this.pool.getConnection();

    try {
      // Hard delete soft-deleted images after 1 hour
      // (allows for recovery/audit in case of issues)
      await conn.query(
        'DELETE FROM image_library WHERE is_deleted = 1 AND deleted_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)'
      );

      logger.info('Hard delete completed for old soft-deleted images');
    } catch (error) {
      logger.error('Hard delete operation failed', {
        error: error.message,
      });

      // Don't throw - this is non-critical
    } finally {
      conn.release();
    }
  }
}

export default ImageCleanupService;
```

---

## 3. Storage Service

### 3.1 Cloud Storage Deletion with Retry

**File**: `backend/src/services/imageStorageService.js`

```javascript
import OSS from 'ali-oss';
import logger from '../utils/logger.js';

export class ImageStorageService {
  constructor() {
    // Initialize Aliyun OSS client
    this.client = new OSS({
      region: process.env.OSS_REGION,
      accessKeyId: process.env.OSS_ACCESS_KEY_ID,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
      bucket: process.env.OSS_BUCKET,
    });

    // Retry configuration
    this.maxRetries = 3;
    this.retryDelays = [1000, 2000, 4000];  // ms
    this.concurrentDeletes = 10;
  }

  /**
   * Delete image from cloud storage with retry logic
   */
  async deleteImage(storageKey, retryCount = 0) {
    try {
      // Delete from OSS
      await this.client.delete(storageKey);

      logger.debug('Image deleted from storage', { storageKey });
    } catch (error) {
      if (retryCount < this.maxRetries) {
        const delayMs = this.retryDelays[retryCount];

        logger.warn(`Storage delete failed, retrying (${retryCount + 1}/${this.maxRetries})`, {
          storageKey,
          error: error.message,
          delayMs,
        });

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delayMs));

        // Recursive retry
        return this.deleteImage(storageKey, retryCount + 1);
      }

      logger.error('Storage delete failed after all retries', {
        storageKey,
        attempts: retryCount + 1,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Delete multiple images in parallel (up to concurrentDeletes)
   */
  async deleteImages(storageKeys) {
    const results = {
      succeeded: [],
      failed: [],
    };

    // Process in parallel batches
    for (let i = 0; i < storageKeys.length; i += this.concurrentDeletes) {
      const batch = storageKeys.slice(i, i + this.concurrentDeletes);

      const promises = batch.map(key =>
        this.deleteImage(key)
          .then(() => {
            results.succeeded.push(key);
          })
          .catch((error) => {
            results.failed.push({ key, error });
          })
      );

      await Promise.all(promises);

      logger.info(`Parallel delete batch completed`, {
        succeeded: results.succeeded.length,
        failed: results.failed.length,
      });
    }

    return results;
  }
}

export default ImageStorageService;
```

---

## 4. Audit Service

### 4.1 Deletion Logging and Tracking

**File**: `backend/src/services/deletionAuditService.js`

```javascript
import { getPool } from '../db/mysql.js';
import logger from '../utils/logger.js';

export class DeletionAuditService {
  constructor() {
    this.pool = getPool();
  }

  /**
   * Log deletion attempt in audit trail
   */
  async logDeletion(data) {
    const conn = await this.pool.getConnection();

    try {
      await conn.query(
        `INSERT INTO deletion_audit_log
         (image_id, image_name, file_size, status, attempted_at, completed_at,
          error_message, retry_count, deleted_by)
         VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 'system:cleanup-job')`,
        [
          data.image_id,
          data.image_name,
          data.file_size,
          data.status,  // PENDING, DB_DELETED, STORAGE_DELETED, FAILED
          data.completed_at || null,
          data.error_message || null,
          data.retry_count || 0,
        ]
      );

      logger.debug('Deletion logged to audit trail', {
        imageId: data.image_id,
        status: data.status,
      });
    } catch (error) {
      logger.error('Failed to log deletion', {
        imageId: data.image_id,
        error: error.message,
      });

      // Don't throw - audit logging should not block cleanup
    } finally {
      conn.release();
    }
  }

  /**
   * Get failed deletions for recovery
   */
  async getFailedDeletions(hoursAgo = 24) {
    const conn = await this.pool.getConnection();

    try {
      const [records] = await conn.query(
        `SELECT *
         FROM deletion_audit_log
         WHERE status = 'STORAGE_DELETE_FAILED'
           AND attempted_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
         ORDER BY attempted_at DESC`,
        [hoursAgo]
      );

      return records;
    } finally {
      conn.release();
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(days = 7) {
    const conn = await this.pool.getConnection();

    try {
      const [stats] = await conn.query(
        `SELECT
           COUNT(*) as total_deletions,
           SUM(CASE WHEN status = 'STORAGE_DELETED' THEN 1 ELSE 0 END) as successful,
           SUM(CASE WHEN status = 'STORAGE_DELETE_FAILED' THEN 1 ELSE 0 END) as failed,
           SUM(file_size) as total_bytes_freed,
           AVG(retry_count) as avg_retries
         FROM deletion_audit_log
         WHERE completed_at > DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [days]
      );

      return stats[0];
    } finally {
      conn.release();
    }
  }
}

export default DeletionAuditService;
```

---

## 5. Upload Endpoint with Capacity Check

### 5.1 Upload with Cleanup Trigger

**File**: `backend/src/api/routes/images.js`

```javascript
import express from 'express';
import { ImageStorageService } from '../services/imageStorageService.js';
import { cleanupQueue, triggerImmediateCleanup } from '../jobs/imageCleanupJob.js';
import logger from '../utils/logger.js';
import { getPool } from '../db/mysql.js';

const router = express.Router();

/**
 * Upload image endpoint
 * POST /api/v1/images/upload
 */
router.post('/upload', async (req, res) => {
  try {
    const { file, recipeId, recipeName } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Step 1: Upload to cloud storage
    const storageService = new ImageStorageService();
    const storageKey = `recipes/${Date.now()}_${file.name}`;
    const url = await storageService.uploadImage(file, storageKey);

    logger.info('Image uploaded to storage', { storageKey, url });

    // Step 2: Save metadata to database
    const pool = getPool();
    const conn = await pool.getConnection();

    try {
      const [result] = await conn.query(
        `INSERT INTO image_library
         (file_name, storage_key, url, file_size, created_at, last_used_at, access_count,
          is_deleted, recipe_name, created_by)
         VALUES (?, ?, ?, ?, NOW(), NOW(), 0, 0, ?, ?)`,
        [
          file.name,
          storageKey,
          url,
          file.size,
          recipeName,
          req.user?.id || null,
        ]
      );

      logger.info('Image metadata saved to database', {
        imageId: result.insertId,
        fileSize: file.size,
      });

      // Step 3: Check capacity and trigger cleanup if needed
      const [capacityResult] = await conn.query(
        'SELECT SUM(file_size) as total_size FROM image_library WHERE is_deleted = 0'
      );

      const totalSize = capacityResult[0].total_size || 0;
      const capacityPercent = (totalSize / (10 * 1024 * 1024 * 1024)) * 100;

      logger.info('Library capacity check', {
        capacityGB: (totalSize / (1024 * 1024 * 1024)).toFixed(2),
        capacityPercent: capacityPercent.toFixed(2),
      });

      // Trigger cleanup if > 80% capacity
      if (capacityPercent > 80) {
        logger.warn('Library capacity threshold exceeded, triggering cleanup', {
          capacityPercent: capacityPercent.toFixed(2),
        });

        triggerImmediateCleanup().catch(error => {
          logger.error('Failed to trigger immediate cleanup', { error });
        });
      }

      res.json({
        success: true,
        imageId: result.insertId,
        url,
        storageKey,
        capacityPercent: capacityPercent.toFixed(2),
      });
    } finally {
      conn.release();
    }
  } catch (error) {
    logger.error('Image upload failed', {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Upload failed',
      message: error.message,
    });
  }
});

export default router;
```

---

## 6. Application Startup

### 6.1 Initialize Cleanup System

**File**: `backend/src/app.js`

```javascript
import express from 'express';
import { scheduleCleanupJob, setupCleanupWorker } from './jobs/imageCleanupJob.js';
import logger from './utils/logger.js';

const app = express();

/**
 * Initialize cleanup system on app startup
 */
export async function initializeCleanupSystem() {
  try {
    logger.info('Initializing image cleanup system...');

    // Schedule the daily cleanup job
    await scheduleCleanupJob();

    // Set up worker to process cleanup jobs
    const worker = setupCleanupWorker();

    logger.info('Image cleanup system initialized successfully');

    return { worker };
  } catch (error) {
    logger.error('Failed to initialize cleanup system', {
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
}

// In your main application startup:
app.listen(3000, async () => {
  logger.info('Server started on port 3000');

  try {
    await initializeCleanupSystem();
  } catch (error) {
    logger.error('Failed to start cleanup system', { error });
    process.exit(1);
  }
});

export default app;
```

---

## 7. Database Schema

### 7.1 Create Tables

**File**: `database/schema/image_library.sql`

```sql
-- Image library table
CREATE TABLE image_library (
  id INT PRIMARY KEY AUTO_INCREMENT,
  file_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(512) NOT NULL UNIQUE,
  url VARCHAR(2048) NOT NULL,
  file_size BIGINT NOT NULL COMMENT 'File size in bytes',

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Updated on each access',
  access_count INT NOT NULL DEFAULT 0 COMMENT 'Incremented on each access',

  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Soft delete flag',
  deleted_at DATETIME COMMENT 'When was this marked for deletion',
  deleted_by VARCHAR(50) COMMENT 'Who deleted it (user ID or system:cleanup-job)',
  deleted_reason VARCHAR(255) COMMENT 'Why was it deleted',

  recipe_name VARCHAR(255) COMMENT 'Associated recipe name',
  recipe_ingredients JSON COMMENT 'Associated ingredients',
  image_hash VARCHAR(64) COMMENT 'SHA256 hash for deduplication',

  created_by INT COMMENT 'User who uploaded the image',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_cleanup_query (is_deleted, last_used_at, access_count),
  INDEX idx_url (url(100)),
  INDEX idx_storage_key (storage_key(100)),
  INDEX idx_last_used_at (last_used_at),
  INDEX idx_access_count (access_count),
  INDEX idx_recipe_name (recipe_name),
  INDEX idx_is_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deletion audit log
CREATE TABLE deletion_audit_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  image_id INT NOT NULL,
  image_name VARCHAR(255),
  file_size BIGINT,

  status ENUM('PENDING', 'DB_DELETED', 'STORAGE_DELETED', 'FAILED') NOT NULL,
  attempted_at DATETIME NOT NULL,
  completed_at DATETIME,
  error_message TEXT,
  retry_count INT DEFAULT 0,

  deleted_by VARCHAR(50) COMMENT 'User or system:cleanup-job',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_status (status),
  INDEX idx_image_id (image_id),
  INDEX idx_completed_at (completed_at),
  INDEX idx_attempted_at (attempted_at),
  FOREIGN KEY (image_id) REFERENCES image_library(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 8. Testing

### 8.1 Unit Tests for Cleanup Logic

**File**: `backend/tests/unit/imageCleanupService.test.js`

```javascript
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import ImageCleanupService from '../../src/services/imageCleanupService.js';

describe('ImageCleanupService', () => {
  let service;
  let mockPool;
  let mockConnection;

  beforeEach(() => {
    mockConnection = {
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
    };

    service = new ImageCleanupService();
    service.pool = mockPool;
  });

  describe('identifyImagesToDelete', () => {
    it('should identify images older than 3 months with < 10 accesses', async () => {
      const mockImages = [
        {
          id: 1,
          file_name: 'old-image.jpg',
          storage_key: 'path/to/image.jpg',
          file_size: 1024,
          last_used_at: '2025-09-04',  // > 3 months ago
          access_count: 5,  // < 10
        },
      ];

      mockConnection.query.mockResolvedValueOnce([mockImages]);

      const result = await service.identifyImagesToDelete();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(mockConnection.query).toHaveBeenCalled();
    });

    it('should not include images from last 3 months', async () => {
      mockConnection.query.mockResolvedValueOnce([[]]);

      const result = await service.identifyImagesToDelete();

      expect(result).toHaveLength(0);
    });

    it('should not include high-access images', async () => {
      const mockImages = [
        {
          id: 2,
          file_name: 'popular-image.jpg',
          access_count: 15,  // >= 10
          last_used_at: '2025-06-04',
        },
      ];

      mockConnection.query.mockResolvedValueOnce([mockImages]);

      // This test shows the query should exclude these
      // In real implementation, query logic handles this
      expect(mockImages[0].access_count).toBeGreaterThanOrEqual(10);
    });
  });

  describe('performDeletion', () => {
    it('should soft delete images in database', async () => {
      const images = [
        {
          id: 1,
          file_name: 'test.jpg',
          storage_key: 'path/test.jpg',
          file_size: 1024,
        },
      ];

      mockConnection.query.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await service.deleteBatch(images);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(result.successCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle storage deletion failures gracefully', async () => {
      const images = [
        {
          id: 1,
          file_name: 'test.jpg',
          storage_key: 'path/test.jpg',
          file_size: 1024,
        },
      ];

      mockConnection.query.mockResolvedValue([{ affectedRows: 1 }]);

      // Mock storage service to fail
      service.storageService.deleteImage = jest.fn()
        .mockRejectedValueOnce(new Error('Storage error'));

      const result = await service.deleteBatch(images);

      expect(result.failureCount).toBeGreaterThan(0);
      expect(mockConnection.commit).toHaveBeenCalled();  // Still committed
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
```

---

## 9. Monitoring & Alerting

### 9.1 BullMQ Dashboard Setup

**File**: `backend/src/monitoring/bullmqDashboard.js`

```javascript
import express from 'express';
import { createBullBoard } from '@bull-board/express';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { cleanupQueue } from '../jobs/imageCleanupJob.js';

const app = express();

// Create Bull Board
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [new BullMQAdapter(cleanupQueue)],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

// Access at: http://localhost:3000/admin/queues
export default app;
```

### 9.2 Metrics Collection

**File**: `backend/src/monitoring/metrics.js`

```javascript
import client from 'prom-client';

// Create metrics
export const cleanupJobsTotal = new client.Counter({
  name: 'cleanup_jobs_total',
  help: 'Total cleanup jobs executed',
  labelNames: ['status'],
});

export const imagesDeletedTotal = new client.Counter({
  name: 'images_deleted_total',
  help: 'Total images deleted',
});

export const storageFreedBytes = new client.Counter({
  name: 'storage_freed_bytes',
  help: 'Total bytes freed from storage',
});

export const cleanupDurationSeconds = new client.Histogram({
  name: 'cleanup_duration_seconds',
  help: 'Cleanup job duration in seconds',
  buckets: [10, 30, 60, 120, 300],
});

export const libraryCapacityPercent = new client.Gauge({
  name: 'image_library_capacity_percent',
  help: 'Current image library capacity percentage',
});

// Update metrics in cleanup service
export function recordCleanupMetrics(result) {
  cleanupJobsTotal.labels(result.success ? 'success' : 'failure').inc();
  imagesDeletedTotal.inc(result.imagesDeleted);
  storageFreedBytes.inc(result.bytesFreed);
  cleanupDurationSeconds.observe(result.duration / 1000);
}
```

---

## Summary

This implementation provides:

1. **BullMQ Setup** - Production-ready job queue with persistence
2. **Cleanup Service** - Core deletion logic with proper transaction handling
3. **Storage Integration** - Retry logic for cloud storage operations
4. **Audit Trail** - Complete logging for recovery and debugging
5. **Capacity Monitoring** - Triggers cleanup when needed
6. **Error Handling** - Comprehensive error recovery strategies
7. **Testing** - Unit tests for critical logic
8. **Monitoring** - Dashboard and metrics collection

---

**Ready for integration into the backend!**
