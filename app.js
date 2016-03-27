
var express = require('express');
var querystring = require('querystring');

var request = require('request');

var xml = require('xml2js');

var xmlp = xml.Parser();

var _ = require('underscore');


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


// _DBG

function Agency(name, directional, mode) {
  this.name = name;
  this.directional = directional;
  this.mode = mode;
}

function Route(agency, name, code) {
  this.agency = agency;
  this.name = name;
  this.code = code;
}

function Stop(route, name, code) {
  this.route = route;
  this.name = name;
  this.code = code;
}


function getSafe(body, name) {
  if (!body
  ||  !body[name]) return {};

  return body[name];
}

function extractList(body, name) {
  var list = getSafe(body, name);
  if (!list
  ||  !Array.isArray(list)) return [];

  return list;
}


function extractAgencyFrom(body) {
  if (!body
  ||  !body.Name
  ||  !body.Mode) return undefined;

  return new Agency(body.Name, body.HasDirection === 'True', body.Mode);
}

function extractAgencies(body) {
  return extractList(extractList(body['RTT'], 'AgencyList')[0], 'Agency').map(function (a) {
    return extractAgencyFrom(a['$']);
  })
}

const BASE_API_URL  = 'http://services.my511.org/Transit2.0';

// _TODO: Extract token to ENV
const SECRET        = '8fc49edc-a1d3-4e2c-b177-ee8aae6e53a7';


function encodeParams(params) {
  return querystring.stringify(params);
}

function requestAPI(endpoint, params, cb) {
  params = _.extend(params, { token: SECRET });

  var uri = BASE_API_URL + endpoint + '?' + encodeParams(params);

  // _TODO: Make proper logging
  console.log('[REQ]: #URI = ', uri);

  request(uri, function (error, response, body) {
    if (error)  cb(error, response);
    else        cb(error, response, body);
  });
}

function getAgencies(cb) {
  requestAPI('/GetAgencies.aspx', {}, function (error, response, body) {
    if (error || response.statusCode != 200) {
      cb(error, response);
      return
    }

    xmlp.parseString(body, function (error, result) {
      if (error) {
        cb(error, response);
        return
      }

      cb(null, response, extractAgencies(result));
    });
  });
}


function extractRouteFrom(a, body) {
  if (!body
  ||  !body.Name
  ||  !body.Code) return undefined;

  return new Route(a, body.Name, body.Code);
}

function extractRoutes(body) {
  return extractList(extractList(body['RTT'], 'AgencyList')[0], 'Agency').flatMap(function (aBody) {
      var a = extractAgencyFrom(aBody);

      return extractList(extractList(aBody, 'RouteList')[0], 'Route').map(function (rBody) {
        return extractRouteFrom(a, rBody['$']);
      })
    });
}

function getRoutesForAgencies(agencies, cb) {
  requestAPI(
    '/GetRoutesForAgencies.aspx',
    {
      agencyNames: agencies.reduce(function (s, a, i) { return s + (i === 0 ? '' : '|') + a.name; }, '')
    },
    function (error, response, body) {
      if (error || response.statusCode != 200) {
        cb(error, response);
        return
      }

      xmlp.parseString(body, function (error, result) {
        if (error) {
          cb(error, response);
          return
        }

        cb(null, response, extractRoutes(result));
      })
    }
  )
}

function extractStopFrom(r, body) {
  if (!body
  ||  !body.name
  ||  !body.StopCode) return undefined;

  return new Stop(r, body.Name, body.StopCode);
}

function extractStops(body) {
  return extractList(extractList(body['RTT'], 'AgencyList')[0], 'Agency').flatMap(function (aBody) {
      var a = extractAgencyFrom(aBody);

      return extractList(extractList(aBody, 'RouteList')[0], 'Route').flatMap(function (rBody) {
        var r = extractRouteFrom(a, rBody['$']);

        return extractList(extractList(rBody, 'StopList')[0], 'Stop').map(function (sBody) {
          return extractStopFrom(r, sBody['$']);
        })
      })
    });
}

function getStopsForRoute(routes, cb) {
  requestAPI(
    '/GetStopsForRoutes.aspx',
    {
      routeIDF: routes.reduce(function (s, r, i) { return s + (i === 0 ? '' : '|') + (r.agency.name + '~' + r.code); }, '')
    },
    function (error, response, body) {
      if (error || response.statusCode != 200) {
        cb(error, response);
        return
      }

      xmlp.parseString(body, function (error, result) {
        if (error) {
          cb(error, response);
          return
        }

        cb(null, response, extractStops(result));
      })
    }
  )
}


globalRouter.get('/agencies', function (req, res) {
  getAgencies(function (error, response, agencies) {
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

  getRoutesForAgencies(lookupAgencies(agencies), function (error, response, routes) {
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
  getRoutesForAgencies([ req.agency ], function (error, response, routes) {
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
  getStopsForRoute([ req.r ], function (error, response, routes) {
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
