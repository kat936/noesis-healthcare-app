const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// MIME type whitelist
const ALLOWED_MIME_TYPES = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'application/csv': '.csv',
  'text/csv': '.csv'
};

// File extensions to block (executables, macros)
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.sh', '.cmd', '.ps1', '.jar', '.msi', '.com', '.scr', '.vbs',
  '.xlsm', '.docm', '.pptm', '.xltm', '.potm', '.ppam', '.ppsm', '.sldm'
];

// Storage configuration
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES[file.mimetype]) {
    return cb(new Error(`File type ${file.mimetype} not allowed`));
  }

  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`File extension ${ext} is blocked for security reasons`));
  }

  // Check for macro-enabled files
  if (ext.includes('m')) {
    return cb(new Error('Macro-enabled documents are not allowed'));
  }

  cb(null, true);
};

// Multer instance
const uploader = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

/**
 * File Upload Middleware
 * Sanitizes filenames, validates MIME types, blocks malicious files
 */
function fileUploadMiddleware(fieldName = 'file') {
  return (req, res, next) => {
    uploader.single(fieldName)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
          return res.status(400).json({
            error: 'File too large',
            code: 'FILE_SIZE_EXCEEDED',
            maxSize: '10MB'
          });
        }
        return res.status(400).json({
          error: 'File upload error',
          code: 'UPLOAD_ERROR',
          details: err.message
        });
      } else if (err) {
        return res.status(400).json({
          error: 'File rejected',
          code: 'FILE_REJECTED',
          details: err.message
        });
      }

      if (req.file) {
        // Sanitize filename
        const ext = path.extname(req.file.originalname);
        const sanitized = uuidv4() + ext;

        req.file.sanitizedFilename = sanitized;
      }

      next();
    });
  };
}

module.exports = { fileUploadMiddleware };
