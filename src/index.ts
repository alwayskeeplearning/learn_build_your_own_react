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
  // 步骤 1: 在 Fiber 上添加 hooks 数组，用于存储 hook 数据
  hooks?: any[];
  // 步骤 1: 增加 effectCallbacks 属性，用于暂存 effect
  effectCallbacks?: {
    callback: () => void | (() => void);
    hook: any;
  }[];
};

type Fiber = RElement;

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

// 步骤 1: 简化 createDom，让它只负责创建节点，不设置属性
const createDom = (fiber: Fiber) => {
  const dom = fiber.type === 'TEXT_ELEMENT' ? document.createTextNode('') : document.createElement(fiber.type as string);

  // 所有属性设置逻辑都移到 commitWork 中，这样可以确保副作用只在 commit 阶段发生
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
// 步骤 2: 引入全局指针，用于 Hooks
// wipFiber 指向当前正在工作的函数组件 Fiber
let wipFiber: Fiber | null = null;
// hookIndex 记录当前正在处理的 hook 的索引
let hookIndex: number = 0;
// =======================================================================
let commitCounter = 0;

// “提交阶段”的入口函数
function commitRoot() {
  // =======================================================================
  // 步骤 5 (更新): 升级提交逻辑
  // 先处理所有标记为 DELETION 的节点。
  deletions.forEach(commitWork);
  // =======================================================================
  // 从根节点的第一个子节点开始，递归地将所有节点附加到 DOM
  commitWork(wipRoot!.child);
  console.log(`Commit ${++commitCounter} 结束，执行 effect`);

  // =======================================================================
  // 步骤 2 (更新): 提交完成后，将 wipRoot 设为 currentRoot
  currentRoot = wipRoot;

  // =======================================================================
  // 提交完成后，重置 wipRoot，表示工作已完成
  wipRoot = null;
}

// 新增：递归执行 effect 的函数
function executeEffects(fiber: Fiber) {
  if (!fiber) return;

  // React 遵循子 -> 父的顺序执行 effect
  // 所以我们先递归处理子孙节点
  executeEffects(fiber.child!);
  executeEffects(fiber.sibling!);

  // 再处理当前节点
  if (fiber.effectCallbacks) {
    fiber.effectCallbacks.forEach(effect => {
      // 在执行新的 effect 之前，先执行上一次的 cleanup
      if (effect.hook.cleanup) {
        effect.hook.cleanup();
      }
      // 执行新的 effect，并把可能返回的 cleanup 函数存起来
      const cleanup = effect.callback();
      if (typeof cleanup === 'function') {
        effect.hook.cleanup = cleanup;
      }
    });
    // 清空待办事项
    fiber.effectCallbacks = [];
  }
}

// 步骤 4: 改造 commitDeletion，增加清理逻辑
function commitDeletion(fiber: Fiber, domParent: HTMLElement | Text) {
  // 当一个节点被删除时，执行其自身及所有子孙节点的 cleanup 函数
  let node: Fiber | null = fiber;
  while (node) {
    if (node.hooks) {
      node.hooks.forEach(hook => {
        if (hook.cleanup) {
          hook.cleanup();
        }
      });
    }
    if (node.child) {
      node = node.child;
      continue;
    }
    while (node) {
      if (node === fiber) return; // Traversal complete
      if (node.sibling) {
        node = node.sibling;
        break;
      }
      node = node.parent;
    }
  }

  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else if (fiber.child) {
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
    // 步骤 2 & 3: 对于新增的节点，在挂载前，先用 updateDom 设置好所有初始属性和事件
    updateDom(fiber.dom, { children: [] }, fiber.props);

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
    // 步骤 3: 在所有 DOM 操作完成后，执行所有收集到的 effect
    executeEffects(currentRoot!);
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
// 步骤 4: 改造 updateFunctionComponent
// =======================================================================
function updateFunctionComponent(fiber: Fiber) {
  // --- 准备工作 ---
  wipFiber = fiber;
  wipFiber.hooks = []; // 初始化 hooks 数组
  hookIndex = 0; // 重置 hook 索引

  // --- 执行组件函数 ---
  // 组件内部对 useState 的调用会在这里发生
  const component = fiber.type as (props: Record<string, any>) => RElement;
  const children = [component(fiber.props)];

  // --- 收尾工作 ---
  reconcileChildren(fiber, children);
}

// =======================================================================
// 步骤 2: 实现 useEffect 函数
// =======================================================================
// 辅助函数：比较依赖项是否变化
function hasDepsChanged(prevDeps?: any[], nextDeps?: any[]): boolean {
  if (!prevDeps) return true; // 第一次执行
  if (!nextDeps) return true; // 如果不提供依赖数组，每次都执行
  if (prevDeps.length !== nextDeps.length) return true;

  // 逐一比较依赖项
  for (let i = 0; i < prevDeps.length; i++) {
    if (!Object.is(prevDeps[i], nextDeps[i])) {
      return true;
    }
  }
  return false;
}

function useEffect(callback: () => void | (() => void), deps?: any[]) {
  // 1. 拿到上一次的 hook 数据
  const oldHook = wipFiber?.alternate?.hooks?.[hookIndex];

  // 2. 比较依赖项，判断 effect 是否需要执行
  const hasChanged = hasDepsChanged(oldHook?.deps, deps);

  const newHook = {
    deps,
    cleanup: oldHook ? oldHook.cleanup : undefined,
  };

  if (hasChanged) {
    // 如果需要执行，将 callback 暂存到 Fiber 的 effectCallbacks 数组中
    if (!wipFiber!.effectCallbacks) {
      wipFiber!.effectCallbacks = [];
    }
    wipFiber!.effectCallbacks.push({
      callback,
      hook: newHook,
    });
  }

  // 3. 将新的 hook 推入 hooks 数组，移动指针
  wipFiber!.hooks!.push(newHook);
  hookIndex++;
}

function useState<T>(initial: T): [T, (action: T | ((prevState: T) => T)) => void] {
  // 1. 尝试获取上一次渲染时的 hook 数据
  const oldHook = wipFiber?.alternate?.hooks?.[hookIndex];

  // 2. 创建新的 hook 对象，如果存在旧 hook，则从旧 hook 继承状态
  const hook: {
    state: T;
    queue: (T | ((prevState: T) => T))[];
  } = {
    state: oldHook ? oldHook.state : initial,
    queue: [], // 新 hook 的 action 队列总是空的
  };

  // 3. 执行旧 hook 队列中的所有 action 来计算最新状态
  const actions = oldHook ? oldHook.queue : [];

  actions.forEach((action: T | ((prevState: T) => T)) => {
    // 正确处理两种类型的 action
    if (typeof action === 'function') {
      hook.state = (action as (prevState: T) => T)(hook.state);
    } else {
      hook.state = action;
    }
  });

  // 4. 定义 setState 函数
  const setState = (action: T | ((prevState: T) => T)) => {
    // 【新增】步骤 a: 预计算出新的状态值
    const oldState = hook.state;
    let newState;
    if (typeof action === 'function') {
      newState = (action as (prevState: T) => T)(oldState);
    } else {
      newState = action;
    }

    // 【新增】步骤 b: 比较新旧状态
    if (Object.is(oldState, newState)) {
      // 如果状态没有变化，就直接返回，不安排任何更新！
      console.log('状态未改变，Bail out!');
      return;
    }

    // 步骤 c: 只有在状态确实改变时，才推入队列并安排渲染
    hook.queue.push(action);

    // b. 触发一次新的渲染
    wipRoot = {
      dom: currentRoot!.dom,
      props: currentRoot!.props,
      alternate: currentRoot,
    } as Fiber;
    nextUnitOfWork = wipRoot;
    deletions = [];
  };

  // 5. 将新创建的 hook 推入当前 Fiber 的 hooks 数组
  wipFiber!.hooks!.push(hook);
  // 6. hook 索引递增
  hookIndex++;

  // 7. 返回最新状态和 setState 函数
  return [hook.state, setState];
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
  // 步骤 5: 导出 useState
  useState,
  // 步骤 5: 导出 useEffect
  useEffect,
};

export default ReactMini;
