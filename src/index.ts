type RElement = {
  type: string;
  props: {
    [key: string]: any;
    children: RElement[];
  };
};

const createElement = (type: string, props: Record<string, any>, ...children: RElement[]) => {
  return {
    type,
    props: {
      ...props,
      children: children.map(child => (typeof child === 'object' ? child : createTextElement(child))),
    },
  };
};

const createTextElement = (text: string) => {
  return {
    type: 'TEXT_ELEMENT' as const,
    props: {
      nodeValue: text,
      children: [],
    },
  };
};

const isProperty = (key: string) => key !== 'children' && key !== '__source' && key !== '__self';

const render = (element: RElement, container: HTMLElement) => {
  let dom: any;
  if (element.type === 'TEXT_ELEMENT') {
    dom = document.createTextNode('');
    dom.nodeValue = element.props.nodeValue;
  } else {
    dom = document.createElement(element.type);
    Object.keys(element.props)
      .filter(isProperty)
      .forEach(name => {
        dom[name] = element.props[name];
      });
    element.props.children.forEach((child: RElement) => render(child, dom));
  }
  container.appendChild(dom);
};

const ReactMini = {
  createElement,
  render,
};

export default ReactMini;
