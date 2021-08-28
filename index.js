import express from 'express';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import moment from 'moment';
import pg from 'pg';
import jsSHA from 'jssha';
import dotenv from 'dotenv';

import { downloadImg, rgbToHex } from './color-mani.mjs';

let pgConnectionConfigs;
if (process.env.ENV === 'PRODUCTION') {
  // determine how we connect to the remote Postgres server
  pgConnectionConfigs = {
    user: 'postgres',
    // set DB_PASSWORD as an environment variable for security.
    password: process.env.DB_PASSWORD,
    host: 'localhost',
    database: 'birding',
    port: 5432,
  };
} else {
  // determine how we connect to the local Postgres server
  pgConnectionConfigs = {
    user: 'en',
    host: 'localhost',
    database: 'birding',
    port: 5432,
  };
}

const TABLE = 'sightings';

const pool = new Pool(pgConnectionConfigs);

const { SALT } = process.env;

const imgFilePath = (filename) => `./downloads/${filename}.jpg`;

const url = 'https://images.unsplash.com/photo-1630082900894-edbd503588f7?ixid=MnwxMjA3fDB8MHxlZGl0b3JpYWwtZmVlZHw3fHx8ZW58MHx8fHw%3D&ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60';

const imgFp = downloadImg(url, imgFilePath('moduletdest'));
