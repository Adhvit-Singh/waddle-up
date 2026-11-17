import './ui.css';
import { Time } from '../core/time.ts';
import { Loop } from '../core/loop.ts';
import { Scheduler, type Co } from '../core/coroutines.ts';
import { UnityRandom } from '../core/rng.ts';
import { refs } from '../core/refs.ts';
import { css, smoothStep, lerp, moveTowards, repeat } from '../core/math.ts';
import { STAGES } from '../core/StageData.ts';
import { GameSettings, QUALITY_NAMES } from '../core/GameSettings.ts';
import { SaveSystem, type SaveData } from '../core/SaveSystem.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { chaosModeName } from '../trolls/ControlChaos.ts';
import { resumeDodges } from '../core/pauseRules.ts';
import {
  UIColors, rect, stretch, image, panel, label, text, button, column, sliderRow, optionRow, DodgeButton, setPos, place, type Txt,
} from './UIFactory.ts';

/** What the UI needs from the game (avoids a hard import cycle). */
export interface GameForUI {
  readonly currentStage: number;
  readonly tiersRevealed: number;
  data: SaveData;
  continueGame(): void;
  newGame(): void;
  setPaused(p: boolean): void;
  toMenu(): void;
  saveNow(): void;
  penguinHeight(): number;
  penguinHanging(): boolean;
  grip01(): number;
  tierTop(): number;
}

const BAD_TIPS = [
  'Tip: Falling is much faster than climbing.',
  'Tip: The golden fish is a shortcut. Trust us.',
  'Tip: Holding W makes you go forward. Usually.',
  "Tip: Checkpoints save your progress. (They don't.)",
  "Tip: Penguins are excellent climbers. (They aren't.)",
  "Tip: If you stop playing, you can't fall.",
  'Tip: Try jumping less. Or more. One of those.',
  'Tip: The mountain respects confidence.',
];

const show = (el: HTMLElement, on: boolean) => el.classList.toggle('hidden', !on);
const shown = (el: HTMLElement) => !el.classList.contains('hidden');

/** All menus, HUD, popups, overlays. Built entirely in code (port of UIManager.cs). */
export class UIManager {
  static instance: UIManager;
  gm!: GameForUI;
  private host: HTMLElement;
  private root!: HTMLElement;
  private menu!: HTMLElement; private hud!: HTMLElement; private pause!: HTMLElement; private settings!: HTMLElement; private how!: HTMLElement;
  private credits!: HTMLElement; private confirmEl!: HTMLElement; private stats!: HTMLElement; private fakeWin!: HTMLElement;
  private fadeEl!: HTMLElement; private blackoutEl!: HTMLElement; private blackoutText!: Txt;
  private fadeA = 1; private fadeColor = 'rgb(0,0,0)';
  private crashEl!: HTMLElement; private crashDots!: Txt; private saveEl!: HTMLElement; private saveFill!: HTMLElement;
  private crashOn = false; private saveOn = false; private saveT = 0;

  // HUD
  private stageText!: Txt; private timerText!: Txt; private fallsText!: Txt; private heightText!: Txt; private hintText!: Txt;
  private chaosWarnText!: Txt; private chaosText!: Txt; private bannerTitle!: Txt; private bannerSub!: Txt; private tauntText!: Txt;
  private timerRow!: HTMLElement;
  private heightFill!: HTMLElement; private heightMarker!: HTMLElement; private bestMarker!: HTMLElement; private gripFill!: HTMLElement;
  private gripRoot!: HTMLElement; private banner!: HTMLElement; private tauntRt!: HTMLElement; private toastColumn!: HTMLElement;
  private bannerAlpha = 0; private tauntAlpha = 0; private tauntScale = 1; private fillH = 0;
  // menu
  private menuStats!: Txt; private continueBtn!: HTMLElement; private titleRt!: HTMLElement;
  // pause
  private resumeDodge!: DodgeButton; private pauseTip!: Txt;
  // confirm
  private confirmText!: Txt; private confirmYes: (() => void) | null = null;
  // settings
  private settingsReturn: HTMLElement | null = null;
  private settingRefreshers: (() => void)[] = [];
  // credits
  private creditsScroll!: HTMLElement; private creditsDone: (() => void) | null = null; private creditsRolling = false;
  // stats
  private statsBody!: Txt; private statsContinue: (() => void) | null = null;
  // fake win
  private fwTitle!: Txt; private fwSub!: Txt; private fwSubRt!: HTMLElement; private fwNope!: Txt; private fwNopeRt!: HTMLElement;
  private fwBar!: HTMLElement; private fwBarFill!: HTMLElement; private fwBarText!: Txt;

  private tauntUntil = 0; private bannerUntil = 0; private hintUntil = 0;
  private chaosWarning = false;

  constructor(host: HTMLElement) {
    UIManager.instance = this;
    this.host = host;
    refs.ui = this;
    Loop.add(this);
  }

  build() {
    this.root = document.createElement('div');
    this.root.id = 'uiroot';
    this.host.appendChild(this.root);
    addEventListener('resize', () => this.layout());
    this.layout();
    this.buildHUD(); this.buildMenu(); this.buildPause(); this.buildSettings(); this.buildHow(); this.buildCredits();
    this.buildConfirm(); this.buildStats(); this.buildFakeWin(); this.buildOverlays();
    this.hideAll();
  }

  /** CanvasScaler: reference 1920×1080, match 0.5 */
  private layout() {
    const w = innerWidth, h = innerHeight;
    const s = Math.sqrt((w / 1920) * (h / 1080));
    this.root.style.width = `${w / s}px`;
    this.root.style.height = `${h / s}px`;
    this.root.style.transform = `scale(${s})`;
  }

  private screen(name: string) { const el = stretch(name, this.root); el.classList.add('screen'); return el; }
  private hideAll() { for (const g of [this.menu, this.hud, this.pause, this.settings, this.how, this.credits, this.confirmEl, this.stats, this.fakeWin]) show(g, false); }

  // =================================================================== HUD

  private buildHUD() {
    this.hud = stretch('HUD', this.root);
    const t = this.hud;
    const sp = panel('StagePanel', t, [0, 1], [30, -30], [520, 96]);
    place(sp, [0, 1], [30, -30], [520, 96], [0, 1]);
    this.stageText = text('Stage', sp, [0.5, 0.5], [0, 0], [490, 90], '', 30, UIColors.Text, 'ml');

    const tp = panel('TimePanel', t, [1, 1], [0, 0], [330, 96]);
    place(tp, [1, 1], [-30, -30], [330, 96], [1, 1]);
    this.timerText = text('Timer', tp, [0.5, 0.5], [0, 18], [300, 44], '00:00', 36, UIColors.Text, 'mr', 'b');
    this.timerRow = this.timerText.parentElement!;
    this.fallsText = text('Falls', tp, [0.5, 0.5], [0, -24], [300, 36], 'Falls: 0', 26, UIColors.Accent, 'mr');

    // height bar
    const hb = panel('HeightBar', t, [0, 0.5], [60, -10], [26, 520], css(0, 0, 0, 0.4));
    this.heightFill = image(rect('Fill', hb, [0.5, 0], [0, 4], [18, 0], [0.5, 0]), UIColors.Ice);
    this.bestMarker = image(rect('Best', hb, [0.5, 0], [0, 0], [44, 4]), UIColors.Accent, false);
    this.heightMarker = rect('Me', hb, [0.5, 0], [0, 0], [30, 30]);
    this.heightMarker.style.background = '#fff'; this.heightMarker.style.borderRadius = '50%';
    text('Top', hb, [0.5, 1], [0, 26], [160, 30], 'SUMMIT', 20, UIColors.Accent, 'mc', 'b');
    this.heightText = text('H', hb, [0.5, 0], [40, -30], [200, 30], '0 m', 24, UIColors.Text, 'mc');

    this.hintText = text('Hint', t, [0.5, 0], [0, 70], [1400, 50], '', 28, UIColors.Text, 'mc');

    // grip
    this.gripRoot = image(rect('Grip', t, [0.5, 0.5], [0, -170], [260, 18]), css(0, 0, 0, 0.5));
    this.gripFill = image(rect('Fill', this.gripRoot, [0, 0.5], [0, 0], [260, 18], [0, 0.5]), UIColors.Good);
    text('GripLbl', this.gripRoot, [0.5, 0.5], [0, 28], [400, 30], 'GRIP', 20, UIColors.Text);

    // chaos indicators (tiny, top-center)
    const chaosRoot = rect('Chaos', t, [0.5, 1], [0, -40], [240, 40]);
    this.chaosWarnText = text('Warn', chaosRoot, [0.5, 0.5], [0, 0], [240, 40], '', 26, css(1, 0.85, 0.3), 'mc', 'b');
    this.chaosText = text('Mode', chaosRoot, [0.5, 0.5], [0, -2], [240, 40], '', 18, css(1, 0.6, 0.5), 'mc', 'b');

    // stage banner
    this.banner = rect('Banner', t, [0.5, 0.5], [0, 150], [1400, 200]);
    this.banner.style.opacity = '0';
    this.bannerTitle = text('T', this.banner, [0.5, 0.5], [0, 30], [1400, 100], '', 80, UIColors.Text, 'mc', 'b');
    this.bannerSub = text('S', this.banner, [0.5, 0.5], [0, -45], [1400, 60], '', 40, UIColors.Accent, 'mc', 'i');

    // taunt
    this.tauntRt = rect('Taunt', t, [0.5, 0.5], [0, -260], [1500, 80]);
    this.tauntRt.style.opacity = '0';
    this.tauntText = label(this.tauntRt, '', 44, '#fff', 'mc', 'bi');

    // toasts
    this.toastColumn = column('Toasts', t, [0.5, 1], [0, -110], 640, 8, [0.5, 1]);
    this.toastColumn.style.alignItems = 'center';
  }

  showHUD(on: boolean) { show(this.hud, on); }

  updateHUD() {
    if (!shown(this.hud) || !this.gm) return;
    const gm = this.gm;
    const st = gm.currentStage;
    this.stageText.set(`<color=#9fdcff><size=22>STAGE ${st + 1} / 20</size></color>\n<b>${STAGES[st].name}</b>`);
    show(this.timerRow, GameSettings.showTimer);
    this.timerText.set(UIManager.formatTime(gm.data.time));
    this.fallsText.set(`Falls: ${gm.data.falls}`);

    const top = gm.tierTop();
    const h = Math.max(0, gm.penguinHeight());
    const f = Math.min(1, h / top);
    const b = Math.min(1, gm.data.bestHeight / top);
    const barH = 512;
    this.fillH = lerp(this.fillH, f * barH, Time.unscaledDeltaTime * 8);
    this.heightFill.style.height = `${this.fillH}px`;
    setPos(this.heightMarker, [0, f * barH + 4]);
    setPos(this.bestMarker, [0, b * barH + 4]);
    this.heightText.set(Math.round(h) + ' m');

    const hanging = gm.penguinHanging();
    show(this.gripRoot, hanging);
    if (hanging) {
      const g = gm.grip01();
      this.gripFill.style.width = `${260 * g}px`;
      this.gripFill.style.background = `rgb(${Math.round(lerp(217, 102, g))},${Math.round(lerp(77, 230, g))},${Math.round(lerp(77, 128, g))})`;
    }

    let hint = '';
    if (hanging) hint = '<b>SPACE</b> / <b>W</b> climb up   ·   <b>S</b> / <b>CTRL</b> let go';
    else if (Time.unscaledTime < this.hintUntil) hint = '<b>WASD</b> waddle   ·   <b>SPACE</b> jump   ·   <b>MOUSE</b> look   ·   jump at a ledge to <b>grab</b> it   ·   <b>ESC</b> pause';
    this.hintText.set(hint);

    if (this.chaosWarning) this.chaosWarnText.set(repeat(Time.unscaledTime * 4, 1) > 0.5 ? '(!)' : '');

    this.bannerAlpha = moveTowards(this.bannerAlpha, Time.unscaledTime < this.bannerUntil ? 1 : 0, Time.unscaledDeltaTime * 2.5);
    this.banner.style.opacity = String(this.bannerAlpha);
    this.tauntAlpha = moveTowards(this.tauntAlpha, Time.unscaledTime < this.tauntUntil ? 1 : 0, Time.unscaledDeltaTime * 3);
    this.tauntRt.style.opacity = String(this.tauntAlpha);
    this.tauntScale = lerp(this.tauntScale, 1, Time.unscaledDeltaTime * 10);
    this.tauntRt.style.transform = `scale(${this.tauntScale})`;
  }

  showControlsHint(seconds: number) { this.hintUntil = Time.unscaledTime + seconds; }

  static formatTime(t: number) {
    const h = Math.trunc(t / 3600), m = Math.trunc(t / 60) % 60, s = Math.trunc(t) % 60;
    const p = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  }

  stageBanner(stage: number, again: boolean) {
    this.bannerTitle.set(`STAGE ${stage + 1}` + (again ? ' <size=50>(again)</size>' : ''));
    this.bannerSub.set(STAGES[stage].name);
    this.bannerUntil = Time.unscaledTime + 2.6;
  }

  taunt(s: string) {
    this.tauntText.set(s);
    this.tauntUntil = Time.unscaledTime + 2.8;
    this.tauntScale = 1.35;
    AudioManager.play('pop', 0.5);
  }

  toast(s: string, color: string, seconds = 1.6) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.opacity = '0';
    this.toastColumn.appendChild(el);
    label(el, s, 30, color, 'mc', 'b');
    Scheduler.start(el, this.toastLife(el, seconds));
  }

  private *toastLife(el: HTMLElement, seconds: number): Co {
    let t = 0;
    while (t < 0.15) { t += Time.unscaledDeltaTime; el.style.opacity = String(t / 0.15); yield null; }
    el.style.opacity = '1';
    yield { realtime: seconds };
    t = 0;
    while (t < 0.4) { t += Time.unscaledDeltaTime; el.style.opacity = String(1 - t / 0.4); yield null; }
    el.remove();
  }

  achievement(s: string) {
    const rt = panel('Achievement', this.hud, [1, 0], [0, 0], [560, 110], css(0.1, 0.12, 0.16, 0.95));
    place(rt, [1, 0], [600, 40], [560, 110], [1, 0]);
    const icon = rect('Icon', rt, [0, 0.5], [60, 0], [76, 76]);
    icon.style.background = css(1, 0.8, 0.2); icon.style.borderRadius = '50%';
    text('Trophy', icon, [0.5, 0.5], [0, 0], [76, 76], '!', 52, css(0.4, 0.25, 0));
    const head = text('Head', rt, [0, 0.5], [120, 22], [420, 34], 'ACHIEVEMENT UNLOCKED', 20, UIColors.Accent, 'ml', 'b');
    place(head.parentElement!, [0, 0.5], [120, 22], [420, 34], [0, 0.5]);
    const body = text('Body', rt, [0, 0.5], [120, -16], [420, 40], s.replace('Achievement: ', ''), 28, UIColors.Text, 'ml');
    place(body.parentElement!, [0, 0.5], [120, -16], [420, 40], [0, 0.5]);
    Scheduler.start(rt, this.slideAchievement(rt));
  }

  private *slideAchievement(rt: HTMLElement): Co {
    const hidden: [number, number] = [600, 40], shownP: [number, number] = [-30, 40];
    let t = 0;
    while (t < 1) { t += Time.unscaledDeltaTime * 4; const k = smoothStep(0, 1, t); setPos(rt, [lerp(hidden[0], shownP[0], k), 40]); yield null; }
    yield { realtime: 3 };
    t = 0;
    while (t < 1) { t += Time.unscaledDeltaTime * 4; const k = smoothStep(0, 1, t); setPos(rt, [lerp(shownP[0], hidden[0], k), 40]); yield null; }
    rt.remove();
  }

  setChaosWarning(on: boolean) { this.chaosWarning = on; if (!on) this.chaosWarnText.set(''); }
  setChaos(on: boolean, mode: number) { this.chaosText?.set(on ? 'controls: ' + chaosModeName(mode).toLowerCase() : ''); }

  // =================================================================== overlays

  private buildOverlays() {
    this.blackoutEl = stretch('Blackout', this.root);
    this.blackoutEl.classList.add('blackout');
    this.blackoutEl.style.background = 'rgba(0,0,0,0)';
    this.blackoutText = text('T', this.blackoutEl, [1, 0], [-170, 50], [300, 40], '', 22, css(0.4, 1, 0.4, 0.8), 'mr');
    // ---- fake "stopped working" dialog (FakeCrash trap)
    this.crashEl = stretch('FakeCrash', this.root);
    this.crashEl.style.background = 'rgba(255,255,255,0.18)';
    const dlg = panel('Dialog', this.crashEl, [0.5, 0.5], [0, 0], [820, 330], '#f3f3f3');
    dlg.style.borderRadius = '6px';
    const bar = rect('Bar', dlg, [0.5, 1], [0, -26], [820, 52]); bar.style.background = '#ffffff'; bar.style.borderBottom = '1px solid #ddd';
    text('T', bar, [0, 0.5], [24, 0], [600, 40], 'Waddle Up (Not Responding)', 24, '#222', 'ml').classList.remove('outline');
    place(bar.lastElementChild as HTMLElement, [0, 0.5], [24, 0], [600, 40], [0, 0.5]);
    const msg = text('Msg', dlg, [0.5, 0.5], [0, 30], [740, 120], 'Waddle Up has stopped working.\nThe penguin is looking for a solution to the problem', 28, '#222', 'ml');
    msg.classList.remove('outline');
    this.crashDots = text('Dots', dlg, [0.5, 0.5], [0, -30], [740, 40], '', 28, '#222', 'ml');
    this.crashDots.classList.remove('outline');
    const fakeBtn = rect('Close', dlg, [1, 0], [-30, 30], [280, 56], [1, 0]);
    fakeBtn.style.background = '#e1e1e1'; fakeBtn.style.border = '1px solid #adadad';
    label(fakeBtn, 'Close the program', 24, '#222', 'mc', '', false);
    show(this.crashEl, false);

    // ---- fake "save corrupted" banner (FakeSave trap)
    this.saveEl = stretch('FakeSave', this.root);
    this.saveEl.style.background = 'rgba(40,0,0,0.35)';
    const sp = panel('Box', this.saveEl, [0.5, 0.5], [0, 60], [1100, 300], 'rgba(30,8,10,0.94)');
    sp.style.border = '3px solid rgb(230,60,60)';
    text('T', sp, [0.5, 1], [0, -70], [1000, 90], 'SAVE FILE CORRUPTED', 72, 'rgb(255,80,80)', 'mc', 'b');
    text('S', sp, [0.5, 0.5], [0, -5], [1000, 50], 'All progress lost. Returning to stage 1...', 34, '#fff', 'mc');
    const pb = image(rect('Bar', sp, [0.5, 0], [0, 60], [900, 26]), 'rgba(255,255,255,0.15)');
    this.saveFill = image(rect('Fill', pb, [0, 0.5], [0, 0], [0, 26], [0, 0.5]), 'rgb(230,60,60)');
    show(this.saveEl, false);

    this.fadeEl = stretch('Fade', this.root);
    this.fadeEl.classList.add('fade');
    this.setFade(1);
  }

  blackout(seconds: number, s: string) { Scheduler.start(this.blackoutEl, this.blackoutRoutine(seconds, s)); }

  private *blackoutRoutine(seconds: number, s: string): Co {
    this.blackoutEl.style.background = 'rgba(0,0,0,0.985)';
    this.blackoutText.set(s);
    yield seconds;
    let t = 0;
    while (t < 0.25) { t += Time.deltaTime; this.blackoutEl.style.background = `rgba(0,0,0,${0.985 * (1 - t / 0.25)})`; yield null; }
    this.blackoutEl.style.background = 'rgba(0,0,0,0)';
    this.blackoutText.set('');
  }

  *fade(to: number, seconds: number, color = 'rgb(0,0,0)'): Co {
    const from = this.fadeA;
    let t = 0;
    while (t < seconds) {
      t += Time.unscaledDeltaTime;
      this.setFade(lerp(from, to, t / seconds), color);
      yield null;
    }
    this.setFade(to, color);
  }

  setFade(a: number, color = 'rgb(0,0,0)') {
    this.fadeA = a; this.fadeColor = color;
    this.fadeEl.style.background = color;
    this.fadeEl.style.opacity = String(a);
  }

  /** FakeCrash trap overlay */
  fakeCrash(on: boolean) { this.crashOn = on; show(this.crashEl, on); }
  /** FakeSave trap overlay (purely visual: never touches the save) */
  fakeSave(on: boolean) { this.saveOn = on; this.saveT = 0; show(this.saveEl, on); }

  // =================================================================== MENU

  private buildMenu() {
    this.menu = this.screen('Menu');
    const t = this.menu;
    t.style.pointerEvents = 'none';
    const left = rect('Left', t, [0, 0.5], [0, 0], [900, 1200], [0, 0.5]);
    left.style.background = css(0.03, 0.06, 0.12, 0.55);

    this.titleRt = rect('Title', t, [0, 1], [110, -110], [900, 170], [0, 1]);
    const title = label(this.titleRt, 'WADDLE UP', 140, '#fff', 'ul', 'b', false);
    title.style.textShadow = `5px 5px 0 ${UIColors.Accent}`;
    const sub = text('Sub', t, [0, 1], [118, -280], [900, 50], 'a penguin\'s worst day', 40, UIColors.Ice, 'ul', 'i');
    place(sub.parentElement!, [0, 1], [118, -280], [900, 50], [0, 1]);

    const col = column('Buttons', t, [0, 0.5], [110, -130], 480, 14, [0, 0.5]);
    this.continueBtn = button(col, 'CONTINUE', () => this.gm.continueGame(), 480, 78, css(0.95, 0.5, 0.15), 36);
    button(col, 'NEW GAME', () => this.onNewGame(), 480, 78, undefined, 34);
    button(col, 'SETTINGS', () => this.openSettings(this.menu), 480, 70);
    button(col, 'HOW TO PLAY', () => { show(this.menu, false); show(this.how, true); }, 480, 70);
    button(col, 'CREDITS', () => { show(this.menu, false); this.rollCredits(() => this.showMenu()); }, 480, 70);
    button(col, 'QUIT', () => this.confirm('Are you sure? The penguin will be sad.', () => this.quit()), 480, 70, css(0.35, 0.18, 0.22));

    const ms = rect('Stats', t, [0, 0], [110, 60], [1200, 40], [0, 0]);
    this.menuStats = label(ms, '', 26, UIColors.Dim, 'ml');
    const ver = rect('Ver', t, [1, 0], [-30, 30], [500, 30], [1, 0]);
    label(ver, 'v1.0  ·  made with spite and snow', 20, 'rgba(255,255,255,0.45)', 'lr');
  }

  private onNewGame() {
    if (SaveSystem.hasSave) this.confirm('Start over? Your current climb will be lost.\n<size=24>(like it usually is)</size>', () => this.gm.newGame());
    else this.gm.newGame();
  }

  private quit() {
    this.gm.saveNow();
    // a browser tab can't close itself — say so instead of Application.Quit()
    this.toast('You can close this tab now. The penguin will wait.', UIColors.Dim, 3);
  }

  showMenu() {
    this.hideAll();
    show(this.menu, true);
    show(this.continueBtn, SaveSystem.hasSave);
    const best = SaveSystem.bestTime;
    this.menuStats.set(`Best time: <b>${best > 0 ? UIManager.formatTime(best) : '--:--'}</b>     ·     Summits: <b>${SaveSystem.wins}</b>     ·     Lifetime falls: <b>${SaveSystem.lifetimeFalls}</b>`);
  }

  get menuVisible() { return shown(this.menu); }

  // =================================================================== PAUSE

  private buildPause() {
    this.pause = this.screen('Pause');
    this.pause.style.background = css(0.02, 0.04, 0.1, 0.6);
    const p = panel('Panel', this.pause, [0.5, 0.5], [0, 0], [620, 720]);
    text('Title', p, [0.5, 1], [0, -70], [560, 90], 'PAUSED', 72, '#fff', 'mc', 'b');
    this.pauseTip = text('Tip', p, [0.5, 0], [0, 50], [560, 60], '', 22, UIColors.Dim, 'mc', 'i');
    const col = column('Col', p, [0.5, 0.5], [0, 150], 460, 16, [0.5, 1]);
    const holder = rect('ResumeHolder', col, [0.5, 0.5], [0, 0], [460, 74]);
    holder.style.zIndex = '20';
    holder.classList.add('flow');
    const resume = button(holder, 'RESUME', () => this.gm.setPaused(false), 460, 74, css(0.95, 0.5, 0.15), 34);
    resume.classList.remove('flow');
    this.resumeDodge = new DodgeButton(resume, () => this.toast('Fine. You can resume.', UIColors.Dim, 0.6));
    button(col, 'SETTINGS', () => this.openSettings(this.pause), 460, 68);
    button(col, 'HOW TO PLAY', () => { show(this.pause, false); show(this.how, true); this.settingsReturn = this.pause; }, 460, 68);
    button(col, 'GIVE UP (RESTART)', () => this.confirm('Restart from the very bottom?', () => this.gm.newGame()), 460, 68, css(0.35, 0.18, 0.22));
    button(col, 'MAIN MENU', () => this.gm.toMenu(), 460, 68);
  }

  showPause(on: boolean) {
    show(this.settings, false); show(this.how, false); show(this.confirmEl, false);
    show(this.pause, on);
    if (on) {
      this.resumeDodge.arm(resumeDodges(UnityRandom.value()));   // always runs away 4–7 times
      this.pauseTip.set(BAD_TIPS[UnityRandom.rangeInt(0, BAD_TIPS.length)]);
    }
  }

  get anySubmenuOpen() { return shown(this.settings) || shown(this.how) || shown(this.confirmEl); }

  /** Esc while in a submenu goes back one level. Returns true if handled. */
  back(): boolean {
    if (shown(this.confirmEl)) { show(this.confirmEl, false); return true; }
    if (shown(this.settings)) { this.closeSettings(); return true; }
    if (shown(this.how)) { show(this.how, false); show(this.settingsReturn === this.pause ? this.pause : this.menu, true); this.settingsReturn = null; return true; }
    if (shown(this.credits) && !this.creditsRolling) { show(this.credits, false); this.showMenu(); return true; }
    return false;
  }

  // =================================================================== SETTINGS

  private buildSettings() {
    this.settings = this.screen('Settings');
    this.settings.style.background = css(0.02, 0.04, 0.1, 0.65);
    const p = panel('Panel', this.settings, [0.5, 0.5], [0, 0], [860, 900]);
    text('Title', p, [0.5, 1], [0, -60], [760, 80], 'SETTINGS', 60, '#fff', 'mc', 'b');
    const col = column('Col', p, [0.5, 1], [0, -130], 760, 10, [0.5, 1]);
    const S = GameSettings;
    const sl = [
      sliderRow(col, 'Master Volume', S.master, 0, 1, v => { S.master = v; S.apply(); }),
      sliderRow(col, 'Music', S.music, 0, 1, v => { S.music = v; }),
      sliderRow(col, 'Sound Effects', S.sfx, 0, 1, v => { S.sfx = v; AudioManager.play('pop', 0.5); }),
      sliderRow(col, 'Mouse Sensitivity', S.sensitivity, 0.2, 3, v => { S.sensitivity = v; }, v => v.toFixed(1) + 'x'),
    ];
    const opts = [
      optionRow(col, 'Invert Camera Y', () => (S.invertY ? 'ON' : 'OFF'), () => { S.invertY = !S.invertY; }),
      optionRow(col, 'Camera Shake', () => (S.cameraShake ? 'ON' : 'OFF'), () => { S.cameraShake = !S.cameraShake; }),
      optionRow(col, 'Show Timer', () => (S.showTimer ? 'ON' : 'OFF'), () => { S.showTimer = !S.showTimer; }),
      optionRow(col, 'Fullscreen', () => (S.fullscreen ? 'ON' : 'OFF'), () => { S.fullscreen = !S.fullscreen; S.apply(); }),
      optionRow(col, 'Graphics Quality', () => QUALITY_NAMES[S.quality], () => { S.quality = (S.quality + 1) % QUALITY_NAMES.length; S.apply(); }),
      optionRow(col, 'Reset Lifetime Stats', () => 'RESET', () => this.confirm('Erase best time, summits and lifetime falls?', () => {
        SaveSystem.resetLifetime();
        this.toast('Stats erased. Fresh shame.', UIColors.Dim);
      })),
    ];
    this.settingRefreshers = [
      () => { sl[0].set(S.master); sl[1].set(S.music); sl[2].set(S.sfx); sl[3].set(S.sensitivity); },
      ...opts.map(o => () => o.refresh()),
    ];
    const back = button(p, 'BACK', () => this.closeSettings(), 320, 70, css(0.95, 0.5, 0.15));
    place(back, [0.5, 0], [0, 70], [320, 70]);
    back.classList.remove('flow');
  }

  private openSettings(from: HTMLElement) {
    this.settingsReturn = from;
    show(from, false);
    for (const r of this.settingRefreshers) r();
    show(this.settings, true);
  }

  private closeSettings() {
    GameSettings.save();
    show(this.settings, false);
    show(this.settingsReturn ?? this.menu, true);
    this.settingsReturn = null;
  }

  // =================================================================== HOW TO PLAY

  private buildHow() {
    this.how = this.screen('How');
    this.how.style.background = css(0.02, 0.04, 0.1, 0.65);
    const p = panel('Panel', this.how, [0.5, 0.5], [0, 0], [1100, 860]);
    text('Title', p, [0.5, 1], [0, -60], [900, 80], 'HOW TO PLAY', 60, '#fff', 'mc', 'b');
    const sp = ' '.repeat(10);
    const body =
      '<b><color=#ffa040>GOAL</color></b>\nGet the penguin to the top of the mountain. That\'s it. How hard could it be?\n\n' +
      '<b><color=#ffa040>CONTROLS</color></b>\n' +
      `<b>WASD / Arrows</b>  waddle${sp}<b>Mouse</b>  look around${sp}<b>Scroll</b>  zoom\n` +
      `<b>Space</b>  jump${sp}<b>Esc</b>  pause${sp}(gamepad works too)\n\n` +
      '<b><color=#ffa040>CLIMBING</color></b>\nJump at the edge of a ledge or wall and the penguin grabs it automatically.\n' +
      'While hanging: <b>Space / W</b> to climb up, <b>S / Ctrl</b> to let go. Grip doesn\'t last forever.\n\n' +
      '<b><color=#ffa040>WARNINGS</color></b>\nIf you fall, you fall. There are no checkpoints. The mountain is slippery.\n' +
      'Things may go wrong at random. The controls may not always be your friend.\n' +
      'A tiny <b>(!)</b> at the top of the screen means something is about to get weird.\n\nYour progress is saved when you quit. Your dignity is not.';
    text('Body', p, [0.5, 0.5], [0, 10], [980, 640], body, 28, UIColors.Text, 'ul');
    const back = button(p, 'BACK', () => this.back(), 320, 70, css(0.95, 0.5, 0.15));
    place(back, [0.5, 0], [0, 70], [320, 70]);
    back.classList.remove('flow');
  }

  // =================================================================== CONFIRM

  private buildConfirm() {
    this.confirmEl = this.screen('Confirm');
    this.confirmEl.style.background = 'rgba(0,0,0,0.6)';
    const p = panel('Panel', this.confirmEl, [0.5, 0.5], [0, 0], [820, 360], UIColors.PanelLight);
    this.confirmText = text('Msg', p, [0.5, 0.5], [0, 60], [740, 160], '', 34, UIColors.Text);
    const yes = button(p, 'YES', () => { show(this.confirmEl, false); this.confirmYes?.(); }, 280, 70, UIColors.Danger);
    place(yes, [0.5, 0.5], [-160, -100], [280, 70]); yes.classList.remove('flow');
    const no = button(p, 'NO', () => show(this.confirmEl, false), 280, 70);
    place(no, [0.5, 0.5], [160, -100], [280, 70]); no.classList.remove('flow');
  }

  confirm(msg: string, yes: () => void) {
    this.confirmText.set(msg);
    this.confirmYes = yes;
    show(this.confirmEl, true);
    this.root.appendChild(this.confirmEl);
    this.root.appendChild(this.fadeEl);
  }

  // =================================================================== CREDITS

  private buildCredits() {
    this.credits = this.screen('Credits');
    this.credits.style.background = css(0.02, 0.03, 0.07, 0.96);
    this.credits.style.cursor = 'pointer';
    const mask = stretch('Mask', this.credits);
    mask.style.overflow = 'hidden';
    this.creditsScroll = rect('Scroll', mask, [0.5, 0], [0, 0], [1400, 2600], [0.5, 1]);
    const txt =
      '<size=110><b>WADDLE UP</b></size>\n<color=#9fdcff>a penguin\'s worst day</color>\n\n\n' +
      '<color=#ffa040>STARRING</color>\nThe Penguin\n(no fingers, all heart)\n\n' +
      '<color=#ffa040>THE MOUNTAIN</color>\nThe Mountain\n(retired)\n\n' +
      '<color=#ffa040>SPECIAL GUEST</color>\nThe Asteroid\n\n' +
      '<color=#ffa040>GAME DESIGN</color>\nYou, the one who asked for this\n\n' +
      '<color=#ffa040>BUILT WITH</color>\nThree.js + Rapier  ·  procedurally generated everything\nNo penguins were harmed. Emotionally, maybe.\n\n' +
      '<color=#ffa040>CHECKPOINTS</color>\nNone\n\n' +
      '<color=#ffa040>SHORTCUTS</color>\nOne golden fish (do not trust)\n\n' +
      '<color=#ffa040>SPECIAL THANKS</color>\nGravity, for being consistent\nIce, for being slippery\nThe wind, for its enthusiasm\nYou, for not throwing your keyboard\n\n\n\n' +
      '<size=70><b>THANKS FOR PLAYING</b></size>\n\n<color=#9fdcff>(really, this time)</color>';
    const t = label(this.creditsScroll, txt, 40, '#fff', 'uc');
    t.style.lineHeight = '1.3';
    const skip = rect('Skip', this.credits, [1, 0], [-40, 40], [500, 40], [1, 0]);
    label(skip, 'ESC / click to skip', 22, 'rgba(255,255,255,0.5)', 'lr');
    this.credits.addEventListener('click', () => this.endCredits());
  }

  rollCredits(onDone: () => void) {
    this.hideAll();
    show(this.credits, true);
    this.creditsDone = onDone;
    this.creditsRolling = true;
    setPos(this.creditsScroll, [0, 0]);
    Scheduler.start(this.credits, this.creditsRoutine());
  }

  private *creditsRoutine(): Co {
    let y = 0;
    while (this.creditsRolling && y < 2600 + 1080) {
      y += Time.unscaledDeltaTime * 95;
      setPos(this.creditsScroll, [0, y]);
      yield null;
    }
    if (this.creditsRolling) this.endCredits();
  }

  get creditsActive() { return shown(this.credits); }

  endCredits() {
    if (!this.creditsRolling) return;
    this.creditsRolling = false;
    show(this.credits, false);
    const cb = this.creditsDone; this.creditsDone = null;
    cb?.();
  }

  // =================================================================== END STATS

  private buildStats() {
    this.stats = this.screen('Stats');
    this.stats.style.background = css(0.03, 0.04, 0.08, 0.85);
    const p = panel('Panel', this.stats, [0.5, 0.5], [0, 0], [1000, 860]);
    text('Title', p, [0.5, 1], [0, -80], [940, 110], 'YOU DID IT.', 90, UIColors.Accent, 'mc', 'b');
    text('Sub', p, [0.5, 1], [0, -160], [940, 50], 'the mountain did not survive. the penguin... mostly did.', 28, UIColors.Ice, 'mc', 'i');
    this.statsBody = text('Body', p, [0.5, 0.5], [0, -20], [800, 460], '', 36, UIColors.Text, 'mc');
    this.statsBody.style.lineHeight = '1.4';
    const b = button(p, 'ROLL CREDITS', () => { show(this.stats, false); this.statsContinue?.(); }, 420, 76, css(0.95, 0.5, 0.15));
    place(b, [0.5, 0], [0, 80], [420, 76]); b.classList.remove('flow');
  }

  showStats(d: SaveData, newBest: boolean, onContinue: () => void) {
    this.hideAll();
    show(this.stats, true);
    this.statsContinue = onContinue;
    const time = UIManager.formatTime(d.time) + (newBest ? '  <color=#ffa040><size=26>NEW BEST!</size></color>' : '');
    this.statsBody.set(
      `Time  <b>${time}</b>\n` +
      `Falls  <b>${d.falls}</b>\n` +
      `Biggest fall  <b>${Math.round(d.biggestFall)} m</b>\n` +
      `Sent back to the bottom  <b>${d.bottomResets}x</b>\n` +
      `Random traps survived  <b>${d.trapsTriggered}</b>\n` +
      `Control flips endured  <b>${d.inversions}</b>\n` +
      'Fake summits believed  <b>2</b>');
  }

  // =================================================================== FAKE WIN

  private buildFakeWin() {
    this.fakeWin = stretch('FakeWin', this.root);
    const t = this.fakeWin;
    this.fwTitle = text('Title', t, [0.5, 0.5], [0, 220], [1700, 160], '', 120, UIColors.Accent, 'mc', 'b');
    this.fwSub = text('Sub', t, [0.5, 0.5], [0, 110], [1500, 80], '', 44, '#fff', 'mc', 'i');
    this.fwSubRt = this.fwSub.parentElement!;
    this.fwBar = image(rect('Bar', t, [0.5, 0.5], [0, -20], [900, 40]), css(0, 0, 0, 0.6));
    this.fwBarFill = image(rect('Fill', this.fwBar, [0, 0.5], [4, 0], [0, 32], [0, 0.5]), UIColors.Good);
    this.fwBarText = text('BarT', this.fwBar, [0.5, 0.5], [0, -50], [900, 40], '', 30, UIColors.Text);
    this.fwNope = text('Nope', t, [0.5, 0.5], [0, 0], [1600, 400], '', 280, css(1, 0.25, 0.25), 'mc', 'b');
    this.fwNope.classList.remove('outline');
    this.fwNope.style.textShadow = '6px 6px 0 #fff';
    this.fwNopeRt = this.fwNope.parentElement!;
  }

  fakeWinShow(on: boolean) {
    show(this.fakeWin, on);
    if (on) { this.fwTitle.set(''); this.fwSub.set(''); this.fwNope.set(''); show(this.fwBar, false); }
  }

  fakeWinText(title: string, sub: string) { this.fwTitle.set(title); this.fwSub.set(sub); }

  fakeWinBar(on: boolean, fill01: number, lbl: string) {
    show(this.fwBar, on);
    this.fwBarFill.style.width = `${892 * Math.min(1, Math.max(0, fill01))}px`;
    this.fwBarText.set(lbl);
  }

  *nope(word: string, sub: string): Co {
    this.fwTitle.set(''); show(this.fwBar, false);
    this.fwNope.set(word);
    this.fwSub.set('');
    let t = 0;
    while (t < 0.25) {
      t += Time.unscaledDeltaTime;
      const k = Math.min(1, t / 0.25);
      const s = lerp(3, 1, k);
      // Unity z-rotation is counter-clockwise; CSS rotate is clockwise
      this.fwNopeRt.style.transform = `scale(${s}) rotate(${-lerp(-25, -8, k)}deg)`;
      yield null;
    }
    refs.shake(0.6);
    yield { realtime: 0.4 };
    this.fwSub.set(sub);
    setPos(this.fwSubRt, [0, -220]);
    yield { realtime: 1.8 };
    let a = 1;
    while (a > 0) {
      a -= Time.unscaledDeltaTime * 2;
      this.fwNope.style.opacity = String(Math.max(0, a));
      this.fwSub.style.opacity = String(Math.max(0, a));
      yield null;
    }
    this.fwNope.set(''); this.fwSub.set('');
    this.fwNope.style.opacity = '1'; this.fwSub.style.opacity = '1';
    setPos(this.fwSubRt, [0, 110]);
  }

  // =================================================================== state

  enterGameplayUI() { this.hideAll(); show(this.hud, true); }

  update() {
    this.updateHUD();
    if (this.crashOn) this.crashDots.set('.'.repeat(1 + (Math.floor(Time.unscaledTime * 2) % 3)));
    if (this.saveOn) { this.saveT += Time.unscaledDeltaTime; this.saveFill.style.width = `${900 * Math.min(1, this.saveT / 1.8)}px`; }
    // title bobber
    if (this.titleRt && shown(this.menu)) {
      const ut = Time.unscaledTime;
      this.titleRt.style.transform = `translateY(${-Math.sin(ut * 1.6) * 6}px) rotate(${-Math.sin(ut * 1.1) * 1.5}deg)`;
    }
  }
}
