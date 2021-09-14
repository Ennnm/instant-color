import { Sequelize } from 'sequelize';
import allConfig from '../config/config.js';

// import initUserModel from './user.mjs';
// import initReservationModel from './reservation.mjs';
// import initEquipModel from './equipment.mjs';

const env = process.env.NODE_ENV || 'development';

const config = allConfig[env];

const db = {};

const sequelize = new Sequelize(config.database, config.username, config.password, config);

// add your model definitions to db here
// db.User = initUserModel(sequelize, Sequelize.DataTypes);
// db.Reservation = initReservationModel(sequelize, Sequelize.DataTypes);
// db.Equipment = initEquipModel(sequelize, Sequelize.DataTypes);

// db.User.hasMany(db.Reservation);
// db.Reservation.belongsTo(db.User);

// db.User.hasMany(db.Equipment);
// db.Equipment.belongsTo(db.User);

// const user = db.User.findByPk(1);
// console.log(user.__proto__);
db.sequelize = sequelize;
db.Sequelize = Sequelize;

export default db;
