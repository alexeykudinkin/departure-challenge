
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

function days(n) {
  return n * 1000 /* millis */ * 60 * 60 * 24;
}

function minutes(n) {
  return n * 1000 /* millis */ * 60;
}

const CACHING_POLICIES = {
  getAgencies:          cachingPolicy(days(14)),
  getRoutesForAgencies: cachingPolicy(days(14)),
  getStopsForRoutes:    cachingPolicy(days(14))
};

mongoose.connect('mongodb://localhost:27017/transportation');

var Agency  = mongoose.model('Agency',  new mongoose.Schema(model.Agency.schema,  { timestamps: true }));
var Route   = mongoose.model('Route',   new mongoose.Schema(model.Route.schema,   { timestamps: true }));
var Stop    = mongoose.model('Stop',    new mongoose.Schema(model.Stop.schema,    { timestamps: true }));

function Backend(backing) {
  this.backing = backing;
}

function queryStorageOrRefill(model, cachingPolicy, refill, cb) {
  model.count(function (err, total) {
    if (err) return cb(err);

    model.where('updatedAt').gte(cachingPolicy())
      .count(function (err, active) {
        if (err) return cb(err);

        // Check whether we have some of the documents 'staled'
        // and flush if necessary
        if (active !== total || total === 0) {
          model.remove(function (err) {
            if (err) return cb(err);

            refill(function (values) {
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
                  cb(null, null, values);
                }
              );
            }, cb);
          });

          return
        }

        model .find({})
              .exec(function (err, values) {
                return cb(null, null, values);
              })
      });
  })
}

Backend.prototype.getAgencies = function getAgencies(callback) {
  var self = this;

  queryStorageOrRefill(
    Agency,
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
    CACHING_POLICIES['getRoutesForAgencies'],

    function (store, cb) {
      self.backing.getRoutesForAgencies(agencies, function (err, response, routes) {
        if (err) return cb(err, response);

        async.reduce(
          agencies, {},

          function (acc, agency, callback) {
            Agency.findOne({ name: agency.name }, function (err, doc) {
              if (err) callback(err);

              acc[agency.name] = doc;

              callback(null, acc); // Ok
            });
          },

          function (err, agenciesMap) {
            if (err) callback(err);

            store(
              routes.map(function (r) {
                return _.extend(r, { agency: agenciesMap[r.agency.name]._id })
              })
            );
          });
      });
    },

    function (err, res, routes) {
      if (err) return callback(err, res);

      callback(null, null, routes.map(function (data) {
        return new model.Route(data.agency, data.name, data.code);
      }));
    });

};

function encodeRouteURI(route) {
  return route.agency.name + ":" + route.code;
}

Backend.prototype.getStopsForRoutes = function getStopsForRoutes(routes, callback) {
  var self = this;

  queryStorageOrRefill(
    Stop,
    CACHING_POLICIES['getStopsForRoutes'],

    function (store, cb) {
      self.backing.getStopsForRoutes(routes, function (err, response, stops) {
        if (err) return cb(err, response);

        async.reduce(
          routes, {},

          function (acc, route, callback) {
            Route .findOne({ code: route.code })
                  .populate('agency', 'name')
                  .exec(function (err, doc) {
                    if (err) callback(err);

                    acc[encodeRouteURI(route)] = doc;

                    callback(null, acc); // Ok
                  });
          },

          function (err, routesMap) {
            if (err) callback(err);

            store(
              stops.map(function (s) {
                return _.extend(s, { route: routesMap[encodeRouteURI(s.route)]._id })
              })
            );
          });
      });
    },

    function (err, res, routes) {
      if (err) return callback(err, res);

      callback(null, null, routes.map(function (data) {
        return new model.Route(data.agency, data.name, data.code);
      }));
    });


};

exports.Backend = Backend;
