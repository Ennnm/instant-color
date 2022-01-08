import multer from 'multer';
import multerS3 from 'multer-s3';
import aws from 'aws-sdk';

const PORT = process.env.PORT || 3004;
export const isDeployedLocally = PORT === 3004;

export const S3 = new aws.S3({
  signatureVersion: 'v4',
});

const s3 = new aws.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
// local storage
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    // wow
    // hello!!!!! akkirrraaaaaa
    cb(null, `${Date.now()}.jpg`);
  },
});
// for local host or aws server deployment
export const mutlerUpload = multer({ dest: 'uploads/', storage });
// for aws s3 bucket
export const mutlerS3Upload = multer({
  storage: multerS3({
    s3,
    bucket: 'buckethueinstant',
    acl: 'public-read',
    metadata: (request, file, callback) => {
      callback(null, { fieldName: file.fieldname });
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (request, file, callback) => {
      callback(null, `${Date.now().toString()}.jpg`);
    },
  }),
});
