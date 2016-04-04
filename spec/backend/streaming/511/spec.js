
var assert  = require('assert');
var sinon   = require('sinon');

var streaming = require('../../../../src/backend/streaming/511');

describe('511.com Streaming Backend (Compatibility) Suite', function () {

  it('Should properly handle `getAgencies`', function () {

    var stub = {
      requestAPI: function (endpoint, params, cb) {
        return cb(null, null, require('./fixtures/get-agencies.json').value);
      }
    };

    var spy = sinon.spy();

    streaming.Backend.prototype.getAgencies.apply(stub, [ spy ]);

    var response = require('./fixtures/get-agencies-gold.json').value;

    assert.deepEqual(spy.args[0], [ null, null, response ]);
  });

  it('Should properly handle `getRoutesForAgencies`', function () {

    var stub = {
      requestAPI: function (endpoint, params, cb) {
        return cb(null, null, require('./fixtures/get-routes-for-agencies.json').value);
      }
    };

    var spy = sinon.spy();

    streaming.Backend.prototype.getRoutesForAgencies.apply(stub, [ [ 'LAVTA' ], spy ]);

    var response = require('./fixtures/get-routes-for-agencies-gold.json').value;

    assert.deepEqual(spy.args[0], [ null, null, response ]);
  });

  it('Should properly handle `getStopsForRoutes` with direction', function () {

    var stub = {
      requestAPI: function (endpoint, params, cb) {
        return cb(null, null, require('./fixtures/get-stops-for-routes-directional.json').value);
      }
    };

    var spy = sinon.spy();

    streaming.Backend.prototype.getStopsForRoutes.apply(stub, [ [ { agency: { name: 'LAVTA' }, code: "15" } ], [ "LOOP" ], spy ]);

    var response = require('./fixtures/get-stops-for-routes-directional-gold.json').value;

    // NOTA BENE: Here, we do compare not the objects itselves but their respective JSON representations
    //            tu squeeze out all the `undefined`-ness
    assert.deepEqual(JSON.stringify(spy.args[0]), JSON.stringify([ null, null, response ]));
  });

  // it('Should properly handle `getStopsForRoutes` without direction', function () {
  //
  //   var stub = {
  //     requestAPI: function (endpoint, params, cb) {
  //       return cb(null, null, require('./fixtures/get-stops-for-routes-directional.json').value);
  //     }
  //   };
  //
  //   var spy = sinon.spy();
  //
  //   streaming.Backend.prototype.getStopsForRoutes.apply(stub, [ [ 'LAVTA' ], spy ]);
  //
  //   var response = require('./fixtures/get-stops-for-routes-directional-gold.json').value;
  //
  //   assert.deepEqual(spy.args[0], [ null, null, response ]);
  // });

  it('Should properly handle `getDeparturesForStop` with direction', function () {

    var stub = {
      requestAPI: function (endpoint, params, cb) {
        return cb(null, null, require('./fixtures/get-departures-for-stops.json').value);
      }
    };

    var spy = sinon.spy();

    streaming.Backend.prototype.getDeparturesForStop.apply(stub, [ [ { route: { agency: { name: 'LAVTA' }, code: "15" }, code: "880225" } ], spy ]);

    var response = require('./fixtures/get-departures-for-stops-gold.json').value;

    // NOTA BENE: Here, we do compare not the objects itselves but their respective JSON representations
    //            tu squeeze out all the `undefined`-ness
    assert.deepEqual(JSON.stringify(spy.args[0]), JSON.stringify([ null, null, response ]));
  });

});