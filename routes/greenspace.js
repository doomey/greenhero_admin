var express = require('express');
var router = express.Router();
var async = require('async');
var s3config = require('../config/s3config');
var AWS = require('aws-sdk');
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

//greenspace 게시글 불러오기
router.get('/', isLoggedIn, function(req, res, next) {
   var page = parseInt(req.query.page);
   page = (isNaN(page))? 1 : page;
   page = (page < 1)? 1 : page;

   var limit = parseInt(req.query.limit) || 10;
   var offset = limit * (page - 1);

   var greenspaces = [];
   var sql = "SELECT e.id as id, i.nickname, e.title as title, e.heart as heart, date_format(CONVERT_TZ(e.wdatetime,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as wdatetime, ifnull(r.rAmount,0) as rAmount, b.photourl as backgroundUrl, " +
      "e.content as content, p.photourl as photourl " +
      "FROM e_diary e left join (select ediary_id, count(ediary_id) as rAmount from reply group by ediary_id) r on (e.id = r.ediary_id) " +
      "left join (select refer_id, photourl from photos where refer_type = 1) p on (e.id = p.refer_id) " +
      "left join (select refer_id, photourl from photos where refer_type = 4) b on (e.background_id = b.refer_id) " +
      "left join (select id, nickname from iparty) i on (e.iparty_id = i.id) " +
      "order by id desc limit ? offset ?";
   pool.getConnection(function(err, conn) {
      if (err) {
         next(err);
      } else {
         conn.query(sql, [limit, offset], function(err, rows, fields) {
            conn.release();
            if (err) {
               next(err);
            } else {
               async.each(rows, function(element, callback) {
                  var greenspace = {
                     "id" : element.id,
                     "nickname" : element.nickname,
                     "title" : element.title,
                     "wtime" : element.wdatetime,
                     "eDiaryHeart" : element.heart,
                     "content" : element.content,
                     "backgroundUrl" : element.backgroundUrl,
                     "photoUrl" : element.photourl
                  };
                  greenspaces.push(greenspace);
                  callback();
               }, function(err) {
                  if (err) {
                     next(err);
                  } else {
                     res.json(greenspaces);
                  }
               });
            }
         });
      }
   });
});

router.get('/searching', isLoggedIn, function(req, res, next) {
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
         var select = "SELECT count(id) as cnt "+
            "FROM e_diary";
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
      function selectGreenspace(total, connection, callback) {
         var search = '%' + req.query.search + '%';
         var type = req.query.type;
         var page = parseInt(req.query.page);
         page = (isNaN(page)) ? 1 : page;
         page = (page < 1) ? 1 : page;

         limit = parseInt(req.query.limit) || 10;
         offset = limit * (page - 1);

         if (type === 'title') {
            var select = "select e.id as eid, i.nickname as nickname, e.title as title, e.content as body, e.heart as heart, date_format(CONVERT_TZ(e.wdatetime,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as wdatetime " +
               "from e_diary e join iparty i on (e.iparty_id = i.id) " +
               "where e.title like ? " +
               "order by eid desc limit ? offset ?";
            connection.query(select, [search, limit, offset], function (err, results) {
               connection.release();
               if (err) {
                  callback(err);
               } else {
                  var info = {
                     "result": {
                        "total": total,
                        "page": page,
                        "listPerPage": limit,
                        "list": []
                     }
                  };
                  async.each(results, function (result, callback) {
                     info.result.list.push({
                        "id": result.eid,
                        "nickname": result.nickname,
                        "title": result.title,
                        "content" : result.body,
                        "wtime": result.wdatetime,
                        "eDiaryHeart": result.heart
                     });
                     callback(null, true);
                  }, function (err) {
                     if (err) {
                        callback(err);
                     }
                  });
                  callback(null, info);
               }
            });
         }
         if (type === 'nickname') {
            var select = "select e.id as eid, i.nickname as nickname, e.title as title, e.content as body, e.heart as heart, date_format(CONVERT_TZ(e.wdatetime,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as wdatetime " +
               "from e_diary e join iparty i on (e.iparty_id = i.id) " +
               "where i.nickname like ? " +
               "order by eid desc limit ? offset ?";
            connection.query(select, [search, limit, offset], function (err, results) {
               connection.release();
               if (err) {
                  callback(err);
               } else {
                  var info = {
                     "result": {
                        "total": total,
                        "page": page,
                        "listPerPage": limit,
                        "list": []
                     }
                  };
                  async.each(results, function (element, callback) {
                     info.result.list.push({
                        "id": element.eid,
                        "nickname": element.nickname,
                        "title": element.title,
                        "wtime": element.wdatetime,
                        "eDiaryHeart": element.heart
                     });
                     callback(null, true);
                  }, function (err) {
                     if (err) {
                        callback(err);
                     }
                  });
                  callback(null, info);
               }
            });
         }
         if(type === 'body') {
            var select = "select e.id as eid, i.nickname as nickname, e.title as title, e.content as body, e.heart as heart, date_format(CONVERT_TZ(e.wdatetime,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as wdatetime "+
               "from e_diary e join iparty i on (e.iparty_id = i.id) "+
               "where e.content like ? "+
               "order by eid desc limit ? offset ?";
            connection.query(select, [search, limit, offset], function(err, results) {
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
                  async.each(results, function(element, callback) {
                     info.result.list.push({
                        "id" : element.eid,
                        "nickname" : element.nickname,
                        "title" : element.title,
                        "wtime" : element.wdatetime,
                        "eDiaryHeart" : element.heart
                     });
                     callback(null, true);
                  }, function(err) {
                     if(err) {
                        callback(err);
                     }
                  });
                  callback(null, info);
               }
            });
         }
      }

      async.waterfall([getConnection, getTotal, selectGreenspace], function(err, info) {
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

//greenspace 게시글 상세읽기
router.get('/:articleid', isLoggedIn, function(req, res, next) {
   if(req.secure) {
      var articleid = req.params.articleid;
      //1. 커넥션 연결
      function getConnection(callback) {
         pool.getConnection(function(err, connection) {
            if(err) {
               callback(err);
            } else {
               callback(null, connection);
            }
         });
      }
      //2. 이다이어리 select
      function selectGreenspace(connection, callback) {
         var select = "select e.id as eid, i.nickname as nickname, e.title as title, e.content as body, e.heart as heart, date_format(CONVERT_TZ(e.wdatetime,'+00:00','+9:00'),'%Y-%m-%d%H:%i:%s') as wdatetime, e.background_id as bid "+
            "from e_diary e join iparty i on (e.iparty_id = i.id) "+
            "where e.id = ?";
         connection.query(select, [articleid], function(err, results) {
               if (err) {
                  connection.release();
                  callback(err);
               } else {
                  var bginfo = [];
                  var photoinfo = [];
                  if(results[0].bid !== null) {
                     var select = "select id, photourl, originalfilename "+
                        "from photos "+
                        "where refer_id = ? and refer_type = 4";
                     connection.query(select, [articleid], function(err, results) {
                        if(err) {
                           connection.release();
                           callback(err);
                        } else {
                           async.each(results, function(result, callback) {
                              bginfo.push({
                                 "bgId" : result.id,
                                 "bgURL" : result.photourl,
                                 "bgName" : result.originalfilename
                              });
                              callback(null, true);
                           }, function(err) {
                              if(err) {
                                 callback(err);
                              }
                           });
                        }
                     });
                  } else {
                     var select = "select id, photourl, originalfilename "+
                        "from photos "+
                        "where refer_id = ? and refer_type = 1";
                     connection.query(select, [articleid], function(err, results) {
                        if(err) {
                           connection.release();
                           callback(err);
                        } else {
                           async.each(results, function(result, callback) {
                              photoinfo.push({
                                 "photoId" : result.id,
                                 "photoURL" : result.photourl,
                                 "photoName" : result.originalfilename
                              });
                              callback(null, true);
                           }, function(err) {
                              if(err) {
                                 callback(err);
                              }
                           });
                        }
                     });
                  }
                  var info = {
                     "result" : {
                        "id" : results[0].eid,
                        "nickname" : results[0].nickname,
                        "title" : results[0].title,
                        "body" : results[0].body,
                        "wtime" : results[0].wdatetime,
                        "eDiaryHeart" : results[0].heart,
                        "background" : bginfo,
                        "photo" : [],
                        "reply" : []
                     }
                  };
                  callback(null, info, connection);
               }
            }
         )
      }
      //3. 댓글 select
      function selectReply(info, connection, callback) {
         var select = "select r.id as rid, r.body as body, date_format(CONVERT_TZ(r.wdatetime,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as wdatetime, i.nickname "+
            "from reply r join iparty i on (r.iparty_id = i.id) "+
            "where r.ediary_id = ?";
         connection.query(select, [articleid], function(err, results) {
            if(err) {
               callback(err);
            } else {
               async.each(results, function(result, callback) {
                  info.result.reply.push({
                     "id" : result.rid,
                     "body" : result.body,
                     "wdatetime" : result.wdatetime,
                     "nickname" : result.nickname
                  });
                  callback(null, true);
               }, function(err) {
                  if(err) {
                     callback(err);
                  }
               });
               callback(null, info);
            }
         });
      }

      async.waterfall([getConnection, selectGreenspace, selectReply], function(err, info) {
         if(err) {
            err.message = "게시글을 불러올 수 없습니다.";
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

//greenspace 게시글 삭제
router.delete('/:articleid', isLoggedIn, function(req, res, next) {
   if(req.secure) {
      var articleid = req.params.articleid;
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
      //게시글 삭제 트랜잭션
      function deleteTransaction(connection, callback) {
         connection.beginTransaction(function(err) {
            if(err) {
               callback(err);
            }
            //댓글들 삭제
            var deleteSql = "delete from reply "+
               "where ediary_id = ?";
            connection.query(deleteSql, [articleid], function(err) {
               if(err) {
                  connection.release();
                  callback(err);
               }
            });
            //S3에 업로드된 파일 삭제
            var selectPhotos = "select photourl, phototype "+
               "from photos "+
               "where refer_type = 1 and refer_id = ?";
            connection.query(selectPhotos, [articleid], function(err, results) {
               if(err) {
                  connection.rollback();
                  connection.release();
                  callback(err);
               } else {
                  async.each(results, function(result, callback) {
                     //s3설정
                     var s3 = new AWS.S3({
                        "accessKeyId" : s3config.key,
                        "secretAccessKey" : s3config.secret,
                        "region" : s3config.region,
                        "params" : {
                           "Bucket" : s3config.bucket,
                           "Key" : s3config.imageDir + "/" + path.basename(result.photourl),
                           "ACL" : s3config.imageACL,
                           "ContentType" : result.phototype
                        }
                     });

                     s3.deleteObject(s3.params, function(err, data) {
                        if(err) {
                           connection.rollback();
                           connection.release();
                           callback(err);
                        } else {
                           console.log(data);
                        }
                     });
                     //photo db에 있는 레코더들을 지운다.
                     var deletePhotos = "delete from photos "+
                        "where id = ?";
                     connection.query(deletePhotos, [result.id], function(err) {
                        if(err) {
                           connection.rollback();
                           connection.release();
                           callback(err);
                        }
                     });
                  }, function(err) {
                     if(err) {
                        connection.rollback();
                        connection.release();
                        callback(err);
                     }
                  });
               }
            });
            //게시글 삭제
            var select = "select iparty_id "+
                         "from e_diary "+
                         "where id = ?";
            connection.query(select, [articleid], function(err, results) {
               if(err) {
                  connection.rollback();
                  connection.release();
                  callback(err);
               } else {
                  if(results.length) {
                     var deleteGreenspace = "delete from e_diary "+
                        "where id = ?";
                     connection.query(deleteGreenspace, [articleid], function(err, result) {
                        if(err) {
                           connection.rollback();
                           connection.release();
                           callback(err);
                        } else {
                           connection.commit();
                           connection.release();
                           callback(null, {"message" : "게시글을 삭제하였습니다"});
                        }
                     });
                  } else {
                     var err = new Error('해당 게시글이 없습니다.');
                     connection.rollback();
                     connection.release();
                     callback(err);
                  }
               }
            });
         });
      }

      async.waterfall([getConnection, deleteTransaction], function(err, result) {
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

module.exports = router;