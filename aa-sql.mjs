/* eslint-disable max-len */
/* eslint-disable import/prefer-default-export */
import ColorThief from 'colorthief';
// import convert from 'color-convert';
import { colord, extend } from 'colord';
import harmonies from 'colord/plugins/harmonies';
import lchPlugin from 'colord/plugins/lch';

extend([harmonies, lchPlugin]);

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

const repeatArr = (arr, length) => {
  const newArr = [...arr];
  if (arr.length > length)
  {
    return arr.splice(0, length);
  }
  for (let i = 0; i < length - arr.length; i += 1)
  {
    const index = i % arr.length;
    const arrColor = arr[index];
    const color = {
      h: arrColor.h,
      s: arrColor.s + 10 * (i + 1),
      l: arrColor.l + 10 * (i + 1),
    };
    newArr.push(color);
  }
  return newArr;
};

const matchSatLight = (refColors, modColors, weight) => {
  if (refColors.length !== modColors.length)
  {
    console.error('Color arrays are not the of the same length');
    return modColors;
  }
  const newColors = [];
  for (let i = 0; i < modColors.length; i += 1)
  {
    const newColor = {
      h: modColors[i].h,
      s: modColors[i].s * (1 - weight) + refColors[i].s * weight,
      l: modColors[i].l * (1 - weight) + refColors[i].l * weight,
    };
    newColors.push(newColor);
  }
  return newColors;
};

const tuneHarmonies = (type, num, refHsl, refHslColors, satLightWeight) =>
{
  const brightestColor = colord(refHsl);

  let harmonicSet = brightestColor.harmonies(type).map((col) => col.toHsl());
  harmonicSet = repeatArr(harmonicSet, num);
  harmonicSet = matchSatLight(refHslColors, harmonicSet, satLightWeight);
  return harmonicSet;
};

export async function insertColors(pool, imageId, filepath, num)
{
  const colors = await ColorThief.getPalette(filepath, num * 2);
  let hslColors = colors.map((c) => colord(`rgb(${c.join()})`).toHsl());
  hslColors = hslColors.filter((c) => c.l > 20 && c.l < 90).slice(0, 5);
  const hexColors = hslColors.map((c) => colord(c).toHex());
  // assume brightest color s: near 100, l: near 50, smallest deviation
  const sampleSize = 3;
  const deviationFromPurity = hslColors.slice(0, num).map((hsl) => (100 - hsl.s) + (Math.abs(hsl.l - 50)));

  const indexOfBrightest = deviationFromPurity.indexOf(Math.min(...deviationFromPurity));

  const satLightWeight = 0.7;

  let pureHues = hslColors.map((hsl) => ({ h: hsl.h, s: 100, l: 50 }));
  let analogous = tuneHarmonies('analogous', 5, hslColors[indexOfBrightest], hslColors, satLightWeight);
  let complementary = tuneHarmonies('complementary', 5, hslColors[indexOfBrightest], hslColors, satLightWeight);
  let dblSplitComplement = tuneHarmonies('double-split-complementary', 5, hslColors[indexOfBrightest], hslColors, satLightWeight);
  let rectangle = tuneHarmonies('rectangle', 5, hslColors[indexOfBrightest], hslColors, satLightWeight);
  let splitComplementary = tuneHarmonies('split-complementary', 5, hslColors[indexOfBrightest], hslColors, satLightWeight);
  let tetradic = tuneHarmonies('tetradic', 5, hslColors[indexOfBrightest], hslColors, satLightWeight);
  let triadic = tuneHarmonies('triadic', 5, hslColors[indexOfBrightest], hslColors, satLightWeight);

  pureHues = pureHues.map((c) => colord(c).toHex());
  analogous = analogous.map((c) => colord(c).toHex());
  complementary = complementary.map((c) => colord(c).toHex());
  dblSplitComplement = dblSplitComplement.map((c) => colord(c).toHex());
  rectangle = rectangle.map((c) => colord(c).toHex());
  splitComplementary = splitComplementary.map((c) => colord(c).toHex());
  triadic = triadic.map((c) => colord(c).toHex());
  tetradic = tetradic.map((c) => colord(c).toHex());

  console.log('hsl', hslColors);
  const palettes = {
    base: hexColors,
    pureHues,
    analogous,
    complementary,
    dblSplitComplement,
    rectangle,
    splitComplementary,
    tetradic,
    triadic,
  };
  // return colors;
  return palettes;
}

export async function processImage(pool, filename, category, user)
{
  const imageId = await insertImage(pool, filename, category, user);
  // extract color
  const filePath = imgFilePath(filename);
  // const colors = await ColorThief.getPalette(filePath, 5);
  const colors = await insertColors(pool, imageId, filePath, 5);

  return { imageSrc: filename, colors };
}
