-- 迁移: 为菜谱表添加主食材和配料分离字段
-- 版本: 002
-- 日期: 2025-12-06
-- 描述: 将食材分为主食材(mainIngredients)和配料/佐料(seasonings)，以便于按主食材搜索

USE fridge_menu_db;

-- 添加主食材JSON字段
ALTER TABLE recipes
ADD COLUMN main_ingredients_json JSON NULL COMMENT '主食材列表JSON（用于搜索匹配）'
AFTER ingredients_json;

-- 添加配料/佐料JSON字段
ALTER TABLE recipes
ADD COLUMN seasonings_json JSON NULL COMMENT '配料/佐料列表JSON'
AFTER main_ingredients_json;

-- 更新注释
ALTER TABLE recipes
MODIFY COLUMN ingredients_json JSON NOT NULL COMMENT '食材列表JSON（兼容旧数据，包含所有食材）';
