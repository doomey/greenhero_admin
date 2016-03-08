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
            "from greendb.epromotion";
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

         limit = 10;
         offset = limit * (page - 1);

         //안드로이드에서 게시글 번호 붙이기 -> offset과 info.result.list의 인덱스를 이용하여 글 번호를 붙일것.
         var select = "select id, title, cname, sdate, edate, fileurl, date_format(CONVERT_TZ(uploaddate,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as uploaddate, originalfilename, modifiedfilename, filetype, content "+
            "from greendb.epromotion "+
            "order by id desc limit ? offset ?";
         connection.query(select, [limit, offset] , function(err, results) {
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
      //동영상 업로드
      function uploadMultimedia(connection, callback) { //angularjs에서 mp4, avi만 올릴 수 있게 만들기.
         var form = new formidable.IncomingForm();
         form.uploadDir = path.join(__dirname, '../uploads');
         form.keepExtensions = true;
         form.multiples = true;

         form.parse(req, function(err, fields, files) { //fields에 title, content등등 넘어옴
            if(files['multimedia'] instanceof Array) {
               var err = new Error('다중 동영상 업로드는 지원하지 않습니다.');
               next(err);
            } else if(!files['multimedia']) {
               var err = new Error('반드시 동영상은 업로드되어야 합니다.');
               next(err);
            } else {
               var file = files['multimedia'];

               var mimeType = mime.lookup(path.basename(file.path));

               var s3 = new AWS.S3({
                  "accessKeyId" : s3config.key,
                  "secretAccessKey" : s3config.secret,
                  "region" : s3config.region,
                  "params" : {
                     "Bucket" : s3config.bucket,
                     "Key" : s3config.multimediaDir + "/" + path.basename(file.path),
                     "ACL" : s3config.multimediaACL,
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
                           console.log(file.path + " 파일이 삭제되었습니다.");
                        });

                        var info = {
                           "title" : fields.title,
                           "content" : fields.content,
                           "company" : fields.company,
                           "startDate" : fields.startDate,
                           "endDate" : fields.endDate,
                           "fileurl" : data.Location,
                           "originalfilename" : file.name,
                           "modifiedfilename" : path.basename(file.path),
                           "filetype" : file.type
                        };

                        callback(null, info, connection);
                     }
                  })
            }
         })
      }
      //epromotion테이블 insert
      function insertEpromotion(info, connection, callback) {
         var insert = "insert into greendb.epromotion(title, cname, sdate, edate, content, iparty_id, fileurl, uploaddate, originalfilename, modifiedfilename, filetype) "+
            "values(?, ?, ?, ?, ?, ?, ?, now(), ?, ?, ?)";
         connection.query(insert, [info.title, info.company, info.startDate, info.endDate, info.content, 1, info.fileurl, info.originalfilename, info.modifiedfilename, info.filetype], function(err, result) { //로그인필요
            connection.release();
            if(err) {
               callback(err);
            } else {
               callback(null, {"message" : "greenplayer에 글을 작성하였습니다."});
            }
         })
      }
      async.waterfall([getConnection, uploadMultimedia, insertEpromotion], function(err, result) {
         if(err) {
            err.message = "글 작성에 실패하였습니다.";
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
            "from greendb.epromotion "+
            "where id = ?";
         connection.query(select, [articleid], function(err, results) {
            if(err) {
               connection.release();
               callback(err);
            } else {
               console.log('리저트 : ', results[0]);
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
            var title = fields.title;
            var content = fields.content;
            var startDate = fields.startDate;
            var endDate = fields.endDate;
            var company = fields.company;
            var filestatus = fields.filestatus;

            if(filestatus = "replacefile") {
               var mimeType = mime.lookup(path.basename(fileinfo.fileurl));

               var s3 = new AWS.S3({
                  "accessKeyId" : s3config.key,
                  "secretAccessKey" : s3config.secret,
                  "region" : s3config.region,
                  "params" : {
                     "Bucket" : s3config.bucket,
                     "Key" : s3config.multimediaDir + "/" + path.basename(fileinfo.fileurl),
                     "ACL" : s3config.multimediaACL,
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

               var file = files['multimedia'];

               mimeType = mime.lookup(path.basename(file.path));

               var s3 = new AWS.S3({
                  "accessKeyId" : s3config.key,
                  "secretAccessKey" : s3config.secret,
                  "region" : s3config.region,
                  "params" : {
                     "Bucket" : s3config.bucket,
                     "Key" : s3config.multimediaDir + "/" + path.basename(file.fileurl),
                     "ACL" : s3config.multimediaACL,
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

                        var update = "update greendb.epromotion "+
                           "set fileurl = ?, "+
                           "    uploaddate = now(), "+
                           "    originalfilename = ?, "+
                           "    modifiedfilename = ?, "+
                           "    filetype = ? "+
                           "where id = ?";
                        connection.query(update, [data.Location, path.basename(file.name, path.extname(file.name)), path.basename(file.path), file.type, articleid], function(err, result) {
                           connection.release();
                           if(err) {
                              callback(err);
                           } else {
                              callback(null, {"message" : "해당 글이 수정되었습니다."});
                           }
                        });
                     }
                  })
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
            "from greendb.epromotion " +
            "where id = ?";
         connection.query(select, [articleid], function (err, results) {
            if (err) {
               callback(err);
            } else {
               callback(null, results[0].fileurl, connection);
            }
         });
      }

      //s3에 파일 삭제
      function deleteFile(fileurl, connection, callback) {
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
               callback(null, connection);
            }
         });
      }

      //deleteEpromotion
      function deleteEpromotion(connection, callback) {
         var deleteSql = "delete from greendb.epromotion " +
            "where id = ?";
         connection.query(deleteSql, [articleid], function (err, result) {
            connection.release();
            if (err) {
               callback(err);
            } else {
               callback(null, {"message": "해당 글이 삭제되었습니다."});
            }
         })
      }

      async.waterfall([getConnection, selectEpromotion, deleteFile, deleteEpromotion], function (err, result) {
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
            "from greendb.epromotion";
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

         limit = 10;
         offset = limit * (page - 1);

         if(type === 'title') {
            var select = "select id, title, cname, sdate, edate, fileurl, date_format(CONVERT_TZ(uploaddate,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as uploaddate, originalfilename, modifiedfilename, filetype, content "+
               "from greendb.epromotion "+
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
               "from greendb.epromotion "+
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