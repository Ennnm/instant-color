import ColorThief from 'colorthief';
import { resolve } from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import sharp from 'sharp';

const url = 'https://images.unsplash.com/photo-1630082900894-edbd503588f7?ixid=MnwxMjA3fDB8MHxlZGl0b3JpYWwtZmVlZHw3fHx8ZW58MHx8fHw%3D&ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60';

const imgFilePath = (filename) => `./uploads/${filename}.jpg`;

const filePath = imgFilePath('mountains2');

export async function downloadImg(url, filepath) {
  const response = await fetch(url);
  const buffer = await response.buffer();
  return fs.writeFile(filepath, buffer, (err) =>
  {
    if (err) console.error(err);
    else {
      console.log('finish downloading');
    }
  });
}

export async function downloadSmallImg(url, filepath, maxSize) {
  const response = await fetch(url);
  const buffer = await response.buffer();
  return sharp(buffer)
    .resize(maxSize, maxSize, {
      fit: sharp.fit.inside,
      withoutEnlargement: true,
    })
    .withMetadata()
    .toFile(filepath)
    .then((info) => console.log('info in dlSmallImg', info))
    .catch((err) => console.error(err));
}
