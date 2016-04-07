/**
 * Caching backend allowing to
 */

var async     = require('async');
var mongoose  = require('mongoose');
var _         = require('underscore');

var model = require('./model');


var exports = module.exports;


function cachingPolicy(ms) {
  return function () {
    var now = new Date();
    now.setTime(now.getTime() - ms);
    return now;
  }
}

function seconds(n) {
  return n * 1000 /* millis */;
}

function days(n) {
  return seconds(n) * 60 * 60 * 24;
}

const CACHING_POLICIES = {
  getAgencies:          cachingPolicy(days(1)),
  getRoutesForAgencies: cachingPolicy(days(1)),
  getStopsForRoutes:    cachingPolicy(days(1)),
  getDeparturesForStop: cachingPolicy(seconds(30))
};

mongoose.connect('mongodb://localhost:27017/transportation');

var Agency    = mongoose.model('Agency',    new mongoose.Schema(model.Agency.schema,    { timestamps: true }));
var Route     = mongoose.model('Route',     new mongoose.Schema(model.Route.schema,     { timestamps: true }));
var Stop      = mongoose.model('Stop',      new mongoose.Schema(model.Stop.schema,      { timestamps: true }));
var Departure = mongoose.model('Departure', new mongoose.Schema(model.Departure.schema, { timestamps: true }));

function Backend(backing) {
  this.backing = backing;
}

function queryStorageOrRefill(model, query, cachingPolicy, refill, cb) {
  // Clone query to re-execute it upon successful refill
  // Yep, shallow-clone is enough
  var requery = _.clone(query);

  query .where('updatedAt').gte(cachingPolicy())
        .exec(function (err, values) {
          if (err) return cb(err);

          query.count(function (err, total) {
            if (err) return cb(err);

            var actual = values.length;

            // _TODO: Make proper logging
            console.log('[STOR]: Queried: \'' + model.modelName + '\' #Actual =', actual, '; #Total =', total);

            // Check whether we have some of the documents 'staled'
            // and flush if necessary
            if (actual !== total || total === 0) {
              model.remove(function (err) {
                if (err) return cb(err);

                refill(function (values) {

                  // _TODO: Make proper logging
                  console.log('[STOR]: Stored: \'' + model.modelName + '\' # =', values.length);

                  async.each(
                    values,

                    function (data, callback) {
                      new model(data).save(function (err) {
                        if (err) return callback(err);
                        callback(); // Ok
                      });
                    },

                    function (err) {
                      if (err) return cb(err);

                      requery.exec(function (err, values) {
                        if (err) return cb(err);
                        cb(null, null, values);
                      })
                    }
                  );
                }, cb);
              });

              return
            }

            return cb(null, null, values);
          });
  })
}

Backend.prototype.getAgencies = function getAgencies(callback) {
  var self = this;

  queryStorageOrRefill(
    Agency,
    Agency.where(),

    CACHING_POLICIES['getAgencies'],

    function (store, cb) {
      self.backing.getAgencies(function (err, response, agencies) {
        if (err) return cb(err, response);
        store(agencies);
      });
    },

    function (err, res, agencies) {
      if (err) return callback(err, res);

      callback(null, null, agencies.map(function (data) {
        return new model.Agency(data.name, data.directional, data.mode);
      }));
    });
};


Backend.prototype.getRoutesForAgencies = function getRoutesForAgencies(agencies, callback) {
  var self = this;

  queryStorageOrRefill(
    Route,
    Route .where('agency')
          .in(agencies.map(function (a) { return a.name; })),

    CACHING_POLICIES['getRoutesForAgencies'],

    function (store, cb) {
      self.backing.getRoutesForAgencies(agencies, function (err, response, routes) {
        if (err) return cb(err, response);

        store(
          routes.map(function (r) {
            return _.extend(r, { agency: r.agency.name })
          })
        );
      });
    },

    function (err, res, routes) {
      if (err) return callback(err, res);

      callback(null, null, routes.map(function (data) {
        return new model.Route(data.agency, data.name, data.code, data.directions);
      }));
    });

};

function encodeRouteURI(route, direction) {
  return route.agency.name + ":" + route.code + (direction ? ':' + direction : '');
}

Backend.prototype.getStopsForRoutes = function getStopsForRoutes(routes, directions, callback) {
  var self = this;

  queryStorageOrRefill(
    Stop,
    Stop.where('route')
        .in(routes.map(function (r, i) { return encodeRouteURI(r, directions[i]); })),

    CACHING_POLICIES['getStopsForRoutes'],

    function (store, cb) {
      self.backing.getStopsForRoutes(routes, directions, function (err, response, stops) {
        if (err) return cb(err, response);

        store(
          stops.map(function (s) {
            return _.extend(s, { route: encodeRouteURI(s.route, s.direction) })
          })
        )
      });
    },

    function (err, res, routes) {
      if (err) return callback(err, res);

      callback(null, null, routes.map(function (data) {
        return new model.Route(data.agency, data.name, data.code);
      }));
    });
};


Backend.prototype.getDeparturesForStop = function getDeparturesForStop(stop, callback) {
  var self = this;

  queryStorageOrRefill(
    Departure,
    Departure .where('stop')
              .eq(stop.code)
              .where('route')
              .eq(stop.route.code)
              .where('direction')
              .eq(stop.direction),

    CACHING_POLICIES['getDeparturesForStop'],

    function (store, cb) {
      self.backing.getDeparturesForStop(stop, function (err, res, departures) {
        if (err) return cb(err, res);

        store(
          departures.map(function (d) {
            return _.extend(d, { stop: d.stop.code, route: d.stop.route.code, direction: d.stop.direction })
          })
        );
      });
    },

    function (err, res, departures) {
      if (err) return callback(err, res);
      callback(null, null, departures.map(function (data) {
        return new model.Departure({ route: data.route, code: data.stop, direction: data.direction }, data.time);
      }));
    });
};

exports.Backend = Backend;
