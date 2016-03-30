
var express = require('express');

var _ = require('underscore');

var streaming     = require('./backend/streaming/511');
var rateLimiting  = require('./backend/rate-limiting');
var caching       = require('./backend/caching');


// Global

var app = express();

var b   = new streaming.Backend();
var rlb = new rateLimiting.Backend(b);
var cb  = new caching.Backend(rlb);


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

// _TODO: Fix
stopsRouter.get(/\/nearest\/(\-?\d+(?:\.\d+)),(\-?\d+(?:\.\d+))$/, function (req, res) {
  res.send(req.params);
});


//
// Lists the whole list of the agencies providing data
//
globalRouter.get('/agencies', function (req, res, next) {
  cb.getAgencies(function (error, response, agencies) {
    if (error) {
      next({ error: error.toString() });
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

//
// Lists the whole list of the routes for the agencies supplied
// 
globalRouter.get('/routes', function (req, res, next) {

  var agencies = req.query['agencies'] ? req.query['agencies'].split('|') : [];

  if (agencies.length == 0) {
    next({ error: 'Missing agencies!' });
    return
  }

  cb.getRoutesForAgencies(lookupAgencies(agencies), function (error, response, routes) {
    if (error) {
      next({ error: error });
      return
    }

    res.send(routes);
  });
});

// Parameters

agencyRouter.param('agency', function (req, res, next, id) {
  req.matched = _.extend(req.matched || {}, {
    agency: lookupAgencies([ id ])[0]
  });
  next();
});


// 
// Returns list of the routes served by the particular agency
//
agencyRouter.get('/:agency/routes', function (req, res, next) {
  cb.getRoutesForAgencies([ req.matched.agency ], function (error, response, routes) {
    if (error) {
      next({ error: error.toString() });
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
  var split = id.split('~');

  req.matched = _.extend(req.matched || {}, {
    route:      lookupRoutes(req.matched.agency, [ split[0] ])[0],
    direction:  split[1]
  });
  next();
});

//
// Returns the list of the stops for particular :route served by the :agency
//
agencyRouter.get('/:agency/:route/stops', function (req, res, next) {
  cb.getStopsForRoutes([ req.matched.route ], [ req.matched.direction ], function (error, response, routes) {
    if (error) {
      next({ error: error.toString() });
      return
    }

    res.send(routes);
  });
});


function lookupStops(route, codes) {
  return codes.map(function (c) {
    return {
      code: c
    };
  });
}

agencyRouter.param('stop', function (req, res, next, id) {
  req.matched = _.extend(req.matched || {}, {
    stop: lookupStops(req.matched.route, [ id ])[0]
  });

  next();
});


//
// Returns the most accurate departure times for the :stop of the given :route
// (served by the :agnecy) supplied
//
agencyRouter.get('/:agency/:route/:stop/departures', function (req, res, next) {
  cb.getDeparturesForStop(req.matched.stop, function (error, response, departures) {
    if (error) {
      next({ error: error.toString() });
      return
    }

    res.send(departures);
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
  console.log("Woo-hoo! Listening on the port 3000!")
});
