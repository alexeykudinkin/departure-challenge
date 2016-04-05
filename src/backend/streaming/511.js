/**
 * Streaming backend being the primary source of the data served
 *
 */

var request     = require('request');
var querystring = require('querystring');
var xml         = require('xml2js');
var _           = require('underscore');

var model       = require('../model');

var extensions  = require('../../util/ext');

var exports = module.exports;

const BASE_API_URL  = 'http://services.my511.org/Transit2.0';
const SECRET        = process.env.P511_API_SECRECT;


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

Backend.prototype.requestAPI = function requestAPI(endpoint, params, cb) {
  params = _.extend(params, { token: SECRET });

  var uri = BASE_API_URL + endpoint + '?' + encodeParams(params);

  // _TODO: Make proper logging
  console.log('[REQ]: #URI = ', uri);

  request(uri, function (error, response, body) {
    if (error)  cb(error, response);
    else        cb(error, response, body);
  });
};

/**
 * Returns list of the agencies being contributing the data
 *
 * @param cb callback accepting (error, response, results)
 */
Backend.prototype.getAgencies = function getAgencies(cb) {
  this.requestAPI('/GetAgencies.aspx', {}, function (error, response, body) {
    if (error || response && response.statusCode != 200) return cb(error, response);

    xmlp.parseString(body, function (error, result) {
      if (error)
        return cb(error, response);

      var mf = checkWhetherMalformedReq(result);
      if (mf) return cb(new Error(mf.toString()), response);

      cb(null, null, extractAgencies(result));
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

/**
 * Returns the full list of the routs served by the `agencies` supplied
 *
 * @param agencies list of the agency names (unique ids)
 * @param cb callback accepting (error, response, results)
 */
Backend.prototype.getRoutesForAgencies = function getRoutesForAgencies(agencies, cb) {
  this.requestAPI(
    '/GetRoutesForAgencies.aspx',
    {
      agencyNames: agencies.reduce(function (s, a, i) { return s + (i === 0 ? '' : '|') + a.name; }, '')
    },
    function (error, response, body) {
      if (error || response && response.statusCode != 200) return cb(error, response);

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


/**
 * Returns the list of stops for the given routes (given respective directions or assuming looping otherwise)
 *
 * @param routes list of the routes' codes
 * @param directions list of the directions' code for respective routes (null assumes route to be 'indirectional')
 * @param cb callback accepting (error, response, results)
 */
Backend.prototype.getStopsForRoutes = function getStopsForRoutes(routes, directions, cb) {
  this.requestAPI(
    '/GetStopsForRoutes.aspx',
    {
      routeIDF: routes.reduce(function (s, r, i) { return s + (i === 0 ? '' : '|') + encodeRouteIDF(r, directions[i]); }, '')
    },
    function (error, response, body) {
      if (error || response && response.statusCode != 200) return cb(error, response);

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
  if (_.isArray(departure))
    return departure.map(function (d) { return extractDepartureFrom(stop, d); });
  else if (!_.isNumber(departure) && !parseInt(departure))
    return null;

  return new model.Departure(stop, departure);
}

function extractDepartureTimesList(body, route, direction) {
  return extractList(extractList(body, 'StopList')[0], 'Stop')
    .flatMap(function (sBody) {
      var s = extractStopFrom(route, direction, sBody['$']);

      return extractDepartureFrom(s, getSafe(extractList(sBody, 'DepartureTimeList')[0], 'DepartureTime'));
    })
    .filter(function (e) { return e !== null; });
}

function extractDepartures(body) {
  return extractList(extractList(body['RTT'], 'AgencyList')[0], 'Agency').flatMap(function (aBody) {
    var a = extractAgencyFrom(aBody['$']);

    return extractList(extractList(aBody, 'RouteList')[0], 'Route').flatMap(function (rBody) {
      var r = extractRouteFrom(a, rBody['$']);

      if (a.directional) {
        return extractList(extractList(rBody, 'RouteDirectionList')[0], 'RouteDirection').flatMap(function (dBody) {
          var d = extractDirection(dBody['$']);
          return extractDepartureTimesList(dBody, r, d);
        });
      }
      else {
        return extractDepartureTimesList(rBody, r);
      }
    })
  });
}


/**
 * Returns departure times estimates for the transportation upcoming to the given `stop`
 *
 * @param stop stop's code
 * @param cb callback accepting (error, response, results)
 */
Backend.prototype.getDeparturesForStop = function getDeparturesForStop(stop, cb) {
  this.requestAPI(
    '/GetNextDeparturesByStopCode.aspx',
    {
      stopcode: stop.code
    },

    function (error, response, body) {
      if (error || response && response.statusCode != 200) return cb(error, response);

      xmlp.parseString(body, function (error, result) {
        if (error) return cb(error, response);

        var mf = checkWhetherMalformedReq(result);
        if (mf) return cb(new Error(mf.toString()), response);

        var ds = extractDepartures(result);

        cb(null, response, ds);
      })
    }
  )
};

exports.Backend = Backend;