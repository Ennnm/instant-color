import {
  getHash,
  getIdsAfterSortOrFilter,
  getColorsFromImgId,
  handleError,
  addImgToCategoryObj,
  captitalizeFirstLetter,
  getUsernameFromId,

} from '../util.mjs';

import { isDeployedLocally } from '../locals.mjs';

export default function initUsersControler(db, pool) {
  const create = (req, res) => {
    const obj = {
      title: 'Sign Up',
      action: '/signup',
    };
    res.render('login', obj);
  };

  const createForm = (req, res) => {
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
  const login = (req, res) => {
    const obj = {
      title: 'Login',
      action: '/login',
    };
    res.render('login', obj);
  };
  const loginForm = (req, res) => {
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

  const show = async (req, res) => {
    const { id } = req.params;
    const { sort, filter, order } = req.query;
    const limitNum = 100;
    const username = await getUsernameFromId(pool, id);
    console.log('req.params :>> ', req.params);
    console.log('in show of user controller');
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
  const showByCategory = async (req, res) => {
    const { id } = req.params;
    const loggedInUser = req.cookies.userId;
    console.log('loggedInUser', loggedInUser === id);
    const limitNum = 100;
    const username = await getUsernameFromId(pool, id);
    const categoryQuery = 'SELECT DISTINCT categories.id, categories.category FROM categories INNER JOIN image_categories ON image_categories.category_id = categories.id INNER JOIN images ON images.id = image_categories.image_id WHERE images.users_id=$1';

    const { rows } = await pool.query(categoryQuery, [id]).catch(handleError);

    const categoriesObj = await addImgToCategoryObj(pool, rows, isDeployedLocally);

    console.log(categoriesObj);
    res.render('user-categories', {
      categoriesObj, enableDelete: id === loggedInUser, enableExpansion: true, username, id,
    });
  };
  const index = async (req, res) => {
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
            console.log('categoryObj :>> ', categoryObj);
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
  const home = async (req, res) => {
    const { userId } = req.cookies;
    if (req.isUserLoggedIn === false) {
      req.status(403).send('sorry');
    }
    else {
      res.redirect(`/usercategories/${userId}`);
    }
  };
  const destroyLogin = (req, res) => {
    res.clearCookie('loggedIn');
    res.clearCookie('userId');
    res.redirect('/');
  };

  return {
    create,
    createForm,
    login,
    loginForm,
    destroyLogin,
    show,
    showByCategory,
    index,
    home,
  };
}
