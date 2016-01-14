
/* globals describe, it, before, after */
import assert from 'assert';
import {run} from '@cycle/core';
import {button, div, input, a, makeDOMDriver} from '@cycle/dom';

const request = require('../../node_modules/@cycle/http/node_modules/superagent');

let requestCount = 0;
let wikiRequest = 0;

const config = [
  {
    pattern: '/(boo)',

    fixtures: function (match, params, headers) {
      requestCount += 1;

      return 'Hello, world! - ' + match[1];
    },

    get: function (match, data) {
      return {text: data};
    }
  },
  {
    pattern: '/wikipedia/(.*)',

    fixtures: function (match, params, headers) {
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

import {restart, restartable} from '../../src/restart';

import {Observable} from 'rx';

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
    const responses$ = HTTP.mergeAll().map(res => res.text);
    const click$ = DOM.select('.click').events('click');

    return {
      DOM: Observable.just(button('.click', 'Click me!')),
      HTTP: click$.map(_ => '/boo'),
      responses$
    };
  }

  it('replays responses', (done) => {
    const {container, selector} = makeTestContainer();

    const drivers = {
      HTTP: restartable(makeHTTPDriver({eager: true})),
      DOM: makeDOMDriver(selector)
    };

    assert.equal(requestCount, 0);

    const {sources, sinks} = run(main, drivers);

    setTimeout(() => {
      $('.click').click();

      let responseText;

      sinks.responses$.take(1).subscribe(text => {
        responseText = text;
        assert.equal(text, 'Hello, world! - boo');

        assert.equal(
          requestCount, 1,
          `Expected requestCount to be 1 prior to restart, was ${requestCount}.`
        );

        const restartedSinks = restart(main, drivers, {sources, sinks}).sinks;

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

  it('handles more complex apps', (done) => {
    const {container, selector} = makeTestContainer();

    const drivers = {
      HTTP: restartable(makeHTTPDriver({eager: true})),
      DOM: makeDOMDriver(selector)
    };

    requestCount = 0;
    assert.equal(requestCount, 0);

    const {sources, sinks} = run(WikipediaSearchBox, drivers);

    setTimeout(() => {
      container.find('.search').click()
      let responseText;

      sinks.results$.skip(1).take(1).subscribe(data => {
        assert.equal(data.items[0].full_name, 'woah');

        assert.equal(
          wikiRequest, 1,
          `Expected requestCount to be 1 prior to restart, was ${wikiRequest}.`
        );

        const restartedSinks = restart(WikipediaSearchBox, drivers, {sources, sinks}).sinks;

        restartedSinks.results$.skip(1).take(1).subscribe(newData => {
          assert.equal(newData.items[0].full_name, 'woah');

          assert.equal(
            wikiRequest, 1,
            `Expected requestCount to be 1 after restart, was ${wikiRequest}.`
          );

          done();
        });
      });
    });
  });

  it('allows making requests again after restart', (done) => {
    wikiRequest = 0;
    const {container, selector} = makeTestContainer();

    const drivers = {
      HTTP: restartable(makeHTTPDriver({eager: true})),
      DOM: makeDOMDriver(selector)
    };

    requestCount = 0;
    assert.equal(requestCount, 0);

    const {sources, sinks} = run(WikipediaSearchBox, drivers);

    setTimeout(() => {
      container.find('.search').click()
      let responseText;

      sinks.results$.skip(1).take(1).subscribe(data => {
        assert.equal(data.items[0].full_name, 'woah');

        assert.equal(
          wikiRequest, 1,
          `Expected requestCount to be 1 prior to restart, was ${wikiRequest}.`
        );


        const restartedSinks = restart(WikipediaSearchBox, drivers, {sources, sinks}).sinks;

        restartedSinks.results$.skip(1).take(1).subscribe(newData => {
          assert.equal(newData.items[0].full_name, 'woah');

          assert.equal(
            wikiRequest, 1,
            `Expected requestCount to be 1 after restart, was ${wikiRequest}.`
          );

          setTimeout(() => {
            container.find('.search').click();

            restartedSinks.results$.skip(2).take(1).subscribe(newData => {

              assert.equal(
                wikiRequest, 2,
                `Expected requestCount to be 2 after more events performed post restart, was ${wikiRequest}.`
              );

              done();
            })
          }, 500);
        });
      });
    });
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
    .mergeAll()
    .pluck('text')
    .startWith({items: []})

  const searchTerm$ = DOM
    .select('.search')
    .events('click')
    .debounce(100)
    .map(ev => 'woah')

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
