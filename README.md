# cycle-restart

Hot module reloading is super cool. You can change your code in an instant, and you don't have to reload the page to see the result.

The most annoying part about it is that it throws away your application state! So if you want to develop with your app in a certain state, you have to recreate that state manually each time the code is reloaded.

cycle-restart solves that problem for you! It records all the actions you perform and replays them after you change your code. Best part is that it happens in the blink of an eye!

Installation
---

```bash
$ npm install cycle-restart --save-dev
```

How do I use it?
---

cycle-restart is designed to be used with hot module reloading, provided either by browserify-hmr or Webpack.

You'll want to set up your entry point (usually `index.js`) like so:

```js
import {run} from '@cycle/core';
import {makeDOMDriver} from '@cycle/dom';
import {makeHTTPDriver} from '@cycle/http';

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

    restart(app, drivers, {sinks, sources});
  });
}
```

Browserify
---

cycle-restart works great with [browserify-hmr](https://github.com/AgentME/browserify-hmr).

Assuming we have an `index.js` with the above code, and `src/app.js` exporting our `main` function. We also need an `index.html` with a `<script>` that loads our `bundle.js`

First, we need to install `watchify` and `browserify-hmr`:

```bash
$ npm install watchify browserify-hmr babelify --save-dev
```

Then we can use `watchify` to serve our bundle:

```bash
$ watchify -t babelify -p browserify-hmr index.js -o bundle.js
```

You can also use `budo` as a development server. `budo` makes it easy to also live reload your css. For an example of this, see [Widdershin/cycle-hot-reloading-example](https://github.com/Widdershin/cycle-hot-reloading-example/)

Webpack
---

Have a look at the [webpack docs](https://github.com/webpack/docs/wiki/hot-module-replacement-with-webpack) for setting up hot module reloading.

(If someone who is familiar with Webpack would like to write some docs here, it would be much appreciated).

Supported drivers
---

`cycle-restart` is tested against and known to work with the following drivers:

* cycle-dom
* cycle-http
* cycle-jsonp
* cycle-history
* cycle-animation-driver

Other drivers are likely to work off the bat. If you encounter a problem, please raise an issue and we will try and add compatability. If you use a driver not on this list and it works, let us know about it.

Isolate?
---

`cycle-restart` does in fact support [isolate](https://github.com/cyclejs/isolate). If you use `isolate` in your apps, simply pass it as an extra argument to `restart`.

```diff
  import {run} from '@cycle/core';
  import {makeDOMDriver} from '@cycle/dom';
  import {makeHTTPDriver} from '@cycle/http';
+ import isolate from '@cycle/isolate';

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

-     restart(app, drivers, {sinks, sources});
+     restart(app, drivers, {sinks, sources}, isolate);
    });
  }
```

Caveats
---

`cycle-restart` relies on your `main` function being pure. That means all real world side effects need to be encapsulated in drivers.

Here are some of the things that are likely to break right now:

 * Accessing time without using a time driver such as `cycle-animation-driver` or `cycle-time-driver`. Time is a side effect. (This includes `Rx.Observable.interval()` and `Rx.Observable.timestamp()`).
 * `Math.random()`. If you're using random numbers in your program, you should use a generator that produces deterministic numbers such as the mersenne twister from [random-js](https://github.com/ckknight/random-js).
