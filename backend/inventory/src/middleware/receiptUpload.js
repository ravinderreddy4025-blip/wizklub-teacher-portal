const multer = require('multer');
const path = require('path');
const { withMediaPersist } = require('./persistMedia');

const storage = multer.memoryStorage();

const imageTypes = /jpg|jpeg|png|webp/;
const videoTypes = /mp4|webm|mov|quicktime/;

const checkFileType = (file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  const isImage = imageTypes.test(ext) && /image\//.test(file.mimetype);
  const isVideo = videoTypes.test(ext) && /video\//.test(file.mimetype);

  if (isImage || isVideo) {
    return cb(null, true);
  }
  return cb(new Error('Only image (jpg, png, webp) or video (mp4, webm, mov) files are allowed'));
};

const receiptUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 30 },
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
});

module.exports = {
  single: (field) => withMediaPersist(receiptUpload.single(field)),
  any: () => withMediaPersist(receiptUpload.any()),
  fields: (fields) => withMediaPersist(receiptUpload.fields(fields)),
  array: (field, maxCount) => withMediaPersist(receiptUpload.array(field, maxCount)),
};
