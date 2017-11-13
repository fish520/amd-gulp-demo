/**
 * gulp构建、打包
 * 不同node项目，一般更改变量配置路径即可。
 */
var libFs 		= require('fs');
var libPath		= require('path');
var libCrypto 	= require('crypto');
var libCp		= require("child_process");
var chalk 		= require('chalk');
var through 	= require('through2');
var argv		= require('yargs').argv;
var gulp 		= require('gulp-help')(require('gulp'), {hideDepsMessage: false});
var gulpif		= require('gulp-if');
var notify		= require('gulp-notify');
var plumber		= require('gulp-plumber');
var Plugins		= require('gulp-load-plugins')();

// 源路径配置
var sourceConfig = {
	devPort: 4000,		// 本地node服务端口
	staticPort: 4001,	// 静态页服务端口
	nodeFiles: [
		'*(!(node_modules|build|logs|test|public|config))/**/*',
		'public/?(template|swf)/**/*',
		'public/*.*',
		'config/*.*',
		'config/env/?(preview|production).js',
		'app.js',
		'config.js',
		'package.json',
		'pm2-prod.json',
	],
	cssFiles: 'public/stylesheets/**/*.css',
	jsFiles: 'public/javascripts/**/*.js',
	sassFiles: 'public/sass/**/*.scss',
	staticHtmlFiles: 'public/html/**/*.html',

	cssDir: 'public/stylesheets/',
	jsDir: 'public/javascripts/',
	sassDir: 'public/sass/'
};

// 发布路径配置
var packUrl = {
	cssPath: 'resource/static.democdn.com/css/touch/',
	jsPath: 'resource/static.democdn.com/js/touch/',
	nodePath: 'node/demo-node-server/',
	staticUrl: '//static.democdn.com/js/touch/'
};

/* ========= 以上根据不同项目配置，以下一般无需变动 ========= */

/**
 * 版本号缓存配置
 * path - 缓存文件路径
 * cache - 变更的源文件记录（文件内容或者路径变更都算）
 */
const VERSION_CACHE = {
	js: {title: "js files", file: "cache-js-ver.json", cache: {}, root: 'public'},
	css: {title: "css files", file: "cache-css-ver.json", cache: {}, cachePath: true},
	node: {title: "node files", file: "cache-node-ver.json", cache: {}, cachePath: true}
};

// 构建缓存目录配置
const CACHE_ROOT = '.gulp/';

// 构建路径配置
const buildPath = 'build/';

const Log = console.log;

function getDateTimeStr(date) {
	return new Date(Date.now() - (date || new Date()).getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19);
}

function readLastVersions(path) {
	path = libPath.resolve(CACHE_ROOT, path);

	try {
		var fullpath = libPath.resolve(process.cwd(), path);
		libFs.accessSync(CACHE_ROOT);
		delete require.cache[fullpath];
		return require(path);
	} catch(err) {
		if(err.code == "ENOENT") {
			libFs.mkdirSync(CACHE_ROOT);
		} else {
			Log(chalk.bold.yellow('[warning] ' + err.message));
		}
		return {};
	}
}

function getStreamMD5(stream) {
	var hash = libCrypto.createHash('md5');

	return new Promise(function(resolve, reject){
		stream.pipe(through(function transform(chunk, enc, cb) {
				hash.update(chunk, enc);
				this.push(chunk);
				cb();
			}, function flush(cb) {
				resolve(hash.digest('hex'));
				cb();
			}
		));
	});
}

function cacheAndDiffChangedVersion(cacheConf) {
	var cacheNew = {};
	var cacheOld = readLastVersions(cacheConf.file);
	var isCachePath = cacheConf.cachePath;
	var lastModified = '';

	if(Object.keys(cacheOld).length) {
		lastModified = getDateTimeStr(libFs.statSync(CACHE_ROOT + cacheConf.file).mtime);
	}

	return through.obj(function(file, enc, next){
		new Promise((resolve, reject) => {
			var md5;

			if (file.isBuffer()) {
				md5 = libCrypto.createHash('md5').update(file.contents, 'utf8').digest('hex');
				resolve(md5);
			} else if(file.isStream()) {
				getStreamMD5(file.contents).then(resolve);
			} else {
				this.push(file);
				next();
			}
		}).then(md5 => {
			var filename = isCachePath ? file.relative.replace(/\\/g, '/'): libPath.basename(file.path).split('.')[0];
			cacheNew[filename] = cacheConf.root ? ('/' + libPath.relative(cacheConf.root, file.path).replace(/\\/g, '/') + '?v=' + md5) : md5;

			if(cacheNew[filename] != cacheOld[filename]) {
				cacheConf.cache[filename] = cacheNew[filename];
			}
			this.push(file);	// pass through the stream
			next();
		}).catch(err => {
			Log(err.stack);
			this.push(file);
			next();
		});

	}, function(cb){
		var versionCacheFile = libPath.resolve(CACHE_ROOT, cacheConf.file);
		var sortedCacheData = {};

		Log(chalk.bold.green('[info] ' + 'changed ' + cacheConf.title + ' since last build ' + (lastModified ? '(' + lastModified + ')' : '') + ':\n') + JSON.stringify(cacheConf.cache, null, '  '));
		Log(chalk.bold.green('[info] writing version manifest into ') + chalk.bold.yellow(cacheConf.file));

		Object.keys(cacheNew).sort().forEach(file => sortedCacheData[file] = cacheNew[file]);
		libFs.writeFile( versionCacheFile, JSON.stringify(sortedCacheData, null, '  ') );
		cb();
	});
}

// Task clean
gulp.task('clean', 'clean up build directory.', function() {
	return new Promise(function(resolve, reject){
		require('del')([buildPath + '**']).then(paths => {
			Log(chalk.green('Deleted: \n' + paths.join('\n')));
		}).catch(err => {
			Log(chalk.bold.red(err));
		});
	});
});

/**
 * 编译所有sass文件
 */
gulp.task('compile:sass', 'Compile *.scss.', function(){

	var sourceFiles;

	if(process.env.npm_config_argv) {
		sourceFiles = String(JSON.parse(process.env.npm_config_argv).remain);
	} else {
		sourceFiles = argv.file || '';
	}

	// --output-style: nested [default], expanded - 多行带缩进, compact - 样式单行, compressed 整文件单行
	return new Promise(function(resolve, reject){
		libCp.exec(`node-sass --include-path ${sourceConfig.sassDir} --output-style expanded -o ${sourceConfig.cssDir} ${sourceConfig.sassDir}${sourceFiles}`, function(err){
			if(err) {
				reject(err);
				return;
			}
			resolve(true);
		});
	});
}, {
	options: {
		"file=filename": "Only compile the file you specified ( relative to `" + sourceConfig.sassDir + "` )."
	}
});

/**
 * 生成css源文件的版本索引缓存
 */
gulp.task('css-rev', false, function(){
	return gulp.src(sourceConfig.cssFiles)
		.pipe(cacheAndDiffChangedVersion(VERSION_CACHE.css));
});

/**
 * 生成js源文件的版本索引缓存
 */
gulp.task('js-rev', false, function(){
	return gulp.src(sourceConfig.jsFiles)
		.pipe(Plugins.filter( file => file.path.indexOf('requirejs-') == -1 ))
		.pipe(cacheAndDiffChangedVersion(VERSION_CACHE.js));
});

/**
 * 生成node源文件的版本索引缓存
 */
gulp.task('node-rev', false, function(){
	return gulp.src(sourceConfig.nodeFiles, {base: '.'})
		.pipe(cacheAndDiffChangedVersion(VERSION_CACHE.node));
});

/**
 * 生成新的js配置文件
 */
gulp.task('update:config', 'Overwrite `require-config.js` with latest version info of the client js files.', ['js-rev'], function() {
	var versionCacheFile = libPath.resolve(CACHE_ROOT, VERSION_CACHE.js.file);
	var nowStr = getDateTimeStr();
	var prependStr = '/*\n  AMD module config file.\n  Last Update: ' + nowStr + '\n*/\n\nvar fileVersion = ';
	var appendStr = ';' + libFs.readFileSync(sourceConfig.jsDir + 'config/requirejs-shim.js');

	return gulp.src( versionCacheFile )
		.pipe(Plugins.insert.wrap(prependStr, appendStr))
		.pipe(Plugins.rename(sourceConfig.jsDir + 'config/requirejs-config.js'))
		.pipe(gulp.dest('.'));
});

/**
 * [del]打包requirejs配置文件[/del]
 * copy配置文件到node的view目录
 */
gulp.task('build:config', 'Update require-config.js & pack to a .zip archive.', ['update:config'], function(){
	return gulp.src(sourceConfig.jsDir + 'config/requirejs-config.js', {base: sourceConfig.jsDir})
		.pipe(Plugins.replace(/\/javascripts\/(?:src\/)?/g, packUrl.staticUrl))
		.pipe(Plugins.rename(path => {
			path.dirname = packUrl.jsPath + path.dirname;
		}))
		.pipe(Plugins.zip('require-config.zip'))
		.pipe(gulp.dest(buildPath));
});

/**
 * 打包css
 */
gulp.task('build:css', 'Compile *.scss, then compress *.css, and pack all *.css to a .zip file', ['compile:sass'], function() {
	var cachedDiff = VERSION_CACHE.css.cache;

	return gulp.src(sourceConfig.cssFiles)
		.pipe(plumber())
		.pipe(cacheAndDiffChangedVersion(VERSION_CACHE.css))
		.pipe(gulpif(argv.i, Plugins.filter(file => {
			return cachedDiff[file.relative.replace(/\\/g, '/')] !== undefined;
		})))
		.pipe(Plugins.cleanCss({
			compatibility: 'ie8',
			format: 'keep-breaks',	// for improved readability
			level: {
				1: {
					all: true
				},
				2: {
					all: false,
					removeEmpty: true,
					mergeAdjacentRules: true,
					mergeNonAdjacentRules: true,
					//restructure: true,
					//mergeSemantically: true,
					reduceNonAdjacentRules: true,
					removeDuplicateRules: true
				}
			}
		}))
		.pipe(Plugins.rename(path => {
			path.dirname = packUrl.cssPath + path.dirname;
		}))
		.pipe(gulpif(!argv.c, Plugins.zip('resource-css.zip')))
		.pipe(gulp.dest(buildPath));
});

/**
 * 打包js
 */
gulp.task('build:js', 'Build and archive all client-side scripts.', ['js-rev'], function() {

	var cachedDiff = VERSION_CACHE.js.cache;

	return gulp.src(sourceConfig.jsFiles, {base: sourceConfig.jsDir})
		.pipe(plumber({
			errorHandler: function (error) {
				notify.onError("Error: <%= error.message %>");
				Log(chalk.bold.red(error));
			}
		}))
		.pipe(gulpif(argv.i, Plugins.filter(file => {
			var filename = libPath.basename(file.path).split('.')[0];
			return cachedDiff[filename] !== undefined;
		})))
		.pipe(Plugins.filter( file => file.path.indexOf('requirejs-') == -1 ))
		.pipe(gulpif(argv.i, Plugins.debug({title: '[uglify]'})))
		.pipe(Plugins.uglify({
			ie8: true,
			//mangle: false,		// 混淆变量名
			mangle: {reserved: ['$']},
			output: {beautify: false},
			compress: {
				properties: false,
				drop_console: true,
				global_defs: {
					"DEBUG": false
				},
				dead_code: true
			}
		}))
		.pipe(Plugins.rename(path => {
			path.dirname = packUrl.jsPath + path.dirname;
		}))
		//.pipe(plumber.stop())
		.pipe(gulpif(!argv.c, Plugins.zip('resource-js.zip')))
		.pipe(gulp.dest(buildPath));
});

/**
 * 打包node
 */
gulp.task('build:node', 'Build and archive all node-side files.', ['node-rev'], function(){
	var cachedDiff = VERSION_CACHE.node.cache;
	var rootDir = libPath.basename(process.cwd());
	var archiveName = rootDir + '.zip';

	return gulp.src(sourceConfig.nodeFiles, {base: '.'})
		.pipe(gulpif(argv.i, Plugins.filter(file => {
			return cachedDiff[file.relative.replace(/\\/g, '/')] !== undefined;
		})))
		.pipe(Plugins.rename(path => {
			path.dirname = packUrl.nodePath + path.dirname;
		}))
		.pipe(Plugins.zip(archiveName))
		.pipe(gulp.dest(buildPath));
});

/**
 * 构建所有并生成发布包
 */
gulp.task('build', 'Build all.', [/*'build:html', */'build:js', 'build:css', 'build:node'], function(){
	if(argv.c) {
		return gulp.src(buildPath + 'resource/**/*', {base: buildPath})
			.pipe(Plugins.zip('package.zip'))
			.pipe(gulp.dest(buildPath));
	}
});

/**
 * 启动node服务
 */
gulp.task("server", false, function() {
	// var nodemon = require('gulp-nodemon');
	// nodemon({
	// 	script: './bin/www',
	// 	ext: 'js',
	// 	//ext: 'js ejs',
	// 	ignore: 'test/',
	// 	env: {
	// 		'NODE_ENV': 'development'
	// 	}
	// });
	var nodeDev = require('node-dev');
	nodeDev('./bin/www', [], [], {
		_: [],
		//'all-deps': false,
		deps: true,
		dedupe: false,
		poll: false,
		respawn: false,
		notify: true
	});
});

/**
 * 开启本地node服务，并监听静态页和sass更改
 */
gulp.task('default', 'Start local node server and browser-sync server.', ['server'], function() {

	var browserSync = require('browser-sync');
	var watchFiles = [sourceConfig.staticHtmlFiles, sourceConfig.cssFiles];

	if(!argv.fullcompile) {
		watchFiles.pop();
		gulp.watch(sourceConfig.sassFiles, function(event){
			var path = libPath.relative(process.cwd(), event.path);
			console.log('file ' + event.type + ': ' + path);
			if(event.type != 'deleted') {
				require('node-sass').render({
					file: path,
					includePaths: [sourceConfig.sassDir],
					outputStyle: 'expanded'
					//sourceComments: true
				}, function(err, result) {
					if(err) {
						Log(chalk.bold.red(err.formatted || err.message));
						return;
					}
					var dest = libPath.basename(path.replace(/\.s[ac]ss$/, '.css'));
					Plugins.file(dest, result.css.toString(), {src: true})
						.pipe(gulp.dest(sourceConfig.cssDir))
						.pipe(browserSync.reload({stream: true}));
				});
			}
		});
	}

	// 监听js目录，增加文件时更新版本配置文件
	gulp.watch(sourceConfig.jsFiles, function(event){
		if(event.type == 'added') {
			var cacheConf = VERSION_CACHE.js;
			var configFile = sourceConfig.jsDir + 'config/requirejs-config.js';
			var filename = libPath.basename(event.path).split('.')[0];
			var filepath = '/' + libPath.relative(cacheConf.root, event.path).replace(/\\/g, '/') + '?v=' + getDateTimeStr().replace(/\s/g, '+');

			var configContent = '' + libFs.readFileSync( configFile );
			configContent = configContent.replace(/^var fileVersion\s*=\s*\{\s*/im, `$&"${filename}": "${filepath}",\n  `);
			libFs.writeFile( configFile, configContent );
		}
	});

	// 静态页服务，代理到本地node服务以支持ejs语法
	browserSync.init({
		//server: './public/',
		proxy: `http://localhost:${sourceConfig.devPort}/html`,
		files: watchFiles,	// 监听html/css
		port: sourceConfig.staticPort,
		//browser: 'chrome',
		directory: false,
		open: false,	// local|ui
		notify: false
	});
});


/**
 * 检查js依赖
 */
gulp.task('check:js', 'Uses AST to check unused AMD modules.', function() {

	return gulp.src(sourceConfig.jsFiles, {base: sourceConfig.jsDir})
		.pipe(plumber({
			errorHandler: function (error) {
				notify.onError("Error: <%= error.message %>");
				Log(chalk.bold.red(error));
			}
		}))
		.pipe(Plugins.filter( file => file.path.indexOf('requirejs-') == -1 ))
		.pipe(Plugins.amdcheck({
			//excepts: [],
			exceptsPaths: ['underscore', 'zepto'],
			//logModuleId: true,
			//logUnusedDependencyPaths: true,
			//logUnusedDependencyNames: true,
			//removeUnusedDependencies: false,
			errorOnUnusedDependencies: true
		}));
});
