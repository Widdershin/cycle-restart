/* globals describe, it, before, after */
import assert from 'assert';
import {run} from '@cycle/core';
import {makeHistoryDriver} from '@cycle/history';

import {restart, restartable} from '../../src/restart';

import {Observable, Subject} from 'rx';

const testSubject = new Subject();

describe('restarting a cycle app using a simple driver', () => {
  function main ({History}) {
    const count$ = testSubject.map(_ => 1).scan((total, change) => total + change);

    return {
      History: count$.startWith(0).map(count => '/' + count),
      location: History
    };
  }

  it('works', (done) => {
    const drivers = {
      History: restartable(makeHistoryDriver(), {pauseSinksWhileReplaying: true})
    };

    const {sources, sinks} = run(main, drivers);

    sinks.location.skip(1).take(1).subscribe(({pathname}) => {
      assert.deepEqual(pathname, '/0');

      const newSourcesAndSinks = restart(main, drivers, {sources, sinks});

      newSourcesAndSinks.sinks.location.skip(1).take(1).subscribe(count => {
        assert.deepEqual(pathname, '/0');

        done();
      });
    });

    testSubject.onNext(1);
  });
});
