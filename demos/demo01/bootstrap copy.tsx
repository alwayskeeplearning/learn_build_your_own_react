import ReactMini from '@/index';

// 1. 定义初始状态的 Element
const element = (
  <div style="background: salmon">
    <h1>Hello World</h1>
    <h2 style="text-align: right">from Didact</h2>
    <h3 style="text-align: right">from Didact1111</h3>
  </div>
);
const container = document.getElementById('root')!;
// 2. 首次渲染
ReactMini.render(element, container);

// 3. 定义更新后的 Element，这里我们改变了 div 的背景色，并替换了 h1
const updatedElement = (
  <div style="background: lightblue">
    <p>Hello Reconciliation</p>
    <h2 style="text-align: right">from Didact</h2>
  </div>
);

// 4. 使用 setTimeout 模拟在 2 秒后发生一次更新
setTimeout(() => {
  console.log('开始更新...');
  ReactMini.render(updatedElement, container);
}, 5000);
