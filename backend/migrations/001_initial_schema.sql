-- 001_initial_schema.sql
-- 初始化数据库Schema
-- 执行方式: mysql -u root -p fridge_menu_db < 001_initial_schema.sql

-- 创建数据库 (如果不存在)
CREATE DATABASE IF NOT EXISTS fridge_menu_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE fridge_menu_db;

-- ========================================
-- 1. food_synonym_mapping表 - 食材同义词映射
-- ========================================
CREATE TABLE IF NOT EXISTS food_synonym_mapping (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    synonym_name VARCHAR(100) NOT NULL COMMENT '同义词名称',
    standard_name VARCHAR(100) NOT NULL COMMENT '标准名称',
    category VARCHAR(50) COMMENT '分类',
    priority INT DEFAULT 0 COMMENT '优先级',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    UNIQUE KEY uk_synonym_name (synonym_name),
    INDEX idx_standard_name (standard_name),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='食材同义词映射表';

-- ========================================
-- 2. image_library表 - 菜品图片库
-- ========================================
CREATE TABLE IF NOT EXISTS image_library (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    normalized_dish_name VARCHAR(255) NOT NULL COMMENT '规范化菜名',
    recipe_hash VARCHAR(64) NOT NULL COMMENT '菜谱哈希值',
    image_url VARCHAR(512) NOT NULL COMMENT '图片URL',
    image_hash VARCHAR(64) COMMENT '图片内容MD5',
    image_size_kb INT NOT NULL DEFAULT 0 COMMENT '图片大小(KB)',
    usage_count INT DEFAULT 0 COMMENT '使用次数',
    last_used_at TIMESTAMP NULL COMMENT '最后使用时间',
    oss_temp_url VARCHAR(512) COMMENT 'OSS临时URL',
    oss_downloaded TINYINT(1) DEFAULT 0 COMMENT '是否已转存',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_normalized_dish_name (normalized_dish_name),
    INDEX idx_usage_count (usage_count DESC),
    INDEX idx_last_used_at (last_used_at DESC),
    INDEX idx_oss_downloaded (oss_downloaded),
    UNIQUE KEY uk_recipe_hash (recipe_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='菜品图片库';

-- ========================================
-- 3. recipes表 - 菜谱信息
-- ========================================
CREATE TABLE IF NOT EXISTS recipes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    dish_name VARCHAR(100) NOT NULL COMMENT '菜名',
    normalized_dish_name VARCHAR(100) NOT NULL COMMENT '规范化菜名',
    ingredients_json JSON NOT NULL COMMENT '食材列表JSON',
    steps_json JSON NOT NULL COMMENT '制作步骤JSON',
    cooking_time INT COMMENT '烹饪时长(分钟)',
    difficulty ENUM('easy', 'medium', 'hard') DEFAULT 'medium' COMMENT '难度等级',
    cuisine_type VARCHAR(50) COMMENT '菜系类型',
    tips TEXT COMMENT '烹饪小贴士',
    image_library_id BIGINT COMMENT '关联的图片库ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_dish_name (dish_name),
    INDEX idx_normalized_dish_name (normalized_dish_name),
    INDEX idx_cuisine_type (cuisine_type),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (image_library_id) REFERENCES image_library(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='菜谱信息表';

-- ========================================
-- 4. ingredients表 - 用户食材记录
-- ========================================
CREATE TABLE IF NOT EXISTS ingredients (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    user_id VARCHAR(64) NOT NULL COMMENT '用户ID',
    session_id VARCHAR(64) NOT NULL COMMENT '会话ID',
    name VARCHAR(100) NOT NULL COMMENT '食材名称',
    original_name VARCHAR(100) COMMENT '原始输入名称',
    category VARCHAR(50) COMMENT '食材分类',
    quantity DECIMAL(10,2) COMMENT '数量',
    unit VARCHAR(20) COMMENT '单位',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_user_id (user_id),
    INDEX idx_session_id (session_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='用户食材列表';

-- ========================================
-- 5. favorites表 - 用户收藏
-- ========================================
CREATE TABLE IF NOT EXISTS favorites (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    user_id VARCHAR(64) NOT NULL COMMENT '用户ID',
    recipe_id BIGINT NOT NULL COMMENT '菜谱ID',
    favorited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',

    UNIQUE KEY uk_user_recipe (user_id, recipe_id),
    INDEX idx_user_id (user_id),
    INDEX idx_recipe_id (recipe_id),
    INDEX idx_favorited_at (favorited_at DESC),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='用户收藏表';

-- ========================================
-- 插入初始同义词数据
-- ========================================
-- 详见 database/seeds/food_synonyms.sql

SELECT '数据库初始化完成' AS status;
