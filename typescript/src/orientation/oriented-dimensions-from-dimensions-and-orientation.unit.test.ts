import { Schema as S } from 'effect';
import { expect, it } from 'vitest';

import { Orientation } from './orientation';
import { OrientedDimensionsFromDimensionsAndOrientation } from './oriented-dimensions-from-dimensions-and-orientation';

const decode = S.decodeSync(OrientedDimensionsFromDimensionsAndOrientation);
const encode = S.encodeSync(OrientedDimensionsFromDimensionsAndOrientation);

// The six ways a cuboid's dimensions lie along x, y and z, as the
// specification's orientation table gives them.
it.each<
  Readonly<{
    orientations: ReadonlyArray<Orientation>;
    width: number;
    height: number;
    depth: number;
  }>
>([
  { orientations: ['F', 'Fu', 'B', 'Bu'], width: 1, height: 2, depth: 3 },
  { orientations: ['Fl', 'Fr', 'Bl', 'Br'], width: 2, height: 1, depth: 3 },
  { orientations: ['L', 'Lu', 'R', 'Ru'], width: 3, height: 2, depth: 1 },
  { orientations: ['Ll', 'Lr', 'Rl', 'Rr'], width: 2, height: 3, depth: 1 },
  { orientations: ['U', 'Uu', 'D', 'Du'], width: 1, height: 3, depth: 2 },
  { orientations: ['Ul', 'Ur', 'Dl', 'Dr'], width: 3, height: 1, depth: 2 },
])(
  'turns a 1 × 2 × 3 cuboid to $width × $height × $depth for $orientations',
  ({ orientations, ...expected }) => {
    for (const orientation of orientations) {
      expect(decode({ orientation, width: 1, height: 2, depth: 3 })).toEqual({
        orientation,
        ...expected,
      });
    }
  },
);

it.each(Orientation.literals)('turns a cuboid back from %s', (orientation) => {
  const cuboid = { orientation, width: 1, height: 2, depth: 3 };

  expect(encode(decode(cuboid))).toEqual(cuboid);
});
