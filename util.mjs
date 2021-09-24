/* eslint-disable prefer-destructuring */
import jssha from 'jssha';
import dotenv from 'dotenv';
import sharp from 'sharp';
import fetch from 'node-fetch';

import { S3 } from './locals.mjs';

const { SALT } = process.env;

export const handleError = (err) => {
  console.error(err);
};
export const getHash = (input) => {
  const shaObj = new jssha('SHA-512', 'TEXT', { encoding: 'UTF8' });
  const unhasedString = `${input}-${SALT}`;
  shaObj.update(unhasedString);

  return shaObj.getHash('HEX');
};

export const restrictToLoggedIn = (pool) => (request, response, next) => {
  // is the user logged in? Use the other middleware.
  if (request.isUserLoggedIn === false) {
    response.redirect('/login');
  } else {
    // The user is logged in. Get the user from the DB.
    const userQuery = 'SELECT * FROM users WHERE id=$1';
    pool.query(userQuery, [request.cookies.userId])
      .then((userQueryResult) => {
        // can't find the user based on their cookie.
        if (userQueryResult.rows.length === 0) {
          response.redirect('/login');
          return;
        }

        // attach the DB query result to the request object.
        request.user = userQueryResult.rows[0];

        // go to the route callback.
        next();
      }).catch((error) => {
        response.redirect('/login');
      });
  }
};

export const captitalizeFirstLetter = (string) => string.charAt(0).toUpperCase() + string.slice(1);

export const getIdsAfterSortOrFilter = async (pool, limitNum, sort = '', order = '', filter = '', userId = '') =>
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

export const getColorsFromImgId = async (pool, id, getHarmonyCols, isDeployedLoacaly) => {
  const postObj = {};
  await pool.query('SELECT users_id , path, created_at FROM images WHERE id = $1', [id])
    .then((result) => {
      if (result.rows.length === 0)
      {
        postObj.err = 'Picture does not exist';
        return;
      }
      postObj.id = id;
      postObj.imageSrc = isDeployedLoacaly ? `/${result.rows[0].path}` : result.rows[0].path;
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
  return postObj;
};

export const addImgToCategoryObj = async (pool, categoriesObj, isDeployedLocally) => {
  // TODO make into pool request
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
        // eslint-disable-next-line no-loop-func
        (result) => {
          const imageIds = result.rows.map((row) => row.id);
          const poolImgPromises = [];

          imageIds.forEach((index) => {
            poolImgPromises.push(getColorsFromImgId(pool, index, false, isDeployedLocally));
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

export const convertToHueBnds = (value) => {
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
export const resizeS3Obj = (BUCKET, filename, originalKey, writeKey, maxSize) => {
  // TODO search mime type of image
  const format = 'jpg';
  const quality = 80;

  return S3.getObject({ Bucket: BUCKET, Key: originalKey }).promise()
    .then((data) => sharp(data.Body)
      .withoutEnlargement(maxSize == null)
    // some how makes file invalid though successgully uploaded to aws
    // requires ^ to work but it causes other things to break

      .resize(maxSize, maxSize, {
        fit: sharp.fit.inside,
        withoutEnlargement: true,
      })
      .jpeg({ mozjpeg: true })
      .withMetadata()
      .toBuffer())
    .then((buffer) => S3.putObject({
      Body: buffer,
      Bucket: BUCKET,
      ContentType: `image/${format}`,
      Key: writeKey,
    }).promise())
    .then((info) => console.log('success! file info', info))
    .catch((err) => console.error('error in resizing', err));
};

export const getUsernameFromId = async (pool, id) => {
  let username;
  await pool.query(`SELECT username FROM users WHERE users.id =${id}`)
    .then((result) => {
      username = captitalizeFirstLetter(result.rows[0].username);
    }).catch(handleError);
  return username;
};

export async function downloadS3SmallImg(url, writeKey, maxSize) {
  const response = await fetch(url);
  const buffer = await response.buffer();
  const format = 'jpg';
  // resize for both cases not working.
  // url upload not possible yet, need to get url file path from s3
  // something about permissions
  // message: 'Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1' errno: -111,
  const s3Params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    ContentType: `image/${format}`,
    Key: writeKey,
  };
  return sharp(buffer)
    .withoutEnlargement(maxSize == null)
    .resize(maxSize, maxSize, {
      fit: sharp.fit.inside,
      withoutEnlargement: true,
    })
    .jpeg({ mozjpeg: true })
    .withMetadata()
    .toBuffer()
    .then((rsBuffer) =>
    {
      s3Params.Body = rsBuffer;
      return S3.putObject(s3Params).promise();
    })
    .then((info) => console.log('success! file info', info))
    .catch((err) => console.error('error in resizing', err));
}
