var App = App || {};

App.editor = {};

App.editor.dragState = null;
App.editor.spacePressed = false;

App.editor.init = function() {
	var svg = document.getElementById('canvas');

	svg.addEventListener('mousedown', App.editor.onMouseDown);
	svg.addEventListener('mousemove', App.editor.onMouseMove);
	svg.addEventListener('mouseup', App.editor.onMouseUp);
	svg.addEventListener('dblclick', App.editor.onDblClick);
	svg.addEventListener('wheel', App.editor.onWheel);
	svg.addEventListener('contextmenu', function(e) { e.preventDefault(); });

	document.addEventListener('keydown', App.editor.onKeyDown);
	document.addEventListener('keyup', App.editor.onKeyUp);
};

App.editor.setTool = function(tool) {
	App.editor.stopDrawing();
	App.state.tool = tool;
	if (tool !== 'select') {
		App.state.selectedObjectId = null;
		App.state.selectedPointIndex = -1;
	}
	App.editor.updateOverlay();
	if (App.ui && App.ui.updateToolbar) App.ui.updateToolbar();
	if (App.ui && App.ui.updateProperties) App.ui.updateProperties();
	if (App.ui && App.ui.updateObjectList) App.ui.updateObjectList();
};

App.editor.selectObject = function(id) {
	App.editor.stopDrawing();
	App.state.tool = 'select';
	App.state.selectedObjectId = id;
	App.state.selectedPointIndex = -1;
	App.editor.updateOverlay();
	if (App.ui) {
		App.ui.updateToolbar();
		App.ui.updateObjectList();
		App.ui.updateProperties();
	}
};

App.editor.stopDrawing = function() {
	if (!App.state.isDrawing) return;
	App.state.isDrawing = false;
	var obj = App.state.getSelectedObject();
	if (obj && obj.points.length < 2 && obj.type !== 'marker') {
		App.state.removeObject(obj.id);
		App.state.selectedObjectId = null;
		App.state.selectedPointIndex = -1;
		App.renderer.render();
		if (App.ui) {
			App.ui.updateObjectList();
			App.ui.updateStatus();
		}
	}
};

App.editor.onMouseDown = function(e) {
	var svg = document.getElementById('canvas');

	if (e.button === 1 || (e.button === 0 && App.editor.spacePressed)) {
		App.state.isPanning = true;
		App.state.panStart = { x: e.clientX, y: e.clientY };
		svg.style.cursor = 'grabbing';
		e.preventDefault();
		return;
	}

	if (e.button !== 0) return;

	var world = App.renderer.screenToWorld(e.clientX, e.clientY);

	if (App.state.tool === 'select') {
		App.editor.handleSelectDown(world, e);
	} else if (App.state.tool === 'marker') {
		App.editor.placeMarker(world);
	} else {
		App.editor.handleDrawDown(world, e);
	}
};

App.editor.onMouseMove = function(e) {
	if (App.state.isPanning) {
		var dx = e.clientX - App.state.panStart.x;
		var dy = e.clientY - App.state.panStart.y;
		App.state.viewport.x -= dx / App.state.viewport.zoom;
		App.state.viewport.y -= dy / App.state.viewport.zoom;
		App.state.panStart = { x: e.clientX, y: e.clientY };
		App.renderer.updateViewport();
		return;
	}

	if (App.editor.dragState) {
		var world = App.renderer.screenToWorld(e.clientX, e.clientY);
		App.editor.handleDrag(world);
	}
};

App.editor.onMouseUp = function(e) {
	if (App.state.isPanning) {
		App.state.isPanning = false;
		document.getElementById('canvas').style.cursor = '';
		return;
	}

	if (App.editor.dragState) {
		App.editor.dragState = null;
	}
};

App.editor.onDblClick = function(e) {
	if (App.state.isDrawing) {
		var obj = App.state.getSelectedObject();
		if (obj && obj.points.length > 0) {
			obj.points.pop();
			if (obj.points.length > 1) {
				App.spline.autoSmoothAll(obj.points, obj.closed);
			}
		}
		App.editor.stopDrawing();
		App.renderer.render();
		App.editor.updateOverlay();
		if (App.ui) {
			App.ui.updateProperties();
			App.ui.updateObjectList();
		}
		e.preventDefault();
	}
};

App.editor.onWheel = function(e) {
	e.preventDefault();
	var zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
	var oldZoom = App.state.viewport.zoom;
	App.state.viewport.zoom = Math.max(0.1, Math.min(20, oldZoom * zoomFactor));

	var world = App.renderer.screenToWorld(e.clientX, e.clientY);
	var newWorld = App.renderer.screenToWorld(e.clientX, e.clientY);
	App.state.viewport.x += world.x - newWorld.x;
	App.state.viewport.y += world.y - newWorld.y;

	App.renderer.updateViewport();
	if (App.ui && App.ui.updateStatus) App.ui.updateStatus();
};

App.editor.onKeyDown = function(e) {
	if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

	if (e.code === 'Space') {
		App.editor.spacePressed = true;
		e.preventDefault();
		return;
	}

	if (e.ctrlKey || e.metaKey) {
		switch (e.key.toLowerCase()) {
			case 's':
				e.preventDefault();
				if (App.storage) {
					if (e.shiftKey) {
						App.storage.saveAs();
					} else {
						App.storage.save();
					}
				}
				break;
			case 'o':
				e.preventDefault();
				if (App.storage) App.storage.load();
				break;
			case 'e':
				e.preventDefault();
				if (App.storage) App.storage.exportSVG();
				break;
			case 'z':
				e.preventDefault();
				if (e.shiftKey) {
					App.state.redo();
				} else {
					App.state.undo();
				}
				App.state.isDrawing = false;
				App.renderer.render();
				App.editor.updateOverlay();
				if (App.ui) {
					App.ui.updateObjectList();
					App.ui.updateProperties();
					App.ui.updateStatus();
				}
				break;
		}
		return;
	}

	switch (e.key.toLowerCase()) {
		case 'v': App.editor.setTool('select'); break;
		case 'r': App.editor.setTool('region'); break;
		case 'i': App.editor.setTool('river'); break;
		case 'm': App.editor.setTool('mountain'); break;
		case 's': App.editor.setTool('sea'); break;
		case 'l': App.editor.setTool('lake'); break;
		case 'b': App.editor.setTool('biome'); break;
		case 'p': App.editor.setTool('marker'); break;
		case 'delete':
		case 'backspace':
			App.editor.deleteSelected();
			break;
	}
};

App.editor.onKeyUp = function(e) {
	if (e.code === 'Space') {
		App.editor.spacePressed = false;
	}
};

App.editor.handleSelectDown = function(world, e) {
	var obj = App.state.getSelectedObject();

	if (obj) {
		var hitPoint = App.editor.hitTestPoints(obj, world);
		if (hitPoint.type === 'point') {
			if (e.altKey) {
				App.state.pushUndo();
				App.editor.dragState = { type: 'moveAll', objId: obj.id, lastX: world.x, lastY: world.y };
				return;
			}
			App.state.selectedPointIndex = hitPoint.index;
			App.state.pushUndo();
			App.editor.dragState = { type: 'point', objId: obj.id, pointIndex: hitPoint.index };
			App.editor.updateOverlay();
			if (App.ui) App.ui.updateProperties();
			return;
		}

		var insertResult = App.editor.findInsertPoint(obj, world);
		if (insertResult) {
			App.state.pushUndo();
			var newPt = App.spline.createPoint(world.x, world.y);
			obj.points.splice(insertResult.segIndex + 1, 0, newPt);
			App.spline.autoSmoothAll(obj.points, obj.closed);
			App.state.selectedPointIndex = insertResult.segIndex + 1;
			App.editor.dragState = { type: 'point', objId: obj.id, pointIndex: insertResult.segIndex + 1 };
			App.renderer.render();
			App.editor.updateOverlay();
			if (App.ui) App.ui.updateProperties();
			return;
		}
	}

	var hitObj = App.renderer.hitTest(world.x, world.y);
	if (hitObj) {
		App.state.selectedObjectId = hitObj.id;
		App.state.selectedPointIndex = -1;
		if (e.altKey) {
			App.state.pushUndo();
			App.editor.dragState = { type: 'moveAll', objId: hitObj.id, lastX: world.x, lastY: world.y };
		}
		App.editor.updateOverlay();
		if (App.ui) {
			App.ui.updateObjectList();
			App.ui.updateProperties();
		}
	} else {
		App.state.selectedObjectId = null;
		App.state.selectedPointIndex = -1;
		App.editor.updateOverlay();
		if (App.ui) {
			App.ui.updateObjectList();
			App.ui.updateProperties();
		}
	}
};

App.editor.handleDrawDown = function(world, e) {
	var obj = App.state.isDrawing ? App.state.getSelectedObject() : null;

	if (obj) {
		var hitPoint = App.editor.hitTestPoints(obj, world);
		if (hitPoint.type === 'point') {
			App.state.selectedPointIndex = hitPoint.index;
			App.state.pushUndo();
			App.editor.dragState = { type: 'point', objId: obj.id, pointIndex: hitPoint.index };
			App.editor.updateOverlay();
			return;
		}

		if (obj.points.length >= 2) {
			var insertResult = App.editor.findInsertPoint(obj, world);
			if (insertResult) {
				App.state.pushUndo();
				var newPt = App.spline.createPoint(world.x, world.y);
				obj.points.splice(insertResult.segIndex + 1, 0, newPt);
				App.spline.autoSmoothAll(obj.points, obj.closed);
				App.state.selectedPointIndex = insertResult.segIndex + 1;
				App.editor.dragState = { type: 'point', objId: obj.id, pointIndex: insertResult.segIndex + 1 };
				App.renderer.render();
				App.editor.updateOverlay();
				if (App.ui) App.ui.updateProperties();
				return;
			}
		}

		App.state.pushUndo();
		var addIndex = App.editor.findBestInsertIndex(obj, world);
		var pt = App.spline.createPoint(world.x, world.y);
		obj.points.splice(addIndex, 0, pt);
		if (obj.points.length > 1) {
			App.spline.autoSmoothAll(obj.points, obj.closed);
		}
		App.state.selectedPointIndex = addIndex;
		App.renderer.render();
		App.editor.updateOverlay();
		if (App.ui) App.ui.updateProperties();
		return;
	}

	App.state.pushUndo();

	var type = App.state.tool;
	var closed = App.state.isClosedType(type);
	var firstPt = App.spline.createPoint(world.x, world.y);

	var newObj = {
		id: App.state.generateId(),
		type: type,
		name: App.editor.getDefaultName(type),
		showLabel: true,
		closed: closed,
		points: [firstPt],
		style: {},
		params: App.state.getDefaultParams(type)
	};

	App.state.map.objects.push(newObj);
	App.state.isDrawing = true;
	App.state.selectedObjectId = newObj.id;
	App.state.selectedPointIndex = 0;

	App.renderer.render();
	App.editor.updateOverlay();
	if (App.ui) {
		App.ui.updateObjectList();
		App.ui.updateProperties();
		App.ui.updateStatus();
	}
};

App.editor.findBestInsertIndex = function(obj, world) {
	if (obj.points.length < 2) {
		return obj.points.length;
	}

	if (!obj.closed) {
		var first = obj.points[0];
		var last = obj.points[obj.points.length - 1];
		var dFirst = Math.sqrt((world.x - first.x) * (world.x - first.x) + (world.y - first.y) * (world.y - first.y));
		var dLast = Math.sqrt((world.x - last.x) * (world.x - last.x) + (world.y - last.y) * (world.y - last.y));

		if (dFirst < dLast) {
			return 0;
		}
		return obj.points.length;
	}

	var bestDist = Infinity;
	var bestIndex = obj.points.length;
	var segCount = obj.closed ? obj.points.length : obj.points.length - 1;

	for (var i = 0; i < segCount; i++) {
		var p0 = obj.points[i];
		var p1 = obj.points[(i + 1) % obj.points.length];
		var mx = (p0.x + p1.x) / 2;
		var my = (p0.y + p1.y) / 2;
		var dist = Math.sqrt((world.x - mx) * (world.x - mx) + (world.y - my) * (world.y - my));
		if (dist < bestDist) {
			bestDist = dist;
			bestIndex = i + 1;
		}
	}

	return bestIndex;
};

App.editor.placeMarker = function(world) {
	App.state.pushUndo();

	var obj = {
		id: App.state.generateId(),
		type: 'marker',
		name: App.editor.getDefaultName('marker'),
		showLabel: true,
		closed: false,
		points: [{ x: world.x, y: world.y }],
		style: {},
		params: App.state.getDefaultParams('marker')
	};

	App.state.map.objects.push(obj);
	App.state.selectedObjectId = obj.id;
	App.state.selectedPointIndex = -1;

	App.renderer.render();
	App.editor.updateOverlay();
	if (App.ui) {
		App.ui.updateObjectList();
		App.ui.updateProperties();
		App.ui.updateStatus();
	}
};

App.editor.getDefaultName = function(type) {
	var counts = {};
	for (var i = 0; i < App.state.map.objects.length; i++) {
		var t = App.state.map.objects[i].type;
		counts[t] = (counts[t] || 0) + 1;
	}
	var names = {
		'region': 'Region', 'sea': 'Sea', 'lake': 'Lake', 'biome': 'Biome',
		'river': 'River', 'mountain': 'Mountains', 'marker': 'Marker'
	};
	var base = names[type] || type;
	return base + ' ' + ((counts[type] || 0) + 1);
};

App.editor.handleDrag = function(world) {
	var ds = App.editor.dragState;
	if (!ds) return;

	var obj = App.state.getObjectById(ds.objId);
	if (!obj) return;

	var pt = obj.points[ds.pointIndex];
	if (!pt) return;

	if (ds.type === 'point') {
		pt.x = world.x;
		pt.y = world.y;
		App.spline.autoSmooth(obj.points, ds.pointIndex, obj.closed);
		var prevIdx = ds.pointIndex - 1;
		var nextIdx = ds.pointIndex + 1;
		if (obj.closed) {
			prevIdx = (prevIdx + obj.points.length) % obj.points.length;
			nextIdx = nextIdx % obj.points.length;
		}
		if (prevIdx >= 0 && prevIdx < obj.points.length) {
			App.spline.autoSmooth(obj.points, prevIdx, obj.closed);
		}
		if (nextIdx >= 0 && nextIdx < obj.points.length) {
			App.spline.autoSmooth(obj.points, nextIdx, obj.closed);
		}
	} else if (ds.type === 'moveAll') {
		var dx = world.x - ds.lastX;
		var dy = world.y - ds.lastY;
		for (var i = 0; i < obj.points.length; i++) {
			var p = obj.points[i];
			p.x += dx;
			p.y += dy;
			if (p.cx1 !== undefined) {
				p.cx1 += dx;
				p.cy1 += dy;
			}
			if (p.cx2 !== undefined) {
				p.cx2 += dx;
				p.cy2 += dy;
			}
		}
		ds.lastX = world.x;
		ds.lastY = world.y;
	}

	App.renderer.render();
	App.editor.updateOverlay();
};

App.editor.deleteSelected = function() {
	var obj = App.state.getSelectedObject();
	if (!obj) return;

	App.state.pushUndo();

	if (App.state.selectedPointIndex >= 0) {
		if (obj.points.length > 1) {
			obj.points.splice(App.state.selectedPointIndex, 1);
			if (App.state.selectedPointIndex >= obj.points.length) {
				App.state.selectedPointIndex = obj.points.length - 1;
			}
			if (obj.points.length > 1) {
				App.spline.autoSmoothAll(obj.points, obj.closed);
			}
			App.renderer.render();
			App.editor.updateOverlay();
			if (App.ui) App.ui.updateProperties();
		} else {
			App.state.isDrawing = false;
			App.state.removeObject(obj.id);
			App.state.selectedObjectId = null;
			App.state.selectedPointIndex = -1;
			App.renderer.render();
			App.editor.updateOverlay();
			if (App.ui) {
				App.ui.updateObjectList();
				App.ui.updateProperties();
				App.ui.updateStatus();
			}
		}
	} else {
		App.state.isDrawing = false;
		App.state.removeObject(obj.id);
		App.state.selectedObjectId = null;
		App.state.selectedPointIndex = -1;
		App.renderer.render();
		App.editor.updateOverlay();
		if (App.ui) {
			App.ui.updateObjectList();
			App.ui.updateProperties();
			App.ui.updateStatus();
		}
	}
};

App.editor.hitTestPoints = function(obj, world) {
	if (!obj.points) return { type: null };
	var threshold = 8 / App.state.viewport.zoom;

	for (var i = 0; i < obj.points.length; i++) {
		var pt = obj.points[i];
		var dp = Math.sqrt((world.x - pt.x) * (world.x - pt.x) + (world.y - pt.y) * (world.y - pt.y));
		if (dp < threshold) {
			return { type: 'point', index: i };
		}
	}

	return { type: null };
};

App.editor.findInsertPoint = function(obj, world) {
	if (!obj.points || obj.points.length < 2) return null;

	var threshold = 15 / App.state.viewport.zoom;
	var closed = obj.closed;
	var segCount = closed ? obj.points.length : obj.points.length - 1;

	for (var i = 0; i < segCount; i++) {
		var p0 = obj.points[i];
		var p1 = obj.points[(i + 1) % obj.points.length];
		var sampled = App.spline.sampleSpline([p0, p1], App.renderer.SAMPLES_PER_SEGMENT, false);
		if (App.spline.hitTestPolyline(world.x, world.y, sampled, threshold)) {
			return { segIndex: i };
		}
	}

	return null;
};

App.editor.updateOverlay = function() {
	var overlay = document.getElementById('svg-editor-overlay');
	overlay.innerHTML = '';

	var obj = App.state.getSelectedObject();
	if (!obj || !obj.points || obj.points.length === 0) return;

	if (obj.type !== 'marker' && obj.points.length >= 2) {
		var pathD = App.spline.toSvgCubicPath(obj.points, obj.closed);
		var pathEl = document.createElementNS(App.renderer.SVG_NS, 'path');
		pathEl.setAttribute('d', pathD);
		pathEl.setAttribute('fill', 'none');
		pathEl.setAttribute('stroke', App.state.isDrawing ? '#00ff66' : '#00aaff');
		pathEl.setAttribute('stroke-width', String(1.5 / App.state.viewport.zoom));
		pathEl.setAttribute('stroke-dasharray', String(4 / App.state.viewport.zoom));
		overlay.appendChild(pathEl);
	}

	var r = 4 / App.state.viewport.zoom;
	var color = App.state.isDrawing ? '#00ff66' : '#00aaff';
	for (var i = 0; i < obj.points.length; i++) {
		var pt = obj.points[i];
		var circle = document.createElementNS(App.renderer.SVG_NS, 'circle');
		circle.setAttribute('cx', pt.x);
		circle.setAttribute('cy', pt.y);
		circle.setAttribute('r', r);
		circle.setAttribute('fill', i === App.state.selectedPointIndex ? '#ff0066' : color);
		circle.setAttribute('stroke', '#fff');
		circle.setAttribute('stroke-width', String(1 / App.state.viewport.zoom));
		overlay.appendChild(circle);
	}
};
