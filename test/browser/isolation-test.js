/* globals describe, it*/
import assert from 'assert';
import {setup} from '@cycle/run';
import {makeDOMDriver, div, button} from '@cycle/dom';
import isolate from '@cycle/isolate';

import {rerunner, restartable} from '../../src/restart';

import xs from 'xstream';

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
        .map(() => 1)

      const subtract$ = DOM
        .select('.subtract')
        .events('click')
        .map(() => -1);

      const count$ = xs
        .merge(add$, subtract$)
        .fold((total, change) => total + change, 0)

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
        DOM: xs
          .combine(counter1.DOM, counter2.DOM)
          .map(([counter1DOM, counter2DOM]) => (
            div('.app', [
              counter1DOM,
              counter2DOM
            ])
          )
        )
      };
    }

    let {container, selector} = makeTestContainer();

    const driversFn = () => ({
      DOM: restartable(makeDOMDriver(selector), {pauseSinksWhileReplaying: false})
    });

    const rerun = rerunner(setup, driversFn, isolate);

    rerun(main, () => {
      container = $(selector);
      container.find('.add')[1].click();
      container.find('.add')[1].click();
      container.find('.add')[1].click();

      assert.equal(container.text(), '0+-3+-');


      rerun(main, () => {
        container = $(selector);
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
