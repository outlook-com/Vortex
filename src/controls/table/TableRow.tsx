import { IEditChoice, ITableAttribute } from '../../types/ITableAttribute';

import ContextMenu from '../ActionContextMenu';
import ActionDropdown from '../ActionDropdown';
import Dropdown from '../Dropdown';
import ExtensionGate from '../ExtensionGate';
import Icon from '../Icon';
import IconBar from '../IconBar';
import {ITableRowAction} from '../Table';
import {Button, IconButton} from '../TooltipControls';
import VisibilityProxy from '../VisibilityProxy';

import { TD, TR } from './MyTable';

import * as I18next from 'i18next';
import * as React from 'react';
import { FormControl, MenuItem, SplitButton } from 'react-bootstrap';

interface ICellProps {
  language: string;
  attribute: ITableAttribute;
  rowId: string;
  data: any;
  rawData: any;
  tableId: string;
  t: I18next.TranslationFunction;
  container: HTMLElement;
  onHighlight: (highlight: boolean) => void;
  right: boolean;
}

class TableCell extends React.Component<ICellProps, {}> {
  public shouldComponentUpdate(newProps: ICellProps) {
    return this.props.rawData !== newProps.rawData
        || this.props.data !== newProps.data
        || this.props.language !== newProps.language;
  }

  public render(): JSX.Element {
    const { t, attribute, container, data, language, onHighlight,
            rawData, right, rowId, tableId } = this.props;

    // if a custom renderer was set then rowData is the raw object
    // passed to the table by the user.
    // otherwise rowData is the calculated value of this cell

    if (attribute.customRenderer !== undefined) {
      const attrControl = attribute.customRenderer(rawData, false, t, {
        onHighlight }) || null;
      return attrControl !== null ? (
        <ExtensionGate id={`extension-${rowId}-${attribute.id}`}>
          {attrControl}
        </ExtensionGate>
      ) : null;
    }

    if ((data === undefined) || (data === null)) {
      return <span>{' '}</span>;
    } else if ((attribute.edit.onChangeValue !== undefined) && attribute.edit.inline) {
      if (attribute.edit.choices !== undefined) {
        const choices = attribute.edit.choices();
        const currentChoice = choices.find(choice => choice.text === data);
        const key = currentChoice !== undefined ? currentChoice.key : undefined;
        return (
          <Dropdown
            id={`dropdown-${tableId}-${attribute.id}`}
            container={container}
            pullRight={right}
          >
            <Button
              id={`btn-${tableId}-${attribute.id}`}
              className={`btn-${tableId}-${attribute.id}-${key}`}
              key={key}
              onClick={this.cycle}
              onSelect={this.changeCell}
              tooltip={attribute.description}
            >
              {((currentChoice !== undefined) && (currentChoice.icon !== undefined))
                ? <Icon name={currentChoice.icon} /> : null}
              {currentChoice !== undefined ? t(currentChoice.text) : ''}
            </Button>
            <Dropdown.Toggle
              className={`toggle-${tableId}-${attribute.id} `
                + `toggle-${tableId}-${attribute.id}-${key}`}
            />
            <Dropdown.Menu
              onSelect={this.changeCell}
            >
              {choices.filter(choice => choice.visible !== false).map(this.renderChoice)}
            </Dropdown.Menu>
          </Dropdown>
        );
      }
    } else {
      const cellType = typeof(data);
      if (cellType === 'string') {
        return <span>{data}</span>;
      } else if (cellType === 'boolean') {
        return (
          <IconButton
            className='btn-embed'
            id={`toggle-${rowId}-${attribute.id}`}
            tooltip={attribute.name}
            icon={data ? 'checkbox-checked' : 'square-remove'}
            onClick={this.toggle}
          />
        );
      } else if ((cellType === 'object') && (data instanceof Date)) {
        return (
          <span>
            {data !== undefined ? data.toLocaleString(language) : t('Not installed')}
          </span>
        );
      }
    }
    return <span>{data.toString()}</span>;
  }

  private cycle = () => {
    const { attribute, rawData } = this.props;
    attribute.edit.onChangeValue(rawData, undefined);
  }

  private changeCell = (key) => {
    const { attribute, rawData } = this.props;
    attribute.edit.onChangeValue(rawData, key);
  }

  private renderChoice = (choice: IEditChoice): JSX.Element => {
    const { t, attribute, tableId } = this.props;
    return (
      <MenuItem
        eventKey={choice.key}
        key={choice.key}
        className={`option-${tableId}-${attribute.id}-${choice.key}`}
      >
        {choice.icon ? <Icon name={choice.icon} /> : null}
        {t(choice.text)}
      </MenuItem>
    );
  }

  private toggle = () => {
    const { attribute, data, rawData } = this.props;
    const value = data;
    attribute.edit.onChangeValue(rawData, !value);
  }
}

export interface IRowProps {
  t: I18next.TranslationFunction;
  id: string;
  tableId: string;
  data: any;
  rawData: any;
  attributes: ITableAttribute[];
  sortAttribute: string;
  actions: ITableRowAction[];
  language: string;
  onClick: React.MouseEventHandler<any>;
  selected: boolean;
  highlighted: boolean;
  domRef?: (ref) => void;
  container: HTMLElement;
  initVisible: boolean;
  onHighlight: (rowId: string, highlight: boolean) => void;
}

interface IRowState {
  visible: boolean;
  context?: { x: number, y: number };
}

class TableRow extends React.Component<IRowProps, IRowState> {
  constructor(props: IRowProps) {
    super(props);
    this.state = {
      visible: false,
      context: undefined,
    };
  }

  public shouldComponentUpdate(nextProps: IRowProps, nextState: IRowState) {
    return (this.props.data !== nextProps.data)
      || (this.props.rawData !== nextProps.rawData)
      || (this.props.selected !== nextProps.selected)
      || (this.props.highlighted !== nextProps.highlighted)
      || (this.props.attributes !== nextProps.attributes)
      || (this.state.visible !== nextState.visible)
      || (this.state.context !== nextState.context);
  }

  public render(): JSX.Element {
    const { data, domRef, highlighted, onClick,
            selected } = this.props;

    const classes = ['xtr'];

    if (selected) {
      classes.push('table-selected');
    }
    if (highlighted) {
      classes.push('table-highlighted');
    }

    return (
      <VisibilityProxy
        id={data.__id}
        key={data.__id}
        className={classes.join(' ')}
        onClick={onClick}
        onContextMenu={this.onContext}
        ref={domRef}
        style={{ display: 'table-row', position: 'relative' }}

        startVisible={this.props.initVisible}
        container={this.props.container}
        placeholder={this.renderPlaceholder}
        content={this.renderRow}
      />
    );
  }

  private renderPlaceholder = (): React.ReactNode => {
    const { data, domRef } = this.props;
    return (
      <TD>{'\u00A0'}</TD>
    );
  }

  private renderRow = (): React.ReactNode => {
    const { actions, attributes, data, domRef, tableId } = this.props;

    if (actions !== undefined) {
      const rowActions = actions.filter((action) =>
        (action.singleRowAction === undefined) || action.singleRowAction);
    }

    const res = attributes.map(this.renderAttribute);
    const sorted = actions
      .filter(icon => {
        try {
          return (icon.condition === undefined)
            || icon.condition([data.__id]);
        } catch (err) {
          return false;
        }
      })
      .sort((lhs, rhs) => lhs.position - rhs.position);
    if (sorted.length > 0) {
      const def = sorted[0];
      res.push(
        <TD
          style={{ textAlign: 'center' }}
          key='action-cell'
          className={`table-${tableId} cell-actions`}
        >
          <ContextMenu
            id={`${tableId}-${data.__id}-action-context`}
            group={`${tableId}-action-icons`}
            instanceId={data.__id}
            className='table-actions'
            staticElements={actions}
            visible={this.state.visible}
            position={this.state.context}
            onHide={this.onHideContext}
          />
          <ActionDropdown
            id={`${tableId}-${data.__id}-action-icons`}
            group={`${tableId}-action-icons`}
            instanceId={data.__id}
            className='table-actions'
            staticElements={actions}
          />
        </TD>);
    } else {
      res.push(<TD key='no-action' />);
    }
    return res;
  }

  private selectDefaultAction = (event) => {
    const { actions, data } = this.props;
    const action = actions.find(iter => iter.title === event.currentTarget.value);
    action.action([data.__id]);
  }

  private selectAction = (eventKey: any) => {
    const { actions, data } = this.props;
    const action = actions.find(iter => iter.title === eventKey);
    action.action([data.__id]);
  }

  private renderDefault = (action: ITableRowAction) => {
    return (
      <div className='table-default-action'>
        <Icon name={action.icon} />
        <span>{action.title}</span>
      </div>
    );
  }

  private renderAttribute = (attribute: ITableAttribute, index: number,
                             arr: ITableAttribute[]): JSX.Element => {
    const { t, data, rawData, sortAttribute, tableId } = this.props;
    const classes = [
      `table-${tableId}`,
      `cell-${attribute.id}`,
    ];

    if (attribute.id === sortAttribute) {
      classes.push('table-sort-column');
    }

    return (
      <TD
        className={classes.join(' ')}
        key={attribute.id}
      >
        {this.renderCell(attribute, rawData, data[attribute.id], t,
                         index >= (arr.length / 2))}
      </TD>
    );
  }

  private highlight = (highlight: boolean) => {
    const {data, onHighlight} = this.props;
    onHighlight(data.__id, highlight);
  }

  private renderCell(
    attribute: ITableAttribute,
    rawData: any,
    calculatedData: any,
    t: I18next.TranslationFunction,
    right: boolean): JSX.Element {

    const { container, data, language, tableId } = this.props;

    return (
      <TableCell
        t={t}
        attribute={attribute}
        rawData={rawData}
        data={calculatedData}
        rowId={data.__id}
        tableId={tableId}
        language={language}
        container={container}
        onHighlight={this.highlight}
        right={right}
      />
    );
  }

  private onContext = (event: React.MouseEvent<any>) => {
    this.setState({ visible: true, context: { x: event.clientX, y: event.clientY } });
  }

  private onHideContext = () => {
    this.setState({ visible: false });
  }
}

export default TableRow as React.ComponentClass<IRowProps>;
