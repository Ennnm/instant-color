import multer from 'multer';
import multerS3 from 'multer-s3';
import aws from 'aws-sdk';
import fs from 'fs';
import util from 'util';
import dotenv, { config } from 'dotenv';

const unlinkFile = util.promisify(fs.unlink);

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const PORT = process.env.PORT || 3004;
export const isDeployedLocally = PORT === 3004;

export const S3 = new aws.S3({
  signatureVersion: 'v4',
});

const BUCKETNAME = process.env.AWS_S3_BUCKET_NAME;

const s3 = new aws.S3({
  region: process.env.AWS_REGION,
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
export const uploadFile = (file) => {
  const fileStream = fs.createReadStream(file.path);

  const uploadParams = {
    Bucket: BUCKETNAME,
    Body: fileStream,
    Key: file.filename,
    ContentType: 'image/jpeg',
  };

  return s3.upload(uploadParams).promise();
};

export const getFileStream = (fileKey) => {
  const downloadParams = {
    Key: fileKey,
    Bucket: BUCKETNAME,
  };

  return s3.getObject(downloadParams).createReadStream();
};

export const getSignedUrl = (key) => {
  const signedUrl = s3.getSignedUrl('getObject', {
    Key: key,
    Bucket: BUCKETNAME,
    Expires: 900,
  });
  return signedUrl;
};
