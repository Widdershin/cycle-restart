/* globals describe, it, before, after */
import assert from 'assert';
import {setup} from '@cycle/run';
import delay from 'xstream/extra/delay';

import {rerunner, restartable} from '../../src/restart';

import xs from 'xstream';

let requestCount = 0;

const config = [
  {
    pattern: '/a',

    fixtures: function (match) {
      requestCount += 1;

      return 'Hello, world! - ' + requestCount;
    },

    get: function (match, data) {
      return {text: data};
    }
  }
];

const request = require('../../node_modules/@cycle/http/node_modules/superagent');
const superagentMock = require('superagent-mock')(request, config);

import {makeHTTPDriver} from '@cycle/http';

describe('restarting a cycle app that makes http requests', () => {
  function main ({HTTP, Start}) {
    const responses$$ = HTTP.select()
    const responses$ = responses$$.flatten().map(res => res.text);

    return {
      HTTP: Start.mapTo('/a'),
      responses$: responses$.remember(),
      responses$$
    };
  }

  it('only makes requests the first time', (done) => {
    const start$ = xs.create();

    const driversFn = () => ({
      HTTP: restartable(makeHTTPDriver()),
      Start: () => start$
    });

    assert.equal(requestCount, 0);

    let rerun = rerunner(setup, driversFn);
    rerun(main, () => {
      start$.shamefullySendNext();

      setTimeout(() => {
        assert.equal(
          requestCount, 1,
          `Expected requestCount to be 1 prior to restart, was ${requestCount}.`
        );

        rerun(main, () => {
          assert.equal(
            requestCount, 1,
            `Expected requestCount to be 1 after restart, was ${requestCount}.`
          );

          done();
        });
      }, 20);
    });
  });

  it('replays responses', (done) => {
    requestCount = 0;

    const start$ = xs.create();

    const driversFn = () => ({
      HTTP: restartable(makeHTTPDriver()),
      Start: restartable(() => start$)
    });

    assert.equal(requestCount, 0);

    let rerun = rerunner(setup, driversFn);

    const {sinks} = rerun(main);

    const goodListener = (next) => ({
      next,

      error: done,
    });

    sinks.responses$.take(1).addListener(goodListener(text => {
      assert.equal(text, 'Hello, world! - 2');

      assert.equal(
        requestCount, 2,
        `Expected requestCount to be 2 prior to restart, was ${requestCount}.`
      );

      rerun(main, {
        start ({sinks}) {
          sinks.responses$.take(1).addListener(goodListener(text => {
            assert.equal(text, 'Hello, world! - 2');

            assert.equal(
              requestCount, 2,
              `Expected requestCount to be 2 after restart, was ${requestCount}.`
            );

            done();
          }));
        },

        stop () {
        }
      });

    }));

    start$.shamefullySendNext('');
  });

  function requestMain ({HTTP}) {
    const response$$ = HTTP.select()
    const request$ = response$$.flatten().map(res$ => res$.request)

    return {
      HTTP: xs.of('/a').compose(delay(10)),
      request$,
      response$$
    };
  }

  it('has the request available on the response$', (done) => {
    requestCount = 0;

    const driversFn = () => ({HTTP: restartable(makeHTTPDriver())});

    assert.equal(requestCount, 0);

    const goodListener = (next) => ({
      next,

      error: done,

      complete: () => {}
    });

    let rerun = rerunner(setup, driversFn);
    const {sinks} = rerun(requestMain);

    sinks.request$.take(1).addListener(goodListener(text => {
      assert.equal(text.url, '/a');

      const restartedSinks = rerun(requestMain).sinks;

      restartedSinks.request$.take(1).addListener(goodListener(text => {
        assert.equal(text.url, '/a');

        done();
      }));
    }));
  });

  it('has the request available on the response$', (done) => {
    requestCount = 0;

    const driversFn = () => ({HTTP: restartable(makeHTTPDriver())});

    assert.equal(requestCount, 0);

    const goodListener = (next) => ({
      next,

      error: done,

      complete: () => {}
    });

    let rerun = rerunner(setup, driversFn);
    const {sinks} = rerun(requestMain);

    sinks.response$$.take(1).addListener(goodListener(response$ => {
      assert.equal(response$.request.url, '/a');

      response$.addListener(goodListener(response => {
        assert.equal(response.request.url, '/a');

        const restartedSinks = rerun(requestMain).sinks;

        restartedSinks.response$$.take(1).addListener(goodListener(response$ => {
          assert.equal(response$.request.url, '/a');

          response$.addListener(goodListener(response => {
            assert.equal(response.request.url, '/a');

            done();
          }));
        }));
      }));
    }));
  });
});
