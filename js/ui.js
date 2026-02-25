var App = App || {};

App.ui = {};

App.ui.init = function() {
	App.ui.initToolbar();
	App.ui.updateObjectList();
	App.ui.updateProperties();
	App.ui.updateMapSeed();
	App.ui.updateStatus();
};

App.ui.initToolbar = function() {
	var buttons = document.querySelectorAll('.tool-btn');
	for (var i = 0; i < buttons.length; i++) {
		buttons[i].addEventListener('click', function() {
			App.editor.setTool(this.getAttribute('data-tool'));
		});
	}

	document.getElementById('btn-new').addEventListener('click', function() {
		App.storage.newMap();
	});
	document.getElementById('btn-save').addEventListener('click', function() {
		App.storage.save();
	});
	document.getElementById('btn-load').addEventListener('click', function() {
		App.storage.load();
	});
	document.getElementById('btn-save-as').addEventListener('click', function() {
		App.storage.saveAs();
	});
	document.getElementById('btn-export').addEventListener('click', function() {
		App.storage.exportSVG();
	});

	document.getElementById('btn-snap').addEventListener('click', function() {
		App.renderer.snapRegionBorders();
		App.editor.updateOverlay();
	});
};

App.ui.updateToolbar = function() {
	var buttons = document.querySelectorAll('.tool-btn');
	for (var i = 0; i < buttons.length; i++) {
		var btn = buttons[i];
		if (btn.getAttribute('data-tool') === App.state.tool) {
			btn.classList.add('active');
		} else {
			btn.classList.remove('active');
		}
	}
};

App.ui.updateObjectList = function() {
	var list = document.getElementById('object-list');
	list.innerHTML = '';

	if (!App.state.map) return;

	var groups = {};
	var order = ['sea', 'region', 'biome', 'lake', 'river', 'mountain', 'marker'];
	var groupNames = {
		'sea': 'Seas', 'region': 'Regions', 'biome': 'Biomes', 'lake': 'Lakes',
		'river': 'Rivers', 'mountain': 'Mountains', 'marker': 'Markers'
	};

	for (var i = 0; i < App.state.map.objects.length; i++) {
		var obj = App.state.map.objects[i];
		if (!groups[obj.type]) groups[obj.type] = [];
		groups[obj.type].push(obj);
	}

	for (var gi = 0; gi < order.length; gi++) {
		var type = order[gi];
		if (!groups[type] || groups[type].length === 0) continue;

		var groupHeader = document.createElement('div');
		groupHeader.className = 'object-group-header';
		groupHeader.textContent = groupNames[type] || type;
		list.appendChild(groupHeader);

		for (var j = 0; j < groups[type].length; j++) {
			var item = App.ui.createObjectListItem(groups[type][j]);
			list.appendChild(item);
		}
	}
};

App.ui.createObjectListItem = function(obj) {
	var item = document.createElement('div');
	item.className = 'object-list-item';
	if (obj.id === App.state.selectedObjectId) {
		item.classList.add('selected');
	}

	var nameSpan = document.createElement('span');
	nameSpan.className = 'object-name';
	nameSpan.textContent = obj.name || obj.id;
	item.appendChild(nameSpan);

	item.addEventListener('click', function() {
		App.editor.selectObject(obj.id);
	});

	return item;
};

App.ui.updateProperties = function() {
	var content = document.getElementById('properties-content');
	content.innerHTML = '';

	var obj = App.state.getSelectedObject();
	if (!obj) {
		content.innerHTML = '<div class="no-selection">No object selected</div>';
		return;
	}

	App.ui.addField(content, 'Name', 'text', obj.name, function(val) {
		App.state.pushUndo();
		obj.name = val;
		App.renderer.render();
		App.ui.updateObjectList();
	});

	App.ui.addField(content, 'Show Label', 'checkbox', obj.showLabel, function(val) {
		App.state.pushUndo();
		obj.showLabel = val;
		App.renderer.render();
	});

	var params2 = obj.params || {};
	App.ui.addField(content, 'Label Size', 'select', params2.labelSize || 'medium', function(val) {
		App.state.pushUndo();
		if (!obj.params) obj.params = {};
		obj.params.labelSize = val;
		App.renderer.render();
	}, ['tiny', 'small', 'medium', 'large', 'huge']);

	var params = obj.params || {};

	switch (obj.type) {
		case 'region':
			App.ui.addField(content, 'Fill Color', 'color', params.fillColor || '#8fbc8f', function(val) {
				App.state.pushUndo();
				obj.params.fillColor = val;
				App.renderer.render();
			});
			App.ui.addNoiseFields(content, obj);
			break;

		case 'sea':
			App.ui.addField(content, 'Fill Color', 'color', params.fillColor || '#4a7fb5', function(val) {
				App.state.pushUndo();
				obj.params.fillColor = val;
				App.renderer.render();
			});
			App.ui.addField(content, 'Wave Pattern', 'checkbox', params.wavePattern !== false, function(val) {
				App.state.pushUndo();
				obj.params.wavePattern = val;
				App.renderer.render();
			});
			App.ui.addNoiseFields(content, obj);
			break;

		case 'lake':
			App.ui.addField(content, 'Fill Color', 'color', params.fillColor || '#6baed6', function(val) {
				App.state.pushUndo();
				obj.params.fillColor = val;
				App.renderer.render();
			});
			App.ui.addNoiseFields(content, obj);
			break;

		case 'biome':
			App.ui.addField(content, 'Biome Type', 'select', params.biomeType || 'forest', function(val) {
				App.state.pushUndo();
				obj.params.biomeType = val;
				App.renderer.render();
			}, ['tundra', 'taiga', 'swamp', 'forest', 'plains', 'fjord', 'dunes', 'cactus', 'jungle', 'savanna', 'steppe']);
			App.ui.addField(content, 'Density', 'range', params.density || 0.5, function(val) {
				App.state.pushUndo();
				obj.params.density = parseFloat(val);
				App.renderer.render();
			}, { min: 0.1, max: 1.0, step: 0.1 });
			App.ui.addField(content, 'Element Scale', 'range', params.elementScale || 1.0, function(val) {
				App.state.pushUndo();
				obj.params.elementScale = parseFloat(val);
				App.renderer.render();
			}, { min: 0.2, max: 3.0, step: 0.1 });
			App.ui.addField(content, 'Opacity', 'range', params.opacity || 0.3, function(val) {
				App.state.pushUndo();
				obj.params.opacity = parseFloat(val);
				App.renderer.render();
			}, { min: 0.05, max: 1.0, step: 0.05 });
			App.ui.addField(content, 'BG Color', 'color', params.bgColor || '#8fbc8f', function(val) {
				App.state.pushUndo();
				if (!obj.params) obj.params = {};
				obj.params.bgColor = val;
				App.renderer.render();
			});
			App.ui.addField(content, 'BG Opacity', 'range', params.bgOpacity || 0, function(val) {
				App.state.pushUndo();
				if (!obj.params) obj.params = {};
				obj.params.bgOpacity = parseFloat(val);
				App.renderer.render();
			}, { min: 0, max: 1.0, step: 0.05 });
			break;

		case 'river':
			App.ui.addField(content, 'Color', 'color', params.color || '#4a7fb5', function(val) {
				App.state.pushUndo();
				obj.params.color = val;
				App.renderer.render();
			});
			App.ui.addField(content, 'Width Start', 'range', params.widthStart || 1, function(val) {
				App.state.pushUndo();
				obj.params.widthStart = parseFloat(val);
				App.renderer.render();
			}, { min: 0.5, max: 20, step: 0.5 });
			App.ui.addField(content, 'Width End', 'range', params.widthEnd || 5, function(val) {
				App.state.pushUndo();
				obj.params.widthEnd = parseFloat(val);
				App.renderer.render();
			}, { min: 0.5, max: 30, step: 0.5 });
			App.ui.addField(content, 'Sinuosity', 'range', params.sinuosity || 3, function(val) {
				App.state.pushUndo();
				obj.params.sinuosity = parseFloat(val);
				App.renderer.render();
			}, { min: 0, max: 20, step: 0.5 });
			break;

		case 'mountain':
			App.ui.addField(content, 'Width', 'range', params.width || 30, function(val) {
				App.state.pushUndo();
				obj.params.width = parseFloat(val);
				App.renderer.render();
			}, { min: 5, max: 100, step: 5 });
			App.ui.addField(content, 'Density', 'range', params.density || 0.8, function(val) {
				App.state.pushUndo();
				obj.params.density = parseFloat(val);
				App.renderer.render();
			}, { min: 0.1, max: 2.0, step: 0.1 });
			App.ui.addField(content, 'Peak Scale', 'range', params.peakScale || 1.0, function(val) {
				App.state.pushUndo();
				obj.params.peakScale = parseFloat(val);
				App.renderer.render();
			}, { min: 0.2, max: 5.0, step: 0.1 });
			App.ui.addField(content, 'Height Variation', 'range', params.heightVariation || 0.4, function(val) {
				App.state.pushUndo();
				obj.params.heightVariation = parseFloat(val);
				App.renderer.render();
			}, { min: 0, max: 1.0, step: 0.05 });
			App.ui.addField(content, 'Fade Start', 'range', params.fadeStart || 0.1, function(val) {
				App.state.pushUndo();
				obj.params.fadeStart = parseFloat(val);
				App.renderer.render();
			}, { min: 0, max: 0.5, step: 0.05 });
			App.ui.addField(content, 'Fade End', 'range', params.fadeEnd || 0.15, function(val) {
				App.state.pushUndo();
				obj.params.fadeEnd = parseFloat(val);
				App.renderer.render();
			}, { min: 0, max: 0.5, step: 0.05 });
			break;

		case 'marker':
			App.ui.addField(content, 'Marker Type', 'select', params.markerType || 'city', function(val) {
				App.state.pushUndo();
				obj.params.markerType = val;
				App.renderer.render();
			}, ['city', 'capital', 'ruin', 'landmark', 'port']);
			App.ui.addField(content, 'Icon Size', 'range', params.iconSize || 10, function(val) {
				App.state.pushUndo();
				obj.params.iconSize = parseFloat(val);
				App.renderer.render();
			}, { min: 4, max: 30, step: 1 });
			break;
	}
};

App.ui.addNoiseFields = function(content, obj) {
	var bn = (obj.params && obj.params.borderNoise) || {};

	App.ui.addField(content, 'Noise Frequency', 'range', bn.frequency || 0.03, function(val) {
		App.state.pushUndo();
		if (!obj.params.borderNoise) obj.params.borderNoise = {};
		obj.params.borderNoise.frequency = parseFloat(val);
		App.noise.clearCache();
		App.renderer.render();
	}, { min: 0.005, max: 0.1, step: 0.005 });

	App.ui.addField(content, 'Noise Amplitude', 'range', bn.amplitude || 8, function(val) {
		App.state.pushUndo();
		if (!obj.params.borderNoise) obj.params.borderNoise = {};
		obj.params.borderNoise.amplitude = parseFloat(val);
		App.renderer.render();
	}, { min: 0, max: 30, step: 1 });

	if (bn.octaves !== undefined || obj.type === 'region') {
		App.ui.addField(content, 'Noise Octaves', 'range', bn.octaves || 3, function(val) {
			App.state.pushUndo();
			if (!obj.params.borderNoise) obj.params.borderNoise = {};
			obj.params.borderNoise.octaves = parseInt(val);
			App.renderer.render();
		}, { min: 1, max: 6, step: 1 });
	}
};

App.ui.addField = function(container, label, type, value, onChange, extra) {
	var wrapper = document.createElement('div');
	wrapper.className = 'prop-field';

	var lbl = document.createElement('label');
	lbl.textContent = label;
	wrapper.appendChild(lbl);

	var input;

	if (type === 'select') {
		input = document.createElement('select');
		var options = extra || [];
		for (var i = 0; i < options.length; i++) {
			var opt = document.createElement('option');
			opt.value = options[i];
			opt.textContent = options[i];
			if (options[i] === value) opt.selected = true;
			input.appendChild(opt);
		}
		input.addEventListener('change', function() { onChange(this.value); });
	} else if (type === 'checkbox') {
		input = document.createElement('input');
		input.type = 'checkbox';
		input.checked = !!value;
		input.addEventListener('change', function() { onChange(this.checked); });
	} else if (type === 'range') {
		var rangeWrap = document.createElement('div');
		rangeWrap.className = 'range-wrap';
		input = document.createElement('input');
		input.type = 'range';
		input.min = extra ? extra.min : 0;
		input.max = extra ? extra.max : 100;
		input.step = extra ? extra.step : 1;
		input.value = value;
		var valSpan = document.createElement('span');
		valSpan.className = 'range-value';
		valSpan.textContent = value;
		input.addEventListener('input', function() {
			valSpan.textContent = parseFloat(this.value).toFixed(3).replace(/\.?0+$/, '');
			onChange(this.value);
		});
		rangeWrap.appendChild(input);
		rangeWrap.appendChild(valSpan);
		wrapper.appendChild(rangeWrap);
		container.appendChild(wrapper);
		return;
	} else if (type === 'color') {
		input = document.createElement('input');
		input.type = 'color';
		input.value = value;
		input.addEventListener('input', function() { onChange(this.value); });
	} else {
		input = document.createElement('input');
		input.type = type;
		input.value = value;
		input.addEventListener('change', function() { onChange(this.value); });
	}

	wrapper.appendChild(input);
	container.appendChild(wrapper);
};

App.ui.updateMapSeed = function() {
	var header = document.getElementById('properties-header');
	var existing = document.getElementById('map-seed-field');
	if (existing) existing.remove();

	if (!App.state.map) return;

	var wrapper = document.createElement('div');
	wrapper.id = 'map-seed-field';
	wrapper.className = 'prop-field';
	wrapper.style.padding = '6px 8px';
	wrapper.style.borderBottom = '1px solid #444';
	wrapper.style.background = '#2a2a2a';

	var lbl = document.createElement('label');
	lbl.textContent = 'Map Seed';
	wrapper.appendChild(lbl);

	var input = document.createElement('input');
	input.type = 'number';
	input.value = App.state.map.seed || 0;
	input.addEventListener('change', function() {
		App.state.pushUndo();
		App.state.map.seed = parseInt(this.value) || 0;
		App.noise.clearCache();
		App.renderer.render();
	});
	wrapper.appendChild(input);

	header.parentNode.insertBefore(wrapper, header.nextSibling);
};

App.ui.updateStatus = function() {
	var info = document.getElementById('status-info');
	var count = App.state.map ? App.state.map.objects.length : 0;
	var zoom = Math.round(App.state.viewport.zoom * 100);
	info.textContent = 'Objects: ' + count + ' | Zoom: ' + zoom + '%';
};
