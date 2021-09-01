import ColorThief from 'colorthief';
import { resolve } from 'path';
import fs from 'fs';
import fetch from 'node-fetch';

const url = 'https://images.unsplash.com/photo-1630082900894-edbd503588f7?ixid=MnwxMjA3fDB8MHxlZGl0b3JpYWwtZmVlZHw3fHx8ZW58MHx8fHw%3D&ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60';

const imgFilePath = (filename) => `./uploads/${filename}.jpg`;

const filePath = imgFilePath('mountains2');

export async function downloadImg(url, filepath) {
  const response = await fetch(url);
  const buffer = await response.buffer();
  fs.writeFile(filepath, buffer, () => console.log('finish downloading'));
  // console.log(fs.statSync(filepath).size);
}

// downloadImg(url, filePath);
