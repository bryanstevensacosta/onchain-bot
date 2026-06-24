import { createHash } from 'crypto';

const GRID_SIZE = 8;
const PIXEL_SIZE = 8;
const SVG_SIZE = GRID_SIZE * PIXEL_SIZE;
const HALF_GRID = GRID_SIZE / 2;
const DATA_URI_PREFIX = 'data:image/svg+xml;base64,';

export class IdenticonGenerator {
  public generate(chain: string, address: string): string {
    const hash = this.hashToBytes(chain, address);
    const fgColor = this.pickColor(hash, 0);
    const bgColor = this.pickColor(hash, 3);
    const svg = this.generateSvg(hash, fgColor, bgColor);
    return `${DATA_URI_PREFIX}${Buffer.from(svg, 'utf8').toString('base64')}`;
  }

  private hashToBytes(chain: string, address: string): Buffer {
    return createHash('sha256').update(`${chain}:${address}`).digest();
  }

  private pickColor(hash: Buffer, offset: number): string {
    const r = hash[offset] ?? 0;
    const g = hash[offset + 1] ?? 0;
    const b = hash[offset + 2] ?? 0;
    return `#${this.toHex(r)}${this.toHex(g)}${this.toHex(b)}`;
  }

  private toHex(byte: number): string {
    return byte.toString(16).padStart(2, '0');
  }

  private generateSvg(hash: Buffer, fgColor: string, bgColor: string): string {
    const cells = this.buildCellPattern(hash);
    const rects: string[] = [
      `<rect width="100%" height="100%" fill="${bgColor}"/>`,
    ];
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < HALF_GRID; x += 1) {
        const idx = y * HALF_GRID + x;
        if (!cells[idx]) {
          continue;
        }
        const px = x * PIXEL_SIZE;
        const mirroredPx = (GRID_SIZE - 1 - x) * PIXEL_SIZE;
        const py = y * PIXEL_SIZE;
        rects.push(
          `<rect x="${px}" y="${py}" width="${PIXEL_SIZE}" height="${PIXEL_SIZE}" fill="${fgColor}"/>`,
        );
        rects.push(
          `<rect x="${mirroredPx}" y="${py}" width="${PIXEL_SIZE}" height="${PIXEL_SIZE}" fill="${fgColor}"/>`,
        );
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" width="${SVG_SIZE}" height="${SVG_SIZE}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  }

  private buildCellPattern(hash: Buffer): boolean[] {
    const cells: boolean[] = [];
    for (let i = 0; i < HALF_GRID * GRID_SIZE; i += 1) {
      const byte = hash[6 + Math.floor(i / 8)] ?? 0;
      const bit = (byte >> (i % 8)) & 1;
      cells.push(bit === 1);
    }
    return cells;
  }
}
