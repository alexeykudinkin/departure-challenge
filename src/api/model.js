
var exports = module.exports;

function Agency(name, directional, mode) {
  this.name = name;
  this.directional = directional;
  this.mode = mode;
}

exports.Agency = Agency;

function Route(agency, name, code) {
  this.agency = agency;
  this.name = name;
  this.code = code;
}

exports.Route = Route;

function Stop(route, name, code) {
  this.route = route;
  this.name = name;
  this.code = code;
}

exports.Stop = Stop;