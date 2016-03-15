var express = require('express');
var router = express.Router();
var async = require('async');

//공지사항 보기
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
                   "from article "+
                   "where board_id = 1";
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
   function selectNotice(total, connection, callback) {
      var page = parseInt(req.query.page);
      page = (isNaN(page))? 1 : page;
      page = (page<1) ? 1 : page;

      limit = parseInt(req.query.limit) || 10;
      offset = limit * (page - 1);

      //안드로이드에서 게시글 번호 붙이기 -> offset과 info.result.list의 인덱스를 이용하여 글 번호를 붙일것.
      var select = "select id, title, body, date_format(CONVERT_TZ(now(), '+00:00', '+9:00'), '%Y-%m-%d %H:%i:%s') as wdatetime "+
                   "from article "+
                   "where board_id = 1 "+
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
                  "type" : 1,
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
   async.waterfall([getConnection, getTotal, selectNotice], function(err, info) {
      if(err) {
         err.message = "공지사항 불러오기에 실패하였습니다...";
         err.code = "err022";
         next(err);
      } else {
         res.json(info);
      }
   });
});

//공지사항 쓰기
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
   function insertNotice(connection, callback) {
      var insert = "insert into article(title, body, wdatetime, board_id) "+
                   "values(?, ?, now(), 1)";
      connection.query(insert, [title, content], function(err, result) {
            if (err) {
               callback(err);
            } else {
               callback(null, {
                  "message" : "게시글이 작성되었습니다."
               })
            }
         }
      );
   }

   async.waterfall([getConnection, insertNotice], function(err, result) {
      if(err) {
         err.message = "게시글 쓰기에 실패하였습니다...";
         next(err);
      } else {
         res.json(result);
      }
   });
});

//공지사항 수정
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
      var update = "update article "+
                    "set title = ?, "+
                    "    body = ?, "+
                    "    wdatetime = now() "+
                    "where id = ?";
      connection.query(update, [title, content, articleid], function(err, result) {
            if (err) {
               callback(err);
            } else {
               callback(null, {
                  "message" : "게시글이 수정되었습니다."
               })
            }
         }
      );
   }

   async.waterfall([getConnection, updateNotice], function(err, result) {
      if(err) {
         err.message = "게시글 수정에 실패하였습니다...";
         next(err);
      } else {
         res.json(result);
      }
   });
});
//공지사항 삭제
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
   function deleteNotice(connection, callback) {
      var deleteSql = "delete from article "+
                      "where id = ?";
      connection.query(deleteSql, [articleid], function(err, result) {
            if (err) {
               callback(err);
            } else {
               callback(null, {
                  "message" : "게시글이 삭제되었습니다."
               })
            }
         }
      );
   }

   async.waterfall([getConnection, deleteNotice], function(err, result) {
      if(err) {
         err.message = "게시글 삭제에 실패하였습니다...";
         next(err);
      } else {
         res.json(result);
      }
   });
});

router.get('/searching', function(req, res, next) {
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
         "from article "+
         "where board_id = 1";
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
   //3. select notice & paging
   function selectNotice(total, connection, callback) {
      var search = '%'+req.query.search+'%';
      var type = req.query.type;
      var page = parseInt(req.query.page);
      page = (isNaN(page))? 1 : page;
      page = (page < 1)? 1 : page;

      var limit = parseInt(req.query.limit) || 10;
      var offset = limit * (page - 1);

      if(type === "title") {
         var select = "select id, title, body, date_format(CONVERT_TZ(now(), '+00:00', '+9:00'), '%Y-%m-%d %H:%i:%s') as wdatetime "+
            "from article "+
            "where board_id = 1 and title like ?"+
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
               var date = new Date();
               async.each(results, function(item, callback) {
                  info.result.list.push({
                     "id" : item.id,
                     "type" : 1,
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

      if(type === "body") {
         var select = "select id, title, body, date_format(CONVERT_TZ(now(), '+00:00', '+9:00'), '%Y-%m-%d %H:%i:%s') as wdatetime "+
            "from article "+
            "where board_id = 1 and body like ?"+
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
               var date = new Date();
               async.each(results, function(item, callback) {
                  info.result.list.push({
                     "id" : item.id,
                     "type" : 1,
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

   }

   async.waterfall([getConnection, getTotal, selectNotice], function(err, info) {
      if(err) {
         err.message = "검색에 실패하였습니다.";
         next(err);
      } else {
         res.json(info);
      }
   });
});

module.exports = router;