var express = require('express');
var router = express.Router();
var async = require('async');
var formidable = require('formidable');
var AWS = require('aws-sdk');
var s3config = require('../config/s3config');
var fs = require('fs');
var mime = require('mime');
var path = require('path')

function isLoggedIn(req, res, next) {//
   if(!req.isAuthenticated()) {
      var err = new Error('로그인이 필요합니다...');
      err. status = 401;
      next(err);
   } else {
      next(null, {"message" : "로그인이 완료되었습니다..."});
   }
}

router.get('/', isLoggedIn, function(req, res, next) {
   if(req.secure) {
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

         limit = parseInt(req.query.limit);
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
   } else {
      var err = new Error('SSL/TLS Upgreade Required...');
      err.status = 426;
      next(err);
   }
});

router.post('/', isLoggedIn, function(req, res, next) {
   if(req.secure) {
      if(req.headers['content-type'] === 'application/x-www-form-urlencoded') {
         var err = new Error('사진을 업로드해야만 합니다...');
         next(err);
      } else {
         var form = new formidable.IncomingForm();
         form.uploadDir = path.join(__dirname, '../uploads');
         form.keepExtensions = true;
         form.multiples = true;

         form.parse(req, function(err, fields, files) {
            if(files['photo'] instanceof Array) { //파일을 2개 이상 업로드할 경우
               var err = new Error('1개의 사진만 업로드해야만 합니다...');
               next(err);
            } else if(!files['photo']) {
               var err = new Error('사진을 업로드해야만 합니다...');
               next(err);
            } else {
               var file = files['photo'];

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
                        });

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

                        //insertGreenitems
                        function insertGreenitems(connection, callback) {
                           var insert = "insert into greendb.greenitems(name, description, price, sdate, edate) "+
                              "values(?, ?, ?, ?, ?)";
                           connection.query(insert, [fields.name, fields.description, fields.price, fields.startDate, fields.endDate], function(err, result) {
                              if(err) {
                                 connection.release();
                                 callback(err);
                              } else {
                                 callback(null, result.insertId, connection);
                              }
                           });
                        }

                        //photos에 insert
                        function insertPhotos(id, connection, callback) {
                           var insert = "insert into greendb.photos(photourl, uploaddate, originalfilename, modifiedfilename, phototype, refer_type, refer_id) "+
                              "values(?, now(), ?, ?, ?, 3, ?)";
                           connection.query(insert, [data.Location, file.name, path.basename(file.path), file.type, id], function(err, result) {
                              if(err) {
                                 connection.release();
                                 callback(err);
                              } else {
                                 var update = "update greendb.greenitems "+
                                    "set picture = ? "+
                                    "where id = ?";
                                 connection.query(update, [data.Location, id], function(err, result) {
                                       connection.release();
                                       if(err) {
                                          callback(err);
                                       } else {
                                          callback(null, {"message" : "물품을 등록하였습니다."});
                                       }
                                    }
                                 );
                              }
                           });
                        }

                        async.waterfall([getConnection, insertGreenitems, insertPhotos], function(err, result) {
                           if(err) {
                              err.message = "물품 등록에 실패하였습니다...";
                              next(err);
                           }
                           else {
                              res.json(result);
                           }

                        })

                     }
                  })
            }
         });
      }
   } else {
      var err = new Error('SSL/TLS Upgreade Required...');
      err.status = 426;
      next(err);
   }
});

router.put('/:articleid', isLoggedIn, function(req, res, next) {
   if(req.secure) {
      var articleid = req.params.articleid;

      //1. getConnection
      function getConnection(callback) {
         pool.getConnection(function(err, connection) {
            if(err) {
               callback(err);
            } else {
               callback(null, connection);
            }
         });
      }

      //2.selectGreenitems
      function selectGreenitems(connection, callback) {

         var select = "select picture "+
            "from greendb.greenitems "+
            "where id = ?";
         connection.query(select, [articleid], function(err, results) {
            if(err) {
               connection.release();
               callback(err);
            } else {
               callback(null, results[0].picture, connection);
            }
         });
      }

      //3. updateGreenitems
      function updateGreenitems(photourl, connection, callback) {
         var form = new formidable.IncomingForm();
         form.uploadDir = path.join(__dirname, '../uploads');
         form.keepExtensions = true;
         form.multiples = true;

         form.parse(req, function(err, fields, files) {
            var name = fields.name;
            var description = fields.description;
            var startDate = fields.startDate;
            var endDate = fields.endDate;
            var price = fields.price;

            var mimeType = mime.lookup(path.basename(photourl));

            var s3 = new AWS.S3({
               "accessKeyId" : s3config.key,
               "secretAccessKey" : s3config.secret,
               "region" : s3config.region,
               "params" : {
                  "Bucket" : s3config.bucket,
                  "Key" : s3config.imageDir + "/" + path.basename(photourl),
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

            var file = files['photo'];

            mimeType = mime.lookup(path.basename(file.path));

            s3 = new AWS.S3({
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
                     })

                     var update = "update greendb.greenitems "+
                        "set name = ?, "+
                        "    description = ?, "+
                        "    price = ?, "+
                        "    picture = ?, "+
                        "    sdate = ?, "+
                        "    edate = ? "+
                        "where id = ?";
                     connection.query(update, [name, description, price, data.Location, startDate, endDate, articleid], function(err, result) {
                        connection.release();
                        if(err) {
                           callback(err);
                        } else {
                           callback(null, {"message" : "해당 글이 수정되었습니다."});
                        }
                     });
                  }
               })
         });

      }

      async.waterfall([getConnection, selectGreenitems, updateGreenitems], function(err, result) {
         if(err) {
            next(err);
         } else {
            res.json(result);
         }
      });
   } else {
      var err = new Error('SSL/TLS Upgreade Required...');
      err.status = 426;
      next(err);
   }
});

router.delete('/:articleid', isLoggedIn, function(req, res, next) {
   if(req.secure) {
      var articleid = req.params.articleid;

      function getConnection(callback) {
         pool.getConnection(function(err, connection) {
            if(err) {
               callback(err);
            } else {
               callback(null, connection);
            }
         });
      }

      function selectGreenitems(connection, callback) {
         var select = "select picture "+
            "from greendb.greenitems "+
            "where id = ?";
         connection.query(select, [articleid], function(err, results) {
            if(err) {
               connection.release();
               callback(err);
            } else {
               callback(null, results[0].picture, connection);
            }
         });
      }

      function deleteFile(fileurl, connection, callback) {
         var form = new formidable.IncomingForm();
         form.uploadDir = path.join(__dirname, '../uploads');
         form.keepExtensions = true;
         form.multiples = true;

         form.parse(req, function(err, fields, files) {
            var mimeType = mime.lookup(path.basename(fileurl));

            var s3 = new AWS.S3({
               "accessKeyId" : s3config.key,
               "secretAccessKey" : s3config.secret,
               "region" : s3config.region,
               "params" : {
                  "Bucket" : s3config.bucket,
                  "Key" : s3config.imageDir + "/" + path.basename(fileurl),
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
         });

         callback(null, connection);
      }

      function deleteGreenitems(connection, callback) {
         var deleteSql = "delete from greendb.greenitems "+
            "where id = ?";
         connection.query(deleteSql, [articleid], function(err, result) {
            connection.release();
            if(err) {
               callback(err);
            } else {
               callback(null, {"message" : "글이 정상적으로 삭제되었습니다."});
            }
         });
      }

      async.waterfall([getConnection, selectGreenitems, deleteFile, deleteGreenitems], function(err, result) {
         if(err) {
            err.message = "해당 글의 삭제에 실패하였습니다.";
            next(err);
         } else {
            res.json(result);
         }
      });
   } else {
      var err = new Error('SSL/TLS Upgreade Required...');
      err.status = 426;
      next(err);
   }
});

module.exports = router;