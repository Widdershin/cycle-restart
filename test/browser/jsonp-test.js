/* globals describe, it*/
const jsonpMock = function (url, cb) {
  requestCount += 1;

  cb(false, {
    ping: 'pong'
  });
};

var proxyquire = require('proxyquireify')(require);
const {makeJSONPDriver} = proxyquire('@cycle/jsonp', {'jsonp': jsonpMock, '@noCallThru': true});

import assert from 'assert';
import {run} from '@cycle/core';

import {rerunner, restartable} from '../../src/restart';

import {Observable} from 'rx';

let requestCount = 0;

describe('restarting a cycle app that makes jsonp requests', () => {
  function main ({JSONP}) {
    const responses$ = JSONP.mergeAll();

    const request$ = JSONP.flatMap(res$ => res$, outer => {
      return outer.request;
    });

    return {
      responses$: responses$.shareReplay(1),
      JSONP: Observable.just('/hello'),
      request$
    };
  }

  it('replays responses', (done) => {
    const drivers = {
      JSONP: restartable(makeJSONPDriver())
    };

    assert.equal(requestCount, 0);

    let rerun = rerunner(run);
    const {sinks} = rerun(main, drivers);

    setTimeout(() => {
      let responseText;

      sinks.responses$.take(1).subscribe(text => {
        responseText = text;
        assert.deepEqual(text, {ping: 'pong'});

        assert.equal(
          requestCount, 1,
          `Expected requestCount to be 1 prior to restart, was ${requestCount}.`
        );

        const restartedSinks = rerun(main, drivers).sinks;

        restartedSinks.responses$.take(1).subscribe(text => {
          assert.equal(text, responseText);
          assert.equal(
            requestCount, 1,
            `Expected requestCount to be 1 after restart, was ${requestCount}.`
          );

          done();
        });
      });
    }, 50);
  });

  it('allows access to the request', (done) => {
    const drivers = {
      JSONP: restartable(makeJSONPDriver())
    };

    let rerun = rerunner(run);
    const {sinks} = rerun(main, drivers);

    sinks.request$.take(1).subscribe(text => {
      assert.equal('/hello', text);

      rerun(main, drivers).sinks.request$.take(1).subscribe(request => {
        assert.equal('/hello', request);

        done();
      });
    });
  });
});
