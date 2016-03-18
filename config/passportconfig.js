var async = require('async');
var bcrypt = require('bcrypt');
var LocalStrategy = require('passport-local').Strategy;
var sqlAES = require('../routes/sqlAES.js');

sqlAES.setServerKey(process.env.GREEN_SERVER_KEY);

module.exports = function(passport) {
    passport.serializeUser(function(user, done) {
        done(null, user.id);
    });

    passport.deserializeUser(function(id, done) {
        pool.getConnection(function(err, connection) {
            if(err) {
                done(err);
            } else {
                var sql = "select id, username, "+ sqlAES.decrypt("name") +" nickname "+
                          "from iparty " +
                          "where id = ?";
                connection.query(sql, [id], function(err, results) {
                    connection.release();
                    if(err) {
                        done(err);
                    } else {
                        var user = {
                            "id" : results[0].id,
                            "username" : results[0].username,
                            "name" : results[0].name,
                            "nickname" : results[0].nickname
                        };
                       console.log('유저', user);
                        done(null, user);
                    }
                });
            }
        });
    });

    passport.use('local-login', new LocalStrategy({
        usernameField: "username",
        passwordField: "password",
        passReqToCallback: true
    }, function(req, username, password, done) {

        //1. getConnection
        function getConnection(callback) {
            pool.getConnection(function(err, connection) {
                if(err) {
                    callback(err);
                } else {
                    callback(null, connection);
                }
            });
        }
        //2. selectpassword
        function selectIparty(connection, callback) {
            var select = "select id, username, hashpassword, nickname, google_email, "+ sqlAES.decrypt("name", true) +
                   //"convert(aes_decrypt(google_email, unhex(" + connection.escape(serverKey) + ")) using utf8) as gemail " +
               "from greendb.iparty " +
               "where username = ?";
            connection.query(select, [username], function(err, results) {
                connection.release();
                if(err) {
                    callback(err);
                } else {
                    if(results.length === 0) {
                        var err = new Error('사용자가 존재하지 않습니다...');
                        callback(err);
                    } else {
                        var user = {
                            "id" : results[0].id,
                            "hashPassword" : results[0].hashpassword,
                            "email" : results[0].google_email,
                            "name" : results[0].name,
                            "nickname" : results[0].nickname
                        };
                        callback(null, user);
                    }
                }
            });
        }

        //3. compare
        function compare(user, callback) {
            bcrypt.compare(password, user.hashPassword, function(err, result) {
                if(err) {
                    callback(err);
                } else {
                    if(result === true) {
                        callback(null, user);
                    } else {
                        callback(null, false);
                    }
                }
            })
        }

        async.waterfall([getConnection, selectIparty, compare], function(err, user) {
            if(err) {
                done(err);
            } else {
                delete user.hashPassword;
                done(null, user);
            }
        });
    }));
}