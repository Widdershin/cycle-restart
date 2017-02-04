/* globals describe, it, before, after */
import assert from 'assert';
import run from '@cycle/xstream-run';
import delay from 'xstream/extra/delay';

const request = require('superagent');

import {makeHTTPDriver} from '@cycle/http';
const http = require('http');

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

const superagentMock = require('superagent-mock')(request, config);

describe('restarting a cycle app that makes http requests', () => {
  function main ({HTTP, Start}) {
    const responses$ = HTTP.select().flatten().map(res => res.text);

    return {
      HTTP: Start.mapTo('/a'),
      responses$: responses$
    };
  }

  it('only makes requests the first time', (done) => {
    const start$ = xs.create();

    const driversFn = () => ({
      HTTP: restartable(makeHTTPDriver()),
      Start: () => start$
    });

    assert.equal(requestCount, 0);

    let rerun = rerunner(run, driversFn);
    rerun(main, () => {
      start$.shamefullySendNext();

      setTimeout(() => {
        assert.equal(
          requestCount, 1,
          `Expected requestCount to be 1 prior to restart, was ${requestCount}.`
        );

        let called = 0;

        rerun(main, () => {
          assert.equal(
            requestCount, 1,
            `Expected requestCount to be 1 after restart, was ${requestCount}.`
          );

          called++;

          if (called === 1) {
            done();
          }
        });
      }, 20);
    });
  });

  it('replays responses', (done) => {;
    requestCount = 0;

    const start$ = xs.create();

    const driversFn = () => ({
      HTTP: restartable(makeHTTPDriver()),
      Start: () => start$
    });

    assert.equal(requestCount, 0);

    let rerun = rerunner(run, driversFn);
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

      const restartedSinks = rerun(main).sinks;

      restartedSinks.responses$.take(1).addListener(goodListener(text => {

        assert.equal(
          requestCount, 2,
          `Expected requestCount to be 2 after restart, was ${requestCount}.`
        );

        done();
      }));
    }));

    start$.shamefullySendNext('');
  });

  function requestMain ({HTTP}) {
    const request$ = HTTP.select().flatten().map(res$ => res$.request)

    return {
      HTTP: xs.of('/a').compose(delay(50)),
      request$
    };
  }

  it('has the request available on the response', (done) => {
    requestCount = 0;

    const driversFn = () => ({
      HTTP: restartable(makeHTTPDriver())
    });

    assert.equal(requestCount, 0);

    const goodListener = (next) => ({
      next,

      error: done,

      complete: () => {}
    });

    let rerun = rerunner(run, driversFn);
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
});
