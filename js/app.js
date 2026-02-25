var App = App || {};

App.init = function() {
	App.state.map = App.state.createDefaultMap();
	App.renderer.updateViewport();
	App.renderer.render();
	App.editor.init();
	App.ui.init();

	window.addEventListener('resize', function() {
		App.renderer.updateViewport();
	});
};

document.addEventListener('DOMContentLoaded', App.init);
