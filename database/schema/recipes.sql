-- TASK-005: recipes表 - AI推荐的菜谱记录
-- 存储通义千问推荐的菜谱信息

CREATE TABLE IF NOT EXISTS recipes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    dish_name VARCHAR(100) NOT NULL COMMENT '菜名',
    normalized_dish_name VARCHAR(100) NOT NULL COMMENT '规范化菜名 (用于图片匹配)',
    ingredients_json JSON NOT NULL COMMENT '食材列表 [{name, amount, required}]',
    steps_json JSON NOT NULL COMMENT '制作步骤 [{step, description, time}]',
    cooking_time INT COMMENT '烹饪时长(分钟)',
    difficulty ENUM('easy', 'medium', 'hard') DEFAULT 'medium' COMMENT '难度等级',
    cuisine_type VARCHAR(50) COMMENT '菜系类型 (川菜/粤菜/快手菜等)',
    tips TEXT COMMENT '烹饪小贴士',
    image_library_id BIGINT COMMENT '关联的图片库ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_dish_name (dish_name),
    INDEX idx_normalized_dish_name (normalized_dish_name),
    INDEX idx_cuisine_type (cuisine_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='菜谱信息表';
