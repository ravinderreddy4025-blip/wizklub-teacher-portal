/**
 * Centralised Express error handler (registered last in server.js).
 * Maps known error shapes to HTTP status + JSON; avoids leaking stack in production.
 * Doc: ../../../docs/file-notes/server/middleware/errorHandler.js.md
 */
const errorHandler = (err, req, res, _next) => {
  const isDev = process.env.NODE_ENV !== 'production'; // true in development → include err.message/stack in some responses

  console.error(`[ERROR] ${req.method} ${req.path}`, err.message); // Always log a one-line summary server-side
  if (isDev) console.error(err.stack); // Full stack only in dev (never sent to client by default below)

  if (err.name === 'ValidationError') { // Mongoose document validation failed
    const messages = Object.values(err.errors).map(e => e.message); // Collect human messages per field
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: messages,
    });
  }

  if (err.code === 11000) { // Mongo duplicate key index violation
    return res.status(409).json({
      success: false,
      message: 'Duplicate entry detected.',
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') { // Multer rejected upload over configured max bytes
    return res.status(413).json({
      success: false,
      message: 'File too large. Check the size limit.',
    });
  }

  const storageErr = err && typeof err === 'object' && err.error ? err.error : err; // Some SDKs nest under err.error
  if (storageErr && (storageErr.name === 'TimeoutError' || storageErr.http_code === 499)) { // Upload aborted / client closed
    return res.status(504).json({
      success: false,
      message: isDev
        ? 'Upload to storage timed out. Try a smaller file or raise S3_UPLOAD_TIMEOUT_MS in .env.'
        : 'Upload timed out. Please try again with a smaller file or slower connection.',
    });
  }

  if (err.message && err.message.startsWith('Invalid ') && err.message.endsWith(' file type.')) { // Multer fileFilter message (video/doc)
    return res.status(415).json({
      success: false,
      message: err.message,
    });
  }

  if (err.message === 'Upload an .xlsx Excel file.') { // roster import multer filter (exact message from admin route)
    return res.status(415).json({
      success: false,
      message: err.message,
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: isDev ? err.message : 'An unexpected error occurred.', // Hide internals in production
    ...(isDev && { stack: err.stack }), // Optional stack in JSON for API consumers in dev only
  });
};

module.exports = { errorHandler };
