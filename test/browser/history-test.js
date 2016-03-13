/* globals describe, it*/
import assert from 'assert';
import {run} from '@cycle/core';
import {makeHistoryDriver} from '@cycle/history';

import {rerunner, restartable} from '../../src/restart';

import {Subject} from 'rx';

const testSubject = new Subject();

describe('restarting a cycle app using a simple driver', () => {
  function main ({History}) {
    const count$ = testSubject.map(() => 1).scan((total, change) => total + change);

    return {
      History: count$.startWith(0).map(count => '/' + count),
      location: History
    };
  }

  it('works', (done) => {
    const drivers = {
      History: restartable(makeHistoryDriver(), {pauseSinksWhileReplaying: true})
    };

    let rerun = rerunner(run);
    const {sinks} = rerun(main, drivers);

    sinks.location.skip(1).take(1).subscribe(({pathname}) => {
      assert.deepEqual(pathname, '/0');

      const newSourcesAndSinks = rerun(main, drivers);

      newSourcesAndSinks.sinks.location.skip(1).take(1).subscribe(() => {
        assert.deepEqual(pathname, '/0');

        done();
      });
    });

    testSubject.onNext(1);
  });
});
