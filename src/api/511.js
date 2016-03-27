
var request     = require('request');
var querystring = require('querystring');
var xml         = require('xml2js');
var _           = require('underscore');

var model       = require('./model');

var exports = module.exports;

const BASE_API_URL  = 'http://services.my511.org/Transit2.0';

// _TODO: Extract token to ENV
const SECRET        = '8fc49edc-a1d3-4e2c-b177-ee8aae6e53a7';

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


function extractAgencyFrom(body) {
  if (!body
    ||  !body.Name
    ||  !body.Mode) return undefined;

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

exports.getAgencies = getAgencies;


function extractRouteFrom(a, body) {
  if (!body
    ||  !body.Name
    ||  !body.Code) return undefined;

  return new model.Route(a, body.Name, body.Code);
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

exports.getRoutesForAgencies = getRoutesForAgencies;


function extractStopFrom(r, body) {
  if (!body
    ||  !body.name
    ||  !body.StopCode) return undefined;

  return new model.Stop(r, body.Name, body.StopCode);
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

exports.getStopsForRoute = getStopsForRoute;