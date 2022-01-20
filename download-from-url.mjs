import fs from 'fs';
import fetch from 'node-fetch';
import sharp from 'sharp';

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
    .jpeg({ mozjpeg: true })
    .withMetadata()
    .toFile(filepath)
    .then((info) => console.log('info in dlSmallImg', info))
    .catch((err) => console.error('err in downloadSmallImg', err));
}
