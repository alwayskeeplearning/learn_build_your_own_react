import ReactMini from '@/index';

const element = (
  <div style={{ background: 'salmon' }}>
    <h1>Hello World</h1>
    <h2 style={{ textAlign: 'right' }}>from Didact</h2>
  </div>
);
const container = document.getElementById('root')!;
console.log(element);
ReactMini.render(element, container);
