import {div, button} from '@cycle/dom';
import xs from 'xstream'

function main (sources) {
  const add$ = sources.DOM
    .select('.add')
    .events('click')
    .mapTo(+1)

  const subtract$ = sources.DOM
    .select('.subtract')
    .events('click')
    .mapTo(-1)

  const change$ = xs.merge(
    add$,
    subtract$
  );

  const count$ = change$.fold((acc, val) => acc + val, 0);
  const history$ = change$.fold((acc, val) => acc.concat(val), []);

  return {
    DOM: xs.combine(count$, history$).map(([count, history]) => (
      div('.counter', [
        div('.count', `Count: ${count}`),
        button('.add', 'Add'),
        button('.subtract', 'Subtract'),
        div(`History: ${history}`)
      ])
    ))
  }
}

export default main;
