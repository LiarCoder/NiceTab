import { Menus } from 'wxt/browser';
import {
  ENUM_ACTION_NAME,
  ENUM_SETTINGS_PROPS,
  TAB_EVENTS,
  defaultLanguage,
} from './constants';
import tabUtils from '~/entrypoints/common/tabs';
import { getCustomLocaleMessages } from '~/entrypoints/common/locale';
import type { SendTargetProps } from '~/entrypoints/types';
import initSettingsStorageListener, { settingsUtils } from './storage';
import { getCommandsHotkeys } from './commands';
import { pick, isUrlMatched } from './utils';

const {
  LANGUAGE,
  ALLOW_SEND_PINNED_TABS,
  EXCLUDE_DOMAINS_FOR_SENDING,
  SHOW_PAGE_CONTEXT_MENUS,
  SHOW_SEND_TARGET_MODAL,
} = ENUM_SETTINGS_PROPS;

export type ContextMenuHotKeys = Record<string, string>;

export const getMenuHotkeys = async () => {
  const commandsHotkeysMap = await getCommandsHotkeys();
  const settings = await settingsUtils.getSettings();
  const language = settings[LANGUAGE] || defaultLanguage;
  const customMessages = getCustomLocaleMessages(language);
  const noneKey = customMessages['common.none'] || 'None';

  return [
    ENUM_ACTION_NAME.OPEN_ADMIN_TAB,
    ENUM_ACTION_NAME.SEND_ALL_TABS,
    ENUM_ACTION_NAME.SEND_CURRENT_TAB,
    ENUM_ACTION_NAME.SEND_OTHER_TABS,
    ENUM_ACTION_NAME.SEND_LEFT_TABS,
    ENUM_ACTION_NAME.SEND_RIGHT_TABS,
  ].reduce<ContextMenuHotKeys>((result, id) => {
    const hotkey = commandsHotkeysMap.get(id) || noneKey;
    return { ...result, [id]: hotkey };
  }, {});
};

export const getMenus = async (): Promise<Menus.CreateCreatePropertiesType[]> => {
  const settings = await settingsUtils.getSettings();
  const language = settings[LANGUAGE] || defaultLanguage;
  const customMessages = getCustomLocaleMessages(language);

  const tabs = await browser.tabs.query({ currentWindow: true });
  const { tab: adminTab } = await tabUtils.getAdminTabInfo();
  const currTab = tabs?.find((tab) => tab.highlighted);
  const filteredTabs = await tabUtils.getFilteredTabs(tabs, settings);
  const excludeDomainsString = settings[EXCLUDE_DOMAINS_FOR_SENDING] || '';
  const isCurrTabMatched = isUrlMatched(currTab?.url, excludeDomainsString);

  const hotkeysMap = await getMenuHotkeys();
  const contexts: Menus.ContextType[] = settings[SHOW_PAGE_CONTEXT_MENUS]
    ? ['all']
    : ['action'];

  const _openAdminTab: Menus.CreateCreatePropertiesType = {
    id: ENUM_ACTION_NAME.OPEN_ADMIN_TAB,
    title:
      customMessages['common.openAdminTab'] +
      ` (${hotkeysMap?.[ENUM_ACTION_NAME.OPEN_ADMIN_TAB]})`,
    contexts,
  };

  const _sendAllTabs: Menus.CreateCreatePropertiesType = {
    id: ENUM_ACTION_NAME.SEND_ALL_TABS,
    title:
      customMessages['common.sendAllTabs'] +
      ` (${hotkeysMap?.[ENUM_ACTION_NAME.SEND_ALL_TABS]})`,
    contexts,
    enabled: filteredTabs?.length > 0,
  };

  const _sendCurrentTab: Menus.CreateCreatePropertiesType = {
    id: ENUM_ACTION_NAME.SEND_CURRENT_TAB,
    title:
      customMessages['common.sendCurrentTab'] +
      ` (${hotkeysMap?.[ENUM_ACTION_NAME.SEND_CURRENT_TAB]})`,
    contexts,
    enabled:
      !!currTab?.id &&
      currTab?.id != adminTab?.id &&
      !(currTab?.pinned && !settings[ALLOW_SEND_PINNED_TABS])
      && isCurrTabMatched,
  };

  const _sendOtherTabs: Menus.CreateCreatePropertiesType = {
    id: ENUM_ACTION_NAME.SEND_OTHER_TABS,
    title:
      customMessages['common.sendOtherTabs'] +
      ` (${hotkeysMap?.[ENUM_ACTION_NAME.SEND_OTHER_TABS]})`,
    contexts,
    enabled: !!currTab?.id && filteredTabs?.length > 1,
  };

  async function hasFilteredLeftTabs() {
    if (!currTab?.id || currTab?.index <= 0) return false;
    const filteredRightTabs = await tabUtils.getFilteredTabs(tabs.slice(0, (currTab?.index || 0)), settings);
    return filteredRightTabs?.length > 0;
  }
  const _hasFilteredLeftTabs = await hasFilteredLeftTabs();
  const _sendLeftTabs: Menus.CreateCreatePropertiesType = {
    id: ENUM_ACTION_NAME.SEND_LEFT_TABS,
    title:
      customMessages['common.sendLeftTabs'] +
      ` (${hotkeysMap?.[ENUM_ACTION_NAME.SEND_LEFT_TABS]})`,
    contexts,
    enabled: _hasFilteredLeftTabs,
  };

  async function hasFilteredRightTabs() {
    if (!currTab?.id || currTab?.index >= tabs.length - 1) return false;
    const filteredRightTabs = await tabUtils.getFilteredTabs(tabs.slice((currTab?.index || 0) + 1), settings);
    return filteredRightTabs?.length > 0;
  }
  const _hasFilteredRightTabs = await hasFilteredRightTabs();
  const _sendRightTabs: Menus.CreateCreatePropertiesType = {
    id: ENUM_ACTION_NAME.SEND_RIGHT_TABS,
    title:
      customMessages['common.sendRightTabs'] +
      ` (${hotkeysMap?.[ENUM_ACTION_NAME.SEND_RIGHT_TABS]})`,
    contexts,
    enabled: _hasFilteredRightTabs,
  };

  return [
    _openAdminTab,
    _sendAllTabs,
    _sendCurrentTab,
    _sendOtherTabs,
    _sendLeftTabs,
    _sendRightTabs,
  ];
};

// 创建 contextMenus
async function createContextMenus(callback?: () => void) {
  const menus = await getMenus();
  for (let menu of menus) {
    await browser.contextMenus.create(menu);
  }
  callback?.();
}

// 根据标签页状态更新 contextMenus
async function handleContextMenusUpdate() {
  const menus = await getMenus();
  for (let menu of menus) {
    if (menu.id)
      browser.contextMenus.update(menu.id, pick(menu, ['title', 'enabled', 'contexts']));
  }
}

export async function actionHandler(actionName: string, targetData?: SendTargetProps) {
  switch (actionName) {
    case ENUM_ACTION_NAME.SEND_ALL_TABS:
      await tabUtils.sendAllTabs(targetData);
      break;
    case ENUM_ACTION_NAME.SEND_CURRENT_TAB:
      await tabUtils.sendCurrentTab(targetData);
      break;
    case ENUM_ACTION_NAME.SEND_OTHER_TABS:
      await tabUtils.sendOtherTabs(targetData);
      break;
    case ENUM_ACTION_NAME.SEND_LEFT_TABS:
      await tabUtils.sendLeftTabs(targetData);
      break;
    case ENUM_ACTION_NAME.SEND_RIGHT_TABS:
      await tabUtils.sendRightTabs(targetData);
      break;
    case ENUM_ACTION_NAME.OPEN_ADMIN_TAB:
      await tabUtils.openAdminRoutePage({ path: '/home' });
      break;
    default:
      break;
  }
}

// 最终要执行的发送标签页操作
export async function handleSendTabsAction(
  actionName: string,
  targetData?: SendTargetProps
) {
  try {
    await actionHandler(actionName, targetData);
    tabUtils.executeContentScript(actionName);
  } catch (error) {
    console.error(error);
    tabUtils.executeContentScript(actionName, 'error');
  }
}

// 右键菜单点击以及快捷命令操作
export async function strategyHandler(actionName: string) {
  // 注释掉，放开拦截限制，在管理后台页面也允许展示发送目标选择弹窗
  // const { tab: adminTab } = await tabUtils.getAdminTabInfo();
  // const currentTabs = await browser.tabs.query({ active: true, currentWindow: true });
  // const currentTab = currentTabs?.[0];
  // if (currentTab.id === adminTab?.id) {
  //   actionHandler(actionName);
  //   return;
  // };

  if (actionName === ENUM_ACTION_NAME.OPEN_ADMIN_TAB) {
    actionHandler(actionName);
    return;
  }

  const settings = await settingsUtils.getSettings();
  if (!settings[SHOW_SEND_TARGET_MODAL]) {
    handleSendTabsAction(actionName);
  } else {
    const currWindow = await browser.windows.getCurrent();
    tabUtils.sendTabMessage({
      msgType: 'action:open-send-target-modal',
      data: { actionName, currWindowId: currWindow.id },
      onlyCurrentTab: true,
    }, () => {
      actionHandler(actionName);
    });
  }
}

// 注册 contextMenus
export default async function contextMenusRegister() {
  await browser.contextMenus.removeAll();
  createContextMenus(() => {
    TAB_EVENTS.forEach((event) => {
      browser.tabs[event]?.addListener(handleContextMenusUpdate);
    });
  });

  initSettingsStorageListener(handleContextMenusUpdate);

  // 点击右键菜单
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    // console.log('info', info);
    // console.log('tab', tab);

    // 当右键点击其他窗口的扩展图标时，窗口不会被激活，所以需要手动激活窗口，然后发送消息到该窗口
    if (tab?.windowId) {
      await browser.windows.update(tab.windowId, { focused: true });
    }

    const actionName = String(info.menuItemId);
    strategyHandler(actionName);
  });
}
