import pg from 'pg';
import { nextTick } from 'process';
import { restrictToLoggedIn } from './util.mjs';
import db from './models/index.mjs';
// import your controllers here
// import user controller
import initPostsController from './controllers/posts.mjs';
import initUsersController from './controllers/users.mjs';
import {
  isDeployedLocally, mutlerUpload, mutlerS3Upload, uploadFile, getFileStream,
} from './locals.mjs';

const { Pool } = pg;

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
// import reservation controller
export default function bindRoutes(app) {
  // initialize the controller functions here
  // make const to hold functions
  const postsController = initPostsController(db, pool);
  const usersController = initUsersController(db, pool);
  // pass in the db for all callbacks
  console.log('in bindRoutes');
  // define your route matchers here using app
  app.get('/?', postsController.index);
  app.get('/categories', postsController.indexCategories);
  app.get('/colorFilter', postsController.indexByColor);
  app.post('/colorFilter', postsController.indexByColor);
  app.get('/upload', postsController.createForm);
  // different function for aws deployment and localhost
  // app.post('/upload',
  //   isDeployedLocally ? mutlerUpload.single('photo') : mutlerS3Upload.single('photo'),
  //   isDeployedLocally ? postsController.create : postsController.createS3);
  app.post('/upload',
    mutlerUpload.single('photo'),

    // async (req, res, next) => {
    //   // const { file } = req;
    //   // console.log(file);
    //   // const result = await uploadFile(file);
    //   // console.log('result :>> ', result);
    //   // const { description } = req.body;
    //   // console.log('description :>> ', description);
    //   // get from s3 if visiting this path
    //   // res.send({ imagePath: `/images/${result.key}` });
    //   // res.send('👌');
    //   next();
    //   // res.send(result);
    // }, 
    postsController.createS3);
  // app.post('/upload',
  //   isDeployedLocally ? mutlerUpload.single('photo') : mutlerS3Upload.single('photo'),
  //   isDeployedLocally ? acceptUpload : acceptS3Upload);
  app.get('/images/:key', (req, res) => {
    const { key } = req.params;
    const readStream = getFileStream(key);

    readStream.pipe(res);
  });
  app.get('/signup', usersController.create);
  app.post('/signup', usersController.createForm);
  app.get('/login', usersController.login);
  app.post('/login', usersController.loginForm);
  app.delete('/logout', usersController.destroyLogin);

  app.get('/picture/:id', postsController.show);
  app.delete('/picture/:id/delete', postsController.destroy);

  app.get('/home', restrictToLoggedIn(pool), usersController.home);
  app.get('/user/:id?', usersController.show);
  app.get('/usercategories/:id?', usersController.showByCategory);
  app.get('/users/?', usersController.index);
}
