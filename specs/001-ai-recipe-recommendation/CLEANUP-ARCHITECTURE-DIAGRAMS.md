# Image Cleanup Architecture - Visual Diagrams

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Uni-App Frontend                             │
│                     (微信小程序)                                     │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               │ Upload Recipe Image
               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    Node.js Backend API                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  POST /api/v1/images/upload                                         │
│  ├─ Upload to Cloud Storage (Aliyun OSS)                           │
│  ├─ Save metadata to MySQL                                         │
│  └─ Check: Library Size > 8GB? ────→ Trigger Cleanup              │
│                                                                     │
│  BullMQ Queue (Redis)                                              │
│  ├─ Scheduled Job: Daily 2 AM UTC (Cron)                          │
│  └─ Event Job: Triggered by capacity threshold                    │
│                                                                     │
│  Cleanup Worker                                                     │
│  ├─ Phase 1: Identify images (SQL Query)                          │
│  ├─ Phase 2: Soft delete in database (Transaction)                │
│  ├─ Phase 3: Delete from storage (With Retry)                     │
│  └─ Phase 4: Hard delete + Audit logging                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
               │                    │
               │                    │
               ↓                    ↓
       ┌─────────────────┐  ┌──────────────────┐
       │  MySQL Database │  │  Redis (BullMQ)  │
       │                 │  │                  │
       │ - Recipes       │  │ - Job Queue      │
       │ - Images        │  │ - Scheduled Jobs │
       │ - Audit Log     │  │ - Monitoring     │
       └─────────────────┘  └──────────────────┘
               │
               ↓
       ┌──────────────────────┐
       │  Aliyun OSS / CDN    │
       │                      │
       │ (Permanent image URL)│
       └──────────────────────┘
```

---

## 2. Image Cleanup Process Flow

```
START
  │
  ├─ Check trigger condition
  │  ├─ Scheduled: 2 AM UTC daily (BullMQ)
  │  └─ Threshold: Library > 8GB (on upload)
  │
  ├─ Query images eligible for deletion
  │  └─ WHERE: (last_used_at < 3 months AGO) AND (access_count < 10)
  │     ORDER BY last_used_at ASC
  │     LIMIT 1000  ← Process in batches
  │
  ├─ Soft Delete Phase (Database Transaction)
  │  ├─ BEGIN TRANSACTION
  │  ├─ UPDATE image_library SET is_deleted=1, deleted_at=NOW()
  │  ├─ COMMIT or ROLLBACK
  │  └─ Log to deletion_audit_log (status: DB_DELETED)
  │
  ├─ Storage Deletion Phase (With Retry)
  │  ├─ For each image:
  │  │  ├─ DELETE from Aliyun OSS
  │  │  ├─ Success? → Log (status: STORAGE_DELETED)
  │  │  └─ Failed? → Retry 3 times (backoff: 1s, 2s, 4s)
  │  │              Log (status: STORAGE_DELETE_FAILED)
  │  │
  │  └─ Continue with other images (don't block on failures)
  │
  ├─ Hard Delete Phase (Cleanup Database)
  │  ├─ Wait 1 hour (allow recovery if needed)
  │  └─ DELETE FROM image_library WHERE is_deleted=1 AND deleted_at < 1 hour
  │
  ├─ Generate Report
  │  ├─ Total deleted: N images
  │  ├─ Bytes freed: X GB
  │  ├─ Success rate: Y%
  │  └─ Duration: Z seconds
  │
  ├─ Logging & Alerts
  │  ├─ Log to deletion_audit_log
  │  ├─ Update Prometheus metrics
  │  └─ Send alert if failures > threshold
  │
  └─ END

  ┌─ If Job Fails
  │  ├─ BullMQ automatic retry (up to 3 attempts)
  │  ├─ Exponential backoff: 2s, 4s, 8s
  │  └─ Alert admin if all retries fail
```

---

## 3. Database Transaction Model

```
Timeline of Deletion Operations:

T0: Job starts
├─ Read: SELECT images to delete
│
T1: Soft Delete Phase
├─ BEGIN TRANSACTION
├─ UPDATE image_library SET is_deleted=1, deleted_at=NOW()
│  └─ All or nothing (atomic)
├─ COMMIT ✓ (Database locked briefly)
│  └─ Data persisted, can be recovered
│
T2: Storage Deletion Phase
├─ For each image (outside transaction):
│  ├─ DELETE from Aliyun OSS
│  ├─ Success ✓ → Log (STORAGE_DELETED)
│  └─ Failure ✗ → Retry 3 times
│                 Log (STORAGE_DELETE_FAILED)
│
T3: Audit & Recovery
├─ Image marked as deleted in DB (is_deleted=1)
├─ Can be recovered anytime within 1 hour:
│  └─ UPDATE image_library SET is_deleted=0 WHERE deleted_at > NOW()-1h
├─ Full audit trail for all attempts
│
T4: Hard Delete (After 1 hour)
├─ Safe to hard delete (recovery window passed)
├─ DELETE FROM image_library WHERE is_deleted=1 AND deleted_at < NOW()-1h
└─ Reclaim database disk space

Key Advantage:
If storage deletion fails, database still has the record
Can retry storage deletion in next cleanup job
No data loss, complete audit trail
```

---

## 4. Cleanup Trigger Mechanism

```
┌─────────────────────────────────────────────────────────┐
│              Cleanup Trigger Sources                    │
└─────────────────────────────────────────────────────────┘

Route 1: SCHEDULED (Primary)
├─ BullMQ Cron Job
├─ Schedule: 0 2 * * * (2 AM UTC daily)
├─ Trigger: Automatic (no manual action needed)
└─ Benefit: Regular maintenance, predictable

Route 2: THRESHOLD (Secondary)
├─ Triggered by Upload Endpoint
├─ Condition: Library size > 8GB (80% of 10GB)
├─ Trigger: After image upload completes
└─ Benefit: Prevents capacity overflow

Combined Strategy:
┌──────────────────────────────────────────────────┐
│ Daily 2 AM UTC                                   │
│ └─ Scheduled cleanup                            │
│    └─ Identify all eligible images              │
│       └─ Clean up accumulated garbage           │
└──────────────────────────────────────────────────┘
         AND (Independent)
┌──────────────────────────────────────────────────┐
│ Upload Endpoint                                  │
│ └─ Upload image                                 │
│    └─ Check capacity                            │
│       └─ If > 8GB: Trigger immediate cleanup   │
│          └─ Safety net for high traffic        │
└──────────────────────────────────────────────────┘

Timeline Example:
Day 1, 2:00 AM:   Scheduled cleanup runs
                  └─ Deletes 50 old images (-500MB)
Day 1, 10:00 AM:  Users upload 20 images (+2GB)
                  └─ Library size: 7.5GB (75%) - No trigger
Day 1, 6:00 PM:   Users upload 30 more images (+3GB)
                  └─ Library size: 8.2GB (82%) - THRESHOLD EXCEEDED
                  └─ Immediate cleanup triggered
                     └─ Deletes 30 old images (-300MB)
Day 2, 2:00 AM:   Scheduled cleanup runs again
                  └─ Regular maintenance
```

---

## 5. Error Handling & Retry Logic

```
Cleanup Job Execution
├─ Attempt 1 (Delay: 0s)
│  ├─ Database soft delete: SUCCESS ✓
│  ├─ Storage deletion (Image 1): FAILED ✗
│  │  └─ Error: Network timeout
│  ├─ Storage deletion (Image 2): SUCCESS ✓
│  └─ Job result: PARTIAL_FAILURE
│
├─ BullMQ Detects Failure
│  └─ Exponential backoff: 2 seconds
│
├─ Attempt 2 (Delay: 2s later)
│  ├─ Database soft delete: SKIPPED (already done)
│  ├─ Storage deletion (Image 1): SUCCESS ✓ (retry)
│  ├─ Storage deletion (Image 2): SKIPPED (already done)
│  └─ Job result: SUCCESS
│
└─ If all retries fail after 3 attempts
   ├─ Mark job as DEAD (stop retrying)
   ├─ Log comprehensive error information
   ├─ Send alert to admin
   └─ Admin can retry manually later

Audit Trail:
┌──────────────────────────────────────────────────┐
│ deletion_audit_log                               │
├──────────────────────────────────────────────────┤
│ image_id │ status               │ retry_count    │
├──────────┼──────────────────────┼────────────────┤
│    1     │ STORAGE_DELETE_FAILED│      1         │
│    1     │ STORAGE_DELETED      │      2         │ ← Final success
│    2     │ STORAGE_DELETED      │      1         │ ← Immediate success
└──────────────────────────────────────────────────┘
```

---

## 6. Data Deletion Order Decision

```
DECISION: Database First (Soft Delete) → Storage Second (Hard Delete)

Compare two approaches:

═══════════════════════════════════════════════════════════════

Approach A: Database FIRST (CHOSEN)
─────────────────────────────────
T1: Database Soft Delete
    UPDATE image_library SET is_deleted=1 ✓ (Atomic transaction)
       └─ Record preserved, can be recovered

T2: Storage Deletion
    DELETE from OSS (with retry)
       ├─ Success: Image deleted from storage ✓
       └─ Failure: Image still marked as deleted in DB
          └─ Can be retried in next cleanup job
          └─ No data loss

Advantages:
✓ Database guarantee (ACID transaction)
✓ Storage failures don't block cleanup
✓ Can recover records anytime within 1 hour
✓ Complete audit trail
✓ Soft delete is fast (no I/O)

═══════════════════════════════════════════════════════════════

Approach B: Storage FIRST (NOT CHOSEN)
──────────────────────────────────────
T1: Storage Deletion
    DELETE from OSS ✗ (No atomic guarantee)
       └─ If fails: Image still in OSS, record still in DB

T2: Database Deletion
    DELETE from image_library
       ├─ Success: Database cleaned
       └─ Failure: Orphaned file in storage
          └─ Can't find the file later
          └─ Inconsistent state

Disadvantages:
✗ No atomic guarantee from storage
✗ If storage deletion fails, orphaned references
✗ Hard to recover orphaned files
✗ Inconsistent state possible

═══════════════════════════════════════════════════════════════

CONCLUSION: Database First is safer and more reliable
```

---

## 7. Capacity Management Over Time

```
Capacity Timeline with Cleanup Strategy

100% │                                    ┌─ Critical (>95%)
95%  │                                    │  Block uploads
90%  │                          ┌─────────┤  Send alert
     │                          │
80%  │          ┌───────────────┤  ← Threshold
     │          │ Cleanup triggered
70%  │  ┌──────┘
     │  │
     │  ├─ Cleanup Job Runs
     │  │  ├─ Soft delete in DB
     │  │  ├─ Delete from storage
     │  │  ├─ Audit logging
     │  │  └─ Free up space
     │  │
60%  ├──┘
     │
     │  Daily cycle repeats (2 AM UTC)
     │
0%   └─────────────────────────────────────→ Time


Legend:
─ = Normal operation
┌─ = Threshold reached, cleanup triggered
│  = Cleanup job running
┘  = Cleanup completed, size reduced


Example Capacity Numbers:
─────────────────────────
10 GB = 100%
9 GB  = 90%
8 GB  = 80% ← THRESHOLD (trigger cleanup)
7 GB  = 70%
0 GB  = 0%
```

---

## 8. Monitoring & Metrics Dashboard

```
┌────────────────────────────────────────────────────────────┐
│           BullMQ Monitoring Dashboard                      │
│         (http://localhost:3000/admin/queues)              │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Queue: image-cleanup                                      │
│  ├─ Active:     1 job                                     │
│  ├─ Completed:  42 jobs (last 7 days)                    │
│  ├─ Failed:     2 jobs                                   │
│  ├─ Delayed:    0 jobs                                   │
│  └─ Recurring:  1 job (cron: 0 2 * * *)                 │
│                                                             │
│  Recent Jobs:                                              │
│  ├─ scheduled-daily-cleanup (2025-12-04 2:00 AM)         │
│  │  └─ Status: COMPLETED (2 min 30 sec)                 │
│  │     Deleted: 150 images, Freed: 450 MB                │
│  │                                                        │
│  └─ immediate-cleanup (2025-12-04 6:15 PM)              │
│     └─ Status: COMPLETED (1 min 15 sec)                 │
│        Deleted: 75 images, Freed: 225 MB                │
│                                                             │
└────────────────────────────────────────────────────────────┘

Prometheus Metrics:
────────────────────
cleanup_jobs_total{status="success"} 44
cleanup_jobs_total{status="failure"} 2

images_deleted_total 225
storage_freed_bytes 675000000

cleanup_duration_seconds (histogram)
  p50: 90s
  p95: 150s
  p99: 180s

library_capacity_percent 72.5

cleanup_failures_total 2
recovery_attempts_total 1
```

---

## 9. Soft Delete vs Hard Delete Timeline

```
Image Lifecycle:

1. CREATION
   ├─ Upload image
   ├─ Save to OSS
   └─ Create record in image_library
       └─ is_deleted = 0 (active)

2. USAGE
   ├─ User accesses recipe with image
   ├─ Increment access_count
   ├─ Update last_used_at
   └─ Image remains active (is_deleted = 0)

3. SOFT DELETE (Cleanup Triggered)
   ├─ Cleanup job runs
   ├─ Database: UPDATE is_deleted = 1, deleted_at = NOW()
   │  └─ Record still in database (can be recovered)
   │  └─ Can query: SELECT * WHERE is_deleted = 1
   │
   ├─ Storage: DELETE from OSS
   │  └─ May fail and retry
   │  └─ No atomic guarantee
   │
   └─ Audit: Log all operations
       └─ deletion_audit_log records attempts

4. RECOVERY WINDOW (1 hour)
   ├─ If deletion failed: can retry
   │  └─ BullMQ auto-retry up to 3 times
   │
   └─ If needed to restore:
      └─ UPDATE is_deleted = 0, deleted_at = NULL
         WHERE deleted_at > NOW() - INTERVAL 1 HOUR

5. HARD DELETE (After 1 hour)
   ├─ Safety margin passed
   ├─ Database: DELETE FROM image_library WHERE is_deleted=1
   │  └─ Record removed from database
   │  └─ Disk space reclaimed
   │
   └─ No recovery possible after this point


Timeline Example:
─────────────────
2:00 AM - Cleanup job starts
  └─ Identifies 100 old images

2:01 AM - Soft delete phase completes
  └─ 100 images marked as deleted in DB
  └─ Database now: is_deleted = 1 for these records

2:02 AM - Storage deletion phase
  └─ 98 images successfully deleted from OSS
  └─ 2 images failed (will retry)

2:04 AM - Job completes
  └─ 98 deleted, 2 failed
  └─ All attempts logged

2:04 AM - 3:00 AM - Recovery window open
  └─ If needed, can restore: UPDATE is_deleted = 0

3:00 AM onwards - Hard delete phase
  └─ Safe to hard delete from database
  └─ Reclaim disk space
  └─ No recovery possible
```

---

## 10. Cost Impact Analysis

```
Storage Cost Comparison

BEFORE Cleanup Implementation
────────────────────────────
Average library size: 10 GB (constant)
Storage cost: ~$0.023 per GB per month (AWS S3 pricing)
Monthly cost: 10 GB × $0.023 = $0.23/month

AFTER Cleanup Implementation
────────────────────────────
With cleanup strategy:
├─ Keep: Last 3 months + high-frequency images
├─ Remove: Old, rarely-used images
└─ Average reduction: 30-40% (typical)

Scenario 1 (Conservative 30% reduction):
Average library size: 7 GB
Storage cost: 7 GB × $0.023 = $0.161/month
Savings: $0.069/month

Scenario 2 (Moderate 35% reduction):
Average library size: 6.5 GB
Storage cost: 6.5 GB × $0.023 = $0.150/month
Savings: $0.080/month

Scenario 3 (Optimistic 40% reduction):
Average library size: 6 GB
Storage cost: 6 GB × $0.023 = $0.138/month
Savings: $0.092/month

Infrastructure Costs
──────────────────
Redis instance (BullMQ): ~$10/month
Monitoring/Logging: ~$15/month
Total: ~$25/month

Net Impact (per user):
──────────────────────
Assuming 1000 users with shared 10GB library:
Infrastructure: $25/month = $0.025 per user
Savings: $0.080 per user (conservative)
Net savings: $0.055 per user per month

At scale (10,000 users with 100GB library):
Infrastructure: $50/month = $0.005 per user
Savings: $0.80 per user (conservative)
Net savings: $0.795 per user per month
```

---

**Visual diagrams complete. For implementation details, see CLEANUP-IMPLEMENTATION-CODE.md**
