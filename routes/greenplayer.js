var express = require('express');
var router = express.Router();
var async = require('async');
var formidable = require('formidable');
var AWS = require('aws-sdk');
var s3config = require('../config/s3config');
var fs = require('fs');
var mime = require('mime');
var path = require('path');

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
      //커넥션
      function getConnection(callback) {
         pool.getConnection(function(err, connection) {
            if(err) {
               callback(err);
            } else {
               callback(null, connection);
            }
         })
      }
      //get total
      function getTotal(connection, callback) {
         var select = "select count(id) as cnt "+
            "from epromotion";
         connection.query(select, [], function(err, results) {
            if(err) {
               connection.release();
               callback(err);
            } else {
               var total = results[0].cnt;
               callback(null, total, connection);
            }
         });
      }
      //greenplayer select
      function selectGreenplayer(total, connection, callback) {
         var page = parseInt(req.query.page);
         page = (isNaN(page))? 1 : page;
         page = (page<1) ? 1 : page;

         limit = parseInt(req.query.limit) || 10;
         offset = limit * (page - 1);

         //안드로이드에서 게시글 번호 붙이기 -> offset과 info.result.list의 인덱스를 이용하여 글 번호를 붙일것.
         var select = "select e.id as id, e.title as title, e.cname as cname, e.sdate as sdate, e.edate as edate, e.fileurl as fileurl, date_format(CONVERT_TZ(e.uploaddate,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as uploaddate, e.originalfilename as originalfilename, e.modifiedfilename as modifiedfilename, e.filetype as filetype, e.content as content, p.photourl as photourl "+
                      "from epromotion e left join photos p on (e.id = p.refer_id and p.refer_type = 2) "+
                      "order by e.id desc limit ? offset ?";
         connection.query(select, [limit, offset] , function(err, results) {
            if(err) {
               connection.release();
               callback(err);
            } else {
               var info = {
                  "result" : {
                     "total" : total,
                     "page" : page,
                     "listPerPage" : limit,
                     "list" : []
                  }
               };
               async.each(results, function(result, callback) {
                  info.result.list.push({
                     "epId" : result.id,
                     "title" : result.title,
                     "content" : result.content,
                     "epName" : result.cname,
                     "sDate" : result.sDate,
                     "eDate" : result.eDate,
                     "fileurl" : result.fileurl,
                     "uploaddate" : result.uploaddate,
                     "originalfilename" : result.originalfilename,
                     "modifiedfilename" : result.modifiedfilename,
                     "filetype" : result.filetype,
                     "thumbnailurl" : result.photourl
                  });
               }, function(err) {
                  if(err) {
                     callback(err);
                  } else {
                     connection.release();
                  }
               });
               callback(null, info);
            }
         });
      }
      async.waterfall([getConnection, getTotal, selectGreenplayer], function(err, info) {
         if(err) {
            err.message = "GREEN PLAYER를 불러올 수 없습니다.";
            err.code = "err013";
            next(err);
         } else {
            res.json(info);
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
      //커넥션
      function getConnection(callback) {
         pool.getConnection(function(err, connection) {
            if(err) {
               callback(err);
            } else {
               callback(null, connection);
            }
         })
      }

      function uploadFiles(connection, callback) {
         if(req.header['content-type'] === 'application/x-www-form-urlencoded') {
            var err = new Error('반드시 동영상은 업로드되어야 합니다.');
            callback(err);
         } else {
            var form = new formidable.IncomingForm();
            form.uploadDir = path.join(__dirname, '../uploads');
            form.keepExtensions = true;
            form.multiples = false;

            form.parse(req, function(err, fields, files) {
               if (err) {
                  callback(err);
               } else {
                  if(!files['multimedia']) {
                     var err = new Error('반드시 동영상은 업로드되어야 합니다.');
                     next(err);
                  } else {
                     var videoFile = files['multimedia'];
                     var thumbnailFile = files['thumbnail'];

                     var videoMimeType = mime.lookup(path.basename(videoFile.path));
                     var thumbnailMimeType = mime.lookup(path.basename(thumbnailFile.path));

                     var s3 = new AWS.S3({
                        "accessKeyId" : s3config.key,
                        "secretAccessKey" : s3config.secret,
                        "region" : s3config.region,
                        "params" : {
                           "Bucket" : s3config.bucket,
                           "Key" : s3config.multimediaDir + "/" + path.basename(videoFile.path),
                           "ACL" : s3config.multimediaACL,
                           "ContentType" : videoMimeType
                        }
                     });

                     var articleinfo = {
                        "title" : fields.title,
                        "content" : fields.content,
                        "company" : fields.company,
                        "startDate" : fields.startDate,
                        "endDate" : fields.endDate,
                     };
                     var videoInfo = {
                        "fileurl" : null,
                        "originalfilename" : videoFile.name,
                        "modifiedfilename" : path.basename(videoFile.path),
                        "filetype" : videoFile.type
                     };
                     var thumbnailInfo = {
                        "fileurl" : null,
                        "originalfilename" : thumbnailFile.name,
                        "modifiedfilename" : path.basename(thumbnailFile.path),
                        "filetype" : thumbnailFile.type
                     };

                     var body = fs.createReadStream(videoFile.path);
                     s3.upload({"Body" : body})
                        .on('httpUploadProgress', function(event) {
                           console.log(event);
                        })
                        .send(function(err, data) {
                           if(err) {
                              console.log(err);
                              callback(err);
                           } else {
                              console.log(data);

                              videoInfo.fileurl = data.Location;

                              fs.unlink(videoFile.path, function() {
                                 console.log('동영상 삭제 완료');
                              });

                              s3 = new AWS.S3({
                                 "accessKeyId" : s3config.key,
                                 "secretAccessKey" : s3config.secret,
                                 "region" : s3config.region,
                                 "params" : {
                                    "Bucket" : s3config.bucket,
                                    "Key" : s3config.thumbnailDir + "/" + path.basename(thumbnailFile.path),
                                    "ACL" : s3config.thumbnailACL,
                                    "ContentType" : thumbnailMimeType
                                 }
                              });

                              var body = fs.createReadStream(thumbnailFile.path);
                              s3.upload({"Body" : body})
                                 .on('httpUploadProgress', function(event) {
                                    console.log(event);
                                 })
                                 .send(function(err, data) {
                                    if(err) {
                                       console.log(err);
                                       callback(err);
                                    } else {
                                       console.log(data);

                                       thumbnailInfo.fileurl = data.Location;

                                       fs.unlink(thumbnailFile.path, function() {
                                          console.log('썸네일 삭제 완료');
                                       });

                                       callback(null, articleinfo, videoInfo, thumbnailInfo, connection);
                                    }
                                 });
                           }
                        });

                  }
               }
            });
         }
      }

      function insertEpromotion(articleinfo, videoInfo, thumbnailInfo, connection, callback) {
         var insert = "insert into epromotion(title, cname, sdate, edate, content, iparty_id, fileurl, uploaddate, originalfilename, modifiedfilename, filetype) "+
            "values(?, ?, ?, ?, ?, ?, ?, now(), ?, ?, ?)";
         connection.query(insert, [articleinfo.title, articleinfo.company, articleinfo.startDate, articleinfo.endDate, articleinfo.content, req.user.id, videoInfo.fileurl, videoInfo.originalfilename, videoInfo.modifiedfilename, videoInfo.filetype], function(err, result) { //로그인필요
            if(err) {
               connection.release();
               callback(err);
            } else {
               var orderId = result.insertId;
               var insertPhoto = "insert into photos(photourl, uploaddate, originalfilename, modifiedfilename, phototype, refer_type, refer_id) "+
                                  "values(?, now(), ?, ?, ?, 2, ?)";
               connection.query(insertPhoto, [thumbnailInfo.fileurl, thumbnailInfo.originalfilename, thumbnailInfo.modifiedfilename, thumbnailInfo.filetype, orderId], function(err, result) {
                  connection.release();
                  if(err) {
                     callback(err);
                  } else {
                     callback(null, {"message" : "글이 정상적으로 저장되었습니다."})
                  }
               });

            }
         })
      }

      async.waterfall([getConnection, uploadFiles, insertEpromotion], function(err, message) {
         if(err) {
            next(err);
         } else {
            res.json(message)
         }
      })



   } else {
      var err = new Error('SSL/TLS Upgreade Required...');
      err.status = 426;
      next(err);
   }
});

router.put('/:articleid', isLoggedIn, function(req, res, next) {
   if(req.secure) {
      var articleid = req.params.articleid

      var form = new formidable.IncomingForm();
      form.uploadDir = path.join(__dirname, '../uploads');
      form.keepExtensions = true;
      form.multiples = true;

      //1. getConnection
      function getConnection(callback) {
         pool.getConnection(function(err, connection) {
            if(err) {
               callback(err);
            } else {
               callback(null, connection);
            }
         })
      }
      //2.selectEpromotion
      function selectEpromotion(connection, callback) {
         var select = "select fileurl, modifiedfilename as filename "+
            "from epromotion "+
            "where id = ?";
         connection.query(select, [articleid], function(err, results) {
            if(err) {
               connection.release();
               callback(err);
            } else {
               callback(null, results[0], connection);
            }
         });
      }

      //3. updateEpromotion
      function updateEpromotion(fileinfo, connection, callback) {

         var mimeType = mime.lookup(path.basename(fileinfo.fileurl));

         var s3 = new AWS.S3({
            "accessKeyId" : s3config.key,
            "secretAccessKey" : s3config.secret,
            "region" : s3config.region,
            "params" : {
               "Bucket" : s3config.bucket,
               "Key" : s3config.multimediaDir + "/" + fileinfo.filename,
               "ACL" : s3config.multimediaACL,
               "ContentType" : mimeType
            }
         });

         form.parse(req, function(err, fields, files) {
            if(err) {
               callback(err);
            } else {
               var title = fields.title;
               var content = fields.content;
               var startDate = fields.startDate;
               var endDate = fields.endDate;
               var company = fields.company;
               var filereplacement = fields.filereplacement;

               if(filesreplacement = "true") {
                  var thumbnailurl;

                  var select = "select photourl "+
                               "from photos "+
                               "where refer_type = 2 and refer_id = ?";
                  connection.query(select, [articleid], function(err, results) {
                     if(err) {
                        connection.release();
                        callback(err);
                     } else {
                        thumbnailurl = results[0].fileurl;
                     }
                  });

                  var videoMimeType = mime.lookup(path.basename(fileinfo.fileurl));
                  var thumbnailMimeType = mime.lookup(path.basename(thumbnailurl));

                  var s3 = new AWS.S3({
                     "accessKeyId" : s3config.key,
                     "secretAccessKey" : s3config.secret,
                     "region" : s3config.region,
                     "params" : {
                        "Bucket" : s3config.bucket,
                        "Key" : s3config.multimediaDir + "/" + path.basename(fileinfo.fileurl),
                        "ACL" : s3config.multimediaACL,
                        "ContentType" : videoMimeType
                     }
                  });

                  s3.deleteObject(s3.params, function(err, data) {
                     if(err) {
                        callback(err);
                     } else {
                        console.log(data);
                     }
                  });

                  s3 = new AWS.S3({
                     "accessKeyId" : s3config.key,
                     "secretAccessKey" : s3config.secret,
                     "region" : s3config.region,
                     "params" : {
                        "Bucket" : s3config.bucket,
                        "Key" : s3config.thumbnailDir + "/" + path.basename(thumbnailurl),
                        "ACL" : s3config.thumbnailACL,
                        "ContentType" : thumbnailMimeType
                     }
                  });

                  s3.deleteObject(s3.params, function(err, data) {
                     if(err) {
                        callback(err);
                     } else {
                        console.log(data);
                     }
                  });

                  var deletePhoto = "delete from photos "+
                                    "where refer_type = 2 and refer_id = ?";
                  connection.query(deletePhoto, [articleid], function(err) {
                     if(err) {
                        connection.release();
                        callback(err);
                     }
                  });

                  var videofile = files['multimedia'];
                  var thumbnailfile = files['thumbnail'];

                  videoMimeType = mime.lookup(path.basename(videofile.path));

                  var s3 = new AWS.S3({
                     "accessKeyId" : s3config.key,
                     "secretAccessKey" : s3config.secret,
                     "region" : s3config.region,
                     "params" : {
                        "Bucket" : s3config.bucket,
                        "Key" : s3config.multimediaDir + "/" + path.basename(videofile.path),
                        "ACL" : s3config.multimediaACL,
                        "ContentType" : videoMimeType
                     }
                  });

                  var body = fs.createReadStream(videofile.path);
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

                           fs.unlink(videofile.path, function() {
                              console.log(videofile.path + " 파일이 삭제되었습니다...");
                           })

                           thumbnailMimeType = mime.lookup(path.basename(thumbnailfile.path));

                           s3 = new AWS.S3({
                              "accessKeyId" : s3config.key,
                              "secretAccessKey" : s3config.secret,
                              "region" : s3config.region,
                              "params" : {
                                 "Bucket" : s3config.bucket,
                                 "Key" : s3config.thumbnailDir + "/" + path.basename(thumbnailfile.fileurl),
                                 "ACL" : s3config.thumbnailACL,
                                 "ContentType" : thumbnailMimeType
                              }
                           });

                           var body = fs.createReadStream(thumbnailfile.path);
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

                                    var insert = "insert into photos(photourl, uploaddate, originalfilename, modifiedfilename, phototype, refer_type, refer_id) "+
                                       "values(?, now(), ?, ?, ?, 2, ?)";
                                    connection.query(insert, [data.Location, path.basename(thumbnailfile.name, path.extname(thumbnailfile.name)), path.basename(thumbnailfile.path), thumbnailfile.type, articleid], function(err) {
                                       if(err) {
                                          callback(err);
                                       }
                                    });
                                 }
                              });

                           var update = "update epromotion "+
                              "set fileurl = ?, "+
                              "    uploaddate = now(), "+
                              "    originalfilename = ?, "+
                              "    modifiedfilename = ?, "+
                              "    filetype = ? "+
                              "where id = ?";
                           connection.query(update, [data.Location, path.basename(videofile.name, path.extname(videofile.name)), path.basename(videofile.path), videofile.type, articleid], function(err, result) {
                              if(err) {
                                 callback(err);
                              } else {
                                 callback(null, {"message" : "해당 글이 수정되었습니다."});
                              }
                           });
                        }
                     })
               }
            }
         });

      }

      async.waterfall([getConnection, selectEpromotion, updateEpromotion], function(err, result) {
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

      //getconnection
      function getConnection(callback) {
         pool.getConnection(function (err, connection) {
            if (err) {
               callback(err);
            } else {
               callback(null, connection);
            }
         })
      }

      //selectEpromotion해서 fileurl불러오기
      function selectEpromotion(connection, callback) {
         var select = "select fileurl " +
            "from epromotion " +
            "where id = ?";
         connection.query(select, [articleid], function (err, results) {
            if (err) {
               connection.release();
               callback(err);
            } else {
               var thumbnailSelect = "select photourl "+
                  "from photos "+
                  "where refer_type = 2 and refer_id = ?";
               connection.query(thumbnailSelect, [articleid], function(err, thumbnailResults) {
                  if(err) {
                     connection.release();
                     callback(err);
                  } else {
                     callback(null, results[0].fileurl, thumbnailResults[0].photourl, connection);
                  }
               });

            }
         });
      }

      //s3에 파일 삭제
      function deleteFile(fileurl, thumbnailurl, connection, callback) {
         var mimeType = mime.lookup(path.basename(fileurl));

         var s3 = new AWS.S3({
            "accessKeyId": s3config.key,
            "secretAccessKey": s3config.secret,
            "region": s3config.region,
            "params": {
               "Bucket": s3config.bucket,
               "Key": s3config.multimediaDir + "/" + path.basename(fileurl),
               "ACL": s3config.multimediaACL,
               "ContentType": mimeType
            }
         });

         s3.deleteObject(s3.params, function (err, data) {
            if (err) {
               callback(err);
            } else {
               console.log(data);
            }
         });

         var mimeType = mime.lookup(path.basename(thumbnailurl));

         s3 = new AWS.S3({
            "accessKeyId": s3config.key,
            "secretAccessKey": s3config.secret,
            "region": s3config.region,
            "params": {
               "Bucket": s3config.bucket,
               "Key": s3config.thumbnailDir + "/" + path.basename(thumbnailurl),
               "ACL": s3config.thumbnailACL,
               "ContentType": mimeType
            }
         });

         s3.deleteObject(s3.params, function (err, data) {
            if (err) {
               callback(err);
            } else {
               console.log(data);
            }
         });

         callback(null, connection);
      }

      //deleteEpromotion
      function deleteEpromotionAndPhoto(connection, callback) {
         var deleteSql = "delete from epromotion " +
            "where id = ?";
         connection.query(deleteSql, [articleid], function (err, result) {
            if (err) {
               connection.release();
               callback(err);
            } else {
               var deletePhoto = "delete from photos "+
                  "where refer_type = 2 and refer_id = ?";
               connection.query(deletePhoto, [articleid], function(err, result) {
                  connection.release();
                  if(err) {
                     callback(err);
                  } else {
                     callback(null, {"message": "해당 글이 삭제되었습니다."});
                  }
               });

            }
         })
      }

      async.waterfall([getConnection, selectEpromotion, deleteFile, deleteEpromotionAndPhoto], function (err, result) {
         if (err) {
            err.message = "해당 글의 삭제에 실패하였습니다...";
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

router.get('/searching', function(req, res, next) {
   if(req.secure) {
      //1. getConnection
      function getConnection(callback) {
         pool.getConnection(function(err, connection) {
            if(err) {
               callback(err);
            } else {
               callback(null, connection);
            }
         })
      }
      //2. get total
      function getTotal(connection, callback) {
         var select = "select count(id) as cnt "+
            "from epromotion";
         connection.query(select, [], function(err, results) {
            if(err) {
               connection.release();
               callback(err);
            } else {
               var total = results[0].cnt;
               callback(null, total, connection);
            }
         });
      }
      //3. select epromotion & paging
      function selectGreenplayer(total, connection, callback) {
         var search = '%'+req.query.search+'%';
         var type = req.query.type;
         var page = parseInt(req.query.page);
         page = (isNaN(page))? 1 : page;
         page = (page<1) ? 1 : page;

         limit = parseInt(req.query.limit);
         offset = limit * (page - 1);

         if(type === 'title') {
            var select = "select id, title, cname, sdate, edate, fileurl, date_format(CONVERT_TZ(uploaddate,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as uploaddate, originalfilename, modifiedfilename, filetype, content "+
               "from epromotion "+
               "where title like ? "+
               "order by id desc limit ? offset ?";
            connection.query(select, [search, limit, offset] , function(err, results) {
               connection.release();
               if(err) {
                  callback(err);
               } else {
                  var info = {
                     "result" : {
                        "total" : total,
                        "page" : page,
                        "listPerPage" : limit,
                        "list" : []
                     }
                  };
                  async.each(results, function(item, callback) {
                     info.result.list.push({
                        "epId" : item.id,
                        "title" : item.title,
                        "content" : item.content,
                        "epName" : item.cname,
                        "sDate" : item.sDate,
                        "eDate" : item.eDate,
                        "fileurl" : item.fileurl,
                        "uploaddate" : item.uploaddate,
                        "originalfilename" : item.originalfilename,
                        "modifiedfilename" : item.modifiedfilename,
                        "filetype" : item.filetype
                     });
                  }, function(err) {
                     if(err)
                        callback(err);
                  });
                  callback(null, info);
               }
            });
         }
         if(type === 'cname') {
            var select = "select id, title, cname, sdate, edate, fileurl, date_format(CONVERT_TZ(uploaddate,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as uploaddate, originalfilename, modifiedfilename, filetype, content "+
               "from epromotion "+
               "where cname like ? "+
               "order by id desc limit ? offset ?";
            connection.query(select, [search, limit, offset] , function(err, results) {
               connection.release();
               if(err) {
                  callback(err);
               } else {
                  var info = {
                     "result" : {
                        "total" : total,
                        "page" : page,
                        "listPerPage" : limit,
                        "list" : []
                     }
                  };
                  async.each(results, function(item, callback) {
                     info.result.list.push({
                        "epId" : item.id,
                        "title" : item.title,
                        "content" : item.content,
                        "epName" : item.cname,
                        "sDate" : item.sDate,
                        "eDate" : item.eDate,
                        "fileurl" : item.fileurl,
                        "uploaddate" : item.uploaddate,
                        "originalfilename" : item.originalfilename,
                        "modifiedfilename" : item.modifiedfilename,
                        "filetype" : item.filetype
                     });
                  }, function(err) {
                     if(err)
                        callback(err);
                  });
                  callback(null, info);
               }
            });
         }
      }

      async.waterfall([getConnection, getTotal, selectGreenplayer], function(err, info) {
         if(err) {
            err.message = "검색에 실패하였습니다.";
            next(err);
         } else {
            res.json(info);
         }
      });
   } else {
      var err = new Error('SSL/TLS Upgreade Required...');
      err.status = 426;
      next(err);
   }
});

module.exports = router;