import express from 'express';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import moment from 'moment';
import dotenv from 'dotenv';
import fs from 'fs';
import pg from 'pg';
import multer from 'multer';

import { imgFilePath, resizeAndProcessImg } from './color.mjs';
import { downloadImg } from './color-mani.mjs';
import { getHash, checkAuth } from './util.mjs';

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

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `${Date.now()}.jpg`);
  },
});

const mutlerUpload = multer({ dest: 'uploads/', storage });

const jpgHandler = (req, res) => {
  console.log('in jpg handler');
  res.render('uploadjpg');
};

const acceptJpg = async (req, res) => {
  const { user, loggedIn } = req.cookies;
  const { category } = req.body;
  const { filename, path } = req.file;
  fs.access('./uploads', (error) => {
    if (error)
    {
      fs.mkdirSync('./uploads');
    }
  });
  const filePath = imgFilePath(filename);
  console.log('category', category);
  const imageObj = await resizeAndProcessImg(pool, filename, filePath, category, user, 500);
  console.log('imageObj', imageObj);
  res.render('colorTemplates', imageObj);
  // render next page with image and analyze templates
};
const urlHandler = (req, res) => {
  res.render('uploadurl');
};
// not working yet. issue with buffer in sharp
const accepturl = async (req, res) => {
  const { user, loggedIn } = req.cookies;
  const { imgUrl, category } = req.body;
  const filename = `${Date.now()}.jpg`;
  const filepath = imgFilePath(filename);

  await downloadImg(imgUrl, filepath);
  console.log('download sucess!', Date.now());
  const imageObj = await resizeAndProcessImg(pool, filename, filepath, category, user, 500);

  res.render('colorTemplates', imageObj);
};

const signUpForm = (req, res) => {
  const obj = {
    title: 'Sign up',
    action: '/signup',
  };
  res.render('login', obj);
};

const acceptSignUp = (req, res) => {
  const obj = {
    title: 'Sign up',
    action: '/signup',
  };

  const { password } = req.body;
  if (password.length < 8)
  {
    obj.err = 'Password is too short, should be at least 8 characters long.';
    res.render('login', obj);
    return;
  }
  const hashedPassword = getHash(req.body.password);
  const values = [req.body.username, hashedPassword];

  const usernameQuery = 'SELECT EXISTS (SELECT 1 FROM users WHERE username =$1 )';
  pool.query(usernameQuery, [req.body.username])
    .then((result) => {
      console.log(result);
      if (result.rows[0].exists === true)
      {
        obj.err = 'Username exists, choose another one.';
        throw Error('UsernameExists');
      }
      return pool.query('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id', values);
    }).then((result) => {
      console.log(result.rows);
      const userId = result.rows[0].id;
      res.cookie('loggedIn', getHash(userId));
      res.cookie('userId', userId);
      res.redirect('/');
    }).catch((e) => {
      console.log(e);
      res.render('login', obj);
    });
};
const loginForm = (req, res) => {
  const obj = {
    title: 'login',
    action: '/login',
  };
  res.render('login', obj);
};

const acceptLogin = (req, res) => {
  const obj = {
    title: 'login',
    action: '/login',
  };
  const whenLogIn = (err, result) => {
    if (err)
    {
      console.log('error when logging in', err.stack);
      res.status(503).send(result);
      return;
    }
    if (result.rows.length === 0)
    {
      obj.err = 'Username or password does is not valid';
      res.render('login', obj);
      console.log('wrong login username');
      return;
    }
    const { id, password } = result.rows[0];
    if (password !== getHash(req.body.password))
    {
      obj.err = 'Username or password does is not valid';
      res.render('login', obj);
      console.log('wrong login password');
      return;
    }
    res.cookie('loggedIn', getHash(id));
    res.cookie('userId', id);
    // could redirect to user profile page/ page with all user notes
    res.redirect('/');
  };
  const sqlQuery = `SELECT * FROM users WHERE username = '${req.body.username}'`;
  pool.query(sqlQuery, whenLogIn);
};

const logUserOut = (req, res) => {
  res.clearCookie('loggedIn');
  res.clearCookie('userId');
  res.redirect('/');
};

const getColorsFromImgId = async (pool, id, getHarmonyCols) => {
  const postObj = {};
  await pool.query('SELECT users_id , path, created_at FROM images WHERE id = $1', [id])
    .then((result) => {
      if (result.rows.length === 0)
      {
        postObj.err = 'Picture does not exist';
        // res.render('post', postObj);
        return;
      }
      postObj.id = id;
      postObj.imageSrc = result.rows[0].path;
      postObj.userid = result.rows[0].users_id;
      postObj.createdat = result.rows[0].created_at;
      const getBaseColProp = pool.query('SELECT harmonies.type, template_id, main_hue FROM base_colors INNER JOIN harmonies ON closest_harmony = harmonies.id where image_id = $1 ', [id]);
      const getHamonyColProp = pool.query('SELECT harmonies.type, template_id, base_diff FROM harmony_colors INNER JOIN harmonies ON harmony_id = harmonies.id where image_id =$1', [id]);
      return Promise.all([getBaseColProp, getHamonyColProp]);
    }).then((result) => {
      const baseColProp = result[0].rows[0];
      postObj.baseHarmony = baseColProp.type.replace(/-/g, ' ');
      postObj.hue = baseColProp.main_hue;

      const colTempQueries = [];
      colTempQueries.push(pool.query('SELECT * FROM color_templates WHERE id = $1', [baseColProp.template_id]));

      const harmonyColProp = result[1].rows;

      // get closest and furthest in order
      harmonyColProp.sort((a, b) => a.base_diff - b.base_diff);
      postObj.harmonies = ['base', ...harmonyColProp.map((h) => h.type.replace(/-/g, ' '))];
      postObj.harmonicDiff = harmonyColProp.map((h) => h.base_diff);
      if (getHarmonyCols)
      {
        postObj.harmonicDiff = [postObj.harmonicDiff[0], ...postObj.harmonicDiff];
        // console.log(postObj.harmonies);
        harmonyColProp.forEach((h) => {
          colTempQueries.push(pool.query('SELECT * FROM color_templates WHERE id = $1', [h.template_id]));
        });
      }
      else {
        postObj.harmonicDiff = [postObj.harmonicDiff[0]];
        postObj.harmonies = ['base'];
      }
      return Promise.all(colTempQueries);
    }).then((results) => {
      // extract hexcolors from templates
      const hexColObj = results.map((result) => result.rows[0]);
      const hexCol = hexColObj.map((obj) => [obj.hex_color1, obj.hex_color2, obj.hex_color3, obj.hex_color4, obj.hex_color5]);
      postObj.colTemplates = hexCol;
    })
    .catch((e) => console.error(e));
  // console.log('postObj', postObj);
  return postObj;
};

const renderPic = async (req, res) => {
  const { id } = req.params;
  const postObj = await getColorsFromImgId(pool, id, true);
  res.render('post', postObj);
};

const indexHandler = async (req, res) => {
  const limitNum = 10;
  const selectQuery = 'SELECT id FROM images ORDER BY id DESC LIMIT $1';
  const { rows } = await pool.query(selectQuery, [limitNum]);
  const ids = rows.map((obj) => obj.id);
  // console.log('ids', ids);
  const poolPromises = [];
  ids.forEach((id) => {
    poolPromises.push(getColorsFromImgId(pool, id, false));
  });

  const posts = await Promise.all(poolPromises);
  // console.log('posts', posts);
  // copy all index from birdwatching
  // render contents in each card
  // each card needs an expand button
  res.render('index', { posts });
};

app.get('/', indexHandler);
app.get('/uploadjpg', jpgHandler);
app.post('/uploadjpg', mutlerUpload.single('photo'), acceptJpg);
// not working
app.get('/uploadurl', urlHandler);
app.post('/uploadurl', accepturl);

app.get('/signup', signUpForm);
app.post('/signup', acceptSignUp);
app.get('/login', loginForm);
app.post('/login', acceptLogin);
app.delete('/logout', logUserOut);

app.get('/picture/:id', renderPic);
// app.get('/picture/:id/expand', renderExpandedPic);
// app.get('/picture/:id/delete', deletePic);

// app.post('/user/:id', userPosts);
