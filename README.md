# cycle-restart
Restart a Cycle.js application and preserve state. Designed for hot module reloading.

How do I use it?
---

cycle-restart is designed to be used in conjunction with hot module reloading, provided either by browserify-hmr or webpack.

```js
import {run} from '@cycle/core';
import {makeDOMDriver} from '@cycle/dom';
import {makeHTTPDriver} from '@cycle/http';
import isolate from '@cycle/isolate';

import {restart, restartable} from 'cycle-restart';

import app from './src/app';

const drivers = {
  DOM: restartable(makeDOMDriver('.app'), {pauseSinksWhileReplaying: false}),
  HTTP: restartable(makeHTTPDriver())
};

const {sinks, sources} = run(app, drivers);

if (module.hot) {
  module.hot.accept('./src/app', () => {
    app = require('./src/app').default;

    restart(app, drivers, {sinks, sources}, isolate);
  });
}
```
