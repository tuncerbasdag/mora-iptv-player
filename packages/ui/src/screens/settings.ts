import type { PlaylistPort } from '../../../core/src/playlistService.ts';
import type { SettingsStore } from '../../../core/src/storage.ts';
import type { FocusManager } from '../focusManager.ts';
import { ConnectionsPage } from './settings/connectionsPage.ts';
import { LanguagePage } from './settings/languagePage.ts';
import type { SettingsPageContext, SettingsPageView } from './settings/pageContext.ts';
import { SubtitleStylePage } from './settings/subtitleStylePage.ts';
import { UpdatePage } from './settings/updatePage.ts';
import { ThemePage } from './settings/themePage.ts';
import { TOGGLE_SPECS, TogglePage } from './settings/togglePage.ts';
import type { SettingsPage } from './settingsShell.ts';

export type { SettingsPage } from './settingsShell.ts';
export type { SettingsScreenCallbacks } from './settings/pageContext.ts';

type StaticPage = Exclude<SettingsPage, 'add' | 'edit'>;
type PageFactory = (ctx: SettingsPageContext) => SettingsPageView;

/**
 * Page registry (a new page = one line; no switch/if chain). Unregistered pages
 * (parental-*, remote, etc. are separate screens in the app) fall back to the Connections list.
 */
const PAGE_FACTORIES: Partial<Record<StaticPage, PageFactory>> = {
  auto: (ctx) => new TogglePage(ctx, TOGGLE_SPECS.auto),
  epg: (ctx) => new TogglePage(ctx, TOGGLE_SPECS.epg),
  theme: (ctx) => new ThemePage(ctx),
  subtitle: (ctx) => new SubtitleStylePage(ctx),
  language: (ctx) => new LanguagePage(ctx),
  updates: (ctx) => (ctx.cb.appUpdater ? new UpdatePage(ctx, ctx.cb.appUpdater) : new ConnectionsPage(ctx)),
};

/**
 * Settings: left menu + right panel. Pages live under `./settings/` (Connections list, Auto Update, EPG, Theme, Language);
 * the Add/Edit Connection form is in connections.ts.
 */
export function renderSettingsScreen(
  container: HTMLElement,
  storage: SettingsStore,
  playlist: PlaylistPort,
  page: StaticPage,
  cb: SettingsPageContext['cb'],
): FocusManager {
  const ctx: SettingsPageContext = { container, storage, playlist, cb };
  const create = PAGE_FACTORIES[page] ?? ((c: SettingsPageContext) => new ConnectionsPage(c));
  return create(ctx).render();
}
