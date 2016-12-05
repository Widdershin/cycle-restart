/* globals describe, it, before, after */
import assert from 'assert';
import run from '@cycle/xstream-run';
import {makeHTTPDriver} from '@cycle/http';
import delay from 'xstream/extra/delay';

const http = require('http');

import {rerunner, restartable} from '../../src/restart';

import xs from 'xstream';

let requestCount = 0;

const server = http.createServer(function (req, res) {
  requestCount += 1;

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello, world! - ' + requestCount);
});

const PORT = 8532;


describe('restarting a cycle app that makes http requests', () => {
  before(() => server.listen(PORT));
  after(() => server.close());

  function main ({HTTP}) {
    const responses$ = HTTP.select().flatten().map(res => res.text);

    return {
      HTTP: xs.of('localhost:8532/a').compose(delay(50)),
      responses$: responses$
    };
  }

  it('only makes requests the first time', (done) => {
    const driversFn = () => ({
      HTTP: restartable(makeHTTPDriver({eager: true}))
    });

    assert.equal(requestCount, 0);

    let rerun = rerunner(run, driversFn);
    rerun(main);

    setTimeout(() => {
      assert.equal(
        requestCount, 1,
        `Expected requestCount to be 1 prior to restart, was ${requestCount}.`
      );

      rerun(main);

      setTimeout(() => {
        assert.equal(
          requestCount, 1,
          `Expected requestCount to be 1 after restart, was ${requestCount}.`
        );

        done();
      }, 500);
    }, 500);
  });

  it('replays responses', (done) => {;
    requestCount = 0;

    const driversFn = () => ({
      HTTP: restartable(makeHTTPDriver())
    });

    assert.equal(requestCount, 0);

    let rerun = rerunner(run, driversFn);
    const {sinks} = rerun(main);

    const goodListener = (next) => ({
      next,

      error: done,

    });

    sinks.responses$.take(1).addListener(goodListener(text => {
      assert.equal(text, 'Hello, world! - 1');

      assert.equal(
        requestCount, 1,
        `Expected requestCount to be 1 prior to restart, was ${requestCount}.`
      );

      const restartedSinks = rerun(main).sinks;

      restartedSinks.responses$.take(1).addListener(goodListener(text => {

        assert.equal(
          requestCount, 1,
          `Expected requestCount to be 1 after restart, was ${requestCount}.`
        );

        done();
      }));
    }));
  });

  function requestMain ({HTTP}) {
    const request$ = HTTP.select().flatten().map(res$ => res$.request)

    return {
      HTTP: xs.of('localhost:8532/a').compose(delay(50)),
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
      assert.equal(text.url, 'localhost:8532/a');

      const restartedSinks = rerun(requestMain).sinks;

      restartedSinks.request$.take(1).addListener(goodListener(text => {
        assert.equal(text.url, 'localhost:8532/a');

        done();
      }));
    }));
  });
});
