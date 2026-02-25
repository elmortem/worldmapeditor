var App = App || {};

App.storage = {};

App.storage.save = function() {
	var json = JSON.stringify(App.state.map, null, 2);

	if (window.showSaveFilePicker) {
		App.storage.saveWithFSAPI(json);
	} else {
		App.storage.saveWithDownload(json);
	}
};

App.storage.saveAs = function() {
	App.state.fileHandle = null;
	App.storage.save();
};

App.storage.saveWithFSAPI = async function(json) {
	try {
		if (!App.state.fileHandle) {
			App.state.fileHandle = await window.showSaveFilePicker({
				types: [{ description: 'Map JSON', accept: { 'application/json': ['.json'] } }],
				suggestedName: (App.state.map.name || 'map') + '.json'
			});
		}
		var writable = await App.state.fileHandle.createWritable();
		await writable.write(json);
		await writable.close();
	} catch (e) {
		if (e.name !== 'AbortError') {
			console.error('Save failed:', e);
			App.storage.saveWithDownload(json);
		}
	}
};

App.storage.saveWithDownload = function(json) {
	var blob = new Blob([json], { type: 'application/json' });
	var url = URL.createObjectURL(blob);
	var a = document.createElement('a');
	a.href = url;
	a.download = (App.state.map.name || 'map') + '.json';
	a.click();
	URL.revokeObjectURL(url);
};

App.storage.load = function() {
	if (window.showOpenFilePicker) {
		App.storage.loadWithFSAPI();
	} else {
		App.storage.loadWithInput();
	}
};

App.storage.loadWithFSAPI = async function() {
	try {
		var handles = await window.showOpenFilePicker({
			types: [{ description: 'Map JSON', accept: { 'application/json': ['.json'] } }]
		});
		var handle = handles[0];
		var file = await handle.getFile();
		var text = await file.text();
		var mapData = JSON.parse(text);
		App.state.fileHandle = handle;
		App.storage.applyMapData(mapData);
	} catch (e) {
		if (e.name !== 'AbortError') {
			console.error('Load failed:', e);
		}
	}
};

App.storage.loadWithInput = function() {
	var input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';
	input.onchange = function(e) {
		var file = e.target.files[0];
		if (!file) return;
		var reader = new FileReader();
		reader.onload = function(re) {
			try {
				var mapData = JSON.parse(re.target.result);
				App.storage.applyMapData(mapData);
			} catch (err) {
				console.error('Parse failed:', err);
			}
		};
		reader.readAsText(file);
	};
	input.click();
};

App.storage.applyMapData = function(mapData) {
	App.state.map = mapData;
	App.state.selectedObjectId = null;
	App.state.selectedPointIndex = -1;
	App.state.undoStack = [];
	App.state.redoStack = [];
	App.state.viewport = mapData.viewport || { x: 0, y: 0, zoom: 1.0 };
	App.noise.clearCache();
	App.renderer.updateViewport();
	App.renderer.render();
	App.editor.updateOverlay();
	if (App.ui) {
		App.ui.updateObjectList();
		App.ui.updateProperties();
		App.ui.updateStatus();
	}
};

App.storage.exportSVG = function() {
	var svg = document.getElementById('canvas');
	var clone = svg.cloneNode(true);

	var overlay = clone.querySelector('#svg-editor-overlay');
	if (overlay) overlay.remove();

	var world = clone.querySelector('#svg-world');
	if (world) {
		var bounds = App.storage.getWorldBounds();
		var padding = 20;
		clone.setAttribute('viewBox',
			(bounds.minX - padding) + ' ' + (bounds.minY - padding) + ' ' +
			(bounds.width + padding * 2) + ' ' + (bounds.height + padding * 2));
		clone.setAttribute('width', bounds.width + padding * 2);
		clone.setAttribute('height', bounds.height + padding * 2);
	}

	clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

	var serializer = new XMLSerializer();
	var svgString = serializer.serializeToString(clone);
	svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;

	var blob = new Blob([svgString], { type: 'image/svg+xml' });
	var url = URL.createObjectURL(blob);
	var a = document.createElement('a');
	a.href = url;
	a.download = (App.state.map.name || 'map') + '.svg';
	a.click();
	URL.revokeObjectURL(url);
};

App.storage.getWorldBounds = function() {
	var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	var objects = App.state.map.objects;
	var seed = App.state.map ? App.state.map.seed || 0 : 0;

	var expandBounds = function(pts) {
		for (var k = 0; k < pts.length; k++) {
			var p = pts[k];
			if (p.x < minX) minX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.x > maxX) maxX = p.x;
			if (p.y > maxY) maxY = p.y;
		}
	};

	for (var i = 0; i < objects.length; i++) {
		var obj = objects[i];
		if (!obj.points || obj.points.length === 0) continue;

		if (obj.type === 'marker') {
			var mp = obj.points[0];
			if (mp.x - 10 < minX) minX = mp.x - 10;
			if (mp.y - 10 < minY) minY = mp.y - 10;
			if (mp.x + 10 > maxX) maxX = mp.x + 10;
			if (mp.y + 10 > maxY) maxY = mp.y + 10;
			continue;
		}

		var closed = App.state.isClosedType(obj.type);
		var sampled = closed
			? App.renderer.sampleClosedWithCache(obj.points)
			: App.spline.sampleSpline(obj.points, App.renderer.SAMPLES_PER_SEGMENT, false);

		if (closed) {
			var params = obj.params || {};
			var bn = params.borderNoise || {};
			var freq = bn.frequency || 0.03;
			var amp = bn.amplitude || 8;
			var oct = bn.octaves || 3;
			var displaced = App.renderer.displaceClosedWithCache(obj.points, seed, freq, amp, oct);
			expandBounds(displaced);
		} else {
			expandBounds(sampled);
		}

		if (obj.type === 'mountain') {
			var mParams = obj.params || {};
			var mWidth = mParams.width || 30;
			for (var si = 0; si < sampled.length; si++) {
				var sp = sampled[si];
				if (sp.x - mWidth < minX) minX = sp.x - mWidth;
				if (sp.y - 20 < minY) minY = sp.y - 20;
				if (sp.x + mWidth > maxX) maxX = sp.x + mWidth;
				if (sp.y > maxY) maxY = sp.y;
			}
		}
	}

	if (minX === Infinity) {
		return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
	}

	return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, width: maxX - minX, height: maxY - minY };
};
