class SimplexNoise {
	constructor(seed = 0) {
		this.permutation = this._buildPermutation(seed);
		this.p = [...this.permutation, ...this.permutation];
	}

	_buildPermutation(seed) {
		const p = [];
		for (let i = 0; i < 256; i++) {
			p[i] = i;
		}

		let random = this._seededRandom(seed);
		for (let i = 255; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[p[i], p[j]] = [p[j], p[i]];
		}

		return p;
	}

	_seededRandom(seed) {
		return function() {
			seed = (seed * 9301 + 49297) % 233280;
			return seed / 233280;
		};
	}

	_fade(t) {
		return t * t * t * (t * (t * 6 - 15) + 10);
	}

	_lerp(a, b, t) {
		return a + t * (b - a);
	}

	_grad2D(hash, x, y) {
		const h = hash & 15;
		const u = h < 8 ? x : y;
		const v = h < 8 ? y : x;

		const part1 = (h & 1) === 0 ? u : -u;
		const part2 = (h & 2) === 0 ? v : -v;

		return part1 + part2;
	}

	_grad3D(hash, x, y, z) {
		const h = hash & 15;
		const u = h < 8 ? x : y;
		const v = h < 8 ? y : z;

		const part1 = (h & 1) === 0 ? u : -u;
		const part2 = (h & 2) === 0 ? v : -v;

		return part1 + part2;
	}

	noise2D(x, y) {
		const xi = Math.floor(x) & 255;
		const yi = Math.floor(y) & 255;

		const xf = x - Math.floor(x);
		const yf = y - Math.floor(y);

		const u = this._fade(xf);
		const v = this._fade(yf);

		const p = this.p;
		const aa = p[p[xi] + yi];
		const ab = p[p[xi] + yi + 1];
		const ba = p[p[xi + 1] + yi];
		const bb = p[p[xi + 1] + yi + 1];

		const g1 = this._grad2D(aa, xf, yf);
		const g2 = this._grad2D(ba, xf - 1, yf);
		const g3 = this._grad2D(ab, xf, yf - 1);
		const g4 = this._grad2D(bb, xf - 1, yf - 1);

		const x1 = this._lerp(g1, g2, u);
		const x2 = this._lerp(g3, g4, u);
		const result = this._lerp(x1, x2, v);

		return result;
	}

	noise3D(x, y, z) {
		const xi = Math.floor(x) & 255;
		const yi = Math.floor(y) & 255;
		const zi = Math.floor(z) & 255;

		const xf = x - Math.floor(x);
		const yf = y - Math.floor(y);
		const zf = z - Math.floor(z);

		const u = this._fade(xf);
		const v = this._fade(yf);
		const w = this._fade(zf);

		const p = this.p;
		const aaa = p[p[p[xi] + yi] + zi];
		const aba = p[p[p[xi] + yi + 1] + zi];
		const aab = p[p[p[xi] + yi] + zi + 1];
		const abb = p[p[p[xi] + yi + 1] + zi + 1];
		const baa = p[p[p[xi + 1] + yi] + zi];
		const bba = p[p[p[xi + 1] + yi + 1] + zi];
		const bab = p[p[p[xi + 1] + yi] + zi + 1];
		const bbb = p[p[p[xi + 1] + yi + 1] + zi + 1];

		const g1 = this._grad3D(aaa, xf, yf, zf);
		const g2 = this._grad3D(baa, xf - 1, yf, zf);
		const g3 = this._grad3D(aba, xf, yf - 1, zf);
		const g4 = this._grad3D(bba, xf - 1, yf - 1, zf);
		const g5 = this._grad3D(aab, xf, yf, zf - 1);
		const g6 = this._grad3D(bab, xf - 1, yf, zf - 1);
		const g7 = this._grad3D(abb, xf, yf - 1, zf - 1);
		const g8 = this._grad3D(bbb, xf - 1, yf - 1, zf - 1);

		const x1 = this._lerp(g1, g2, u);
		const x2 = this._lerp(g3, g4, u);
		const y1 = this._lerp(x1, x2, v);

		const x3 = this._lerp(g5, g6, u);
		const x4 = this._lerp(g7, g8, u);
		const y2 = this._lerp(x3, x4, v);

		const result = this._lerp(y1, y2, w);

		return result;
	}
}

if (typeof window !== 'undefined') {
	window.SimplexNoise = SimplexNoise;
}
