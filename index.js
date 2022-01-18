/* eslint-disable max-len */
import express from 'express';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import dotenv, { config } from 'dotenv';
import fs from 'fs';
import pg from 'pg';
import multer from 'multer';

// deployment to heroku
import aws from 'aws-sdk';
import multerS3 from 'multer-s3';
import sharp from 'sharp';

import {
  imgFilePath, resizeAndProcessImg, resizeAndProcessImgS3, processImage,
} from './color.mjs';
import { downloadImg, downloadSmallImg } from './color-mani.mjs';
import {
  getHash, restrictToLoggedIn, handleError, captitalizeFirstLetter, getIdsAfterSortOrFilter, getColorsFromImgId, addImgToCategoryObj, convertToHueBnds,
} from './util.mjs';

const S3 = new aws.S3({
  signatureVersion: 'v4',
});

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3004;
export const isDeployedLocally = PORT === 3004;

const s3 = new aws.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.ACCESSKEYID,
  secretAccessKey: process.env.SECRETACCESSKEY,
});
app.use(methodOverride('_method'));
app.set('view engine', 'ejs');
app.use(cookieParser());

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use(express.static('uploads'));
app.use(express.static('resource'));

app.listen(PORT);

let pgConnectionConfigs;

if (process.env.DATABASE_URL) {
  pgConnectionConfigs = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  };
}
else if (process.env.ENV === 'PRODUCTION') {
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
// local storage
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `${Date.now()}.jpg`);
  },
});
// for local host or aws server deployment
const mutlerUpload = multer({ dest: 'uploads/', storage });
// for aws s3 bucket
const mutlerS3Upload = multer({
  storage: multerS3({
    s3,
    bucket: 'buckethueinstant',
    // acl: 'public-read',
    metadata: (request, file, callback) => {
      callback(null, { fieldName: file.fieldname });
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (request, file, callback) => {
      callback(null, `${Date.now().toString()}.jpg`);
    },
  }),
});

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
const getUsernameFromId = async (id) => {
  let username;
  await pool.query(`SELECT username FROM users WHERE users.id =${id}`)
    .then((result) => {
      username = captitalizeFirstLetter(result.rows[0].username);
    }).catch(handleError);
  return username;
};

// ============== ROUTES =========================

const indexHandler = async (req, res) => {
  const limitNum = 100;
  const { sort, filter, order } = req.query;

  const ids = await getIdsAfterSortOrFilter(pool, limitNum, sort, order, filter);

  const poolPromises = [];
  ids.forEach((id) => {
    poolPromises.push(getColorsFromImgId(pool, id, false, isDeployedLocally));
  });

  const posts = await Promise.all(poolPromises).catch(handleError);
  res.render('index', {
    posts, enableDelete: false, url: '', enableExpansion: true, colorValue: res.locals.colorPicker,
  });
};

const indexCategories = async (req, res) => {
  const limitNum = 100;
  const categoryQuery = 'SELECT DISTINCT categories.id, categories.category FROM categories INNER JOIN image_categories ON image_categories.category_id = categories.id INNER JOIN images ON images.id = image_categories.image_id';

  const { rows } = await pool.query(categoryQuery).catch(handleError);

  const categoriesObj = await addImgToCategoryObj(pool, rows);

  console.log('categoriesObj', categoriesObj);
  res.render('index-categories', {
    categoriesObj, enableDelete: false, enableExpansion: true, colorValue: res.locals.colorPicker,
  });
};
const imageUpload = async (req, res) => {
  const { userId, loggedIn } = req.cookies;
  console.log('in jpg handler');
  if (req.isUserLoggedIn === true)
  {
    // categories from drop down list
    const { rows } = await pool.query(`SELECT category FROM categories INNER JOIN image_categories on categories.id = image_categories.category_id INNER JOIN images ON image_categories.image_id = images.id WHERE images.users_id=${userId}`);
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
  console.log('in acceptUpload');
  const { userId, loggedIn } = req.cookies;
  let { imgUrl, category } = req.body;
  category = captitalizeFirstLetter(category);
  if (req.file)
  {
    const { filename, path, location } = req.file;
    console.log('file location', location);
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

// S3
const resizeS3Obj = (BUCKET, filename, originalKey, writeKey, maxSize) => {
  // TODO search mime type of image
  const format = 'jpg';
  const quality = 80;

  return S3.getObject({ Bucket: BUCKET, Key: originalKey }).promise()
    .then((data) => sharp(data.Body)
      .withoutEnlargement(maxSize == null)
      .resize(maxSize, maxSize, {
        fit: sharp.fit.inside,
        withoutEnlargement: true,
      })
      .toFormat(format, { quality })
      .withMetadata()
      .toBuffer())
    .then((buffer) => S3.putObject({
      Body: buffer,
      Bucket: BUCKET,
      ContentType: `image/${format}`,
      Key: writeKey,
    }).promise())
    .then((info) => console.log('success! file info', info))
    .catch((err) => {
      if (err.code === 'NoSuchKey') { err.message = 'Image not found.';
        console.error('error in resizing', err); }
    });
};
const acceptS3Upload = async (req, res) => {
  console.log('acceptS3Upload req', req);
  const { userId } = req.cookies;
  let { imgUrl, category } = req.body;
  category = captitalizeFirstLetter(category);
  // TODO if processImage has error, convey error to page, DELETE from db record
  if (req.file)
  {
    const {
      bucket, key, filename, location,
    } = req.file;
    // res.send(req.file);
    // return;
    console.log('s3 filelocation', req.file);
    await resizeS3Obj(bucket, filename, key, key, 500).catch(handleError);
    await processImage(pool, location, category, userId, true).then((imageId) => res.redirect(`/picture/${imageId}`)).catch((e) => {
      console.log('error in accepting s3 upload', e);
      res.render('upload-no-img-url.ejs', { err: 'Unable to load this image' });
    });
  }
  // if (imgUrl) {
  //   //TODO
  //   const filename = `${Date.now()}.jpg`;
  //   const filepath = imgFilePath(filename);
  //   const maxSize = 500;

  //   await downloadSmallImg(imgUrl, filepath, maxSize)
  //     .then(() => processImage(pool, filename, category, userId))
  //     .then((imageId) => {
  //       res.redirect(`/picture/${imageId}`);
  //     })
  //     .catch((e) => {
  //       console.error(e);
  //       res.render('upload.ejs', { err: 'Unable to get image from url' });
  //     });
  // }
  else {
    res.render('upload-no-img-url.ejs', { err: 'No image uploaded' });
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
    res.redirect(`/usercategories/${id}`);
  };
  const sqlQuery = `SELECT * FROM users WHERE username = '${req.body.username}'`;
  pool.query(sqlQuery, whenLogIn);
};

const logUserOut = (req, res) => {
  res.clearCookie('loggedIn');
  res.clearCookie('userId');
  res.redirect('/');
};

const renderPic = async (req, res) => {
  const { id } = req.params;
  const postObj = await getColorsFromImgId(pool, id, true, isDeployedLocally).catch(handleError);

  res.render('post', { ...postObj, imagePath: 'test/' });
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
    poolPromises.push(getColorsFromImgId(pool, id, false, isDeployedLocally));
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

const userPosts = async (req, res) => {
  const { id } = req.params;
  const { sort, filter, order } = req.query;
  const limitNum = 100;
  const username = await getUsernameFromId(id);

  const ids = await getIdsAfterSortOrFilter(pool, limitNum, sort, order, filter, id);

  const poolPromises = [];
  ids.forEach((index) => {
    poolPromises.push(getColorsFromImgId(pool, index, false, isDeployedLocally));
  });

  const posts = await Promise.all(poolPromises).catch(handleError);
  console.log('posts', posts);
  res.render('user-all', {
    posts, enableDelete: true, url: `user/${id}`, enableExpansion: true, id, username,
  });
};

const userPostsCatergory = async (req, res) => {
  const { id } = req.params;
  const loggedInUser = req.cookies.userId;
  console.log('loggedInUser', loggedInUser === id);
  const limitNum = 100;
  const username = await getUsernameFromId(id);
  const categoryQuery = 'SELECT DISTINCT categories.id, categories.category FROM categories INNER JOIN image_categories ON image_categories.category_id = categories.id INNER JOIN images ON images.id = image_categories.image_id WHERE images.users_id=$1';

  const { rows } = await pool.query(categoryQuery, [id]).catch(handleError);

  const categoriesObj = await addImgToCategoryObj(pool, rows);

  console.log(categoriesObj);
  res.render('user-categories', {
    categoriesObj, enableDelete: id === loggedInUser, enableExpansion: true, username, id,
  });
};

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
          imgPool.push(getColorsFromImgId(pool, imgId, false, isDeployedLocally));
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
// different function for aws deployment and localhost
app.post('/upload',
  isDeployedLocally ? mutlerUpload.single('photo') : mutlerS3Upload.single('photo'),
  isDeployedLocally ? acceptUpload : acceptS3Upload);
// app.post('/upload', mutlerUpload.single('photo'), acceptUpload);

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
