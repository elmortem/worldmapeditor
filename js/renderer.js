var App = App || {};

App.renderer = {};

App.renderer.SAMPLES_PER_SEGMENT = 20;

App.renderer.SVG_NS = 'http://www.w3.org/2000/svg';

App.renderer._segmentCache = {};
App.renderer._displacedCache = {};

App.renderer.makeSegmentKey = function(p0, p1) {
	var precision = 10;
	return Math.round(p0.x * precision) + ',' + Math.round(p0.y * precision) + ':' +
		Math.round(p1.x * precision) + ',' + Math.round(p1.y * precision);
};

App.renderer.sampleSegmentCached = function(p0, p1) {
	var sps = App.renderer.SAMPLES_PER_SEGMENT;
	var key = App.renderer.makeSegmentKey(p0, p1);
	var revKey = App.renderer.makeSegmentKey(p1, p0);

	if (App.renderer._segmentCache[key]) {
		return App.renderer._segmentCache[key];
	}

	if (App.renderer._segmentCache[revKey]) {
		var cached = App.renderer._segmentCache[revKey];
		var reversed = [];
		for (var r = cached.length - 1; r >= 0; r--) {
			reversed.push(cached[r]);
		}
		return reversed;
	}

	var cp0out = App.spline.getOutCP(p0);
	var cp1in = App.spline.getInCP(p1);
	var result = [];
	for (var s = 0; s < sps; s++) {
		var t = s / sps;
		result.push(App.spline.cubicBezier(p0, cp0out, cp1in, p1, t));
	}

	App.renderer._segmentCache[key] = result;
	return result;
};

App.renderer.sampleClosedWithCache = function(points) {
	var allSampled = [];
	var segCount = points.length;

	for (var i = 0; i < segCount; i++) {
		var p0 = points[i];
		var p1 = points[(i + 1) % points.length];
		var seg = App.renderer.sampleSegmentCached(p0, p1);
		for (var k = 0; k < seg.length; k++) {
			allSampled.push(seg[k]);
		}
	}

	if (allSampled.length > 0) {
		allSampled.push({ x: allSampled[0].x, y: allSampled[0].y });
	}

	return allSampled;
};

App.renderer.displaceClosedWithCache = function(points, seed, freq, amp, oct) {
	var allDisplaced = [];
	var segCount = points.length;

	for (var i = 0; i < segCount; i++) {
		var p0 = points[i];
		var p1 = points[(i + 1) % points.length];
		var segKey = App.renderer.makeSegmentKey(p0, p1);
		var revKey = App.renderer.makeSegmentKey(p1, p0);

		if (App.renderer._displacedCache[segKey]) {
			var cached = App.renderer._displacedCache[segKey];
			for (var c = 0; c < cached.length; c++) {
				allDisplaced.push(cached[c]);
			}
		} else if (App.renderer._displacedCache[revKey]) {
			var cachedRev = App.renderer._displacedCache[revKey];
			for (var r = cachedRev.length - 1; r >= 0; r--) {
				allDisplaced.push(cachedRev[r]);
			}
		} else {
			var sampled = App.renderer.sampleSegmentCached(p0, p1);
			var displaced = App.noise.displacePoints(sampled, null, seed, freq, amp, oct);
			App.renderer._displacedCache[segKey] = displaced;
			for (var d = 0; d < displaced.length; d++) {
				allDisplaced.push(displaced[d]);
			}
		}
	}

	if (allDisplaced.length > 0) {
		allDisplaced.push({ x: allDisplaced[0].x, y: allDisplaced[0].y });
	}

	return allDisplaced;
};

App.renderer.render = function() {
	App.renderer._segmentCache = {};
	App.renderer._displacedCache = {};

	var world = document.getElementById('svg-world');
	var defs = document.getElementById('svg-defs');
	world.innerHTML = '';
	defs.innerHTML = '';

	if (!App.state.map) return;

	App.renderer.renderDefs(defs);

	var layerOrder = ['sea', 'region', 'biome', 'lake', 'river', 'mountain', 'marker'];
	var labels = [];

	for (var li = 0; li < layerOrder.length; li++) {
		var type = layerOrder[li];
		var group = document.createElementNS(App.renderer.SVG_NS, 'g');
		group.setAttribute('class', 'layer-' + type);

		for (var oi = 0; oi < App.state.map.objects.length; oi++) {
			var obj = App.state.map.objects[oi];
			if (obj.type !== type) continue;

			var el = App.renderer.renderObject(obj);
			if (el) {
				group.appendChild(el);
			}

			if (obj.showLabel && obj.name) {
				labels.push(obj);
			}
		}

		world.appendChild(group);
	}

	var labelGroup = document.createElementNS(App.renderer.SVG_NS, 'g');
	labelGroup.setAttribute('class', 'layer-labels');
	for (var i = 0; i < labels.length; i++) {
		var lblEls = App.renderer.renderLabel(labels[i]);
		if (lblEls) {
			if (lblEls.length) {
				for (var k = 0; k < lblEls.length; k++) {
					labelGroup.appendChild(lblEls[k]);
				}
			} else {
				labelGroup.appendChild(lblEls);
			}
		}
	}
	world.appendChild(labelGroup);
};

App.renderer.renderDefs = function(defs) {
	var wavePattern = document.createElementNS(App.renderer.SVG_NS, 'pattern');
	wavePattern.setAttribute('id', 'wave-pattern');
	wavePattern.setAttribute('patternUnits', 'userSpaceOnUse');
	wavePattern.setAttribute('width', '60');
	wavePattern.setAttribute('height', '12');
	var wavePath = document.createElementNS(App.renderer.SVG_NS, 'path');
	wavePath.setAttribute('d', 'M0 6 Q15 0 30 6 Q45 12 60 6');
	wavePath.setAttribute('fill', 'none');
	wavePath.setAttribute('stroke', 'rgba(255,255,255,0.15)');
	wavePath.setAttribute('stroke-width', '1');
	wavePattern.appendChild(wavePath);
	defs.appendChild(wavePattern);

	App.renderer.createMarkerSymbols(defs);
};

App.renderer.createMarkerSymbols = function(defs) {
	var symbols = {
		'city': function(sym) {
			var c = document.createElementNS(App.renderer.SVG_NS, 'circle');
			c.setAttribute('cx', '0');
			c.setAttribute('cy', '0');
			c.setAttribute('r', '4');
			c.setAttribute('fill', '#333');
			c.setAttribute('stroke', '#fff');
			c.setAttribute('stroke-width', '1');
			sym.appendChild(c);
		},
		'capital': function(sym) {
			var c = document.createElementNS(App.renderer.SVG_NS, 'circle');
			c.setAttribute('cx', '0');
			c.setAttribute('cy', '0');
			c.setAttribute('r', '5');
			c.setAttribute('fill', '#333');
			c.setAttribute('stroke', '#fff');
			c.setAttribute('stroke-width', '1.5');
			sym.appendChild(c);
			var star = document.createElementNS(App.renderer.SVG_NS, 'path');
			star.setAttribute('d', 'M0 -3 L1 -1 L3 -1 L1.5 0.5 L2.5 3 L0 1.5 L-2.5 3 L-1.5 0.5 L-3 -1 L-1 -1 Z');
			star.setAttribute('fill', '#FFD700');
			sym.appendChild(star);
		},
		'ruin': function(sym) {
			var r = document.createElementNS(App.renderer.SVG_NS, 'path');
			r.setAttribute('d', 'M-4 4 L-4 -2 L-2 -4 L0 -2 L2 -4 L4 -2 L4 4');
			r.setAttribute('fill', 'none');
			r.setAttribute('stroke', '#666');
			r.setAttribute('stroke-width', '1.5');
			sym.appendChild(r);
		},
		'landmark': function(sym) {
			var d = document.createElementNS(App.renderer.SVG_NS, 'path');
			d.setAttribute('d', 'M0 -5 L3 0 L5 5 L-5 5 L-3 0 Z');
			d.setAttribute('fill', '#8B4513');
			d.setAttribute('stroke', '#fff');
			d.setAttribute('stroke-width', '1');
			sym.appendChild(d);
		},
		'port': function(sym) {
			var anchor = document.createElementNS(App.renderer.SVG_NS, 'path');
			anchor.setAttribute('d', 'M0 -4 L0 3 M-3 3 Q0 6 3 3 M-2 -1 L2 -1');
			anchor.setAttribute('fill', 'none');
			anchor.setAttribute('stroke', '#2255AA');
			anchor.setAttribute('stroke-width', '1.5');
			anchor.setAttribute('stroke-linecap', 'round');
			sym.appendChild(anchor);
			var top = document.createElementNS(App.renderer.SVG_NS, 'circle');
			top.setAttribute('cx', '0');
			top.setAttribute('cy', '-5');
			top.setAttribute('r', '1.5');
			top.setAttribute('fill', '#2255AA');
			sym.appendChild(top);
		}
	};

	for (var name in symbols) {
		var sym = document.createElementNS(App.renderer.SVG_NS, 'symbol');
		sym.setAttribute('id', 'marker-' + name);
		sym.setAttribute('overflow', 'visible');
		symbols[name](sym);
		defs.appendChild(sym);
	}
};

App.renderer.renderObject = function(obj) {
	switch (obj.type) {
		case 'region': return App.renderer.renderRegion(obj);
		case 'sea': return App.renderer.renderSea(obj);
		case 'lake': return App.renderer.renderLake(obj);
		case 'biome': return App.renderer.renderBiome(obj);
		case 'river': return App.renderer.renderRiver(obj);
		case 'mountain': return App.renderer.renderMountain(obj);
		case 'marker': return App.renderer.renderMarker(obj);
		default: return null;
	}
};

App.renderer.renderClosedShape = function(obj, fillColor, extraAttrs) {
	if (!obj.points || obj.points.length < 2) return null;

	var params = obj.params || {};
	var bn = params.borderNoise || {};
	var freq = bn.frequency || 0.03;
	var amp = bn.amplitude || 8;
	var oct = bn.octaves || 3;

	var seed = App.state.map ? App.state.map.seed || 0 : 0;
	var displaced = App.renderer.displaceClosedWithCache(obj.points, seed, freq, amp, oct);
	var d = App.spline.pointsToSvgPath(displaced, true);

	var path = document.createElementNS(App.renderer.SVG_NS, 'path');
	path.setAttribute('d', d);
	path.setAttribute('fill', fillColor);
	path.setAttribute('stroke', 'rgba(0,0,0,0.3)');
	path.setAttribute('stroke-width', '1');
	path.setAttribute('data-id', obj.id);

	if (extraAttrs) {
		for (var key in extraAttrs) {
			path.setAttribute(key, extraAttrs[key]);
		}
	}

	return path;
};

App.renderer.renderRegion = function(obj) {
	var params = obj.params || {};
	return App.renderer.renderClosedShape(obj, params.fillColor || '#8fbc8f');
};

App.renderer.renderSea = function(obj) {
	var params = obj.params || {};
	var g = document.createElementNS(App.renderer.SVG_NS, 'g');
	g.setAttribute('data-id', obj.id);

	var shape = App.renderer.renderClosedShape(obj, params.fillColor || '#4a7fb5');
	if (shape) {
		shape.removeAttribute('data-id');
		g.appendChild(shape);
	}

	if (params.wavePattern && shape) {
		var waveFill = shape.cloneNode();
		waveFill.setAttribute('fill', 'url(#wave-pattern)');
		waveFill.setAttribute('stroke', 'none');
		g.appendChild(waveFill);
	}

	return g;
};

App.renderer.renderLake = function(obj) {
	var params = obj.params || {};
	return App.renderer.renderClosedShape(obj, params.fillColor || '#6baed6');
};

App.renderer.renderBiome = function(obj) {
	if (!obj.points || obj.points.length < 2) return null;
	var params = obj.params || {};

	var g = document.createElementNS(App.renderer.SVG_NS, 'g');
	g.setAttribute('data-id', obj.id);
	g.setAttribute('opacity', String(params.opacity || 0.3));

	var sampled = App.renderer.sampleClosedWithCache(obj.points);
	var bounds = App.spline.getBounds(sampled);
	var biomeType = params.biomeType || 'forest';
	var density = params.density || 0.5;

	var spacing = 25 / density;
	var seed = App.state.map ? App.state.map.seed || 0 : 0;
	var idx = 0;

	for (var gx = bounds.minX; gx <= bounds.maxX; gx += spacing) {
		for (var gy = bounds.minY; gy <= bounds.maxY; gy += spacing) {
			var rnd1 = App.noise.seededRandom(seed + idx * 137);
			var rnd2 = App.noise.seededRandom(seed + idx * 271);
			var rnd3 = App.noise.seededRandom(seed + idx * 397);
			var px = gx + (rnd1 - 0.5) * spacing * 0.8;
			var py = gy + (rnd2 - 0.5) * spacing * 0.8;
			idx++;

			if (!App.spline.pointInPolygon(px, py, sampled)) continue;

			var el = App.renderer.renderBiomeElement(biomeType, px, py, rnd3, seed + idx);
			if (el) {
				g.appendChild(el);
			}
		}
	}

	return g;
};

App.renderer.renderBiomeElement = function(biomeType, x, y, rnd, seed) {
	var NS = App.renderer.SVG_NS;

	switch (biomeType) {
		case 'forest': {
			var scale = 0.7 + rnd * 0.6;
			var treeG = document.createElementNS(NS, 'g');
			treeG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + scale.toFixed(2) + ')');
			var crown = document.createElementNS(NS, 'circle');
			crown.setAttribute('cx', '0');
			crown.setAttribute('cy', '-4');
			crown.setAttribute('r', '5');
			crown.setAttribute('fill', '#2d7a2d');
			treeG.appendChild(crown);
			var trunk = document.createElementNS(NS, 'line');
			trunk.setAttribute('x1', '0');
			trunk.setAttribute('y1', '1');
			trunk.setAttribute('x2', '0');
			trunk.setAttribute('y2', '5');
			trunk.setAttribute('stroke', '#6B4226');
			trunk.setAttribute('stroke-width', '2');
			treeG.appendChild(trunk);
			return treeG;
		}
		case 'taiga': {
			var sc = 0.6 + rnd * 0.5;
			var tg = document.createElementNS(NS, 'g');
			tg.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + sc.toFixed(2) + ')');
			var tree = document.createElementNS(NS, 'path');
			tree.setAttribute('d', 'M0 -10 L-4 0 L-2 0 L-5 6 L5 6 L2 0 L4 0 Z');
			tree.setAttribute('fill', '#1a5c1a');
			tg.appendChild(tree);
			var tr = document.createElementNS(NS, 'line');
			tr.setAttribute('x1', '0');
			tr.setAttribute('y1', '6');
			tr.setAttribute('x2', '0');
			tr.setAttribute('y2', '10');
			tr.setAttribute('stroke', '#5C3A1E');
			tr.setAttribute('stroke-width', '1.5');
			tg.appendChild(tr);
			return tg;
		}
		case 'tundra': {
			var tundraG = document.createElementNS(NS, 'g');
			tundraG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')');
			var r2 = App.noise.seededRandom(seed + 99);
			for (var di = 0; di < 3; di++) {
				var dot = document.createElementNS(NS, 'circle');
				var dx = (di - 1) * 3 + (r2 - 0.5) * 2;
				var dy2 = (r2 * 2 - 1) * 2;
				dot.setAttribute('cx', dx.toFixed(1));
				dot.setAttribute('cy', dy2.toFixed(1));
				dot.setAttribute('r', String(1 + rnd));
				dot.setAttribute('fill', '#a8c8d8');
				tundraG.appendChild(dot);
			}
			return tundraG;
		}
		case 'swamp': {
			var swG = document.createElementNS(NS, 'g');
			swG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')');
			var wave = document.createElementNS(NS, 'path');
			var ww = 6 + rnd * 4;
			wave.setAttribute('d', 'M' + (-ww) + ' 0 Q' + (-ww/2) + ' -3 0 0 Q' + (ww/2) + ' 3 ' + ww + ' 0');
			wave.setAttribute('fill', 'none');
			wave.setAttribute('stroke', '#5a7a4a');
			wave.setAttribute('stroke-width', '1.5');
			swG.appendChild(wave);
			var reed = document.createElementNS(NS, 'line');
			reed.setAttribute('x1', '0');
			reed.setAttribute('y1', '0');
			reed.setAttribute('x2', String((rnd - 0.5) * 3));
			reed.setAttribute('y2', String(-5 - rnd * 4));
			reed.setAttribute('stroke', '#4a6a3a');
			reed.setAttribute('stroke-width', '1');
			swG.appendChild(reed);
			var tip = document.createElementNS(NS, 'ellipse');
			tip.setAttribute('cx', String((rnd - 0.5) * 3));
			tip.setAttribute('cy', String(-6 - rnd * 4));
			tip.setAttribute('rx', '1.5');
			tip.setAttribute('ry', '2.5');
			tip.setAttribute('fill', '#6a4a2a');
			swG.appendChild(tip);
			return swG;
		}
		case 'plains': {
			var plG = document.createElementNS(NS, 'g');
			plG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')');
			for (var gi = 0; gi < 3; gi++) {
				var grass = document.createElementNS(NS, 'line');
				var gx2 = (gi - 1) * 3 + (rnd - 0.5) * 2;
				var gh = 4 + rnd * 4;
				grass.setAttribute('x1', gx2.toFixed(1));
				grass.setAttribute('y1', '0');
				grass.setAttribute('x2', (gx2 + (rnd - 0.5) * 2).toFixed(1));
				grass.setAttribute('y2', (-gh).toFixed(1));
				grass.setAttribute('stroke', '#8aaa44');
				grass.setAttribute('stroke-width', '1');
				grass.setAttribute('stroke-linecap', 'round');
				plG.appendChild(grass);
			}
			return plG;
		}
		case 'fjord': {
			var fjG = document.createElementNS(NS, 'g');
			fjG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')');
			var rock = document.createElementNS(NS, 'path');
			var rw = 3 + rnd * 3;
			var rh = 4 + rnd * 5;
			rock.setAttribute('d', 'M' + (-rw) + ' 0 L' + (-rw*0.6).toFixed(1) + ' ' + (-rh).toFixed(1) + ' L' + (rw*0.3).toFixed(1) + ' ' + (-rh*0.8).toFixed(1) + ' L' + rw + ' 0 Z');
			rock.setAttribute('fill', '#7a8a9a');
			rock.setAttribute('stroke', '#5a6a7a');
			rock.setAttribute('stroke-width', '0.5');
			fjG.appendChild(rock);
			return fjG;
		}
		default:
			return null;
	}
};

App.renderer.renderRiver = function(obj) {
	if (!obj.points || obj.points.length < 2) return null;
	var params = obj.params || {};

	var sampled = App.spline.sampleSpline(obj.points, App.renderer.SAMPLES_PER_SEGMENT, false);

	if (params.sinuosity && params.sinuosity > 0) {
		for (var i = 0; i < sampled.length; i++) {
			var t = i / (sampled.length - 1);
			var riverSeed = App.state.map ? App.state.map.seed || 0 : 0;
			var sin_offset = Math.sin(t * Math.PI * 4 + riverSeed) * params.sinuosity;
			var nx = 0, ny = -1;
			if (i > 0 && i < sampled.length - 1) {
				var dx = sampled[i + 1].x - sampled[i - 1].x;
				var dy = sampled[i + 1].y - sampled[i - 1].y;
				var len = Math.sqrt(dx * dx + dy * dy);
				if (len > 0) {
					nx = -dy / len;
					ny = dx / len;
				}
			}
			sampled[i] = {
				x: sampled[i].x + nx * sin_offset,
				y: sampled[i].y + ny * sin_offset
			};
		}
	}

	var widthStart = params.widthStart || 1;
	var widthEnd = params.widthEnd || 5;
	var color = params.color || '#4a7fb5';

	var g = document.createElementNS(App.renderer.SVG_NS, 'g');
	g.setAttribute('data-id', obj.id);

	for (var s = 0; s < sampled.length - 1; s++) {
		var t1 = s / (sampled.length - 1);
		var w = widthStart + (widthEnd - widthStart) * t1;
		var seg = document.createElementNS(App.renderer.SVG_NS, 'line');
		seg.setAttribute('x1', sampled[s].x.toFixed(2));
		seg.setAttribute('y1', sampled[s].y.toFixed(2));
		seg.setAttribute('x2', sampled[s + 1].x.toFixed(2));
		seg.setAttribute('y2', sampled[s + 1].y.toFixed(2));
		seg.setAttribute('stroke', color);
		seg.setAttribute('stroke-width', w.toFixed(2));
		seg.setAttribute('stroke-linecap', 'round');
		g.appendChild(seg);
	}

	return g;
};

App.renderer.renderMountain = function(obj) {
	if (!obj.points || obj.points.length < 2) return null;
	var params = obj.params || {};

	var sampled = App.spline.sampleSpline(obj.points, App.renderer.SAMPLES_PER_SEGMENT, false);
	var totalLen = 0;
	for (var i = 1; i < sampled.length; i++) {
		var dx = sampled[i].x - sampled[i - 1].x;
		var dy = sampled[i].y - sampled[i - 1].y;
		totalLen += Math.sqrt(dx * dx + dy * dy);
	}

	var density = params.density || 0.8;
	var spacing = 1 / (density * 0.1 + 0.01);
	var width = params.width || 30;
	var heightVar = params.heightVariation || 0.4;
	var fadeStart = params.fadeStart || 0.1;
	var fadeEnd = params.fadeEnd || 0.15;

	var g = document.createElementNS(App.renderer.SVG_NS, 'g');
	g.setAttribute('data-id', obj.id);

	var dist = 0;
	var peakIndex = 0;
	for (var j = 1; j < sampled.length; j++) {
		var ddx = sampled[j].x - sampled[j - 1].x;
		var ddy = sampled[j].y - sampled[j - 1].y;
		dist += Math.sqrt(ddx * ddx + ddy * ddy);

		if (dist >= spacing * peakIndex && peakIndex * spacing <= totalLen) {
			var t = dist / totalLen;

			var fade = 1.0;
			if (t < fadeStart) {
				fade = t / fadeStart;
			} else if (t > 1.0 - fadeEnd) {
				fade = (1.0 - t) / fadeEnd;
			}
			fade = Math.max(0, Math.min(1, fade));

			var mtSeed = App.state.map ? App.state.map.seed || 0 : 0;
			var rnd = App.noise.seededRandom(mtSeed + peakIndex * 137);
			var rnd2 = App.noise.seededRandom(mtSeed + peakIndex * 271);

			var nx = 0, ny = -1;
			if (j < sampled.length - 1) {
				var tdx = sampled[j + 1].x - sampled[j - 1].x;
				var tdy = sampled[j + 1].y - sampled[j - 1].y;
				var tlen = Math.sqrt(tdx * tdx + tdy * tdy);
				if (tlen > 0) {
					nx = -tdy / tlen;
					ny = tdx / tlen;
				}
			}

			var offsetDist = (rnd2 - 0.5) * width;
			var px = sampled[j].x + nx * offsetDist;
			var py = sampled[j].y + ny * offsetDist;

			var baseH = 15;
			var h = baseH * (1 + (rnd - 0.5) * heightVar * 2) * fade;
			var w2 = h * 0.6;

			var peak = document.createElementNS(App.renderer.SVG_NS, 'path');
			peak.setAttribute('d',
				'M ' + (px - w2).toFixed(2) + ' ' + py.toFixed(2) +
				' L ' + px.toFixed(2) + ' ' + (py - h).toFixed(2) +
				' L ' + (px + w2).toFixed(2) + ' ' + py.toFixed(2) + ' Z');
			peak.setAttribute('fill', '#8B7355');
			peak.setAttribute('stroke', '#5C4A32');
			peak.setAttribute('stroke-width', '0.5');
			g.appendChild(peak);

			var snowH = h * 0.3;
			var snowW = w2 * 0.4;
			var snow = document.createElementNS(App.renderer.SVG_NS, 'path');
			snow.setAttribute('d',
				'M ' + (px - snowW).toFixed(2) + ' ' + (py - h + snowH).toFixed(2) +
				' L ' + px.toFixed(2) + ' ' + (py - h).toFixed(2) +
				' L ' + (px + snowW).toFixed(2) + ' ' + (py - h + snowH).toFixed(2) + ' Z');
			snow.setAttribute('fill', '#fff');
			snow.setAttribute('stroke', 'none');
			g.appendChild(snow);

			peakIndex++;
		}
	}

	return g;
};

App.renderer.renderMarker = function(obj) {
	if (!obj.points || obj.points.length === 0) return null;
	var params = obj.params || {};
	var pt = obj.points[0];
	var markerType = params.markerType || 'city';
	var size = params.iconSize || 10;

	var use = document.createElementNS(App.renderer.SVG_NS, 'use');
	use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#marker-' + markerType);
	use.setAttribute('x', pt.x);
	use.setAttribute('y', pt.y);
	use.setAttribute('width', size);
	use.setAttribute('height', size);
	use.setAttribute('data-id', obj.id);

	return use;
};

App.renderer.getLabelStyle = function(obj) {
	var params = obj.params || {};
	var labelSize = params.labelSize || 'medium';
	var sizes = {
		'tiny': { fontSize: 8, strokeWidth: 1.5 },
		'small': { fontSize: 11, strokeWidth: 2 },
		'medium': { fontSize: 14, strokeWidth: 3 },
		'large': { fontSize: 20, strokeWidth: 3.5 },
		'huge': { fontSize: 28, strokeWidth: 4 }
	};
	return sizes[labelSize] || sizes['medium'];
};

App.renderer.renderLabel = function(obj) {
	if (!obj.points || obj.points.length === 0) return null;

	if (obj.type === 'river') {
		return App.renderer.renderRiverLabel(obj);
	}

	var style = App.renderer.getLabelStyle(obj);
	var cx, cy;

	if (obj.type === 'marker') {
		cx = obj.points[0].x;
		cy = obj.points[0].y - (style.fontSize + 4);
	} else {
		var sampled = App.spline.sampleSpline(obj.points, 10, App.state.isClosedType(obj.type));
		var bounds = App.spline.getBounds(sampled);
		cx = bounds.minX + bounds.width / 2;
		cy = bounds.minY + bounds.height / 2;
	}

	var text = document.createElementNS(App.renderer.SVG_NS, 'text');
	text.setAttribute('x', cx.toFixed(2));
	text.setAttribute('y', cy.toFixed(2));
	text.setAttribute('text-anchor', 'middle');
	text.setAttribute('dominant-baseline', 'middle');
	text.setAttribute('class', 'map-label');
	text.setAttribute('font-size', style.fontSize);
	text.setAttribute('stroke-width', style.strokeWidth + 'px');
	text.setAttribute('data-id', obj.id);
	text.textContent = obj.name;

	return text;
};

App.renderer.renderRiverLabel = function(obj) {
	if (!obj.points || obj.points.length < 2) return null;
	var style = App.renderer.getLabelStyle(obj);

	var sampled = App.spline.sampleSpline(obj.points, App.renderer.SAMPLES_PER_SEGMENT, false);
	if (sampled.length < 2) return null;

	var cumDist = [0];
	for (var i = 1; i < sampled.length; i++) {
		var dx = sampled[i].x - sampled[i - 1].x;
		var dy = sampled[i].y - sampled[i - 1].y;
		cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dy * dy));
	}
	var totalLen = cumDist[cumDist.length - 1];

	var textLen = obj.name.length * style.fontSize * 0.6;
	var repeatCount = Math.max(1, Math.floor(totalLen / (textLen * 3)));
	var results = [];

	for (var ri = 0; ri < repeatCount; ri++) {
		var centerT = (ri + 0.5) / repeatCount;
		var centerDist = centerT * totalLen;

		var centerIdx = 0;
		for (var ci = 1; ci < cumDist.length; ci++) {
			if (cumDist[ci] >= centerDist) {
				centerIdx = ci;
				break;
			}
		}
		if (centerIdx === 0) centerIdx = 1;

		var p0 = sampled[Math.max(0, centerIdx - 1)];
		var p1 = sampled[Math.min(sampled.length - 1, centerIdx)];
		var angle = Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;

		if (angle > 90) {
			angle -= 180;
		}
		if (angle < -90) {
			angle += 180;
		}

		var cx = (p0.x + p1.x) / 2;
		var cy = (p0.y + p1.y) / 2;

		var text = document.createElementNS(App.renderer.SVG_NS, 'text');
		text.setAttribute('x', '0');
		text.setAttribute('y', '0');
		text.setAttribute('text-anchor', 'middle');
		text.setAttribute('dominant-baseline', 'middle');
		text.setAttribute('class', 'map-label river-label');
		text.setAttribute('font-size', style.fontSize);
		text.setAttribute('stroke-width', style.strokeWidth + 'px');
		text.setAttribute('fill', '#2a5a8a');
		text.setAttribute('font-style', 'italic');
		text.setAttribute('transform',
			'translate(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ') rotate(' + angle.toFixed(1) + ')');
		text.setAttribute('data-id', obj.id);
		text.textContent = obj.name;

		results.push(text);
	}

	return results;
};

App.renderer.updateViewport = function() {
	var svg = document.getElementById('canvas');
	var vp = App.state.viewport;
	var w = svg.clientWidth || 800;
	var h = svg.clientHeight || 600;

	var vbX = vp.x - (w / 2) / vp.zoom;
	var vbY = vp.y - (h / 2) / vp.zoom;
	var vbW = w / vp.zoom;
	var vbH = h / vp.zoom;

	svg.setAttribute('viewBox', vbX.toFixed(2) + ' ' + vbY.toFixed(2) + ' ' + vbW.toFixed(2) + ' ' + vbH.toFixed(2));
};

App.renderer.screenToWorld = function(screenX, screenY) {
	var svg = document.getElementById('canvas');
	var rect = svg.getBoundingClientRect();
	var vp = App.state.viewport;
	var w = rect.width;
	var h = rect.height;

	return {
		x: vp.x + (screenX - rect.left - w / 2) / vp.zoom,
		y: vp.y + (screenY - rect.top - h / 2) / vp.zoom
	};
};

App.renderer.hitTest = function(worldX, worldY) {
	var objects = App.state.map.objects;
	var threshold = 8 / App.state.viewport.zoom;
	var layerOrder = ['marker', 'mountain', 'river', 'lake', 'biome', 'region', 'sea'];

	for (var li = 0; li < layerOrder.length; li++) {
		var type = layerOrder[li];
		for (var i = objects.length - 1; i >= 0; i--) {
			var obj = objects[i];
			if (obj.type !== type) continue;
			if (!obj.points || obj.points.length === 0) continue;

			if (obj.type === 'marker') {
				var pt = obj.points[0];
				var dist = Math.sqrt((worldX - pt.x) * (worldX - pt.x) + (worldY - pt.y) * (worldY - pt.y));
				if (dist < threshold * 2) return obj;
				continue;
			}

			var closed = App.state.isClosedType(obj.type);
			var sampled = App.spline.sampleSpline(obj.points, App.renderer.SAMPLES_PER_SEGMENT, closed);

			if (closed) {
				if (App.spline.pointInPolygon(worldX, worldY, sampled)) return obj;
			} else {
				if (App.spline.hitTestPolyline(worldX, worldY, sampled, threshold)) return obj;
			}
		}
	}

	return null;
};

App.renderer.circDist = function(from, to, len) {
	var d = to - from;
	if (d < 0) d += len;
	return d;
};

App.renderer.circRange = function(from, to, len) {
	var result = [];
	var i = from;
	var safety = len + 1;
	while (i !== to && safety-- > 0) {
		result.push(i);
		i = (i + 1) % len;
	}
	result.push(to);
	return result;
};

App.renderer.snapRegionBorders = function() {
	if (!App.state.map) return;

	var closedTypes = ['region', 'sea', 'lake'];
	var regions = [];
	for (var i = 0; i < App.state.map.objects.length; i++) {
		var obj = App.state.map.objects[i];
		if (closedTypes.indexOf(obj.type) >= 0 && obj.points && obj.points.length >= 2) {
			regions.push(obj);
		}
	}

	if (regions.length < 2) return;

	App.state.pushUndo();
	var threshold = App.state.snapThreshold;

	for (var a = 0; a < regions.length; a++) {
		for (var b = a + 1; b < regions.length; b++) {
			App.renderer.snapPositions(regions[a], regions[b], threshold);
		}
	}

	for (var a2 = 0; a2 < regions.length; a2++) {
		for (var b2 = a2 + 1; b2 < regions.length; b2++) {
			App.renderer.equalizeSharedSegments(regions[a2], regions[b2]);
		}
	}

	for (var r = 0; r < regions.length; r++) {
		App.spline.autoSmoothAll(regions[r].points, true);
	}

	for (var a3 = 0; a3 < regions.length; a3++) {
		for (var b3 = a3 + 1; b3 < regions.length; b3++) {
			App.renderer.syncSharedHandles(regions[a3], regions[b3]);
		}
	}

	App.renderer.render();
	App.editor.updateOverlay();
};

App.renderer.findMatchedPoints = function(rA, rB, eps) {
	var matches = [];
	for (var i = 0; i < rA.points.length; i++) {
		for (var j = 0; j < rB.points.length; j++) {
			var dx = rA.points[i].x - rB.points[j].x;
			var dy = rA.points[i].y - rB.points[j].y;
			if (Math.sqrt(dx * dx + dy * dy) < eps) {
				matches.push({ a: i, b: j });
				break;
			}
		}
	}
	return matches;
};

App.renderer.snapPositions = function(rA, rB, threshold) {
	for (var pi = 0; pi < rA.points.length; pi++) {
		var pA = rA.points[pi];
		var bestDist = threshold;
		var bestIdx = -1;

		for (var pj = 0; pj < rB.points.length; pj++) {
			var pB = rB.points[pj];
			var dx = pA.x - pB.x;
			var dy = pA.y - pB.y;
			var dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < bestDist && dist > 0.01) {
				bestDist = dist;
				bestIdx = pj;
			}
		}

		if (bestIdx >= 0) {
			var target = rB.points[bestIdx];
			var mx = (pA.x + target.x) / 2;
			var my = (pA.y + target.y) / 2;

			pA.x = mx;
			pA.y = my;
			pA.cx1 = mx;
			pA.cy1 = my;
			pA.cx2 = mx;
			pA.cy2 = my;

			target.x = mx;
			target.y = my;
			target.cx1 = mx;
			target.cy1 = my;
			target.cx2 = mx;
			target.cy2 = my;
		}
	}
};

App.renderer.equalizeSharedSegments = function(rA, rB) {
	var matches = App.renderer.findMatchedPoints(rA, rB, 0.1);
	if (matches.length < 2) return;

	var segments = [];
	for (var mi = 0; mi < matches.length; mi++) {
		var curr = matches[mi];
		var next = matches[(mi + 1) % matches.length];

		var aFrom = curr.a;
		var aTo = next.a;
		var bFrom = curr.b;
		var bTo = next.b;

		var aDist = App.renderer.circDist(aFrom, aTo, rA.points.length);
		var bDistFwd = App.renderer.circDist(bFrom, bTo, rB.points.length);
		var bDistRev = App.renderer.circDist(bTo, bFrom, rB.points.length);
		var bReversed = bDistRev < bDistFwd;
		var bDist = Math.min(bDistFwd, bDistRev);

		if (aDist > rA.points.length / 2) continue;
		if (bDist > rB.points.length / 2) continue;
		if (aDist <= 1 && bDist <= 1) continue;
		if (aDist === bDist) continue;

		segments.push({
			aFrom: aFrom, aTo: aTo,
			bFrom: bFrom, bTo: bTo,
			aDist: aDist, bDist: bDist,
			bReversed: bReversed
		});
	}

	if (segments.length === 0) return;

	var aReplacements = [];
	var bReplacements = [];

	for (var si = 0; si < segments.length; si++) {
		var seg = segments[si];
		var aCount = seg.aDist - 1;
		var bCount = seg.bDist - 1;

		if (aCount < bCount) {
			var bPath;
			if (seg.bReversed) {
				bPath = App.renderer.circRange(seg.bTo, seg.bFrom, rB.points.length).reverse();
			} else {
				bPath = App.renderer.circRange(seg.bFrom, seg.bTo, rB.points.length);
			}
			var newIntermediates = [];
			for (var bi = 1; bi < bPath.length - 1; bi++) {
				var sp = rB.points[bPath[bi]];
				newIntermediates.push({ x: sp.x, y: sp.y });
			}
			aReplacements.push({
				fromIndex: seg.aFrom,
				toIndex: seg.aTo,
				dist: seg.aDist,
				newIntermediates: newIntermediates
			});
		} else {
			var aPath = App.renderer.circRange(seg.aFrom, seg.aTo, rA.points.length);
			var newIntermediatesB = [];
			for (var ai = 1; ai < aPath.length - 1; ai++) {
				var spA = rA.points[aPath[ai]];
				newIntermediatesB.push({ x: spA.x, y: spA.y });
			}
			var bFromIdx = seg.bReversed ? seg.bTo : seg.bFrom;
			var bToIdx = seg.bReversed ? seg.bFrom : seg.bTo;
			bReplacements.push({
				fromIndex: bFromIdx,
				toIndex: bToIdx,
				dist: seg.bDist,
				newIntermediates: seg.bReversed ? newIntermediatesB.slice().reverse() : newIntermediatesB
			});
		}
	}

	if (aReplacements.length > 0) {
		rA.points = App.renderer.rebuildPoints(rA.points, aReplacements);
	}
	if (bReplacements.length > 0) {
		rB.points = App.renderer.rebuildPoints(rB.points, bReplacements);
	}
};

App.renderer.rebuildPoints = function(originalPoints, replacements) {
	var skipSet = {};
	var insertAfterMap = {};

	for (var r = 0; r < replacements.length; r++) {
		var rep = replacements[r];
		var range = App.renderer.circRange(rep.fromIndex, rep.toIndex, originalPoints.length);
		for (var ri = 1; ri < range.length - 1; ri++) {
			skipSet[range[ri]] = true;
		}
		insertAfterMap[rep.fromIndex] = rep.newIntermediates;
	}

	var result = [];
	for (var i = 0; i < originalPoints.length; i++) {
		if (skipSet[i]) continue;
		result.push(originalPoints[i]);
		if (insertAfterMap[i]) {
			var pts = insertAfterMap[i];
			for (var j = 0; j < pts.length; j++) {
				result.push(App.spline.createPoint(pts[j].x, pts[j].y));
			}
		}
	}

	return result;
};

App.renderer.syncSharedHandles = function(rA, rB) {
	var matches = App.renderer.findMatchedPoints(rA, rB, 0.1);
	if (matches.length < 2) return;

	for (var mi = 0; mi < matches.length; mi++) {
		var curr = matches[mi];
		var next = matches[(mi + 1) % matches.length];

		var aFrom = curr.a;
		var aTo = next.a;
		var bFrom = curr.b;
		var bTo = next.b;

		var aDist = App.renderer.circDist(aFrom, aTo, rA.points.length);
		if (aDist > rA.points.length / 2) continue;
		if (aDist < 1) continue;

		var bDistFwd = App.renderer.circDist(bFrom, bTo, rB.points.length);
		var bDistRev = App.renderer.circDist(bTo, bFrom, rB.points.length);
		var bReversed = bDistRev < bDistFwd;
		var bDist = Math.min(bDistFwd, bDistRev);

		if (aDist !== bDist) continue;

		var aPath = App.renderer.circRange(aFrom, aTo, rA.points.length);
		var bPath;
		if (bReversed) {
			bPath = App.renderer.circRange(bTo, bFrom, rB.points.length).reverse();
		} else {
			bPath = App.renderer.circRange(bFrom, bTo, rB.points.length);
		}

		if (aPath.length !== bPath.length) continue;

		for (var pi = 0; pi < aPath.length; pi++) {
			var ptA = rA.points[aPath[pi]];
			var ptB = rB.points[bPath[pi]];

			var isFirst = (pi === 0);
			var isLast = (pi === aPath.length - 1);

			if (!isFirst && !isLast) {
				if (bReversed) {
					ptB.cx1 = ptA.cx2;
					ptB.cy1 = ptA.cy2;
					ptB.cx2 = ptA.cx1;
					ptB.cy2 = ptA.cy1;
				} else {
					ptB.cx1 = ptA.cx1;
					ptB.cy1 = ptA.cy1;
					ptB.cx2 = ptA.cx2;
					ptB.cy2 = ptA.cy2;
				}
			} else if (isFirst) {
				if (bReversed) {
					ptB.cx1 = ptA.cx2;
					ptB.cy1 = ptA.cy2;
				} else {
					ptB.cx2 = ptA.cx2;
					ptB.cy2 = ptA.cy2;
				}
			} else if (isLast) {
				if (bReversed) {
					ptB.cx2 = ptA.cx1;
					ptB.cy2 = ptA.cy1;
				} else {
					ptB.cx1 = ptA.cx1;
					ptB.cy1 = ptA.cy1;
				}
			}
		}
	}
};
