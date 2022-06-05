import gulp from 'gulp';
import del from 'del';
import _yargs from 'yargs';
import gulpif from 'gulp-if';
import swc from 'gulp-swc';
import imagemin from 'gulp-imagemin';
import jsonmin from 'gulp-jsonminify';
import ignore from 'gulp-ignore';
const { argv } = _yargs(process.argv.slice(2));

const origin = './src';
const paths = {
	files: {
		typescript: `${ origin }/**/*.ts`,
		json: `${ origin }/**/*.json`,
		html: `${ origin }/**/*.html`,
		images: `${ origin }/**/*.@(png|jpg|jpeg|gif|svg|ico)`,
	},
	build: './build'
}
const state = {
	DEV: 'development',
	PRODUCTION: 'production',
	get current() {
		return argv.state ?? this[this.DEV];
	},
	get isProduction() {
		return this.current === this.PRODUCTION;
	}
}

function typescript() {
	return gulp.src(paths.files.typescript)
		.pipe(swc({
			minify: state.isProduction,
			jsc: {
				parser: {
					syntax: 'typescript',
					tsx: false,
					decorators: true,
					dynamicImport: true
				},
				target: 'es2022',
				...(state.isProduction ? {
					minify: {
						mangle: true,
						compress: {
							unused: true
						}
					}
				}: {})
			},
			module: {
				type: 'es6',
				strict: true,
				strictMode: true,
				lazy: false,
				noInterop: true
			}
		}))
		.pipe(ignore.exclude((file) => file.contents.length <= 12))
		.pipe(gulp.dest(paths.build));
}

function json() {
	return gulp.src(paths.files.json)
		.pipe(gulpif(state.isProduction, jsonmin()))
		.pipe(gulp.dest(paths.build));
}

function html() {
	return gulp.src(paths.files.html)
		.pipe(gulp.dest(paths.build));
}

function images() {
	return gulp.src(paths.files.images)
		.pipe(gulpif(state.isProduction, imagemin()))
		.pipe(gulp.dest(paths.build));
}

export function clean() {
	return del(['./build'], { force: true });
}

export const build = gulp.series(clean, gulp.parallel(typescript, json, html, images));
export const watch = gulp.series(build, function watch() {
	gulp.watch(paths.files.typescript, typescript);
	gulp.watch(paths.files.json, json);
	gulp.watch(paths.files.html, html);
	gulp.watch(paths.files.images, images);
});
export default build;
