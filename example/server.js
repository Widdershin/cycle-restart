import budo from 'budo';
import babelify from 'babelify';
import hotModuleReloading from 'browserify-hmr';
import path from 'path';

budo(path.join(__dirname, 'src', 'index.js'), {
  serve: 'bundle.js',
  live: '*.{css,html}',
  port: 8000,
  stream: process.stdout,
  browserify: {
    transform: babelify,
    plugin: hotModuleReloading
  }
});

