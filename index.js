import express from 'express';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import moment from 'moment';
import dotenv, { config } from 'dotenv';
import fs from 'fs';
import pg from 'pg';
import multer from 'multer';
import sharp from 'sharp';

import { imgFilePath, resizeAndProcessImg, processImage } from './color.mjs';
import { downloadImg, downloadSmallImg } from './color-mani.mjs';
import {
  getHash, restrictToLoggedIn, handleError, captitalizeFirstLetter,
} from './util.mjs';

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const { Pool } = pg;
const app = express();
const PORT = process.argv[2] ? process.argv[2] : 3004;

app.use(methodOverride('_method'));
app.set('view engine', 'ejs');
app.use(cookieParser());

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use(express.static('uploads'));
app.use(express.static('resource'));

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

app.use((request, response, next) => {
  request.isUserLoggedIn = false;

  if (request.cookies.loggedIn && request.cookies.userId) {
    const hash = getHash(request.cookies.userId);

    if (request.cookies.loggedIn === hash) {
      request.isUserLoggedIn = true;
    }
  }
  next();
});

const imageUpload = async (req, res) => {
  const { userId, loggedIn } = req.cookies;
  console.log('in jpg handler');
  console.log('request.isUserLoggedIn', req.isUserLoggedIn);
  if (req.isUserLoggedIn === true)
  {
    const { rows } = await pool.query(`SELECT category FROM categories INNER JOIN image_categories on categories.id = image_categories.category_id INNER JOIN images ON image_categories.image_id = images.id WHERE images.users_id=${userId}`);
    // const sqlQuery = ;
    const categories = rows.map((obj) => obj.category);
    res.render('upload', { categories });
  }
  else {
    const obj = {
      title: 'Login',
      action: '/login',
      err: 'Need to be logged-in to analyse pictures.',
    };
    res.render('login', obj);
  }
};

const acceptUpload = async (req, res) => {
  const { userId, loggedIn } = req.cookies;
  let { imgUrl, category } = req.body;
  category = captitalizeFirstLetter(category);
  if (req.file)
  {
    const { filename, path } = req.file;
    fs.access('./uploads', (error) => {
      if (error)
      {
        fs.mkdirSync('./uploads');
      }
    });
    const filePath = imgFilePath(filename);
    resizeAndProcessImg(pool, filename, filePath, category, userId, 500).then((imageId) => {
      res.redirect(`/picture/${imageId}`);
    }).catch(handleError);
  }
  else if (imgUrl) {
    const filename = `${Date.now()}.jpg`;
    const filepath = imgFilePath(filename);
    const maxSize = 500;

    await downloadSmallImg(imgUrl, filepath, maxSize)
      .then(() => processImage(pool, filename, category, userId))
      .then((imageId) => {
        res.redirect(`/picture/${imageId}`);
      })
      .catch((e) => {
        console.error(e);
        res.render('upload.ejs', { err: 'Unable to get image from url' });
      });
  }
  else {
    res.render('upload.ejs', { err: 'No image uploaded' });
  }
  // render next page with image and analyze templates
};

const signUpForm = (req, res) => {
  const obj = {
    title: 'Sign Up',
    action: '/signup',
  };
  res.render('login', obj);
};

const acceptSignUp = (req, res) => {
  const obj = {
    title: 'Sign Up',
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
      if (result.rows[0].exists === true)
      {
        obj.err = 'Username exists, choose another one.';
        throw Error('UsernameExists');
      }
      return pool.query('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id', values);
    }).then((result) => {
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
    title: 'Login',
    action: '/login',
  };
  res.render('login', obj);
};

const acceptLogin = (req, res) => {
  const obj = {
    title: 'Log in',
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
      obj.err = 'Username or password is not valid';
      res.render('login', obj);
      console.log('wrong login username');
      return;
    }
    const { id, password } = result.rows[0];
    if (password !== getHash(req.body.password))
    {
      obj.err = 'Username or password is not valid';
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
        postObj.harmonicDiff = [0, ...postObj.harmonicDiff];
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
    .catch((e) => {
      console.error(e); });
  console.log('postObj', postObj);
  return postObj;
};

const renderPic = async (req, res) => {
  const { id } = req.params;
  const postObj = await getColorsFromImgId(pool, id, true).catch(handleError);

  res.render('post', { ...postObj, imagePath: 'test/' });
};
const getIdsAfterSortOrFilter = async (limitNum, sort = '', order = '', filter = '', userId = '') =>
{
  let ids;
  let userCondition = '';
  if (userId !== '')
  {
    userCondition = `WHERE images.users_id=${userId}`;
  }

  if (sort === 'hue' && order === 'DESC')
  {
    const hueSort = `SELECT images.id from images INNER JOIN base_colors ON images.id =base_colors.image_id  ${userCondition} ORDER BY base_colors.main_hue DESC  LIMIT $1`;

    const { rows } = await pool.query(hueSort, [limitNum]).catch(handleError);
    ids = rows.map((obj) => obj.id);
  }
  else if (sort === 'hue' && order === 'ASC')
  {
    const hueSort = `SELECT images.id from images INNER JOIN base_colors ON images.id =base_colors.image_id ${userCondition} ORDER BY base_colors.main_hue ASC  LIMIT $1`;
    const { rows } = await pool.query(hueSort, [limitNum]).catch(handleError);
    ids = rows.map((obj) => obj.id);
  }
  else if (sort === 'dateCreated' && order === 'DESC')
  {
    const dateSort = `SELECT id FROM images ${userCondition} ORDER BY created_at DESC LIMIT $1`;
    const { rows } = await pool.query(dateSort, [limitNum]).catch(handleError);
    ids = rows.map((obj) => obj.id);
  }
  else if (sort === 'dateCreated' && order === 'ASC')
  {
    const dateSort = `SELECT id FROM images ${userCondition} ORDER BY created_at ASC LIMIT $1`;
    const { rows } = await pool.query(dateSort, [limitNum]).catch(handleError);
    ids = rows.map((obj) => obj.id);
  }
  else if (filter !== '') {
    let typeQuery = 'SELECT images.id, harmony_colors.base_diff FROM images INNER JOIN base_colors ON images.id = base_colors.image_id INNER JOIN harmonies ON base_colors.closest_harmony = harmonies.id INNER JOIN harmony_colors ON images.id = harmony_colors.image_id AND base_colors.closest_harmony = harmony_colors.harmony_id WHERE harmonies.type=$1 ORDER BY harmony_colors.base_diff ASC LIMIT $2';

    if (userId !== '')
    {
      typeQuery = `SELECT images.id, harmony_colors.base_diff FROM images INNER JOIN base_colors ON images.id = base_colors.image_id INNER JOIN harmonies ON base_colors.closest_harmony = harmonies.id INNER JOIN harmony_colors ON images.id = harmony_colors.image_id AND base_colors.closest_harmony = harmony_colors.harmony_id WHERE harmonies.type=$1 AND ${userCondition} ORDER BY harmony_colors.base_diff ASC LIMIT $2`;
    }
    const { rows } = await pool.query(typeQuery, [filter, limitNum]).catch(handleError);
    ids = rows.map((obj) => obj.id);
  }
  else {
    const selectQuery = `SELECT id FROM images ${userCondition} ORDER BY id DESC LIMIT $1`;
    const { rows } = await pool.query(selectQuery, [limitNum]).catch(handleError);
    ids = rows.map((obj) => obj.id);
  }
  return ids;
};

const indexHandler = async (req, res) => {
  const limitNum = 100;
  const { sort, filter, order } = req.query;

  const ids = await getIdsAfterSortOrFilter(limitNum, sort, order, filter);

  const poolPromises = [];
  ids.forEach((id) => {
    poolPromises.push(getColorsFromImgId(pool, id, false));
  });

  const posts = await Promise.all(poolPromises).catch(handleError);
  res.render('index', {
    posts, enableDelete: false, url: '', enableExpansion: true, colorValue: res.locals.colorPicker,
  });
};
const convertToHueBnds = (value) => {
  let hueValue = value;
  if (value > 360)
  {
    hueValue = value - 360;
  }
  if (value < 0)
  {
    hueValue = value + 360;
  }
  return hueValue;
};

const indexColorHandler = async (req, res) => {
  const { colorPicker } = req.query;
  res.locals.colorPicker = colorPicker;

  console.log('color picker:', colorPicker);
  const range = 30;
  const lowerHueBnd = convertToHueBnds(colorPicker - range);
  const upperHueBnd = convertToHueBnds(Number(colorPicker) + range);

  const colQuery = 'SELECT main_hue, images.id FROM images INNER JOIN base_colors ON images.id = base_colors.image_id WHERE base_colors.main_hue>$1 AND base_colors.main_hue<$2 ORDER BY main_hue ASC';
  const { rows } = await pool.query(colQuery, [lowerHueBnd, upperHueBnd]).catch(handleError);

  const ids = rows.map((row) => row.id);

  const poolPromises = [];
  ids.forEach((id) => {
    poolPromises.push(getColorsFromImgId(pool, id, false));
  });
  const posts = await Promise.all(poolPromises).catch(handleError);
  res.render('index', {
    posts, enableDelete: false, enableExpansion: true, url: '', colorValue: colorPicker,
  });
};

const deletePic = (req, res) => {
  const { userId } = req.cookies;
  const { id } = req.params;

  const whenDeleted = (err, result) => {
    if (err)
    {
      console.log('Error when deleting', err.stack);
      res.status(503).send(result);
      return;
    }
    res.redirect(`/user/${userId}`);
  };

  const sqlQuery = `DELETE FROM images WHERE id = ${id}`;
  pool.query(sqlQuery, whenDeleted);
};
const home = (req, res) => {
  const { userId } = req.cookies;
  if (req.isUserLoggedIn === false) {
    req.status(403).send('sorry');
  }
  else {
    res.redirect(`/usercategories/${userId}`);
  }
};

const getUsernameFromId = async (id) => {
  let username;
  await pool.query(`SELECT username FROM users WHERE users.id =${id}`)
    .then((result) => {
      username = captitalizeFirstLetter(result.rows[0].username);
    }).catch(handleError);
  return username;
};

const userPosts = async (req, res) => {
  const { id } = req.params;
  const { sort, filter, order } = req.query;
  const limitNum = 100;
  const username = await getUsernameFromId(id);

  const ids = await getIdsAfterSortOrFilter(limitNum, sort, order, filter, id);

  const poolPromises = [];
  ids.forEach((index) => {
    poolPromises.push(getColorsFromImgId(pool, index, false));
  });

  const posts = await Promise.all(poolPromises).catch(handleError);
  console.log('posts', posts);
  res.render('user-all', {
    posts, enableDelete: true, url: `user/${id}`, enableExpansion: true, id, username,
  });
};
const addImgToCategoryObj = async (categoriesObj) => {
  // const queries=[];
  for (let i = 0; i < categoriesObj.length; i += 1) {
    const refCatObj = categoriesObj[i];
    // get all images with that id
    const catImagesQuery = 'SELECT images.id FROM images INNER JOIN image_categories ON image_categories.image_id = images.id INNER JOIN categories ON image_categories.category_id = categories.id WHERE categories.id=$1';
    // eslint-disable-next-line no-await-in-loop
    // queries.push( pool.query(catImagesQuery, [refCatObj.id]).catch(handleError))
    // const sqlQuery = pool.query(catImagesQuery, [refCatObj.id]).catch(handleError)
    //   .then(
    //     (result) => {
    //       const imageIds = result.rows.map((row) => row.id);
    //       const poolImgPromises = [];

    //       imageIds.forEach((index) => {
    //         poolImgPromises.push(getColorsFromImgId(pool, index, false));
    //       });
    //       return Promise.all(poolImgPromises);
    //     },
    //   ).then((result) => {
    //     refCatObj.posts = result;
    //   })
    //   .catch(handleError);
    // eslint-disable-next-line no-await-in-loop
    await pool.query(catImagesQuery, [refCatObj.id]).catch(handleError)
      .then(
        (result) => {
          const imageIds = result.rows.map((row) => row.id);
          const poolImgPromises = [];

          imageIds.forEach((index) => {
            poolImgPromises.push(getColorsFromImgId(pool, index, false));
          });
          return Promise.all(poolImgPromises);
        },
      ).then((result) => {
        refCatObj.posts = result;
      })
      .catch(handleError);
  }
  // Promise.all(queries)
  return categoriesObj;
};

const userPostsCatergory = async (req, res) => {
  const { id } = req.params;
  const loggedInUser = req.cookies.userId;
  console.log('loggedInUser', loggedInUser === id);
  const limitNum = 100;
  const username = await getUsernameFromId(id);
  const categoryQuery = 'SELECT DISTINCT categories.id, categories.category FROM categories INNER JOIN image_categories ON image_categories.category_id = categories.id INNER JOIN images ON images.id = image_categories.image_id WHERE images.users_id=$1';

  const { rows } = await pool.query(categoryQuery, [id]).catch(handleError);

  const categoriesObj = await addImgToCategoryObj(rows);

  console.log(categoriesObj);
  res.render('user-categories', {
    categoriesObj, enableDelete: id === loggedInUser, enableExpansion: true, username, id,
  });
};

const indexCategories = async (req, res) => {
  const limitNum = 100;
  const categoryQuery = 'SELECT DISTINCT categories.id, categories.category FROM categories INNER JOIN image_categories ON image_categories.category_id = categories.id INNER JOIN images ON images.id = image_categories.image_id';

  const { rows } = await pool.query(categoryQuery).catch(handleError);

  const categoriesObj = await addImgToCategoryObj(rows);

  console.log('categoriesObj', categoriesObj);
  res.render('index-categories', {
    categoriesObj, enableDelete: false, enableExpansion: true, colorValue: res.locals.colorPicker,
  });
};

// method for extracting user images

const usersHandler = async (req, res) => {
  const usersQuery = 'SELECT DISTINCT id, username FROM (SELECT users.id, users.username FROM users INNER JOIN images on users.id =  images.users_id ORDER BY images.created_at DESC) AS userSubQuery';

  const categoriesOfUser = 'SELECT DISTINCT categories.id, categories.category, users_id FROM categories INNER JOIN image_categories ON image_categories.category_id = categories.id INNER JOIN images ON images.id=image_categories.image_id WHERE users_id = $1';

  const recentPicUser = 'SELECT images.users_id, images.id FROM images WHERE images.users_id = $1 ORDER BY images.created_at DESC LIMIT 3';

  const userObjs = {};

  await pool.query(usersQuery)
    .then((result) => {
      const users = result.rows;
      const userIds = users.map((user) => user.id);
      users.forEach((user) => {
        userObjs[user.id] = { username: captitalizeFirstLetter(user.username), id: user.id };
      });

      const userCatPromises = [];
      userIds.forEach((userId) => {
        userCatPromises.push(pool.query(categoriesOfUser, [userId]));
      });
      return Promise.all(userCatPromises);
    }).then((results) => {
      const userCategories = results.map((result) => result.rows);
      // find object in userObj where id matches-> add to above object
      userCategories.forEach((userCategory) => {
        userCategory.forEach((category) => {
          const userId = category.users_id;
          const categoryObj = { categoryId: category.id, category: category.category };
          if (!('category' in userObjs[userId])) {
            userObjs[userId].category = [categoryObj];
          }
          else {
            userObjs[userId].category.push(categoryObj);
          }
        });
      });
      const userPicPool = [];
      Object.keys(userObjs).forEach((key) => {
        userPicPool.push(pool.query(recentPicUser, [key]));
      });
      return Promise.all(userPicPool);
    }).then((results) => {
      const usersPhotoIds = results.map((result) => result.rows);
      const imgPool = [];
      usersPhotoIds.forEach((user) => {
        user.forEach((imgObj) => {
          const imgId = imgObj.id;
          imgPool.push(getColorsFromImgId(pool, imgId, false));
        });
      });
      return Promise.all(imgPool);
    })
    .then((imgObjs) => {
      imgObjs.forEach((img) => {
        const userId = img.userid;
        if (!('posts' in userObjs[userId])) {
          userObjs[userId].posts = [img];
        }
        else {
          userObjs[userId].posts.push(img);
        }
      });
    })
    .catch(handleError);
  const userArray = Object.keys(userObjs).map((key) => userObjs[key]);

  // res.send(userObjs);
  res.render('users', { userObjs: userArray, enableDelete: false, enableExpansion: true });
  // link to index page category or user page
};
app.get('/?', indexHandler);
app.get('/categories', indexCategories);
app.get('/colorFilter', indexColorHandler);
app.post('/colorFilter', indexColorHandler);
app.get('/upload', imageUpload);
app.post('/upload', mutlerUpload.single('photo'), acceptUpload);

app.get('/signup', signUpForm);
app.post('/signup', acceptSignUp);
app.get('/login', loginForm);
app.post('/login', acceptLogin);
app.delete('/logout', logUserOut);

app.get('/picture/:id', renderPic);
app.delete('/picture/:id/delete', deletePic);

app.get('/home', restrictToLoggedIn(pool), home);
app.get('/user/:id?', userPosts);
app.get('/usercategories/:id?', userPostsCatergory);
// app.get('/fav/', restrictToLoggedIn(pool), userFav);
app.get('/users/?', usersHandler);
