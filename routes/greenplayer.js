var express = require('express');
var router = express.Router();
var async = require('async');
var formidable = require('formidable');
var AWS = require('aws-sdk');
var s3config = require('../config/s3config');
var fs = require('fs');
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
                   "from greendb.epromotion limit ? offset ?";
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
});

router.post('/', function(req, res, next) {
   var title = req.body.title;
   var company = req.body.company;
   var startDate = req.body.startDate;
   var endDate = req.body.endDate;
   var content = req.body.content;

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
   function uploadMultimedia(connection, callback) {
      var form = new formidable.IncomingForm();
      form.uploadDir = path.join(__dirname, '../uploads');
      form.keepExtensions = true;
      form.multiples = true;

      form.parse(req, function(err, fields, files) {
         if(files['multimedia'] instanceof Object) {
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
                        "fileurl" : data.Location,
                        "originalfilename" : file.name,
                        "modifiedfilename" : path.basename(file.path),
                        "filetype" : file.type
                     };

                     callback(null, info, connection);
                  }
               })
         } else if(!files['multimedia']) {
            var info = {
               "fileurl" : null,
               "originalfilename" : null,
               "modifiedfilename" : null,
               "filetype" : null
            };

            callback(null, info, connection);
         } else {
            var err = new Error('다중 동영상 업로드는 지원하지 않습니다.');
            next(err);
         }
      })
   }
   //epromotion테이블 insert
   function insertEpromotion(info, connection, callback) {
      var insert = "insert into greendb.epromotion(title, cname, sdate, edate, content, iparty_id, fileurl, uploaddate, originalfilename, modifiedfilename, filetype) "+
                   "values(?, ?, ?, ?, ?, ?, ?, now(), ?, ?, ?)";
      connection.query(insert, [title, company, startDate, endDate, content, 1, info.fileurl, info.originalfilename, info.modifiedfilename, info.filetype], function(err, result) { //로그인필요
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
});

router.put('/:articleid', function(req, res, next) {
   var articleid = req.params.articleid
});

router.delete('/:articleid', function(req, res, next) {
   var articleid = req.params.articleid
});

module.exports = router;