/* eslint-disable react/no-deprecated */
/* eslint-disable @typescript-eslint/no-explicit-any */
function createElement(type: string, props: any, ...children: any[]) {
  return {
    type,
    props: {
      ...props,
      children: children.map(child => (typeof child === 'object' ? child : createTextElement(child))),
    },
  };
}

function createTextElement(text: string) {
  return {
    type: 'TEXT_ELEMENT' as const,
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

function render(element: any, container: any) {
  const dom = element.type == 'TEXT_ELEMENT' ? document.createTextNode('') : document.createElement(element.type);
  const isProperty = (key: string) => key !== 'children';
  Object.keys(element.props)
    .filter(isProperty)
    .forEach(name => {
      dom[name] = element.props[name];
    });
  element.props.children.forEach((child: any) => render(child, dom));
  container.appendChild(dom);
}

const Didact = {
  createElement,
  render,
};

/** @jsx Didact.createElement */
const element = (
  <div style={{ background: 'salmon' }}>
    <h1>Hello World</h1>
    <h2 style={{ textAlign: 'right' }}>from Didact</h2>
  </div>
);
const container = document.getElementById('root');
Didact.render(element, container);
