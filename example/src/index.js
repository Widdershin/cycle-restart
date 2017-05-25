import {setup} from '@cycle/run';
import {makeDOMDriver} from '@cycle/dom';
import {timeDriver} from '@cycle/time';
import {restartable, rerunner} from '../../src/restart';

import main from './main';

const driversFn = () => ({
  DOM: restartable(makeDOMDriver('.app'), {pauseSinksWhileReplaying: false}),
  Time: timeDriver
});

const rerun = rerunner(setup, driversFn);

rerun(main);

if (module.hot) {
  module.hot.accept('./main', () => {
    const newMain = require('./main').default;

    rerun(newMain);
  });
}
