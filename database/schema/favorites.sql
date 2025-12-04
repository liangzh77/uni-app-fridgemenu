-- TASK-006: favorites表 - 用户收藏记录
-- 存储用户收藏的菜谱，支持跨设备同步

CREATE TABLE IF NOT EXISTS favorites (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    user_id VARCHAR(64) NOT NULL COMMENT '用户ID (微信openid)',
    recipe_id BIGINT NOT NULL COMMENT '菜谱ID',
    favorited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',

    -- 防止重复收藏
    UNIQUE KEY uk_user_recipe (user_id, recipe_id),
    INDEX idx_user_id (user_id),
    INDEX idx_recipe_id (recipe_id),
    INDEX idx_favorited_at (favorited_at DESC),

    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='用户收藏表';
