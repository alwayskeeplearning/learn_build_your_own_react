type RElement = {
  type: string;
  props: {
    [key: string]: any;
    children: RElement[];
  };
  dom: HTMLElement | Text | null;
  parent: RElement | null;
  child: RElement | null;
  sibling: RElement | null;
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

// 为了清晰并与我们的解释对应，我们创建一个类型别名。
// 在这个实现中，RElement 就扮演了 Fiber 的角色。
type Fiber = RElement;

const createDom = (fiber: Fiber) => {
  let dom: any;
  if (fiber.type === 'TEXT_ELEMENT') {
    dom = document.createTextNode('');
    dom.nodeValue = fiber.props.nodeValue;
  } else {
    dom = document.createElement(fiber.type);
    Object.keys(fiber.props)
      .filter(isProperty)
      .forEach(name => {
        dom[name] = fiber.props[name];
      });
  }
  return dom;
};

// 这是全局的“书签”，用来记住我们中断的地方。这就是调度器实现“记忆”的方式。
// 如果它是 null，意味着工作完成了。如果它有值，那就是下一个任务。
let nextUnitOfWork: Fiber | null = null;
// 我们需要一个变量来追踪我们正在构建的 Fiber 树的根节点，我们称之为“工作中的根” (work-in-progress root)。
let wipRoot: Fiber | null = null;
// “提交阶段”的入口函数
function commitRoot() {
  // 从根节点的第一个子节点开始，递归地将所有节点附加到 DOM
  commitWork(wipRoot!.child);
  // 提交完成后，重置 wipRoot，表示工作已完成
  wipRoot = null;
}

// 递归地将 Fiber 节点附加到 DOM
function commitWork(fiber: Fiber | null) {
  if (!fiber) {
    return;
  }

  // 向上遍历 fiber 树，找到一个有 dom 节点的父节点
  // (这是为了以后支持函数组件等没有 DOM 的 Fiber 节点)
  let domParentFiber = fiber.parent;
  while (domParentFiber && !domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber!.dom;

  // 将当前 fiber 的 dom 附加到父节点的 dom 上
  if (fiber.dom && domParent) {
    domParent.appendChild(fiber.dom);
  }

  // 递归处理子节点和兄弟节点
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function workLoop(deadline: IdleDeadline) {
  let shouldYield = false;
  // 循环会一直进行，只要还有工作要做并且我们没有被中断。
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    // 如果浏览器告诉我们时间快用完了，我们就应该让出控制权。
    shouldYield = deadline.timeRemaining() < 1;
  }

  // 当 `nextUnitOfWork` 变为 null 时，意味着“渲染阶段”已经全部完成。
  // 此时，我们就开始“提交阶段”。
  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }
  // 当浏览器再次空闲时，安排下一次循环。
  requestIdleCallback(workLoop);
}

// 我们启动一次循环，之后它会自我维持。
requestIdleCallback(workLoop);

/**
 * 这是 Fiber 架构的核心。它主要做三件事：
 * 1. 对当前 fiber 执行工作（例如，创建一个 DOM 节点）。
 * 2. 为当前 fiber 的子节点们创建新的 fiber。
 * 3. 确定下一个工作单元并返回它。
 */
function performUnitOfWork(fiber: Fiber): Fiber | null {
  // =======================================================================
  // 步骤 1: 对当前 FIBER 执行工作
  // 正如我们所解释的，第一个任务是为当前 Fiber 创建一个 DOM 节点
  // （如果它还没有的话）。
  // 这一步只是创建，还不会挂载到页面上。
  // =======================================================================
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  if (fiber.parent) {
    fiber.parent.dom?.appendChild(fiber.dom!);
  }
  // =======================================================================
  // 步骤 2: 为子节点创建新的 FIBER
  // 这对应于我们讨论的“即用即建”的 Fiber 创建方式。
  // 我们遍历原始的 `children` (来自 props)，并为每一个子元素创建一个新的 Fiber。
  // =======================================================================
  const elements = fiber.props.children;
  let index = 0;
  let prevSibling: Fiber | null = null;

  while (index < elements.length) {
    const element = elements[index];
    const newFiber: Fiber = {
      ...element, // 从 element 复制 type 和 props
      parent: fiber,
      dom: null,
    };

    if (index === 0) {
      // 第一个子节点是父 fiber 的 `child`。
      fiber.child = newFiber;
    } else if (prevSibling) {
      // 后续的子节点是第一个子节点的 `sibling`，形成一个兄弟链表。
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }

  // =======================================================================
  // 步骤 3: 返回下一个工作单元
  // 这对应于我们讨论过的用于寻找下一个工作任务的深度优先遍历逻辑。
  // =======================================================================

  // 1. 首先，尝试向下移动到刚刚创建的子节点。
  if (fiber.child) {
    return fiber.child;
  }

  // 2. 如果没有子节点，就尝试同一层的兄弟节点。
  let nextFiber: Fiber | null = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    // 3. 如果连兄弟节点也没有，就返回父节点，然后寻找父节点的兄弟节点（“叔叔”节点）。
    //    这个过程会一直持续，直到找到一个兄弟节点或者回到根节点完成所有工作。
    nextFiber = nextFiber.parent!;
  }

  // 如果代码运行到这里，意味着遍历完成了，没有下一个工作了。
  return null;
}

const render = (element: RElement, container: HTMLElement) => {
  // 新的 render 函数本身不再执行工作。
  // 它只是配置好 Fiber 树的根节点，并设置好第一个工作单元。
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    child: null,
    parent: null,
    sibling: null,
    type: container.tagName,
  };
  console.log('render', wipRoot);

  nextUnitOfWork = wipRoot;
};

const ReactMini = {
  createElement,
  render,
};

export default ReactMini;
