/* globals describe, it*/
import assert from 'assert';
import run from '@cycle/xstream-run';
import {button, div, a, makeDOMDriver} from '@cycle/dom';

let requestCount = 0;
let wikiRequest = 0;

const request = require('superagent');

const config = [
  {
    pattern: '/(boo)',

    fixtures: function (match) {
      requestCount += 1;

      return 'Hello, world! - ' + match[1];
    },

    get: function (match, data) {
      return {text: data};
    }
  },
  {
    pattern: '/wikipedia/(.*)',

    fixtures: function (match) {
      wikiRequest += 1;

      return {items: [{full_name: match[1], stargazers_count: 10}]};
    },

    get: function (match, data) {
      return {text: data};
    }
  }
];

const superagentMock = require('superagent-mock')(request, config);

import {makeHTTPDriver} from '@cycle/http';

import {rerunner, restartable} from '../../src/restart';

import xs from 'xstream';
import debounce from 'xstream/extra/debounce';

import $ from 'jquery';

let testContainerCount = 34534;

function makeTestContainer () {
  const selector = 'test-' + testContainerCount;
  const container = $(`<div class="${selector}">`);

  $(document.body).append(container);

  testContainerCount++;

  return {container, selector: '.' + selector};
}

describe('restarting a cycle app that makes http requests trigged by dom events', () => {
  function main ({DOM, HTTP}) {
    const responses$ = HTTP.select().flatten().map(res => res.text);
    const click$ = DOM.select('.click').events('click');

    return {
      DOM: xs.of(button('.click', 'Click me!')),
      HTTP: click$.map(() => '/boo'),
      responses$
    };
  }

  it('replays responses', (done) => {
    const {selector} = makeTestContainer();

    const driversFn = () => ({
      HTTP: restartable(makeHTTPDriver({eager: true})),
      DOM: makeDOMDriver(selector)
    });

    assert.equal(requestCount, 0);

    const err = (e) => {
      done(new Error('test failed: ' + e.message));
    }

    let rerun = rerunner(run, driversFn);
    rerun(main, {
      start ({sinks}) {
        let responseText;

        sinks.responses$.take(1).addListener({error: err, next: text => {
          responseText = text;
          assert.equal(text, 'Hello, world! - boo');

          assert.equal(
            requestCount, 2,
            `Expected requestCount to be 2 prior to restart, was ${requestCount}.`
          );

          rerun(main, {
            start ({sinks}) {
              sinks.responses$.take(1).addListener({error: err, next: text => {
                assert.equal(text, responseText);
                assert.equal(
                  requestCount, 2,
                  `Expected requestCount to be 2 after restart, was ${requestCount}.`
                );


                done();
              }});
            },

            stop () {
            }
          });
        }});

        $('.click').click();
      },

      stop () {}
    });
  });

  it('handles more complex apps', (done) => {
    let {container, selector} = makeTestContainer();

    const driversFn = () => ({
      HTTP: restartable(makeHTTPDriver({eager: true})),
      DOM: makeDOMDriver(selector)
    });

    requestCount = 0;
    assert.equal(requestCount, 0);

    let rerun = rerunner(run, driversFn);

    const err = (e) => {
      done(new Error('test failed: ' + e.message));
    }

    rerun(WikipediaSearchBox, {
      start ({sinks})  {
        sinks.results$.drop(1).take(1).addListener({error: err, next: data => {
          assert.equal(data.items[0].full_name, 'woah');

          assert.equal(
            wikiRequest, 2,
            `Expected requestCount to be 2 prior to restart, was ${wikiRequest}.`
          );

          rerun(WikipediaSearchBox, {
            start ({sinks}) {
              sinks.results$.drop(1).take(1).addListener({error: err, next: newData => {
                assert.equal(newData.items[0].full_name, 'woah');

                assert.equal(
                  wikiRequest, 2,
                  `Expected requestCount to be 2 after restart, was ${wikiRequest}.`
                );

                done();
              }});
            },

            stop () {
            }
          });
        }});

        container = $(selector);
        container.find('.search').click()
      },

      stop () {
      }
    });
  });

  it('allows making requests again after restart', (done) => {
    wikiRequest = 0;
    let {container, selector} = makeTestContainer();

    const driversFn = () => ({
      HTTP: restartable(makeHTTPDriver({eager: true})),
      DOM: makeDOMDriver(selector)
    });

    requestCount = 0;
    assert.equal(requestCount, 0);

    let rerun = rerunner(run, driversFn);

    const err = (e) => {
      done(new Error('test failed: ' + e.message));
    }

    rerun(WikipediaSearchBox, {
      start ({sinks}) {
        container = $(selector);
        container.find('.search').click()

        sinks.results$.drop(1).take(1).addListener({error: err, next: data => {
          assert.equal(data.items[0].full_name, 'woah');

          assert.equal(
            wikiRequest, 2,
            `Expected requestCount to be 2 prior to restart, was ${wikiRequest}.`
          );

          rerun(WikipediaSearchBox, {
            start ({sinks}) {
              sinks.results$.drop(1).take(1).addListener({error: err, next: newData => {
                assert.equal(newData.items[0].full_name, 'woah');

                assert.equal(
                  wikiRequest, 2,
                  `Expected requestCount to be 2 after restart, was ${wikiRequest}.`
                );

                container = $(selector);
                container.find('.search').click();

                sinks.results$.drop(1).take(1).addListener({error: err, next: () => {

                  assert.equal(
                    wikiRequest, 4,
                    `Expected requestCount to be 4 after more events performed post restart, was ${wikiRequest}.`
                  );

                  done();
                }})
              }});
            },

            stop () {}
          });
        }});
      },

      stop () {}
    })
  });
});

function searchWikipedia (term) {
  return `/wikipedia/${term}`;
}

function sortedByStars (results) {
  return results
    .sort((result, result2) => parseInt(result2.stargazers_count, 10) - parseInt(result.stargazers_count, 10));
}

function WikipediaSearchBox ({DOM, HTTP}) {
  const results$ = HTTP
    .select().flatten()
    .map(req => req.text)
    .startWith({items: []})

  const searchTerm$ = DOM
    .select('.search')
    .events('click')
    .compose(debounce(100))
    .map(() => 'woah')

  return {
    DOM: results$.map(results =>
      div('.search-box', [
        button('.search', 'Search'),
        div('.results', sortedByStars(results.items).map(renderResult))
      ])
    ),

    HTTP: searchTerm$.map(searchWikipedia),

    results$
  };
}

function renderResult (result) {
  return (
    div('.result', [
      div('.result-name', [
        a({href: `https://github.com/${result.full_name}`}, result.full_name),
        ` - ${result.stargazers_count} ★`
      ]),
      div('.result-description', {style: {'margin-bottom': '5px'}}, `${result.description}`)
    ])
  );
}
