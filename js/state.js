var App = App || {};

App.state = {
	map: null,
	selectedObjectId: null,
	selectedPointIndex: -1,
	tool: 'select',
	viewport: { x: 0, y: 0, zoom: 1.0 },
	isPanning: false,
	panStart: { x: 0, y: 0 },
	isDrawing: false,
	drawingPoints: [],
	undoStack: [],
	redoStack: [],
	maxUndoSteps: 50,
	snapThreshold: 20,
	fileHandle: null
};

App.state.createDefaultMap = function() {
	return {
		version: 1,
		name: "New Map",
		seed: Math.floor(Math.random() * 10000),
		viewport: { x: 0, y: 0, zoom: 1.0 },
		objects: []
	};
};

App.state.generateId = function() {
	return 'obj-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
};

App.state.pushUndo = function() {
	var snapshot = JSON.parse(JSON.stringify(App.state.map));
	App.state.undoStack.push(snapshot);
	if (App.state.undoStack.length > App.state.maxUndoSteps) {
		App.state.undoStack.shift();
	}
	App.state.redoStack = [];
};

App.state.undo = function() {
	if (App.state.undoStack.length === 0) return;
	var current = JSON.parse(JSON.stringify(App.state.map));
	App.state.redoStack.push(current);
	App.state.map = App.state.undoStack.pop();
};

App.state.redo = function() {
	if (App.state.redoStack.length === 0) return;
	var current = JSON.parse(JSON.stringify(App.state.map));
	App.state.undoStack.push(current);
	App.state.map = App.state.redoStack.pop();
};

App.state.getObjectById = function(id) {
	if (!App.state.map) return null;
	for (var i = 0; i < App.state.map.objects.length; i++) {
		if (App.state.map.objects[i].id === id) return App.state.map.objects[i];
	}
	return null;
};

App.state.getSelectedObject = function() {
	return App.state.getObjectById(App.state.selectedObjectId);
};

App.state.removeObject = function(id) {
	if (!App.state.map) return;
	App.state.map.objects = App.state.map.objects.filter(function(o) { return o.id !== id; });
};

App.state.getDefaultParams = function(type) {
	switch (type) {
		case 'region':
			return {
				fillColor: '#8fbc8f',
				borderNoise: { frequency: 0.03, amplitude: 8, octaves: 3 },
				labelSize: 'large'
			};
		case 'sea':
			return {
				fillColor: '#4a7fb5',
				wavePattern: true,
				borderNoise: { frequency: 0.02, amplitude: 10 },
				labelSize: 'huge'
			};
		case 'lake':
			return {
				fillColor: '#6baed6',
				borderNoise: { frequency: 0.04, amplitude: 5 }
			};
		case 'biome':
			return {
				biomeType: 'forest',
				fillPattern: '',
				density: 0.5,
				opacity: 0.3
			};
		case 'river':
			return {
				widthStart: 1,
				widthEnd: 5,
				sinuosity: 3,
				color: '#4a7fb5',
				labelSize: 'small'
			};
		case 'mountain':
			return {
				width: 30,
				density: 0.8,
				heightVariation: 0.4,
				fadeStart: 0.1,
				fadeEnd: 0.15,
				labelSize: 'medium'
			};
		case 'marker':
			return {
				markerType: 'city',
				iconSize: 10
			};
		default:
			return {};
	}
};

App.state.isClosedType = function(type) {
	return type === 'region' || type === 'sea' || type === 'lake' || type === 'biome';
};
