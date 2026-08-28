import assert from "node:assert/strict";
import fs from "node:fs/promises";

const source = await fs.readFile(new URL("../app/local-exif.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { canInspectLocally, inspectLocally, cleanLocally } = await import(moduleUrl);

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function chunk(type, data = Buffer.alloc(0)) {
  return Buffer.concat([
    u32(data.length),
    Buffer.from(type, "ascii"),
    data,
    Buffer.alloc(4),
  ]);
}

function buildPng() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const text = Buffer.from("Author\0Byte Test", "latin1");
  const itxt = Buffer.concat([
    Buffer.from("Location\0", "latin1"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("North Idaho", "utf8"),
  ]);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("tEXt", text),
    chunk("iTXt", itxt),
    chunk("IDAT"),
    chunk("IEND"),
  ]);
}

const bytes = buildPng();
const file = {
  name: "privacy-test.png",
  type: "image/png",
  size: bytes.length,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
};

assert.equal(canInspectLocally(file), true, "PNG must stay on the local path");

const result = await inspectLocally(file);
assert.equal(result.processingMode, "local");
assert.equal(result.summary.fileType, "PNG");
assert.equal(result.summary.width, 1);
assert.equal(result.summary.height, 1);
assert.equal(result.privacy.risk, "high");
assert.equal(result.privacy.findings.some((item) => item.key === "Author"), true);
assert.equal(result.privacy.findings.some((item) => item.key === "Location"), true);

const cleaned = Buffer.from(await (await cleanLocally(file, "privacy")).arrayBuffer());
assert.equal(cleaned.includes(Buffer.from("Byte Test")), false);
assert.equal(cleaned.includes(Buffer.from("North Idaho")), false);
assert.equal(cleaned.includes(Buffer.from("IHDR")), true);
assert.equal(cleaned.includes(Buffer.from("IDAT")), true);
assert.equal(cleaned.includes(Buffer.from("IEND")), true);

console.log("local metadata tests passed");
