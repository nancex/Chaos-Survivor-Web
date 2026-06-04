export function createSpatialIndex(cellSize = 128) {
  return { cellSize, cells: new Map(), objects: [] };
}

export function rebuildSpatialIndex(index, objects) {
  index.cells.clear();
  index.objects = objects || [];
  for (const object of index.objects) {
    const key = cellKey(index, object.x || 0, object.y || 0);
    let bucket = index.cells.get(key);
    if (!bucket) {
      bucket = [];
      index.cells.set(key, bucket);
    }
    bucket.push(object);
  }
  return index;
}

export function queryRadius(index, x, y, radius, out = []) {
  out.length = 0;
  const cellSize = index.cellSize || 128;
  const minX = Math.floor((x - radius) / cellSize);
  const maxX = Math.floor((x + radius) / cellSize);
  const minY = Math.floor((y - radius) / cellSize);
  const maxY = Math.floor((y + radius) / cellSize);
  const seen = new Set();
  const radiusSq = radius * radius;
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const bucket = index.cells.get(`${gx},${gy}`);
      if (!bucket) continue;
      for (const object of bucket) {
        if (seen.has(object)) continue;
        const dx = (object.x || 0) - x;
        const dy = (object.y || 0) - y;
        const reach = radius + (object.r || 0);
        if (dx * dx + dy * dy <= Math.max(radiusSq, reach * reach)) {
          seen.add(object);
          out.push(object);
        }
      }
    }
  }
  return out;
}

function cellKey(index, x, y) {
  const cellSize = index.cellSize || 128;
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
}
