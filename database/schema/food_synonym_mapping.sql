-- TASK-008: food_synonym_mapping表 - 食材同义词映射表
-- 用于食材和菜名的规范化处理

CREATE TABLE IF NOT EXISTS food_synonym_mapping (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    synonym_name VARCHAR(100) NOT NULL COMMENT '同义词名称 (如"西红柿")',
    standard_name VARCHAR(100) NOT NULL COMMENT '标准名称 (如"番茄")',
    category VARCHAR(50) COMMENT '分类 (蔬菜/肉类/调料等)',
    priority INT DEFAULT 0 COMMENT '优先级 (数值越大越优先)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    -- 同义词必须唯一
    UNIQUE KEY uk_synonym_name (synonym_name),
    INDEX idx_standard_name (standard_name),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='食材同义词映射表';
