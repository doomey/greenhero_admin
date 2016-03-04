var s3 = {
   "key" : process.env.GREEN_S3_KEY,
   "secret" : process.env.GREEN_S3_SECRET,
   "region" : "ap-northeast-2",
   "bucket" : "greenhero",
   "imageDir" : "photos",
   "bgDir" : "bg",
   "imageACL" : "public-read"
}

module.exports = s3;