/* globals describe, it */
import assert from 'assert';
import {run} from '@cycle/core';
import {makeHTTPDriver} from '@cycle/http';

const http = require('http');

import restart from '../../src/restart';

import {Observable} from 'rx';

let requestCount = 0;

const server = http.createServer(function (req, res) {
  requestCount += 1;

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello, world!');
});

const PORT = 8532;

describe('restarting a cycle app that makes http requests', () => {
  before(() => server.listen(PORT));
  after(() => server.close());

  function main ({HTTP}) {
    HTTP.mergeAll().subscribe(foo =>
      assert.strictEqual(foo.text, 'Hello, world!')
    );

    return {
      HTTP: Observable.just('localhost:8532/a')
    };
  }

  it('only makes requests the first time', (done) => {
    const drivers = {
      HTTP: makeHTTPDriver()
    };

    assert.equal(requestCount, 0);

    const {sources} = run(main, drivers);

    setTimeout(() => {
      assert.equal(requestCount, 1);

      restart(main, sources, drivers);

      setTimeout(() => {
        assert.equal(requestCount, 1);

        done();
      }, 50);
    }, 50);
  });
});
