import { setDialogVisible } from '../../actions';
import { removeExtension, setExtensionEnabled } from '../../actions/app';
import Dropzone, { DropType } from '../../controls/Dropzone';
import FlexLayout from '../../controls/FlexLayout';
import Table, { ITableRowAction } from '../../controls/Table';
import { IExtensionLoadFailure, IExtensionState, IState } from '../../types/IState';
import { ITableAttribute } from '../../types/ITableAttribute';
import { ComponentEx, connect, translate } from '../../util/ComponentEx';
import * as selectors from '../../util/selectors';
import { getSafe } from '../../util/storeHelper';
import MainPage from '../../views/MainPage';

import { IDownload } from '../download_management/types/IDownload';

import installExtension from './installExtension';
import getTableAttributes from './tableAttributes';
import { IExtension, IExtensionWithState } from './types';

import * as Promise from 'bluebird';
import { remote } from 'electron';
import * as _ from 'lodash';
import * as path from 'path';
import * as React from 'react';
import { Alert, Button, Panel } from 'react-bootstrap';
import * as Redux from 'redux';
import { ThunkDispatch } from 'redux-thunk';

export interface IExtensionManagerProps {
  localState: { extensions: { [extId: string]: IExtension } };
  updateExtensions: () => void;
}

interface IConnectedProps {
  extensionConfig: { [extId: string]: IExtensionState };
  downloads: { [dlId: string]: IDownload };
  downloadPath: string;
  loadFailures: { [extId: string]: IExtensionLoadFailure[] };
}

interface IActionProps {
  onSetExtensionEnabled: (extId: string, enabled: boolean) => void;
  onRemoveExtension: (extId: string) => void;
  onBrowseExtension: () => void;
}

type IProps = IExtensionManagerProps & IConnectedProps & IActionProps;

interface IComponentState {
  oldExtensionConfig: { [extId: string]: IExtensionState };
  reloadNecessary: boolean;
}

class ExtensionManager extends ComponentEx<IProps, IComponentState> {
  private staticColumns: ITableAttribute[];
  private actions: ITableRowAction[];

  constructor(props: IProps) {
    super(props);

    const { localState, extensionConfig, onSetExtensionEnabled } = props;
    const { extensions } = localState;
  
    this.initState({
      oldExtensionConfig: props.extensionConfig,
      reloadNecessary: false,
    });

    this.actions = [
      {
        icon: 'delete',
        title: 'Remove',
        action: this.removeExtension,
        condition: (instanceId: string) => !extensions[instanceId].bundled,
        singleRowAction: true,
      },
    ];

    this.staticColumns = getTableAttributes({
      onSetExtensionEnabled:
        (extName: string, enabled: boolean) => {
          const extId = Object.keys(extensions)
            .find(iter => extensions[iter].name === extName);
          onSetExtensionEnabled(extId, enabled);
        },
      onToggleExtensionEnabled:
        (extName: string) => {
          const extId = Object.keys(extensions)
            .find(iter => extensions[iter].name === extName);
          onSetExtensionEnabled(extId, !getSafe(extensionConfig, [extId, 'enabled'], true));
        },
    });
  }

  public render(): JSX.Element {
    const {t, localState, extensionConfig} = this.props;
    const {reloadNecessary, oldExtensionConfig} = this.state;
    const { extensions } = localState;

    const extensionsWithState = this.mergeExt(extensions, extensionConfig);

    const PanelX: any = Panel;

    return (
      <MainPage>
        <MainPage.Body>
          <Panel>
            <PanelX.Body>
              <FlexLayout type='column'>
                <FlexLayout.Fixed>
                  {
                    reloadNecessary || !_.isEqual(extensionConfig, oldExtensionConfig)
                      ? this.renderReload()
                      : null
                  }
                </FlexLayout.Fixed>
                <FlexLayout.Flex>
                  <Table
                    tableId='extensions'
                    data={extensionsWithState}
                    actions={this.actions}
                    staticElements={this.staticColumns}
                    multiSelect={false}
                  />
                </FlexLayout.Flex>
                <FlexLayout.Fixed>
                  <FlexLayout type='row'>
                    <FlexLayout.Flex className='extensions-find-button-container'>
                      <Button
                        id='btn-more-extensions'
                        onClick={this.onBrowse}
                        bsStyle='ghost'
                      >
                        {t('Find more')}
                      </Button>
                      </FlexLayout.Flex>
                    <FlexLayout.Flex>
                      <Dropzone
                        accept={['files']}
                        drop={this.dropExtension}
                        dialogHint={t('Select extension file')}
                        icon='folder-download'
                      />
                    </FlexLayout.Flex>
                  </FlexLayout>
                </FlexLayout.Fixed>
              </FlexLayout>
            </PanelX.Body>
          </Panel>
        </MainPage.Body>
      </MainPage>
    );
  }

  private onBrowse = () => {
    this.props.onBrowseExtension();
  }

  private dropExtension = (type: DropType, extPaths: string[]): void => {
    const { downloads } = this.props;
    let success = false;
    const prop: Promise<void[]> = (type === 'files')
      ? Promise.map(extPaths, extPath => installExtension(extPath)
          .then(() => { success = true; })
          .catch(err => {
            this.context.api.showErrorNotification('Failed to install extension', err,
                                                   { allowReport: false });
          }))
      : Promise.map(extPaths, url => new Promise<void>((resolve, reject) => {
        this.context.api.events.emit('start-download', [url], undefined,
                                     (error: Error, id: string) => {
          const dlPath = path.join(this.props.downloadPath, downloads[id].localPath);
          installExtension(dlPath)
          .then(() => {
            success = true;
          })
          .catch(err => {
            this.context.api.showErrorNotification('Failed to install extension', err,
                                                   { allowReport: false });
          })
          .finally(() => {
            resolve();
          });
        });
      }));
    prop.then(() => {
      if (success) {
        this.nextState.reloadNecessary = true;
        this.props.updateExtensions();
      }
    });
  }

  private renderReload(): JSX.Element {
    const {t} = this.props;
    return (
      <Alert bsStyle='warning' style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flexGrow: 1 }}>{t('You need to restart Vortex to apply changes.')}</div>
        <Button onClick={this.restart}>{t('Restart')}</Button>
      </Alert>
    );
  }

  private restart = () => {
    remote.app.relaunch();
    remote.app.quit();
  }

  private mergeExt(extensions: { [id: string]: IExtension },
                   extensionConfig: { [id: string]: IExtensionState })
                   : { [id: string]: IExtensionWithState } {
    const { loadFailures } = this.props;
    return Object.keys(extensions).reduce((prev, id) => {
      if (!getSafe(extensionConfig, [id, 'remove'], false)) {
        const enabled = loadFailures[id] === undefined ?
          getSafe(extensionConfig, [id, 'enabled'], true)
          : 'failed';
        prev[id] = {
          ...extensions[id],
          enabled,
          loadFailures: loadFailures[id] || [],
        };
      }
      return prev;
    }, {});
  }

  private removeExtension = (extId: string) => {
    this.props.onRemoveExtension(extId);
    this.nextState.reloadNecessary = true;
  }
}

const emptyObject = {};

function mapStateToProps(state: IState): IConnectedProps {
  return {
    // TODO: don't use || {} in mapStateToProps because {} is always a new object and
    //   thus causes constant re-drawing. but when removing this, make sure no access
    //   to undefined can happen
    extensionConfig: state.app.extensions || emptyObject,
    loadFailures: state.session.base.extLoadFailures,
    downloads: state.persistent.downloads.files,
    downloadPath: selectors.downloadPath(state),
  };
}

function mapDispatchToProps(dispatch: ThunkDispatch<any, null, Redux.Action>): IActionProps {
  return {
    onSetExtensionEnabled: (extId: string, enabled: boolean) =>
      dispatch(setExtensionEnabled(extId, enabled)),
    onRemoveExtension: (extId: string) => dispatch(removeExtension(extId)),
    onBrowseExtension: () => dispatch(setDialogVisible('browse-extensions')),
  };
}

export default
  translate(['common'])(
    connect(mapStateToProps, mapDispatchToProps)(
      ExtensionManager)) as React.ComponentClass<{}>;
