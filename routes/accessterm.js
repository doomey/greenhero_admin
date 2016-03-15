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
   //2. 전체 게시글 갯수 count(id)
   function getTotal(connection, callback) {
      var select = "select count(id) as cnt "+
         "from article "+
         "where board_id = 2";
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
   function selectAccessterm(total, connection, callback) {
      var page = parseInt(req.query.page);
      page = (isNaN(page))? 1 : page;
      page = (page < 1)? 1 : page;

      var limit = parseInt(req.query.limit);
      var offset = limit * (page - 1);

      var select = "select id, title, body, date_format(CONVERT_TZ(now(), '+00:00', '+9:00'), '%Y-%m-%d %H:%i:%s') as wdatetime "+
                   "from article "+
                   "where board_id = 2 "+
                   "order by id desc limit ? offset ?";
      connection.query(select, [limit, offset] , function(err, results) {
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
                     "total" : total,
                     "page" : page,
                     "listPerPage" : limit,
                     "list" : []
                  }
               };

               async.each(results, function(result, cb) {
                  info.result.list.push({
                     "result" : {
                        "id" : result.id,
                        "type" : 2,
                        "title" : result.title,
                        "date" : result.wdatetime,
                        "body" : result.body
                     }
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
         }
      });
   }

   async.waterfall([getConnection, getTotal, selectAccessterm], function(err, info) {
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
      var insert = "insert into article(title, body, wdatetime, board_id) "+
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
      var update = "update article "+
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
      var deleteSql = "delete from article "+
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
         "where board_id = 2";
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
   //3. select faq & paging
   function selectfaq(total, connection, callback) {
      var search = '%'+req.query.search+'%';
      var type = req.query.type;
      var page = parseInt(req.query.page);
      page = (isNaN(page))? 1 : page;
      page = (page < 1)? 1 : page;

      var limit = parseInt(req.query.limit) || 10;
      var offset = limit * (page - 1);

      if(type === "title") {
         select = "select id, title, body, date_format(CONVERT_TZ(wdatetime, '+00:00', '+9:00'), '%Y-%m-%d %H:%i:%s') as wdatetime "+
            "from article "+
            "where board_id = 2 and title like ? "+
            "order by id desc limit ? offset ?";

         connection.query(select, [search, limit, offset], function(err, results) {
            connection.release();
            if(err) {
               callback(err);
            } else {
               if(results.length === 0) {
                  res.json({"message" : "FAQ가 없습니다."});
               } else {
                  var info = {
                     "result" : {
                        "total" : total,
                        "page" : page,
                        "listPerPage" : limit,
                        "list" : []
                     }
                  };

                  async.each(results, function(result, cb) {
                     info.result.list.push({
                        "result" : {
                           "id" : result.id,
                           "type" : 2,
                           "title" : result.title,
                           "date" : result.wdatetime,
                           "body" : result.body
                        }
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

            }
         });
      }

      if(type === "body") {
         select = "select id, title, body, date_format(CONVERT_TZ(wdatetime, '+00:00', '+9:00'), '%Y-%m-%d %H:%i:%s') as wdatetime "+
            "from article "+
            "where board_id = 2 and body like ? "+
            "order by id desc limit ? offset ?";


         connection.query(select, [search, limit, offset], function(err, results) {
            connection.release();
            if(err) {
               callback(err);
            } else {
               if(results.length === 0) {
                  res.json({"message" : "FAQ가 없습니다."});
               } else {
                  var info = {
                     "result" : {
                        "total" : total,
                        "page" : page,
                        "listPerPage" : limit,
                        "list" : []
                     }
                  };

                  async.each(results, function(result, cb) {
                     info.result.list.push({
                        "result" : {
                           "id" : result.id,
                           "type" : 2,
                           "title" : result.title,
                           "date" : result.wdatetime,
                           "body" : result.body
                        }
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

            }
         });
      }

   }

   async.waterfall([getConnection, getTotal, selectfaq], function(err, info) {
      if(err) {
         err.message = "검색에 실패하였습니다.";
         next(err);
      } else {
         res.json(info);
      }
   });
});

module.exports = router;