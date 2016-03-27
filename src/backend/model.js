
var mongoose = require('mongoose'); 

var exports = module.exports;


function Agency(name, directional, mode) {
  this.name = name;
  this.directional = directional;
  this.mode = mode;
}

Agency.schema = {
  name: String,
  directional: Boolean,
  mode: String
};

exports.Agency = Agency;


function Route(agency, name, code) {
  this.agency = agency;
  this.name = name;
  this.code = code;
}

Route.schema = {
  agency: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
  name: String,
  code: String
};

exports.Route = Route;


function Stop(route, name, code) {
  this.route = route;
  this.name = name;
  this.code = code;
}

Stop.schema = {
  route: {type: mongoose.Schema.Types.ObjectId, ref: 'Route'},
  name: String,
  code: String
};

exports.Stop = Stop;