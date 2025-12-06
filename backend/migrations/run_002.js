/**
 * 执行迁移 002: 添加食材分离字段
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function runMigration() {
  console.log('开始执行迁移 002: 添加主食材和配料分离字段...');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fridge_menu_db'
  });

  try {
    // 检查字段是否已存在
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'recipes' AND COLUMN_NAME IN ('main_ingredients_json', 'seasonings_json')
    `, [process.env.DB_NAME || 'fridge_menu_db']);

    const existingColumns = columns.map(c => c.COLUMN_NAME);

    if (!existingColumns.includes('main_ingredients_json')) {
      console.log('添加 main_ingredients_json 字段...');
      await connection.query(`
        ALTER TABLE recipes
        ADD COLUMN main_ingredients_json JSON NULL COMMENT '主食材列表JSON（用于搜索匹配）'
        AFTER ingredients_json
      `);
      console.log('main_ingredients_json 字段添加成功');
    } else {
      console.log('main_ingredients_json 字段已存在，跳过');
    }

    if (!existingColumns.includes('seasonings_json')) {
      console.log('添加 seasonings_json 字段...');
      await connection.query(`
        ALTER TABLE recipes
        ADD COLUMN seasonings_json JSON NULL COMMENT '配料/佐料列表JSON'
        AFTER ${existingColumns.includes('main_ingredients_json') ? 'main_ingredients_json' : 'ingredients_json'}
      `);
      console.log('seasonings_json 字段添加成功');
    } else {
      console.log('seasonings_json 字段已存在，跳过');
    }

    console.log('\n========================================');
    console.log('迁移 002 完成!');
    console.log('========================================');

  } catch (error) {
    console.error('迁移失败:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
