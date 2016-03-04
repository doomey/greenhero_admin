var express = require('express');
var router = express.Router();
var async = require('async');

//이용약관 보기
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
   //2. 페이징 처리 select
   function selectAccessterm(connection, callback) {
      var select = "select id, title, body, date_format(CONVERT_TZ(now(), '+00:00', '+9:00'), '%Y-%m-%d %H:%i:%s') as wdatetime "+
                   "from greendb.article "+
                   "where board_id = 2";
      connection.query(select, [] , function(err, results) {
         connection.release();
         if(err) {
            callback(err);
         } else {
            if(results.length === 0) {
               res.json({
                  "message" : "이용약관이 없습니다."
               });
            } else {
               var info = {
                  "result" : {
                     "id" : results[0].id,
                     "type" : 2,
                     "title" : results[0].title,
                     "date" : results[0].wdatetime,
                     "body" : results[0].body
                  }
               };
               callback(null, info);
            }
         }
      });
   }
   async.waterfall([getConnection, selectAccessterm], function(err, info) {
      if(err) {
         err.message = "이용약관 불러오기에 실패하였습니다...";
         err.code = "err024";
         next(err);
      } else {
         res.json(info);
      }
   });
});

//이용약관 쓰기
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
   function insertAccessterm(connection, callback) {
      var insert = "insert into greendb.article(title, body, wdatetime, board_id) "+
                   "values(?, ?, now(), 2)";
      connection.query(insert, [title, content], function(err, result) {
            if (err) {
               callback(err);
            } else {
               callback(null, {
                  "message" : "이용약관이 작성되었습니다."
               })
            }
         }
      );
   }

   async.waterfall([getConnection, insertAccessterm], function(err, result) {
      if(err) {
         err.message = "이용약관 쓰기에 실패하였습니다...";
         next(err);
      } else {
         res.json(result);
      }
   });
});

//이용약관 수정
router.put('/', function(req, res, next) {
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
   function updateAccessterm(connection, callback) {
      var update = "update greendb.article "+
                    "set title = ?, "+
                    "    body = ?, "+
                    "    wdatetime = now() "+
                    "where board_id = ?";
      connection.query(update, [title, content, 2], function(err, result) {
            if (err) {
               callback(err);
            } else {
               callback(null, {
                  "message" : "이용약관이 수정되었습니다."
               })
            }
         }
      );
   }

   async.waterfall([getConnection, updateAccessterm], function(err, result) {
      if(err) {
         err.message = "이용약관 수정에 실패하였습니다...";
         next(err);
      } else {
         res.json(result);
      }
   });
});
//이용약관 삭제
router.delete('/', function(req, res, next) {
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
   function deleteAccessterm(connection, callback) {
      var deleteSql = "delete from greendb.article "+
                      "where board_id = 2";
      connection.query(deleteSql, [], function(err, result) {
            if (err) {
               callback(err);
            } else {
               callback(null, {
                  "message" : "이용약관이 삭제되었습니다."
               })
            }
         }
      );
   }

   async.waterfall([getConnection, deleteAccessterm], function(err, result) {
      if(err) {
         err.message = "이용약관 삭제에 실패하였습니다...";
         next(err);
      } else {
         res.json(result);
      }
   });
});

module.exports = router;