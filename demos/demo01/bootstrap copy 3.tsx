import ReactMini from '@/index';

const App = () => {
  console.log('counter render');

  const [count, setCount] = ReactMini.useState(1);
  return (
    <div>
      <h1 onClick={() => setCount(2)}>Count: {count}</h1>
      <h2>123</h2>
    </div>
  );
};

const container = document.getElementById('root')!;
ReactMini.render(<App />, container);
