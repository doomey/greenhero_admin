var express = require('express');
var router = express.Router();
var async = require('async');
var AWS = require('aws-sdk');
var s3config = require('../config/s3config');
var fs = require('fs');
var formidable = require('formidable');
var mime = require('mime');
var path = require('path');

router.get('/', function(req, res, next) {
   //커넥션
   function getConnection(callback) {
      pool.getConnection(function(err, connection) {
         if(err) {
            callback(err);
         } else {
            callback(null, connection);
         }
      });
   }
   //select background
   function selectBackground(connection, callback) {
      var select = "select id, name, path "+
                   "from greendb.background";
      connection.query(select, [], function(err, results) {
         if(err) {
            callback(err);
         } else {
            var bg = [];
            async.each(results, function(result, cb) {
               bg.push({
                  "id" : result.id,
                  "name" : result.name,
                  "path" : result.path
               });
            }, function(err) {
               if(err) {
                  cb(err);
               }
            })
            callback(null, bg);
         }
      });
   }

   async.waterfall([getConnection, selectBackground], function(err, result) {
      if(err) {
         next(err);
      } else {
         res.json(result);
      }
   });
});

router.post('/', function(req, res, next) {
   var form = new formidable.IncomingForm();
   form.uploadDir = path.join(__dirname, '../uploads');
   form.keepExtensions = true;
   form.multiples = true;

   form.parse(req, function(err, fields, files) {
      var results = [];
      if(files['background'] instanceof Array) { //파일을 2개 이상 업로드할 경우
         async.each(files['background'], function(file, cb) {
            var mimeType = mime.lookup(path.basename(file.path));

            var s3 = new AWS.S3({
               "accessKeyId" : s3config.key,
               "secretAccessKey" : s3config.secret,
               "region" : s3config.region,
               "params" : {
                  "Bucket" : s3config.bucket,
                  "Key" : s3config.bgDir + "/" + path.basename(file.path),
                  "ACL" : s3config.bgACL,
                  "ContentType" : mimeType
               }
            });

            var body = fs.createReadStream(file.path);
            s3.upload({"Body" : body})
               .on('httpUploadProgress', function(event) {
                  console.log(event);
               })
               .send(function(err, data) {
                  if(err) {
                     console.log(err);
                     cb(err);
                  } else {
                     console.log(data);

                     fs.unlink(file.path, function() {
                        console.log(file.path + " 파일이 삭제되었습니다...");
                        results.push({"s3URL" : data.Location});
                     });

                     function getConnection(callback) {
                        pool.getConnection(function(err, connection) {
                           if(err) {
                              callback(err);
                           } else {
                              callback(null, connection);
                           }
                        });
                     }

                     function insertBackgrounds(connection, callback) {
                        var insert = "insert into greendb.background(name, path) "+
                                     "values(?, ?)";
                        connection.query(insert, [path.basename(file.name, path.extname(file.name)), data.Location], function(err, result) {
                           connection.release();
                           if(err) {
                              callback(err);
                           } else {
                              callback(null, true);
                           }
                        });
                     }

                     async.waterfall([getConnection, insertBackgrounds], function(err, result) {
                        if(err) {
                           next(err);
                        } else {
                           cb();
                        }
                     });

                  }
               });
            //send함수의 끝
         }, function(err, result) {
            if(err) {
               err.message = "배경사진 업로드에 상공하였습니다.";
               next(err);
            } else {
               res.json(results);
            }
         });
      } else if(!files['background']) { //배경을 올리지 않은 경우
         res.json({"s3URL" : null});
      } else { //배경을 한개만 올린 경우
         var file = files['background'];
         console.log("파일 타입 : ", typeof file);
         var mimeType = mime.lookup(path.basename(file.path));

         var s3 = new AWS.S3({
            "accessKeyId" : s3config.key,
            "secretAccessKey" : s3config.secret,
            "region" : s3config.region,
            "params" : {
               "Bucket" : s3config.bucket,
               "Key" : s3config.bgDir + "/" + path.basename(file.path),
               "ACL" : s3config.bgACL,
               "ContentType" : mimeType
            }
         });

         var body = fs.createReadStream(file.path);

         s3.upload({"Body" : body})
            .on('httpUploadProgress', function(event) {
               console.log(event);
            })
            .send(function(err, data) {
               if(err) {
                  console.log(err);
                  cb(err);
               } else {
                  console.log(data);

                  fs.unlink(file.path, function() {
                     console.log(file.path + " 파일이 삭제되었습니다...");
                     results.push({"s3URL" : data.Location});
                  });

                  function getConnection(callback) {
                     pool.getConnection(function(err, connection) {
                        if(err) {
                           callback(err);
                        } else {
                           callback(null, connection);
                        }
                     });
                  }

                  function insertBackgrounds(connection, callback) {
                     var insert = "insert into greendb.background(name, path) "+
                        "values(?, ?)";
                     connection.query(insert, [path.basename(file.name, path.extname(file.name)), data.Location], function(err, result) {
                        connection.release();
                        if(err) {
                           callback(err);
                        } else {
                           callback(null, true);
                        }
                     });
                  }

                  async.waterfall([getConnection, insertBackgrounds], function(err, result) {
                     if(err) {
                        err.message = "배경사진 업로드에 상공하였습니다.";
                        next(err);
                     } else {
                        res.json({ "s3URL" : data.Location });
                     }
                  });

               }
            });
      }
   });
});

router.delete('/', function(req, res, next) {
   var bid = [];
   var bgid = req.body.bgid;

   if(bgid instanceof Array) {
      async.each(bgid, function(item, callback) {
         bid.push(parseInt(item));
         callback(null, true);
      }, function(err) {
         if(err) {
            callback(err);
         }
      });
   } else {
      bgid = parseInt(bgid);
      bid.push(bgid);
   }

   //커넥션 연결
   function getConnection(callback) {
      pool.getConnection(function(err, connection) {
         if(err) {
            callback(err);
         } else {
            callback(null, connection);
         }
      });
   }

   //background테이블을 select하여 path를 추출한 후 s3에서 삭제
   function selectBackground(connection, callback) {
      var select = "select name, path "+
                   "from greendb.background "+
                   "where id in (?)";
      connection.query(select, [bid], function(err, results) {
         if(err) {
            connection.release();
            callback(err);
         } else {
            if(results.length === 0) {
               var err = new Error('배경사진이 존재하지 않습니다.');
               next(err);
            } else {
               async.each(results, function(result, cb) {

                  var mimeType = mime.lookup(path.basename(result.path));

                  var s3 = new AWS.S3({
                     "accessKeyId" : s3config.key,
                     "secretAccessKey" : s3config.secret,
                     "region" : s3config.region,
                     "params" : {
                        "Bucket" : s3config.bucket,
                        "Key" : s3config.imageDir + "/" + path.basename(result.path),
                        "ACL" : s3config.imageACL,
                        "ContentType" : mimeType
                     }
                  });

                  s3.deleteObject(s3.params, function(err, data) {
                     if(err) {
                        callback(err);
                     } else {
                        console.log(data);
                     }
                  });

               }, function(err, result) {
                  if(err) {
                     callback(err);
                  }
               });
               //async끝
               callback(null, connection);
            }

         }
      });
   }

   //background테이블에서 delete
   function deleteBackground(connection, callback) {
      console.log('들어옴');
      var deleteSql = "delete from greendb.background "+
                       "where id in (?)"
      connection.query(deleteSql, [bid], function(err, result) {
         connection.release();
         if(err) {
            callback(err);
         } else {
            callback(null, true);
         }
      });
   }

   async.waterfall([getConnection, selectBackground, deleteBackground], function(err, result) {
      if(err) {
         err.message = "배경사진 삭제에 실패하였습니다.";
         next(err);
      } else {
         res.json({"message" : "배경사진을 삭제하였습니다."});
      }
   })
});

module.exports = router;