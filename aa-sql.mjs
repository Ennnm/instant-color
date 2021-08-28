/* eslint-disable import/prefer-default-export */
import ColorThief from 'colorthief';
import convert from 'color-convert';

export const rgbToHex = (r, g, b) => `${[r, g, b].map((x) => {
  const hex = x.toString(16);
  return hex.length === 1 ? `0${hex}` : hex;
}).join('')}`;

export function imgFilePath(filename) { return `./uploads/${filename}`; }
export async function insertImage(pool, filename, category = '', username = '')
{ // find user id from username
  let userId = 0;
  if (username)
  {
    const { rows } = await pool.query('SELECT id FROM users WHERE username = $1',
      [username]);
    userId = rows[0].id;
  }
  const { rows } = await pool.query('INSERT INTO images (users_id, path) VALUES ($1, $2) RETURNING id',
    [userId, filename]);
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
  return imageId;
}

export async function insertColors(pool, imageId, filepath, num)
{
  const colors = await ColorThief.getPalette(filepath, num);
  // const hexColors = colors.map((rgb) => rgbToHex(...rgb));
  const hexColors = colors.map((rgb) => convert.rgb.hex(...rgb));
  const hslColors = colors.map((rgb) => convert.rgb.hsl(...rgb));

  console.log('hex', hexColors);
  console.log('hsl', hslColors);
  return colors;
}

export async function processImage(pool, filename, category, user)
{
  const imageId = await insertImage(pool, filename, category, user);
  // extract color
  const filePath = imgFilePath(filename);
  // const colors = await ColorThief.getPalette(filePath, 5);
  const colors = await insertColors(pool, imageId, filePath, 10);
  return { imageSrc: filename, colors };
}
