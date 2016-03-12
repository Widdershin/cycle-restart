/* globals describe, it*/
import assert from 'assert';
import {run} from '@cycle/core';
import {makeDOMDriver, div, button} from '@cycle/dom';
import isolate from '@cycle/isolate';

import {rerunner, restartable} from '../../src/restart';

import {Observable} from 'rx';

import $ from 'jquery';

let testContainerCount = 1000;

function makeTestContainer () {
  const selector = 'test-' + testContainerCount;
  const container = $(`<div class="${selector}">`);

  $(document.body).append(container);

  testContainerCount++;

  return {container, selector: '.' + selector};
}

describe('scoped components', () => {
  it('works', (done) => {
    function Counter ({DOM}) {
      const add$ = DOM
        .select('.add')
        .events('click')
        .map(() => 1);

      const subtract$ = DOM
        .select('.subtract')
        .events('click')
        .map(() => -1);

      const count$ = add$.merge(subtract$)
        .scan((total, change) => total + change)
        .startWith(0);

      return {
        DOM: count$.map(count =>
          div('.app', [
            div('.count', count.toString()),
            button('.add', '+'),
            button('.subtract', '-')
          ])
        )
      };
    }

    function main ({DOM}) {
      const counter1 = isolate(Counter)({DOM});
      const counter2 = isolate(Counter)({DOM});

      return {
        DOM: Observable.combineLatest(
          counter1.DOM,
          counter2.DOM,
          (counter1DOM, counter2DOM) => (
            div('.app', [
              counter1DOM,
              counter2DOM
            ])
          )
        )
      };
    }

    const {container, selector} = makeTestContainer();

    const drivers = {
      DOM: restartable(makeDOMDriver(selector), {pauseSinksWhileReplaying: false})
    };

    let rerun = rerunner(run, isolate);
    rerun(main, drivers);

    setTimeout(() => {
      container.find('.add')[1].click();
      container.find('.add')[1].click();
      container.find('.add')[1].click();

      assert.equal(container.text(), '0+-3+-');

      rerun(main, drivers);

      setTimeout(() => {
        assert.equal(container.text(), '0+-3+-');

        container.find('.add')[1].click();
        container.find('.add')[1].click();
        container.find('.add')[1].click();

        assert.equal(container.text(), '0+-6+-');

        container.remove();
        done();
      });
    });
  });
});
