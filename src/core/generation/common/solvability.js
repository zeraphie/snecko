// solvability.js — BFS reachability check for board generation

/**
 * Returns true if the target cell is reachable from the start via BFS,
 * treating wall cells as impassable. Wraps at board edges.
 *
 * @param {import('../../board/index.js').Board} board
 * @param {number} startX
 * @param {number} startY
 * @param {number} targetX
 * @param {number} targetY
 * @returns {boolean}
 * @complexity O(w*h)
 */
export function bfsReachable(board, startX, startY, targetX, targetY) {
  const w = board.width;
  const h = board.height;
  const visited = new Uint8Array(w * h);

  const queue = [startX + startY * w];
  visited[startY * w + startX] = 1;

  const target = targetX + targetY * w;

  while (queue.length > 0) {
    const pos = queue.shift();
    if (pos === target) {
      return true;
    }

    const x = pos % w;
    const y = (pos / w) | 0;

    const neighbors = [
      [x + 1 >= w ? 0 : x + 1, y],
      [x - 1 < 0 ? w - 1 : x - 1, y],
      [x, y + 1 >= h ? 0 : y + 1],
      [x, y - 1 < 0 ? h - 1 : y - 1],
    ];

    for (let i = 0; i < 4; i++) {
      const nx = neighbors[i][0];
      const ny = neighbors[i][1];
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      if (board.isWallCell(nx, ny)) continue;
      visited[ni] = 1;
      queue.push(ni);
    }
  }

  return false;
}
