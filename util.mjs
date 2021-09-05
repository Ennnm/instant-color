/* eslint-disable prefer-destructuring */
import jssha from 'jssha';
import dotenv from 'dotenv';

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

export const dummy = () => {};
