var App = App || {};

App.noise = {};

App.noise._instances = {};

App.noise.getInstance = function(seed) {
	if (!App.noise._instances[seed]) {
		App.noise._instances[seed] = new SimplexNoise(seed);
	}
	return App.noise._instances[seed];
};

App.noise.clearCache = function() {
	App.noise._instances = {};
};

App.noise.fractalNoise = function(x, y, seed, frequency, amplitude, octaves) {
	var simplex = App.noise.getInstance(seed);
	octaves = octaves || 3;
	var total = 0;
	var freq = frequency;
	var amp = amplitude;
	for (var i = 0; i < octaves; i++) {
		total += simplex.noise2D(x * freq, y * freq) * amp;
		freq *= 2;
		amp *= 0.5;
	}
	return total;
};

App.noise.displacePoints = function(sampledPoints, normals, seed, frequency, amplitude, octaves) {
	if (!sampledPoints) return sampledPoints;
	var result = [];
	for (var i = 0; i < sampledPoints.length; i++) {
		var p = sampledPoints[i];
		var dx = App.noise.fractalNoise(p.x, p.y, seed, frequency, amplitude, octaves);
		var dy = App.noise.fractalNoise(p.x + 1000, p.y + 1000, seed, frequency, amplitude, octaves);
		result.push({
			x: p.x + dx,
			y: p.y + dy
		});
	}
	return result;
};

App.noise.seededRandom = function(seed) {
	var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
};
