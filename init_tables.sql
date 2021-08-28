DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS images CASCADE;
DROP TABLE IF EXISTS harmonies CASCADE;
DROP TABLE IF EXISTS image_categories CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS color_templates CASCADE;
DROP TABLE IF EXISTS base_colors CASCADE;
DROP TABLE IF EXISTS harmony_colors CASCADE;

CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY, 
  username TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS images(
  id SERIAL PRIMARY KEY,
  users_id INTEGER REFERENCES users(id), 
  path TEXT, 
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) ;

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY, 
  category TEXT
);

CREATE TABLE IF NOT EXISTS image_categories(
  id SERIAL PRIMARY KEY, 
  image_id INTEGER REFERENCES images(id),
  category_id INTEGER REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS harmonies(
  id SERIAL PRIMARY KEY, 
  type TEXT
);

CREATE TABLE IF NOT EXISTS color_templates(
  id SERIAL PRIMARY KEY, 
  hex_color1 char(6),
  hex_color2 char(6),
  hex_color3 char(6),
  hex_color4 char(6),
  hex_color5 char(6)
);

CREATE TABLE IF NOT EXISTS base_colors(
  image_id INTEGER REFERENCES images(id),
  closest_harmony INTEGER REFERENCES harmonies(id),
  template_id INTEGER REFERENCES color_templates(id)
);

CREATE TABLE IF NOT EXISTS harmony_colors(
  id SERIAL PRIMARY KEY, 
  image_id INTEGER REFERENCES images(id),
  harmony_id SMALLINT REFERENCES harmonies(id),
  template_id INTEGER REFERENCES color_templates(id)
);