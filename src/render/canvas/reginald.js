// reginald.js — Sir Reginald Caw sprite + speech bubble painter.
//
// The Reginald panel is a single canvas the same width as the game
// canvas (620 px). The sprite is centred horizontally; the beak points
// LEFT (source-art orientation), so bubbles live to the sprite's LEFT
// with a tail pointing right at the beak. The beak is located by
// scanning the frame for the leftmost `O` (outline) pixel — that
// convention is documented in the .animation file so future frames
// only need to keep the beak as the leftmost O for the tail to track
// it automatically. Living inside one canvas means appearing/
// disappearing bubbles never reflow the surrounding layout.

const BUBBLE_PADDING_X = 14;
const BUBBLE_PADDING_TOP = 16;
const BUBBLE_PADDING_BOTTOM = 16;
const BUBBLE_BORDER_RADIUS = 8;
const BUBBLE_LINE_HEIGHT = 18;
const BUBBLE_FONT = '14px "Cascadia Code", "Fira Code", Menlo, monospace';
const BUBBLE_FILL = "#16162a";
const BUBBLE_BORDER = "#cbdbfc";
const BUBBLE_BORDER_WIDTH = 2;
const BUBBLE_TAIL_HALF_HEIGHT = 10;
const BUBBLE_MAX_LINES = 3;

const CATEGORY_COLORS = {
  death: "#ffd866",
  pity: "#ffa940",
  idle: "#cbdbfc",
};

/**
 * Paints Reginald's sprite, horizontally centred on the canvas in its
 * source orientation, and returns the beak position (leftmost outline
 * pixel) so the bubble's tail can anchor to it.
 *
 * The speaking-bob is a CSS animation on the panel element itself
 * (`.reginald-panel.excited` in index.html — the same one the snecko
 * logo uses on food-eaten). This function stays pose-only.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ palette: Record<string, string>|null, frames: Record<string, { width: number, height: number, rows: string[] }> }} animData
 * @param {string} frameName — e.g. "idle".
 * @param {number} pixelSize — px per source pixel.
 * @returns {{ spriteX: number, spriteY: number, spriteW: number, spriteH: number, tailX: number, tailY: number }}
 *   Sprite bounds + the point the bubble's tail should aim at (the tip
 *   of the beak — leftmost `O` pixel in the frame).
 */
export function paintReginald(ctx, animData, frameName, pixelSize) {
  const canvas = ctx.canvas;
  const fallback = {
    spriteX: 0,
    spriteY: 0,
    spriteW: 0,
    spriteH: 0,
    tailX: 0,
    tailY: 0,
  };
  if (!animData) {
    return fallback;
  }
  const frame = animData.frames[frameName] ?? animData.frames.idle;
  if (!frame) {
    return fallback;
  }
  const palette = animData.palette ?? {};
  const spriteW = frame.width * pixelSize;
  const spriteH = frame.height * pixelSize;
  const spriteX = Math.floor((canvas.width - spriteW) / 2);
  const spriteY = Math.floor((canvas.height - spriteH) / 2);
  // Track the beak position while painting: leftmost `O` (outline)
  // pixel wins. Sprite art's convention — knife handle (T) / blade (S)
  // sit further left than the beak, so filtering to `O` skips those
  // and lands on the beak tip.
  let beakCol = -1;
  let beakRow = -1;
  for (let py = 0; py < frame.height; py++) {
    const row = frame.rows[py];
    for (let px = 0; px < frame.width; px++) {
      const ch = row[px];
      const color = palette[ch];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(spriteX + px * pixelSize, spriteY + py * pixelSize, pixelSize, pixelSize);
      }
      if (ch === "O" && (beakCol === -1 || px < beakCol)) {
        beakCol = px;
        beakRow = py;
      }
    }
  }
  if (beakCol === -1) {
    // No outline pixel found (empty / malformed frame) — fall back to
    // the sprite's left-mid edge so the tail geometry doesn't crash.
    beakCol = 0;
    beakRow = Math.floor(frame.height / 2);
  }
  return {
    spriteX,
    spriteY,
    spriteW,
    spriteH,
    // Point at the left edge of the leftmost `O` pixel, centred vertically
    // inside that pixel — that's the tip of the beak.
    tailX: spriteX + beakCol * pixelSize,
    tailY: spriteY + beakRow * pixelSize + Math.floor(pixelSize / 2),
  };
}

/**
 * Paints the speech bubble (rounded rect + tail) on the panel canvas,
 * to the LEFT of the sprite. The tail attaches to the bubble's right
 * edge and points at the beak.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ text: string, category: string }} line
 * @param {{ tailX: number, tailY: number, spriteX: number, spriteW: number }} sprite
 */
export function paintReginaldBubble(ctx, line, sprite) {
  if (!line) {
    return;
  }
  // Gap between the bubble's right edge and the beak so the tail has room.
  const tailLength = 18;
  const bubbleLeft = 10;
  const bubbleRight = sprite.tailX - tailLength;
  const bubbleTop = 8;
  const bubbleBottom = ctx.canvas.height - 8;
  if (bubbleRight - bubbleLeft < 60) {
    // Not enough room — bail rather than draw something hideous.
    return;
  }
  const innerWidth = bubbleRight - bubbleLeft - BUBBLE_PADDING_X * 2;

  ctx.save();
  ctx.font = BUBBLE_FONT;
  ctx.textBaseline = "alphabetic";
  const lines = wrapText(ctx, line.text, innerWidth);
  const truncated = lines.length > BUBBLE_MAX_LINES;
  const visibleLines = truncated ? lines.slice(0, BUBBLE_MAX_LINES) : lines;
  if (truncated) {
    visibleLines[BUBBLE_MAX_LINES - 1] = ellipsize(
      ctx,
      visibleLines[BUBBLE_MAX_LINES - 1],
      innerWidth
    );
  }

  const textHeight =
    BUBBLE_PADDING_TOP + visibleLines.length * BUBBLE_LINE_HEIGHT + BUBBLE_PADDING_BOTTOM;
  const desiredHeight = Math.min(textHeight, bubbleBottom - bubbleTop);
  // Centre the bubble vertically on the tail target so the tail comes
  // out horizontally rather than at a steep angle.
  let bubbleY1 = sprite.tailY - desiredHeight / 2;
  let bubbleY2 = bubbleY1 + desiredHeight;
  if (bubbleY1 < bubbleTop) {
    bubbleY1 = bubbleTop;
    bubbleY2 = bubbleY1 + desiredHeight;
  }
  if (bubbleY2 > bubbleBottom) {
    bubbleY2 = bubbleBottom;
    bubbleY1 = bubbleY2 - desiredHeight;
  }

  // Tail attaches at the target Y level, clamped to the bubble interior.
  const tailY = Math.max(
    bubbleY1 + BUBBLE_BORDER_RADIUS + BUBBLE_TAIL_HALF_HEIGHT,
    Math.min(sprite.tailY, bubbleY2 - BUBBLE_BORDER_RADIUS - BUBBLE_TAIL_HALF_HEIGHT)
  );

  tracedBubblePath(ctx, bubbleLeft, bubbleY1, bubbleRight, bubbleY2, sprite.tailX, tailY);
  ctx.fillStyle = BUBBLE_FILL;
  ctx.fill();
  ctx.strokeStyle = CATEGORY_COLORS[line.category] ?? BUBBLE_BORDER;
  ctx.lineWidth = BUBBLE_BORDER_WIDTH;
  ctx.stroke();

  ctx.fillStyle = CATEGORY_COLORS[line.category] ?? BUBBLE_BORDER;
  const textX = bubbleLeft + BUBBLE_PADDING_X;
  let textY = bubbleY1 + BUBBLE_PADDING_TOP + BUBBLE_LINE_HEIGHT - 4;
  for (const text of visibleLines) {
    ctx.fillText(text, textX, textY);
    textY += BUBBLE_LINE_HEIGHT;
  }
  ctx.restore();
}

/**
 * Traces a rounded-rect speech bubble with a triangular tail jutting
 * out of the RIGHT edge toward (tailX, tailY).
 */
function tracedBubblePath(ctx, x1, y1, x2, y2, tailX, tailY) {
  const r = BUBBLE_BORDER_RADIUS;
  const tailTop = tailY - BUBBLE_TAIL_HALF_HEIGHT;
  const tailBottom = tailY + BUBBLE_TAIL_HALF_HEIGHT;
  ctx.beginPath();
  ctx.moveTo(x1 + r, y1);
  ctx.lineTo(x2 - r, y1);
  ctx.quadraticCurveTo(x2, y1, x2, y1 + r);
  ctx.lineTo(x2, tailTop);
  ctx.lineTo(tailX, tailY);
  ctx.lineTo(x2, tailBottom);
  ctx.lineTo(x2, y2 - r);
  ctx.quadraticCurveTo(x2, y2, x2 - r, y2);
  ctx.lineTo(x1 + r, y2);
  ctx.quadraticCurveTo(x1, y2, x1, y2 - r);
  ctx.lineTo(x1, y1 + r);
  ctx.quadraticCurveTo(x1, y1, x1 + r, y1);
  ctx.closePath();
}

/** Word-wraps `text` so each rendered line fits within `maxWidth` px. */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const out = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        out.push(current);
      }
      current = word;
    }
  }
  if (current) {
    out.push(current);
  }
  return out.length > 0 ? out : [""];
}

/**
 * Trims `text` to fit `maxWidth`, appending `…` if anything was cut.
 * Used as the final-line tail when the bubble overflows the max-line
 * cap.
 */
function ellipsize(ctx, text, maxWidth) {
  const suffix = "…";
  if (ctx.measureText(text + suffix).width <= maxWidth) {
    return text;
  }
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (ctx.measureText(text.slice(0, mid) + suffix).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + suffix;
}
