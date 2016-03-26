
var express = require("express")
var app = express()

var globalRouter  = express.Router();
var stopsRouter   = express.Router();

globalRouter.use('/stops', stopsRouter);

stopsRouter.get(/\/nearest\/(\-?\d+(?:\.\d+)),(\-?\d+(?:\.\d+))$/, function (req, res) {
  res.send(req.params);
});

app.use('/', globalRouter);

app.listen(3000, function () {
  console.log("Woo-hoo! Listenening on the port 3000!")
});
