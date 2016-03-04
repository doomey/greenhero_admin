var express = require('express');
var router = express.Router();
var async = require('async');
var passport = require('passport');
var bcrypt = require('bcrypt');

router.post('/login', function(req, res, next) {
   if(req.secure) {
      passport.authenticate('local-login', function(err, user, info) {
         if(err) {
            next(err);
         } else if(!user){
            var err = new Error('암호를 확인하시기 바랍니다...');
            err.status = 401;
            next(err);
         } else {
            req.logIn(user, function(err) {
               if(err) {
                  next(err);
               } else {
                  res.json(user);
               }
            });
         }
      })(req, res, next);
   } else {
      var err = new Error('SSL/TLS Upgrade Required...');
      err.status = 426;
      next(err);
   }
});

router.post('/logout', function(req, res, next) {

   req.logOut();

   res.json({
      "message" : "로그아웃되었습니다."
   });
});

router.post('/signup', function(req, res, next) {

   if(req.secure) {
      var username = req.body.username;
      var password = req.body.password;

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
      //2. 유저 select
      function selectIparty(connection, callback) {
         var select = "select id "+
                      "from greendb.iparty "+
                      "where username = ?";
         connection.query(select, [username], function(err, results) {
            if(err) {
               connection.release();
               callback(err);
            } else {
               if(results.length === 0) {
                  callback(null, connection);
               } else {
                  var err = new Error("이미 존재하는 사용자입니다...");
                  err.status = 409;
                  callback(err);
               }
            }
         });
      }
      //3. select 결과가 없으면 salt
      function generateSalt(connection, callback) {
         bcrypt.genSalt(10, function(err, salt) {
            if(err) {
               callback(err);
            } else {
               callback(null, connection, salt);
            }
         })
      }
      //4. hashpassword generate
      function genHashPassword(connection, salt, callback) {
         bcrypt.hash(password, salt, function(err, hashPassword) {
            if(err) {
               callback(err);
            } else {
               callback(null, connection, hashPassword);
            }
         })
      }

      //5. insert
      function insertIparty(connection, hashPassword, callback) {
         var insert = "insert into greendb.iparty(username, hashpassword, partytype) "+
                      "values(?, ?, 1)";
         connection.query(insert, [username, hashPassword], function(err, result) {
            if(err) {
               callback(err);
            } else {
               callback(null, {
                  "id" : result.insertId
               });
            }
            }
         );
      }

      async.waterfall([getConnection, selectIparty, generateSalt, genHashPassword, insertIparty], function(err, result) {
         if(err) {
            next(err);
         } else {
            result.message = "정상적으로 사용자가 저장되었습니다...";
            res.json(result);
         }
      });
   } else {
      var err = new Error('SSL/TLS Upgrade Required');
      err.status = 426;
      next(err);
   }

})
module.exports = router;