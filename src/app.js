
var express = require('express');

var _ = require('underscore');

var swagger = require('swagger-jsdoc');

var streaming     = require('./backend/streaming/511');
var rateLimiting  = require('./backend/rate-limiting');
var caching       = require('./backend/caching');

// Global

var app = express();


// Setup Swagger

var opts = {
  swaggerDefinition: {
    info: {
      title: 'Departure Times',
      description: 'This is Departure Times Challenge backing API',
      version: '0.0.1'
    },
    schemes: [ 'https', 'http' ],
    basePath: '/'
  },
  apis: [ './src/app.js' ]
};

var swaggerSpec = swagger(opts);

// Setup backends

var b   = new streaming.Backend();
var rlb = new rateLimiting.Backend(b);
var cb  = new caching.Backend(rlb);


// Routing

var globalRouter  = express.Router();
var agencyRouter  = express.Router({ mergeParams: true });
var stopsRouter   = express.Router({ mergeParams: true });

globalRouter.use('/stops',  stopsRouter);
globalRouter.use('/agency', agencyRouter);

// Bootstrap Swagger

globalRouter.get('/', function (req, res, next) {
  if (req.originalUrl === '/' && !req.query.url) {
    res.redirect(req.originalUrl + (_.isEmpty(req.query) ? '?' : '&') + 'url=/swagger.json');
    return
  }

  next()
});

globalRouter.use('/', express.static('./node_modules/swagger-ui/dist'));

globalRouter.get('/swagger.json', function(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});


/**
 * @swagger
 * /stops/nearest/{lat},{lng}:
 *  get:
 *    produces:
 *      - application/json
 *    description: "Returns the 5 closest stops from the position given in the form: '/nearest/{latitude},{longitude}'"
 *    parameters:
 *      - name: lat
 *        description: Latitude
 *        in: path
 *        required: true
 *        type: number
 *      - name: lng
 *        description: Longitude
 *        in: path
 *        required: true
 *        type: number
 *    responses:
 *      200:
 *        description: Ok
 *      500:
 *        description: Error occurred
 */
stopsRouter.get(/\/nearest\/(\-?\d+(?:\.\d+)),(\-?\d+(?:\.\d+))$/, function (req, res) {
  var lat = req.params['0'];
  var lng = req.params['1'];

  res.status(500);
  res.send({ error: "Unfortunately we can't geo-locate nearest stops right now! Your position is (" + lat + ", " + lng + ")" });
});

/**
 * @swagger
 * /agencies:
 *  get:
 *    produces:
 *      - application/json
 *    description: Returns the whole list of the agencies providing data
 *    responses:
 *      200:
 *        description: Ok
 *      500:
 *        description: Error occurred
 */
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
  return names.map(function (n) {
    return { name: n }
  })
}


// Parameters

agencyRouter.param('agency', function (req, res, next, id) {
  var name = id.replace(/_/g, ' ');
  req.matched = _.extend(req.matched || {}, {
    agency: lookupAgencies([ name ])[0]
  });
  next();
});


/**
 * @swagger
 * "/agency/{agencyName}/routes":
 *  get:
 *    produces:
 *      - application/json
 *    description: Returns list of the routes served by the {agencyName}
 *    parameters:
 *      - name: agencyName
 *        description: "Name of the Agency providing transportation services requested
 *                      (NOTA BENE: if agency's name comprises spaces replace them with underscores: 'AC Transit' -> 'AC_Transit')"
 *        in: path
 *        required: true
 *        type: string
 *    responses:
 *      200:
 *        description: Ok
 *      500:
 *        description: Error occurred
 */
agencyRouter.get('/:agency/routes', function (req, res, next) {
  cb.getRoutesForAgencies([ req.matched.agency ], function (error, response, routes) {
    if (error) {
      next({ error: error.toString() });
      return
    }

    res.send(routes);
  });
});


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

/**
 * @swagger
 *
 * "/agency/{agencyName}/{routeIDF}/stops":
 *  get:
 *    produces:
 *      - application/json
 *    description: Returns the list of the stops for particular {routeIDF} served by the {agencyName}
 *    parameters:
 *      - name: agencyName
 *        description: Name of the Agency providing transportation services requested
 *        in: path
 *        required: true
 *        type: string
 *      - name: routeIDF
 *        description: Specifically formed route identifier having following form '{routeCode}~{directionCode}' for the cases
 *                     of directional routes and just '{routeCode}' for the case of in-directional routes
 *        in: path
 *        required: true
 *        type: string
 *    responses:
 *      200:
 *        description: Ok
 *      500:
 *        description: Error occurred
 */
agencyRouter.get('/:agency/:route/stops', function (req, res, next) {
  cb.getStopsForRoutes([ req.matched.route ], [ req.matched.direction ], function (error, response, routes) {
    if (error) {
      next({ error: error.toString() });
      return
    }

    res.send(routes);
  });
});


function lookupStops(route, direction, codes) {
  return codes.map(function (c) {
    return {
      code: c,
      route: route,
      direction: direction
    };
  });
}

agencyRouter.param('stop', function (req, res, next, id) {
  req.matched = _.extend(req.matched || {}, {
    stop: lookupStops(req.matched.route, req.matched.direction, [ id ])[0]
  });

  next();
});


/**
 * @swagger
 *
 * "/agency/{agencyName}/{routeIDF}/{stopCode}/departures":
 *  get:
 *    produces:
 *      - application/json
 *    description: Returns the estimates for the departure times for the particular {stopCode} of the {routeIDF} served by the {agencyName}
 *    parameters:
 *      - name: agencyName
 *        description: Name of the Agency providing transportation services requested
 *        in: path
 *        required: true
 *        type: string
 *      - name: routeIDF
 *        description: Specifically formed route identifier having following form '{routeCode}~{directionCode}' for the cases
 *                     of directional routes and just '{routeCode}' for the case of in-directional routes
 *        in: path
 *        required: true
 *        type: string
 *      - name: stopCode
 *        description: Stop's code (for the given route)
 *        in: path
 *        required: true
 *        type: string
 *    responses:
 *      200:
 *        description: Ok
 *      500:
 *        description: Error occurred
 */
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
  res.status(500);
  res.send(err);
}


// Startup

app.use('/', globalRouter);
app.use(APIErrorHandler);

var port = process.env.PORT || 8080;
app.listen(port, function () {
  console.log("Woo-hoo! Listening on the port " + port + "!")
});
