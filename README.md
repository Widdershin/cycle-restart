# cycle-restart

Hot module reloading is super cool. You can change your code in an instant, and you don't have to reload the page to see the result.

The most annoying part about it is that it throws away your application state! So if you want to develop with your app in a certain state, you have to recreate that state manually each time the code is reloaded.

`cycle-restart` solves that problem for you! It records all the actions you perform and replays them after you change your code. Best part is that it happens in the blink of an eye!

[edge/cyc](https://github.com/edge/cyc) is a great boilerplate project to help you get started with cycle-restart.

Installation
---

```bash
$ npm install cycle-restart --save-dev
```

How do I use it?
---

`cycle-restart` is designed to be used with hot module reloading, provided either by browserify-hmr or Webpack.

You'll want to set up your entry point (usually `index.js`) like so:

```js
import {run} from '@cycle/core';
import {makeDOMDriver} from '@cycle/dom';
import {makeHTTPDriver} from '@cycle/http';

import {rerunner, restartable} from 'cycle-restart';

let app = require('./src/app').default;

const drivers = {
  DOM: restartable(makeDOMDriver('.app'), {pauseSinksWhileReplaying: false}),
  HTTP: restartable(makeHTTPDriver())
};

let rerun = rerunner(run);
rerun(app, drivers);

if (module.hot) {
  module.hot.accept('./src/app', () => {
    app = require('./src/app').default;
    rerun(app, drivers);
  });
}
```

Browserify
---

`cycle-restart` works great with [browserify-hmr](https://github.com/AgentME/browserify-hmr).

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

The minimum requirement to get HMR working with webpack config is first to add these two entry points to your `config.entry`

```javascript
entry: [
    // The script refreshing the browser on none hot updates
    'webpack-dev-server/client?http://localhost:8080',
    'webpack/hot/dev-server', // For hot style updates
    mainPath, // your actual entry
  ]
```

and of course, the HMR plugin itself in `config.plugins`

```javascript
plugins: [new Webpack.HotModuleReplacementPlugin()]
```

Finally, run the command on the directory where your webpack config file is located. Defaults to `webpack.config.js`
```bash
webpack-dev-server --progress --colors --inline
```

For an example, look at https://github.com/FeliciousX/cyclejs-starter

SystemJS
---
(If anyone who has experience with SystemJS could add some instructions about how to get set up, it would be greatly appreciated)

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

  import {rerunner, restartable} from 'cycle-restart';

  let app = require('./src/app').default;

  const drivers = {
    DOM: restartable(makeDOMDriver('.app'), {pauseSinksWhileReplaying: false}),
    HTTP: restartable(makeHTTPDriver())
  };
  
- const rerun = rerunner(run);
+ const rerun = rerunner(run, isolate);
  rerun(app, drivers);

  if (module.hot) {
    module.hot.accept('./src/app', () => {
      app = require('./src/app').default;
      rerun(app, drivers);
    });
  }
```

Caveats
---

`cycle-restart` relies on your `main` function being pure. That means all real world side effects need to be encapsulated in drivers.

Here are some of the things that are likely to break right now:

 * Accessing time without using a time driver such as `cycle-animation-driver` or `cycle-time-driver`. Time is a side effect. (This includes `Rx.Observable.interval()` and `Rx.Observable.timestamp()`).
 * `Math.random()`. If you're using random numbers in your program, you should use a generator that produces deterministic numbers such as the mersenne twister from [random-js](https://github.com/ckknight/random-js).

Contributing
---

Your contribution is extremely welcome. Please feel free to open issues, pull requests or help in any way you'd like. If you're unsure how best you can contribute, [get in touch](mailto:ncwjohnstone@gmail.com) and we can chat.

License
---

`cycle-restart` is released under the MIT license. Please see the `LICENSE` file for full text.
