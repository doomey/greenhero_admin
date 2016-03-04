var express = require('express');
var router = express.Router();
var sqlAES = require('./sqlAES');

var serverKey = process.env.GREEN_SERVER_KEY;
sqlAES.setServerKey(serverKey);
router.get('/', function(req, res, next) {
   var select = "select "+
                  sqlAES.decrypt("photo")+
               "nickname "+
               "from greendb.iparty";
});

module.exports = router;
