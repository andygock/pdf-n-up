export interface RulerPoint {
  x: number;
  y: number;
}

export function rulerTicks(
  length: number,
  origin: number,
  displayLength: number,
) {
  const mmPerPoint = 25.4 / 72;
  const minimumStep = (length * mmPerPoint * 60) / displayLength;
  const magnitude = 10 ** Math.floor(Math.log10(minimumStep));
  const majorStep =
    ([1, 2, 5, 10].find((step) => step * magnitude >= minimumStep) ?? 10) *
    magnitude;
  const step = majorStep / 5;
  const first = Math.ceil((-origin * mmPerPoint) / step);
  const last = Math.floor(((length - origin) * mmPerPoint) / step);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => {
    const index = first + offset;
    return {
      position: origin + (index * step) / mmPerPoint,
      value: Number((index * step).toPrecision(10)),
      major: index % 5 === 0,
    };
  });
}

export function rulerPoint(
  client: RulerPoint,
  bounds: { left: number; top: number; width: number; height: number },
  page: { width: number; height: number },
  origin?: RulerPoint,
): RulerPoint {
  let x = ((client.x - bounds.left) / bounds.width) * page.width;
  let y = ((client.y - bounds.top) / bounds.height) * page.height;
  if (origin) {
    const dx = x - origin.x;
    const dy = y - origin.y;
    const angle =
      Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    const snappedX = Math.cos(angle) * length;
    const snappedY = Math.sin(angle) * length;
    // Shorten the constrained line at the page edge without changing its angle.
    const fraction = Math.min(
      1,
      snappedX > 0
        ? (page.width - origin.x) / snappedX
        : snappedX < 0
          ? -origin.x / snappedX
          : 1,
      snappedY > 0
        ? (page.height - origin.y) / snappedY
        : snappedY < 0
          ? -origin.y / snappedY
          : 1,
    );
    x = origin.x + snappedX * fraction;
    y = origin.y + snappedY * fraction;
  }
  return {
    x: Math.max(0, Math.min(page.width, x)),
    y: Math.max(0, Math.min(page.height, y)),
  };
}

export function rulerMeasurement(start: RulerPoint, end: RulerPoint) {
  const dx = ((end.x - start.x) * 25.4) / 72;
  const dy = ((end.y - start.y) * 25.4) / 72;
  return {
    distance: Math.hypot(dx, dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  };
}
