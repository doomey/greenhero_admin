var config = {
    "host": process.env.GREEN_DB_SERVER,
    "port": process.env.GREEN_DB_PORT,
    "user": process.env.GREEN_DB_USERNAME,
    "password": process.env.GREEN_DB_PASSWORD,
    "database": process.env.GREEN_DB2,
    "ssl": "Amazon RDS",
    "debug": true
}

module.exports = config;