
var request     = require('request');
var querystring = require('querystring');
var xml         = require('xml2js');
var _           = require('underscore');

var model       = require('./model');

var exports = module.exports;

const BASE_API_URL  = 'http://services.my511.org/Transit2.0';

// _TODO: Extract token to ENV
const SECRET        = '8fc49edc-a1d3-4e2c-b177-ee8aae6e53a7';


function Backend() {}

var xmlp = xml.Parser();

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

function checkWhetherMalformedReq(body) {
  if (!body) return null;
  return body['transitServiceError'];
}

function extractAgencyFrom(body) {
  if (!body
  ||  !body.Name
  ||  !body.Mode) return null;

  return new model.Agency(body.Name, body.HasDirection === 'True', body.Mode);
}

function extractAgencies(body) {
  return extractList(extractList(body['RTT'], 'AgencyList')[0], 'Agency').map(function (a) {
    return extractAgencyFrom(a['$']);
  })
}

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


Backend.prototype.getAgencies = function getAgencies(cb) {
  requestAPI('/GetAgencies.aspx', {}, function (error, response, body) {
    if (error || response.statusCode != 200) return cb(error, response);

    xmlp.parseString(body, function (error, result) {
      if (error)
        return cb(error, response);

      var mf = checkWhetherMalformedReq(result);
      if (mf) return cb(new Error(mf.toString()), response);

      cb(null, response, extractAgencies(result));
    });
  });
};


function extractRouteFrom(a, body) {
  if (!body
  ||  !body.Name
  ||  !body.Code) return null;

  return new model.Route(a, body.Name, body.Code);
}

function extractRoutes(body) {
  return extractList(extractList(body['RTT'], 'AgencyList')[0], 'Agency').flatMap(function (aBody) {
    var a = extractAgencyFrom(aBody['$']);

    return extractList(extractList(aBody, 'RouteList')[0], 'Route').map(function (rBody) {
      var r = extractRouteFrom(a, rBody['$']);

      r.directions = extractList(extractList(rBody, 'RouteDirectionList')[0], 'RouteDirection').map(function (dBody) {
        return extractDirection(dBody['$']);
      });

      return r;
    })
  });
}

Backend.prototype.getRoutesForAgencies = function getRoutesForAgencies(agencies, cb) {
  requestAPI(
    '/GetRoutesForAgencies.aspx',
    {
      agencyNames: agencies.reduce(function (s, a, i) { return s + (i === 0 ? '' : '|') + a.name; }, '')
    },
    function (error, response, body) {
      if (error || response.statusCode != 200) return cb(error, response);

      xmlp.parseString(body, function (error, result) {
        if (error) return cb(error, response);

        var mf = checkWhetherMalformedReq(result);
        if (mf) return cb(new Error(mf.toString()), response);

        cb(null, response, extractRoutes(result));
      })
    }
  )
};


function extractDirection(body) {
  if (!body) return null;

  return body.Code;
}

function extractStopFrom(route, direction, body) {
  if (!body
  ||  !body.name
  ||  !body.StopCode) return null;

  return new model.Stop(route, body.name, body.StopCode, direction);
}

function extractStopList(body, route, direction) {
  return extractList(extractList(body, 'StopList')[0], 'Stop').map(function (sBody) {
    return extractStopFrom(route, direction, sBody['$']);
  })
}

function extractStops(body) {
  return extractList(extractList(body['RTT'], 'AgencyList')[0], 'Agency').flatMap(function (aBody) {
    var a = extractAgencyFrom(aBody['$']);

    return extractList(extractList(aBody, 'RouteList')[0], 'Route').flatMap(function (rBody) {
      var r = extractRouteFrom(a, rBody['$']);

      if (a.directional) {
        return extractList(extractList(rBody, 'RouteDirectionList')[0], 'RouteDirection').flatMap(function (dBody) {
          var d = extractDirection(dBody['$']);
          return extractStopList(dBody, r, d);
        });
      }
      else {
        return extractStopList(rBody, r);
      }
    })
  });
}

function encodeRouteIDF(r, d) {
  return r.agency.name + '~' + r.code + (d ? '~' + d : '');
}
Backend.prototype.getStopsForRoutes = function getStopsForRoutes(routes, directions, cb) {
  requestAPI(
    '/GetStopsForRoutes.aspx',
    {
      routeIDF: routes.reduce(function (s, r, i) { return s + (i === 0 ? '' : '|') + encodeRouteIDF(r, directions[i]); }, '')
    },
    function (error, response, body) {
      if (error || response.statusCode != 200) return cb(error, response);

      xmlp.parseString(body, function (error, result) {
        if (error) return cb(error, response);

        var mf = checkWhetherMalformedReq(result);
        if (mf) return cb(new Error(mf.toString()), response);

        cb(null, response, extractStops(result));
      })
    }
  )
};


function extractDepartureFrom(stop, departure) {
  return new model.Departure(stop, departure);
}

function extractDepartureTimesList(body, route, direction) {
  return extractList(extractList(body, 'StopList')[0], 'Stop').flatMap(function (sBody) {
    var s = extractStopFrom(route, direction, sBody['$']);

    return extractList(extractList(sBody, 'DepartureTimeList')[0], 'DepartureTime').map(function (dBody) {
      return extractDepartureFrom(s, dBody['$']);
    });
  })
}

function extractDepartures(body) {
  return extractList(extractList(body['RTT'], 'AgencyList')[0], 'Agency').flatMap(function (aBody) {
    var a = extractAgencyFrom(aBody['$']);

    return extractList(extractList(aBody, 'RouteList')[0], 'Route').flatMap(function (rBody) {
      var r = extractRouteFrom(a, rBody['$']);

      if (a.directional) {
        return extractList(extractList(rBody, 'RouteDirectionList')[0], 'RouteDirection').flatMap(function (dBody) {
          var d = extractDirection(dBody['$']);
          return extractDepartureTimesList(rBody, r, d);
        });
      }
      else {
        return extractDepartureTimesList(rBody, r);
      }
    })
  });
}

Backend.prototype.getDeparturesForStop = function getDeparturesForStop(stop, cb) {
  requestAPI(
    '/GetNextDeparturesByStopCode.aspx',
    {
      stopcode: stop.code
    },

    function (error, response, body) {
      if (error || response.statusCode != 200) return cb(error, response);

      xmlp.parseString(body, function (error, result) {
        if (error) return cb(error, response);

        var mf = checkWhetherMalformedReq(result);
        if (mf) return cb(new Error(mf.toString()), response);

        cb(null, response, extractDepartures(result));
      })
    }
  )
};

exports.Backend = Backend;