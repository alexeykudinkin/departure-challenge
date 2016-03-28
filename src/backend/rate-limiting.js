
const REQS_QUOTA        = 6;          /* reqs per window */
const REQS_QUOTA_WINDOW = 60 * 1000;  /* millis */

function Backend(backing) {
  this.backing = backing;
  this.Q = [];
}

function checkWhetherSlurpedQuota(that) {
  var now = new Date();

  if (that.Q.length === REQS_QUOTA) {
    var first = that.Q[0];

    var diff = now.getTime() - first.getTime();

    // _TODO: Make proper logging
    console.log('[RLIM]: Waiting ' + (REQS_QUOTA_WINDOW - diff) + ' ms to refill quota!');

    if (diff < REQS_QUOTA_WINDOW)
      return true;
    else
      that.Q.shift();
  }

  that.Q.push(now);

  return false;
}

function guardCall(that, call, turnDown) {
  if (checkWhetherSlurpedQuota(that))
    return turnDown();

  return call();
}

Backend.prototype.getAgencies = function getAgencies(callback) {
  var self = this;

  return guardCall(
    self,
    function () {
      return self.backing.getAgencies(callback)
    },
    function () {
      return callback(null, null, []);
    }
  );
};


Backend.prototype.getRoutesForAgencies = function getRoutesForAgencies(agencies, callback) {
  var self = this;

  return guardCall(
    self,
    function () {
      return self.backing.getRoutesForAgencies(agencies, callback)
    },
    function () {
      return callback(null, null, []);
    }
  );
};

Backend.prototype.getStopsForRoutes = function getStopsForRoutes(routes, directions, callback) {
  var self = this;

  return guardCall(
    self,
    function () {
      return self.backing.getStopsForRoutes(routes, directions, callback)
    },
    function () {
      return callback(null, null, []);
    }
  );
};


Backend.prototype.getDeparturesForStop = function getDeparturesForStop(stop, callback) {
  var self = this;

  return guardCall(
    self,
    function () {
      return self.backing.getDeparturesForStop(stop, callback)
    },
    function () {
      return callback(null, null, []);
    }
  );
};

exports.Backend = Backend;
