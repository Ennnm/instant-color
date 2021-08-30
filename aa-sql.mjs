/* eslint-disable no-restricted-syntax */
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
      // s: arrColor.s + 5 * i,
      // l: arrColor.l - 5 * i,
      s: arrColor.s,
      l: arrColor.l,
    };
    newArr.push(color);
  }
  return newArr;
};

const shiftArr = (arr, num) => {
  const newArr = [];
  const numShift = arr.length - num;
  for (let i = 0; i < arr.length; i += 1)
  {
    const index = (i + numShift) % arr.length;
    newArr.push(arr[index]);
  }

  return newArr;
};

const sortHues = (colArr) => colArr.sort((a, b) => a.h - b.h);

const arrangeArray = (arr, centerColor) => {
  let newArray = sortHues(arr);
  const centerColIdx = newArray.findIndex((c) => (c.h === centerColor.h && c.s === centerColor.s && c.l === centerColor.l));
  newArray = shiftArr(newArray, -centerColIdx);

  return newArray;
};

const adjustSatLight = (refColors, modColors, weight) => {
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

  let harmonicSet;

  if (type === 'analogous')
  {
    harmonicSet = [];
    const hueIntervals = [0, 30, 60, 300, 330];
    hueIntervals.forEach((inv, index) => {
      harmonicSet.push({
        ...refHsl,
        h: refHsl.h + inv,
      });
    });
  }
  else {
    harmonicSet = brightestColor.harmonies(type).map((col) => col.toHsl());
  }

  harmonicSet = repeatArr(harmonicSet, num);
  harmonicSet = arrangeArray(harmonicSet, refHsl);
  harmonicSet = adjustSatLight(refHslColors, harmonicSet, satLightWeight);
  return harmonicSet;
};
const calcDiffFrHarmony = (refHueDiffs, harmonyInvs) =>
{
  const differences = [];
  for (let i = 0; i < refHueDiffs.length; i += 1)
  {
    const refHueDiff = refHueDiffs[i];

    const diffFromRef = harmonyInvs.map((harmony) => {
      let hueDiff = Math.abs(refHueDiff - harmony);

      if (hueDiff > 180)
      {
        hueDiff = 360 - hueDiff;
      }
      console.log('refHueDiff - harmony = hueDiff', refHueDiff, harmony, hueDiff);
      return hueDiff;
    });
    console.log('diffFromRef', diffFromRef);

    differences.push(Math.min(...diffFromRef));
  }
  console.log('differences', differences);
  const sumDiff = differences.reduce((a, b) => a + b, 0);
  console.log('sumDiff', sumDiff);
  return sumDiff;
};
const calcClosestHarmony = (refHsl) => {
  // for colorarrays that have been sorted
  const colorDiffs = refHsl.map((col) => {
    let hueDiff = Math.abs(col.h - refHsl[0].h);
    hueDiff = hueDiff > 180 ? 360 - hueDiff : hueDiff;

    return hueDiff;
  });
  const harmonyIntervals = {
    analogous: [0, 30, 60, 300, 330],
    complementary: [0, 180],
    dblSplitComplement: [0, 30, 150, 210, 330],
    splitComplementary: [0, 150, 210],
    rectangle: [0, 60, 180, 240],
    tetradic: [0, 90, 180, 270],
    triadic: [0, 120, 240],
  };
  // calculate differences
  const harmonyDiffs = [];
  for (const [key, value] of Object.entries(harmonyIntervals)) {
    harmonyDiffs.push({
      harmony: key,
      value: calcDiffFrHarmony(colorDiffs, value),
    });
  }
  return harmonyDiffs.sort((a, b) => a.value - b.value);
};
export async function getColorTemplates(pool, imageId, filepath, num)
{
  const colors = await ColorThief.getPalette(filepath, num * 2);
  let hslColors = colors.map((c) => colord(`rgb(${c.join()})`).toHsl());
  hslColors = hslColors.filter((c) => c.l > 30 && c.l < 90).slice(0, num);
  hslColors = sortHues(hslColors);
  // assume brightest color s: near 100, l: near 50, smallest deviation
  const deviationFromPurity = hslColors.map((hsl) => (100 - hsl.s) + (Math.abs(hsl.l - 50)));
  const indexOfBrightest = deviationFromPurity.indexOf(Math.min(...deviationFromPurity));

  hslColors = shiftArr(hslColors, -indexOfBrightest);
  const brightestHsl = hslColors[0];
  const satLightWeight = 1;

  const pureHues = hslColors.map((hsl) => ({ h: hsl.h, s: 100, l: 50 }));
  const analogous = tuneHarmonies('analogous', 5, brightestHsl, hslColors, satLightWeight);
  const complementary = tuneHarmonies('complementary', 5, brightestHsl, hslColors, satLightWeight);
  const dblSplitComplement = tuneHarmonies('double-split-complementary', 5, brightestHsl, hslColors, satLightWeight);
  const rectangle = tuneHarmonies('rectangle', 5, brightestHsl, hslColors, satLightWeight);
  const splitComplementary = tuneHarmonies('split-complementary', 5, brightestHsl, hslColors, satLightWeight);
  const tetradic = tuneHarmonies('tetradic', 5, brightestHsl, hslColors, satLightWeight);
  const triadic = tuneHarmonies('triadic', 5, brightestHsl, hslColors, satLightWeight);

  // console.log('color diffs', calcClosestHarmony(hslColors));

  console.log('hsl', hslColors);
  const palettes = {
    base: hslColors,
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

const convertToHex = (palettes) => {
  const hexPalette = {};
  for (const [harmony, col] of Object.entries(palettes)) {
    hexPalette[harmony] = col.map((c) => colord(c).toHex());
  }
  return hexPalette;
};

export async function processImage(pool, filename, category, user)
{
  const imageId = await insertImage(pool, filename, category, user);
  // extract color
  const filePath = imgFilePath(filename);
  // const colors = await ColorThief.getPalette(filePath, 5);
  const hslColors = await getColorTemplates(pool, imageId, filePath, 5);
  // console.log('color diffs', calcClosestHarmony(hslColors));
  const colors = convertToHex(hslColors);

  return { imageSrc: filename, colors };
}
