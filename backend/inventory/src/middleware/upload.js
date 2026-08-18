const multer = require('multer');
const path = require('path');
const { withMediaPersist } = require('./persistMedia');

const storage = multer.memoryStorage();

const checkFileType = (file, cb) => {
  const filetypes = /jpg|jpeg|png|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = /image\//.test(file.mimetype) && filetypes.test(path.extname(file.originalname).toLowerCase());

  if (extname && mimetype) {
    return cb(null, true);
  }
  cb(new Error('Images only!'));
};

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
});

module.exports = {
  single: (field) => withMediaPersist(upload.single(field)),
  any: () => withMediaPersist(upload.any()),
  fields: (fields) => withMediaPersist(upload.fields(fields)),
};
