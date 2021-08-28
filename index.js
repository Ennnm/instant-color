import express from 'express';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import moment from 'moment';
import pg from 'pg';
import jsSHA from 'jssha';
import dotenv from 'dotenv';
import multer from 'multer';

import { downloadImg, rgbToHex } from './color-mani.mjs';

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const { Pool } = pg;
const app = express();

app.use(methodOverride('_method'));
app.set('view engine', 'ejs');
app.use(cookieParser());

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
// app.use((request, response, next) => {
//   console.log('Every request:', request.path);
//   next();
// });
const PORT = process.argv[2] ? process.argv[2] : 3004;
app.listen(PORT);

let pgConnectionConfigs;
if (process.env.ENV === 'PRODUCTION') {
  // determine how we connect to the remote Postgres server
  pgConnectionConfigs = {
    user: 'postgres',
    password: process.env.DB_PASSWORD,
    host: 'localhost',
    database: 'instant_color',
    port: 5432,
  };
} else {
  // determine how we connect to the local Postgres server
  pgConnectionConfigs = {
    user: 'en',
    host: 'localhost',
    database: 'instant_color',
    port: 5432,
  };
}

const pool = new Pool(pgConnectionConfigs);

const { SALT } = process.env;

const mutlerUpload = multer({ dest: 'uploads/' });

const imgFilePath = (filename) => `./downloads/${filename}.jpg`;

const url = 'https://images.unsplash.com/photo-1630082900894-edbd503588f7?ixid=MnwxMjA3fDB8MHxlZGl0b3JpYWwtZmVlZHw3fHx8ZW58MHx8fHw%3D&ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60';

// const imgFp = downloadImg(url, imgFilePath('moduletdest'));

const indexHandler = (req, res) => {
  res.redirect('/uploadjpg');
};

const jpgHandler = (req, res) => {
  console.log('in jpg handler');
  res.render('uploadjpg');
};

const acceptJpg = (req, res) => {
  console.log(req.file);
  const { user } = req.cookies;
  const { category } = req.body;

  async function insertImage(filename, category = '', username = '')
  { // find user id from username
    let userId = 0;
    if (username)
    {
      const { rows } = await pool.query('SELECT id FROM users WHERE username = $1',
        [username]);
      userId = rows[0].id;
    }

    const { rows } = await pool.query('INSERT INTO images (users_id, path) VALUES ($1, $2) RETURNING id',
      [userId, req.file.filename]);
    const imageId = rows[0].id;
    // find if category exist, if not insert new category, return index
    let categoryId;
    if (category)
    {
      const { rows } = await pool.query('SELECT id FROM categories WHERE category=$1',
        [category]);

      if (rows.length > 0) categoryId = rows[0].id;
      else {
        const { rows } = await pool.query('INSERT INTO categories (category) VALUES ($1) RETURNING id',
          [category]);
        categoryId = rows[0].id;
      }
      // insert into image_category

      await pool.query('INSERT INTO image_categories (image_id, category_id) VALUES ($1, $2)',
        [imageId, categoryId]);
    }

    // calculate bascolors

    // sqlQuery;
  }
  insertImage(req.file.filename, category, user);
  // render next page with image and analyze templates
  res.render('uploadjpg');
};
const urlHandler = (req, res) => {
  res.render('uploadurl');
};

const accepturl = (req, res) => {
  res.render('uploadurl');
};

app.get('/', indexHandler);
app.get('/uploadjpg', jpgHandler);
app.post('/uploadjpg', mutlerUpload.single('photo'), acceptJpg);
app.get('/uploadurl', urlHandler);
app.post('/uploadurl', accepturl);
