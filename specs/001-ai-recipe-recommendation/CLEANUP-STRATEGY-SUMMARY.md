# Image Cleanup Strategy - Executive Summary

## Decision Matrix

| Question | Decision | Rationale |
|----------|----------|-----------|
| **1. Task Scheduler** | BullMQ | Redis-backed persistence, automatic retries, horizontal scaling, production-ready |
| **2. Cleanup Trigger** | Hybrid (Scheduled + Threshold) | Daily scheduled scan + capacity threshold check prevents storage exhaustion |
| **3. Deletion Pattern** | Database-First (Soft→Hard) | Database transaction guarantees consistency, storage deletion can be retried independently |
| **4. Error Strategy** | Comprehensive Logging + Soft Delete | Preserves audit trail, enables recovery, prevents data loss |

---

## Technical Stack

```
┌─────────────────────────────────────────────────────────┐
│ Cleanup Architecture                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Frontend Upload                                        │
│      ↓                                                  │
│  Backend Upload Endpoint                                │
│      ├─→ Save to Cloud Storage (Aliyun OSS/CDN)       │
│      ├─→ Update image_library table                    │
│      └─→ Check: Size > 8GB? → Trigger cleanup          │
│                                                         │
│  BullMQ Scheduler (Redis)                              │
│      ├─ Daily cron: 2 AM UTC                           │
│      └─ Threshold trigger: When needed                 │
│           ↓                                             │
│  ImageCleanupJob                                        │
│      ├─→ Query images to delete (SQL)                  │
│      ├─→ Database: Soft delete (transaction)           │
│      ├─→ Storage: Delete from OSS/CDN (with retry)    │
│      ├─→ Logging: Track in deletion_audit_log          │
│      └─→ Recovery: Auto-retry on failure               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Key Implementation Details

### 1. Cleanup SQL Query

```sql
-- Identify images eligible for deletion
SELECT id, url, storage_key, file_size
FROM image_library
WHERE
  NOT (
    last_used_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
    OR access_count >= 10
  )
  AND is_deleted = 0
  AND created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
ORDER BY last_used_at ASC
LIMIT 1000;
```

**Keep Rule**: Last 3 months **OR** 10+ accesses
**Delete Rule**: Older than 3 months **AND** fewer than 10 accesses

### 2. Database Schema

```sql
-- image_library table
CREATE TABLE image_library (
  id INT PRIMARY KEY,
  file_name VARCHAR(255),
  url VARCHAR(2048),
  file_size BIGINT,

  created_at DATETIME,
  last_used_at DATETIME,      -- UPDATE on every access
  access_count INT DEFAULT 0,  -- INCREMENT on every access

  is_deleted TINYINT(1) DEFAULT 0,  -- Soft delete flag
  deleted_at DATETIME,
  deleted_reason VARCHAR(255),

  recipe_name VARCHAR(255),
  recipe_ingredients JSON,

  INDEX idx_cleanup_query (is_deleted, last_used_at, access_count)
);

-- audit log for deletion tracking
CREATE TABLE deletion_audit_log (
  id INT PRIMARY KEY,
  image_id INT,
  status ENUM('PENDING','DB_DELETED','STORAGE_DELETED','FAILED'),
  attempted_at DATETIME,
  completed_at DATETIME,
  error_message TEXT,
  retry_count INT,

  INDEX idx_status (status),
  INDEX idx_image_id (image_id)
);
```

### 3. Deletion Flow

```
Phase 1: Identify Images
  ↓
Phase 2: Database Soft Delete (Transaction)
  - Mark is_deleted = 1
  - Record deleted_at, deleted_reason
  - Atomic operation (all or nothing)
  ↓
Phase 3: Cloud Storage Deletion (With Retry)
  - Delete from Aliyun OSS / CDN
  - Retry 3 times with backoff: 1s, 2s, 4s
  - Log each attempt
  ↓
Phase 4: Audit & Hard Delete
  - Record successful deletion in audit log
  - After 1 hour, hard delete from database
  - Reclaim disk space
```

### 4. Error Handling

**Scenario A: Database Soft Delete Fails**
- BullMQ automatic retry (3 attempts)
- Alert admin if all retries fail
- Image not marked as deleted (safe)

**Scenario B: Storage Deletion Fails**
- Database already soft-deleted (acceptable)
- Log specific storage error
- Retry in next cleanup job
- Image unusable but preserved in audit trail

**Scenario C: Partial Failure**
- Transactional database delete prevents inconsistency
- Storage failures logged individually
- Next cleanup job retries failed deletions
- No data loss

---

## Configuration Parameters

### Cleanup Rules

```javascript
{
  CAPACITY_LIMIT_GB: 10,
  CLEANUP_THRESHOLD_PERCENT: 80,  // Trigger at 8GB
  KEEP_MONTHS: 3,
  KEEP_MIN_ACCESS_COUNT: 10,
  BATCH_SIZE: 100,                 // Images per batch
  RETRY_ATTEMPTS: 3,
  RETRY_BACKOFF_MS: [1000, 2000, 4000],
  CONCURRENT_DELETIONS: 10         // Parallel storage deletions
}
```

### Scheduling

```javascript
{
  // Daily cleanup
  CLEANUP_SCHEDULE: '0 2 * * *',   // 2 AM UTC

  // Threshold-based (on upload)
  THRESHOLD_CHECK_ENABLED: true,
  THRESHOLD_PERCENT: 80            // Cleanup if > 8GB
}
```

---

## Why BullMQ?

| Feature | BullMQ | Node-Cron | Agenda |
|---------|--------|-----------|--------|
| **Persistence** | ✅ Jobs survive restart | ❌ Lost on crash | ✅ MongoDB |
| **Retries** | ✅ Auto retry | ❌ Manual | ✅ Auto |
| **Horizontal Scale** | ✅ Multi-worker | ❌ Single | ⚠️ Limited |
| **Monitoring** | ✅ UI Dashboard | ❌ None | ❌ None |
| **Production Grade** | ✅ High | ⚠️ Medium | ✅ Medium |

**Key Advantage**: Job persistence means cleanup tasks never get lost, even if server restarts mid-operation.

---

## Hybrid Trigger Strategy

### Option 1: Scheduled Only
- ❌ May miss urgent cleanups
- ❌ Storage could fill up between scheduled runs

### Option 2: Threshold Only
- ❌ Reactive (waits until critical)
- ❌ May cause temporary slowdowns when triggered

### Option 3: Hybrid (RECOMMENDED) ✅
- ✅ Daily maintenance prevents accumulation
- ✅ Threshold trigger provides safety net
- ✅ Balances efficiency and reliability
- ✅ Most cost-effective

**Schedule**: Daily at 2 AM (off-peak)
**Threshold**: Trigger if usage > 8GB (80% of 10GB limit)

---

## Implementation Roadmap

### Phase 1: Setup (Week 1)
- [ ] Provision Redis instance for BullMQ
- [ ] Create `image_library` table with indexes
- [ ] Create `deletion_audit_log` table
- [ ] Set up BullMQ in Node.js backend

### Phase 2: Core Logic (Week 2)
- [ ] Implement ImageCleanupService
- [ ] Write cleanup SQL queries
- [ ] Add database transaction wrapper
- [ ] Implement cloud storage deletion

### Phase 3: Error Handling (Week 3)
- [ ] Add comprehensive logging (Winston)
- [ ] Implement retry logic with backoff
- [ ] Create audit trail logging
- [ ] Set up failure alerts

### Phase 4: Testing & Monitoring (Week 4)
- [ ] Unit tests for cleanup logic
- [ ] Integration tests with real database
- [ ] Load tests with large image sets
- [ ] Set up BullMQ monitoring dashboard
- [ ] Create manual recovery procedures

### Phase 5: Deployment (Week 5)
- [ ] Dry run with test data
- [ ] Production deployment
- [ ] Monitor first week closely
- [ ] Document operational procedures

---

## Monitoring & Alerts

### Key Metrics to Track

```javascript
{
  cleanup_jobs_total: gauge,           // Jobs run this month
  cleanup_success_rate: percentage,    // % successful
  cleanup_duration_seconds: histogram, // Execution time
  images_deleted: counter,             // Total deleted
  storage_freed_bytes: counter,        // Space reclaimed
  storage_usage_percent: gauge,        // Current usage %
  cleanup_failures: counter,           // Failed attempts
  recovery_attempts: counter           // Manual recoveries
}
```

### Alert Thresholds

| Alert | Threshold | Action |
|-------|-----------|--------|
| Cleanup Job Failed | 2+ failures in 24h | Page on-call |
| Storage > 90% | Usage > 9GB | Immediate cleanup |
| Storage > 95% | Usage > 9.5GB | Block uploads + cleanup |
| High Failures | > 10% of deletes fail | Investigate storage |

---

## Cost Implications

### Storage Savings

**Before Cleanup**:
- Images accumulate indefinitely
- Storage costs grow linearly: ~$0.023/GB/month (AWS S3 estimate)
- 10GB = $0.23/month minimum

**After Cleanup**:
- Keep 3 months of data + frequent images
- Average reduction: ~30-40% (depends on usage patterns)
- Estimated savings: $0.07-0.10/month per 10GB
- Scale benefit: With 50GB library → $0.35-0.50/month savings

### Operation Costs

**BullMQ Infrastructure**:
- Redis instance: ~$5-15/month (depending on hosting)
- Monitoring: Included with BullMQ UI
- Logging: ~$10-20/month (Winston + cloud logging)

**Net Impact**: Small upfront cost, significant long-term savings

---

## Recovery & Rollback

### If Cleanup Goes Wrong

**Scenario 1: Deleted Too Much**
```sql
-- Restore soft-deleted images (within 1 hour)
UPDATE image_library
SET is_deleted = 0, deleted_at = NULL
WHERE deleted_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
  AND recipe_name = 'specific_recipe';
```

**Scenario 2: Storage Deletion Failed**
```sql
-- Check audit log for failed deletions
SELECT * FROM deletion_audit_log
WHERE status = 'FAILED'
  AND completed_at > DATE_SUB(NOW(), INTERVAL 24 HOUR);

-- Re-trigger cleanup for specific images
INSERT INTO cleanup_queue
SELECT id FROM image_library WHERE id IN (123, 456, 789);
```

**Scenario 3: Cleanup Job Stuck**
```javascript
// BullMQ provides recovery
const job = await cleanupQueue.getJob(jobId);
await job.retry();  // Restart the job
```

---

## Next Steps

1. **Review this document** with team
2. **Approve technology choices** (especially BullMQ + Redis)
3. **Set up development environment** with Redis
4. **Implement Phase 1** (setup & schema)
5. **Write comprehensive tests** before deployment
6. **Monitor closely** first week after production launch

---

**Document Status**: Ready for Implementation
**Created**: 2025-12-04
**Last Updated**: 2025-12-04
