# Image Cleanup Strategy - Complete Documentation Index

## Overview

This directory contains comprehensive research and implementation guidance for implementing an automated image cleanup strategy for the 10GB image library with the following rules:

- **Keep**: Images used in last 3 months **OR** with 10+ access counts
- **Delete**: Everything else when capacity approaches limit

---

## Documents

### 1. **CLEANUP-STRATEGY-SUMMARY.md** ⭐ START HERE
   - **Length**: 2,000 words
   - **Purpose**: Executive summary with quick decision reference
   - **Contains**:
     - Technology decisions (BullMQ, Hybrid Trigger, Database-First)
     - Configuration parameters
     - Implementation roadmap
     - Cost analysis
     - Alert thresholds
     - Recovery procedures

   **Best for**: Quick understanding, presenting to stakeholders, implementation planning

---

### 2. **research-image-cleanup.md** 🔬 DETAILED RESEARCH
   - **Length**: 6,000+ words
   - **Purpose**: Comprehensive research on all decision factors
   - **Contains**:
     - 5 key research questions answered
     - Technology comparison matrices
     - Rationale for each decision
     - Alternative approaches considered
     - Performance considerations
     - Batch processing strategy
     - Query optimization
     - Sources and references

   **Best for**: Understanding the "why" behind decisions, evaluating alternatives, documenting architecture

---

### 3. **CLEANUP-IMPLEMENTATION-CODE.md** 💻 READY-TO-USE CODE
   - **Length**: 3,000+ words
   - **Purpose**: Production-ready code examples
   - **Contains**:
     - BullMQ setup and configuration
     - ImageCleanupService implementation
     - Cloud storage deletion with retry logic
     - Audit service for deletion logging
     - Upload endpoint with capacity check
     - Database schema (SQL)
     - Unit tests
     - Monitoring setup

   **Best for**: Developers implementing the feature, copy-paste code samples, testing

---

## Quick Decision Reference

### Technology Choices

```
Task Scheduler:  BullMQ (Redis-backed, persistent, auto-retry)
Cleanup Trigger: Hybrid (Daily 2 AM UTC + Capacity threshold at 80%)
Deletion Order:  Database First (Soft Delete) → Storage Second (Hard Delete)
Error Handling:  Soft delete + audit trail + auto-retry with backoff
```

### Key Metrics

| Metric | Value | Reason |
|--------|-------|--------|
| **Capacity Limit** | 10 GB | Specification requirement |
| **Cleanup Threshold** | 8 GB (80%) | Trigger cleanup before critical |
| **Keep Duration** | 3 months | Business rule |
| **Keep Min Access** | 10 times | Business rule |
| **Batch Size** | 100 images | Prevent resource exhaustion |
| **Retry Attempts** | 3 attempts | Balance reliability vs. resources |
| **Retry Backoff** | [1s, 2s, 4s] | Exponential backoff |
| **Concurrent Deletes** | 10 parallel | Prevent rate limiting |
| **Schedule** | 0 2 * * * | Daily at 2 AM UTC |

---

## Implementation Phases

### Phase 1: Setup (Week 1)
- [ ] Provision Redis for BullMQ
- [ ] Create database schema
- [ ] Set up Node.js project structure

### Phase 2: Core Logic (Week 2)
- [ ] Implement BullMQ job
- [ ] Implement cleanup service
- [ ] Add capacity check to upload endpoint

### Phase 3: Error Handling (Week 3)
- [ ] Add logging and audit trail
- [ ] Implement retry logic
- [ ] Add monitoring and alerts

### Phase 4: Testing (Week 4)
- [ ] Unit tests
- [ ] Integration tests
- [ ] Load tests

### Phase 5: Deployment (Week 5)
- [ ] Production deployment
- [ ] Monitor closely
- [ ] Document procedures

---

## Code Structure

```
backend/
├── src/
│   ├── jobs/
│   │   └── imageCleanupJob.js          [BullMQ setup]
│   ├── services/
│   │   ├── imageCleanupService.js      [Main cleanup logic]
│   │   ├── imageStorageService.js      [Cloud storage ops]
│   │   └── deletionAuditService.js     [Logging & recovery]
│   ├── api/
│   │   └── routes/
│   │       └── images.js               [Upload endpoint]
│   ├── monitoring/
│   │   ├── bullmqDashboard.js          [Dashboard setup]
│   │   └── metrics.js                  [Prometheus metrics]
│   └── app.js                          [Startup config]
└── database/
    └── schema/
        └── image_library.sql           [Table schema]
```

---

## Key Components Explained

### 1. BullMQ Queue
- Redis-based job queue
- Jobs persist across restarts
- Built-in retry mechanism
- Monitoring dashboard available
- Horizontal scaling supported

### 2. Cleanup Service
- Identifies images to delete (SQL query)
- Performs soft delete (database transaction)
- Deletes from cloud storage (with retry)
- Logs all operations (audit trail)

### 3. Trigger Mechanism
- **Scheduled**: Daily at 2 AM UTC (BullMQ cron)
- **Threshold**: When library > 8GB (capacity check on upload)

### 4. Error Handling
- Soft delete first (preserves data)
- Storage deletion can fail independently
- Auto-retry with exponential backoff
- Comprehensive logging for recovery

### 5. Monitoring
- BullMQ dashboard for job tracking
- Prometheus metrics for analytics
- Alert thresholds for critical issues
- Audit trail for compliance

---

## SQL Query Reference

### Identify Images to Delete

```sql
SELECT id, url, storage_key, file_size
FROM image_library
WHERE
  -- Not already deleted
  is_deleted = 0
  -- Older than 1 day (safety margin)
  AND created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
  -- Keep rule: Last 3 months OR 10+ accesses
  AND NOT (
    last_used_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
    OR access_count >= 10
  )
ORDER BY last_used_at ASC, access_count ASC
LIMIT 1000;  -- Process in batches
```

### Critical Indexes

```sql
CREATE INDEX idx_cleanup_query
ON image_library(is_deleted, last_used_at, access_count);

CREATE INDEX idx_last_used_at ON image_library(last_used_at);
CREATE INDEX idx_access_count ON image_library(access_count);
```

---

## Troubleshooting Guide

### Problem: Cleanup job never runs
**Solution**: Check Redis connection, verify BullMQ scheduler is initialized

### Problem: Storage deletion fails but DB deletion succeeds
**Solution**: This is acceptable (soft delete preserves data). Log indicates which items need retry.

### Problem: Library capacity exceeds 10GB
**Solution**: Threshold trigger should activate at 8GB. Check if threshold check is disabled.

### Problem: High cleanup failure rate
**Solution**: Check cloud storage rate limits, network connectivity, and retry configuration.

---

## Monitoring & Alerts

### Metrics to Track
- Cleanup jobs executed
- Success rate (%)
- Storage freed (bytes)
- Execution time
- Current capacity (%)
- Failure count
- Retry attempts

### Alert Thresholds
- **Cleanup failures**: > 2 in 24 hours → Alert
- **Capacity**: > 90% → Escalate
- **Capacity**: > 95% → Block uploads

---

## Configuration Template

```javascript
// cleanup.config.js
export const cleanupConfig = {
  // Business rules
  CAPACITY_LIMIT_GB: 10,
  KEEP_DURATION_MONTHS: 3,
  KEEP_MIN_ACCESS_COUNT: 10,

  // Cleanup thresholds
  CLEANUP_THRESHOLD_PERCENT: 80,  // 8GB

  // Processing
  BATCH_SIZE: 100,
  CONCURRENT_DELETES: 10,

  // Retries
  MAX_RETRIES: 3,
  RETRY_DELAYS_MS: [1000, 2000, 4000],

  // Scheduling
  CLEANUP_SCHEDULE: '0 2 * * *',  // 2 AM UTC daily
};
```

---

## References

See `research-image-cleanup.md` for comprehensive sources on:
- Node.js job scheduling technologies
- Database transaction patterns
- Cloud storage deletion strategies
- Error handling best practices
- Performance optimization

---

## Document Navigation

```
You are here: CLEANUP-INDEX.md (Overview & Navigation)
       ↓
Choose path based on your role:

Product Manager/Tech Lead:
  → CLEANUP-STRATEGY-SUMMARY.md
  → Review cost analysis & roadmap

Architect/Designer:
  → research-image-cleanup.md
  → Understand all design decisions

Developer:
  → CLEANUP-IMPLEMENTATION-CODE.md
  → Follow code examples & schema

QA/Tester:
  → CLEANUP-IMPLEMENTATION-CODE.md (Testing section)
  → CLEANUP-STRATEGY-SUMMARY.md (Alert thresholds)
```

---

## Next Steps

1. **Review** all three documents
2. **Approve** technology choices (especially BullMQ + Redis)
3. **Set up development environment** (Redis, Node.js)
4. **Start Phase 1** - Database schema and job setup
5. **Implement incrementally** - Test each phase
6. **Deploy to staging** - Full testing
7. **Monitor production** - Watch first week closely

---

## Support

For questions on specific decisions, refer to:
- **Why BullMQ?** → Section 1 of research-image-cleanup.md
- **How does deletion work?** → Section 4 of research-image-cleanup.md
- **How do I implement it?** → All of CLEANUP-IMPLEMENTATION-CODE.md
- **When will it trigger?** → Section 2 of research-image-cleanup.md

---

**Last Updated**: 2025-12-04
**Status**: Ready for Implementation
**Version**: 1.0
