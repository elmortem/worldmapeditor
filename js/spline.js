var App = App || {};

App.spline = {};

App.spline.cubicBezier = function(p0, cp0out, cp1in, p1, t) {
	var t2 = t * t;
	var t3 = t2 * t;
	var mt = 1 - t;
	var mt2 = mt * mt;
	var mt3 = mt2 * mt;
	return {
		x: mt3 * p0.x + 3 * mt2 * t * cp0out.x + 3 * mt * t2 * cp1in.x + t3 * p1.x,
		y: mt3 * p0.y + 3 * mt2 * t * cp0out.y + 3 * mt * t2 * cp1in.y + t3 * p1.y
	};
};

App.spline.cubicBezierDerivative = function(p0, cp0out, cp1in, p1, t) {
	var mt = 1 - t;
	var mt2 = mt * mt;
	var t2 = t * t;
	return {
		x: 3 * mt2 * (cp0out.x - p0.x) + 6 * mt * t * (cp1in.x - cp0out.x) + 3 * t2 * (p1.x - cp1in.x),
		y: 3 * mt2 * (cp0out.y - p0.y) + 6 * mt * t * (cp1in.y - cp0out.y) + 3 * t2 * (p1.y - cp1in.y)
	};
};

App.spline.normalAt = function(p0, cp0out, cp1in, p1, t) {
	var d = App.spline.cubicBezierDerivative(p0, cp0out, cp1in, p1, t);
	var len = Math.sqrt(d.x * d.x + d.y * d.y);
	if (len < 0.0001) return { x: 0, y: -1 };
	return { x: -d.y / len, y: d.x / len };
};

App.spline.getOutCP = function(pt) {
	return { x: pt.cx2 !== undefined ? pt.cx2 : pt.x, y: pt.cy2 !== undefined ? pt.cy2 : pt.y };
};

App.spline.getInCP = function(pt) {
	return { x: pt.cx1 !== undefined ? pt.cx1 : pt.x, y: pt.cy1 !== undefined ? pt.cy1 : pt.y };
};

App.spline.sampleSpline = function(points, samplesPerSegment, closed) {
	if (!points || points.length === 0) return [];
	if (points.length === 1) return [{ x: points[0].x, y: points[0].y }];

	var result = [];
	var segCount = closed ? points.length : points.length - 1;

	for (var i = 0; i < segCount; i++) {
		var p0 = points[i];
		var p1 = points[(i + 1) % points.length];
		var cp0out = App.spline.getOutCP(p0);
		var cp1in = App.spline.getInCP(p1);

		var steps = samplesPerSegment;
		for (var s = 0; s < steps; s++) {
			var t = s / steps;
			result.push(App.spline.cubicBezier(p0, cp0out, cp1in, p1, t));
		}
	}

	if (closed && result.length > 0) {
		result.push({ x: result[0].x, y: result[0].y });
	} else if (!closed && points.length > 1) {
		var last = points[points.length - 1];
		result.push({ x: last.x, y: last.y });
	}

	return result;
};

App.spline.sampleNormals = function(points, samplesPerSegment, closed) {
	if (!points || points.length < 2) return [];

	var result = [];
	var segCount = closed ? points.length : points.length - 1;

	for (var i = 0; i < segCount; i++) {
		var p0 = points[i];
		var p1 = points[(i + 1) % points.length];
		var cp0out = App.spline.getOutCP(p0);
		var cp1in = App.spline.getInCP(p1);

		var steps = samplesPerSegment;
		for (var s = 0; s < steps; s++) {
			var t = s / steps;
			result.push(App.spline.normalAt(p0, cp0out, cp1in, p1, t));
		}
	}

	if (closed && result.length > 0) {
		result.push({ x: result[0].x, y: result[0].y });
	} else if (!closed) {
		var lastSeg = segCount - 1;
		var lp0 = points[lastSeg];
		var lp1 = points[lastSeg + 1];
		result.push(App.spline.normalAt(lp0, App.spline.getOutCP(lp0), App.spline.getInCP(lp1), lp1, 1.0));
	}

	return result;
};

App.spline.pointsToSvgPath = function(sampledPoints, closed) {
	if (!sampledPoints || sampledPoints.length === 0) return '';
	var d = 'M ' + sampledPoints[0].x.toFixed(2) + ' ' + sampledPoints[0].y.toFixed(2);
	for (var i = 1; i < sampledPoints.length; i++) {
		d += ' L ' + sampledPoints[i].x.toFixed(2) + ' ' + sampledPoints[i].y.toFixed(2);
	}
	if (closed) d += ' Z';
	return d;
};

App.spline.toSvgCubicPath = function(points, closed) {
	if (!points || points.length === 0) return '';
	var d = 'M ' + points[0].x.toFixed(2) + ' ' + points[0].y.toFixed(2);
	var segCount = closed ? points.length : points.length - 1;
	for (var i = 0; i < segCount; i++) {
		var p0 = points[i];
		var p1 = points[(i + 1) % points.length];
		var cp0 = App.spline.getOutCP(p0);
		var cp1 = App.spline.getInCP(p1);
		d += ' C ' + cp0.x.toFixed(2) + ' ' + cp0.y.toFixed(2) + ', ' +
			 cp1.x.toFixed(2) + ' ' + cp1.y.toFixed(2) + ', ' +
			 p1.x.toFixed(2) + ' ' + p1.y.toFixed(2);
	}
	if (closed) d += ' Z';
	return d;
};

App.spline.createPoint = function(x, y) {
	return {
		x: x, y: y,
		cx1: x, cy1: y,
		cx2: x, cy2: y
	};
};

App.spline.autoSmooth = function(points, index, closed) {
	var len = points.length;
	if (len < 2) return;

	var pt = points[index];
	var prev, next;

	if (closed) {
		prev = points[(index - 1 + len) % len];
		next = points[(index + 1) % len];
	} else {
		prev = index > 0 ? points[index - 1] : null;
		next = index < len - 1 ? points[index + 1] : null;
	}

	if (prev && next) {
		var dx = next.x - prev.x;
		var dy = next.y - prev.y;
		var dist = Math.sqrt(dx * dx + dy * dy);
		if (dist > 0) {
			var scale = 0.25;
			pt.cx1 = pt.x - dx * scale;
			pt.cy1 = pt.y - dy * scale;
			pt.cx2 = pt.x + dx * scale;
			pt.cy2 = pt.y + dy * scale;
		}
	} else if (prev) {
		var dx2 = pt.x - prev.x;
		var dy2 = pt.y - prev.y;
		pt.cx1 = pt.x - dx2 * 0.25;
		pt.cy1 = pt.y - dy2 * 0.25;
		pt.cx2 = pt.x;
		pt.cy2 = pt.y;
	} else if (next) {
		var dx3 = next.x - pt.x;
		var dy3 = next.y - pt.y;
		pt.cx1 = pt.x;
		pt.cy1 = pt.y;
		pt.cx2 = pt.x + dx3 * 0.25;
		pt.cy2 = pt.y + dy3 * 0.25;
	}
};

App.spline.autoSmoothAll = function(points, closed) {
	for (var i = 0; i < points.length; i++) {
		App.spline.autoSmooth(points, i, closed);
	}
};

App.spline.getBounds = function(sampledPoints) {
	if (!sampledPoints || sampledPoints.length === 0) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
	}
	var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (var i = 0; i < sampledPoints.length; i++) {
		var p = sampledPoints[i];
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, width: maxX - minX, height: maxY - minY };
};

App.spline.distToSegment = function(px, py, ax, ay, bx, by) {
	var dx = bx - ax;
	var dy = by - ay;
	var lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
	var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
	var projX = ax + t * dx;
	var projY = ay + t * dy;
	return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
};

App.spline.hitTestPolyline = function(px, py, sampledPoints, threshold) {
	for (var i = 0; i < sampledPoints.length - 1; i++) {
		var a = sampledPoints[i];
		var b = sampledPoints[i + 1];
		if (App.spline.distToSegment(px, py, a.x, a.y, b.x, b.y) < threshold) {
			return true;
		}
	}
	return false;
};

App.spline.pointInPolygon = function(px, py, polygon) {
	var inside = false;
	for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		var xi = polygon[i].x, yi = polygon[i].y;
		var xj = polygon[j].x, yj = polygon[j].y;
		if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
};
