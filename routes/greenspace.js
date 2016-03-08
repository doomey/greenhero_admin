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
   if(req.secure) {
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
      //2. 전체 게시글 갯수 select
      function selectTotal(connection, callback) {
         var select = "SELECT count(id) as cnt "+
            "FROM greendb.e_diary";
         connection.query(select, [], function(err, results) {
            if(err) {
               connection.release();
               callback(err);
            } else {
               callback(null, results[0].cnt, connection);
            }
         });
      }
      //3. 게시글 페이징처리
      function selectGreenspace(total, connection, callback) {
         var page = parseInt(req.query.page);
         page = (isNaN(page))? 1 : page;
         page = (page < 1) ?  1 : page;

         var limit = 10;
         var offset = limit * (page - 1);

         var select = "select e.id as eid, i.nickname as nickname, e.title as title, e.content as body, e.heart as heart, date_format(CONVERT_TZ(e.wdatetime,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as wdatetime "+
            "from greendb.e_diary e join greendb.iparty i on (e.iparty_id = i.id) "+
            "order by eid desc limit ? offset ?";
         connection.query(select, [limit, offset], function(err, results) {
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
      async.waterfall([getConnection, selectTotal, selectGreenspace], function(err, info) {
         if(err) {
            err.message = "게시글 목록을 불러올 수 없습니다.";
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
            "FROM greendb.e_diary";
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

         limit = 10;
         offset = limit * (page - 1);

         if (type === 'title') {
            var select = "select e.id as eid, i.nickname as nickname, e.title as title, e.content as body, e.heart as heart, date_format(CONVERT_TZ(e.wdatetime,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as wdatetime " +
               "from greendb.e_diary e join greendb.iparty i on (e.iparty_id = i.id) " +
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
         if (type === 'nickname') {
            var select = "select e.id as eid, i.nickname as nickname, e.title as title, e.content as body, e.heart as heart, date_format(CONVERT_TZ(e.wdatetime,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as wdatetime " +
               "from greendb.e_diary e join greendb.iparty i on (e.iparty_id = i.id) " +
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
               "from greendb.e_diary e join greendb.iparty i on (e.iparty_id = i.id) "+
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
            "from greendb.e_diary e join greendb.iparty i on (e.iparty_id = i.id) "+
            "where e.id = ?";
         connection.query(select, [articleid], function(err, results) {
               if (err) {
                  connection.release();
                  callback(err);
               } else {
                  var bginfo = {};
                  console.log('여기', results[0].bid);
                  if(results[0].bid !== null) {
                     var selectBG = "select name, path "+
                        "from greendb.background "+
                        "where id = ?";
                     connection.query(selectBG, [results[0].bid], function(err, rsts) {
                        if(err) {
                           connection.release();
                           callback(err);
                        } else {
                           bginfo.bid = results[0].bid;
                           bginfo.name = rsts[0].name;
                           bginfo.path = rsts[0].path;
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
      //3. 포토 select
      function selectPhotos(info, connection, callback) {
         var select = "select id, photourl, originalfilename "+
            "from greendb.photos "+
            "where refer_id = ? and refer_type = 1";
         connection.query(select, [articleid], function(err, results) {
            if(err) {
               connection.release();
               callback(err);
            } else {
               async.each(results, function(result, callback) {
                  info.result.photo.push({
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
               callback(null, info, connection);
            }
         });
      }
      //4. 댓글 select
      function selectReply(info, connection, callback) {
         var select = "select r.id as rid, r.body as body, date_format(CONVERT_TZ(r.wdatetime,'+00:00','+9:00'),'%Y-%m-%d %H:%i:%s') as wdatetime, i.nickname "+
            "from greendb.reply r join greendb.iparty i on (r.iparty_id = i.id) "+
            "where r.ediary_id = ?";
         connection.query(select, [articleid], function(err, results) {
            connection.release();
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

      async.waterfall([getConnection, selectGreenspace, selectPhotos, selectReply], function(err, info) {
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
            var deleteSql = "delete from greendb.reply "+
               "where ediary_id = ?";
            connection.query(deleteSql, [articleid], function(err) {
               if(err) {
                  connection.release();
                  callback(err);
               }
            });
            //S3에 업로드된 파일 삭제
            var selectPhotos = "select id, modifiedfilename, phototype "+
               "from greendb.photos "+
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
                           "Key" : s3config.imageDir + "/" + result.modifiedfilename,
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
                     var deletePhotos = "delete from greendb.photos "+
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
            var deleteGreenspace = "delete from greendb.e_diary "+
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
         });
      }

      async.waterfall([getConnection, deleteTransaction], function(err, result) {
         if(err) {
            err.message = "게시글을 삭제하지 못했습니다.";
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