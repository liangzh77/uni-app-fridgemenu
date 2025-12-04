-- TASK-007: image_library表 - AI生成的菜品图片库
-- 用于图片复用，降低AI调用成本

CREATE TABLE IF NOT EXISTS image_library (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    normalized_dish_name VARCHAR(255) NOT NULL COMMENT '规范化菜名 (用于复用匹配)',
    recipe_hash VARCHAR(64) NOT NULL COMMENT '菜谱哈希值 (防止并发重复生成)',
    image_url VARCHAR(512) NOT NULL COMMENT '图片URL (永久CDN地址)',
    image_hash VARCHAR(64) COMMENT '图片内容MD5 (用于存储去重)',
    image_size_kb INT NOT NULL DEFAULT 0 COMMENT '图片大小(KB)',
    usage_count INT DEFAULT 0 COMMENT '使用次数',
    last_used_at TIMESTAMP NULL COMMENT '最后使用时间',
    oss_temp_url VARCHAR(512) COMMENT 'OSS临时URL (24小时内需转存)',
    oss_downloaded TINYINT(1) DEFAULT 0 COMMENT '是否已从OSS下载转存',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    -- 主要索引: 用于复用查询
    INDEX idx_normalized_dish_name (normalized_dish_name),
    -- 辅助索引: 用于清理策略
    INDEX idx_usage_count (usage_count DESC),
    INDEX idx_last_used_at (last_used_at DESC),
    INDEX idx_oss_downloaded (oss_downloaded),
    -- 唯一索引: 防止并发重复生成
    UNIQUE KEY uk_recipe_hash (recipe_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='菜品图片库';

-- 图片匹配策略说明:
-- 1. 图片复用: 按normalized_dish_name查询（忽略食材细微差异）
-- 2. 去重检查: 按recipe_hash验证（防止并发重复生成）
-- 3. image_hash: 图片内容MD5，用于存储去重
