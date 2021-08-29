import { colord, extend } from 'colord';
import harmonies from 'colord/plugins/harmonies';
import lchPlugin from 'colord/plugins/lch';

extend([harmonies, lchPlugin]);
// const hexes = [
//   'DADAD0', '1C1E14',
//   '79573A', '8F7455',
//   '8C8578', 'A99681',
//   '646C5C', 'AFAEA3',
//   'B3A68F', '646464'];

// const lchColors = hexes.map((hex) => colord(`#${hex}`).toLch());
// // const lchColors = hexes.map((hex) => console.log(hex););

// console.log(lchColors);

const rgbs = [
  [60, 12, 84],
  [72, 20, 10],
  [28, 35, 35],
  [32, 25, 45],
  [39, 8, 51],
  [32, 19, 58],
  [90, 8, 39],
  [55, 7, 66],
  [38, 19, 63],
  [0, 0, 39],
];

const hexColors = rgbs.map((rgb) => colord(`rgb(${rgb.join()})`).toHex());

console.log(hexColors);
