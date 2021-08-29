import express from 'express';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import moment from 'moment';
import pg from 'pg';
import jsSHA from 'jssha';
import dotenv from 'dotenv';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';

import {
  insertImage, insertColors, processImage, imgFilePath,
} from './aa-sql.mjs';
import { downloadImg, rgbToHex } from './color-mani.mjs';

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const { Pool } = pg;
const app = express();

app.use(methodOverride('_method'));
app.set('view engine', 'ejs');
app.use(cookieParser());

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use(express.static('uploads'));
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

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `${Date.now()}.jpg`);
  },
});

const mutlerUpload = multer({ dest: 'uploads/', storage });

const indexHandler = (req, res) => {
  res.redirect('/uploadjpg');
};

const jpgHandler = (req, res) => {
  console.log('in jpg handler');
  res.render('uploadjpg');
};

const acceptJpg = async (req, res) => {
  fs.access('./uploads', (error) => {
    if (error)
    {
      fs.mkdirSync('./uploads');
    }
  });
  const { user } = req.cookies;
  const { category } = req.body;
  const {
    filename, originalname, path,
  } = req.file;
  console.log('file name', req.file);
  const ref = `${Date.now()}.jpg`;
  console.log('ref', ref);
  await sharp(`./${path}`)
    .resize(500, 500, {
      fit: sharp.fit.inside,
      withoutEnlargement: true,
    })
    .withMetadata()
    .toBuffer((err, buffer) => {
      fs.writeFile(`./${path}`, buffer, (e) => { if (e)console.error(e); });
    });
  // .then(console.log('resize success!'));
  // .catch((err) => console.error(err)));
  // .toFile(imgFilePath(ref)).then(console.log('sucess in resizing'))
  // .catch((err) => console.error(err));
  // await sharp(filename).resize(1000).jpeg({ quality: 80 });
  // await sharp(buffer).jpeg({ quality: 20 }).toFile(imgFilePath(ref));
  const imageObj = await processImage(pool, filename, category, user);

  res.render('colorTemplates', imageObj);

  // render next page with image and analyze templates
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
