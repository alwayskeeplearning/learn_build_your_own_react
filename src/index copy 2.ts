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
    // 如果 fiber 被标记为删除，但是它没有dom节点（例如函数组件），
    // 我们需要找到它的第一个有dom节点的子节点并删除它。
    commitDeletion(fiber.child, domParent);
  }
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

  // =======================================================================
  // 步骤 2: Diffing 算法的核心
  // 将原来创建子 Fiber 的逻辑，替换为调用 reconcileChildren。
  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);
  // =======================================================================

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
