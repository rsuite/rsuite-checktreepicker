// @flow

import * as React from 'react';
import classNames from 'classnames';
import { toggleClass, hasClass } from 'dom-lib';
import { findDOMNode } from 'react-dom';
import { IntlProvider, FormattedMessage } from 'rsuite-intl';
import OverlayTrigger from 'rsuite-utils/lib/Overlay/OverlayTrigger';
import _ from 'lodash';
import {
  reactToString,
  getUnhandledProps,
  prefix,
  createChainedFunction,
  shallowEqual,
  shallowEqualArray,
} from 'rsuite-utils/lib/utils';

import {
  SearchBar,
  Toggle,
  MenuWrapper,
  constants,
} from 'rsuite-utils/lib/Picker';
import TreeCheckNode from './TreeCheckNode';
import defaultLocale from './locale/index';
import { CHECK_STATE } from './constants';

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
  data: Array<any>,
  open?: boolean,
  block?: boolean,
  style?: object,
  value?: Array<any>,
  height?: number,
  inline?: boolean,
  locale: Object,
  cascade: boolean,
  disabled?: boolean,
  valueKey?: string,
  labelKey?: string,
  container?: HTMLElement | (() => HTMLElement),
  className?: string,
  cleanable?: boolean,
  expandAll?: boolean,
  placement?: Placement,
  searchable?: boolean,
  classPrefix?: string,
  defaultOpen?: boolean,
  childrenKey?: string,
  placeholder?: React.Node,
  defaultValue?: Array<any>,
  searchKeyword?: string,
  menuClassName?: string,
  defaultExpandAll?: boolean,
  containerPadding?: number,
  disabledItemValues?: Array<any>,
  toggleComponentClass?: React.ElementType,
  // 禁用 checkbox 数组
  disabledCheckboxValues: Array<any>,
  onOpen?: () => void,
  onExit?: Function,
  onEnter?: Function,
  onClose?: () => void,
  onSearch?: (searchKeyword: string, event: DefaultEvent) => void,
  onChange?: (values: any) => void,
  onExpand?: (activeNode: any, labyer: number) => void,
  onSelect?: (activeNode: any, layer: number, values: any) => void,
  onScroll?: (event: DefaultEvent) => void,
  onExited?: Function,
  onEntered?: Function,
  onExiting?: Function,
  onEntering?: Function,
  renderMenu?: (menu: string | React.Node) => React.Node,
  renderValue?: (
    values: Array<any>,
    checkItems: Array<any>,
    placeholder: string | React.Node,
  ) => React.Node,
  renderTreeNode?: (nodeData: Object) => React.Node,
  renderTreeIcon?: (nodeData: Object) => React.Node,
  renderExtraFooter?: () => React.Node,
};

type State = {
  data: Array<any>,
  hasValue: boolean,
  expandAll?: boolean,
  activeNode?: ?Object,
  searchKeyword?: string,
  formattedNodes: Array<any>,
  selectedValues: Array<any>,
  isSomeNodeHasChildren: boolean,
};

class CheckTree extends React.Component<Props, State> {
  static defaultProps = {
    value: [],
    inline: false,
    expand: false,
    locale: defaultLocale,
    cascade: true,
    disabled: false,
    valueKey: 'value',
    labelKey: 'label',
    cleanable: true,
    placement: 'bottomLeft',
    searchable: true,
    classPrefix: `${namespace}-checktree`,
    childrenKey: 'children',
    searchKeyword: '',
    disabledItemValues: [],
    disabledCheckboxValues: [],
  };
  constructor(props: Props) {
    super(props);
    this.nodes = {};
    this.isControlled =
      'value' in props && 'onChange' in props && props.onChange;

    const nextValue = this.getValue(props);
    const expandAll =
      props.expandAll !== undefined ? props.expandAll : props.defaultExpandAll;
    this.state = {
      data: [],
      hasValue: true,
      expandAll,
      searchKeyword: props.searchKeyword,
      selectedValues: nextValue,
      formattedNodes: [],
      isSomeNodeHasChildren: this.isSomeNodeHasChildren(props.data),
    };
  }

  componentWillMount() {
    const { searchKeyword } = this.state;
    const { data } = this.props;
    const nextValue = this.getValue(this.props);
    this.flattenNodes(data);
    this.unserializeLists({
      check: nextValue,
    });
    this.setState({
      data: this.getFilterData(searchKeyword, data),
      hasValue: this.hasValue(),
    });
  }

  componentWillReceiveProps(nextProps: Props) {
    const { searchKeyword, selectedValues } = this.state;
    const { value, data, cascade, expandAll } = nextProps;
    if (!shallowEqualArray(this.props.data, data)) {
      this.flattenNodes(nextProps.data);
      this.unserializeLists({
        check: nextProps.value,
      });
      this.setState({
        data: this.getFilterData(searchKeyword, data),
        isSomeNodeHasChildren: this.isSomeNodeHasChildren(data),
        hasValue: this.hasValue(),
      });
    }
    if (!shallowEqualArray(value, this.props.value)) {
      this.unserializeLists({
        check: nextProps.value,
      });
      this.setState({
        selectedValues: value,
        hasValue: this.hasValue(value),
      });
    }

    // cascade 改变时，重新初始化
    if (cascade !== this.props.cascade && cascade) {
      this.flattenNodes(data);
      this.unserializeLists(
        {
          check: selectedValues,
        },
        nextProps,
      );
    }

    if (nextProps.searchKeyword !== this.props.searchKeyword) {
      this.setState({
        data: this.getFilterData(nextProps.searchKeyword, data),
        searchKeyword: nextProps.searchKeyword,
      });
    }

    if (expandAll !== this.props.expandAll) {
      this.setState({
        expandAll,
      });
    }
  }

  getValue(props: Props) {
    const { value, defaultValue } = props;
    if (value && value.length) {
      return value;
    }
    if (defaultValue && defaultValue.length > 0) {
      return defaultValue;
    }
    return [];
  }

  getNodeCheckState(node: Object, cascade: boolean) {
    const { childrenKey } = this.props;
    if (!node[childrenKey] || !node[childrenKey].length || !cascade) {
      return node.check ? CHECK_STATE.CHECK : CHECK_STATE.UNCHECK;
    }

    if (this.isEveryChildChecked(node)) {
      return CHECK_STATE.CHECK;
    }

    if (this.isSomeChildChecked(node)) {
      return CHECK_STATE.HALFCHECK;
    }

    return CHECK_STATE.UNCHECK;
  }

  getExpandState(node: Object) {
    const { expandAll } = this.state;
    const { childrenKey } = this.props;
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
    data: Array<any>,
    props?: Props = this.props,
  ) {
    const { labelKey } = props;
    const treeData = JSON.parse(JSON.stringify(data));
    const setVisible = (nodes = []) =>
      nodes.forEach((item: Object) => {
        item.visible = this.shouldDisplay(item[labelKey], searchKeyword);
        if (_.isArray(item.children)) {
          setVisible(item.children);
          item.children.forEach((child: Object) => {
            if (child.visible) {
              item.visible = child.visible;
            }
          });
        }
      });

    setVisible(treeData);
    return treeData;
  }

  getActiveElementOption(options: Array<any>, refKey: string) {
    for (let i = 0; i < options.length; i += 1) {
      if (options[i].refKey === refKey) {
        return options[i];
      } else if (options[i].children && options[i].children.length) {
        let active = this.getActiveElementOption(options[i].children, refKey);
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

  getFormattedNodes(nodes: Array<any>) {
    return nodes.map((node: Object) => {
      const formatted = { ...node };
      const curNode = this.nodes[node.refKey];
      formatted.check = curNode.check;
      formatted.expand = curNode.expand;
      formatted.disabledCheckbox = curNode.disabledCheckbox;
      formatted.parentNode = curNode.parentNode;
      if (Array.isArray(node.children) && node.children.length > 0) {
        formatted.children = this.getFormattedNodes(formatted.children);
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
   * 获取每个节点的是否需要 disabled checkbox
   * @param {*} node
   */
  getDisabledCheckboxState(node: Object) {
    const { disabledCheckboxValues = [], valueKey } = this.props;
    return disabledCheckboxValues.some((value: any) =>
      shallowEqual(node[valueKey], value),
    );
  }

  getFocusableMenuItems = () => {
    const { data } = this.state;
    const { childrenKey } = this.props;

    let items = [];
    const loop = (treeNodes: Array<any>) => {
      treeNodes.forEach((node: Object) => {
        if (
          !this.getDisabledState(node) &&
          !this.getDisabledCheckboxState(node) &&
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

    loop(data);
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
   * 判断传入的 value 是否存在于data 中
   * @param {*} values
   */
  hasValue(values: Array<any> = this.state.selectedValues) {
    const { valueKey } = this.props;
    const selectedValues = Object.keys(this.nodes)
      .map((refKey: string) => this.nodes[refKey][valueKey])
      .filter((item: any) => values.some(v => shallowEqual(v, item)));
    return !!selectedValues.length;
  }

  /**
   * 判断第一层节点是否存在有children的节点
   * @param {*} data
   */
  isSomeNodeHasChildren(data: Array<any>) {
    return data.some((node: Object) => {
      return node.children;
    });
  }

  shouldDisplay(label: any, searchKeyword: string) {
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
  }

  isEveryChildChecked(node: Object) {
    return node.children.every((child: Object) => {
      if (child.children) {
        return this.isEveryChildChecked(child);
      }
      return child.check;
    });
  }

  isSomeChildChecked(node: Object) {
    return node.children.some((child: Object) => {
      if (child.children) {
        return this.isSomeChildChecked(child);
      }

      return child.check;
    });
  }

  /**
   * 拍平数组，将tree 转换为一维数组
   * @param {*} nodes tree data
   * @param {*} ref 当前层级
   */
  flattenNodes(
    nodes: Array<any>,
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
        expand: this.getExpandState(node),
        disabledCheckbox: this.getDisabledCheckboxState(node),
        refKey,
      };
      if (parentNode) {
        this.nodes[refKey].parentNode = parentNode;
      }
      this.flattenNodes(node[childrenKey], props, refKey, this.nodes[refKey]);
    });
  }

  serializeList(key: string) {
    const { valueKey } = this.props;
    const list = [];

    Object.keys(this.nodes).forEach((refKey: string) => {
      if (this.nodes[refKey][key]) {
        list.push(this.nodes[refKey][valueKey]);
      }
    });
    return list;
  }

  unserializeLists(lists: Object, nextProps?: Props = this.props) {
    const { valueKey, cascade } = nextProps;
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
          if (shallowEqual(this.nodes[refKey][valueKey], value)) {
            this.nodes[refKey][listKey] = true;
          }
        });
      });
    });
  }

  isControlled = null;

  nodes = {};

  treeView = null;

  trigger = null;

  container = null;

  nodeRefs = {};

  selectActiveItem = () => {
    const { nodeData, layer } = this.getActiveItem();
    this.handleSelect(nodeData, +layer);
  };

  focusNextItem() {
    const { items, activeIndex } = this.getItemsAndActiveIndex();
    if (items.length === 0) {
      return;
    }
    const nextIndex = activeIndex === items.length - 1 ? 0 : activeIndex + 1;
    const node = this.getElementByDataKey(items[nextIndex].refKey);
    if (node !== null) {
      node.focus();
    }
  }

  focusPreviousItem() {
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
  }

  everyChildChecked(node: Object) {
    const list = [];
    Object.keys(this.nodes).filter((refKey: string) => {
      const curNode = this.nodes[refKey];
      if (curNode.parentNode && curNode.parentNode.refKey === node.refKey) {
        list.push(curNode);
      }
    });

    return list.every(l => l.check);
  }

  someChildChecked(node: Object) {
    const list = [];
    Object.keys(this.nodes).filter((refKey: string) => {
      const curNode = this.nodes[refKey];
      if (curNode.parentNode && curNode.parentNode.refKey === node.refKey) {
        list.push(curNode);
      }
    });

    return list.some(l => l.check);
  }
  toggleParentNodeChecked(node: Object, checked: boolean) {
    const { cascade } = this.props;

    if (cascade) {
      if (!checked) {
        this.nodes[node.refKey].check = checked;
      } else {
        if (this.everyChildChecked(node)) {
          this.nodes[node.refKey].check = checked;
        } else {
          this.nodes[node.refKey].check = false;
        }
      }
      if (node.parentNode) {
        this.toggleParentNodeChecked(node.parentNode, checked);
      }
    }
  }

  toggleChecked(node: Object, isChecked: boolean, cascade: boolean) {
    const { childrenKey } = this.props;
    if (!node[childrenKey] || !node[childrenKey].length || !cascade) {
      this.toggleNode('check', node, isChecked);
    } else {
      this.toggleNode('check', node, isChecked);
      node.children.forEach((child: Object) => {
        this.toggleChecked(child, isChecked, cascade);
      });
    }
  }

  toggleNode(key: string, node: Object, toggleValue: boolean) {
    // 如果该节点处于 disabledChecbox，则忽略该值
    if (!node.disabledCheckbox) {
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
    const { onChange, onSelect, cascade } = this.props;
    this.toggleChecked(activeNode, activeNode.check, cascade);
    activeNode.parentNode &&
      this.toggleParentNodeChecked(activeNode.parentNode, activeNode.check);
    const selectedValues = this.serializeList('check');
    let nextState = {};
    if (this.isControlled) {
      nextState = {
        activeNode,
      };
    } else {
      nextState = {
        activeNode,
        selectedValues,
        hasValue: true,
      };
    }

    this.setState(nextState);
    onChange && onChange(selectedValues);
    onSelect && onSelect(activeNode, layer, selectedValues);
  };

  /**
   * 展开、收起节点
   */
  handleToggle = (nodeData: Object, layer: number) => {
    const { classPrefix = '', onExpand } = this.props;
    const openClass = `${classPrefix}-view-open`;
    toggleClass(findDOMNode(this.nodeRefs[nodeData.refKey]), openClass);
    nodeData.expand = hasClass(
      findDOMNode(this.nodeRefs[nodeData.refKey]),
      openClass,
    );
    this.toggleExpand(nodeData, nodeData.expand);
    onExpand && onExpand(nodeData, layer);
  };

  /**
   * 展开树节点后的回调函数
   */
  handleExpand = (activeNode: Object, layer: number) => {
    const { onExpand } = this.props;
    onExpand && onExpand(activeNode, layer);
  };

  /**
   * 处理键盘方向键移动
   */
  handleKeyDown = (event: SyntheticKeyboardEvent<*>) => {
    switch (event.keyCode) {
      // down
      case 40:
        this.focusNextItem();
        event.preventDefault();
        break;
      // up
      case 38:
        this.focusPreviousItem();
        event.preventDefault();
        break;
      // enter
      case 13:
        this.selectActiveItem();
        event.preventDefault();
        break;
      default:
    }
  };

  handleToggleKeyDown = (event: SyntheticKeyboardEvent<*>) => {
    if (!this.treeView) {
      return;
    }

    if (
      event.target.className === `${namespace}-toggle` ||
      event.target.className === `${namespace}-search-bar-input`
    ) {
      switch (event.keyCode) {
        // down
        case 40:
          this.focusNextItem();
          event.preventDefault();
          break;
        default:
      }
    }
  };

  handleSearch = (value: string, event: DefaultEvent) => {
    const { data, onSearch } = this.props;
    this.setState({
      searchKeyword: value,
      data: this.getFilterData(value, data),
    });

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
    const { onOpen } = this.props;
    onOpen && onOpen();
  };

  handleOnClose = () => {
    const { onClose } = this.props;
    onClose && onClose();
  };

  renderDropdownMenu() {
    const {
      locale,
      searchable,
      placement,
      renderExtraFooter,
      renderMenu,
    } = this.props;
    const classes = classNames(
      this.addPrefix('menu'),
      `${namespace}-placement-${_.kebabCase(placement)}`,
    );
    const menu = this.renderCheckTree();
    return (
      <MenuWrapper className={classes}>
        {searchable ? (
          <SearchBar
            placeholder={locale.searchPlaceholder}
            key="searchBar"
            onChange={this.handleSearch}
            value={this.state.searchKeyword}
          />
        ) : null}
        {renderMenu ? renderMenu(menu) : menu}
        {renderExtraFooter && renderExtraFooter()}
      </MenuWrapper>
    );
  }

  renderNode(node: Object, index: number, layer: number, classPrefix: string) {
    const { activeNode, expandAll } = this.state;
    const {
      valueKey,
      labelKey,
      childrenKey,
      renderTreeNode,
      renderTreeIcon,
      cascade,
    } = this.props;

    const key = `${node.refKey}`;
    const checkState = this.getNodeCheckState(node, cascade);
    const children = node[childrenKey];
    const disabled = this.getDisabledState(node);
    const hasNotEmptyChildren =
      children && Array.isArray(children) && children.length > 0;
    const active = activeNode
      ? shallowEqual(activeNode[valueKey], node[valueKey])
      : false;
    const props = {
      value: node[valueKey],
      label: node[labelKey],
      nodeData: node,
      onTreeToggle: this.handleToggle,
      onRenderTreeNode: renderTreeNode,
      onRenderTreeIcon: renderTreeIcon,
      onSelect: this.handleSelect,
      active,
      hasChildren: !!children,
      disabled,
      disabledCheckbox: node.disabledCheckbox,
      children,
      index,
      layer,
      checkState,
      visible: node.visible,
      expandAll,
      parentNode: node.parentNode,
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

      let nodes = children || [];
      return (
        <div
          className={childrenClass}
          key={key}
          ref={ref => {
            this.nodeRefs[key] = ref;
          }}
        >
          <TreeCheckNode
            classPrefix={classPrefix}
            key={key}
            ref={ref => {
              this.nodeRefs[key] = ref;
            }}
            {...props}
          />
          <div className={`${classPrefix}-children`}>
            {nodes.map((child, i) =>
              this.renderNode(child, i, layer, classPrefix),
            )}
          </div>
        </div>
      );
    }

    return (
      <TreeCheckNode
        classPrefix={classPrefix}
        key={key}
        ref={ref => {
          this.nodeRefs[key] = ref;
        }}
        {...props}
      />
    );
  }

  renderCheckTree() {
    const { data, isSomeNodeHasChildren } = this.state;
    const { onScroll } = this.props;
    // 树节点的层级
    let layer = 0;
    const { menuClassName, height } = this.props;
    const treeViewClass = classNames(this.addPrefix('view'), {});
    const classes = classNames(treeViewClass, menuClassName, {
      'without-children': !isSomeNodeHasChildren,
    });
    const formattedNodes = this.state.formattedNodes.length
      ? this.state.formattedNodes
      : this.getFormattedNodes(data);

    const nodes = formattedNodes.map((node, index) =>
      this.renderNode(node, index, layer, treeViewClass),
    );
    const styles = {
      height,
    };
    const treeNodesClass = this.addPrefix('nodes');
    return (
      <div
        ref={ref => {
          this.treeView = ref;
        }}
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
      placeholderText = `${selectedValues.length} selected`;
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
      <IntlProvider locale={locale}>
        <div
          onKeyDown={this.handleToggleKeyDown}
          className={classes}
          style={style}
          tabIndex={-1}
          role="menu"
          ref={ref => {
            this.container = ref;
          }}
        >
          <OverlayTrigger
            ref={ref => {
              this.trigger = ref;
            }}
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
              {placeholderText || <FormattedMessage id="placeholder" />}
            </Toggle>
          </OverlayTrigger>
        </div>
      </IntlProvider>
    ) : (
      this.renderCheckTree()
    );
  }
}

export default CheckTree;