
Array.prototype.flatMap = function (cb) {
  return this.map(cb).reduce(function (arr, c) { return arr.concat(c); }, []);
};
