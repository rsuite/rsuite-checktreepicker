// @flow

import * as React from 'react';
import classNames from 'classnames';
import { toggleClass, hasClass } from 'dom-lib';
import { findDOMNode } from 'react-dom';
import OverlayTrigger from 'rsuite-utils/lib/Overlay/OverlayTrigger';
import _ from 'lodash';
import {
  reactToString,
  getUnhandledProps,
  prefix,
  createChainedFunction,
  shallowEqual,
  shallowEqualArray,
  tplTransform,
} from 'rsuite-utils/lib/utils';

import {
  SearchBar,
  Toggle,
  MenuWrapper,
  constants,
} from 'rsuite-utils/lib/Picker';
import CheckTreeNode from './CheckTreeNode';
import { CHECK_STATE } from './constants';
import { clone, onMenuKeyDown, createConcatChildrenFunction } from './utils';

const { namespace } = constants;

type DefaultEvent = SyntheticEvent<*>;
type Placement =
  | 'bottomLeft'
  | 'bottomRight'
  | 'topLeft'
  | 'topRight'
  | 'leftTop'
  | 'rightTop'
  | 'leftBottom'
  | 'rightBottom'
  | 'auto'
  | 'autoVerticalLeft'
  | 'autoVerticalRight'
  | 'autoHorizontalTop'
  | 'autoHorizontalBottom';

type Props = {
  data: any[],
  open?: boolean,
  block?: boolean,
  style?: Object,
  value?: any[],
  height?: number,
  inline?: boolean,
  locale: Object,
  cascade: boolean,
  disabled?: boolean,
  valueKey: string,
  labelKey: string,
  container?: HTMLElement | (() => HTMLElement),
  className?: string,
  cleanable?: boolean,
  countable?: boolean,
  expandAll?: boolean,
  placement?: Placement,
  searchable?: boolean,
  appearance: 'default' | 'subtle',
  classPrefix: string,
  defaultOpen?: boolean,
  childrenKey?: string,
  placeholder?: React.Node,
  defaultValue?: any[],
  searchKeyword?: string,
  menuStyle?: Object,
  menuClassName?: string,
  menuAutoWidth?: boolean,
  defaultExpandAll?: boolean,
  containerPadding?: number,
  disabledItemValues?: any[],
  uncheckableItemValues?: any[],
  toggleComponentClass?: React.ElementType,
  // 禁用 checkbox 数组
  onOpen?: () => void,
  onExit?: () => void,
  onEnter?: () => void,
  onClose?: () => void,
  onHide?: () => void,
  onSearch?: (searchKeyword: string, event: DefaultEvent) => void,
  onChange?: (values: any) => void,
  onExpand?: (
    activeNode: any,
    labyer: number,
    concat: (data: any[], children: any[]) => any[],
  ) => void,
  onSelect?: (activeNode: any, layer: number, values: any) => void,
  onScroll?: (event: DefaultEvent) => void,
  onExited?: () => void,
  onEntered?: () => void,
  onExiting?: () => void,
  onEntering?: () => void,
  renderMenu?: (menu: string | React.Node) => React.Node,
  renderValue?: (
    value: any[],
    selectedItems: any[],
    selectedElement?: React.Node,
  ) => React.Node,
  renderTreeNode?: (nodeData: Object) => React.Node,
  renderTreeIcon?: (nodeData: Object) => React.Node,
  renderExtraFooter?: () => React.Node,
};

type States = {
  data: any[],
  value?: any[],
  cascade: boolean,
  hasValue: boolean,
  expandAll?: boolean,
  filterData: any[],
  activeNode?: ?Object,
  searchKeyword?: string,
  formattedNodes: any[],
  selectedValues: any[],
  uncheckableItemValues?: any[],
  isSomeNodeHasChildren: boolean,
  active?: boolean,
};

class CheckTree extends React.Component<Props, States> {
  static defaultProps = {
    locale: {
      placeholder: 'Select',
      searchPlaceholder: 'Search',
      noResultsText: 'No results found',
      selectedValues: '{0} selected',
    },
    cascade: true,
    valueKey: 'value',
    labelKey: 'label',
    cleanable: true,
    countable: true,
    placement: 'bottomLeft',
    appearance: 'default',
    searchable: true,
    classPrefix: `${namespace}-checktree`,
    menuAutoWidth: true,
    defaultValue: [],
    childrenKey: 'children',
    uncheckableItemValues: [],
  };
  constructor(props: Props) {
    super(props);
    const { value, data } = props;
    this.nodes = {};
    this.isControlled = !_.isUndefined(value);

    const keyword = this.getSearchKeyword(props);
    const nextValue = this.getValue(props);
    const nextData = [...data];
    this.flattenNodes(nextData, props);
    this.unserializeLists(
      {
        check: nextValue,
      },
      props,
    );

    this.state = {
      data: props.data,
      value: props.value,
      cascade: props.cascade,
      hasValue: this.hasValue(nextValue, props),
      expandAll: this.getExpandAll(props),
      filterData: this.getFilterData(keyword, nextData, props),
      searchKeyword: keyword,
      selectedValues: nextValue,
      formattedNodes: [],
      uncheckableItemValues: props.uncheckableItemValues,
      isSomeNodeHasChildren: this.isSomeNodeHasChildren(
        props.data,
        props.childrenKey,
      ),
    };
  }

  componentWillReceiveProps(nextProps: Props) {
    const { filterData, searchKeyword, selectedValues } = this.state;
    const {
      value,
      data,
      cascade,
      expandAll,
      uncheckableItemValues,
    } = nextProps;

    if (!shallowEqualArray(this.props.data, data)) {
      const nextData = clone(data);
      this.flattenNodes(nextData);
      this.unserializeLists({
        check: nextProps.value,
      });
      this.setState({
        data,
        filterData: this.getFilterData(searchKeyword, nextData),
        isSomeNodeHasChildren: this.isSomeNodeHasChildren(nextData),
        hasValue: this.hasValue(),
      });
    }
    if (!shallowEqualArray(value, this.props.value)) {
      const nextState = {
        selectedValues: value,
        hasValue: this.hasValue(value),
        activeNode: this.activeNode,
      };

      if (!value.length) {
        nextState.activeNode = null;
      }
      this.unserializeLists({
        check: nextProps.value,
      });
      this.setState(nextState);
    }

    if (
      _.isArray(uncheckableItemValues) &&
      !shallowEqualArray(
        this.props.uncheckableItemValues,
        uncheckableItemValues,
      )
    ) {
      this.flattenNodes(filterData);
      this.unserializeLists({
        check: selectedValues,
      });

      this.setState({
        hasValue: this.hasValue(),
      });
    }

    // cascade 改变时，重新初始化
    if (cascade !== this.props.cascade && cascade) {
      this.flattenNodes(this.state.data);
      this.unserializeLists(
        {
          check: selectedValues,
        },
        nextProps,
      );
    }

    if (nextProps.searchKeyword !== this.props.searchKeyword) {
      this.setState({
        data: this.getFilterData(nextProps.searchKeyword, this.state.data),
        searchKeyword: nextProps.searchKeyword,
      });
    }

    if (expandAll !== this.props.expandAll) {
      this.setState({
        expandAll,
      });
    }
  }

  getExpandAll(props: Props = this.props) {
    return props.expandAll !== undefined
      ? props.expandAll
      : props.defaultExpandAll;
  }

  getValue = (props: Props = this.props) => {
    const { value, defaultValue, uncheckableItemValues = [] } = props;
    if (value && value.length) {
      return value.filter(v => !uncheckableItemValues.includes(v));
    }
    if (defaultValue && defaultValue.length > 0) {
      return defaultValue.filter(v => !uncheckableItemValues.includes(v));
    }
    return [];
  };

  getSearchKeyword(props: Props = this.props) {
    const { searchKeyword } = props;
    return !_.isUndefined(searchKeyword) ? searchKeyword : '';
  }

  getNodeCheckState(node: Object, cascade: boolean) {
    const { childrenKey } = this.props;
    if (!node[childrenKey] || !node[childrenKey].length || !cascade) {
      this.nodes[node.refKey].checkAll = false;
      return node.check ? CHECK_STATE.CHECK : CHECK_STATE.UNCHECK;
    }

    if (this.isEveryChildChecked(node)) {
      this.nodes[node.refKey].checkAll = true;
      return CHECK_STATE.CHECK;
    }

    if (this.isSomeChildChecked(node)) {
      this.nodes[node.refKey].checkAll = false;
      return CHECK_STATE.INDETERMINATE;
    }

    return CHECK_STATE.UNCHECK;
  }

  getExpandState(node: Object, props: Props = this.props) {
    const expandAll = this.getExpandAll(props);
    const { childrenKey } = props;
    if (node[childrenKey] && node[childrenKey].length) {
      if ('expand' in node) {
        return !!node.expand;
      } else if (expandAll) {
        return true;
      }
      return false;
    }
    return false;
  }

  getFilterData(
    searchKeyword: string = '',
    data: any[],
    props?: Props = this.props,
  ) {
    const { labelKey, childrenKey } = props;
    const setVisible = (nodes = []) =>
      nodes.forEach((item: Object) => {
        item.visible = this.shouldDisplay(item[labelKey], searchKeyword);
        if (_.isArray(item[childrenKey])) {
          setVisible(item[childrenKey]);
          item[childrenKey].forEach((child: Object) => {
            if (child.visible) {
              item.visible = child.visible;
            }
          });
        }
      });

    setVisible(data);
    return data;
  }

  getActiveElementOption(options: any[], refKey: string) {
    const { childrenKey } = this.props;
    for (let i = 0; i < options.length; i += 1) {
      if (options[i].refKey === refKey) {
        return options[i];
      } else if (options[i][childrenKey] && options[i][childrenKey].length) {
        let active = this.getActiveElementOption(
          options[i][childrenKey],
          refKey,
        );
        if (!_.isEmpty(active)) {
          return active;
        }
      }
    }
    return {};
  }

  getElementByDataKey = (dataKey: string) => {
    const ele = findDOMNode(this.nodeRefs[dataKey]);
    if (ele instanceof Element) {
      return ele.querySelector('.rs-picker-checktree-view-checknode-label');
    }
    return null;
  };

  getFormattedNodes(nodes: any[]) {
    const { childrenKey } = this.props;
    return nodes.map((node: Object) => {
      const formatted = { ...node };
      const curNode = this.nodes[node.refKey];
      if (curNode) {
        formatted.check = curNode.check;
        formatted.expand = curNode.expand;
        formatted.uncheckable = curNode.uncheckable;
        formatted.parentNode = curNode.parentNode;
        if (Array.isArray(node[childrenKey]) && node[childrenKey].length > 0) {
          formatted[childrenKey] = this.getFormattedNodes(
            formatted[childrenKey],
          );
        }
      }

      return formatted;
    });
  }

  /**
   * 获取每个节点的disable状态
   * @param {*} node
   */
  getDisabledState(node: Object) {
    const { disabledItemValues = [], valueKey } = this.props;
    return disabledItemValues.some((value: any) =>
      shallowEqual(this.nodes[node.refKey][valueKey], value),
    );
  }

  /**
   * 获取节点的是否需要隐藏checkbox
   * @param {*} node
   */
  getUncheckableState(node: Object) {
    const { uncheckableItemValues = [], valueKey } = this.props;
    return uncheckableItemValues.some((value: any) =>
      shallowEqual(node[valueKey], value),
    );
  }

  getFocusableMenuItems = () => {
    const { filterData } = this.state;
    const { childrenKey } = this.props;

    let items = [];
    const loop = (treeNodes: any[]) => {
      treeNodes.forEach((node: Object) => {
        if (
          !this.getDisabledState(node) &&
          !this.getUncheckableState(node) &&
          node.visible
        ) {
          items.push(node);
          const nodeData = { ...node, ...this.nodes[node.refKey] };
          if (!this.getExpandState(nodeData)) {
            return;
          }
          if (node[childrenKey]) {
            loop(node[childrenKey]);
          }
        }
      });
    };

    loop(filterData);
    return items;
  };

  getItemsAndActiveIndex() {
    const items = this.getFocusableMenuItems();

    let activeIndex = -1;
    items.forEach((item, index) => {
      if (document.activeElement !== null) {
        if (item.refKey === document.activeElement.getAttribute('data-key')) {
          activeIndex = index;
        }
      }
    });
    return { items, activeIndex };
  }

  getActiveItem() {
    const { data } = this.props;
    const activeItem = document.activeElement;
    if (activeItem !== null) {
      const { key, layer } = activeItem.dataset;
      const nodeData: Object = this.getActiveElementOption(data, key);
      nodeData.check = !this.nodes[nodeData.refKey].check;
      return {
        nodeData,
        layer,
      };
    }
    return {};
  }

  /**
   * 获取已选择的items，用于显示在placeholder
   */
  getSelectedItems(selectedValues) {
    const { valueKey } = this.props;
    const checkItems = [];
    Object.keys(this.nodes).forEach((refKey: string) => {
      const node = this.nodes[refKey];
      if (
        selectedValues.some((value: any) => shallowEqual(node[valueKey], value))
      ) {
        checkItems.push(node);
      }
    });
    return checkItems;
  }

  /**
   * 获取每个节点的最顶层父节点的check值
   * @param {*} nodes
   * @param {*} node
   */
  getTopParentNodeCheckState(nodes: Object, node: Object) {
    if (node.parentNode) {
      return this.getTopParentNodeCheckState(nodes, node.parentNode);
    }
    return nodes[node.refKey].check;
  }

  /**
   * 获取第一层节点是否全部都为 uncheckable
   */
  getEveryFisrtLevelNodeUncheckable() {
    const list = [];
    Object.keys(this.nodes).forEach((refKey: string) => {
      const curNode = this.nodes[refKey];
      if (!curNode.parentNode) {
        list.push(curNode);
      }
    });

    return list.every(node => node.uncheckable);
  }

  getEveryChildUncheckable(node: Object) {
    const list = [];
    Object.keys(this.nodes).forEach((refKey: string) => {
      const curNode = this.nodes[refKey];
      if (curNode.parentNode && curNode.parentNode.refKey === node.refKey) {
        list.push(curNode);
      }
    });

    return list.every(n => n.uncheckable);
  }

  /**
   * 判断传入的 value 是否存在于data 中
   * @param {*} values
   */
  hasValue(
    values: any[] = this.state.selectedValues,
    props: Props = this.props,
  ) {
    const { valueKey } = props;
    const selectedValues = Object.keys(this.nodes)
      .map((refKey: string) => this.nodes[refKey][valueKey])
      .filter((item: any) => values.some(v => shallowEqual(v, item)));
    return !!selectedValues.length;
  }

  /**
   * 判断第一层节点是否存在有children的节点
   * @param {*} data
   */
  isSomeNodeHasChildren = (data: any[], childrenKey: string) => {
    return data.some((node: Object) => node[childrenKey]);
  };

  shouldDisplay = (label: any, searchKeyword: string) => {
    if (!_.trim(searchKeyword)) {
      return true;
    }
    const keyword = searchKeyword.toLocaleLowerCase();
    if (typeof label === 'string') {
      return label.toLocaleLowerCase().indexOf(keyword) >= 0;
    } else if (React.isValidElement(label)) {
      const nodes = reactToString(label);
      return (
        nodes
          .join('')
          .toLocaleLowerCase()
          .indexOf(keyword) >= 0
      );
    }
    return false;
  };

  isEveryChildChecked(node: Object) {
    const { childrenKey } = this.props;
    let children = null;
    if (node[childrenKey]) {
      children = node[childrenKey].filter(child => !child.uncheckable);
      if (!children.length) {
        return node.check;
      }
      return children.every((child: Object) => {
        if (child[childrenKey] && child[childrenKey].length) {
          return this.isEveryChildChecked(child);
        }
        return child.check;
      });
    }
    return node.check;
  }

  isSomeChildChecked(node: Object) {
    const { childrenKey } = this.props;
    if (!node[childrenKey]) {
      return false;
    }

    return node[childrenKey].some((child: Object) => {
      if (child.check) {
        return true;
      }
      return this.isSomeChildChecked(child);
    });
  }

  /**
   * 拍平数组，将tree 转换为一维对象
   * @param {*} nodes tree data
   * @param {*} ref 当前层级
   */
  flattenNodes(
    nodes: any[],
    props?: Props = this.props,
    ref?: string = '0',
    parentNode?: Object,
  ) {
    const { labelKey, valueKey, childrenKey } = props;

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return;
    }
    nodes.forEach((node, index) => {
      const refKey = `${ref}-${index}`;
      node.refKey = refKey;
      this.nodes[refKey] = {
        [labelKey]: node[labelKey],
        [valueKey]: node[valueKey],
        expand: this.getExpandState(node, props),
        uncheckable: this.getUncheckableState(node),
        refKey,
      };
      if (parentNode) {
        this.nodes[refKey].parentNode = parentNode;
      }
      this.flattenNodes(node[childrenKey], props, refKey, this.nodes[refKey]);
    });
  }

  /**
   * 过滤选中的values中不包含 uncheckableItemValues 的那些值
   * @param {*} values
   */
  filterSelectedValues(values: any[]) {
    const { uncheckableItemValues = [] } = this.props;
    return values.filter(value => !uncheckableItemValues.includes(value));
  }

  serializeList(key: string, nodes: Object = this.nodes) {
    const { valueKey } = this.props;
    const list = [];

    Object.keys(nodes).forEach((refKey: string) => {
      if (nodes[refKey][key]) {
        list.push(nodes[refKey][valueKey]);
      }
    });
    return list;
  }

  serializeListOnlyParent(key: string, nodes: Object = this.nodes) {
    const { valueKey } = this.props;
    const list = [];

    Object.keys(nodes).forEach((refKey: string) => {
      const currentNode = nodes[refKey];
      if (currentNode.parentNode) {
        const parentNode = nodes[currentNode.parentNode.refKey];
        if (currentNode[key]) {
          if (!parentNode.checkAll) {
            list.push(nodes[refKey][valueKey]);
          } else if (
            !this.getTopParentNodeCheckState(nodes, currentNode) &&
            parentNode.uncheckable
          ) {
            list.push(nodes[refKey][valueKey]);
          }
        }
      } else {
        if (currentNode[key]) {
          list.push(nodes[refKey][valueKey]);
        }
      }
    });
    return list;
  }

  unserializeLists(lists: Object, nextProps?: Props = this.props) {
    const { valueKey, cascade, uncheckableItemValues = [] } = nextProps;
    // Reset values to false
    Object.keys(this.nodes).forEach((refKey: string) => {
      Object.keys(lists).forEach((listKey: string) => {
        const node = this.nodes[refKey];
        if (cascade && 'parentNode' in node) {
          node[listKey] = node.parentNode[listKey];
        } else {
          node[listKey] = false;
        }
        lists[listKey].forEach((value: any) => {
          if (
            shallowEqual(this.nodes[refKey][valueKey], value) &&
            !uncheckableItemValues.some(uncheckableValue =>
              shallowEqual(value, uncheckableValue),
            )
          ) {
            this.nodes[refKey][listKey] = true;
          }
        });
      });
    });
  }

  isControlled = null;

  nodes = {};

  activeNode = null;

  treeView = null;

  bindTreeViewRef = (ref: React.ElementRef<*>) => {
    this.treeView = ref;
  };
  trigger = null;

  bindTriggerRef = (ref: React.ElementRef<*>) => {
    this.trigger = ref;
  };

  container = null;
  bindContainerRef = (ref: React.ElementRef<*>) => {
    this.container = ref;
  };

  nodeRefs = {};
  bindNodeRefs = (refKey: string, ref: React.ElementRef<*>) => {
    this.nodeRefs[refKey] = ref;
  };

  // for test
  menu = null;
  bindMenuRef = (ref: React.ElementRef<*>) => {
    this.menu = ref;
  };

  position = null;

  bindPositionRef = (ref: React.ElementRef<*>) => {
    this.position = ref;
  };

  toggle = null;

  bindToggleRef = (ref: React.ElementRef<*>) => {
    this.toggle = ref;
  };

  getPositionInstance = () => {
    return this.position;
  };

  getToggleInstance = () => {
    return this.toggle;
  };

  selectActiveItem = () => {
    const { nodeData, layer } = this.getActiveItem();
    this.handleSelect(nodeData, +layer);
  };

  focusNextItem = () => {
    const { items, activeIndex } = this.getItemsAndActiveIndex();
    if (items.length === 0) {
      return;
    }
    const nextIndex = activeIndex === items.length - 1 ? 0 : activeIndex + 1;
    const node = this.getElementByDataKey(items[nextIndex].refKey);
    if (node !== null) {
      node.focus();
    }
  };

  focusPreviousItem = () => {
    const { items, activeIndex } = this.getItemsAndActiveIndex();
    if (items.length === 0) {
      return;
    }
    let prevIndex = activeIndex === 0 ? items.length - 1 : activeIndex - 1;
    prevIndex = prevIndex >= 0 ? prevIndex : 0;
    const node = this.getElementByDataKey(items[prevIndex].refKey);
    if (node !== null) {
      node.focus();
    }
  };

  closeDropdown = () => {
    if (this.trigger) {
      this.trigger.hide();
    }
  };

  openDropdown = () => {
    if (this.trigger) {
      this.trigger.show();
    }
  };

  toggleDropdown = () => {
    const { active } = this.state;
    if (active) {
      this.closeDropdown();
      return;
    }
    this.openDropdown();
  };

  everyChildChecked = (nodes: Object, node: Object) => {
    const list = [];
    Object.keys(nodes).forEach((refKey: string) => {
      const curNode = nodes[refKey];
      if (
        curNode.parentNode &&
        curNode.parentNode.refKey === node.refKey &&
        !curNode.uncheckable
      ) {
        list.push(curNode);
      }
    });

    return list.every(l => l.check);
  };

  toggleChecked(node: Object, isChecked: boolean) {
    const nodes = clone(this.nodes);
    this.toggleDownChecked(nodes, node, isChecked);
    node.parentNode && this.toggleUpChecked(nodes, node.parentNode, isChecked);
    const values = this.serializeListOnlyParent('check', nodes);
    return this.filterSelectedValues(values);
  }

  toggleUpChecked(nodes: Object, node: Object, checked: boolean) {
    const { cascade } = this.props;
    const currentNode = nodes[node.refKey];
    if (cascade) {
      if (!checked) {
        currentNode.check = checked;
        currentNode.checkAll = checked;
      } else {
        if (this.everyChildChecked(nodes, node)) {
          currentNode.check = true;
          currentNode.checkAll = true;
        } else {
          currentNode.check = false;
          currentNode.checkAll = false;
        }
      }
      if (node.parentNode) {
        this.toggleUpChecked(nodes, node.parentNode, checked);
      }
    }
  }

  toggleDownChecked(nodes: Object, node: Object, isChecked: boolean) {
    const { childrenKey, cascade } = this.props;
    nodes[node.refKey].check = isChecked;

    if (!node[childrenKey] || !node[childrenKey].length || !cascade) {
      nodes[node.refKey].checkAll = false;
    } else {
      nodes[node.refKey].checkAll = isChecked;
      node[childrenKey].forEach((child: Object) => {
        this.toggleDownChecked(nodes, child, isChecked);
      });
    }
  }

  toggleNode(key: string, node: Object, toggleValue: boolean) {
    // 如果该节点处于 disabledChecbox，则忽略该值
    if (!node.uncheckable) {
      this.nodes[node.refKey][key] = toggleValue;
    }
  }

  toggleExpand(node: Object, isExpand: boolean) {
    this.nodes[node.refKey].expand = isExpand;
  }

  addPrefix = (name: string) => prefix(this.props.classPrefix)(name);

  /**
   * 选择某个节点后的回调函数
   * @param {object} activeNodeData   节点的数据
   * @param {number} layer            节点的层级
   */
  handleSelect = (activeNode: Object, layer: number) => {
    const { onChange, onSelect } = this.props;
    const selectedValues = this.toggleChecked(activeNode, activeNode.check);
    if (this.isControlled) {
      this.activeNode = activeNode;
    } else {
      this.unserializeLists({
        check: selectedValues,
      });
      this.setState({
        activeNode,
        selectedValues,
        hasValue: !!selectedValues.length,
      });
    }

    onChange && onChange(selectedValues);
    onSelect && onSelect(activeNode, layer, selectedValues);
  };

  /**
   * 展开、收起节点
   */
  handleToggle = (nodeData: Object, layer: number) => {
    const { classPrefix = '', valueKey, onExpand } = this.props;
    const openClass = `${classPrefix}-view-open`;
    toggleClass(findDOMNode(this.nodeRefs[nodeData.refKey]), openClass);
    nodeData.expand = hasClass(
      findDOMNode(this.nodeRefs[nodeData.refKey]),
      openClass,
    );
    this.toggleExpand(nodeData, nodeData.expand);
    onExpand &&
      onExpand(
        nodeData,
        layer,
        createConcatChildrenFunction(nodeData, nodeData[valueKey]),
      );
  };

  /**
   * 处理键盘方向键移动
   */
  handleKeyDown = (event: SyntheticKeyboardEvent<*>) => {
    onMenuKeyDown(event, {
      down: this.focusNextItem,
      up: this.focusPreviousItem,
      enter: this.selectActiveItem,
      del: this.handleClean,
    });
  };

  handleToggleKeyDown = (event: SyntheticKeyboardEvent<*>) => {
    const { classPrefix } = this.props;
    const { activeNode, active } = this.state;

    // enter
    if ((!activeNode || !active) && event.keyCode === 13) {
      this.toggleDropdown();
    }

    // delete
    if (event.keyCode === 8) {
      this.handleClean();
    }

    if (!this.treeView) {
      return;
    }
    if (event.target instanceof HTMLElement) {
      const className = event.target.className;
      if (
        className.includes(`${classPrefix}-toggle`) ||
        className.includes(`${classPrefix}-toggle-custom`) ||
        className.includes(`${classPrefix}-search-bar-input`)
      ) {
        onMenuKeyDown(event, {
          down: this.focusNextItem,
        });
      }
    }
  };

  handleSearch = (value: string, event: DefaultEvent) => {
    const { filterData } = this.state;
    const { onSearch, searchKeyword } = this.props;
    if (_.isUndefined(searchKeyword)) {
      this.setState({
        filterData: this.getFilterData(value, filterData),
        searchKeyword: value,
      });
    }
    onSearch && onSearch(value, event);
  };

  /**
   * 清除已选择的项
   */
  handleClean = () => {
    const { onChange } = this.props;
    this.setState({
      selectedValues: [],
      hasValue: false,
      activeNode: {},
    });
    this.unserializeLists({
      check: [],
    });

    onChange && onChange([]);
  };

  handleOnOpen = () => {
    const { activeNode } = this.state;
    const { onOpen } = this.props;
    if (activeNode) {
      const node = this.getElementByDataKey(activeNode.refKey);
      if (node !== null) {
        node.focus();
      }
    }
    onOpen && onOpen();
    this.setState({
      active: true,
    });
  };

  handleOnClose = () => {
    const { filterData } = this.state;
    const { onClose, searchKeyword } = this.props;
    if (_.isUndefined(searchKeyword)) {
      this.setState({
        filterData: this.getFilterData('', filterData),
        searchKeyword: '',
      });
    }
    onClose && onClose();
    this.setState({
      active: false,
    });
  };

  renderDropdownMenu() {
    const {
      locale,
      searchable,
      placement,
      searchKeyword,
      renderExtraFooter,
      renderMenu,
      menuStyle,
      menuClassName,
    } = this.props;

    const keyword = !_.isUndefined(searchKeyword)
      ? searchKeyword
      : this.state.searchKeyword;
    const classes = classNames(
      menuClassName,
      this.addPrefix('menu'),
      this.addPrefix(`placement-${_.kebabCase(placement)}`),
    );
    const menu = this.renderCheckTree();

    return (
      <MenuWrapper className={classes} style={menuStyle} ref={this.bindMenuRef}>
        {searchable ? (
          <SearchBar
            placeholder={locale.searchPlaceholder}
            key="searchBar"
            onChange={this.handleSearch}
            value={keyword}
          />
        ) : null}
        {renderMenu ? renderMenu(menu) : menu}
        {renderExtraFooter && renderExtraFooter()}
      </MenuWrapper>
    );
  }

  renderNode(node: Object, index: number, layer: number, classPrefix: string) {
    if (!node.visible) {
      return null;
    }

    const { activeNode, expandAll } = this.state;
    const {
      valueKey,
      labelKey,
      childrenKey,
      renderTreeNode,
      renderTreeIcon,
      cascade,
    } = this.props;

    const refKey = node.refKey;
    const key =
      _.isString(node[valueKey]) || _.isNumber(node[valueKey])
        ? node[valueKey]
        : refKey;

    const children = node[childrenKey];
    const hasNotEmptyChildren =
      children && Array.isArray(children) && children.length > 0;

    const props = {
      value: node[valueKey],
      label: node[labelKey],
      index,
      layer,
      active: activeNode
        ? shallowEqual(activeNode[valueKey], node[valueKey])
        : false,
      visible: node.visible,
      disabled: this.getDisabledState(node),
      nodeData: node,
      children,
      expandAll,
      checkState: this.getNodeCheckState(node, cascade),
      parentNode: node.parentNode,
      hasChildren: !!children,
      uncheckable: node.uncheckable,
      onSelect: this.handleSelect,
      onTreeToggle: this.handleToggle,
      onRenderTreeNode: renderTreeNode,
      onRenderTreeIcon: renderTreeIcon,
    };

    if (props.hasChildren) {
      layer += 1;

      // 是否展开树节点且子节点不为空
      const openClass = `${classPrefix}-open`;
      const expandControlled = 'expandAll' in this.props;
      const expandALlState = expandControlled
        ? expandAll
        : expandAll || node.expand;
      let childrenClass = classNames(`${classPrefix}-node-children`, {
        [openClass]: expandALlState && hasNotEmptyChildren,
      });

      const viewChildrenClass = classNames(`${classPrefix}-children`, {
        [this.addPrefix('all-uncheckable')]: this.getEveryChildUncheckable(
          node,
        ),
      });

      let nodes = children || [];
      return (
        <div
          className={childrenClass}
          key={key}
          ref={this.bindNodeRefs.bind(this, refKey)}
        >
          <CheckTreeNode
            classPrefix={classPrefix}
            key={key}
            ref={this.bindNodeRefs.bind(this, refKey)}
            {...props}
          />
          <div className={viewChildrenClass}>
            {nodes.map((child, i) =>
              this.renderNode(child, i, layer, classPrefix),
            )}
          </div>
        </div>
      );
    }

    return (
      <CheckTreeNode
        classPrefix={classPrefix}
        key={key}
        ref={this.bindNodeRefs.bind(this, refKey)}
        {...props}
      />
    );
  }

  renderCheckTree() {
    const { filterData, isSomeNodeHasChildren } = this.state;
    const { inline, height, className = '', onScroll, locale } = this.props;
    // 树节点的层级
    let layer = 0;
    const treeViewClass = this.addPrefix('view');
    const classes = classNames(treeViewClass, {
      [className]: inline,
      'without-children': !isSomeNodeHasChildren,
    });
    const formattedNodes = this.getFormattedNodes(filterData);

    const nodes = formattedNodes.map((node, index) =>
      this.renderNode(node, index, layer, treeViewClass),
    );

    if (!nodes.some(v => v !== null)) {
      return (
        <div className={this.addPrefix('none')}>{locale.noResultsText}</div>
      );
    }

    const style = inline ? this.props.style : {};
    const styles = {
      height,
      ...style,
    };

    const treeNodesClass = classNames(this.addPrefix('nodes'), {
      [this.addPrefix(
        'all-uncheckable',
      )]: this.getEveryFisrtLevelNodeUncheckable(),
    });
    return (
      <div
        ref={this.bindTreeViewRef}
        className={classes}
        style={styles}
        onScroll={onScroll}
        onKeyDown={this.handleKeyDown}
      >
        <div className={treeNodesClass}>{nodes}</div>
      </div>
    );
  }
  render() {
    const {
      classPrefix,
      inline,
      open,
      defaultOpen,
      locale,
      disabled,
      className,
      placement,
      placeholder,
      cleanable,
      onOpen,
      onClose,
      container,
      containerPadding,
      onEnter,
      onEntering,
      onEntered,
      onExit,
      onExiting,
      onExited,
      renderValue,
      valueKey,
      block,
      style,
      toggleComponentClass,
      ...rest
    } = this.props;
    const { hasValue } = this.state;

    const selectedValues = this.serializeList('check');

    const classes = classNames(
      classPrefix,
      {
        [this.addPrefix('block')]: block,
        [this.addPrefix('has-value')]: !!selectedValues,
        [this.addPrefix('disabled')]: disabled,
      },
      `${namespace}-placement-${_.kebabCase(placement)}`,
      className,
    );

    let placeholderText = placeholder;
    if (hasValue && selectedValues.length) {
      placeholderText = tplTransform(
        locale.selectedValues,
        selectedValues.length,
      );
      // placeholderText = `${selectedValues.length} selected`;
    }
    if (renderValue && hasValue) {
      const checkItems = [];
      Object.keys(this.nodes).map((refKey: string) => {
        const node = this.nodes[refKey];
        if (
          selectedValues.some((value: any) =>
            shallowEqual(node[valueKey], value),
          )
        ) {
          checkItems.push(node);
        }
      });
      placeholderText = renderValue(
        selectedValues,
        checkItems,
        placeholderText,
      );
    }
    const unhandled = getUnhandledProps(CheckTree, rest);

    return !inline ? (
      <div
        onKeyDown={this.handleToggleKeyDown}
        className={classes}
        style={style}
        tabIndex={-1}
        role="menu"
        ref={this.bindContainerRef}
      >
        <OverlayTrigger
          ref={this.bindTriggerRef}
          open={open}
          defaultOpen={defaultOpen}
          disabled={disabled}
          trigger="click"
          placement={placement}
          onEnter={onEnter}
          onEntering={onEntering}
          onEntered={createChainedFunction(this.handleOnOpen, onEntered)}
          onExit={onExit}
          onExiting={onExiting}
          onExited={createChainedFunction(this.handleOnClose, onExited)}
          container={container}
          containerPadding={containerPadding}
          speaker={this.renderDropdownMenu()}
        >
          <Toggle
            {...unhandled}
            onClean={this.handleClean}
            componentClass={toggleComponentClass}
            cleanable={cleanable && !disabled}
            hasValue={hasValue}
          >
            {placeholderText || locale.placeholder}
          </Toggle>
        </OverlayTrigger>
      </div>
    ) : (
      this.renderCheckTree()
    );
  }
}

export default CheckTree;
