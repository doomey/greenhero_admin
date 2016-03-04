var express = require('express');
var router = express.Router();
var async = require('async');

//운영정책 보기
router.get('/', function(req, res, next) {
   //1. 커넥션
   function getConnection(callback) {
      pool.getConnection(function(err, connection) {
         if(err) {
            callback(err);
         } else {
            callback(null, connection);
         }
      })
   }
   //2. 전체 게시글 갯수 count(id)
   function getTotal(connection, callback) {
      var select = "select count(id) as cnt "+
                   "from greendb.article "+
                   "where board_id = 4";
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
   //3. 페이징 처리 select
   function selectPolicy(total, connection, callback) {
      var page = parseInt(req.query.page);
      page = (isNaN(page))? 1 : page;
      page = (page<1) ? 1 : page;

      limit = 10;
      offset = limit * (page - 1);

      //안드로이드에서 게시글 번호 붙이기 -> offset과 info.result.list의 인덱스를 이용하여 글 번호를 붙일것.
      var select = "select id, title, body, date_format(CONVERT_TZ(now(), '+00:00', '+9:00'), '%Y-%m-%d %H:%i:%s') as wdatetime "+
                   "from greendb.article "+
                   "where board_id = 4 "+
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
            var date = new Date();
            async.each(results, function(item, callback) {
               info.result.list.push({
                  "id" : item.id,
                  "type" : 4,
                  "title" : item.title,
                  "date" : item.wdatetime,
                  "body" : item.body
               });
            }, function(err) {
               if(err)
                  callback(err);
            });
            callback(null, info);
         }
      });
   }
   async.waterfall([getConnection, getTotal, selectPolicy], function(err, info) {
      if(err) {
         err.message = "운영정책 불러오기에 실패하였습니다...";
         err.code = "err025";
         next(err);
      } else {
         res.json(info);
      }
   });
});

//운영정책 쓰기
router.post('/', function(req, res, next) {
   var title = req.body.title;
   var content = req.body.body;

   //getConnection
   function getConnection(callback) {
      pool.getConnection(function(err, connection) {
         if(err) {
            callback(err);
         } else {
            callback(null, connection);
         }
      })
   }
   //게시글 쓰기
   function insertPolicy(connection, callback) {
      var insert = "insert into greendb.article(title, body, wdatetime, board_id) "+
                   "values(?, ?, now(), 4)";
      connection.query(insert, [title, content], function(err, result) {
            if (err) {
               callback(err);
            } else {
               callback(null, {
                  "message" : "운영정책이 작성되었습니다."
               })
            }
         }
      );
   }

   async.waterfall([getConnection, insertPolicy], function(err, result) {
      if(err) {
         err.message = "운영정책 쓰기에 실패하였습니다...";
         next(err);
      } else {
         res.json(result);
      }
   });
});

//운영정책 수정
router.put('/:articleid', function(req, res, next) {
   var articleid = req.params.articleid;
   var title = req.body.title;
   var content = req.body.body;

   //getConnection
   function getConnection(callback) {
      pool.getConnection(function(err, connection) {
         if(err) {
            callback(err);
         } else {
            callback(null, connection);
         }
      })
   }
   //게시글 수정
   function updateNotice(connection, callback) {
      var update = "update greendb.article "+
                    "set title = ?, "+
                    "    body = ?, "+
                    "    wdatetime = now() "+
                    "where id = ?";
      connection.query(update, [title, content, articleid], function(err, result) {
            if (err) {
               callback(err);
            } else {
               callback(null, {
                  "message" : "운영정책이 수정되었습니다."
               })
            }
         }
      );
   }

   async.waterfall([getConnection, updateNotice], function(err, result) {
      if(err) {
         err.message = "운영정책 수정에 실패하였습니다...";
         next(err);
      } else {
         res.json(result);
      }
   });
});
//운영정책 삭제
router.delete('/:articleid', function(req, res, next) {
   var articleid = req.params.articleid;

   //getConnection
   function getConnection(callback) {
      pool.getConnection(function(err, connection) {
         if(err) {
            callback(err);
         } else {
            callback(null, connection);
         }
      })
   }
   //게시글 삭제
   function deletePolicy(connection, callback) {
      var deleteSql = "delete from greendb.article "+
                      "where id = ?";
      connection.query(deleteSql, [articleid], function(err, result) {
            if (err) {
               callback(err);
            } else {
               callback(null, {
                  "message" : "운영정책이 삭제되었습니다."
               })
            }
         }
      );
   }

   async.waterfall([getConnection, deletePolicy], function(err, result) {
      if(err) {
         err.message = "운영정책 삭제에 실패하였습니다...";
         next(err);
      } else {
         res.json(result);
      }
   });
});

module.exports = router;