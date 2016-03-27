
var async = require('async');

var mongoose = require('mongoose');

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

Backend.prototype.getAgencies = function getAgencies(cb) {
  var self = this;

  Agency.count(function (err, total) {
    if (err) return cb(err);

    Agency.where('updatedAt').gte(CACHING_POLICIES['getAgencies']())
          .count(function (err, active) {
            if (err) return cb(err);

            // Check whether we have some of the documents 'staled'
            // and flush if necessary
            if (active !== total || total === 0) {
              Agency.remove(function (err) {
                if (err) return cb(err);

                self.backing.getAgencies(function (err, response, agencies) {
                  if (err) return cb(err, response);

                  async.each(
                    agencies,

                    function (data, callback) {
                      new Agency(data).save(function (err) {
                        if (err) return callback(err);

                        callback(); // Ok
                      });
                    },

                    function (err) {
                      if (err) return cb(err);

                      cb(null, null, agencies);
                    }
                  );
                });
              });

              return
            }

            Agency.find({})
                  .select({ name: 1, directional: 1, mode: 1, _id: 0 })
                  .exec(function (err, agencies) {
                    return cb(null, null, agencies);
                  })
          });
  });
};


Backend.prototype.getRoutesForAgencies = function getRoutesForAgencies(agencies, cb) {

};


Backend.prototype.getStopsForRoute = function getStopsForRoute(routes, cb) {

};

exports.Backend = Backend;
