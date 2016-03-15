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
//
//router.delete('/', isLoggedIn, function(req, res, next) {
//   var bid = [];
//   var bgid = req.body.bgid;
//
//   if((typeof bgid)=== 'string') {
//      bid.push(parseInt(bgid));
//   } else {
//      bgid.forEach(function(item) {
//         bid.push(parseInt(item));
//      });
//   }
//
//   //커넥션 연결
//   function getConnection(callback) {
//      pool.getConnection(function(err, connection) {
//         if(err) {
//            callback(err);
//         } else {
//            callback(null, connection);
//         }
//      });
//   }
//
//   //background테이블을 select하여 path를 추출한 후 s3에서 삭제
//   function selectBackground(connection, callback) {
//      var select = "select id, name "+
//                   "from background "+
//                   "where id in (?)";
//      connection.query(select, [bid], function(err, results) {
//         if(err) {
//            connection.release();
//            callback(err);
//         } else {
//            if(results.length === 0) {
//               var err = new Error('배경사진이 존재하지 않습니다.');
//               next(err);
//            } else {
//               async.each(results, function(result, cb) {
//
//                  function selectPhotos(callback) {
//                     var backgroundURL = [];
//
//                     var select = "select photourl "+
//                        "from photos "+
//                        "where refer_id = ? and refer_type = 4";
//                     connection.query(select, [result.id], function(err, result) {
//                        if(err) {
//                           connection.release();
//                           callback(err);
//                        } else {
//                           console.log('포토테이블 셀렉트 완료');
//                           backgroundUR.push(result[0].photourl);
//                        }
//                     });
//
//                     var deletePhoto = "delete from photos "+
//                                       "where refer_id = ?";
//                     connection.query(deletePhoto, [result.id], function(err, result) {
//                        if(err) {
//                           connection.release();
//                           callback(err);
//                        } else {
//                           callback(null, backgroundURL);
//                        }
//                     })
//                  }
//
//                  function deleteBackground(backgroundURL, callback) {
//                     var deleteSql = "delete from background "+
//                        "where id = ?"
//                     connection.query(deleteSql, [result.id], function(err) {
//                        if(err) {
//                           connection.release();
//                           callback(err);
//                        } else {
//                           console.log('백그라운드 테이블에서 삭제 완료');
//                           callback(null, backgroundURL);
//                        }
//                     });
//                  }
//
//                  function deleteUploadedFile(background_url, callback) {
//                     var mimeType = mime.lookup(path.basename(background_url));
//
//                     var s3 = new AWS.S3({
//                        "accessKeyId" : s3config.key,
//                        "secretAccessKey" : s3config.secret,
//                        "region" : s3config.region,
//                        "params" : {
//                           "Bucket" : s3config.bucket,
//                           "Key" : s3config.bgDir + "/" + path.basename(background_url),
//                           "ACL" : s3config.bgACL,
//                           "ContentType" : mimeType
//                        }
//                     });
//
//                     s3.deleteObject(s3.params, function(err, data) {
//                        if(err) {
//                           callback(err);
//                        } else {
//                           console.log('s3에서 삭제 완료');
//                           console.log(data);
//                           callback(null, true);
//                        }
//                     });
//                  }
//                  async.waterfall([selectPhotos, deleteBackground, deleteUploadedFile], function(err, result) {
//                     if(err) {
//                        cb(err);
//                     } else {
//                        console.log('결과 ', result);
//                        cb(null);
//                     }
//                  })
//               }, function(err, result) {
//                  if(err) {
//                     callback(err);
//                  } else {
//                     connection.release();
//                     console.log(result, "배경삭제 완료되었습니다.");
//                     callback(null, {"message" : "배경사진을 삭제하였습니다."});
//                  }
//               });
//               //async끝
//
//            }
//
//         }
//      });
//   }
//
//   async.waterfall([getConnection, selectBackground], function(err, result) {
//      if(err) {
//         err.message = "배경사진 삭제에 실패하였습니다.";
//         next(err);
//      } else {
//         res.json(result);
//      }
//   })
//});

module.exports = router;