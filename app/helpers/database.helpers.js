const { Pool } = require('pg');

const pool = new Pool({
    user: "spsingla",
    host: "spsingla.cbkxhfun0lw5.ap-south-1.rds.amazonaws.com",
    database: "spsingla",
    password: "ms4U^!yE9946",
    port: "5432",
    ssl: true
});
// DB_HOST = "spsingla.cbkxhfun0lw5.ap-south-1.rds.amazonaws.com"
// DB_PASSWORD = "ms4U^!yE9946"
// DB_PORT = "5432"
// DB_USER = "spsingla"
// DB_USERNAME = "spsingla"

module.exports = { pool };