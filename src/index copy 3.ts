type RElement = {
  // 步骤 1: 扩展 type 的定义，使其可以是一个函数
  type: string | ((props: Record<string, any>) => RElement);
  props: {
    [key: string]: any;
    children: RElement[];
  };
  dom: HTMLElement | Text | null;
  parent: RElement | null;
  child: RElement | null;
  sibling: RElement | null;
  // 新增 alternate 属性，用于连接新旧 Fiber 节点
  alternate: RElement | null;
  // 新增 effectTag 属性，用于标记“提交阶段”需要执行的 DOM 操作
  effectTag?: 'PLACEMENT' | 'UPDATE' | 'DELETION';
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

// 判断是否是属性
const isProperty = (key: string) => key !== 'children' && key !== '__source' && key !== '__self';
// 判断是否是事件
const isEvent = (key: string) => key.startsWith('on');
// 判断是否是已经不存在的属性
const isGone = (prev: Record<string, any>, next: Record<string, any>) => (key: string) => !(key in next);
// 判断是否是新的属性
const isNew = (prev: Record<string, any>, next: Record<string, any>) => (key: string) => prev[key] !== next[key];

// =======================================================================
// 步骤 5 (更新): 升级 DOM 操作函数
// 这个函数现在不仅能设置属性，还能比较新旧 props，
// 并对属性和事件监听器进行新增、更新或删除。
// =======================================================================
function updateDom(dom: HTMLElement | Text, prevProps: Record<string, any>, nextProps: Record<string, any>) {
  // 1. 移除旧的或者变化的事件监听器
  Object.keys(prevProps)
    .filter(isEvent)
    .filter(key => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach(name => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // 2. 移除已经不存在的属性
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach(name => {
      // @ts-expect-error dom 是 HTMLElement | Text
      dom[name] = '';
    });

  // 3. 设置新的或者变化的属性
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => {
      // @ts-expect-error dom 是 HTMLElement | Text
      dom[name] = nextProps[name];
    });

  // 4. 添加新的事件监听器
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

// 为了清晰并与我们的解释对应，我们创建一个类型别名。
// 在这个实现中，RElement 就扮演了 Fiber 的角色。
type Fiber = RElement;

const createDom = (fiber: Fiber) => {
  let dom: any;
  if (fiber.type === 'TEXT_ELEMENT') {
    dom = document.createTextNode('');
    dom.nodeValue = fiber.props.nodeValue;
  } else {
    dom = document.createElement(fiber.type as any);
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
// =======================================================================
// 步骤 2: 引入“当前树”和“待删除节点”的概念
// `currentRoot` 持有上一次成功提交到 DOM 的 Fiber 树。
let currentRoot: Fiber | null = null;
// `deletions` 数组用于追踪所有需要被删除的旧 Fiber 节点。
let deletions: Fiber[] = [];
// =======================================================================
// “提交阶段”的入口函数
function commitRoot() {
  // =======================================================================
  // 步骤 5 (更新): 升级提交逻辑
  // 先处理所有标记为 DELETION 的节点。
  deletions.forEach(commitWork);
  // =======================================================================
  // 从根节点的第一个子节点开始，递归地将所有节点附加到 DOM
  commitWork(wipRoot!.child);
  // =======================================================================
  // 步骤 2 (更新): 提交完成后，将 wipRoot 设为 currentRoot
  currentRoot = wipRoot;
  // =======================================================================
  // 提交完成后，重置 wipRoot，表示工作已完成

  wipRoot = null;
}

function commitDeletion(fiber: Fiber, domParent: HTMLElement | Text) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else if (fiber.child) {
    // 步骤 4: 升级删除逻辑，以处理没有 DOM 的 Fiber 节点
    // 如果要删除的 Fiber 没有 dom，我们需要继续向下寻找它真正的子级 DOM 并删除
    commitDeletion(fiber.child, domParent);
  }
}

// 递归地将 Fiber 节点附加到 DOM
function commitWork(fiber: Fiber | null) {
  if (!fiber) {
    return;
  }

  // 步骤 4: 升级“寻找父 DOM”的逻辑
  let domParentFiber = fiber.parent;
  while (domParentFiber && !domParentFiber.dom) {
    // 向上“穿透”所有没有 DOM 的 Fiber，直到找到一个真实的 DOM 父节点
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber!.dom;

  // =======================================================================
  // 步骤 5 (更新): 根据 effectTag 执行不同的 DOM 操作
  if (fiber.effectTag === 'PLACEMENT' && fiber.dom != null) {
    // 为了找到正确的插入位置，我们需要找到新增节点之后、在 DOM 树中真实存在的第一个兄弟节点作为“锚点”。
    // 我们在新 Fiber 树上向后查找兄弟节点。
    let nextSiblingFiber = fiber.sibling;
    let anchor: Node | null = null;
    while (nextSiblingFiber) {
      // 我们只关心那些不是新增的节点，因为它们已经存在于 DOM 中，可以作为有效的锚点。
      if (nextSiblingFiber.dom && nextSiblingFiber.effectTag !== 'PLACEMENT') {
        anchor = nextSiblingFiber.dom;
        break;
      }
      nextSiblingFiber = nextSiblingFiber.sibling;
    }
    // insertBefore 的第二个参数如果为 null，其行为就和 appendChild 完全一样。
    // 这优雅地处理了插入到末尾的情况。
    domParent!.insertBefore(fiber.dom, anchor);
  } else if (fiber.effectTag === 'UPDATE' && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate!.props, fiber.props);
  } else if (fiber.effectTag === 'DELETION') {
    commitDeletion(fiber, domParent!);
    // 删除节点后，我们不能再处理它的子节点或兄弟节点。
    return;
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
    console.log('commitRoot', wipRoot);
    commitRoot();
  }
  // 当浏览器再次空闲时，安排下一次循环。
  requestIdleCallback(workLoop);
}

// 我们启动一次循环，之后它会自我维持。
requestIdleCallback(workLoop);

// =======================================================================
// 步骤 3: 重构 performUnitOfWork
// =======================================================================
function performUnitOfWork(fiber: Fiber): Fiber | null {
  const isFunctionComponent = fiber.type instanceof Function;

  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  // 返回下一个工作单元的逻辑保持不变
  if (fiber.child) {
    return fiber.child;
  }

  let nextFiber: Fiber | null = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent!;
  }

  return null;
}

// 专门处理原生 DOM 元素的函数
function updateHostComponent(fiber: Fiber) {
  // 这部分就是之前 performUnitOfWork 的主要逻辑
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);
}

// =======================================================================
// 步骤 2: 实现 updateFunctionComponent
// =======================================================================
function updateFunctionComponent(fiber: Fiber) {
  // 1. 获取组件函数并执行它，传入 props
  const component = fiber.type as (props: Record<string, any>) => RElement;
  const children = [component(fiber.props)]; // 返回值就是子元素，包装成数组

  // 2. 对返回的子元素进行协调
  reconcileChildren(fiber, children);
}

// =======================================================================
// 步骤 3 (实现): `reconcileChildren` 函数
// 这是 diff 算法的核心，它比较新旧子节点，并为差异打上 effectTag。
// =======================================================================
function reconcileChildren(wipFiber: Fiber, elements: RElement[]) {
  let index = 0;
  // 获取旧 Fiber 树中对应的子节点链表的头节点
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling: Fiber | null = null;
  // 同时遍历新子元素数组和旧子 Fiber 链表
  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber: Fiber | null = null;

    // 比较新旧节点的类型是否相同
    const sameType = oldFiber && element && element.type === oldFiber.type;

    if (sameType) {
      // -------------------------------------------------
      // 类型相同，认为是“更新” (UPDATE)
      // -------------------------------------------------
      newFiber = {
        type: oldFiber!.type,
        props: element.props,
        dom: oldFiber!.dom, // 复用旧的 DOM 节点
        parent: wipFiber,
        alternate: oldFiber!, // 连接到旧 Fiber
        effectTag: 'UPDATE',
      } as RElement;
    }
    if (!sameType && element) {
      // -------------------------------------------------
      // 类型不同，且有新元素，认为是“新增” (PLACEMENT)
      // -------------------------------------------------
      newFiber = {
        ...element,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: 'PLACEMENT',
      };
    }
    if (!sameType && oldFiber) {
      // -------------------------------------------------
      // 类型不同，且有旧 Fiber，认为是“删除” (DELETION)
      // -------------------------------------------------
      oldFiber.effectTag = 'DELETION';
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling; // 移动旧 Fiber 链表的指针
    }

    // 将新创建的 Fiber 连接到 Fiber 树中
    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element && prevSibling) {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
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
    // =======================================================================
    // 步骤 2 (更新): 将 wipRoot 的 alternate 指向上一次的 currentRoot
    alternate: currentRoot,
    // =======================================================================
  };
  // =======================================================================
  // 步骤 2 (更新): 每次渲染开始时，清空 deletions 数组
  deletions = [];
  // =======================================================================
  nextUnitOfWork = wipRoot;
};

const ReactMini = {
  createElement,
  render,
};

export default ReactMini;
