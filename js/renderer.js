var App = App || {};

App.renderer = {};

App.renderer.SAMPLES_PER_SEGMENT = 20;

App.renderer.SVG_NS = 'http://www.w3.org/2000/svg';

App.renderer._segmentCache = {};
App.renderer._patchedPolylines = {};
App.renderer._regionPolygons = [];

App.renderer.sampleClosed = function(points) {
	var sps = App.renderer.SAMPLES_PER_SEGMENT;
	var allSampled = [];
	var segCount = points.length;

	for (var i = 0; i < segCount; i++) {
		var p0 = points[i];
		var p1 = points[(i + 1) % points.length];
		var cp0out = App.spline.getOutCP(p0);
		var cp1in = App.spline.getInCP(p1);
		for (var s = 0; s < sps; s++) {
			var t = s / sps;
			allSampled.push(App.spline.cubicBezier(p0, cp0out, cp1in, p1, t));
		}
	}

	if (allSampled.length > 0) {
		allSampled.push({ x: allSampled[0].x, y: allSampled[0].y });
	}

	return allSampled;
};

App.renderer.isInsideAnyRegion = function(x, y) {
	var polys = App.renderer._regionPolygons;
	for (var i = 0; i < polys.length; i++) {
		if (App.spline.pointInPolygon(x, y, polys[i])) {
			return true;
		}
	}
	return false;
};

App.renderer.computeSharedBorders = function() {
	App.renderer._patchedPolylines = {};
	App.renderer._regionPolygons = [];

	if (!App.state.map) return;

	for (var ri = 0; ri < App.state.map.objects.length; ri++) {
		var rObj = App.state.map.objects[ri];
		if (rObj.type === 'region' && rObj.points && rObj.points.length >= 2) {
			App.renderer._regionPolygons.push(App.renderer.sampleClosed(rObj.points));
		}
	}

	var closedTypes = ['sea', 'region', 'lake'];
	var layerPriority = { 'sea': 0, 'region': 1, 'lake': 2 };
	var shapes = [];
	var seed = App.state.map.seed || 0;

	for (var oi = 0; oi < App.state.map.objects.length; oi++) {
		var obj = App.state.map.objects[oi];
		if (closedTypes.indexOf(obj.type) < 0) continue;
		if (!obj.points || obj.points.length < 2) continue;

		var sampled = App.renderer.sampleClosed(obj.points);

		var params = obj.params || {};
		var bn = params.borderNoise || {};
		var freq = bn.frequency || 0.03;
		var amp = bn.amplitude || 8;
		var oct = bn.octaves || 3;
		var displaced = App.noise.displacePoints(sampled, null, seed, freq, amp, oct);

		var priority = layerPriority[obj.type] * 100000 + oi;

		shapes.push({
			obj: obj,
			sampled: sampled,
			displaced: displaced,
			priority: priority
		});
	}

	if (shapes.length < 2) {
		for (var si = 0; si < shapes.length; si++) {
			App.renderer._patchedPolylines[shapes[si].obj.id] = shapes[si].displaced;
		}
		return;
	}

	var threshold = App.state.snapThreshold || 20;

	for (var si2 = 0; si2 < shapes.length; si2++) {
		var loser = shapes[si2];
		var N = loser.sampled.length - 1;

		var bestSource = new Array(N);
		var bestDist = new Array(N);
		var bestJ = new Array(N);
		for (var init = 0; init < N; init++) {
			bestSource[init] = -1;
			bestDist[init] = Infinity;
			bestJ[init] = -1;
		}

		for (var wi = 0; wi < shapes.length; wi++) {
			if (wi === si2) continue;
			var winner = shapes[wi];
			if (winner.priority <= loser.priority) continue;

			var M = winner.sampled.length - 1;
			for (var i = 0; i < N; i++) {
				var px = loser.sampled[i].x;
				var py = loser.sampled[i].y;
				for (var j = 0; j < M; j++) {
					var dx = px - winner.sampled[j].x;
					var dy = py - winner.sampled[j].y;
					var dist = Math.sqrt(dx * dx + dy * dy);
					if (dist < bestDist[i] && dist < threshold) {
						bestDist[i] = dist;
						bestJ[i] = j;
						bestSource[i] = wi;
					}
				}
			}
		}

		var runs = [];
		var inRun = false;
		var runStart = 0;
		var runSource = -1;
		for (var ri = 0; ri < N; ri++) {
			if (bestSource[ri] >= 0) {
				if (!inRun || bestSource[ri] !== runSource) {
					if (inRun) {
						runs.push({ start: runStart, end: ri - 1, source: runSource });
					}
					runStart = ri;
					runSource = bestSource[ri];
					inRun = true;
				}
			} else {
				if (inRun) {
					runs.push({ start: runStart, end: ri - 1, source: runSource });
					inRun = false;
				}
			}
		}
		if (inRun) {
			runs.push({ start: runStart, end: N - 1, source: runSource });
		}

		var minRunLength = 3;
		var validRuns = [];
		for (var vr = 0; vr < runs.length; vr++) {
			if (runs[vr].end - runs[vr].start + 1 >= minRunLength) {
				validRuns.push(runs[vr]);
			}
		}

		if (validRuns.length === 0) {
			App.renderer._patchedPolylines[loser.obj.id] = loser.displaced;
			continue;
		}

		var patched = [];
		var idx = 0;
		for (var pi = 0; pi < validRuns.length; pi++) {
			var run = validRuns[pi];
			for (var k = idx; k < run.start; k++) {
				patched.push(loser.displaced[k]);
			}
			var winShape = shapes[run.source];
			var jStart = bestJ[run.start];
			var jEnd = bestJ[run.end];

			var forward = true;
			if (run.end > run.start) {
				var jMid = bestJ[Math.floor((run.start + run.end) / 2)];
				if (jEnd < jStart) {
					forward = false;
				} else if (jEnd === jStart) {
					forward = (jMid >= jStart);
				}
			}

			if (forward) {
				if (jEnd >= jStart) {
					for (var fj = jStart; fj <= jEnd; fj++) {
						patched.push(winShape.displaced[fj]);
					}
				} else {
					for (var fj2 = jStart; fj2 < winShape.displaced.length - 1; fj2++) {
						patched.push(winShape.displaced[fj2]);
					}
					for (var fj3 = 0; fj3 <= jEnd; fj3++) {
						patched.push(winShape.displaced[fj3]);
					}
				}
			} else {
				if (jStart >= jEnd) {
					for (var rj = jStart; rj >= jEnd; rj--) {
						patched.push(winShape.displaced[rj]);
					}
				} else {
					for (var rj2 = jStart; rj2 >= 0; rj2--) {
						patched.push(winShape.displaced[rj2]);
					}
					for (var rj3 = winShape.displaced.length - 2; rj3 >= jEnd; rj3--) {
						patched.push(winShape.displaced[rj3]);
					}
				}
			}

			idx = run.end + 1;
		}
		for (var tail = idx; tail < loser.displaced.length; tail++) {
			patched.push(loser.displaced[tail]);
		}

		App.renderer._patchedPolylines[loser.obj.id] = patched;
	}

	for (var fi = 0; fi < shapes.length; fi++) {
		if (!App.renderer._patchedPolylines[shapes[fi].obj.id]) {
			App.renderer._patchedPolylines[shapes[fi].obj.id] = shapes[fi].displaced;
		}
	}
};

App.renderer.render = function() {
	App.renderer._segmentCache = {};

	var world = document.getElementById('svg-world');
	var defs = document.getElementById('svg-defs');
	world.innerHTML = '';
	defs.innerHTML = '';

	if (!App.state.map) return;

	App.renderer.computeSharedBorders();
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

	var displaced = App.renderer._patchedPolylines[obj.id];
	if (!displaced) {
		var sampled = App.renderer.sampleClosed(obj.points);
		var params = obj.params || {};
		var bn = params.borderNoise || {};
		var seed = App.state.map ? App.state.map.seed || 0 : 0;
		displaced = App.noise.displacePoints(sampled, null, seed, bn.frequency || 0.03, bn.amplitude || 8, bn.octaves || 3);
	}
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

	var sampled = App.renderer.sampleClosed(obj.points);

	if (params.bgColor && params.bgOpacity > 0) {
		var bgPath = document.createElementNS(App.renderer.SVG_NS, 'path');
		var bgD = App.spline.pointsToSvgPath(sampled, true);
		bgPath.setAttribute('d', bgD);
		bgPath.setAttribute('fill', params.bgColor);
		bgPath.setAttribute('fill-opacity', String(params.bgOpacity));
		bgPath.setAttribute('stroke', 'none');
		g.appendChild(bgPath);
	}

	var bounds = App.spline.getBounds(sampled);
	var biomeType = params.biomeType || 'forest';
	var density = params.density || 0.5;
	var elementScale = params.elementScale || 1.0;

	var spacing = 12 / density;
	var seed = App.state.map ? App.state.map.seed || 0 : 0;
	var idx = 0;

	var elements = [];

	for (var gx = bounds.minX; gx <= bounds.maxX; gx += spacing) {
		for (var gy = bounds.minY; gy <= bounds.maxY; gy += spacing) {
			var rnd1 = App.noise.seededRandom(seed + idx * 137);
			var rnd2 = App.noise.seededRandom(seed + idx * 271);
			var rnd3 = App.noise.seededRandom(seed + idx * 397);
			var px = gx + (rnd1 - 0.5) * spacing * 0.8;
			var py = gy + (rnd2 - 0.5) * spacing * 0.8;
			idx++;

			if (!App.spline.pointInPolygon(px, py, sampled)) continue;
			if (!App.renderer.isInsideAnyRegion(px, py)) continue;

			var el = App.renderer.renderBiomeElement(biomeType, px, py, rnd3, seed + idx, elementScale);
			if (el) {
				elements.push({ y: py, el: el });
			}
		}
	}

	elements.sort(function(a, b) { return a.y - b.y; });
	for (var ei = 0; ei < elements.length; ei++) {
		g.appendChild(elements[ei].el);
	}

	return g;
};

App.renderer.renderBiomeElement = function(biomeType, x, y, rnd, seed, elementScale) {
	var NS = App.renderer.SVG_NS;
	var es = elementScale || 1.0;

	switch (biomeType) {
		case 'forest': {
			var scale = (0.7 + rnd * 0.6) * es;
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
			var sc = (0.6 + rnd * 0.5) * es;
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
			var tsc = es;
			tundraG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + tsc.toFixed(2) + ')');
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
			var swsc = es;
			swG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + swsc.toFixed(2) + ')');
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
			var plsc = es;
			plG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + plsc.toFixed(2) + ')');
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
			var fjsc = es;
			fjG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + fjsc.toFixed(2) + ')');
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
		case 'desert': {
			var desG = document.createElementNS(NS, 'g');
			var dsc = es;
			desG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + dsc.toFixed(2) + ')');
			if (rnd > 0.6) {
				var cactus = document.createElementNS(NS, 'path');
				cactus.setAttribute('d', 'M0 0 L0 -8 M-3 -5 L-3 -3 L0 -3 M3 -6 L3 -4 L0 -4');
				cactus.setAttribute('fill', 'none');
				cactus.setAttribute('stroke', '#4a7a3a');
				cactus.setAttribute('stroke-width', '2');
				cactus.setAttribute('stroke-linecap', 'round');
				desG.appendChild(cactus);
			} else {
				var dune = document.createElementNS(NS, 'path');
				var dw = 5 + rnd * 5;
				dune.setAttribute('d', 'M' + (-dw) + ' 0 Q0 ' + (-3 - rnd * 3) + ' ' + dw + ' 0');
				dune.setAttribute('fill', '#d4b876');
				dune.setAttribute('stroke', '#c4a866');
				dune.setAttribute('stroke-width', '0.5');
				desG.appendChild(dune);
			}
			return desG;
		}
		case 'jungle': {
			var jscale = (0.8 + rnd * 0.7) * es;
			var jG = document.createElementNS(NS, 'g');
			jG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + jscale.toFixed(2) + ')');
			var jtrunk = document.createElementNS(NS, 'line');
			jtrunk.setAttribute('x1', '0');
			jtrunk.setAttribute('y1', '2');
			jtrunk.setAttribute('x2', '0');
			jtrunk.setAttribute('y2', '6');
			jtrunk.setAttribute('stroke', '#5C3A1E');
			jtrunk.setAttribute('stroke-width', '2.5');
			jG.appendChild(jtrunk);
			var jcrown = document.createElementNS(NS, 'ellipse');
			jcrown.setAttribute('cx', '0');
			jcrown.setAttribute('cy', '-3');
			jcrown.setAttribute('rx', '7');
			jcrown.setAttribute('ry', '5');
			jcrown.setAttribute('fill', '#1a6a1a');
			jG.appendChild(jcrown);
			var r3 = App.noise.seededRandom(seed + 55);
			var jcrown2 = document.createElementNS(NS, 'circle');
			jcrown2.setAttribute('cx', String(-3 + r3 * 2));
			jcrown2.setAttribute('cy', '-5');
			jcrown2.setAttribute('r', '4');
			jcrown2.setAttribute('fill', '#2d8a2d');
			jG.appendChild(jcrown2);
			return jG;
		}
		case 'savanna': {
			var sascale = (0.7 + rnd * 0.6) * es;
			var saG = document.createElementNS(NS, 'g');
			saG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + sascale.toFixed(2) + ')');
			var satrunk = document.createElementNS(NS, 'line');
			satrunk.setAttribute('x1', '0');
			satrunk.setAttribute('y1', '0');
			satrunk.setAttribute('x2', String((rnd - 0.5) * 2));
			satrunk.setAttribute('y2', '-10');
			satrunk.setAttribute('stroke', '#7a5a2a');
			satrunk.setAttribute('stroke-width', '1.5');
			saG.appendChild(satrunk);
			var sacrown = document.createElementNS(NS, 'ellipse');
			sacrown.setAttribute('cx', String((rnd - 0.5) * 2));
			sacrown.setAttribute('cy', '-11');
			sacrown.setAttribute('rx', '8');
			sacrown.setAttribute('ry', '3');
			sacrown.setAttribute('fill', '#6a8a2a');
			saG.appendChild(sacrown);
			return saG;
		}
		case 'steppe': {
			var stG = document.createElementNS(NS, 'g');
			var stsc = es;
			stG.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + stsc.toFixed(2) + ')');
			var bush = document.createElementNS(NS, 'ellipse');
			bush.setAttribute('cx', '0');
			bush.setAttribute('cy', '-2');
			bush.setAttribute('rx', String(3 + rnd * 2));
			bush.setAttribute('ry', String(2 + rnd * 1.5));
			bush.setAttribute('fill', '#8a9a4a');
			stG.appendChild(bush);
			var r4 = App.noise.seededRandom(seed + 77);
			if (r4 > 0.5) {
				var stem = document.createElementNS(NS, 'line');
				stem.setAttribute('x1', String((rnd - 0.5) * 3));
				stem.setAttribute('y1', '-3');
				stem.setAttribute('x2', String((rnd - 0.5) * 4));
				stem.setAttribute('y2', String(-5 - rnd * 2));
				stem.setAttribute('stroke', '#7a8a3a');
				stem.setAttribute('stroke-width', '0.8');
				stG.appendChild(stem);
			}
			return stG;
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
		var midX = (sampled[s].x + sampled[s + 1].x) / 2;
		var midY = (sampled[s].y + sampled[s + 1].y) / 2;
		if (!App.renderer.isInsideAnyRegion(midX, midY)) continue;

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
	var peakScale = params.peakScale || 1.0;

	var g = document.createElementNS(App.renderer.SVG_NS, 'g');
	g.setAttribute('data-id', obj.id);

	var peaks = [];
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

			if (!App.renderer.isInsideAnyRegion(px, py)) {
				peakIndex++;
				continue;
			}

			var baseH = 15 * peakScale;
			var h = baseH * (1 + (rnd - 0.5) * heightVar * 2) * fade;
			var w2 = h * 0.6;

			var peakG = document.createElementNS(App.renderer.SVG_NS, 'g');

			var peak = document.createElementNS(App.renderer.SVG_NS, 'path');
			peak.setAttribute('d',
				'M ' + (px - w2).toFixed(2) + ' ' + py.toFixed(2) +
				' L ' + px.toFixed(2) + ' ' + (py - h).toFixed(2) +
				' L ' + (px + w2).toFixed(2) + ' ' + py.toFixed(2) + ' Z');
			peak.setAttribute('fill', '#8B7355');
			peak.setAttribute('stroke', '#5C4A32');
			peak.setAttribute('stroke-width', '0.5');
			peakG.appendChild(peak);

			var snowH = h * 0.3;
			var snowW = w2 * 0.4;
			var snow = document.createElementNS(App.renderer.SVG_NS, 'path');
			snow.setAttribute('d',
				'M ' + (px - snowW).toFixed(2) + ' ' + (py - h + snowH).toFixed(2) +
				' L ' + px.toFixed(2) + ' ' + (py - h).toFixed(2) +
				' L ' + (px + snowW).toFixed(2) + ' ' + (py - h + snowH).toFixed(2) + ' Z');
			snow.setAttribute('fill', '#fff');
			snow.setAttribute('stroke', 'none');
			peakG.appendChild(snow);

			peaks.push({ y: py, el: peakG });
			peakIndex++;
		}
	}

	peaks.sort(function(a, b) { return a.y - b.y; });
	for (var pi = 0; pi < peaks.length; pi++) {
		g.appendChild(peaks[pi].el);
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

	for (var r = 0; r < regions.length; r++) {
		App.spline.autoSmoothAll(regions[r].points, true);
	}

	App.renderer.render();
	App.editor.updateOverlay();
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

			var dxA = mx - pA.x;
			var dyA = my - pA.y;
			pA.x = mx;
			pA.y = my;
			pA.cx1 += dxA;
			pA.cy1 += dyA;
			pA.cx2 += dxA;
			pA.cy2 += dyA;

			var dxB = mx - target.x;
			var dyB = my - target.y;
			target.x = mx;
			target.y = my;
			target.cx1 += dxB;
			target.cy1 += dyB;
			target.cx2 += dxB;
			target.cy2 += dyB;
		}
	}
};
