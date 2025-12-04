# Research Report: 图片清理策略实现

**Research Date**: 2025-12-04
**Scope**: Image library cleanup mechanism for 10GB capacity limit
**Status**: Complete

---

## Executive Summary

For an image library with 10GB capacity limit and cleanup rules (keep images used in last 3 months OR access count >= 10), this research recommends:

1. **Task Scheduler**: BullMQ (Redis-based queue) for production reliability with job persistence and automatic retries
2. **Cleanup Trigger**: Hybrid approach - scheduled daily scan + capacity threshold check after image uploads
3. **Deletion Order**: Database deletion first (mark as deleted), then cloud storage deletion (with rollback capability)
4. **Error Handling**: Comprehensive logging, soft-delete flag, and transaction rollback on failures

---

## 1. Scheduled Task Technology

### 1.1 Candidates Evaluated

| Library | Best For | Reliability | Scalability | Persistence | Retries |
|---------|----------|-------------|-------------|-------------|---------|
| **Node-Cron** | Simple in-process tasks | Low | Poor | No | No |
| **Node-Schedule** | Basic cron-like scheduling | Low | Poor | No | No |
| **Agenda** | MongoDB-backed scheduling | Medium | Medium | Yes (MongoDB) | Yes |
| **BullMQ** | Distributed job queues | High | High | Yes (Redis) | Yes |
| **Bull** | Legacy queue system | High | High | Yes (Redis) | Yes |

### 1.2 Decision: BullMQ

**Recommended Choice**: BullMQ (latest version of Bull library)

#### Why BullMQ is Best for Image Cleanup:

1. **Production Reliability**
   - Jobs persist in Redis, survive application restarts
   - No loss of cleanup tasks even if server crashes
   - Essential for critical cleanup operations affecting 10GB storage

2. **Automatic Retries**
   - Built-in retry mechanism with exponential backoff
   - Handles transient failures (network issues, storage timeouts)
   - Critical when deleting from both database and cloud storage

3. **Job Monitoring**
   - Dashboard to track cleanup job progress
   - Insight into success rates and failure patterns
   - Better visibility than in-process schedulers

4. **Horizontal Scaling**
   - Multiple worker processes can process cleanup jobs
   - Handles concurrent deletions efficiently
   - Suitable for scaling as image library grows

5. **Queue Management**
   - Support for delayed jobs, prioritization, and rate limiting
   - Can batch cleanup operations
   - Prevents resource exhaustion during cleanup

#### Why NOT Other Options:

- **Node-Cron**: No persistence = risk of losing cleanup tasks on restart
- **Node-Schedule**: Similar limitations as Node-Cron
- **Agenda**: Requires MongoDB dependency (added complexity); less suitable for job queues
- **Bull (Legacy)**: BullMQ is the recommended successor with better performance

### 1.3 Implementation Context

For image cleanup specifically:
- Single cleanup job runs daily (or triggered by threshold)
- Job needs to survive application restarts
- Failures must be logged and retried
- BullMQ provides all these guarantees

---

## 2. Cleanup Trigger Mechanism

### 2.1 Options Compared

| Approach | Trigger | Check Frequency | Efficiency | Reliability |
|----------|---------|-----------------|-----------|-------------|
| **Option A: Scheduled Only** | Fixed time daily | Once per day | Low (may trigger unnecessarily) | Medium |
| **Option B: Threshold Only** | Capacity > 80% | After each upload | High (cleanup when needed) | Medium (reactive) |
| **Option C: Hybrid (Recommended)** | Both scheduled + threshold | Daily + real-time | Very High | High |

### 2.2 Decision: Hybrid Approach (C)

**Recommended**: Daily scheduled scan + capacity threshold check

#### Rationale:

1. **Scheduled Daily Scan (Primary)**
   - Runs at off-peak hours (e.g., 2 AM) to avoid impacting users
   - Identifies images eligible for deletion based on `last_used_at` and `access_count`
   - Ensures regular housekeeping even if capacity stays below threshold
   - Predictable and easy to monitor

2. **Capacity Threshold Check (Secondary)**
   - After every image upload, check if library usage > 80% of 10GB (8GB)
   - If exceeded, trigger immediate cleanup
   - Prevents storage capacity from being exhausted
   - Provides safety mechanism for traffic spikes

#### Implementation Structure:

```
┌─────────────────────────────────────┐
│ Image Upload Endpoint               │
└────────┬────────────────────────────┘
         │
         ├─ Upload image
         ├─ Save to cloud storage
         ├─ Update database
         │
         └─ Check: current_size > 8GB?
            ├─ YES: Trigger cleanup job immediately
            └─ NO: Continue normally

┌─────────────────────────────────────┐
│ BullMQ Scheduled Job (Daily 2 AM)   │
└────────┬────────────────────────────┘
         │
         ├─ Query: images to delete
         ├─ Execute: database deletion
         ├─ Execute: storage deletion
         └─ Log: cleanup results
```

#### Advantages:

- **Efficiency**: Regular cleanup prevents accumulation of orphaned images
- **Real-time Safety**: Threshold trigger prevents runaway storage consumption
- **Cost Control**: Regular deletion reduces long-term storage costs
- **Reliability**: Scheduled jobs provide consistent cleanup even without manual intervention

---

## 3. Cleanup Rules Implementation

### 3.1 SQL Query for Identifying Images to Delete

**Business Rule**: Keep images where:
- `last_used_at >= NOW() - INTERVAL 3 MONTH` (used in last 3 months) **OR**
- `access_count >= 10` (high-frequency images)

**SQL Query - Images to DELETE**:

```sql
SELECT id, url, file_size, storage_key
FROM image_library
WHERE
  -- Images NOT matching keep criteria
  NOT (
    last_used_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
    OR access_count >= 10
  )
  -- Additional safety checks
  AND is_deleted = 0  -- Not already soft-deleted
  AND created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)  -- At least 1 day old
ORDER BY last_used_at ASC, access_count ASC
LIMIT 1000;  -- Batch 1000 images at a time to avoid resource exhaustion
```

**Index Requirements** for optimal query performance:

```sql
-- Composite index for cleanup query
CREATE INDEX idx_cleanup_query ON image_library(
  is_deleted,
  last_used_at,
  access_count
);

-- Separate indexes for sorting
CREATE INDEX idx_last_used_at ON image_library(last_used_at);
CREATE INDEX idx_access_count ON image_library(access_count);
```

### 3.2 Data Model Considerations

**Recommended image_library table structure**:

```sql
CREATE TABLE image_library (
  id INT PRIMARY KEY AUTO_INCREMENT,

  -- Image metadata
  file_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(512) NOT NULL,  -- Path in cloud storage
  url VARCHAR(2048) NOT NULL,          -- Permanent URL
  file_size BIGINT NOT NULL,           -- Bytes
  image_hash VARCHAR(64),              -- SHA256 for deduplication

  -- Cleanup tracking
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL,
  access_count INT NOT NULL DEFAULT 0,

  -- Soft delete flag
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME,
  deleted_reason VARCHAR(255),        -- Why it was deleted

  -- Audit trail
  created_by INT,                     -- User or system process
  deleted_by INT,                     -- User or cleanup job

  -- Related data
  recipe_name VARCHAR(255),
  recipe_ingredients JSON,

  INDEX idx_cleanup_query (is_deleted, last_used_at, access_count),
  INDEX idx_url (url),
  INDEX idx_storage_key (storage_key),
  INDEX idx_last_used_at (last_used_at),
  INDEX idx_access_count (access_count)
);
```

---

## 4. Deletion Order & Transaction Strategy

### 4.1 Decision: Database First (Soft Delete) → Storage Second (Hard Delete)

**Recommended Sequence**:

1. **Phase 1: Database Soft Delete** (Transactional)
   ```sql
   BEGIN TRANSACTION;
   UPDATE image_library
   SET is_deleted = 1, deleted_at = NOW(), deleted_by = <SYSTEM_ID>
   WHERE id IN (?, ?, ...)
   COMMIT;
   ```
   - Mark records as deleted with timestamp
   - Keeps records retrievable if deletion fails later
   - Minimizes blocking (soft delete is fast)

2. **Phase 2: Cloud Storage Deletion** (With Retry)
   - Delete images from Aliyun OSS (or self-hosted CDN)
   - Implement retry logic (exponential backoff)
   - If fails: log error but don't rollback database changes

3. **Phase 3: Database Hard Delete** (Cleanup)
   - After storage deletion confirmed successful
   - Can be delayed or scheduled separately
   - Reclaims database disk space

#### Rationale for Database-First Approach:

| Aspect | Database First | Storage First |
|--------|---|---|
| **Atomicity** | Database transaction guaranteed | No atomic guarantee |
| **Recovery** | Soft delete preserves data temporarily | Loss if storage delete fails |
| **Audit Trail** | Complete deletion timestamp/reason | Limited audit info |
| **Rollback** | Can restore from soft-delete | Difficult/impossible restore |
| **Performance** | Soft delete fast (no I/O) | Network I/O required |

### 4.2 Error Handling & Rollback Strategy

**Scenario 1: Database Deletion Fails**
- Exception caught, log error
- BullMQ retry mechanism triggers after 1 second
- Maximum 3 retries with exponential backoff
- Alert admin if all retries fail

**Scenario 2: Storage Deletion Fails**
- Database already soft-deleted (acceptable)
- Log specific storage error with image ID
- Retry storage deletion separately
- Image marked `is_deleted=1` prevents re-use

**Scenario 3: Partial Failure (Some Images Deleted, Some Failed)**
- Transactional database delete prevents partial states
- Storage failures logged individually
- Failed images can be retried in next cleanup job
- No data loss occurs

**Transaction Wrapper Code Structure**:

```javascript
async function cleanupImagesForDeletion() {
  const conn = await pool.getConnection();

  try {
    // Start transaction
    await conn.beginTransaction();

    // 1. Identify images to delete
    const imagesToDelete = await conn.query(
      'SELECT id, url, storage_key FROM image_library WHERE ...'
    );

    // 2. Soft delete in database (atomic)
    await conn.query(
      'UPDATE image_library SET is_deleted=1, deleted_at=NOW() WHERE id IN (...)'
    );

    await conn.commit();

    // 3. Delete from storage (outside transaction)
    const storageErrors = [];
    for (const image of imagesToDelete) {
      try {
        await deleteFromCloudStorage(image.storage_key);
        // Log success
        await logDeletion(image.id, 'SUCCESS');
      } catch (error) {
        // Log failure but continue with other deletions
        storageErrors.push({ imageId: image.id, error });
        await logDeletion(image.id, 'STORAGE_DELETE_FAILED', error.message);
      }
    }

    // 4. Hard delete (only after all storage operations complete)
    if (storageErrors.length === 0) {
      await conn.query(
        'DELETE FROM image_library WHERE is_deleted=1 AND deleted_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)'
      );
    }

    return {
      success: storageErrors.length === 0,
      deleted: imagesToDelete.length,
      failed: storageErrors.length
    };

  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.release();
  }
}
```

---

## 5. Implementation Architecture

### 5.1 Required Technologies

```json
{
  "scheduler": "bullmq@^5.0.0",
  "database": "mysql2/promise",
  "storage": "aliyun-sdk-oss",
  "logging": "winston",
  "testing": "jest",
  "monitoring": "@bullmq/ui"
}
```

### 5.2 Cleanup Service Architecture

**File Structure**:

```
backend/src/
├── jobs/
│   └── imageCleanupJob.js          // BullMQ job definition
├── services/
│   ├── imageCleanupService.js      // Business logic
│   ├── imageStorageService.js      // Cloud storage operations
│   └── deletionAuditService.js     // Logging and recovery
└── config/
    └── cleanup.config.js           // Cleanup configuration
```

### 5.3 Key Components

**1. BullMQ Job Setup**:

```javascript
// jobs/imageCleanupJob.js
import Queue from 'bullmq';
import { imageCleanupService } from '../services';

const cleanupQueue = new Queue('imageCleanup', {
  connection: redisConnection,
});

// Schedule daily at 2 AM
cleanupQueue.add(
  'dailyCleanup',
  {},
  {
    repeat: { cron: '0 2 * * *' },
    removeOnComplete: true,
    removeOnFail: false,
  }
);

// Handle cleanup job
cleanupQueue.process(async (job) => {
  return await imageCleanupService.executeCleanup(job);
});
```

**2. Cleanup Service**:

```javascript
// services/imageCleanupService.js
class ImageCleanupService {
  async executeCleanup(job) {
    const capacity = await this.getLibraryCapacity();

    if (capacity > 8 * 1024 * 1024 * 1024) { // 8GB threshold
      const imagesToDelete = await this.identifyImages();
      return await this.performDeletion(imagesToDelete);
    }
  }

  async identifyImages() {
    // SQL query from section 3.1
  }

  async performDeletion(images) {
    // Transaction logic from section 4.2
  }
}
```

---

## 6. Error Handling & Logging Strategy

### 6.1 Comprehensive Logging

**Log Levels**:

```javascript
logger.info('Starting image cleanup', { timestamp, librarySize });
logger.debug('Identified 150 images for deletion', { imageIds });
logger.warn('Storage deletion failed for 5 images, will retry', { failedIds });
logger.error('Cleanup job failed after 3 retries', { error, stack });
```

**Audit Trail Table**:

```sql
CREATE TABLE deletion_audit_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  image_id INT NOT NULL,
  image_name VARCHAR(255),
  file_size BIGINT,

  status ENUM('PENDING', 'DB_DELETED', 'STORAGE_DELETED', 'FAILED'),
  deletion_reason VARCHAR(255),

  attempted_at DATETIME,
  completed_at DATETIME,
  error_message TEXT,
  retry_count INT DEFAULT 0,

  deleted_by VARCHAR(50),  -- 'system:cleanup-job' or user ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_status (status),
  INDEX idx_image_id (image_id),
  INDEX idx_completed_at (completed_at)
);
```

### 6.2 Failure Recovery

**Automatic Recovery**:
- BullMQ retries failed jobs up to 3 times
- Exponential backoff: 1s, 2s, 4s delays
- Dead letter queue for permanently failed jobs
- Daily alert if cleanup failures exceed threshold

**Manual Recovery**:
- Query `deletion_audit_log` for failed deletions
- Re-trigger cleanup for specific images
- Admin dashboard to monitor failed deletions

---

## 7. Performance Considerations

### 7.1 Batch Processing

```javascript
// Process images in batches to avoid memory exhaustion
async function deleteInBatches(imagesToDelete, batchSize = 100) {
  for (let i = 0; i < imagesToDelete.length; i += batchSize) {
    const batch = imagesToDelete.slice(i, i + batchSize);
    await processBatch(batch);
    // Add delay between batches
    await sleep(5000);
  }
}
```

### 7.2 Resource Constraints

| Metric | Limit | Reason |
|--------|-------|--------|
| Batch Size | 100 images/batch | Prevent database transaction locks |
| Concurrent Storage Deletes | 10 | Prevent rate limiting from cloud provider |
| Retry Attempts | 3 | Balance between reliability and resource usage |
| Cleanup Window | 30 minutes max | Avoid excessive runtime |
| Frequency | Once daily + threshold trigger | Prevent excessive job execution |

### 7.3 Query Optimization

```sql
-- Poor: Full table scan
SELECT * FROM image_library WHERE last_used_at < '2025-09-04';

-- Good: Uses indexes
SELECT id, url, storage_key
FROM image_library
WHERE is_deleted = 0
  AND (last_used_at < DATE_SUB(NOW(), INTERVAL 3 MONTH)
       AND access_count < 10)
ORDER BY last_used_at ASC
LIMIT 1000;
```

---

## 8. Alternative Approaches Considered

### 8.1 Node-Cron (Rejected)

**Why Not Recommended**:
- No job persistence: cleanup task lost if server restarts
- No automatic retries: failed deletions must be manually handled
- No monitoring: difficult to track cleanup success rates
- Single process: cannot scale horizontally

**Use Case**: Only for non-critical tasks (e.g., temporary cache cleanup)

### 8.2 Agenda (Partially Considered)

**Why Not Recommended for This Use Case**:
- Requires MongoDB dependency (adds infrastructure)
- Designed for scheduling, not job queuing
- Less suitable for high-volume batch deletions
- BullMQ has better ecosystem and performance

**When Agenda is Better**: If already using MongoDB, Agenda is simpler to set up

### 8.3 Storage-First Deletion (Rejected)

**Why Not Recommended**:
- If storage deletion fails, database still references deleted file
- No way to recover the reference without audit log
- Creates orphaned database records
- Harder to implement rollback

### 8.4 Immediate Hard Delete (Rejected)

**Why Not Recommended**:
- No recovery if deletion fails midway
- Creates data loss risk
- Harder to implement partial failure handling

---

## 9. Comparison Matrix

| Factor | BullMQ | Node-Cron | Agenda |
|--------|--------|-----------|--------|
| Job Persistence | ✅ Redis | ❌ Memory | ✅ MongoDB |
| Automatic Retries | ✅ Yes | ❌ No | ✅ Yes |
| Horizontal Scaling | ✅ Multi-worker | ❌ Single process | ⚠️ Limited |
| Monitoring Dashboard | ✅ BullMQ UI | ❌ None | ❌ None |
| Production Ready | ✅ High | ⚠️ Medium | ✅ Medium |
| Setup Complexity | ⚠️ Requires Redis | ✅ Minimal | ⚠️ Requires MongoDB |
| Community Support | ✅ Very Active | ✅ Active | ⚠️ Moderate |
| Performance | ✅ Excellent | ✅ Good | ⚠️ Adequate |

**Winner**: BullMQ for this production use case

---

## 10. Recommendations Summary

### Quick Decision Guide

```
Question 1: Is job persistence critical?
  → YES: Use BullMQ ✅
  → NO: Consider Node-Cron (if very simple) ⚠️

Question 2: Do you need automatic retries?
  → YES: Use BullMQ ✅
  → NO: Node-Cron acceptable (if loss is acceptable)

Question 3: Need to scale horizontally?
  → YES: Use BullMQ ✅
  → NO: Agenda or Node-Cron possible

Question 4: Is monitoring important?
  → YES: Use BullMQ (with UI) ✅
  → NO: Node-Cron sufficient
```

### Implementation Checklist

- [ ] Set up Redis instance for BullMQ
- [ ] Create `image_library` table with recommended schema
- [ ] Create `deletion_audit_log` table for audit trail
- [ ] Implement BullMQ job with daily cron schedule
- [ ] Implement capacity threshold check in upload endpoint
- [ ] Add comprehensive error handling and logging
- [ ] Create database transaction wrapper for soft/hard delete
- [ ] Implement cloud storage deletion with retry logic
- [ ] Set up BullMQ monitoring dashboard
- [ ] Create admin alerts for cleanup failures
- [ ] Test failure scenarios (network timeout, partial failure)
- [ ] Document cleanup procedures for operations team

---

## 11. Sources

### Research Materials

- [Schedulers in Node: A Comparison of the Top 10 Libraries | Better Stack Community](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/)
- [Job Schedulers for Node: Bull or Agenda? | AppSignal Blog](https://blog.appsignal.com/2023/09/06/job-schedulers-for-node-bull-or-agenda.html)
- [Job Scheduling in Node.js with BullMQ | Better Stack Community](https://betterstack.com/community/guides/scaling-nodejs/bullmq-scheduled-tasks/)
- [BullMQ - Background Jobs processing and message queue for NodeJS](https://bullmq.io/)
- [Comparing the best Node.js schedulers - LogRocket Blog](https://blog.logrocket.com/comparing-best-node-js-schedulers/)
- [Best Practices for Node.js Error-handling | Toptal](https://www.toptal.com/nodejs/node-js-error-handling)
- [Node.js Error Handling Best Practices](https://sematext.com/blog/node-js-error-handling/)
- [Soft delete | Cloud Storage | Google Cloud](https://cloud.google.com/storage/docs/soft-delete)
- [Soft Delete vs Hard Delete - GeeksforGeeks](https://www.geeksforgeeks.org/dbms/difference-between-soft-delete-and-hard-delete/)
- [Deleting data: soft, hard or audit? | Marty Friedel](https://www.martyfriedel.com/blog/deleting-data-soft-hard-or-audit)
- [Transaction Recovery in Distributed System - GeeksforGeeks](https://www.geeksforgeeks.org/transaction-recovery-in-distributed-system/)
- [Principles and Practices of Transaction Recovery in Distributed Databases | Medium](https://medium.com/@wpleonardo0537/principles-and-practices-of-transaction-recovery-in-distributed-databases-9238a0cc7465)
- [Cloud Storage consistency | Google Cloud](https://cloud.google.com/storage/docs/consistency)

---

## Document Version

- **Version**: 1.0
- **Created**: 2025-12-04
- **Last Updated**: 2025-12-04
- **Author**: Claude Code Research Agent
- **Status**: Ready for Phase 1 Design Review
