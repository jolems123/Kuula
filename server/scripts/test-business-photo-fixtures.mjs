import { deflateSync } from "node:zlib";
export function testPng(red, green, blue) {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let bit = 0; bit < 8; bit++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  const chunk = (name, data) => {
    const type = Buffer.from(name, "ascii");
    const crcData = Buffer.concat([type, data]);
    let crc = 0xffffffff;
    for (const byte of crcData) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const header = Buffer.alloc(4), end = Buffer.alloc(4);
    header.writeUInt32BE(data.length); end.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, crcData, end]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const image = Buffer.concat([signature, chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from([0, red, green, blue]))),
    chunk("IEND", Buffer.alloc(0))]);
  return "data:image/png;base64," + image.toString("base64");
}
