// Minimal dependency-free ZIP writer. Entries are rooted at `dir` and use Linux-friendly '/' separators.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

export function filesOf(dir) {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(file => statSync(path.join(dir, file)).isFile())
    .map(file => file.replace(/\\/g, '/'))
    .sort();
}

/** Zip the contents of `dir` (not the directory itself) into `outFile`. */
export function zipFolder(dir, outFile) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of filesOf(dir)) {
    const data = readFileSync(path.join(dir, name));
    const packed = deflateRawSync(data, { level: 9 });
    const stored = packed.length >= data.length;
    const body = stored ? data : packed;
    const nameBuffer = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    local.copy(central, 6, 4, 30);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuffer, body);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + body.length;
  }
  const end = Buffer.alloc(22);
  const entries = centrals.length / 2;
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries, 8);
  end.writeUInt16LE(entries, 10);
  end.writeUInt32LE(centrals.reduce((sum, value) => sum + value.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(outFile, Buffer.concat([...locals, ...centrals, end]));
  return entries;
}
