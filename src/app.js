
var express = require('express');

var b = require('./api/511');


// Global

var app = express();


// _TODO: Extract
Array.prototype.flatMap = function (cb) {
  return this.map(cb).reduce(function (arr, c) { return arr.concat(c); }, []);
};

// Routing

var globalRouter  = express.Router();
var agencyRouter  = express.Router({ mergeParams: true });
var stopsRouter   = express.Router({ mergeParams: true });

globalRouter.use('/stops',  stopsRouter);
globalRouter.use('/agency', agencyRouter);


// Stops endpoints

stopsRouter.get(/\/nearest\/(\-?\d+(?:\.\d+)),(\-?\d+(?:\.\d+))$/, function (req, res) {
  res.send(req.params);
});


globalRouter.get('/agencies', function (req, res) {
  b.getAgencies(function (error, response, agencies) {
    if (error) {
      next({ error: error });
      return
    }

    res.send(agencies);
  });
});


function lookupAgencies(names) {
  // _TODO: Fix
  return names.map(function (n) {
    return { name: n }
  })
}

globalRouter.get('/routes', function (req, res, next) {

  var agencies = req.query['agencies'] ? req.query['agencies'].split('|') : [];

  if (agencies.length == 0) {
    next({ error: 'Missing agencies!' });
    return
  }

  b.getRoutesForAgencies(lookupAgencies(agencies), function (error, response, routes) {
    if (error) {
      next({ error: error });
      return
    }

    res.send(routes);
  });
});

// Parameters

agencyRouter.param('agency', function (req, res, next, id) {
  req.agency = lookupAgencies([ id ])[0];
  next();
});

agencyRouter.get('/:agency/routes', function (req, res, next) {
  b.getRoutesForAgencies([ req.agency ], function (error, response, routes) {
    if (error) {
      next({ error: error });
      return
    }

    res.send(routes);
  });
});


// _TODO: Fix
function lookupRoutes(a, codes) {
  return codes.map(function (c) {
    return {
      agency: a,
      code:   c
    };
  });
}

agencyRouter.param('route', function (req, res, next, id) {
  req.r = lookupRoutes(req.agency, [ id ])[0];
  next();
});

agencyRouter.get('/:agency/:route/stops', function (req, res, next) {
  b.getStopsForRoute([ req.r ], function (error, response, routes) {
    if (error) {
      next({ error: error });
      return
    }

    res.send(routes);
  });
});


// Error handling

function APIErrorHandler(err, req, res, next) {
  res .status(500)
      .send(err);
}


// Startup

app.use('/', globalRouter);
app.use(APIErrorHandler);

app.listen(3000, function () {
  console.log("Woo-hoo! Listenening on the port 3000!")
});
