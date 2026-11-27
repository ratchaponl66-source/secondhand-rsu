const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const uploadsDir = path.resolve(
  process.env.UPLOAD_DIR || path.join(__dirname, '..', 'public', 'uploads'),
);
if (!process.env.VERCEL) fs.mkdirSync(uploadsDir, { recursive: true });

const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function configurationError(message) {
  return Object.assign(new Error(message), { status: 503, expose: true });
}

async function saveUpload(file) {
  const extension = extensions[file?.mimetype];
  if (!file?.buffer || !extension) {
    throw Object.assign(new Error('ไฟล์รูปภาพไม่ถูกต้อง'), { status: 400, expose: true });
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`products/${randomUUID()}${extension}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
    });
    return blob.url;
  }

  if (process.env.VERCEL) {
    throw configurationError('ยังไม่ได้ตั้งค่า Vercel Blob สำหรับเก็บรูปภาพ');
  }

  const filename = `${randomUUID()}${extension}`;
  await fs.promises.writeFile(path.join(uploadsDir, filename), file.buffer, { flag: 'wx' });
  return `/uploads/${filename}`;
}

function resolveUploadPath(imageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('/uploads/')) return null;
  const filename = imageUrl.slice('/uploads/'.length);
  if (!filename || filename === '.' || filename === '..' || path.basename(filename) !== filename) return null;
  return path.join(uploadsDir, filename);
}

async function removeUpload(imageUrl) {
  if (typeof imageUrl !== 'string') return;
  if (/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(imageUrl)) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw configurationError('ไม่พบ Vercel Blob token สำหรับลบรูปภาพ');
    }
    const { del } = await import('@vercel/blob');
    await del(imageUrl);
    return;
  }

  const filePath = resolveUploadPath(imageUrl);
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = { uploadsDir, resolveUploadPath, removeUpload, saveUpload };
