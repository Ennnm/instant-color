import express from 'express';
import cookieParser from 'cookie-parser';
import methodOverride from 'method-override';

import bindRoutes from './routes.mjs';
import { getHash } from './util.mjs';
// Initialise Express instance
const app = express();
// Set the Express view engine to expect EJS templates
app.set('view engine', 'ejs');
// Bind cookie parser middleware to parse cookies in requests
app.use(cookieParser());
// Bind Express middleware to parse request bodies for POST requests
app.use(express.urlencoded({ extended: false }));
// Bind method override middleware to parse PUT and DELETE requests sent as POST requests
app.use(methodOverride('_method'));
// Expose the files stored in the public folder
app.use(express.static('public'));
app.use(express.static('uploads'));
app.use(express.static('resource'));

app.use((request, response, next) => {
  request.isUserLoggedIn = false;

  if (request.cookies.loggedIn && request.cookies.userId) {
    const hash = getHash(request.cookies.userId);

    if (request.cookies.loggedIn === hash) {
      request.isUserLoggedIn = true;
    }
  }
  next();
});
// Bind route definitions to the Express application
bindRoutes(app);

// Set Express to listen on the given port
const PORT = process.env.PORT || 3004;

app.listen(PORT);

console.log('in index.mjs PORT:', PORT);
