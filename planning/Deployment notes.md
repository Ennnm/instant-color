# Deployment notes

- Repository have to be updated to the relevant one (not birding)

- Npm versions on vscode and heroku has to match

- For color thief to work, url has to have jpg extensions

- content type needs to be updated , does not work on application/octet, key updated with jpg extension. can probably be more
  dynamic to allow for different file types.

  > contentType: multerS3.AUTO_CONTENT_TYPE,

- S3 access keys and secret access key to get from aws, and input into heroku. if not there will be internal server issues as

  heroku does not take in file types

- File uploads have to change to resize file from s3 instead of local hardisk. [see](https://gist.github.com/AntoniusGolly/eee090526e4140ca34f0aa4ea5d571cc) Takes in bucket and original key

- Can uploads to s3 and hardisk exist on the same code? would probably need if else conditions to determine if run on heroku or not

### Questions

- How to delete files from s3 via codegit
