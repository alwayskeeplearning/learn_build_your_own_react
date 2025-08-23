import ReactMini from '@/index';

const Child = (props: { name: string }) => {
  return (
    <div>
      <h1>Hi,{props.name}</h1>
      <p>123</p>
    </div>
  );
};
const App = () => {
  return <Child name="foo" />;
};

const container = document.getElementById('root')!;
ReactMini.render(<App />, container);
