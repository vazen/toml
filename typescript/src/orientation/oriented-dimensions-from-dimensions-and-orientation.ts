import { Match, Record, Schema as S, SchemaGetter } from 'effect';

import { Orientation } from './orientation';

const DimensionsAndOrientation = S.Struct({
  orientation: Orientation,
  width: S.Number,
  height: S.Number,
  depth: S.Number,
});

/**
 * The space a cuboid takes up in its orientation, from its own width, height
 * and depth. Each side moves to the axis it lies along as the shopper sees it,
 * and encoding moves it back.
 */
export const OrientedDimensionsFromDimensionsAndOrientation =
  DimensionsAndOrientation.pipe(
    S.decodeTo(DimensionsAndOrientation, {
      decode: SchemaGetter.transform(({ orientation, ...dimensions }) => ({
        orientation,
        ...Record.map(sidesAlongAxes(orientation), (side) => dimensions[side]),
      })),
      encode: SchemaGetter.transform(({ orientation, ...oriented }) => ({
        orientation,
        ...Record.mapKeys(
          oriented,
          (axis) => sidesAlongAxes(orientation)[axis],
        ),
      })),
    }),
  );

type Side = 'width' | 'height' | 'depth';

// The side of the cuboid that lies along the width, the height and the depth
// as the shopper sees it.
const sidesAlongAxes = (orientation: Orientation) =>
  Match.value(orientation).pipe(
    Match.withReturnType<Readonly<Record<Side, Side>>>(),
    Match.whenOr('F', 'Fu', 'B', 'Bu', () => ({
      width: 'width',
      height: 'height',
      depth: 'depth',
    })),
    // On its side, so width and height swap.
    Match.whenOr('Fl', 'Fr', 'Bl', 'Br', () => ({
      width: 'height',
      height: 'width',
      depth: 'depth',
    })),
    // A side faces the shopper, so width and depth swap.
    Match.whenOr('L', 'Lu', 'R', 'Ru', () => ({
      width: 'depth',
      height: 'height',
      depth: 'width',
    })),
    Match.whenOr('Ll', 'Lr', 'Rl', 'Rr', () => ({
      width: 'height',
      height: 'depth',
      depth: 'width',
    })),
    // Lying flat, so height and depth swap.
    Match.whenOr('U', 'Uu', 'D', 'Du', () => ({
      width: 'width',
      height: 'depth',
      depth: 'height',
    })),
    Match.whenOr('Ul', 'Ur', 'Dl', 'Dr', () => ({
      width: 'depth',
      height: 'width',
      depth: 'height',
    })),
    Match.exhaustive,
  );
