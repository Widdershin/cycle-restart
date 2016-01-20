# cycle-restart
Restart a Cycle.js application with new code and see the change instantly.

Why?
---

So that you can use hot module reloading to change your code on the fly, and have the app act as if your new code had been running all along. The feedback loop is phenomenally short!

Installation
---

`npm install cycle-restart --save`


How do I use it?
---

cycle-restart is designed to be used with hot module reloading, provided either by browserify-hmr or webpack.

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

Limitations
---

Currently, `restartable` has only been tested with `@cycle/dom` and `@cycle/http`. The plan is to make it generic enough to work with any driver, so if you run into a driver that doesn't work correctly with `restartable`, please open an issue.

cycle-restart is still at an experimental stage, and there is currently no easy way to disable it in production.
