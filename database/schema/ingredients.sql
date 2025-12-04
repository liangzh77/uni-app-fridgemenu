-- TASK-004: ingredients表 - 用户输入的食材记录
-- 用于存储用户通过语音识别输入的食材列表

CREATE TABLE IF NOT EXISTS ingredients (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    user_id VARCHAR(64) NOT NULL COMMENT '用户ID (微信openid)',
    session_id VARCHAR(64) NOT NULL COMMENT '会话ID (一次语音输入为一个会话)',
    name VARCHAR(100) NOT NULL COMMENT '食材名称 (规范化后)',
    original_name VARCHAR(100) COMMENT '原始输入名称',
    category VARCHAR(50) COMMENT '食材分类 (蔬菜/肉类/海鲜等)',
    quantity DECIMAL(10,2) COMMENT '数量',
    unit VARCHAR(20) COMMENT '单位',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_user_id (user_id),
    INDEX idx_session_id (session_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='用户食材列表';
