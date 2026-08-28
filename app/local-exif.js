const JPEG_TYPES = new Set(["image/jpeg", "image/jpg"]);

const TAGS = {
  ifd0: {
    0x010f: "Make",
    0x0110: "Model",
    0x0131: "Software",
    0x0132: "DateTime",
    0x8769: "ExifIFDPointer",
    0x8825: "GPSInfoIFDPointer",
  },
  exif: {
    0x829a: "ExposureTime",
    0x829d: "FNumber",
    0x8827: "ISO",
    0x9003: "DateTimeOriginal",
    0x9004: "CreateDate",
    0x920a: "FocalLength",
    0xa002: "ExifImageWidth",
    0xa003: "ExifImageHeight",
    0xa431: "BodySerialNumber",
    0xa434: "LensModel",
    0xa435: "LensSerialNumber",
  },
  gps: {
    0x0001: "GPSLatitudeRef",
    0x0002: "GPSLatitude",
    0x0003: "GPSLongitudeRef",
    0x0004: "GPSLongitude",
    0x0005: "GPSAltitudeRef",
    0x0006: "GPSAltitude",
    0x001d: "GPSDateStamp",
  },
};

const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export function canInspectLocally(file) {
  const name = String(file?.name || "").toLowerCase();
  return JPEG_TYPES.has(file?.type) || name.endsWith(".jpg") || name.endsWith(".jpeg");
}

function textFromBytes(bytes, start, length) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const code = bytes[start + i];
    if (!code) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
}

function findExifTiff(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1 && length >= 8 && textFromBytes(bytes, offset + 4, 6) === "Exif") {
      return offset + 10;
    }
    offset += 2 + length;
  }
  return null;
}

function parser(bytes, tiffStart) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (tiffStart + 8 > bytes.length) throw new Error("Invalid EXIF TIFF header.");
  const order = textFromBytes(bytes, tiffStart, 2);
  const little = order === "II";
  if (!little && order !== "MM") throw new Error("Unsupported EXIF byte order.");
  const u16 = (offset) => view.getUint16(tiffStart + offset, little);
  const u32 = (offset) => view.getUint32(tiffStart + offset, little);
  if (u16(2) !== 42) throw new Error("Invalid EXIF TIFF marker.");

  function scalar(type, absolute) {
    switch (type) {
      case 1:
      case 7: return view.getUint8(absolute);
      case 3: return view.getUint16(absolute, little);
      case 4: return view.getUint32(absolute, little);
      case 9: return view.getInt32(absolute, little);
      default: return null;
    }
  }

  function value(entryOffset, type, count) {
    const size = TYPE_SIZES[type];
    if (!size || count <= 0) return null;
    const byteLength = size * count;
    const valueField = tiffStart + entryOffset + 8;
    const relative = u32(entryOffset + 8);
    const absolute = byteLength <= 4 ? valueField : tiffStart + relative;
    if (absolute < 0 || absolute + byteLength > bytes.length) return null;

    if (type === 2) return textFromBytes(bytes, absolute, count);
    if (type === 5 || type === 10) {
      const values = [];
      for (let i = 0; i < count; i += 1) {
        const pos = absolute + i * 8;
        const numerator = type === 10 ? view.getInt32(pos, little) : view.getUint32(pos, little);
        const denominator = type === 10 ? view.getInt32(pos + 4, little) : view.getUint32(pos + 4, little);
        values.push(denominator ? numerator / denominator : null);
      }
      return count === 1 ? values[0] : values;
    }
    if ([1, 3, 4, 7, 9].includes(type)) {
      const values = [];
      for (let i = 0; i < count; i += 1) values.push(scalar(type, absolute + i * size));
      return count === 1 ? values[0] : values;
    }
    return null;
  }

  function readIfd(relativeOffset, names) {
    if (!relativeOffset || tiffStart + relativeOffset + 2 > bytes.length) return { values: {}, rows: [] };
    const count = u16(relativeOffset);
    const values = {};
    const rows = [];
    for (let i = 0; i < count; i += 1) {
      const entryOffset = relativeOffset + 2 + i * 12;
      if (tiffStart + entryOffset + 12 > bytes.length) break;
      const tag = u16(entryOffset);
      const type = u16(entryOffset + 2);
      const itemCount = u32(entryOffset + 4);
      const parsed = value(entryOffset, type, itemCount);
      const name = names[tag] || `Tag0x${tag.toString(16).padStart(4, "0")}`;
      values[name] = parsed;
      if (parsed !== null && parsed !== "") rows.push({ key: name, tag: name, value: parsed });
    }
    return { values, rows };
  }

  const ifd0 = readIfd(u32(4), TAGS.ifd0);
  const exif = readIfd(ifd0.values.ExifIFDPointer, TAGS.exif);
  const gps = readIfd(ifd0.values.GPSInfoIFDPointer, TAGS.gps);
  return { ifd0, exif, gps };
}

function gpsDecimal(values, ref) {
  if (!Array.isArray(values) || values.length < 3) return null;
  const [degrees, minutes, seconds] = values.map(Number);
  if (![degrees, minutes, seconds].every(Number.isFinite)) return null;
  let result = degrees + minutes / 60 + seconds / 3600;
  if (["S", "W"].includes(String(ref || "").toUpperCase())) result *= -1;
  return Number(result.toFixed(7));
}

async function imageDimensions(file) {
  if (typeof createImageBitmap !== "function") return { width: null, height: null };
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dimensions;
  } catch {
    return { width: null, height: null };
  }
}

function privacy(exif, gps) {
  const findings = [];
  const latitude = gpsDecimal(gps.GPSLatitude, gps.GPSLatitudeRef);
  const longitude = gpsDecimal(gps.GPSLongitude, gps.GPSLongitudeRef);
  if (latitude !== null && longitude !== null) {
    findings.push({
      key: "GPSPosition",
      value: `${latitude}, ${longitude}`,
      severity: "high",
      reason: "Precise capture location",
    });
  }
  for (const [key, reason] of [
    ["BodySerialNumber", "Camera body serial number"],
    ["LensSerialNumber", "Lens serial number"],
  ]) {
    if (exif[key]) findings.push({ key, value: exif[key], severity: "medium", reason });
  }
  const risk = findings.some((item) => item.severity === "high") ? "high" : findings.length ? "medium" : "low";
  return { risk, findings, latitude, longitude };
}

export async function inspectJpegLocally(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const tiffStart = findExifTiff(bytes);
  const dimensions = await imageDimensions(file);
  if (!tiffStart) {
    return {
      processingMode: "local",
      summary: { mimeType: file.type || "image/jpeg", fileType: "JPEG", ...dimensions },
      privacy: { risk: "low", findings: [] },
      grouped: {
        File: [
          { key: "FileName", tag: "FileName", value: file.name },
          { key: "FileSize", tag: "FileSize", value: file.size },
          { key: "MIMEType", tag: "MIMEType", value: file.type || "image/jpeg" },
        ],
      },
      raw: { local: true, exifPresent: false },
    };
  }

  const parsed = parser(bytes, tiffStart);
  const exif = { ...parsed.ifd0.values, ...parsed.exif.values };
  const gps = parsed.gps.values;
  const scan = privacy(exif, gps);
  const altitude = typeof gps.GPSAltitude === "number"
    ? (Number(gps.GPSAltitudeRef) === 1 ? -gps.GPSAltitude : gps.GPSAltitude)
    : null;
  const grouped = {
    File: [
      { key: "FileName", tag: "FileName", value: file.name },
      { key: "FileSize", tag: "FileSize", value: file.size },
      { key: "MIMEType", tag: "MIMEType", value: file.type || "image/jpeg" },
    ],
    EXIF: [...parsed.ifd0.rows, ...parsed.exif.rows],
  };
  if (parsed.gps.rows.length) grouped.GPS = parsed.gps.rows;

  return {
    processingMode: "local",
    summary: {
      mimeType: file.type || "image/jpeg",
      fileType: "JPEG",
      width: dimensions.width || exif.ExifImageWidth || null,
      height: dimensions.height || exif.ExifImageHeight || null,
      make: exif.Make || null,
      model: exif.Model || null,
      capturedAt: exif.DateTimeOriginal || exif.CreateDate || exif.DateTime || null,
      software: exif.Software || null,
      lensModel: exif.LensModel || null,
      gpsAltitude: altitude,
      gpsLatitude: scan.latitude,
      gpsLongitude: scan.longitude,
    },
    privacy: { risk: scan.risk, findings: scan.findings },
    grouped,
    raw: { ...exif, ...gps, local: true },
  };
}

function isMetadataMarker(marker, profile) {
  if (marker === 0xfe) return true;
  if (profile === "privacy") return marker === 0xe1 || marker === 0xed;
  if (marker === 0xe0 || marker === 0xee) return false;
  return marker >= 0xe1 && marker <= 0xef;
}

export async function cleanJpegLocally(file, profile = "privacy") {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Local cleaning currently supports JPEG files only.");
  const parts = [bytes.slice(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      parts.push(bytes.slice(offset));
      break;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda) {
      parts.push(bytes.slice(offset));
      break;
    }
    if (marker === 0xd9) {
      parts.push(bytes.slice(offset, offset + 2));
      break;
    }
    if (marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(bytes.slice(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) throw new Error("Invalid JPEG segment.");
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) throw new Error("Invalid JPEG segment length.");
    if (!isMetadataMarker(marker, profile)) parts.push(bytes.slice(offset, end));
    offset = end;
  }
  return new Blob(parts, { type: file.type || "image/jpeg" });
}
