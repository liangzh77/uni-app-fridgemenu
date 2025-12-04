/**
 * 数据库迁移脚本
 * 执行所有SQL迁移文件
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function runMigrations() {
  console.log('开始执行数据库迁移...');

  // 创建数据库连接
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    // 读取迁移文件
    const migrationFile = path.join(__dirname, '001_initial_schema.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    // 执行迁移
    console.log('执行: 001_initial_schema.sql');
    await connection.query(sql);
    console.log('迁移完成: 001_initial_schema.sql');

    // 读取并执行种子数据
    const seedFile = path.join(__dirname, '../..', 'database/seeds/food_synonyms.sql');
    if (fs.existsSync(seedFile)) {
      console.log('执行: food_synonyms.sql (种子数据)');
      const seedSql = `USE fridge_menu_db;\n${fs.readFileSync(seedFile, 'utf8')}`;
      await connection.query(seedSql);
      console.log('种子数据导入完成');
    }

    console.log('\n========================================');
    console.log('数据库迁移全部完成!');
    console.log('========================================');

  } catch (error) {
    console.error('迁移失败:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigrations();
