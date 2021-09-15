module.exports = {
  development: {
    username: 'en',
    password: null,
    database: 'instant_color',
    host: '127.0.0.1',
    dialect: 'postgres',
  },
  production: {
    username: 'postgres',
    password: process.env.DB_PASSWORD,
    database: 'instant_color',
    host: '127.0.0.1',
    dialect: 'postgres',
  },

};
