var express = require('express');
var router = express.Router();
var async = require('async');
var AWS = require('aws-sdk');
var s3config = require('../config/s3config');
var fs = require('fs');
var formidable = require('formidable');
var mime = require('mime');
var path = require('path');

function isLoggedIn(req, res, next) {
   if(!req.isAuthenticated()) {
      var err = new Error('로그인이 필요합니다...');
      err. status = 401;
      next(err);
   } else {
      next(null, {"message" : "로그인이 완료되었습니다..."});
   }
}

router.get('/', isLoggedIn, function(req, res, next) {
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
      var select = "select id, photourl, originalfilename "+
         "from photos "+
         "where refer_type = 4";
      connection.query(select, [], function(err, results) {
         if(err) {
            callback(err);
         } else {
            var bg = [];
            async.each(results, function(result, cb) {
               bg.push({
                  "id" : result.id,
                  "name" : result.originalfilename,
                  "path" : result.photourl
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

router.post('/', isLoggedIn, function(req, res, next) {
   if(req.headers['content-type'] === 'application/x-www-form-urlencoded') {
      var err = new Error('배경사진을 업로드해야합니다.');
      next(err);
   } else {
      var form = new formidable.IncomingForm();
      form.uploadDir = path.join(__dirname, '../uploads');
      form.keepExtensions = true;
      form.multiples = true;

      form.parse(req, function(err, fields, files) {
         if(err) {
            next(err);
         } else {
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
                              var insert = "insert into background(name) "+
                                 "values(?, ?)";
                              connection.query(insert, [path.basename(file.name, path.extname(file.name))], function(err, result) {
                                 if(err) {
                                    connection.release();
                                    callback(err);
                                 } else {
                                    callback(null, result.insertId, connection);
                                 }
                              });
                           }

                           function insertPhotos(bid, connection, callback) {
                              var insert = "insert into photos(photourl, uploaddate, originalfilename, modifiedfilename, phototype, refer_type, refer_id) "+
                                 "values(?, now(), ?,  ?, ?, 4, ?);";
                              connection.query(insert, [data.Location, file.name, path.basename(file.path), file.type, bid], function(err, result) {
                                 connection.release();
                                 if(err) {
                                    callback(err);
                                 } else {
                                    callback(null)
                                 }
                              });
                           }
                           async.waterfall([getConnection, insertBackgrounds, insertPhotos], function(err, result) {
                              if(err) {
                                 next(err);
                              }
                           });

                        }
                     });
                  //send함수의 끝
               }, function(err, result) {
                  if(err) {
                     err.message = "배경사진 업로드에 실패하였습니다.";
                     next(err);
                  } else {
                     res.json(results);
                  }
               });
            } else if(!files['background']) {
               res.json({"s3URL" : null});
            } else { //배경을 한개만 올린 경우
               var file = files['background'];
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
                           var insert = "insert into background(name) "+
                                         "values(?)";
                           connection.query(insert, [path.basename(file.name, path.extname(file.name))], function(err, result) {
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
                              err.message = "배경사진 업로드에 실패하였습니다.";
                              next(err);
                           } else {
                              res.json({ "s3URL" : data.Location });
                           }
                        });

                     }
                  });
            }
         }

   });
   }
});

router.delete('/:backgroundId', isLoggedIn, function(req, res, next) {
   var bid = req.params.backgroundId;

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
   //e_diary의 background_id를 null로 만들기
   function disconnectEdiary(connection, callback) {
      var update = "update e_diary "+
         "set background_id = null "+
         "where background_id = ?";
      connection.query(update, [bid], function(err) {
         if(err) {
            connection.release();
            err.message = "e_diary테이블의 background_id를 제거하는 과정에서 오류가 발생하였습니다.";
            logger.log('errer', req.user.nickname+'님 '+err.message);
            callback(err);
         } else {
            callback(null, connection);
         }
      });
   }

   //photos에서 background의 url을 select
   function selectPhotos(connection, callback) {
      var select = "select photourl "+
         "from photos "+
         "where refer_id = ? and refer_type = 4";
      connection.query(select, [bid], function(err, result) {
         if(err) {
            connection.release();
            logger.log('errer', req.user.nickname+'님 '+err.message);
            err.message = "배경화면의 URL을 검색하는 과정에서 오류가 발생하였습니다.";
            callback(err);
         } else {
            callback(null, result[0].photourl, connection);
         }
      });
   }
   //s3의 파일 삭제
   function deleteFile(bgURL, connection, callback) {
      var mimeType = mime.lookup(path.basename(bgURL));

      var s3 = new AWS.S3({
         "accessKeyId" : s3config.key,
         "secretAccessKey" : s3config.secret,
         "region" : s3config.region,
         "params" : {
            "Bucket" : s3config.bucket,
            "Key" : s3config.bgDir + "/" + path.basename(bgURL),
            "ACL" : s3config.bgACL,
            "ContentType" : mimeType
         }
      });

      s3.deleteObject(s3.params, function(err, data) {
         if(err) {
            err.message = "S3의 파일을 삭제하는 과정에서 오류가 발생하였습니다.";
            logger.log('errer', req.user.nickname+'님 '+err.message);
            callback(err);
         } else {
            console.log(data);
            console.log(data.Location, '삭제되었습니다.');
            callback(null, connection);
         }
      });
   }
   //delete Photo and Background
   function deletePhotosAndBackgrounds(connection, callback) {
      var deletePhoto = "delete from photos "+
         "where refer_type = 4 and refer_id = ?";
      connection.query(deletePhoto, [bid], function(err, result) {
         if(err) {
            connection.release();
            err.message = "photos테이블에서 해당 배경사진에 관한 자료를 제거하는데 오류가 발생하였습니다.";
            logger.log('errer', req.user.nickname+'님 '+err.message);
            callback(err);
         } else {
            console.log('photos테이블 삭제 완료');
         }
      });

      var deleteSql = "delete from background "+
         "where id = ?";
      connection.query(deleteSql, [bid], function(err) {
         if(err) {
            connection.release();
            err.message = "background테이블에서 해당 자료를 삭제하는데 오류가 발생하였습니다.";
            logger.log('errer', req.user.nickname+'님 '+err.message);
            callback(err);
         } else {
            callback(null, {"message" : bid+"번 ID의 배경사진을 삭제하였습니다."});
         }
      });
   }


   async.waterfall([getConnection, disconnectEdiary, selectPhotos, deleteFile, deletePhotosAndBackgrounds], function(err, result) {
      if(err) {
         next(err);
      } else {
         logger.log('info', req.user.nickname+'님이 '+result.message);
         res.json(result);
      }
   });

});

module.exports = router;