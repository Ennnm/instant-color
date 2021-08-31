/* eslint-disable prefer-destructuring */
import jssha from 'jssha';
import dotenv from 'dotenv';
import { request } from 'express';

const { SALT } = process.env;

export const getHash = (input) => {
  const shaObj = new jssha('SHA-512', 'TEXT', { encoding: 'UTF8' });
  const unhasedString = `${input}-${SALT}`;
  shaObj.update(unhasedString);

  return shaObj.getHash('HEX');
};

export const checkAuth = (pool) => (req, res, next) => {
  req.isUserLoggedIn = false;

  if (req.cookies.loggedIn && req.cookies.userId) {
    const hash = getHash(req.cookies.userId);

    if (req.cookies.loggedIn === hash) {
      request.isUserLoggedIn = true;
    }
  }

  const values = [req.cookies.userId];

  pool.query('SELECT * FROM users id=$1', values, (err, result) => {
    if (err || res.rows.length < 1)
    {
      res.status(503).send('Sorry, you can\'t access this page');
    }
    req.user = result.row[0];
    next();
  });
};

export const dummy = () => {};
