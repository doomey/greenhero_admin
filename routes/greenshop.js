var express = require('express');
var router = express.Router();
var async = require('async');
var formidable = require('formidable');
var AWS = require('aws-sdk');
var s3config = require('../config/s3config');
var fs = require('fs');
var mime = require('mime');
var path = require('path')

router.get('/', function(req, res, next) {
   //getConenction
   function getConnection(callback) {
      pool.getConnection(function(err, connection) {
         if(err) {
            callback(err);
         } else {
            callback(null, connection);
         }
      });
   }
   //selectTotal
   function selectTotal(connection, callback) {
      var select = "select count(id) as cnt "+
                   "from greendb.greenitems";
      connection.query(select, [], function(err, results) {
         if(err) {
            connection.release();
            callback(err);
         } else {
            callback(null, results[0].cnt, connection);
         }
      });
   }
   //paging처리
   function selectGreenitems(total, connection, callback) {
      var page = req.query.page;
      page = (isNaN(page))? 1 : page;
      page = (page < 1)? 1 : page;

      limit = 10;
      offset = limit * (page - 1);

      var select = "select id, name, description, price, picture, sdate, edate, star, tquantity "+
                   "from greendb.greenitems "+
                   "order by id desc limit ? offset ?";
      connection.query(select, [limit, offset], function(err, results) {
         connection.release();
         if(err) {
            callback(err);
         } else {
            var info = {
               "page" : page,
               "itemsPerPage" : limit,
               "items" : []
            };

            async.each(results, function(result, cb) {
               info.items.push({
                  "id" : result.id,
                  "name" : result.name,
                  "picture" : result.picture,
                  "star" : result.star,
                  "price" : result.price,
                  "itemCount" : result.tquantity,
                  "itemDescription" : result.description
               });
               cb(null);
            }, function(err) {
               if(err) {
                  callback(err);
               } else {
                  callback(null, info);
               }
            });

         }
      });
   }

   async.waterfall([getConnection, selectTotal, selectGreenitems], function(err, result) {
      if(err) {
         err.message = "GREEN SHOP의 물품 목록 불러오기에 실패하였습니다.";
         next(err);
      } else {
         res.json(result);
      }
   });
});

router.post('/', function(req, res, next) {
   //connection
   function getConnection(callback) {
      pool.getConnection(function(err, connection) {
         if(err) {
            callback(err);
         } else {
            callback(null, connection);
         }
      });
   }
   //file업로드
   function fileUpload(connection, callback) {
      var form = new formidable.IncomingForm();
      form.uploadDir = path.join(__dirname, '../uploads');
      form.keepExtensions = true;
      form.multiples = true;

      form.parse(req, function(err, fields, files) {
         var results = [];
         if(files['photo'] instanceof Array) { //파일을 2개 이상 업로드할 경우
            async.each(files['photo'], function(file, cb) {
               var mimeType = mime.lookup(path.basename(file.path));

               var s3 = new AWS.S3({
                  "accessKeyId" : s3config.key,
                  "secretAccessKey" : s3config.secret,
                  "region" : s3config.region,
                  "params" : {
                     "Bucket" : s3config.bucket,
                     "Key" : s3config.imageDir + "/" + path.basename(file.path),
                     "ACL" : s3config.imageACL,
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
                           var insert = "insert into greendb.photos(name, path) "+
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
                  err.message = "사진 업로드에 상공하였습니다.";
                  next(err);
               } else {
                  res.json(results);
               }
            });
         } else if(!files['photo']) {
            var err = new Error('사진을 업로드해야만 합니다...');
            next(err);
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
   }
   //insertGreenitems
});

module.exports = router;