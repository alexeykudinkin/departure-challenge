
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


function Route(agency, name, code, directions) {
  this.agency = agency;
  this.name = name;
  this.code = code;
  this.directions = directions;
}

Route.schema = {
  agency: String,
  name: String,
  code: String
};

exports.Route = Route;


function Stop(route, name, code, direction) {
  this.route = route;
  this.name = name;
  this.code = code;
  this.direction = direction;
}

Stop.schema = {
  route: String,
  name: String,
  code: String
};

exports.Stop = Stop;


function Departure(stop, time) {
  this.stop = stop;
  this.time = time;
}

Departure.schema = {
  stop: String,
  time: Number
};

exports.Departure = Departure;
