import ReactMini from '@/index';
// import React from 'react';
// import ReactDOM from 'react-dom/client';

function App() {
  const [count, setCount] = ReactMini.useState(0);
  const [text, setText] = ReactMini.useState('Hello');
  console.log('App render', count);

  // 这个 effect 没有依赖项，每次渲染都会执行
  ReactMini.useEffect(() => {
    // console.log('Effect ran: Document title updated');
    // document.title = `Count: ${count}, Text: ${text}`;
    setCount(2);
  });

  // // 这个 effect 只有 count 变化时才会执行
  // ReactMini.useEffect(() => {
  //   console.log(`Effect with [count] dep ran. New count: ${count}`);
  //   const intervalId = setInterval(() => {
  //     console.log(`Interval still running with count: ${count}`);
  //   }, 3000);

  //   // 返回一个清理函数
  //   return () => {
  //     console.log(`Cleanup for count: ${count}. Interval cleared.`);
  //     clearInterval(intervalId);
  //   };
  // }, [count]);

  return (
    <div>
      <h1 onClick={() => setCount(c => c + 1)}>Count: {count}</h1>
      <input value={text} onInput={(e: any) => setText((e.target as HTMLInputElement).value)} />
      <p>Text: {text}</p>
    </div>
  );
}

const container = document.getElementById('root')!;
ReactMini.render(<App />, container);
// const root = ReactDOM.createRoot(container);
// root.render(<App />);
