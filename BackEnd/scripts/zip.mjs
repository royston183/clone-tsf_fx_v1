// A minimal zip writer on Node's own zlib (deflate + crc32): no zip library, and entry names always use '/' (the
// Function App runs on Linux too, where a Windows-made zip with '\' names unpacks wrong).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

/** Every file under `dir`, as paths relative to it with '/', sorted. */
export function filesOf(dir) {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(f => statSync(path.join(dir, f)).isFile())
    .map(f => f.replace(/\\/g, '/'))
    .sort();
}

/** Zips the contents of `dir` (not the folder itself) into `outFile`. */
export function zipFolder(dir, outFile) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of filesOf(dir)) {
    const data = readFileSync(path.join(dir, name));
    const packed = deflateRawSync(data, { level: 9 });
    const stored = packed.length >= data.length;
    const body = stored ? data : packed;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);                    // version needed
    local.writeUInt16LE(0x0800, 6);                // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);        // store or deflate
    local.writeUInt16LE(0, 10);                    // time
    local.writeUInt16LE(0x21, 12);                 // date: 1980-01-01 (reproducible builds)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);              // made by: Unix, so the permissions below apply
    local.copy(central, 6, 4, 30);                 // version needed … name length
    central.writeUInt16LE(0, 30);                  // extra
    central.writeUInt16LE(0, 32);                  // comment
    central.writeUInt16LE(0, 34);                  // disk
    central.writeUInt16LE(0, 36);                  // internal attributes
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(outFile, Buffer.concat([...locals, ...centrals, end]));
  return centrals.length / 2;
}
